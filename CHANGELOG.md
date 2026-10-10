# Changelog

Minor releases (`X.Y.0`) get a written entry here, which becomes their release notes. Patch releases (`X.Y.Z`) are listed on the [Releases](https://github.com/justjoseorg/SpoutRemotePlay/releases) page with the change that produced them. Each entry covers everything since the previous minor release.

## 0.5

- **Shut down a PC from the plugin:** when a PC is ready, a **Shut down** button (with a confirmation) asks its host to shut it down. Needs Spout Remote Play Host 0.7 or later. Windows does a full shutdown, so Wake can turn it back on.
- **R1/L1 keep focus on the tabs:** switching tabs with the bumpers moves focus to the new tab instead of the panel's back button. *(0.5.1)*
- **Frame rate limit for streams:** the Advanced tab's client stream settings can set Steam's streaming frame rate limit (Automatic, or 30 to 144 FPS), the same setting as in Steam's Remote Play advanced client options. Change it before starting a stream. *(0.5.2)*
- **Resolution limit for streams:** next to the frame rate limit, cap the stream's resolution. The options come from the device's own screen: Automatic, its native resolution, then smaller sizes with the same aspect ratio (for example 1600x900, 1440x810, 1280x720 and 960x540 on a 1080p screen). The screen size sent to the host when pairing is now always landscape. *(0.5.3)*

## 0.4

- **Wake-on-LAN works with WireGuard on.** A full-tunnel VPN takes over 255.255.255.255, so the magic packet went into the tunnel instead of the home network. Wake now also sends to each local network's own broadcast address (for example 192.168.1.255), which stays on Wi-Fi.
- **Wake from away:** Wake also asks every other paired PC that answers to send the magic packet on its own network (host 0.6 or later). Over WireGuard from outside, a PC at home that's already on can wake another one.

## 0.3

- **Sign in with PIN** (not yet tested on a device): when a PC is on but nobody is signed in, a **Sign in with PIN** button opens a numpad. The PIN goes once to the host's optional Spout Sign-In service (Windows, host 0.5), which types it at the sign-in screen. It is never stored.
- **The PC's status tells "online" from "not signed in".** The online check used to count Windows file sharing and Remote Desktop, which answer at the sign-in screen too, so a PC that Steam couldn't stream from yet showed as online. Now only Steam or the host count as online, and Wake waits for them.
- **A locked PC shows "not signed in"** when the host has Spout Sign-In 0.5.1 or later, so the numpad also works after Win+L. *(0.3.1)*

## 0.2

- **PyroWave can be forced on or off** in the Advanced tab, even when Steam greys out its own PyroWave toggle (for example when the x86 streaming client runs under box64 on an ARM handheld). Turn it off before streaming over a slow connection such as a VPN, and back on at home. Steam picks the codec when a stream connects, so change it before starting. AV1 and HEVC stay greyed out when Steam reports no decoder.
- **Only the PC being streamed from is told about the stream**, so other paired PCs keep their displays. *(0.1.8)*

## 0.1

Released 2026-10-09. First release. This entry also covers the 0.1.x patch releases, which came before this changelog existed.

- **Wake-on-LAN:** wake a saved PC with a magic packet, then wait until it's online.
- **Find and pair PCs:** scan the local network for Spout Remote Play Host, or enter an IP address, then pair with the PIN the host shows. Each device gets its own token, and the host learns the device's decoders and display when pairing. *(0.1.1)*
- **Per-device virtual monitor settings** sent to the host: presets, or a custom resolution and refresh rate.
- **Steam client decoder toggles:** hardware decoding, HEVC, AV1 and PyroWave.
- **Remote Play start and stop are reported** to paired hosts, so the virtual monitor exists only while streaming. *(0.1.1)*
- **Apps tab** listing the host's Steam apps. *(0.1.2)*
- **Codec setting removed:** Steam picks the codec. *(0.1.3)*
- **Tabbed UI** (PCs, Pair, Apps, Advanced) with L1/R1 switching and the Spout icon. *(0.1.1)*
- **Decky Plugin Store metadata:** store image and description. *(0.1.4)*