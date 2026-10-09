import {
  ButtonItem,
  DialogButton,
  DropdownItem,
  Focusable,
  PanelSection,
  PanelSectionRow,
  TextField,
  ToggleField,
  staticClasses,
} from "@decky/ui";
import { callable, definePlugin, toaster } from "@decky/api";
import { useEffect, useState } from "react";
import { FaPlug } from "react-icons/fa";

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
  codec: string;
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
  { ok: boolean; online?: boolean | null; error?: string }
>("wake_host");
const getHostSettings = callable<
  [hostId: string],
  { ok: boolean; settings?: HostSettings; error?: string }
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
const hostStatus = callable<[hostId: string], boolean>("host_status");

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
const CODECS = [
  { data: "auto", label: "Auto" },
  { data: "h264", label: "H.264" },
  { data: "hevc", label: "HEVC" },
  { data: "av1", label: "AV1" },
];

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
          label="Override client decoder settings"
          checked={!!st.enabled}
          onChange={(v) => change({}, v)}
        />
      </PanelSectionRow>
      {st.enabled && (
        <>
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
              label="PyroWave"
              checked={d.pyrowave}
              disabled={!st.pyrowave_available}
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
  const [customRes, setCustomRes] = useState("");
  const [customHz, setCustomHz] = useState("");

  useEffect(() => {
    getHostSettings(host.id).then((r) =>
      r.ok ? setS(r.settings!) : setMsg(r.error ?? "Failed"),
    );
  }, [host.id]);

  if (!s) return <PanelSectionRow>{msg || "Loading…"}</PanelSectionRow>;

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
      <PanelSectionRow>
        <DropdownItem
          label="Codec preference (hint; Steam picks)"
          rgOptions={CODECS}
          selectedOption={s.codec}
          onChange={(o) => apply({ ...s, codec: o.data as string })}
        />
      </PanelSectionRow>
      {msg && <PanelSectionRow>{msg}</PanelSectionRow>}
    </>
  );
}

function HostRow({ host }: { host: Host }) {
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (host.address) hostStatus(host.id).then(setOnline);
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
    if (res.online === null) {
      toaster.toast({ title: host.name, body: "Magic packet sent" });
    } else {
      setOnline(!!res.online);
      toaster.toast({
        title: host.name,
        body: res.online
          ? "PC is online"
          : "Packet sent, PC did not come online",
      });
    }
  };

  const status = online === null ? "" : online ? " • online" : " • offline";

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

type TabId = "pcs" | "pair" | "advanced";
const TABS: { id: TabId; label: string }[] = [
  { id: "pcs", label: "PCs" },
  { id: "pair", label: "Pair" },
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

  return (
    <>
      <Focusable style={{ display: "flex", gap: "6px", padding: "0 16px 8px" }}>
        {TABS.map((t) => (
          <DialogButton
            key={t.id}
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
          <PanelSection title="Client decoders">
            <DecoderSettings />
          </PanelSection>
        </>
      )}
    </>
  );
}

export default definePlugin(() => ({
  name: "SpoutRemotePlay",
  titleView: <div className={staticClasses.Title}>SpoutRemotePlay</div>,
  content: <Content />,
  icon: <FaPlug />,
  onDismount() {},
}));
