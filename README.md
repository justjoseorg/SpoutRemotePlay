# SpigotRemotePlay (Decky plugin)

Decky Loader plugin for Steam Remote Play / native game streaming from a Steam Deck or other SteamOS handheld.

## Status

- Wake-on-LAN: implemented (magic packet to saved PCs, optional online check on ports 27036/3389/445). Not yet tested on a device.
- Virtual-monitor handling: planned, lives in the host app: <https://github.com/justjoseorg/SpigotRemotePlayHost> (Windows and Linux, x86_64).

- Per-host stream settings (virtual monitor resolution/refresh, codec preference hint) are pushed to the host app's API (port 47995) using the API token you paste in when adding the PC. Tested only against a fake host API; the codec setting is a hint because Steam picks the real codec.

## Layout

- `main.py` – backend (host storage, WoL, status probe)
- `py_modules/wol.py` – magic packet and port probe helpers (stdlib only)
- `src/index.tsx` – Quick Access panel UI

## Build

```bash
pnpm i && pnpm build   # outputs dist/
```

Copy the folder to `~/homebrew/plugins/SpigotRemotePlay` on the device (with `dist/`, `main.py`, `py_modules/`, `plugin.json`, `package.json`).

## Releases

Merging a PR into `main` publishes a release automatically. `MAJOR.MINOR` is set by hand in the `VERSION` file; the patch number is auto-incremented per merge (e.g. `0.1.0`, `0.1.1`, ...). Edit `VERSION` in a PR to start a new minor/major. Add the `no-release` label to a PR to skip releasing.
