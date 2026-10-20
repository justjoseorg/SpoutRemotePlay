import { ButtonItem, DialogButton, Focusable, PanelSectionRow } from "@decky/ui";
import { callable, toaster } from "@decky/api";
import { useState } from "react";
import type { Host, HostState, Result } from "../types";

const signIn = callable<
  [hostId: string, pin: string],
  Result<{ state?: HostState }>
>("sign_in");

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

export function SignInPC({
  host,
  state,
  padOpen,
  onPadOpen,
  onState,
}: {
  host: Host;
  state: HostState | null;
  padOpen: boolean;
  onPadOpen: (open: boolean) => void;
  onState: (state: HostState) => void;
}) {
  const [signingIn, setSigningIn] = useState(false);
  const submitPin = async (pin: string) => {
    setSigningIn(true);
    try {
      const res = await signIn(host.id, pin);
      if (!res.ok) throw new Error(res.error);
      onPadOpen(false);
      if (res.state) onState(res.state);
      toaster.toast({
        title: host.name,
        body: res.state === "ready"
          ? "Signed in, ready to stream"
          : "PIN sent, but Steam isn't up yet. Check the PIN and try again.",
      });
    } catch (error) {
      toaster.toast({ title: "Sign-in failed", body: String(error) });
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <>
      {state === "on" && host.token && (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => onPadOpen(!padOpen)}>
            {padOpen ? "Hide numpad" : "Sign in with PIN"}
          </ButtonItem>
        </PanelSectionRow>
      )}
      {state === "on" && padOpen && (
        <PinPad busy={signingIn} onSubmit={submitPin} />
      )}
    </>
  );
}
