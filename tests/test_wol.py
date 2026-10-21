import importlib.util
import socket
import struct
import unittest
from pathlib import Path
from unittest.mock import MagicMock, call, patch

spec = importlib.util.spec_from_file_location(
    "spout_wol", Path(__file__).resolve().parents[1] / "py_modules/wol.py",
)
wol = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wol)


class InterfaceTests(unittest.TestCase):
    def test_includes_tunnels_and_overlapping_lans_but_not_loopback_or_down_interfaces(self):
        interfaces = {
            "lo": (0x9, None),
            "wlan0": (0x3, "192.168.1.255"),
            "wg-home": (0x11, None),
            "eth0": (0x3, "192.168.1.255"),
            "down0": (0x2, None),
        }

        def ioctl(fd, operation, request):
            name = request.split(b"\0", 1)[0].decode()
            flags, broadcast = interfaces[name]
            if operation == 0x8913:
                return bytes(16) + struct.pack("H", flags)
            self.assertEqual(operation, 0x8919)
            self.assertIsNotNone(broadcast, "Must not request a broadcast address for a tunnel")
            return bytes(20) + socket.inet_aton(broadcast)

        with patch.object(wol.socket, "socket"), \
                patch.object(wol.socket, "if_nameindex", return_value=list(enumerate(interfaces))), \
                patch.object(wol.fcntl, "ioctl", side_effect=ioctl):
            self.assertEqual(wol.wake_interfaces(), [
                ("wlan0", "192.168.1.255"), ("wg-home", None), ("eth0", "192.168.1.255"),
            ])

    def test_disappearing_interface_is_logged_and_other_interfaces_remain(self):
        with patch.object(wol.socket, "socket"), \
                patch.object(wol.socket, "if_nameindex", return_value=[(1, "gone0"), (2, "wg0")]), \
                patch.object(wol.fcntl, "ioctl", side_effect=[
                    OSError("Interface disappeared"), bytes(16) + struct.pack("H", 0x1),
                ]), self.assertLogs("spout_wol", level="WARNING"):
            self.assertEqual(wol.wake_interfaces(), [("wg0", None)])

    def test_missing_broadcast_keeps_interface_for_configured_destination(self):
        with patch.object(wol.socket, "socket"), \
                patch.object(wol.socket, "if_nameindex", return_value=[(1, "eth0")]), \
                patch.object(wol.fcntl, "ioctl", side_effect=[
                    bytes(16) + struct.pack("H", 0x3), OSError("No broadcast address"),
                ]), self.assertLogs("spout_wol", level="WARNING"):
            self.assertEqual(wol.wake_interfaces(), [("eth0", None)])


class SendTests(unittest.TestCase):
    mac = "02:11:22:33:44:55"

    def setUp(self):
        self.sockets = []

        def make_socket(*args):
            sock = MagicMock()
            sock.__enter__.return_value = sock
            self.sockets.append(sock)
            return sock

        self.factory = patch.object(wol.socket, "socket", side_effect=make_socket)
        self.factory.start()
        self.addCleanup(self.factory.stop)

    def test_binds_each_interface_and_preserves_broadcasts_and_both_ports(self):
        interfaces = [("wlan0", "192.168.1.255"), ("wg-home", None), ("eth0", "192.168.1.255")]
        with patch.object(wol, "wake_interfaces", return_value=interfaces):
            wol.send_magic_packet(self.mac, "192.168.1.129")
        packet = b"\xff" * 6 + bytes.fromhex("021122334455") * 16
        self.assertEqual(len(self.sockets), 3)
        for sock, (name, broadcast) in zip(self.sockets, interfaces):
            self.assertEqual(sock.setsockopt.call_args_list, [
                call(socket.SOL_SOCKET, socket.SO_BROADCAST, 1),
                call(socket.SOL_SOCKET, socket.SO_BINDTODEVICE, name.encode() + b"\0"),
            ])
            targets = ["192.168.1.129"] + ([broadcast] if broadcast else [])
            self.assertEqual(sock.sendto.call_args_list, [
                call(packet, (target, port)) for target in targets for port in (9, 7)
            ])
            sock.__exit__.assert_called_once()

    def test_same_broadcast_is_sent_on_both_interfaces_without_duplicate_ports(self):
        with patch.object(wol, "wake_interfaces", return_value=[
            ("wlan0", "192.168.1.255"), ("eth0", "192.168.1.255"),
        ]):
            wol.send_magic_packet(self.mac, "192.168.1.255", port=7)
        self.assertEqual(len(self.sockets), 2)
        for sock in self.sockets:
            self.assertEqual(sock.sendto.call_args_list, [
                call(wol.build_magic_packet(self.mac), ("192.168.1.255", 7)),
            ])

    def test_binding_failure_is_logged_without_unbound_send_or_skipping_other_interfaces(self):
        failed = MagicMock()
        failed.__enter__.return_value = failed
        failed.setsockopt.side_effect = [None, PermissionError("Cannot bind interface")]
        working = MagicMock()
        working.__enter__.return_value = working
        with patch.object(wol, "wake_interfaces", return_value=[("wlan0", None), ("wg0", None)]), \
                patch.object(wol.socket, "socket", side_effect=[failed, working]), \
                self.assertLogs("spout_wol", level="WARNING"):
            wol.send_magic_packet(self.mac, "192.168.1.129")
        failed.sendto.assert_not_called()
        self.assertEqual(working.sendto.call_count, 2)
        failed.__exit__.assert_called_once()

    def test_send_failure_still_attempts_other_destinations_and_interfaces(self):
        failed = MagicMock()
        failed.__enter__.return_value = failed
        failed.sendto.side_effect = OSError("No route")
        working = MagicMock()
        working.__enter__.return_value = working
        with patch.object(wol, "wake_interfaces", return_value=[
            ("wlan0", "192.168.1.255"), ("wg0", None),
        ]), patch.object(wol.socket, "socket", side_effect=[failed, working]), \
                self.assertLogs("spout_wol", level="WARNING"):
            wol.send_magic_packet(self.mac, "192.168.1.129")
        self.assertEqual(failed.sendto.call_count, 4)
        self.assertEqual(working.sendto.call_count, 2)

    def test_all_sends_failing_raises_instead_of_reporting_success(self):
        failed = MagicMock()
        failed.__enter__.return_value = failed
        failed.sendto.side_effect = OSError("No route")
        with patch.object(wol, "wake_interfaces", return_value=[("wg0", None)]), \
                patch.object(wol.socket, "socket", return_value=failed), \
                self.assertLogs("spout_wol", level="WARNING"), \
                self.assertRaisesRegex(OSError, "No route"):
            wol.send_magic_packet(self.mac, "192.168.1.129")

    def test_no_eligible_interfaces_raises(self):
        with patch.object(wol, "wake_interfaces", return_value=[]), \
                self.assertRaisesRegex(OSError, "No active network interface"):
            wol.send_magic_packet(self.mac)

    def test_invalid_mac_sends_nothing(self):
        with self.assertRaises(ValueError):
            wol.send_magic_packet("invalid")
        self.assertEqual(self.sockets, [])
