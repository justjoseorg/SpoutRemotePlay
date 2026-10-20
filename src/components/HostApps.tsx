import { ButtonItem, PanelSection, PanelSectionRow } from "@decky/ui";
import { useEffect, useState } from "react";
import type { Host, HostApp } from "../types";
import { callable } from "@decky/api";

const listHostApps = callable<
  [host_id: string],
  { ok: boolean; error?: string; apps?: HostApp[]; steam?: { ready: boolean } }
>("list_host_apps");

export function HostApps({ host }: { host: Host }) {
  const [apps, setApps] = useState<HostApp[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const sync = async () => {
    setBusy(true);
    setMsg("");
    const r = await listHostApps(host.id);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error ?? "Failed");
      return;
    }
    setApps(r.apps ?? []);
    if (r.steam && !r.steam.ready)
      setMsg("Host Steam integration is not ready");
  };
  useEffect(() => {
    sync();
  }, []);
  return (
    <PanelSection title={host.name}>
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={busy} onClick={sync}>
          {busy ? "Syncing…" : "Sync apps"}
        </ButtonItem>
      </PanelSectionRow>
      {apps?.length === 0 && (
        <PanelSectionRow>No apps on this PC yet.</PanelSectionRow>
      )}
      {apps?.map((a) => (
        <PanelSectionRow key={a.id}>
          {a.name}
          {a.inSteam ? "" : " (not in Steam)"}
        </PanelSectionRow>
      ))}
      {msg && <PanelSectionRow>{msg}</PanelSectionRow>}
    </PanelSection>
  );
}
