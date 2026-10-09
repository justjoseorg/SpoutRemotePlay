<p align="center">
  <img src="assets/logo.png" alt="SpoutRemotePlay" width="128">
</p>

<h1 align="center">SpoutRemotePlay</h1>

<p align="center">
  <b>Pick up your handheld, press play on a game from your PC, and go.</b><br>
  A Decky plugin for Steam's native Remote Play: wake your PC, and stream on a virtual display matching your handheld with your other displays off.
</p>

<p align="center">
  <a href="https://github.com/justjoseorg/SpoutRemotePlay/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/justjoseorg/SpoutRemotePlay?label=latest&color=2ea44f"></a>
  <a href="https://github.com/justjoseorg/SpoutRemotePlay/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/justjoseorg/SpoutRemotePlay/total"></a>
  <img alt="Decky" src="https://img.shields.io/badge/Decky-plugin-8a2be2">
  <img alt="Architecture" src="https://img.shields.io/badge/arch-ARM%20%7C%20x86-lightgrey">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-BSD--3--Clause-blue"></a>
  <a href="https://ko-fi.com/justjose"><img alt="Ko-fi" src="https://img.shields.io/badge/Ko--fi-support-FF5E5B?logo=ko-fi&logoColor=white"></a>
</p>

<p align="center">
  <a href="https://github.com/justjoseorg/SpoutRemotePlay/releases/latest"><b>⬇️ Download the plugin</b></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/justjoseorg/SpoutRemotePlayHost/releases/latest"><b>🖥️ Download the PC host</b></a>
    &nbsp;·&nbsp;
    <a href="CHANGELOG.md">📝 Changelog</a>
  </p>

---

## Contents

- [💡 The idea](#-the-idea)
- [🚀 How it works](#-how-it-works)
- [📥 Install](#-install)
- [✅ What works today](#-what-works-today)
- [🔧 Build](#-build)
- [🙏 Credits](#-credits)

## 💡 The idea

This is deliberately *not* another streaming stack. Steam's native Remote Play already streams well, and I want to keep using it as-is: same Steam UI, same Steam Link experience, no separate client to learn.

The one thing it lacks is keeping the stream off your desk: your PC's real displays get hijacked or stay lit while you play on the handheld. Tools like ArtMoon/ArtLight (built on Moonlight) solve that for their own streaming protocol. SpoutRemotePlay brings that piece to **native Steam Remote Play**, as an integrated part of Steam rather than a replacement for it: wake the PC from the handheld, and while you stream, the game runs on a virtual display matching your handheld with your other displays off.

On Windows, Steam's client beta now creates that virtual display itself, so the host's job there is to switch your other displays off and bring them back afterwards. On Linux, where Steam doesn't, the host creates the display too.

> **Why "Spout"?** It's a play on **Valve**: a valve controls the flow of steam, and a spout is where the steam comes out. Valve's Steam does the streaming; Spout just makes sure the stream pours onto a display shaped for your handheld.

## 🚀 How it works

| Step | |
|---|---|
| 1️⃣ **Wake the PC** | Open the plugin, tap your PC, and it sends Wake-on-LAN and waits until it's up. |
| 2️⃣ **Pair once** | Enter the PC's IP, type the 4-digit PIN shown on the PC, and you're done. The plugin also learns the PC's MAC address and tells the host what your device can decode (HEVC/AV1) and its screen size. |
| 3️⃣ **Press play in Steam** | As usual. The plugin notices Steam's Remote Play session and tells the host. On Windows, Steam creates a virtual display for your device and the host turns your other displays off; on Linux, the host creates the virtual display with your device's resolution and refresh rate. When you quit, everything goes back. |

The plugin is one half of a pair. The other half is the **[host app on your PC](https://github.com/justjoseorg/SpoutRemotePlayHost)** (Windows and Linux, x86_64).

There is no codec setting: Steam picks the codec during negotiation.

## 📥 Install

1. **On the PC:** install the host from its [latest release](https://github.com/justjoseorg/SpoutRemotePlayHost/releases/latest).
2. **On the handheld:** download `SpoutRemotePlay-vX.Y.Z.zip` from this repo's [latest release](https://github.com/justjoseorg/SpoutRemotePlay/releases/latest). In Decky's settings, turn on **Developer mode**, then use **Developer → Install Plugin from ZIP File**.

Requires [Decky Loader](https://decky.xyz/). No native code, so it runs on both ARM and x86 SteamOS devices.

## ✅ What works today

| Feature | Status |
|---|---|
| 🔐 **Pairing** with a PIN, and **per-device stream settings** (resolution, refresh) pushed to the host | Verified end to end against the real host on Linux. |
| 📡 **Session signal:** Remote Play start/stop reported to your paired PCs | Verified on an AYN Odin 2 Portal streaming Celeste to a Linux PC: the host received both the start and the stop. |
| 🖥️ **Virtual display on a real stream** | Windows (host 0.3, Steam client beta): verified with an AYN Odin 2 Portal. Steam's display was used, the other displays turned off during the stream and came back afterwards. Not yet confirmed on a Linux host. |
| ⏰ **Wake-on-LAN** with an online check | Not yet run on the Portal. |
| 🧩 **Apps tab:** lists the programs the host added to its Steam library (read-only, via the paired token) | Untested on the Portal. |
| 🔎 **Network scan**, **Steam client decoder toggles** (HEVC/AV1), tabbed UI with L1/R1 switching, Spout icon | Ran on the device earlier; the latest UI changes have not been visually confirmed. |

If you have several paired PCs, the start/stop signal goes to all of them for now. A game that is still starting when the monitor switches can crash (seen with Celeste on Windows); connecting again works.

## 🔧 Build

```bash
pnpm i && pnpm build   # outputs dist/
```

Copy the folder to `~/homebrew/plugins/SpoutRemotePlay` on the device (with `dist/`, `main.py`, `py_modules/`, `plugin.json`, `package.json`).

## 🙏 Credits

This project is based on the ideas and work of others, and I'm grateful to them:

- [Moonlight](https://moonlight-stream.org/) – the open-source game streaming client that started it all.
- [StreamLight](https://github.com/FoggyBytes/StreamLight) – a Moonlight fork with deeper host integration.
- [ArtMoon](https://github.com/onaiaku/ArtMoon) and [ArtLight](https://github.com/onaiaku/ArtLight) – the gamepad-first client and its one-installer host, whose wake/pair/virtual-monitor flow this is modeled on.

SpoutRemotePlay is an independent project and is not affiliated with any of them or with Valve.

---

<p align="center">
  If this is useful to you, you can <a href="https://ko-fi.com/justjose">☕ buy me a coffee on Ko-fi</a>.
</p>
