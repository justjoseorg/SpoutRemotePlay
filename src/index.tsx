import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  TextField,
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
}

const getHosts = callable<[], Host[]>("get_hosts");
const addHost = callable<
  [name: string, mac: string, address: string, broadcast: string],
  { ok: boolean; error?: string }
>("add_host");
const removeHost = callable<[hostId: string], boolean>("remove_host");
const wakeHost = callable<
  [hostId: string],
  { ok: boolean; online?: boolean | null; error?: string }
>("wake_host");
const hostStatus = callable<[hostId: string], boolean>("host_status");

function HostRow({ host, onRemove }: { host: Host; onRemove: () => void }) {
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
  const [error, setError] = useState("");

  const refresh = () => getHosts().then(setHosts);
  useEffect(() => {
    refresh();
  }, []);

  const add = async () => {
    const res = await addHost(name, mac, address, broadcast);
    if (!res.ok) {
      setError(res.error ?? "Failed to add host");
      return;
    }
    setError("");
    setName("");
    setMac("");
    setAddress("");
    setBroadcast("");
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
  name: "SpigotRemotePlay",
  titleView: <div className={staticClasses.Title}>SpigotRemotePlay</div>,
  content: <Content />,
  icon: <FaPlug />,
  onDismount() {},
}));
