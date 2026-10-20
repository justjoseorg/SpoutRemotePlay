import { callable } from "@decky/api";
import { useEffect, useState } from "react";
import type { Host, HostState } from "../types";
import { WakePC } from "./WakePC";
import { SignInPC } from "./SignInPC";
import { ShutdownPC } from "./ShutdownPC";

const hostStatus = callable<[hostId: string], HostState>("host_status");
const STATE_LABEL: Record<HostState, string> = {
  ready: "online",
  on: "not signed in",
  off: "offline",
};

export function HostRow({ host }: { host: Host }) {
  const [state, setState] = useState<HostState | null>(null);
  const [padOpen, setPadOpen] = useState(false);

  useEffect(() => {
    if (!host.address) return;
    let stopped = false;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await hostStatus(host.id);
        if (!stopped) setState(next);
      } catch (error) {
        console.error("Spout: host status check failed", error);
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = setInterval(poll, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [host.id, host.address]);

  return (
    <>
      <WakePC
        host={host}
        state={state}
        status={state ? ` • ${STATE_LABEL[state]}` : ""}
        onState={setState}
      />
      <SignInPC
        host={host}
        state={state}
        padOpen={padOpen}
        onPadOpen={setPadOpen}
        onState={setState}
      />
      <ShutdownPC
        host={host}
        state={state}
        onShutdown={() => {
          setPadOpen(false);
          setState("off");
        }}
      />
    </>
  );
}
