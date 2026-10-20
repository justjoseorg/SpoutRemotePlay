import { staticClasses } from "@decky/ui";
import { Content } from "./components/Content";
import { SpoutIcon } from "./components/SpoutIcon";
import { watchRemotePlay } from "./lib/remotePlay";

export function createPlugin() {
  const stopWatching = watchRemotePlay();
  return {
    name: "Spout",
    titleView: <div className={staticClasses.Title}>Spout</div>,
    content: <Content />,
    icon: <SpoutIcon />,
    onDismount() {
      stopWatching();
    },
  };
}
