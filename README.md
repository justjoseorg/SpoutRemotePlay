# SpigotRemotePlay (Decky plugin)

Decky Loader plugin for Steam Remote Play / native game streaming from a Steam Deck or other SteamOS handheld.

## Status

- Wake-on-LAN: implemented (magic packet to saved PCs, optional online check on ports 27036/3389/445). Not yet tested on a device.
- Virtual-monitor handling: planned, lives in the companion app: <https://github.com/justjoseorg/SpigotRemotePlay-Companion> (Windows and Linux, x86_64).

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
