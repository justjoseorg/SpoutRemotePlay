import { ButtonItem, PanelSectionRow, TextField } from "@decky/ui";
import { toaster } from "@decky/api";
import { useEffect, useState } from "react";
import type { Found } from "../types";
import { pollPairing, scanHosts, startPairing, cancelPairing } from "../lib/pairing";

export function PairPC({
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
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      let r: Awaited<ReturnType<typeof pollPairing>>;
      try {
        r = await pollPairing();
      } catch (error) {
        if (!stopped) {
          setMsg(String(error));
          setPin(null);
        }
        return;
      }
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
        timer = setTimeout(tick, 2000);
      }
    };
    timer = setTimeout(tick, 2000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pin]);

  const [found, setFound] = useState<Found[] | null>(null);
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    setScanning(true);
    setMsg("");
    try {
      const r = await scanHosts();
      if (r.ok) setFound(r.hosts ?? []);
      else setMsg(r.error ?? "Scan failed");
    } catch (error) {
      setMsg(String(error));
    } finally {
      setScanning(false);
    }
  };

  const start = async (addr = address) => {
    setMsg("");
    try {
      const r = await startPairing(addr);
      if (r.ok) setPin(r.pin);
      else setMsg(r.error ?? "Failed");
    } catch (error) {
      setMsg(String(error));
    }
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
