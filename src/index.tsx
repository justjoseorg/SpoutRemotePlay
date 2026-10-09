import {
  ButtonItem,
  DropdownItem,
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
  [name: string, mac: string, address: string, broadcast: string, token: string],
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
type Decoders = { hardware_decoding: boolean; hevc: boolean; av1: boolean; pyrowave: boolean };
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
const setDecoders = callable<[values: Partial<Decoders>, enabled: boolean], DecoderState>(
  "set_decoders"
);
const hostStatus = callable<[hostId: string], boolean>("host_status");

const RESOLUTIONS = [
  "1280x720", "1280x800", "1920x1080", "1920x1200", "2560x1440", "2560x1600", "3840x2160",
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
  if (!st.ok || !st.decoders) return <PanelSectionRow>{st.error ?? "Steam not reachable"}</PanelSectionRow>;

  const change = async (values: Partial<Decoders>, enabled = true) => setSt(await setDecoders(values, enabled));
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
    getHostSettings(host.id).then((r) => (r.ok ? setS(r.settings!) : setMsg(r.error ?? "Failed")));
  }, [host.id]);

  if (!s) return <PanelSectionRow>{msg || "Loading…"}</PanelSectionRow>;

  const res = `${s.width}x${s.height}`;
  const resOptions = RESOLUTIONS.includes(res) ? RESOLUTIONS : [res, ...RESOLUTIONS];
  const hzOptions = REFRESH.includes(s.refreshHz) ? REFRESH : [s.refreshHz, ...REFRESH];
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
    setMsg(r.ok ? "Saved on host" : r.error ?? "Failed");
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
        <TextField label="Custom resolution (WxH)" value={customRes} onChange={(e) => setCustomRes(e.target.value)} />
      </PanelSectionRow>
      <PanelSectionRow>
        <TextField label="Custom refresh (Hz)" value={customHz} onChange={(e) => setCustomHz(e.target.value)} />
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

function HostRow({ host, onRemove }: { host: Host; onRemove: () => void }) {
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (host.address) hostStatus(host.id).then(setOnline);
  }, [host.id]);

  const wake = async () => {
    setBusy(true);
    const res = await wakeHost(host.id);
    setBusy(false);
    if (!res.ok) {
      toaster.toast({ title: "Wake failed", body: res.error ?? "Unknown error" });
      return;
    }
    if (res.online === null) {
      toaster.toast({ title: host.name, body: "Magic packet sent" });
    } else {
      setOnline(!!res.online);
      toaster.toast({
        title: host.name,
        body: res.online ? "PC is online" : "Packet sent, PC did not come online",
      });
    }
  };

  const status = online === null ? "" : online ? " • online" : " • offline";

  return (
    <>
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={busy} onClick={wake} description={host.mac}>
          {busy ? "Waking…" : `Wake ${host.name}${status}`}
        </ButtonItem>
      </PanelSectionRow>
      {host.address && (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => setShowSettings(!showSettings)}>
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
    </>
  );
}

function Content() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [name, setName] = useState("");
  const [mac, setMac] = useState("");
  const [address, setAddress] = useState("");
  const [broadcast, setBroadcast] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  const refresh = () => getHosts().then(setHosts);
  useEffect(() => {
    refresh();
  }, []);

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

  return (
    <>
      <PanelSection title="PCs">
        {hosts.length === 0 && (
          <PanelSectionRow>No PCs yet. Add one below.</PanelSectionRow>
        )}
        {hosts.map((h) => (
          <HostRow
            key={h.id}
            host={h}
            onRemove={async () => {
              await removeHost(h.id);
              refresh();
            }}
          />
        ))}
      </PanelSection>
      <PanelSection title="Client decoders">
        <DecoderSettings />
      </PanelSection>
      <PanelSection title="Add PC">
        <PanelSectionRow>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
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
      </PanelSection>
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
