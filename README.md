<p align="center">
  <img src="assets/logo.png" alt="SpoutRemotePlay" width="128">
</p>

<h1 align="center">SpoutRemotePlay</h1>

<p align="center">
  <b>Pick up your handheld, press play on a game from your PC, and go.</b><br>
  A Decky plugin for Steam's built-in Remote Play. It wakes your PC and streams to a virtual display that fits your handheld, with your other screens off.
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

- [💡 What is this?](#-what-is-this)
- [🧰 What you need](#-what-you-need)
- [📥 Install, step by step](#-install-step-by-step)
- [🚀 Using it](#-using-it)
- [✅ What works today](#-what-works-today)
- [🛟 Good to know](#-good-to-know)
- [🔧 Build it yourself](#-build-it-yourself)
- [🙏 Credits](#-credits)

## 💡 What is this?

SpoutRemotePlay is **not** a new streaming app. Steam's own Remote Play already streams well, so this plugin keeps using it. You get the same Steam menus and the same Steam Link, with nothing new to learn.

What Steam doesn't do well is leave your desk alone. While you play on the handheld, your PC's real monitors can get taken over or stay lit. This plugin fixes that. It works with a small app on your PC (the **host**) to:

- wake your PC from the handheld,
- make a virtual display that matches your handheld's screen,
- turn your other monitors off while you stream, and
- turn everything back on when you stop.

The plugin is one half of a pair. The other half is the **[SpoutRemotePlay Host](https://github.com/justjoseorg/SpoutRemotePlayHost)** for your PC (Windows or Linux, x86_64). You need both.

> **Why "Spout"?** It's a play on **Valve**. A valve controls the flow of steam, and a spout is where the steam comes out. Steam does the streaming. Spout makes sure it pours onto a display shaped for your handheld.

## 🧰 What you need

- A handheld running SteamOS (or similar) with [Decky Loader](https://decky.xyz/). ARM and x86 both work.
- A PC on the same network (or reachable by VPN) with Steam signed in.
- The [SpoutRemotePlay Host](https://github.com/justjoseorg/SpoutRemotePlayHost) installed on that PC.

## 📥 Install, step by step

### Step 1: Install the host on your PC

Follow the install steps in the [host README](https://github.com/justjoseorg/SpoutRemotePlayHost#-install-step-by-step), or grab the installer from the [latest host release](https://github.com/justjoseorg/SpoutRemotePlayHost/releases/latest).

### Step 2: Install the plugin on your handheld

> **Decky Plugin Store:** the plugin has been submitted to the store in [decky-plugin-database PR #1146](https://github.com/SteamDeckHomebrew/decky-plugin-database/pull/1146), which is still open. **Once it is merged, SpoutRemotePlay will be available to install straight from the Decky store.** Until then, use the ZIP method below.

**Install from a ZIP file (works today):**

1. On the handheld, download `SpoutRemotePlay-vX.Y.Z.zip` from the [latest release](https://github.com/justjoseorg/SpoutRemotePlay/releases/latest).
2. Open Decky (the **...** button) and go to **Settings → General**. Turn on **Developer mode**.
3. A new **Developer** tab appears. Open it and choose **Install Plugin from ZIP File**.
4. Pick the ZIP you downloaded. Decky installs the plugin and reloads.
5. Open Decky again. You should see **SpoutRemotePlay** in the list.

### Step 3: Pair the two

1. Open the plugin and enter your PC's IP address (or use **Network scan**).
2. A 4-digit PIN shows on the handheld, and the PC shows a notification.
3. Type the PIN into the host's web page on the PC. You only do this once.

## 🚀 Using it

| Step | What happens |
|---|---|
| 1️⃣ **Wake the PC** | Tap your PC in the plugin. It sends Wake-on-LAN and waits until Steam is up. |
| 2️⃣ **Sign in (Windows, optional)** | If the PC is on but nobody is signed in, tap **Sign in with PIN** and type your Windows PIN on the numpad. This needs the host's optional [Spout Sign-In](https://github.com/justjoseorg/SpoutRemotePlayHost#-sign-in-after-wake-on-lan-windows). Your PIN is sent once and never stored. |
| 3️⃣ **Press play in Steam** | Do it like normal. The plugin sees the Remote Play session and tells the PC you're streaming from (and only that one). On Windows, Steam makes the virtual display and the host turns your other displays off. On Linux, the host makes the virtual display using your handheld's resolution and refresh rate. |
| 4️⃣ **Quit** | Everything goes back the way it was. |

Away from home on a VPN such as WireGuard? Another paired PC at home that is turned on (host 0.6 or newer) can pass the wake signal along for you.

There is no codec setting. Steam picks the codec on its own.

## ✅ What works today

Everything below was tested on an **AYN Odin 2 Portal** unless noted.

| Feature | Status |
|---|---|
| 🔐 **Pairing** with a PIN, plus per-device stream settings (resolution, refresh) | Works end to end with the real host on Linux. |
| 📡 **Session signal:** Remote Play start and stop are sent to your paired PCs | Works. Tested streaming Celeste to a Linux PC. |
| 🖥️ **Virtual display** | Windows (host 0.3 and the Steam client beta): works. Other displays turned off and came back. Linux: works. The host made and removed the display. |
| ⏻ **Shut down the PC** (host 0.7+) | Works. |
| ⏰ **Wake-on-LAN** with an online check | Works, including over WireGuard and from outside the home (host 0.4+). The check tells "online" from "not signed in". |
| 🔑 **Sign in with PIN** at the Windows sign-in screen | Works on a Windows PC after power-on. |
| 🧩 **Apps tab:** lists programs the host added to its Steam library | Not tested on the Portal yet. |
| 🌊 **Force PyroWave** on or off (Advanced) | The setting saves to Steam's config. A stream with it off hasn't been tried yet. |
| 🎞️ **Frame rate and resolution limits** (Advanced) | Works. |
| 🔎 **Network scan**, **decoder toggles** (HEVC/AV1), tabbed UI with L1/R1 switching | Ran earlier. The newest UI changes haven't been checked by eye. |

## 🛟 Good to know

- A game that is still starting when the monitor switches can crash (seen with Celeste on Windows). Connecting again fixes it.

## 🔧 Build it yourself

```bash
pnpm i && pnpm build   # outputs dist/
```

Copy the folder to `~/homebrew/plugins/SpoutRemotePlay` on the device. Include `dist/`, `main.py`, `py_modules/`, `plugin.json` and `package.json`.

## 🙏 Credits

This project builds on the ideas and work of others, and I'm grateful to them:

- [Moonlight](https://moonlight-stream.org/) – the open-source game streaming client that started it all.
- [StreamLight](https://github.com/FoggyBytes/StreamLight) – a Moonlight fork with deeper host integration.
- [ArtMoon](https://github.com/onaiaku/ArtMoon) and [ArtLight](https://github.com/onaiaku/ArtLight) – the gamepad-first client and its one-installer host, whose wake, pair and virtual-monitor flow this is modeled on.

SpoutRemotePlay is an independent project and is not affiliated with any of them or with Valve.

---

<p align="center">
  If this is useful to you, you can <a href="https://ko-fi.com/justjose">☕ buy me a coffee on Ko-fi</a>.
</p>
