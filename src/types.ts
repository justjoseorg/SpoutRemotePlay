export interface Host {
  id: string;
  name: string;
  mac: string;
  address: string;
  broadcast: string;
  lan_address?: string;
  subnet_mask?: string;
  token?: string;
}

export interface HostSettings {
  width: number;
  height: number;
  refreshHz: number;
  autoCreate: boolean;
}

export type HostState = "ready" | "on" | "off";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type Found = { address: string; name: string; paired: boolean };

export interface HostApp {
  id: string;
  name: string;
  inSteam: boolean;
}

export type Decoders = {
  hardware_decoding: boolean;
  hevc: boolean;
  av1: boolean;
  pyrowave: boolean;
  fps: number;
  resolution: [number, number];
};

export type DecoderState = {
  ok: boolean;
  error?: string;
  enabled?: boolean;
  decoders?: Decoders;
  hevc_available?: boolean;
  av1_available?: boolean;
  pyrowave_available?: boolean;
  display?: [number, number] | null;
};
