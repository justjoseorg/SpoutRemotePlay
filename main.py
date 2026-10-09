import asyncio
import concurrent.futures
import ipaddress
import json
import hashlib
import os
import secrets
import socket
import urllib.error
import urllib.request
import uuid

import decky

import steamcfg
from wol import is_port_open, normalize_mac, send_magic_packet, wait_until_online

# Steam Remote Play / In-Home Streaming listens on 27036 (TCP); RDP and SMB as fallbacks.
PROBE_PORTS = (27036, 3389, 445)
HOST_API_PORT = 47995
SETTINGS_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "hosts.json")


class Plugin:
    def _load(self) -> list:
        try:
            with open(SETTINGS_FILE) as f:
                return json.load(f).get("hosts", [])
        except (OSError, ValueError):
            return []

    def _save(self, hosts: list) -> None:
        os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
        tmp = SETTINGS_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump({"hosts": hosts}, f, indent=2)
        os.replace(tmp, SETTINGS_FILE)

    async def get_hosts(self) -> list:
        return self._load()

    async def add_host(self, name: str, mac: str, address: str, broadcast: str, token: str = "") -> dict:
        try:
            host = {
                "id": uuid.uuid4().hex,
                "name": (name or "").strip() or "PC",
                "mac": normalize_mac(mac),
                "address": (address or "").strip(),
                "broadcast": (broadcast or "").strip() or "255.255.255.255",
                "token": (token or "").strip(),
            }
        except ValueError as e:
            return {"ok": False, "error": str(e)}
        hosts = self._load()
        hosts.append(host)
        self._save(hosts)
        return {"ok": True, "host": host}

    async def remove_host(self, host_id: str) -> bool:
        hosts = [h for h in self._load() if h["id"] != host_id]
        self._save(hosts)
        return True

    async def wake_host(self, host_id: str) -> dict:
        host = next((h for h in self._load() if h["id"] == host_id), None)
        if not host:
            return {"ok": False, "error": "Unknown host"}
        if not host["mac"]:
            return {"ok": False, "error": "This PC's MAC address is unknown; add it manually"}
        try:
            await asyncio.to_thread(send_magic_packet, host["mac"], host["broadcast"])
        except OSError as e:
            decky.logger.error(f"WoL send failed: {e}")
            return {"ok": False, "error": str(e)}
        decky.logger.info(f"Sent magic packet to {host['name']} ({host['mac']})")
        if not host["address"]:
            return {"ok": True, "online": None}
        online = await asyncio.to_thread(wait_until_online, host["address"], PROBE_PORTS, 90)
        return {"ok": True, "online": online}

    def _host_request(self, host: dict, method: str, body: dict | None = None) -> dict:
        if not host.get("address"):
            raise ValueError("Set the PC's IP address first")
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            f"http://{host['address']}:{HOST_API_PORT}/api/config", data=data, method=method)
        if host.get("token"):
            req.add_header("Authorization", f"Bearer {host['token']}")
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            try:
                msg = json.load(e).get("error", e.reason)
            except ValueError:
                msg = e.reason
            raise ValueError(f"Host replied {e.code}: {msg}")
        except (urllib.error.URLError, OSError) as e:
            raise ValueError(f"Cannot reach host app: {e}")

    async def get_host_settings(self, host_id: str) -> dict:
        host = next((h for h in self._load() if h["id"] == host_id), None)
        if not host:
            return {"ok": False, "error": "Unknown host"}
        try:
            return {"ok": True, "settings": await asyncio.to_thread(self._host_request, host, "GET")}
        except ValueError as e:
            return {"ok": False, "error": str(e)}

    async def set_host_settings(self, host_id: str, settings: dict) -> dict:
        host = next((h for h in self._load() if h["id"] == host_id), None)
        if not host:
            return {"ok": False, "error": "Unknown host"}
        try:
            saved = await asyncio.to_thread(self._host_request, host, "PUT", settings)
            return {"ok": True, "settings": saved}
        except ValueError as e:
            return {"ok": False, "error": str(e)}

    async def get_decoders(self) -> dict:
        try:
            st = await steamcfg.read_state()
        except Exception as e:
            return {"ok": False, "error": str(e)}
        st.pop("_config")
        return {"ok": True, **st}

    async def set_decoders(self, values: dict, enabled: bool) -> dict:
        try:
            st = await steamcfg.apply(values, enabled)
        except Exception as e:
            return {"ok": False, "error": str(e)}
        st.pop("_config")
        return {"ok": True, **st}

    def _post_json(self, address: str, path: str, body: dict) -> dict:
        req = urllib.request.Request(
            f"http://{address}:{HOST_API_PORT}{path}", data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            try:
                msg = json.load(e).get("error", e.reason)
            except ValueError:
                msg = e.reason
            raise ValueError(str(msg))
        except (urllib.error.URLError, OSError) as e:
            raise ValueError(f"Cannot reach Spout Host at {address}: {e}")

    def _local_ipv4(self) -> str:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.0.2.1", 9))  # no packet is sent; just selects the outgoing interface
            return s.getsockname()[0]

    def _probe(self, ip: str):
        if not is_port_open(ip, HOST_API_PORT, 0.4):
            return None
        try:
            with urllib.request.urlopen(f"http://{ip}:{HOST_API_PORT}/api/discover", timeout=2) as r:
                info = json.load(r)
        except (urllib.error.URLError, OSError, ValueError):
            return None
        if info.get("app") != "spout-host":
            return None
        return {"address": ip, "name": str(info.get("name") or ip)[:60]}

    async def scan_hosts(self) -> dict:
        """Find Spout Host instances on the local /24."""
        try:
            me = self._local_ipv4()
        except OSError as e:
            return {"ok": False, "error": f"No network: {e}"}
        paired = {h["address"] for h in self._load()}
        ips = [str(ip) for ip in ipaddress.ip_network(f"{me}/24", strict=False).hosts() if str(ip) != me]

        def run():
            with concurrent.futures.ThreadPoolExecutor(max_workers=64) as ex:
                return [r for r in ex.map(self._probe, ips) if r]

        found = await asyncio.to_thread(run)
        for f in found:
            f["paired"] = f["address"] in paired
        return {"ok": True, "hosts": sorted(found, key=lambda f: f["address"])}

    async def start_pairing(self, address: str) -> dict:
        """Ask the PC to pair. The PIN is shown here and typed into the host UI on the PC."""
        address = (address or "").strip()
        if not address:
            return {"ok": False, "error": "Enter the PC's IP address"}
        pin = f"{secrets.randbelow(10000):04d}"
        salt, secret = secrets.token_hex(8), secrets.token_hex(16)
        body = {
            "name": socket.gethostname(),
            "salt": salt,
            "pinHash": hashlib.sha256((salt + pin).encode()).hexdigest(),
            "secretHash": hashlib.sha256(secret.encode()).hexdigest(),
        }
        try:
            res = await asyncio.to_thread(self._post_json, address, "/api/pair/request", body)
        except ValueError as e:
            return {"ok": False, "error": str(e)}
        self._pairing = {"id": res["id"], "secret": secret, "address": address}
        return {"ok": True, "pin": pin}

    async def poll_pairing(self) -> dict:
        """Returns status pending/approved/gone; on approval the PC is saved (with its MAC for Wake-on-LAN)."""
        p = getattr(self, "_pairing", None)
        if not p:
            return {"ok": True, "status": "gone"}
        try:
            res = await asyncio.to_thread(
                self._post_json, p["address"], "/api/pair/poll", {"id": p["id"], "secret": p["secret"]})
        except ValueError as e:
            return {"ok": False, "error": str(e)}
        if res.get("status") != "approved":
            if res.get("status") == "gone":
                self._pairing = None
            return {"ok": True, "status": res.get("status", "gone")}
        self._pairing = None
        try:
            mac = normalize_mac(res.get("mac", ""))
        except ValueError:
            mac = ""
        hosts = self._load()
        host = next((h for h in hosts if (mac and h["mac"] == mac) or (not mac and h["address"] == p["address"])), None)
        if host is None:
            host = {"id": uuid.uuid4().hex, "broadcast": "255.255.255.255"}
            hosts.append(host)
        host.update({
            "name": res.get("hostname") or p["address"], "mac": mac,
            "address": p["address"], "token": res["token"],
        })
        self._save(hosts)
        return {"ok": True, "status": "approved", "host": host}

    async def cancel_pairing(self) -> bool:
        self._pairing = None
        return True

    async def host_status(self, host_id: str) -> bool:
        host = next((h for h in self._load() if h["id"] == host_id), None)
        if not host or not host["address"]:
            return False

        def probe():
            return any(is_port_open(host["address"], p, 0.7) for p in PROBE_PORTS)

        return await asyncio.to_thread(probe)

    async def _main(self):
        decky.logger.info("SpoutRemotePlay loaded")

    async def _unload(self):
        decky.logger.info("SpoutRemotePlay unloaded")
