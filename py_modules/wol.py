import re
import socket
import time

_MAC_RE = re.compile(r"^[0-9a-f]{12}$")


def normalize_mac(mac: str) -> str:
    cleaned = re.sub(r"[^0-9a-fA-F]", "", mac or "").lower()
    if not _MAC_RE.match(cleaned):
        raise ValueError(f"Invalid MAC address: {mac!r}")
    return ":".join(cleaned[i:i + 2] for i in range(0, 12, 2))


def build_magic_packet(mac: str) -> bytes:
    raw = bytes.fromhex(normalize_mac(mac).replace(":", ""))
    return b"\xff" * 6 + raw * 16


def send_magic_packet(mac: str, broadcast: str = "255.255.255.255", port: int = 9) -> None:
    packet = build_magic_packet(mac)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        # Port 7 is also commonly listened on, so send there too.
        sock.sendto(packet, (broadcast, port))
        if port != 7:
            sock.sendto(packet, (broadcast, 7))


def is_port_open(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def wait_until_online(host: str, ports, timeout: float) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if any(is_port_open(host, p) for p in ports):
            return True
        time.sleep(2)
    return False
