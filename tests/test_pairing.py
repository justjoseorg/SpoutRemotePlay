import importlib.util
import logging
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("spout_plugin", ROOT / "main.py")
backend = importlib.util.module_from_spec(spec)
wol_spec = importlib.util.spec_from_file_location("wol", ROOT / "py_modules/wol.py")
wol = importlib.util.module_from_spec(wol_spec)
wol_spec.loader.exec_module(wol)
with patch.dict(sys.modules, {
    "decky": SimpleNamespace(
        DECKY_PLUGIN_SETTINGS_DIR="/unused", logger=logging.getLogger("spout-test"),
    ),
    "wol": wol,
}):
    spec.loader.exec_module(backend)


class PairingTests(unittest.IsolatedAsyncioTestCase):
    async def test_frontend_capabilities_and_device_display_reach_host(self):
        plugin = backend.Plugin()
        plugin._display_size = lambda: (1920, 1080)
        requests = []

        def post(address, path, body):
            requests.append((address, path, body))
            return {"id": "pair-request"}

        plugin._post_json = post
        result = await plugin.start_pairing("192.0.2.5", {"hevc": True, "av1": False})
        self.assertTrue(result["ok"])
        self.assertEqual(len(result["pin"]), 4)
        address, path, body = requests[0]
        self.assertEqual(address, "192.0.2.5")
        self.assertEqual(path, "/api/pair/request")
        self.assertEqual(body["caps"], {
            "hevc": True, "av1": False, "width": 1920, "height": 1080,
        })
        self.assertNotIn("pin", body)

    async def test_older_frontend_can_pair_without_capabilities(self):
        plugin = backend.Plugin()
        plugin._display_size = lambda: None
        bodies = []
        plugin._post_json = lambda address, path, body: bodies.append(body) or {"id": "request"}
        self.assertTrue((await plugin.start_pairing("192.0.2.5"))["ok"])
        self.assertEqual(bodies[0]["caps"], {"hevc": False, "av1": False})

    async def test_empty_address_does_not_contact_host(self):
        result = await backend.Plugin().start_pairing(" ")
        self.assertFalse(result["ok"])
        self.assertIn("IP address", result["error"])

    async def test_display_size_rpc_keeps_device_mode_detection(self):
        plugin = backend.Plugin()
        plugin._display_size = lambda: (1920, 1080)
        self.assertEqual(await plugin.get_display_size(), (1920, 1080))

    async def approve(self, metadata, hosts=None):
        plugin = backend.Plugin()
        plugin._pairing = {"id": "request", "secret": "test-secret", "address": "gaming.local"}
        plugin._load = lambda: hosts if hosts is not None else []
        saved = []
        plugin._save = lambda hosts: saved.extend(hosts)
        plugin._post_json = lambda *args: {
            "status": "approved", "token": "test-token",
            "hostname": "Gaming PC", "mac": "00:11:22:33:44:55", **metadata,
        }
        result = await plugin.poll_pairing()
        self.assertTrue(result["ok"])
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0], result["host"])
        return saved[0]

    async def test_pairing_saves_actual_subnet_and_lan_address(self):
        host = await self.approve({"address": "192.168.2.129", "subnetMask": "255.255.254.0"})
        self.assertEqual(host["address"], "gaming.local")
        self.assertEqual(host["lan_address"], "192.168.2.129")
        self.assertEqual(host["subnet_mask"], "255.255.254.0")
        self.assertEqual(wol.wake_destination(host), "192.168.3.255")

    async def test_old_host_without_subnet_keeps_limited_broadcast(self):
        host = await self.approve({})
        self.assertNotIn("subnet_mask", host)
        self.assertEqual(wol.wake_destination(host), "255.255.255.255")

    async def test_repair_without_metadata_clears_stale_subnet(self):
        original = {
            "id": "existing", "mac": "00:11:22:33:44:55", "address": "gaming.local",
            "broadcast": "255.255.255.255", "lan_address": "192.168.1.129",
            "subnet_mask": "255.255.255.0",
        }
        host = await self.approve({}, [original])
        self.assertNotIn("lan_address", host)
        self.assertNotIn("subnet_mask", host)
        self.assertEqual(wol.wake_destination(host), "255.255.255.255")

    async def test_repair_refreshes_subnet_without_overriding_manual_destination(self):
        original = {
            "id": "existing", "mac": "00:11:22:33:44:55", "address": "gaming.local",
            "broadcast": "10.0.0.255", "lan_address": "192.168.1.129",
            "subnet_mask": "255.255.255.0",
        }
        host = await self.approve(
            {"address": "192.168.2.129", "subnetMask": "255.255.254.0"}, [original],
        )
        self.assertEqual(host["subnet_mask"], "255.255.254.0")
        self.assertEqual(host["id"], "existing")
        self.assertEqual(wol.wake_destination(host), "10.0.0.255")
        host["broadcast"] = "255.255.255.255"
        self.assertEqual(wol.wake_destination(host), "192.168.3.255")

    async def test_invalid_subnet_is_logged_without_breaking_pairing(self):
        for metadata in [
            {"address": "192.168.1.129", "subnetMask": "255.0.255.0"},
            {"address": "192.168.10.13", "subnetMask": "255.255.255.255"},
            {"subnetMask": "255.255.255.0"},
        ]:
            with self.subTest(metadata=metadata), self.assertLogs("spout-test", level="WARNING"):
                host = await self.approve(metadata)
            self.assertNotIn("subnet_mask", host)
            self.assertEqual(wol.wake_destination(host), "255.255.255.255")

    async def test_wake_uses_saved_subnet(self):
        plugin = backend.Plugin()
        host = {
            "id": "pc", "name": "PC", "mac": "00:11:22:33:44:55",
            "address": "gaming.local", "broadcast": "255.255.255.255",
            "lan_address": "10.20.30.40", "subnet_mask": "255.255.0.0",
        }
        plugin._load = lambda: [host]
        plugin._relay_wake = lambda target: []
        plugin._wait_for_host = lambda *args: "off"
        with patch.object(backend, "send_magic_packet") as send:
            result = await plugin.wake_host("pc")
        self.assertTrue(result["ok"])
        send.assert_called_once_with(host["mac"], "10.20.255.255")


class BroadcastTests(unittest.TestCase):
    def test_real_masks_instead_of_assuming_24(self):
        for address, mask, expected in [
            ("192.168.1.129", "255.255.255.0", "192.168.1.255"),
            ("192.168.2.129", "255.255.254.0", "192.168.3.255"),
            ("10.20.30.40", "255.255.0.0", "10.20.255.255"),
            ("192.168.1.10", "255.255.255.128", "192.168.1.127"),
            ("192.168.1.129", "255.255.255.252", "192.168.1.131"),
        ]:
            with self.subTest(address=address, mask=mask):
                self.assertEqual(wol.directed_broadcast(address, mask), expected)

    def test_rejects_invalid_or_nonbroadcast_subnets(self):
        for address, mask in [
            ("192.168.1.129", "255.0.255.0"),
            ("192.168.1.129", "0.0.0.255"),
            ("192.168.1.129", "255.255.255.254"),
            ("192.168.1.129", "255.255.255.255"),
            ("192.168.1.129", "0.0.0.0"),
            ("::1", "255.255.255.0"),
            ("127.0.0.1", "255.255.255.0"),
            ("192.168.1.0", "255.255.255.0"),
            ("192.168.1.255", "255.255.255.0"),
        ]:
            with self.subTest(address=address, mask=mask), self.assertRaises(ValueError):
                wol.directed_broadcast(address, mask)
