"""Edit Steam's CStreamingClientConfig protobuf and drive SteamClient.RemotePlay over CEF debugging."""

import base64
import json

import aiohttp

CEF_URL = "http://127.0.0.1:8080"

# CStreamingClientConfig field numbers (SteamDatabase/Protobufs steammessages_remoteplay.proto).
FIELD_FPS_NUM = 4
FIELD_FPS_DEN = 5
FIELD_HW_DECODE = 7
FIELD_HEVC = 13
FIELD_AV1 = 26
FIELD_PYROWAVE = 35
BOOL_FIELDS = {
    "hardware_decoding": FIELD_HW_DECODE,
    "hevc": FIELD_HEVC,
    "av1": FIELD_AV1,
    "pyrowave": FIELD_PYROWAVE,
}
DEFAULTS = {"hardware_decoding": True, "hevc": False, "av1": False, "pyrowave": False}


def _read_varint(data: bytes, i: int):
    shift = result = 0
    while True:
        b = data[i]
        i += 1
        result |= (b & 0x7F) << shift
        if not b & 0x80:
            return result, i
        shift += 7


def _write_varint(v: int) -> bytes:
    out = bytearray()
    while True:
        b = v & 0x7F
        v >>= 7
        if v:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def parse_fields(data: bytes) -> list:
    """Split a protobuf message into (field_number, wire_type, raw_bytes) entries, preserving unknown fields."""
    fields, i = [], 0
    while i < len(data):
        start = i
        tag, i = _read_varint(data, i)
        num, wt = tag >> 3, tag & 7
        if wt == 0:
            _, i = _read_varint(data, i)
        elif wt == 1:
            i += 8
        elif wt == 2:
            n, i = _read_varint(data, i)
            i += n
        elif wt == 5:
            i += 4
        else:
            raise ValueError("unsupported wire type %d" % wt)
        if i > len(data):
            raise ValueError("truncated protobuf")
        fields.append((num, wt, data[start:i]))
    return fields


def _varints(data: bytes) -> dict:
    out = {}
    for num, wt, raw in parse_fields(data):
        if wt == 0:
            out[num] = _read_varint(raw, _read_varint(raw, 0)[1])[0]
    return out


def get_bools(data: bytes) -> dict:
    v = _varints(data)
    out = dict(DEFAULTS)
    for name, fnum in BOOL_FIELDS.items():
        if fnum in v:
            out[name] = bool(v[fnum])
    num, den = v.get(FIELD_FPS_NUM, 0), v.get(FIELD_FPS_DEN, 0)
    # Steam stores the frame rate limit as a fraction; 0/0 means Automatic.
    out["fps"] = round(num / den) if num and den else 0
    return out


def set_bools(data: bytes, values: dict) -> bytes:
    wanted = {BOOL_FIELDS[k]: 1 if v else 0 for k, v in values.items() if k in BOOL_FIELDS}
    if "fps" in values:
        fps = max(0, int(values["fps"]))
        wanted[FIELD_FPS_NUM] = fps
        wanted[FIELD_FPS_DEN] = 1 if fps else 0
    kept = [raw for num, _, raw in parse_fields(data) if num not in wanted]
    for fnum, v in wanted.items():
        kept.append(_write_varint(fnum << 3) + _write_varint(v))
    return b"".join(kept)


async def _eval(expr: str):
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
        async with s.get(CEF_URL + "/json") as r:
            tabs = await r.json(content_type=None)
        tab = next((t for t in tabs if t.get("title") == "SharedJSContext"), None)
        if not tab:
            raise RuntimeError("SharedJSContext not found")
        ws_url = tab["webSocketDebuggerUrl"].replace("localhost", "127.0.0.1")
        async with s.ws_connect(ws_url) as ws:
            await ws.send_json({"id": 1, "method": "Runtime.evaluate", "params": {
                "expression": expr, "returnByValue": True, "awaitPromise": True}})
            async for msg in ws:
                data = json.loads(msg.data)
                if data.get("id") == 1:
                    res = data["result"]
                    if "exceptionDetails" in res:
                        raise RuntimeError(res["exceptionDetails"].get("text", "script error"))
                    return res["result"].get("value")
    raise RuntimeError("no response from Steam")


_READ_JS = """(async()=>{let r;const h=SteamClient.RemotePlay.RegisterForSettingsChanges(s=>{r=s});
await new Promise(x=>setTimeout(x,700));try{h.unregister()}catch(e){}
return JSON.stringify({enabled:r.bRemotePlayClientConfigEnabled,session:r.unStreamingSessionID,
hevc_available:r.bHEVCDecodeAvailable,av1_available:r.bAV1DecodeAvailable,
pyrowave_available:r.bPyrowaveDecodeAvailable,
config:btoa(String.fromCharCode(...new Uint8Array(r.RemotePlayClientConfig)))})})()"""


async def read_state() -> dict:
    raw = json.loads(await _eval(_READ_JS))
    config = base64.b64decode(raw.pop("config"))
    raw["decoders"] = get_bools(config)
    raw["_config"] = config
    return raw


async def apply(values: dict, enabled: bool) -> dict:
    state = await read_state()
    new_cfg = base64.b64encode(set_bools(state["_config"], values)).decode()
    await _eval("(()=>{SteamClient.RemotePlay.SetStreamingClientConfig(%s,%d);"
                "SteamClient.RemotePlay.SetStreamingClientConfigEnabled(%s,%d);return 1})()"
                % (json.dumps(new_cfg), state["session"], "true" if enabled else "false", state["session"]))
    return await read_state()
