import { ButtonItem, PanelSection, PanelSectionRow } from "@decky/ui";
import { useState } from "react";
import type { Host } from "../types";
import { StreamSettings } from "./StreamSettings";

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
