import { ButtonItem, PanelSectionRow } from "@decky/ui";
import { callable, toaster } from "@decky/api";
import { useState } from "react";
import type { Host, HostState, Result } from "../types";

const wakeHost = callable<
  [hostId: string],
  Result<{ state?: HostState | null }>
>("wake_host");

const STATE_TOAST: Record<HostState, string> = {
  ready: "PC is online",
  on: "PC is on but nobody is signed in, so Steam can't stream yet",
  off: "Packet sent, PC did not come online",
};

export function WakePC({
  host,
  state,
  status,
  onState,
}: {
  host: Host;
  state: HostState | null;
  status: string;
  onState: (state: HostState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const wake = async () => {
    setBusy(true);
    try {
      const res = await wakeHost(host.id);
      if (!res.ok) throw new Error(res.error);
      if (!res.state) {
        toaster.toast({ title: host.name, body: "Magic packet sent" });
      } else {
        onState(res.state);
        toaster.toast({ title: host.name, body: STATE_TOAST[res.state] });
      }
    } catch (error) {
      toaster.toast({ title: "Wake failed", body: String(error) });
    } finally {
      setBusy(false);
    }
  };

  return state !== "on" && state !== "ready" ? (
    <PanelSectionRow>
      <ButtonItem
        layout="below"
        disabled={busy}
        onClick={wake}
        description={host.mac}
      >
        {busy ? "Waking…" : `Wake ${host.name}${status}`}
      </ButtonItem>
    </PanelSectionRow>
  ) : (
    <PanelSectionRow>
      {`${host.name}${status}`}
    </PanelSectionRow>
  );
}
