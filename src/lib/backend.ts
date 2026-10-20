import { callable } from "@decky/api";
import type { Host, HostSettings, HostState, Found, HostApp } from "../types";
import { getDecoders } from "./remotePlay";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const getHosts = callable<[], Host[]>("get_hosts");

export const addHost = callable<
  [
    name: string,
    mac: string,
    address: string,
    broadcast: string,
    token: string,
  ],
  { ok: boolean; error?: string }
>("add_host");

export const removeHost = callable<[hostId: string], boolean>("remove_host");

export const wakeHost = callable<
  [hostId: string],
  { ok: boolean; state?: HostState | null; error?: string }
>("wake_host");

export const getHostSettings = callable<
  [hostId: string],
  Result<{ settings: HostSettings; os?: string }>
>("get_host_settings");

export const setHostSettings = callable<
  [hostId: string, settings: HostSettings],
  Result<{ settings: HostSettings }>
>("set_host_settings");

const requestPairing = callable<
  [address: string, capabilities: { hevc: boolean; av1: boolean }],
  Result<{ pin: string }>
>("start_pairing");

export async function startPairing(address: string) {
  let capabilities = { hevc: false, av1: false };
  try {
    const state = await getDecoders();
    capabilities = { hevc: state.hevc_available, av1: state.av1_available };
  } catch (error) {
    console.warn("Spout: Steam capabilities unavailable while pairing", error);
  }
  return requestPairing(address, capabilities);
}

export const getDisplaySize =
  callable<[], [number, number] | null>("get_display_size");

export const pollPairing = callable<
  [],
  {
    ok: boolean;
    status?: "pending" | "approved" | "gone";
    host?: Host;
    error?: string;
  }
>("poll_pairing");

export const scanHosts = callable<
  [],
  { ok: boolean; hosts?: Found[]; error?: string }
>("scan_hosts");

export const cancelPairing = callable<[], boolean>("cancel_pairing");

export const hostStatus = callable<[hostId: string], HostState>("host_status");

export const signIn = callable<
  [hostId: string, pin: string],
  { ok: boolean; state?: HostState; error?: string }
>("sign_in");

export const shutdownHost = callable<
  [hostId: string],
  { ok: boolean; error?: string }
>("shutdown_host");

export const listHostApps = callable<
  [host_id: string],
  { ok: boolean; error?: string; apps?: HostApp[]; steam?: { ready: boolean } }
>("list_host_apps");
