import { callable } from "@decky/api";
import type { Host } from "../types";

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
