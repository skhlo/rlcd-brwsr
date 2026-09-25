import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import {
  act,
  armExactTargetDialogEvents,
  fresh,
  installSelectedPageForTest,
  observe,
  visibleText,
} from "../bridge/cli_browser_worker.mjs";

function selectedPage() {
  const calls = [];
  const states = new Map();
  const handle = (name, state) => {
    states.set(name, state);
    return {
      async evaluate() {
        return { ...states.get(name) };
      },
      asLocator() {
        return {
          async click() {
            calls.push(`click:${name}`);
          },
          async fill(value) {
            calls.push(`fill:${name}:${value}`);
          },
        };
      },
      async select(value) {
        calls.push(`select:${name}:${value}`);
        return [value];
      },
    };
  };
  const button = handle("button", {
    role: "button",
    tag: "BUTTON",
    type: "",
    label: "Continue",
    value: "",
    checked: null,
    selected: null,
    expanded: null,
    readOnly: false,
    href: null,
    options: [],
    scope: "top",
    focused: false,
  });
  const field = handle("field", {
    role: "textbox",
    tag: "INPUT",
    type: "text",
    label: "City",
    value: "",
    checked: null,
    selected: null,
    expanded: null,
    readOnly: false,
    href: null,
    options: [],
    scope: "top",
    focused: false,
  });
  const select = handle("select", {
    role: "combobox",
    tag: "SELECT",
    type: "",
    label: "Plan",
    value: "basic",
    checked: null,
    selected: null,
    expanded: null,
    readOnly: false,
    href: null,
    options: [{ value: "premium", label: "Premium" }],
    scope: "top",
    focused: false,
  });
  const tree = {
    role: "WebArea",
    name: "Fixture",
    backendNodeId: 1,
    loaderId: "top",
    children: [
      {
        role: "heading",
        name: "Task heading",
        backendNodeId: 2,
        loaderId: "top",
        children: [],
      },
      {
        role: "button",
        name: "Continue",
        backendNodeId: 3,
        loaderId: "top",
        elementHandle: async () => button,
        children: [],
      },
      {
        role: "textbox",
        name: "City",
        backendNodeId: 4,
        loaderId: "top",
        elementHandle: async () => field,
        children: [],
      },
      {
        role: "combobox",
        name: "Plan",
        backendNodeId: 5,
        loaderId: "top",
        elementHandle: async () => select,
        children: [],
      },
    ],
  };
  const events = new EventEmitter();
  const client = new EventEmitter();
  const marker = { shadow: "initial" };
  const frame = {
    url: () => "https://fixture.test/start",
    async evaluate(fn) {
      const source = fn.toString();
      if (source.includes("const controls")) return [marker.shadow];
      if (source.includes("NodeFilter.SHOW_TEXT"))
        return "Visible fixture text";
      throw new Error("unexpected external frame evaluation");
    },
  };
  const page = Object.assign(events, {
    accessibility: {
      async snapshot() {
        return tree;
      },
    },
    isClosed: () => false,
    url: () => "https://fixture.test/start",
    title: async () => "Fixture",
    frames: () => [frame],
    mainFrame: () => frame,
    async evaluate() {
      return { y: 0, height: 100, viewport: 100 };
    },
    _client: () => client,
    async evaluateHandle() {
      return { async evaluate() {}, [Symbol.dispose]() {} };
    },
    async waitForNavigation() {},
  });
  return { page, states, calls, marker };
}

test("worker observation, freshness, exact actions and dialog guard use selected-page mechanics", async () => {
  const fixture = selectedPage();
  installSelectedPageForTest(fixture.page);
  let page = await observe();
  assert.match(page.text, /heading "Task heading"/);
  assert.match(page.visible_text, /Visible fixture text/);
  const button = page.actions.find(
    (item) => item.kind === "click" && item.label.includes("Continue"),
  );
  const field = page.actions.find(
    (item) => item.kind === "fill" && item.label.includes("City"),
  );
  const plan = page.actions.find(
    (item) => item.kind === "select" && item.value === "premium",
  );
  assert.ok(button && field && plan);
  assert.equal(plan.current_value, "basic");
  assert.equal(await fresh({ marker: page.marker, actionId: button.id }), true);

  await act({ marker: page.marker, action: button });
  await act({ marker: page.marker, action: field, text: "Busan" });
  await act({ marker: page.marker, action: plan });
  assert.deepEqual(fixture.calls, [
    "click:button",
    "fill:field:Busan",
    "select:select:premium",
  ]);

  fixture.marker.shadow = "changed open-shadow text";
  assert.equal(await fresh({ marker: page.marker }), false);
  page = await observe();
  fixture.states.get("button").label = "Replacement";
  await assert.rejects(
    act({ marker: page.marker, action: button }),
    /Observed target or page changed/,
  );
  assert.equal(fixture.calls.length, 3);

  fixture.page.emit("dialog", { type: () => "confirm", handled: false });
  await assert.rejects(observe(), /Pending confirm dialog/);
  assert.equal(fixture.calls.length, 3);
});

test("exact target session captures dialog events before page construction", async () => {
  const fixture = selectedPage();
  installSelectedPageForTest(fixture.page);
  const session = new EventEmitter();
  const commands = [];
  session.send = async (command) => {
    commands.push(command);
  };
  await armExactTargetDialogEvents({ _session: () => session });
  assert.deepEqual(commands, ["Page.enable"]);
  session.emit("Page.javascriptDialogOpening", {
    type: "confirm",
    frameId: "selected-frame",
  });
  await assert.rejects(observe(), /Pending confirm dialog/);
  session.emit("Page.javascriptDialogClosed", {});
  const page = await observe();
  assert.match(page.visible_text, /Visible fixture text/);
});

test("worker omits frame text when the embedding is not established and stales on visibility change", async () => {
  const fixture = selectedPage();
  let embeddingVisible = false;
  const main = fixture.page.mainFrame();
  const child = {
    url: () => "https://fixture.test/frame",
    parentFrame: () => main,
    async frameElement() {
      return {
        async evaluate() {
          return embeddingVisible;
        },
        async dispose() {},
      };
    },
    async evaluate(fn) {
      return fn.toString().includes("const controls")
        ? ["child state"]
        : "Offscreen frame text";
    },
  };
  fixture.page.frames = () => [main, child];
  installSelectedPageForTest(fixture.page);
  const first = await observe();
  assert.equal(first.visible_frame_omissions, 1);
  assert.doesNotMatch(first.visible_text, /Offscreen frame text/);
  assert.match(first.text, /omitted from visible evidence/);
  embeddingVisible = true;
  assert.equal(await fresh({ marker: first.marker }), false);
  const second = await visibleText();
  assert.match(second.text, /Offscreen frame text/);
  assert.equal(second.omittedFrames, 0);
});
