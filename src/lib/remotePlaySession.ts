import { callable } from "@decky/api";

const sessionEvent = callable<[state: "start" | "stop"], unknown>("session_event");

export function watchRemotePlay(): () => void {
  const notify = (state: "start" | "stop") => {
    void sessionEvent(state).catch((error: unknown) => {
      console.error(`Spout: Remote Play ${state} notification failed`, error);
    });
  };
  const remotePlay = SteamClient.RemotePlay;
  const started = remotePlay.RegisterForRemoteClientStarted(() => notify("start"));
  let stopped: { unregister(): void };
  try {
    stopped = remotePlay.RegisterForRemoteClientStopped(() => notify("stop"));
  } catch (error) {
    started.unregister();
    throw error;
  }
  return () => {
    started.unregister();
    stopped.unregister();
  };
}
