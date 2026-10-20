import { callable } from "@decky/api";
import type { Found, Host, Result } from "../types";
import { getDecoders } from "./steamSettings";

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
