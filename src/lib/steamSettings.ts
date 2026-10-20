import { findModuleExport } from "@decky/ui";
import type { Decoders } from "../types";

interface ClientConfig {
  enable_hardware_decoding?: boolean;
  enable_video_hevc?: boolean;
  enable_video_av1?: boolean;
  enable_video_pyrowave?: boolean;
  desired_framerate_numerator?: number;
  desired_framerate_denominator?: number;
  desired_resolution_x?: number;
  desired_resolution_y?: number;
}

interface ConfigMessage {
  toObject(): ClientConfig;
  serializeBase64String(): string;
}

interface ConfigType {
  prototype: { getClassName(): string };
  deserializeBinary(bytes: Uint8Array): ConfigMessage;
  fromObject(value: ClientConfig): ConfigMessage;
}

function isConfigType(value: unknown): value is ConfigType {
  return (
    typeof value === "function" &&
    "deserializeBinary" in value &&
    typeof value.deserializeBinary === "function" &&
    "fromObject" in value &&
    typeof value.fromObject === "function" &&
    typeof value.prototype?.getClassName === "function" &&
    value.prototype.getClassName() === "CStreamingClientConfig"
  );
}

let configType: ConfigType | undefined;
function getConfigType(): ConfigType {
  if (!configType) {
    const found: unknown = findModuleExport(isConfigType);
    if (!isConfigType(found))
      throw new Error("Steam's streaming client protobuf is unavailable");
    configType = found;
  }
  return configType;
}

type Subscription = { unregister(): void };
interface Settings {
  bRemotePlayClientConfigEnabled: boolean;
  unStreamingSessionID: number;
  bHEVCDecodeAvailable: boolean;
  bAV1DecodeAvailable: boolean;
  bPyrowaveDecodeAvailable?: boolean;
  RemotePlayClientConfig: ArrayBuffer | Uint8Array;
}

function isSettings(value: unknown): value is Settings {
  return (
    typeof value === "object" &&
    value !== null &&
    "bRemotePlayClientConfigEnabled" in value &&
    typeof value.bRemotePlayClientConfigEnabled === "boolean" &&
    "unStreamingSessionID" in value &&
    typeof value.unStreamingSessionID === "number" &&
    "bHEVCDecodeAvailable" in value &&
    typeof value.bHEVCDecodeAvailable === "boolean" &&
    "bAV1DecodeAvailable" in value &&
    typeof value.bAV1DecodeAvailable === "boolean" &&
    "RemotePlayClientConfig" in value &&
    (value.RemotePlayClientConfig instanceof ArrayBuffer ||
      value.RemotePlayClientConfig instanceof Uint8Array)
  );
}

function readSettings(
  accept: (settings: Settings) => boolean = () => true,
): Promise<Settings> {
  return new Promise((resolve, reject) => {
    let subscription: Subscription | undefined;
    let settled = false;
    const finish = (settings?: Settings, error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription?.unregister();
      if (settings) resolve(settings);
      else reject(error);
    };
    const timer = setTimeout(
      () => finish(undefined, new Error("Timed out waiting for Steam settings")),
      10_000,
    );
    try {
      subscription = SteamClient.RemotePlay.RegisterForSettingsChanges(
        (settings: unknown) => {
          try {
            if (!isSettings(settings))
              throw new Error("Steam returned invalid Remote Play settings");
            if (accept(settings)) finish(settings);
          } catch (error) {
            finish(undefined, error);
          }
        },
      );
      // Steam may deliver the initial settings during registration.
      if (settled) subscription.unregister();
    } catch (error) {
      finish(undefined, error);
    }
  });
}

function decodeSettings(settings: Settings) {
  const config = getConfigType()
    .deserializeBinary(new Uint8Array(settings.RemotePlayClientConfig))
    .toObject();
  const num = config.desired_framerate_numerator ?? 0;
  const den = config.desired_framerate_denominator ?? 0;
  const decoders: Decoders = {
    hardware_decoding: config.enable_hardware_decoding ?? true,
    hevc: config.enable_video_hevc ?? false,
    av1: config.enable_video_av1 ?? false,
    pyrowave: config.enable_video_pyrowave ?? false,
    fps: num && den ? Math.round(num / den) : 0,
    resolution: [config.desired_resolution_x ?? 0, config.desired_resolution_y ?? 0],
  };
  return {
    ok: true as const,
    enabled: settings.bRemotePlayClientConfigEnabled,
    hevc_available: settings.bHEVCDecodeAvailable,
    av1_available: settings.bAV1DecodeAvailable,
    pyrowave_available: settings.bPyrowaveDecodeAvailable === true,
    decoders,
    config,
    session: settings.unStreamingSessionID,
  };
}

export async function getDecoders() {
  return decodeSettings(await readSettings());
}

let pendingUpdate = Promise.resolve();

export function setDecoders(values: Partial<Decoders>, enabled: boolean) {
  const result = pendingUpdate.then(() => applyDecoders(values, enabled));
  pendingUpdate = result.then(
    () => undefined,
    (error: unknown) => console.error("Spout: Steam settings update failed", error),
  );
  return result;
}

async function applyDecoders(values: Partial<Decoders>, enabled: boolean) {
  const { config, session } = await getDecoders();
  if (values.hardware_decoding !== undefined)
    config.enable_hardware_decoding = values.hardware_decoding;
  if (values.hevc !== undefined) config.enable_video_hevc = values.hevc;
  if (values.av1 !== undefined) config.enable_video_av1 = values.av1;
  if (values.pyrowave !== undefined) config.enable_video_pyrowave = values.pyrowave;
  if (values.fps !== undefined) {
    if (!Number.isInteger(values.fps) || values.fps < 0)
      throw new Error("Frame rate must be a non-negative whole number");
    config.desired_framerate_numerator = values.fps;
    config.desired_framerate_denominator = values.fps ? 1 : 0;
  }
  if (values.resolution !== undefined) {
    if (
      values.resolution.length !== 2 ||
      values.resolution.some((n) => !Number.isInteger(n) || n < 0)
    )
      throw new Error("Resolution must contain two non-negative whole numbers");
    const [width, height] = values.resolution;
    config.desired_resolution_x = width && height ? width : 0;
    config.desired_resolution_y = width && height ? height : 0;
  }
  SteamClient.RemotePlay.SetStreamingClientConfig(
    getConfigType().fromObject(config).serializeBase64String(),
    session,
  );
  SteamClient.RemotePlay.SetStreamingClientConfigEnabled(enabled);
  return decodeSettings(
    await readSettings((settings) => {
      const state = decodeSettings(settings);
      if (state.enabled !== enabled) return false;
      for (const key of ["hardware_decoding", "hevc", "av1", "pyrowave", "fps"] as const) {
        if (values[key] !== undefined && state.decoders[key] !== values[key])
          return false;
      }
      return (
        values.resolution === undefined ||
        state.decoders.resolution[0] === config.desired_resolution_x &&
        state.decoders.resolution[1] === config.desired_resolution_y
      );
    }),
  );
}
