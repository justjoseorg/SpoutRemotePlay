import {
  ButtonItem,
  ConfirmModal,
  DialogButton,
  Focusable,
  PanelSection,
  PanelSectionRow,
  showModal,
} from "@decky/ui";
import { toaster } from "@decky/api";
import { useEffect, useState } from "react";
import type { Host, HostState } from "../types";
import { hostStatus, signIn, wakeHost, shutdownHost } from "../lib/backend";
import { StreamSettings } from "./StreamSettings";

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
      <div
        style={{
          textAlign: "center",
          fontSize: "20px",
          letterSpacing: "6px",
          minHeight: "28px",
        }}
      >
        {busy ? "Signing in…" : "•".repeat(pin.length) || "Windows PIN"}
      </div>
      <Focusable
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "6px",
          marginTop: "6px",
        }}
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

export function HostRow({ host }: { host: Host }) {
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<HostState | null>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const submitPin = async (pin: string) => {
    setSigningIn(true);
    const res = await signIn(host.id, pin);
    setSigningIn(false);
    if (!res.ok) {
      toaster.toast({
        title: "Sign-in failed",
        body: res.error ?? "Unknown error",
      });
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

  // Keep the status fresh so the wake button appears when the PC goes to sleep or off.
  useEffect(() => {
    if (!host.address) return;
    let stopped = false;
    const poll = () =>
      hostStatus(host.id).then((r) => {
        if (!stopped) setState(r);
      });
    poll();
    const t = setInterval(poll, 5000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [host.id, host.address]);

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
            toaster.toast({
              title: "Shut down failed",
              body: res.error ?? "Unknown error",
            });
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
      {/* Wake is available until the PC is seen awake, so you never wait for the status check. */}
      {state !== "on" && state !== "ready" ? (
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
      )}
      {state === "on" && host.token && (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => setPadOpen((o) => !o)}>
            {padOpen ? "Hide numpad" : "Sign in with PIN"}
          </ButtonItem>
        </PanelSectionRow>
      )}
      {state === "on" && padOpen && (
        <PinPad busy={signingIn} onSubmit={submitPin} />
      )}
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

export function HostAdvanced({
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
