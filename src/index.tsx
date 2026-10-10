import {
  ButtonItem,
  ConfirmModal,
  DialogButton,
  DropdownItem,
  Focusable,
  GamepadButton,
  PanelSection,
  PanelSectionRow,
  TextField,
  ToggleField,
  showModal,
  staticClasses,
} from "@decky/ui";
import { callable, definePlugin, toaster } from "@decky/api";
import { useEffect, useRef, useState } from "react";

interface Host {
  id: string;
  name: string;
  mac: string;
  address: string;
  broadcast: string;
  token?: string;
}

interface HostSettings {
  width: number;
  height: number;
  refreshHz: number;
  autoCreate: boolean;
}

const getHosts = callable<[], Host[]>("get_hosts");
const addHost = callable<
  [
    name: string,
    mac: string,
    address: string,
    broadcast: string,
    token: string,
  ],
  { ok: boolean; error?: string }
>("add_host");
const removeHost = callable<[hostId: string], boolean>("remove_host");
const wakeHost = callable<
  [hostId: string],
  { ok: boolean; state?: HostState | null; error?: string }
>("wake_host");
const getHostSettings = callable<
  [hostId: string],
  { ok: boolean; settings?: HostSettings; os?: string; error?: string }
>("get_host_settings");
const setHostSettings = callable<
  [hostId: string, settings: HostSettings],
  { ok: boolean; settings?: HostSettings; error?: string }
>("set_host_settings");
type Decoders = {
  hardware_decoding: boolean;
  hevc: boolean;
  av1: boolean;
  pyrowave: boolean;
  fps: number;
};
type DecoderState = {
  ok: boolean;
  error?: string;
  enabled?: boolean;
  decoders?: Decoders;
  hevc_available?: boolean;
  av1_available?: boolean;
  pyrowave_available?: boolean;
};
const getDecoders = callable<[], DecoderState>("get_decoders");
const setDecoders = callable<
  [values: Partial<Decoders>, enabled: boolean],
  DecoderState
>("set_decoders");
const startPairing = callable<
  [address: string],
  { ok: boolean; pin?: string; error?: string }
>("start_pairing");
const pollPairing = callable<
  [],
  {
    ok: boolean;
    status?: "pending" | "approved" | "gone";
    host?: Host;
    error?: string;
  }
>("poll_pairing");
type Found = { address: string; name: string; paired: boolean };
const scanHosts = callable<
  [],
  { ok: boolean; hosts?: Found[]; error?: string }
>("scan_hosts");
const cancelPairing = callable<[], boolean>("cancel_pairing");
type HostState = "ready" | "on" | "off";
const hostStatus = callable<[hostId: string], HostState>("host_status");
const signIn = callable<
  [hostId: string, pin: string],
  { ok: boolean; state?: HostState; error?: string }
>("sign_in");

const shutdownHost = callable<[hostId: string], { ok: boolean; error?: string }>("shutdown_host");

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
const FPS_LIMITS = [0, 30, 40, 45, 60, 72, 90, 120, 144];

function DecoderSettings() {
  const [st, setSt] = useState<DecoderState | null>(null);

  useEffect(() => {
    getDecoders().then(setSt);
  }, []);

  if (!st) return <PanelSectionRow>Loading…</PanelSectionRow>;
  if (!st.ok || !st.decoders)
    return (
      <PanelSectionRow>{st.error ?? "Steam not reachable"}</PanelSectionRow>
    );

  const change = async (values: Partial<Decoders>, enabled = true) =>
    setSt(await setDecoders(values, enabled));
  const d = st.decoders;
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
              label="Frame rate limit"
              rgOptions={(FPS_LIMITS.includes(d.fps) ? FPS_LIMITS : [...FPS_LIMITS, d.fps]).map((f) => ({
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

function StreamSettings({ host }: { host: Host }) {
  const [s, setS] = useState<HostSettings | null>(null);
  const [msg, setMsg] = useState("");
  const [hostOs, setHostOs] = useState("");
  const [customRes, setCustomRes] = useState("");
  const [customHz, setCustomHz] = useState("");

  useEffect(() => {
    getHostSettings(host.id).then((r) => {
      if (r.ok) {
        setS(r.settings!);
        setHostOs(r.os ?? "");
      } else {
        setMsg(r.error ?? "Failed");
      }
    });
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
    setS(next);
    const r = await setHostSettings(host.id, next);
    setMsg(r.ok ? "Saved on host" : (r.error ?? "Failed"));
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

const STATE_LABEL: Record<HostState, string> = {
  ready: "online",
  on: "not signed in",
  off: "offline",
};
const STATE_TOAST: Record<HostState, string> = {
  ready: "PC is online",
  on: "PC is on but nobody is signed in, so Steam can't stream yet",
  off: "Packet sent, PC did not come online",
};

const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"];

// The PIN only lives in this component's state and is cleared as soon as it is sent.
function PinPad({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (pin: string) => void;
}) {
  const [pin, setPin] = useState("");
  const press = (k: string) => {
    if (k === "⌫") setPin((p) => p.slice(0, -1));
    else if (k === "OK") {
      if (pin.length >= 4) {
        onSubmit(pin);
        setPin("");
      }
    } else if (pin.length < 32) setPin((p) => p + k);
  };
  return (
    <PanelSectionRow>
      <div style={{ textAlign: "center", fontSize: "20px", letterSpacing: "6px", minHeight: "28px" }}>
        {busy ? "Signing in…" : "•".repeat(pin.length) || "Windows PIN"}
      </div>
      <Focusable
        style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", marginTop: "6px" }}
      >
        {PAD_KEYS.map((k) => (
          <DialogButton
            key={k}
            disabled={busy || (k === "OK" && pin.length < 4)}
            style={{ minWidth: 0, padding: "8px 0", fontSize: "18px" }}
            onClick={() => press(k)}
          >
            {k}
          </DialogButton>
        ))}
      </Focusable>
    </PanelSectionRow>
  );
}

function HostRow({ host }: { host: Host }) {
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<HostState | null>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const submitPin = async (pin: string) => {
    setSigningIn(true);
    const res = await signIn(host.id, pin);
    setSigningIn(false);
    if (!res.ok) {
      toaster.toast({ title: "Sign-in failed", body: res.error ?? "Unknown error" });
      return;
    }
    setPadOpen(false);
    if (res.state) setState(res.state);
    toaster.toast({
      title: host.name,
      body:
        res.state === "ready"
          ? "Signed in, ready to stream"
          : "PIN sent, but Steam isn't up yet. Check the PIN and try again.",
    });
  };

  useEffect(() => {
    if (host.address) hostStatus(host.id).then(setState);
  }, [host.id]);

  const wake = async () => {
    setBusy(true);
    const res = await wakeHost(host.id);
    setBusy(false);
    if (!res.ok) {
      toaster.toast({
        title: "Wake failed",
        body: res.error ?? "Unknown error",
      });
      return;
    }
    if (!res.state) {
      toaster.toast({ title: host.name, body: "Magic packet sent" });
    } else {
      setState(res.state);
      toaster.toast({ title: host.name, body: STATE_TOAST[res.state] });
    }
  };

  const shutdown = () =>
    showModal(
      <ConfirmModal
        strTitle={`Shut down ${host.name}?`}
        strDescription="Apps with unsaved work may stop the shutdown. You can wake the PC again from here."
        strOKButtonText="Shut down"
        onOK={async () => {
          const res = await shutdownHost(host.id);
          if (!res.ok) {
            toaster.toast({ title: "Shut down failed", body: res.error ?? "Unknown error" });
            return;
          }
          setPadOpen(false);
          setState("off");
          toaster.toast({ title: host.name, body: "Shutting down" });
        }}
      />,
    );

  const status = state ? ` • ${STATE_LABEL[state]}` : "";

  return (
    <>
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
      {state === "on" && host.token && (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => setPadOpen((o) => !o)}>
            {padOpen ? "Hide numpad" : "Sign in with PIN"}
          </ButtonItem>
        </PanelSectionRow>
      )}
      {state === "on" && padOpen && <PinPad busy={signingIn} onSubmit={submitPin} />}
      {state === "ready" && host.token && (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={shutdown}>
            Shut down
          </ButtonItem>
        </PanelSectionRow>
      )}
    </>
  );
}

function HostAdvanced({
  host,
  onRemove,
}: {
  host: Host;
  onRemove: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  return (
    <PanelSection title={host.name}>
      {host.address && (
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => setShowSettings(!showSettings)}
          >
            {showSettings ? "Hide stream settings" : "Stream settings"}
          </ButtonItem>
        </PanelSectionRow>
      )}
      {showSettings && <StreamSettings host={host} />}
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={onRemove}>
          Remove {host.name}
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}

function PairPC({
  onPaired,
  children,
}: {
  onPaired: () => void;
  children?: React.ReactNode;
}) {
  const [address, setAddress] = useState("");
  const [pin, setPin] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!pin) return;
    let stopped = false;
    const deadline = Date.now() + 120_000;
    const tick = async () => {
      if (stopped) return;
      const r = await pollPairing();
      if (stopped) return;
      if (!r.ok) {
        setMsg(r.error ?? "Pairing failed");
        setPin(null);
      } else if (r.status === "approved") {
        setMsg(`Paired with ${r.host?.name ?? "PC"}`);
        setPin(null);
        toaster.toast({
          title: "Spout",
          body: `Paired with ${r.host?.name ?? "PC"}`,
        });
        onPaired();
      } else if (r.status === "gone" || Date.now() > deadline) {
        setMsg("Pairing expired or was denied");
        setPin(null);
      } else {
        setTimeout(tick, 2000);
      }
    };
    const t = setTimeout(tick, 2000);
    return () => {
      stopped = true;
      clearTimeout(t);
    };
  }, [pin]);

  const [found, setFound] = useState<Found[] | null>(null);
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    setScanning(true);
    setMsg("");
    const r = await scanHosts();
    setScanning(false);
    if (r.ok) setFound(r.hosts ?? []);
    else setMsg(r.error ?? "Scan failed");
  };

  const start = async (addr = address) => {
    setMsg("");
    const r = await startPairing(addr);
    if (r.ok) setPin(r.pin!);
    else setMsg(r.error ?? "Failed");
  };

  return (
    <>
      {pin ? (
        <>
          <PanelSectionRow>
            Enter PIN {pin} in the Spout Host notification on your PC
          </PanelSectionRow>
          <PanelSectionRow>
            <ButtonItem
              layout="below"
              onClick={async () => {
                await cancelPairing();
                setPin(null);
              }}
            >
              Cancel
            </ButtonItem>
          </PanelSectionRow>
        </>
      ) : (
        <>
          <PanelSectionRow>
            <ButtonItem layout="below" disabled={scanning} onClick={scan}>
              {scanning ? "Scanning…" : "Scan network for PCs"}
            </ButtonItem>
          </PanelSectionRow>
          {found && found.length === 0 && (
            <PanelSectionRow>
              No PCs found. Is Spout Host running with -listen 0.0.0.0:47995?
            </PanelSectionRow>
          )}
          {found?.map((f) => (
            <PanelSectionRow key={f.address}>
              <ButtonItem
                layout="below"
                onClick={() => start(f.address)}
                description={f.address}
              >
                {f.paired ? `Re-pair ${f.name}` : `Pair ${f.name}`}
              </ButtonItem>
            </PanelSectionRow>
          ))}
          {
            <>
              <PanelSectionRow>
                <TextField
                  label="PC IP address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </PanelSectionRow>
              <PanelSectionRow>
                <ButtonItem layout="below" onClick={() => start()}>
                  Pair PC
                </ButtonItem>
              </PanelSectionRow>
              {children}
            </>
          }
        </>
      )}
      {msg && <PanelSectionRow>{msg}</PanelSectionRow>}
    </>
  );
}

interface HostApp {
  id: string;
  name: string;
  inSteam: boolean;
}
const listHostApps = callable<
  [host_id: string],
  { ok: boolean; error?: string; apps?: HostApp[]; steam?: { ready: boolean } }
>("list_host_apps");

// Lists the apps a host has added to its Steam library. They stream from the
// host's own library, so syncing just refreshes this list.
function HostApps({ host }: { host: Host }) {
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
    if (r.steam && !r.steam.ready) setMsg("Host Steam integration is not ready");
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
      {apps?.length === 0 && <PanelSectionRow>No apps on this PC yet.</PanelSectionRow>}
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

type TabId = "pcs" | "pair" | "apps" | "advanced";
const TABS: { id: TabId; label: string }[] = [
  { id: "pcs", label: "PCs" },
  { id: "pair", label: "Pair" },
  { id: "apps", label: "Apps" },
  { id: "advanced", label: "Advanced" },
];

function Content() {
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
      const btn = tabBar.current?.querySelectorAll<HTMLElement>("[data-spout-tab]")[n];
      btn?.focus();
    }, 0);
  };
  const onButtonDown = (e: CustomEvent<{ button: number }>) => {
    if (e.detail.button === GamepadButton.BUMPER_LEFT) shift(-1);
    else if (e.detail.button === GamepadButton.BUMPER_RIGHT) shift(1);
  };

  return (
    <Focusable onButtonDown={onButtonDown}>
      <Focusable ref={tabBar} style={{ display: "flex", gap: "6px", padding: "0 16px 8px" }}>
        {TABS.map((t) => (
          <DialogButton
            key={t.id}
            data-spout-tab={t.id}
            preferredFocus={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "8px 4px",
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

// Remote Play screen with a play button and a spout dripping off the corner.
function SpoutIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="5" width="15" height="10.5" rx="1.8" />
      <path d="M7 19.5h5M9.5 15.5v4" />
      <path d="M8.2 8.2v4.6l4-2.3z" fill="currentColor" stroke="none" />
      <path d="M17 7.5h3.2c1 0 1.8.8 1.8 1.8" />
      <path
        d="M21.6 12.2c.9 1.1 1.2 1.9 0 2.8-1.2-.9-.9-1.7 0-2.8z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

const sessionEvent = callable<[state: string], unknown>("session_event");

// Tell the paired PC this device streams from when a Remote Play stream starts/stops,
// so only that PC switches its displays.
function watchRemotePlay(): () => void {
  const rp = (window as any).SteamClient?.RemotePlay;
  const subs = [
    rp?.RegisterForRemoteClientStarted?.(() => void sessionEvent("start")),
    rp?.RegisterForRemoteClientStopped?.(() => void sessionEvent("stop")),
  ];
  return () => subs.forEach((s) => s?.unregister?.());
}

export default definePlugin(() => {
  const stopWatching = watchRemotePlay();
  return {
    name: "SpoutRemotePlay",
    titleView: <div className={staticClasses.Title}>SpoutRemotePlay</div>,
    content: <Content />,
    icon: <SpoutIcon />,
    onDismount() {
      stopWatching();
    },
  };
});
