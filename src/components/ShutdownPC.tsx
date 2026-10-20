import { ButtonItem, ConfirmModal, PanelSectionRow, showModal } from "@decky/ui";
import { callable, toaster } from "@decky/api";
import type { Host, HostState, Result } from "../types";

const shutdownHost = callable<[hostId: string], Result>("shutdown_host");

export function ShutdownPC({
  host,
  state,
  onShutdown,
}: {
  host: Host;
  state: HostState | null;
  onShutdown: () => void;
}) {
  const shutdown = () =>
    showModal(
      <ConfirmModal
        strTitle={`Shut down ${host.name}?`}
        strDescription="Apps with unsaved work may stop the shutdown. You can wake the PC again from here."
        strOKButtonText="Shut down"
        onOK={async () => {
          try {
            const res = await shutdownHost(host.id);
            if (!res.ok) throw new Error(res.error);
            onShutdown();
            toaster.toast({ title: host.name, body: "Shutting down" });
          } catch (error) {
            toaster.toast({ title: "Shut down failed", body: String(error) });
          }
        }}
      />,
    );

  return (
    <>
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
