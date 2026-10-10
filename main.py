import asyncio
import concurrent.futures
import glob
import ipaddress
import json
import hashlib
import os
import secrets
import socket
import time
import urllib.error
import urllib.request
import uuid

import decky

import steamcfg
from wol import is_port_open, normalize_mac, probe_state, send_magic_packet

HOST_API_PORT = 47995
# Steam (27036) and Spout Host only listen once someone is signed in; RDP and SMB answer at the sign-in screen too.
SIGNIN_PORT = 47994  # optional Spout Sign-In service on Windows; answers at the sign-in screen
READY_PORTS = (27036, HOST_API_PORT)
ON_PORTS = (SIGNIN_PORT, 3389, 445, 22)
SETTINGS_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "hosts.json")
STREAMING_LOG = "/tmp/streaming_client.log"
STREAM_TARGET_TRIES = 10


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
        error = None
        try:
            await asyncio.to_thread(send_magic_packet, host["mac"], host["broadcast"])
            decky.logger.info(f"Sent magic packet to {host['name']} ({host['mac']})")
        except OSError as e:
            decky.logger.error(f"WoL send failed: {e}")
            error = str(e)
        relays = await asyncio.to_thread(self._relay_wake, host)
        if relays:
            decky.logger.info(f"Wake for {host['name']} relayed by {', '.join(relays)}")
        elif error:
            return {"ok": False, "error": error}
        if not host["address"]:
            return {"ok": True, "state": None}
        state = await asyncio.to_thread(self._wait_for_host, host, 90, True)
        return {"ok": True, "state": state}

    def _relay_wake(self, target: dict) -> list:
        """Ask every other paired PC that answers to send the magic packet on its own network.

        Broadcasts don't cross a VPN such as WireGuard, so away from home only a
        PC that's already on at home can wake another one. Hosts older than 0.6
        answer 404 and are skipped.
        """
        others = [h for h in self._load()
                  if h["id"] != target["id"] and h.get("address") and h.get("token")]
        body = json.dumps({"mac": target["mac"]}).encode()

        def ask(h):
            req = urllib.request.Request(
                f"http://{h['address']}:{HOST_API_PORT}/api/wake", data=body, method="POST",
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + h["token"]})
            try:
                with urllib.request.urlopen(req, timeout=2):
                    return h["name"]
            except (urllib.error.URLError, OSError, ValueError):
                return None

        if not others:
            return []
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(8, len(others))) as pool:
            return [n for n in pool.map(ask, others) if n]

    def _host_request(self, host: dict, method: str, body: dict | None = None, path: str = "/api/config") -> dict:
        if not host.get("address"):
            raise ValueError("Set the PC's IP address first")
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            f"http://{host['address']}:{HOST_API_PORT}{path}", data=data, method=method)
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
            settings = await asyncio.to_thread(self._host_request, host, "GET")
        except ValueError as e:
            return {"ok": False, "error": str(e)}
        try:
            info = await asyncio.to_thread(self._host_request, host, "GET", None, "/api/discover")
            host_os = info.get("os", "")
        except ValueError:
            host_os = ""  # older hosts do not report it
        return {"ok": True, "settings": settings, "os": host_os}

    async def list_host_apps(self, host_id: str) -> dict:
        host = next((h for h in self._load() if h["id"] == host_id), None)
        if not host:
            return {"ok": False, "error": "Unknown host"}
        try:
            res = await asyncio.to_thread(self._host_request, host, "GET", None, "/api/apps")
            return {"ok": True, "apps": res.get("apps", []), "steam": res.get("steam", {})}
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

    async def _capabilities(self) -> dict:
        caps: dict = {"hevc": False, "av1": False}
        try:
            st = await steamcfg.read_state()
            caps["hevc"] = bool(st.get("hevc_available"))
            caps["av1"] = bool(st.get("av1_available"))
        except Exception as e:
            decky.logger.info(f"capabilities: Steam not reachable ({e})")
        try:
            for modes in sorted(glob.glob("/sys/class/drm/card*-*/modes")):
                status = modes.replace("modes", "status")
                if os.path.exists(status) and open(status).read().strip() != "connected":
                    continue
                first = open(modes).readline().strip().split("x")
                if len(first) == 2:
                    caps["width"], caps["height"] = int(first[0]), int(first[1])
                    break
        except (OSError, ValueError):
            pass
        return caps

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
            "caps": await self._capabilities(),
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

    def _at_sign_in(self, host: dict):
        """Ask Spout Sign-In whether the PC is locked or nobody is signed in; None if it can't tell."""
        if not host.get("token"):
            return None
        req = urllib.request.Request(f"http://{host['address']}:{SIGNIN_PORT}/api/signin",
                                     headers={"Authorization": f"Bearer {host['token']}"})
        try:
            with urllib.request.urlopen(req, timeout=2) as r:
                v = json.load(r).get("signInScreen")
                return v if isinstance(v, bool) else None
        except (urllib.error.URLError, OSError, ValueError):
            return None

    def _host_state(self, host: dict) -> str:
        """"ready" to stream, "on" (at the sign-in screen or locked) or "off"."""
        state = probe_state(host["address"], READY_PORTS, ON_PORTS)
        if state != "off" and self._at_sign_in(host):
            return "on"
        return state

    def _wait_for_host(self, host: dict, timeout: float, stop_at_sign_in: bool) -> str:
        """Wait until the PC is ready, or (after Wake) until Spout Sign-In says it waits for a PIN."""
        deadline = time.monotonic() + timeout
        state = "off"
        while time.monotonic() < deadline:
            state = probe_state(host["address"], READY_PORTS, ON_PORTS, 1.0)
            if state != "off":
                at_sign_in = self._at_sign_in(host)
                if at_sign_in:
                    state = "on"
                    if stop_at_sign_in:
                        break
                elif state == "ready":
                    break
            time.sleep(2)
        return state

    async def sign_in(self, host_id: str, pin: str) -> dict:
        """Send the PIN to the PC's Spout Sign-In service once. It is never stored or logged."""
        host = next((h for h in self._load() if h["id"] == host_id), None)
        if not host or not host.get("address"):
            return {"ok": False, "error": "Unknown host"}
        if not host.get("token"):
            return {"ok": False, "error": "Pair this PC first"}
        if not (isinstance(pin, str) and pin.isascii() and pin.isdigit() and 4 <= len(pin) <= 32):
            return {"ok": False, "error": "The PIN must be 4 to 32 digits"}
        req = urllib.request.Request(
            f"http://{host['address']}:{SIGNIN_PORT}/api/signin", data=json.dumps({"pin": pin}).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {host['token']}"},
            method="POST")
        pin = ""

        def send():
            try:
                with urllib.request.urlopen(req, timeout=40):
                    return None
            except urllib.error.HTTPError as e:
                try:
                    return str(json.load(e).get("error", e.reason))
                except ValueError:
                    return str(e.reason)
            except (urllib.error.URLError, OSError):
                return "Spout Sign-In isn't reachable on this PC. Install it with the host's Setup."

        err = await asyncio.to_thread(send)
        req.data = None
        if err:
            decky.logger.info(f"sign-in on {host['name']} failed: {err}")
            return {"ok": False, "error": err}
        decky.logger.info(f"sign-in PIN sent to {host['name']}")
        state = await asyncio.to_thread(self._wait_for_host, host, 60, False)
        return {"ok": True, "state": state}

    async def shutdown_host(self, host_id: str) -> dict:
        """Ask the PC's host to shut it down (host 0.7 or later)."""
        host = next((h for h in self._load() if h["id"] == host_id), None)
        if not host or not host.get("address"):
            return {"ok": False, "error": "Unknown host"}
        if not host.get("token"):
            return {"ok": False, "error": "Pair this PC first"}
        try:
            await asyncio.to_thread(self._host_request, host, "POST", {"action": "shutdown"}, "/api/power")
        except ValueError as e:
            msg = str(e)
            if "replied 404" in msg or "replied 405" in msg:
                msg = "Update Spout Remote Play Host on this PC to 0.7 or later"
            decky.logger.info(f"shutdown of {host['name']} failed: {msg}")
            return {"ok": False, "error": msg}
        decky.logger.info(f"Shutdown sent to {host['name']}")
        return {"ok": True}

    async def host_status(self, host_id: str) -> str:
        host = next((h for h in self._load() if h["id"] == host_id), None)
        if not host or not host["address"]:
            return "off"
        return await asyncio.to_thread(self._host_state, host)

    def _send_session(self, host: dict, state: str) -> bool:
        req = urllib.request.Request(
            f"http://{host['address']}:{HOST_API_PORT}/api/session",
            data=json.dumps({"state": state}).encode(), method="POST")
        req.add_header("Authorization", f"Bearer {host['token']}")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=5):
                return True
        except (urllib.error.URLError, OSError) as e:
            decky.logger.warning(f"session {state} to {host['name']} failed: {e}")
            return False

    def _stream_target(self, since: float) -> str | None:
        """IP of the PC this device is streaming from, read from the running streaming_client
        (its --server argument) or, failing that, from the client's log if written after since."""
        for cmdline in glob.glob("/proc/[0-9]*/cmdline"):
            try:
                args = open(cmdline, "rb").read().split(b"\0")
            except OSError:
                continue
            if not any(a.endswith(b"streaming_client") for a in args[:3]):
                continue
            for i, a in enumerate(args[:-1]):
                if a == b"--server":
                    return args[i + 1].decode(errors="replace").rsplit(":", 1)[0]
        try:
            if os.path.getmtime(STREAMING_LOG) < since:
                return None
            with open(STREAMING_LOG, errors="replace") as f:
                lines = f.readlines()
        except OSError:
            return None
        for line in reversed(lines):
            if "Connecting to server at " in line:
                return line.split("Connecting to server at ", 1)[1].split()[0].rsplit(":", 1)[0]
        return None

    def _host_for_ip(self, ip: str) -> dict | None:
        for h in self._load():
            if not (h.get("token") and h.get("address")):
                continue
            if h["address"] == ip:
                return h
            try:
                if socket.gethostbyname(h["address"]) == ip:
                    return h
            except OSError:
                pass
        return None

    async def session_event(self, state: str) -> dict:
        """Tell only the PC being streamed from. Each host also detects its own sessions from
        Steam's log, so when the target is unknown nobody is told rather than everyone."""
        if state not in ("start", "stop"):
            return {"ok": False}
        if state == "start":
            host, since = None, time.time() - 2
            # The client may still be starting; give it a few seconds to show up.
            for _ in range(STREAM_TARGET_TRIES):
                ip = await asyncio.to_thread(self._stream_target, since)
                host = ip and await asyncio.to_thread(self._host_for_ip, ip)
                if host:
                    break
                await asyncio.sleep(1)
            if not host:
                decky.logger.info("remote play start: streamed PC is not a paired host; nobody notified")
                return {"ok": True, "notified": 0}
            self._streaming_host = host["id"]
        else:
            host_id = getattr(self, "_streaming_host", None)
            self._streaming_host = None
            host = next((h for h in self._load() if h["id"] == host_id), None) if host_id else None
            if not host:
                return {"ok": True, "notified": 0}
        ok = await asyncio.to_thread(self._send_session, host, state)
        decky.logger.info(f"remote play {state}: notified {host['name']}: {ok}")
        return {"ok": True, "notified": int(ok)}

    async def _main(self):
        decky.logger.info("SpoutRemotePlay loaded")

    async def _unload(self):
        decky.logger.info("SpoutRemotePlay unloaded")
