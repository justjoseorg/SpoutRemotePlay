import fcntl
import re
import socket
import struct
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


def local_broadcasts() -> list:
    """Broadcast addresses of this device's network interfaces, e.g. 192.168.1.255.

    255.255.255.255 follows the default route, so with a full-tunnel VPN such as
    WireGuard it goes into the tunnel and never reaches the LAN. A subnet's own
    broadcast address always leaves through that subnet's interface.
    """
    SIOCGIFFLAGS, SIOCGIFBRDADDR, IFF_BROADCAST, IFF_UP = 0x8913, 0x8919, 0x2, 0x1
    out = []
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        for _, name in socket.if_nameindex():
            req = struct.pack("256s", name.encode()[:15])
            try:
                flags = struct.unpack("H", fcntl.ioctl(sock.fileno(), SIOCGIFFLAGS, req)[16:18])[0]
                if flags & (IFF_BROADCAST | IFF_UP) != IFF_BROADCAST | IFF_UP:
                    continue
                addr = socket.inet_ntoa(fcntl.ioctl(sock.fileno(), SIOCGIFBRDADDR, req)[20:24])
            except OSError:
                continue
            if addr != "0.0.0.0" and addr not in out:
                out.append(addr)
    return out


def send_magic_packet(mac: str, broadcast: str = "255.255.255.255", port: int = 9) -> None:
    """Send to the configured broadcast address and to every local subnet's broadcast address."""
    packet = build_magic_packet(mac)
    try:
        extra = local_broadcasts()
    except OSError:
        extra = []
    targets = [broadcast] + [b for b in extra if b != broadcast]
    # Port 7 is also commonly listened on, so send there too.
    ports = (port,) if port == 7 else (port, 7)
    sent, error = 0, None
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        for target in targets:
            for p in ports:
                try:
                    sock.sendto(packet, (target, p))
                    sent += 1
                except OSError as e:
                    error = e
    if not sent and error:
        raise error


def is_port_open(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def probe_state(host: str, ready_ports, on_ports, timeout: float = 0.7) -> str:
    """"ready" when something that needs a signed-in user answers, "on" when only the OS does, else "off"."""
    if any(is_port_open(host, p, timeout) for p in ready_ports):
        return "ready"
    if any(is_port_open(host, p, timeout) for p in on_ports):
        return "on"
    return "off"


def wait_until_ready(host: str, ready_ports, on_ports, timeout: float) -> str:
    """Wait for "ready"; returns the last state seen when time runs out."""
    deadline = time.monotonic() + timeout
    state = "off"
    while time.monotonic() < deadline:
        state = probe_state(host, ready_ports, on_ports, 1.0)
        if state == "ready":
            break
        time.sleep(2)
    return state
