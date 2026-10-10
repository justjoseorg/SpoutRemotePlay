# Changelog

Minor releases (`X.Y.0`) get a written entry here, which becomes their release notes. Patch releases (`X.Y.Z`) are listed on the [Releases](https://github.com/justjoseorg/SpoutRemotePlay/releases) page with the change that produced them. Each entry covers everything since the previous minor release.

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