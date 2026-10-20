import {
  ButtonItem,
  DialogButton,
  Focusable,
  GamepadButton,
  PanelSection,
  PanelSectionRow,
  TextField,
} from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import type { Host } from "../types";
import { getHosts, addHost, removeHost } from "../lib/backend";
import { HostRow, HostAdvanced } from "./HostControls";
import { PairPC } from "./PairPC";
import { HostApps } from "./HostApps";
import { DecoderSettings } from "./DecoderSettings";

type TabId = "pcs" | "apps" | "advanced" | "pair";
const TABS: { id: TabId; label: string }[] = [
  { id: "pcs", label: "PCs" },
  { id: "apps", label: "Apps" },
  { id: "advanced", label: "Advanced" },
  { id: "pair", label: "Pair" },
];

export function Content() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [name, setName] = useState("");
  const [mac, setMac] = useState("");
  const [address, setAddress] = useState("");
  const [broadcast, setBroadcast] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>("pcs");
  const [more, setMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const tabBar = useRef<HTMLDivElement>(null);

  const refresh = () => getHosts().then(setHosts);
  useEffect(() => {
    getHosts().then((h) => {
      setHosts(h);
      if (h.length === 0) setTab("pair");
      setLoaded(true);
    });
  }, []);
  const onPaired = () => {
    refresh();
    setTab("pcs");
  };

  const add = async () => {
    const res = await addHost(name, mac, address, broadcast, token);
    if (!res.ok) {
      setError(res.error ?? "Failed to add host");
      return;
    }
    setError("");
    setName("");
    setMac("");
    setAddress("");
    setBroadcast("");
    setToken("");
    refresh();
  };

  if (!loaded) return <PanelSectionRow>Loading…</PanelSectionRow>;

  const shift = (d: number) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const n = (i + d + TABS.length) % TABS.length;
    setTab(TABS[n].id);
    // The focused control may belong to the old tab and disappear, which sends
    // focus to the header's back button; move it to the new tab's button instead.
    setTimeout(() => {
      const btn =
        tabBar.current?.querySelectorAll<HTMLElement>("[data-spout-tab]")[n];
      btn?.focus();
    }, 0);
  };
  const onButtonDown = (e: CustomEvent<{ button: number }>) => {
    if (e.detail.button === GamepadButton.BUMPER_LEFT) shift(-1);
    else if (e.detail.button === GamepadButton.BUMPER_RIGHT) shift(1);
  };

  return (
    <Focusable onButtonDown={onButtonDown}>
      <Focusable
        ref={tabBar}
        style={{ display: "flex", gap: "4px", padding: "0 8px 8px" }}
      >
        {TABS.map((t) => (
          <DialogButton
            key={t.id}
            data-spout-tab={t.id}
            preferredFocus={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "8px 2px",
              fontSize: "12px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              opacity: tab === t.id ? 1 : 0.55,
              background: tab === t.id ? "rgba(255,255,255,0.2)" : undefined,
            }}
          >
            {t.label}
          </DialogButton>
        ))}
      </Focusable>
      {tab === "pcs" && (
        <PanelSection>
          {hosts.length === 0 && (
            <PanelSectionRow>
              No PCs yet. Open the Pair tab to add one.
            </PanelSectionRow>
          )}
          {hosts.map((h) => (
            <HostRow key={h.id} host={h} />
          ))}
        </PanelSection>
      )}
      {tab === "pair" && (
        <PanelSection>
          <PairPC onPaired={onPaired}>
            <PanelSectionRow>
              <ButtonItem layout="below" onClick={() => setMore(!more)}>
                {more ? "Hide details" : "More details (MAC, name…)"}
              </ButtonItem>
            </PanelSectionRow>
            {more && (
              <>
                <PanelSectionRow>
                  <TextField
                    label="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </PanelSectionRow>
                <PanelSectionRow>
                  <TextField
                    label="MAC address"
                    value={mac}
                    onChange={(e) => setMac(e.target.value)}
                  />
                </PanelSectionRow>
                <PanelSectionRow>
                  <TextField
                    label="PC IP (optional, for status)"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </PanelSectionRow>
                <PanelSectionRow>
                  <TextField
                    label="Broadcast (default 255.255.255.255)"
                    value={broadcast}
                    onChange={(e) => setBroadcast(e.target.value)}
                  />
                </PanelSectionRow>
                <PanelSectionRow>
                  <TextField
                    label="Host app API token (for stream settings)"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </PanelSectionRow>
                {error && <PanelSectionRow>{error}</PanelSectionRow>}
                <PanelSectionRow>
                  <ButtonItem layout="below" onClick={add}>
                    Add PC
                  </ButtonItem>
                </PanelSectionRow>
              </>
            )}
          </PairPC>
        </PanelSection>
      )}
      {tab === "apps" && (
        <>
          {hosts.length === 0 && (
            <PanelSection>
              <PanelSectionRow>Pair a PC first.</PanelSectionRow>
            </PanelSection>
          )}
          {hosts.map((h) => (
            <HostApps key={h.id} host={h} />
          ))}
        </>
      )}
      {tab === "advanced" && (
        <>
          {hosts.map((h) => (
            <HostAdvanced
              key={h.id}
              host={h}
              onRemove={async () => {
                await removeHost(h.id);
                refresh();
              }}
            />
          ))}
          <PanelSection title="Client stream settings">
            <DecoderSettings />
          </PanelSection>
        </>
      )}
    </Focusable>
  );
}
