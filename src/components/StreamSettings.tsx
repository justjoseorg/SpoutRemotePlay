import {
  ButtonItem,
  DropdownItem,
  PanelSectionRow,
  TextField,
} from "@decky/ui";
import { useEffect, useState } from "react";
import type { Host, HostSettings } from "../types";
import { getHostSettings, setHostSettings } from "../lib/backend";

const RESOLUTIONS = [
  "1280x720",
  "1280x800",
  "1920x1080",
  "1920x1200",
  "2560x1440",
  "2560x1600",
  "3840x2160",
];

const REFRESH = [30, 60, 90, 120, 144, 165, 240];

export function StreamSettings({ host }: { host: Host }) {
  const [s, setS] = useState<HostSettings | null>(null);
  const [msg, setMsg] = useState("");
  const [hostOs, setHostOs] = useState("");
  const [customRes, setCustomRes] = useState("");
  const [customHz, setCustomHz] = useState("");

  useEffect(() => {
    let stopped = false;
    getHostSettings(host.id)
      .then((r) => {
        if (stopped) return;
        if (r.ok) {
          setS(r.settings);
          setHostOs(r.os ?? "");
        } else {
          setMsg(r.error ?? "Failed");
        }
      })
      .catch((error: unknown) => {
        if (!stopped) setMsg(String(error));
      });
    return () => {
      stopped = true;
    };
  }, [host.id]);

  if (!s) return <PanelSectionRow>{msg || "Loading…"}</PanelSectionRow>;

  // Steam sizes its own virtual display on Windows, so these settings do nothing there.
  if (hostOs === "windows") {
    return (
      <PanelSectionRow>
        Steam sets the stream resolution and refresh rate on Windows hosts.
      </PanelSectionRow>
    );
  }

  const res = `${s.width}x${s.height}`;
  const resOptions = RESOLUTIONS.includes(res)
    ? RESOLUTIONS
    : [res, ...RESOLUTIONS];
  const hzOptions = REFRESH.includes(s.refreshHz)
    ? REFRESH
    : [s.refreshHz, ...REFRESH];
  const applyCustom = () => {
    const m = /^(\d{3,4})x(\d{3,4})$/.exec(customRes.trim().toLowerCase());
    const hz = customHz.trim() ? Number(customHz) : s.refreshHz;
    if (!m || !Number.isInteger(hz)) {
      setMsg("Use WIDTHxHEIGHT (e.g. 1920x1200) and a whole-number Hz");
      return;
    }
    apply({ ...s, width: Number(m[1]), height: Number(m[2]), refreshHz: hz });
  };
  const apply = async (next: HostSettings) => {
    try {
      const r = await setHostSettings(host.id, next);
      if (r.ok) setS(r.settings);
      setMsg(r.ok ? "Saved on host" : (r.error ?? "Failed"));
    } catch (error) {
      setMsg(String(error));
    }
  };

  return (
    <>
      <PanelSectionRow>
        <DropdownItem
          label="Virtual monitor resolution"
          rgOptions={resOptions.map((r) => ({ data: r, label: r }))}
          selectedOption={res}
          onChange={(o) => {
            const [w, h] = (o.data as string).split("x").map(Number);
            apply({ ...s, width: w, height: h });
          }}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <DropdownItem
          label="Refresh rate"
          rgOptions={hzOptions.map((r) => ({ data: r, label: `${r} Hz` }))}
          selectedOption={s.refreshHz}
          onChange={(o) => apply({ ...s, refreshHz: o.data as number })}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <TextField
          label="Custom resolution (WxH)"
          value={customRes}
          onChange={(e) => setCustomRes(e.target.value)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <TextField
          label="Custom refresh (Hz)"
          value={customHz}
          onChange={(e) => setCustomHz(e.target.value)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={applyCustom}>
          Apply custom mode
        </ButtonItem>
      </PanelSectionRow>
      {msg && <PanelSectionRow>{msg}</PanelSectionRow>}
    </>
  );
}
