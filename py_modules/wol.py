import fcntl
import ipaddress
import logging
import re
import socket
import struct
import time

_MAC_RE = re.compile(r"^[0-9a-f]{12}$")
logger = logging.getLogger(__name__)


def normalize_mac(mac: str) -> str:
    cleaned = re.sub(r"[^0-9a-fA-F]", "", mac or "").lower()
    if not _MAC_RE.match(cleaned):
        raise ValueError(f"Invalid MAC address: {mac!r}")
    return ":".join(cleaned[i:i + 2] for i in range(0, 12, 2))


def build_magic_packet(mac: str) -> bytes:
    raw = bytes.fromhex(normalize_mac(mac).replace(":", ""))
    return b"\xff" * 6 + raw * 16


def directed_broadcast(address: str, subnet_mask: str) -> str:
    ip = ipaddress.IPv4Address(address)
    mask = ipaddress.IPv4Address(subnet_mask)
    network = ipaddress.IPv4Network(f"{ip}/{mask}", strict=False)
    if str(network.netmask) != str(mask) or not 0 < network.prefixlen < 31:
        raise ValueError("The host subnet mask must describe a broadcast-capable IPv4 subnet")
    if ip.is_unspecified or ip.is_loopback or ip.is_multicast or ip in (network.network_address, network.broadcast_address):
        raise ValueError("The host must report a usable LAN IPv4 address")
    return str(network.broadcast_address)


def wake_destination(host: dict) -> str:
    broadcast = host["broadcast"]
    if broadcast != "255.255.255.255" or not host.get("subnet_mask"):
        return broadcast
    return directed_broadcast(host["lan_address"], host["subnet_mask"])


def wake_interfaces() -> list[tuple[str, str | None]]:
    """Active non-loopback interfaces and their optional IPv4 broadcast addresses."""
    SIOCGIFFLAGS, SIOCGIFBRDADDR = 0x8913, 0x8919
    IFF_UP, IFF_BROADCAST, IFF_LOOPBACK = 0x1, 0x2, 0x8
    out = []
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        for _, name in socket.if_nameindex():
            req = struct.pack("256s", name.encode()[:15])
            try:
                flags = struct.unpack("H", fcntl.ioctl(sock.fileno(), SIOCGIFFLAGS, req)[16:18])[0]
            except OSError as e:
                logger.warning("Cannot inspect wake interface %s: %s", name, e)
                continue
            if not flags & IFF_UP or flags & IFF_LOOPBACK:
                continue
            broadcast = None
            if flags & IFF_BROADCAST:
                try:
                    addr = socket.inet_ntoa(fcntl.ioctl(sock.fileno(), SIOCGIFBRDADDR, req)[20:24])
                    if addr != "0.0.0.0":
                        broadcast = addr
                except OSError as e:
                    logger.warning("Cannot read broadcast address for %s: %s", name, e)
            out.append((name, broadcast))
    return out


def send_magic_packet(mac: str, broadcast: str = "255.255.255.255", port: int = 9) -> None:
    """Send to the configured destination and local broadcast through each interface."""
    packet = build_magic_packet(mac)
    ports = (port,) if port == 7 else (port, 7)
    sent, error = 0, None
    for name, local_broadcast in wake_interfaces():
        targets = [broadcast]
        if local_broadcast and local_broadcast != broadcast:
            targets.append(local_broadcast)
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
                # Binding prevents an overlapping Wi-Fi subnet from stealing VPN traffic.
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_BINDTODEVICE, name.encode() + b"\0")
                for target in targets:
                    for p in ports:
                        try:
                            sock.sendto(packet, (target, p))
                            sent += 1
                        except OSError as e:
                            error = e
                            logger.warning("Wake via %s to %s:%s failed: %s", name, target, p, e)
        except OSError as e:
            error = e
            logger.warning("Cannot send wake through %s: %s", name, e)
    if not sent:
        raise error or OSError("No active network interface could send a wake packet")


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
