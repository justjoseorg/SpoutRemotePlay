import { DropdownItem, PanelSectionRow, ToggleField } from "@decky/ui";
import { useEffect, useState } from "react";
import type { DecoderState, Decoders } from "../types";
import { getDecoders, setDecoders } from "../lib/remotePlay";
import { getDisplaySize } from "../lib/backend";

const FPS_LIMITS = [0, 30, 40, 45, 60, 72, 90, 120, 144];

export function DecoderSettings() {
  const [st, setSt] = useState<DecoderState | null>(null);

  useEffect(() => {
    let stopped = false;
    Promise.all([getDecoders(), getDisplaySize()])
      .then(([state, display]) => {
        if (!stopped) setSt({ ...state, display });
      })
      .catch((error: unknown) => {
        if (!stopped) setSt({ ok: false, error: String(error) });
      });
    return () => {
      stopped = true;
    };
  }, []);

  if (!st) return <PanelSectionRow>Loading…</PanelSectionRow>;
  if (!st.ok || !st.decoders)
    return (
      <PanelSectionRow>{st.error ?? "Steam not reachable"}</PanelSectionRow>
    );

  const change = async (values: Partial<Decoders>, enabled = true) => {
    try {
      const state = await setDecoders(values, enabled);
      setSt({ ...state, display: st.display });
    } catch (error) {
      setSt({ ok: false, error: String(error) });
    }
  };
  const d = st.decoders;
  const even = (n: number) => Math.round(n / 2) * 2;
  // Native size of this device's screen, then smaller sizes with the same aspect ratio.
  const resLimits = ["0x0"];
  if (st.display)
    for (const f of [1, 5 / 6, 3 / 4, 2 / 3, 1 / 2]) {
      const r = `${even(st.display[0] * f)}x${even(st.display[1] * f)}`;
      if (!resLimits.includes(r)) resLimits.push(r);
    }
  const curRes = d.resolution.join("x");
  if (!resLimits.includes(curRes)) resLimits.push(curRes);
  return (
    <>
      <PanelSectionRow>
        <ToggleField
          label="Override client stream settings"
          checked={!!st.enabled}
          onChange={(v) => change({}, v)}
        />
      </PanelSectionRow>
      {st.enabled && (
        <>
          <PanelSectionRow>
            <DropdownItem
              label="Resolution limit"
              rgOptions={resLimits.map((r, i) => ({
                data: r,
                label:
                  r === "0x0"
                    ? "Automatic"
                    : i === 1 && st.display
                      ? `${r} (native)`
                      : r,
              }))}
              selectedOption={curRes}
              onChange={(o) =>
                change({
                  resolution: (o.data as string).split("x").map(Number) as [
                    number,
                    number,
                  ],
                })
              }
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <DropdownItem
              label="Frame rate limit"
              rgOptions={(FPS_LIMITS.includes(d.fps)
                ? FPS_LIMITS
                : [...FPS_LIMITS, d.fps]
              ).map((f) => ({
                data: f,
                label: f ? `${f} FPS` : "Automatic",
              }))}
              selectedOption={d.fps}
              onChange={(o) => change({ fps: o.data as number })}
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <ToggleField
              label="Hardware decoding"
              checked={d.hardware_decoding}
              onChange={(v) => change({ hardware_decoding: v })}
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <ToggleField
              label="HEVC"
              checked={d.hevc}
              disabled={!st.hevc_available}
              onChange={(v) => change({ hevc: v })}
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <ToggleField
              label="AV1"
              checked={d.av1}
              disabled={!st.av1_available}
              onChange={(v) => change({ av1: v })}
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <ToggleField
              label={st.pyrowave_available ? "PyroWave" : "PyroWave (force)"}
              description={
                st.pyrowave_available
                  ? undefined
                  : "Steam reports PyroWave unavailable; forcing it skips that check."
              }
              checked={d.pyrowave}
              onChange={(v) => change({ pyrowave: v })}
            />
          </PanelSectionRow>
        </>
      )}
    </>
  );
}
