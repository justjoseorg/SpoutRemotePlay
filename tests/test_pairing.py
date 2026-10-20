import importlib.util
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("spout_plugin", ROOT / "main.py")
backend = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {
    "decky": SimpleNamespace(DECKY_PLUGIN_SETTINGS_DIR="/unused"),
    "wol": SimpleNamespace(
        is_port_open=None, normalize_mac=None, probe_state=None, send_magic_packet=None,
    ),
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
