import asyncio
import json
import os
import urllib.error
import urllib.request
import uuid

import decky

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

    async def host_status(self, host_id: str) -> bool:
        host = next((h for h in self._load() if h["id"] == host_id), None)
        if not host or not host["address"]:
            return False

        def probe():
            return any(is_port_open(host["address"], p, 0.7) for p in PROBE_PORTS)

        return await asyncio.to_thread(probe)

    async def _main(self):
        decky.logger.info("SpigotRemotePlay loaded")

    async def _unload(self):
        decky.logger.info("SpigotRemotePlay unloaded")
