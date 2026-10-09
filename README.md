# SpoutRemotePlay (Decky plugin)

**The idea: pick up your handheld, press play on a game from your PC, and go.** No fiddling with resolutions, no dragging windows between monitors, no remembering to wake the PC first.

Steam's native Remote Play already streams well. What it lacks is the plumbing around it. Tools like ArtMoon/ArtLight (built on Moonlight) solve that: they wake the PC, create a virtual monitor sized to your handheld, and clean it up afterwards. SpoutRemotePlay brings the same experience to **native Steam Remote Play** (the Spout in the name is a play on Valve):

1. **Wake the PC.** Open the plugin, tap your PC, and it sends Wake-on-LAN and waits until it's up.
2. **Pair once.** Enter the PC's IP, type the 4-digit PIN shown on the PC, and you're done. The plugin also learns the PC's MAC address and tells the host what your device can decode (HEVC/AV1) and its screen size.
3. **Press play.** When Steam Remote Play starts, the plugin tells the host. The host creates a virtual monitor with your device's resolution, refresh rate and codec, so your physical displays are left alone. When you quit, it goes away.

The plugin is one half of a pair. The other half is the host app on your PC: <https://github.com/justjoseorg/SpoutRemotePlayHost> (Windows and Linux, x86_64).

## What works today

- **Wake-on-LAN** with an online check. Not yet run on the Portal.
- **Pairing** with a PIN, and **per-device stream settings** (resolution, refresh, codec hint) pushed to the host. Verified end to end against the real host on Linux.
- **Session signal:** the plugin reports Remote Play start/stop to your paired PCs. Verified on an AYN Odin 2 Portal streaming Celeste to a Linux PC: the host received both the start and the stop.
- **Network scan** to find the PC, **Steam client decoder toggles** (HEVC/AV1), tabbed UI with L1/R1 switching and a Spout icon. These ran on the device earlier, but the latest UI changes have not been visually confirmed.

Not done yet: confirming the virtual monitor appears automatically on a real stream (the host driver is still being tested), and anything on Windows. If you have several paired PCs, the start/stop signal goes to all of them for now.

Codec is a hint: Steam picks the real codec during negotiation.

Architecture: no native code, so it runs on both ARM and x86 SteamOS devices.

## Credits

This project is based on the ideas and work of others, and I'm grateful to them:

- [Moonlight](https://moonlight-stream.org/) – the open-source game streaming client that started it all.
- [StreamLight](https://github.com/FoggyBytes/StreamLight) – a Moonlight fork with deeper host integration.
- [ArtMoon](https://github.com/onaiaku/ArtMoon) and [ArtLight](https://github.com/onaiaku/ArtLight) – the gamepad-first client and its one-installer host, whose wake/pair/virtual-monitor flow this is modeled on.

SpoutRemotePlay is an independent project and is not affiliated with any of them or with Valve.

## Layout

- `main.py` – backend (host storage, WoL, pairing, scan, session signal)
- `py_modules/wol.py` – magic packet and port probe helpers (stdlib only)
- `py_modules/steamcfg.py` – Steam client decoder settings
- `src/index.tsx` – Quick Access panel UI

## Build

```bash
pnpm i && pnpm build   # outputs dist/
```

Copy the folder to `~/homebrew/plugins/SpoutRemotePlay` on the device (with `dist/`, `main.py`, `py_modules/`, `plugin.json`, `package.json`).

## Releases

Merging a PR into `main` publishes a release automatically. `MAJOR.MINOR` is set by hand in the `VERSION` file; the patch number is auto-incremented per merge (e.g. `0.1.0`, `0.1.1`, ...). Edit `VERSION` in a PR to start a new minor/major. Add the `no-release` label to a PR to skip releasing.

See Releases for installable builds.
