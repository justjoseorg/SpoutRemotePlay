# SpoutRemotePlay (Decky plugin)

Decky Loader plugin for Steam Remote Play / native game streaming from a Steam Deck or other SteamOS handheld.

## Status

- Wake-on-LAN: implemented (magic packet to saved PCs, optional online check on ports 27036/3389/445). Not yet tested on a device.
- Virtual-monitor handling: planned, lives in the host app: <https://github.com/justjoseorg/SpoutRemotePlayHost> (Windows and Linux, x86_64).

- Per-host stream settings (virtual monitor resolution/refresh, codec preference hint) are pushed to the host app's API (port 47995) using the per-device token you get by pairing.
- **Pairing:** enter the PC's IP under "Pair a PC"; the plugin shows a 4-digit PIN, the PC shows a notification, and typing the PIN into Spout Host pairs the device and adds the PC (name, IP, MAC) to your Wake-on-LAN list automatically. Pair as many PCs as you like. Verified end to end against the real host on Linux (with a stand-in for Decky); not yet run on the Portal. If you pair over a VPN the PC's MAC can't be detected, so add it manually. Tested only against a fake host API; the codec setting is a hint because Steam picks the real codec.

Architecture: no native code, so it runs on both ARM and x86 SteamOS devices.

## Layout

- `main.py` – backend (host storage, WoL, status probe)
- `py_modules/wol.py` – magic packet and port probe helpers (stdlib only)
- `src/index.tsx` – Quick Access panel UI

## Build

```bash
pnpm i && pnpm build   # outputs dist/
```

Copy the folder to `~/homebrew/plugins/SpoutRemotePlay` on the device (with `dist/`, `main.py`, `py_modules/`, `plugin.json`, `package.json`).

## Releases

Merging a PR into `main` publishes a release automatically. `MAJOR.MINOR` is set by hand in the `VERSION` file; the patch number is auto-incremented per merge (e.g. `0.1.0`, `0.1.1`, ...). Edit `VERSION` in a PR to start a new minor/major. Add the `no-release` label to a PR to skip releasing.

See Releases for installable builds.
