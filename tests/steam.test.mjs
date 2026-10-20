import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/lib/remotePlay.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;

function setup({ config = {}, synchronous = false, available = true, registerError, delayedWrites = false } = {}) {
  const settings = {
    bRemotePlayClientConfigEnabled: true,
    unStreamingSessionID: 42,
    bHEVCDecodeAvailable: true,
    bAV1DecodeAvailable: false,
    bPyrowaveDecodeAvailable: true,
    RemotePlayClientConfig: new TextEncoder().encode(JSON.stringify(config)),
  };
  let unregisters = 0;
  const events = new Map();
  const notifications = [];
  const changes = [];
  const writes = [];
  const timers = new Map();
  let nextTimer = 0;
  class Config {
    constructor(value) { this.value = value; }
    getClassName() { return "CStreamingClientConfig"; }
    static deserializeBinary(bytes) {
      return new Config(JSON.parse(new TextDecoder().decode(bytes)));
    }
    static fromObject(value) { return new Config(value); }
    toObject() { return this.value; }
    serializeBase64String() {
      return Buffer.from(JSON.stringify(this.value)).toString("base64");
    }
  }
  let listener;
  const remotePlay = {
    RegisterForRemoteClientStarted(callback) {
      events.set("start", callback);
      return { unregister() { events.delete("start"); } };
    },
    RegisterForRemoteClientStopped(callback) {
      events.set("stop", callback);
      return { unregister() { events.delete("stop"); } };
    },
    RegisterForSettingsChanges(callback) {
      if (registerError) throw registerError;
      listener = callback;
      if (synchronous) callback(settings);
      else queueMicrotask(() => callback(settings));
      return { unregister() { unregisters++; } };
    },
    SetStreamingClientConfig(base64, session) {
      writes.push({ config: JSON.parse(Buffer.from(base64, "base64")), session });
      const update = () => {
        settings.RemotePlayClientConfig = new Uint8Array(Buffer.from(base64, "base64"));
      };
      if (delayedWrites) changes.push(update);
      else update();
    },
    SetStreamingClientConfigEnabled(enabled) {
      const update = () => { settings.bRemotePlayClientConfigEnabled = enabled; };
      if (delayedWrites) changes.push(update);
      else update();
    },
  };
  const exports = {};
  runInNewContext(source, {
    exports,
    require(name) {
      if (name === "@decky/api")
        return { callable: () => async (state) => { notifications.push(state); } };
      assert.equal(name, "@decky/ui");
      return { findModuleExport: (predicate) => available && predicate(Config) ? Config : undefined };
    },
    SteamClient: { RemotePlay: remotePlay },
    ArrayBuffer,
    Uint8Array,
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return {
    ...exports,
    settings,
    remotePlay,
    writes,
    timers,
    events,
    notifications,
    get unregisters() { return unregisters; },
    emit(value) { listener(value); },
    applyWrites() { changes.forEach((change) => change()); listener(settings); },
  };
}

test("reads Steam defaults and unsubscribes after the first settings event", async () => {
  const steam = setup();
  const state = await steam.getDecoders();
  assert.equal(state.decoders.hardware_decoding, true);
  assert.equal(state.decoders.hevc, false);
  assert.equal(state.decoders.av1, false);
  assert.equal(state.decoders.pyrowave, false);
  assert.equal(state.decoders.fps, 0);
  assert.equal(state.decoders.resolution.join("x"), "0x0");
  assert.equal(state.hevc_available, true);
  assert.equal(state.av1_available, false);
  assert.equal(state.pyrowave_available, true);
  assert.equal(steam.unregisters, 1);
  assert.equal(steam.timers.size, 0);
});

test("also cleans up when Steam delivers settings synchronously", async () => {
  const steam = setup({ synchronous: true });
  await steam.getDecoders();
  assert.equal(steam.unregisters, 1);
  assert.equal(steam.timers.size, 0);
});

test("reads fractional frame rates and native resolution limits", async () => {
  const steam = setup({ config: {
    desired_framerate_numerator: 60000,
    desired_framerate_denominator: 1001,
    desired_resolution_x: 1920,
    desired_resolution_y: 1080,
    enable_video_av1: true,
  } });
  const state = await steam.getDecoders();
  assert.equal(state.decoders.fps, 60);
  assert.equal(state.decoders.resolution.join("x"), "1920x1080");
  assert.equal(state.decoders.av1, true);
});

test("updates only requested fields, preserves other Steam options, and uses the session ID", async () => {
  const steam = setup({ config: {
    enable_hardware_decoding: false,
    desired_bitrate_kbps: 75000,
    decoder_limit: [{ codec: 5 }],
  } });
  const state = await steam.setDecoders({
    hevc: true, av1: true, pyrowave: true, fps: 120, resolution: [2560, 1440],
  }, false);
  assert.equal(steam.writes.length, 1);
  const { config, session } = steam.writes[0];
  assert.equal(session, 42);
  assert.equal(config.desired_bitrate_kbps, 75000);
  assert.equal(config.decoder_limit[0].codec, 5);
  assert.equal(config.enable_hardware_decoding, false);
  assert.equal(config.enable_video_hevc, true);
  assert.equal(config.enable_video_av1, true);
  assert.equal(config.enable_video_pyrowave, true);
  assert.equal(config.desired_framerate_numerator, 120);
  assert.equal(config.desired_framerate_denominator, 1);
  assert.equal(state.enabled, false);
  assert.equal(state.decoders.resolution.join("x"), "2560x1440");
  assert.equal(steam.unregisters, 2);
});

test("Automatic settings clear both frame-rate and resolution fields", async () => {
  const steam = setup();
  await steam.setDecoders({ fps: 0, resolution: [1920, 0] }, true);
  const config = steam.writes[0].config;
  assert.equal(config.desired_framerate_numerator, 0);
  assert.equal(config.desired_framerate_denominator, 0);
  assert.equal(config.desired_resolution_x, 0);
  assert.equal(config.desired_resolution_y, 0);
});

test("toggling the override leaves the stream configuration intact", async () => {
  const steam = setup({ config: { enable_video_hevc: true, desired_resolution_x: 1280 } });
  await steam.setDecoders({}, false);
  assert.equal(steam.writes[0].config.enable_video_hevc, true);
  assert.equal(steam.writes[0].config.desired_resolution_x, 1280);
  assert.equal(steam.settings.bRemotePlayClientConfigEnabled, false);
});

test("missing PyroWave capability is reported as unavailable on older Steam builds", async () => {
  const steam = setup();
  delete steam.settings.bPyrowaveDecodeAvailable;
  assert.equal((await steam.getDecoders()).pyrowave_available, false);
});

test("missing Steam protobuf reports an error instead of silently discarding settings", async () => {
  const steam = setup({ available: false });
  await assert.rejects(steam.getDecoders(), /protobuf is unavailable/);
  assert.equal(steam.unregisters, 1);
});

test("invalid settings events fail explicitly and release the subscription", async () => {
  const steam = setup();
  const pending = steam.getDecoders();
  steam.emit({});
  await assert.rejects(pending, /invalid Remote Play settings/);
  assert.equal(steam.unregisters, 1);
  assert.equal(steam.timers.size, 0);
});

test("a timeout releases the subscription and ignores late events", async () => {
  const steam = setup();
  const pending = steam.getDecoders();
  for (const callback of steam.timers.values()) callback();
  await assert.rejects(pending, /Timed out/);
  steam.emit(steam.settings);
  assert.equal(steam.unregisters, 1);
  assert.equal(steam.timers.size, 0);
});

test("registration exceptions clear the timeout", async () => {
  const steam = setup({ registerError: new Error("Steam disconnected") });
  await assert.rejects(steam.getDecoders(), /Steam disconnected/);
  assert.equal(steam.timers.size, 0);
});

test("invalid numeric settings are rejected before writing to Steam", async () => {
  const steam = setup();
  for (const values of [{ fps: -1 }, { fps: 59.5 }, { resolution: [-1, 720] }]) {
    await assert.rejects(steam.setDecoders(values, true), /non-negative whole number/);
  }
  assert.equal(steam.writes.length, 0);
});

test("saving waits for confirmation rather than returning Steam's stale initial snapshot", async () => {
  const steam = setup({ delayedWrites: true });
  let saved = false;
  const pending = steam.setDecoders({ hevc: true }, false).then((state) => {
    saved = true;
    return state;
  });
  await new Promise(setImmediate);
  assert.equal(steam.writes.length, 1);
  assert.equal(saved, false);
  steam.applyWrites();
  const state = await pending;
  assert.equal(state.decoders.hevc, true);
  assert.equal(state.enabled, false);
  assert.equal(steam.timers.size, 0);
});

test("rapid changes are serialized without dropping earlier changes", async () => {
  const steam = setup();
  await Promise.all([
    steam.setDecoders({ hevc: true }, true),
    steam.setDecoders({ av1: true }, true),
  ]);
  assert.equal(steam.writes.length, 2);
  assert.equal(steam.writes[1].config.enable_video_hevc, true);
  assert.equal(steam.writes[1].config.enable_video_av1, true);
});

test("a failed update does not block subsequent saves", async () => {
  const steam = setup();
  await assert.rejects(steam.setDecoders({ fps: -1 }, true));
  const state = await steam.setDecoders({ hevc: true }, true);
  assert.equal(state.decoders.hevc, true);
});

test("Remote Play start/stop reach the backend and are unregistered on unload", () => {
  const steam = setup();
  const cleanup = steam.watchRemotePlay();
  steam.events.get("start")();
  steam.events.get("stop")();
  assert.deepEqual(steam.notifications, ["start", "stop"]);
  cleanup();
  assert.equal(steam.events.size, 0);
});

test("partial session registration failure cleans up the first subscription", () => {
  const steam = setup();
  steam.remotePlay.RegisterForRemoteClientStopped = () => { throw new Error("Steam disconnected"); };
  assert.throws(() => steam.watchRemotePlay(), /Steam disconnected/);
  assert.equal(steam.events.size, 0);
});
