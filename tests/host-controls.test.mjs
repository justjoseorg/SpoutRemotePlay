import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const host = { id: "pc-1", name: "PC", mac: "00:11:22:33:44:55", token: "test-token" };

function loadComponent(file, rpc) {
  const source = ts.transpileModule(
    readFileSync(new URL(`../src/components/${file}.tsx`, import.meta.url), "utf8"),
    { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    } },
  ).outputText;
  let active;
  const toasts = [];
  const modals = [];
  const calls = [];
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  runInNewContext(source, {
    exports,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react") return {
        useState(initial) {
          const instance = active;
          const slot = instance.cursor++;
          if (!(slot in instance.values)) instance.values[slot] = initial;
          return [instance.values[slot], (value) => {
            instance.values[slot] = typeof value === "function" ? value(instance.values[slot]) : value;
          }];
        },
      };
      if (name === "@decky/ui") return {
        ButtonItem: "ButtonItem", PanelSectionRow: "PanelSectionRow",
        DialogButton: "DialogButton", Focusable: "Focusable", ConfirmModal: "ConfirmModal",
        showModal: (modal) => modals.push(modal),
      };
      if (name === "@decky/api") return {
        callable: (method) => (...args) => {
          calls.push({ method, args });
          return rpc(method, ...args);
        },
        toaster: { toast: (toast) => toasts.push(toast) },
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  function mount(component, props) {
    const instance = { cursor: 0, values: [] };
    return {
      render() {
        active = instance;
        instance.cursor = 0;
        return component(props);
      },
    };
  }
  return { exports, mount, calls, toasts, modals };
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props.children)];
}

function button(tree, label) {
  const found = nodes(tree).find((node) =>
    ["ButtonItem", "DialogButton"].includes(node.type) &&
    (label === undefined || node.props.children === label));
  assert.ok(found, `Missing button: ${label}`);
  return found;
}

test("Wake remains available immediately, shows busy state, and forwards the result", async () => {
  let resolve;
  const module = loadComponent("WakePC", () => new Promise((done) => { resolve = done; }));
  const states = [];
  const ui = module.mount(module.exports.WakePC, {
    host, state: null, status: "", onState: (state) => states.push(state),
  });
  const initial = button(ui.render(), "Wake PC");
  assert.equal(initial.props.description, host.mac);
  const pending = initial.props.onClick();
  assert.equal(button(ui.render(), "Waking…").props.disabled, true);
  assert.equal(module.calls[0].method, "wake_host");
  assert.equal(module.calls[0].args[0], host.id);
  resolve({ ok: true, state: "ready" });
  await pending;
  assert.deepEqual(states, ["ready"]);
  assert.equal(module.toasts[0].body, "PC is online");
  assert.equal(button(ui.render(), "Wake PC").props.disabled, false);
});

test("Wake displays status instead of a button for awake PCs", () => {
  const module = loadComponent("WakePC", () => { throw new Error("Unexpected call"); });
  for (const [state, status] of [["ready", " • online"], ["on", " • not signed in"]]) {
    const ui = module.mount(module.exports.WakePC, { host, state, status, onState() {} });
    const tree = ui.render();
    assert.equal(tree.type, "PanelSectionRow");
    assert.equal(tree.props.children, `PC${status}`);
    assert.equal(nodes(tree).filter((node) => node.type === "ButtonItem").length, 0);
  }
});

test("Wake transport failures restore the button and display the error", async () => {
  const module = loadComponent("WakePC", async () => { throw new Error("Disconnected"); });
  const ui = module.mount(module.exports.WakePC, { host, state: "off", status: "", onState() {} });
  await button(ui.render()).props.onClick();
  assert.equal(button(ui.render()).props.disabled, false);
  assert.equal(module.toasts[0].title, "Wake failed");
  assert.match(module.toasts[0].body, /Disconnected/);
});

test("sign-in sends the PIN once, clears the pad, and updates PC status", async () => {
  const module = loadComponent("SignInPC", async () => ({ ok: true, state: "ready" }));
  const states = [];
  const open = [];
  const ui = module.mount(module.exports.SignInPC, {
    host, state: "on", padOpen: true,
    onPadOpen: (value) => open.push(value), onState: (state) => states.push(state),
  });
  const padNode = nodes(ui.render()).find((node) => typeof node.type === "function");
  const pad = module.mount(padNode.type, padNode.props);
  assert.equal(button(pad.render(), "OK").props.disabled, true);
  for (const digit of ["1", "2", "3", "4"]) button(pad.render(), digit).props.onClick();
  assert.equal(button(pad.render(), "OK").props.disabled, false);
  button(pad.render(), "OK").props.onClick();
  assert.equal(button(pad.render(), "OK").props.disabled, true);
  await new Promise(setImmediate);
  assert.equal(module.calls.length, 1);
  assert.equal(module.calls[0].method, "sign_in");
  assert.equal(module.calls[0].args.join(","), "pc-1,1234");
  assert.deepEqual(open, [false]);
  assert.deepEqual(states, ["ready"]);
});

test("sign-in failures clear busy state without closing the pad or changing status", async () => {
  const module = loadComponent("SignInPC", async () => { throw new Error("Disconnected"); });
  const ui = module.mount(module.exports.SignInPC, {
    host, state: "on", padOpen: true,
    onPadOpen() { assert.fail("Pad should stay open"); },
    onState() { assert.fail("Status must not change"); },
  });
  let pad = nodes(ui.render()).find((node) => typeof node.type === "function");
  const pending = pad.props.onSubmit("1234");
  assert.equal(nodes(ui.render()).find((node) => typeof node.type === "function").props.busy, true);
  await pending;
  pad = nodes(ui.render()).find((node) => typeof node.type === "function");
  assert.equal(pad.props.busy, false);
  assert.equal(module.toasts[0].title, "Sign-in failed");
});

test("shutdown requires confirmation and only updates state after success", async () => {
  const module = loadComponent("ShutdownPC", async () => ({ ok: true }));
  let shutdown = false;
  const ui = module.mount(module.exports.ShutdownPC, {
    host, state: "ready", onShutdown() { shutdown = true; },
  });
  button(ui.render(), "Shut down").props.onClick();
  assert.equal(module.calls.length, 0);
  assert.equal(module.modals[0].props.strTitle, "Shut down PC?");
  await module.modals[0].props.onOK();
  assert.equal(module.calls[0].method, "shutdown_host");
  assert.equal(shutdown, true);
});
