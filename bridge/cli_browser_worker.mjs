// Private browser mechanics for one Python-owned Agent.run(). Pinned to
// chrome-devtools-mcp 1.7.0 built source; no CLI/MCP entry point is imported.
import { createHash } from "node:crypto";
import readline from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureBrowserConnected,
  closeBrowser,
} from "chrome-devtools-mcp/build/src/browser.js";
import { TextSnapshot } from "chrome-devtools-mcp/build/src/TextSnapshot.js";
import { SnapshotFormatter } from "chrome-devtools-mcp/build/src/formatters/SnapshotFormatter.js";
import { WaitForHelper } from "chrome-devtools-mcp/build/src/WaitForHelper.js";

const MAX_LINE = 128 * 1024;
const MAX_ACTIONS = 150;
const MAX_AX_NODES = 3000;
const ACTION_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "menuitem",
  "menuitemradio",
  "option",
  "combobox",
  "textbox",
  "searchbox",
  "spinbutton",
]);
const STRUCTURE_ROLES = new Set([
  "heading",
  "region",
  "group",
  "dialog",
  "row",
  "listitem",
  "iframe",
  "form",
]);
const EDITABLE_ROLES = new Set(["textbox", "searchbox", "spinbutton"]);

let browser;
let page;
let targetId;
let dialog;
let revision = 0;
let marker;
let actionMap = new Map();
let stopping = false;
let queue = Promise.resolve();

function fail(type, message) {
  const error = new Error(message);
  error.code = type;
  throw error;
}

function pendingDialog() {
  if (dialog && !dialog.handled) {
    fail(
      "DialogPending",
      `Pending ${dialog.type()} dialog; outer-agent handoff required`,
    );
  }
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  actionMap.clear();
  try {
    await closeBrowser();
  } catch {
    /* A lost connection remains unknown. */
  }
}

async function init(request) {
  if (
    browser ||
    typeof request.wsEndpoint !== "string" ||
    typeof request.targetId !== "string"
  ) {
    fail("AdmissionError", "Invalid or repeated browser admission");
  }
  const endpoint = new URL(request.wsEndpoint);
  if (
    endpoint.protocol !== "ws:" ||
    !["127.0.0.1", "[::1]", "localhost"].includes(endpoint.hostname)
  ) {
    fail(
      "AdmissionError",
      "The candidate browser endpoint is not loopback WebSocket",
    );
  }
  browser = await ensureBrowserConnected({ wsEndpoint: request.wsEndpoint });
  let target = browser
    .targets()
    .find((item) => item._targetId === request.targetId);
  if (!target) {
    try {
      target = await browser.waitForTarget(
        (item) => item._targetId === request.targetId,
        { timeout: 2000 },
      );
    } catch {
      /* Exact target remains absent. */
    }
  }
  if (!target || target.type() !== "page") {
    fail(
      "AdmissionError",
      "The named Harness daemon's exact page target is absent from this browser",
    );
  }
  await armExactTargetDialogEvents(target);
  page = await target.page();
  if (!page || page.isClosed())
    fail("AdmissionError", "The exact page target closed during admission");
  targetId = request.targetId;
  page.setDefaultTimeout(5000);
  page.on("dialog", (value) => {
    dialog = value;
  });
  pendingDialog();
  return { targetId };
}

// The target's own Puppeteer CDP session can see a dialog that opens while
// CdpPage is being constructed. Page.enable does not replay a dialog that
// was already open before this session subscribed.
async function armExactTargetDialogEvents(target) {
  const exactSession = target._session?.();
  if (exactSession) {
    exactSession.on("Page.javascriptDialogOpening", (event) => {
      dialog = { handled: false, type: () => String(event.type ?? "unknown") };
    });
    exactSession.on("Page.javascriptDialogClosed", () => {
      dialog = undefined;
    });
    await exactSession.send("Page.enable");
  }
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function frameState(frame) {
  return frame.evaluate(() => {
    const controls = [];
    const shadowText = [];
    let shadowChars = 0;
    const visit = (root) => {
      for (const element of root.querySelectorAll(
        "input,textarea,select,button,a,[role],[contenteditable]",
      )) {
        if (controls.length >= 500) break;
        controls.push([
          element.tagName,
          element.getAttribute("role"),
          element.getAttribute("aria-label"),
          element.getAttribute("aria-expanded"),
          element.getAttribute("aria-checked"),
          element.value ?? null,
          element.checked ?? null,
          element.disabled ?? null,
          element.getAttribute("href"),
        ]);
      }
      // Plain and custom-element hosts can have open shadow trees too.
      for (const element of root.querySelectorAll("*")) {
        if (!element.shadowRoot) continue;
        if (shadowChars < 20000) {
          const text = (element.shadowRoot.textContent ?? "").slice(
            0,
            20000 - shadowChars,
          );
          shadowText.push(text);
          shadowChars += text.length;
        }
        visit(element.shadowRoot);
      }
    };
    visit(document);
    return [
      location.href,
      document.title,
      performance.timeOrigin,
      scrollX,
      scrollY,
      document.body?.innerText?.slice(0, 20000) ?? "",
      controls.slice(0, 500),
      shadowText,
    ];
  });
}

// Only include a child frame's text when its iframe is wholly inside every
// ancestor viewport and scroll clip. This is a conservative embedding check,
// not a general claim that every glyph is unobscured.
async function frameEmbeddingVisible(frame) {
  let current = frame;
  while (current !== page.mainFrame()) {
    if (!current?.parentFrame()) return false;
    let handle;
    try {
      handle = await current.frameElement();
      if (!handle) return false;
      const visible = await handle.evaluate((element) => {
        if (!(element instanceof Element) || !element.isConnected) return false;
        if (
          !element.checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
          })
        )
          return false;
        const rect = element.getBoundingClientRect();
        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          rect.left < 0 ||
          rect.top < 0 ||
          rect.right > innerWidth ||
          rect.bottom > innerHeight
        )
          return false;
        let ancestor = element.parentElement ?? element.getRootNode().host;
        while (ancestor instanceof Element) {
          const style = getComputedStyle(ancestor);
          if (
            /^(auto|scroll|hidden|clip)$/.test(style.overflowX) ||
            /^(auto|scroll|hidden|clip)$/.test(style.overflowY)
          ) {
            const clip = ancestor.getBoundingClientRect();
            if (
              rect.left < clip.left ||
              rect.top < clip.top ||
              rect.right > clip.right ||
              rect.bottom > clip.bottom
            )
              return false;
          }
          ancestor = ancestor.parentElement ?? ancestor.getRootNode().host;
        }
        const root = element.getRootNode();
        const hitAt =
          root.elementFromPoint?.bind(root) ??
          document.elementFromPoint.bind(document);
        for (const [x, y] of [
          [rect.left + rect.width / 2, rect.top + rect.height / 2],
          [rect.left + 1, rect.top + 1],
          [rect.right - 1, rect.top + 1],
          [rect.left + 1, rect.bottom - 1],
          [rect.right - 1, rect.bottom - 1],
        ]) {
          if (hitAt(x, y) !== element) return false;
        }
        return true;
      });
      if (!visible) return false;
    } catch {
      return false;
    } finally {
      try {
        await handle?.dispose?.();
      } catch {
        /* Session may have gone away. */
      }
    }
    current = current.parentFrame();
  }
  return true;
}

async function currentMarker() {
  if (!page || page.isClosed()) fail("StalePage", "The selected page closed");
  const topOrigin = new URL(page.url()).origin;
  const states = [];
  for (const frame of page.frames()) {
    let url;
    try {
      url = new URL(frame.url());
    } catch {
      continue;
    }
    if (frame !== page.mainFrame() && url.origin !== topOrigin) continue;
    const embeddingVisible = await frameEmbeddingVisible(frame);
    try {
      states.push([embeddingVisible, await frameState(frame)]);
    } catch {
      states.push([embeddingVisible, frame.url(), "unavailable"]);
    }
  }
  return hash(states);
}

async function visibleText() {
  const topOrigin = new URL(page.url()).origin;
  const parts = [];
  let omittedFrames = 0;
  for (const frame of page.frames()) {
    let url;
    try {
      url = new URL(frame.url());
    } catch {
      continue;
    }
    if (frame !== page.mainFrame() && url.origin !== topOrigin) continue;
    if (!(await frameEmbeddingVisible(frame))) {
      omittedFrames++;
      continue;
    }
    try {
      const text = await frame.evaluate(() => {
        const lines = [];
        let length = 0;
        const visit = (root) => {
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode()) && length < 6000) {
            const parent = node.parentElement;
            const value = node.textContent?.trim();
            if (
              !parent ||
              !value ||
              parent.closest(
                "script,style,noscript,template,[aria-hidden=true],[inert]",
              )
            )
              continue;
            if (
              !parent.checkVisibility({
                checkOpacity: true,
                checkVisibilityCSS: true,
              })
            )
              continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            const rect = range.getBoundingClientRect();
            if (
              rect.width <= 0 ||
              rect.height <= 0 ||
              rect.bottom <= 0 ||
              rect.top >= innerHeight ||
              rect.right <= 0 ||
              rect.left >= innerWidth
            )
              continue;
            const hit = document.elementFromPoint(
              Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2)),
              Math.max(
                0,
                Math.min(innerHeight - 1, rect.top + rect.height / 2),
              ),
            );
            const textRoot = parent.getRootNode();
            if (
              !hit ||
              !(
                parent.contains(hit) ||
                hit.contains(parent) ||
                (textRoot instanceof ShadowRoot && textRoot.host === hit)
              )
            )
              continue;
            const heading = parent.closest("h1,h2,h3,h4,h5,h6,[role=heading]");
            const line = `${heading ? "[heading] " : ""}${value}`;
            lines.push(line);
            length += line.length + 1;
          }
          for (const element of root.querySelectorAll("*"))
            if (element.shadowRoot) visit(element.shadowRoot);
        };
        visit(document);
        return lines.join("\n").slice(0, 6000);
      });
      if (text)
        parts.push(
          frame === page.mainFrame()
            ? text
            : `[same-origin frame ${frame.url()}]\n${text}`,
        );
    } catch {
      /* An unavailable frame is not presented as visible text. */
    }
  }
  return { text: parts.join("\n").slice(0, 6000), omittedFrames };
}

async function describe(handle, role) {
  return handle.evaluate((element, axRole) => {
    if (!(element instanceof Element) || !element.isConnected) return null;
    const inFrame = self !== top;
    let sameOrigin = true;
    if (inFrame) {
      try {
        sameOrigin = top.location.origin === location.origin;
      } catch {
        sameOrigin = false;
      }
    }
    if (!sameOrigin) return null;
    const root = element.getRootNode();
    if (root instanceof ShadowRoot && root.mode !== "open") return null;
    const type = element.getAttribute("type")?.toLowerCase() ?? "";
    if (["password", "file", "hidden"].includes(type)) return null;
    if (
      element.closest("[aria-hidden=true],[inert],[aria-disabled=true]") ||
      !element.checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true,
      }) ||
      element.matches(":disabled")
    )
      return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const label =
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.getAttribute("placeholder") ||
      element.innerText?.trim().slice(0, 200) ||
      "";
    const options =
      element instanceof HTMLSelectElement
        ? [...element.options]
            .filter(
              (option) =>
                !option.selected &&
                !option.disabled &&
                !option.closest("optgroup[disabled]") &&
                new TextEncoder().encode(option.value).length <= 512,
            )
            .slice(0, 40)
            .map((option) => ({
              value: option.value,
              label: option.label.slice(0, 120),
            }))
        : [];
    return {
      role: axRole,
      tag: element.tagName,
      type,
      label,
      value:
        "value" in element
          ? String(element.value).slice(0, 2000)
          : element.isContentEditable
            ? element.innerText.slice(0, 2000)
            : "",
      checked:
        "checked" in element
          ? String(element.checked)
          : element.getAttribute("aria-checked"),
      selected: element.getAttribute("aria-selected"),
      expanded: element.getAttribute("aria-expanded"),
      readOnly:
        element.readOnly === true ||
        element.getAttribute("aria-readonly") === "true",
      href: element.getAttribute("href"),
      options,
      scope: `${inFrame ? "frame:" + location.href : "top"}${root instanceof ShadowRoot ? "/open-shadow" : ""}`,
      focused: root.activeElement === element,
    };
  }, role);
}

async function observe() {
  pendingDialog();
  const before = await currentMarker();
  const shape = {
    pptrPage: page,
    uniqueBackendNodeIdToMcpId: new Map(),
    extraHandles: [],
  };
  const snapshot = await TextSnapshot.create(shape, { devtoolsData: {} });
  let structureNodes = 0;
  const boundedNode = (node) => {
    structureNodes++;
    const children = [];
    for (const child of node.children ?? []) {
      if (structureNodes >= 200) break;
      children.push(boundedNode(child));
    }
    const bounded = { children };
    for (const key of [
      "id",
      "role",
      "name",
      "value",
      "description",
      "checked",
      "selected",
      "expanded",
      "disabled",
      "focused",
      "level",
    ]) {
      const value = node[key];
      if (typeof value === "string") bounded[key] = value.slice(0, 200);
      else if (typeof value === "number" || typeof value === "boolean")
        bounded[key] = value;
    }
    return bounded;
  };
  const structure = new SnapshotFormatter({
    ...snapshot,
    root: boundedNode(snapshot.root),
  })
    .toString()
    .slice(0, 3200);
  const actions = [];
  const nextMap = new Map();
  let omitted = 0;
  let scannedNodes = 0;
  const walk = async (node, ancestors) => {
    if (++scannedNodes > MAX_AX_NODES || actions.length >= MAX_ACTIONS) {
      omitted++;
      return;
    }
    const path =
      STRUCTURE_ROLES.has(node.role) && node.name
        ? [
            ...ancestors,
            `${node.role} ${String(node.name).slice(0, 60)}`,
          ].slice(-2)
        : ancestors;
    if (
      ACTION_ROLES.has(node.role) &&
      typeof node.elementHandle === "function"
    ) {
      let handle;
      try {
        handle = await node.elementHandle();
      } catch {
        /* stale AX node */
      }
      if (handle) {
        let state;
        try {
          state = await describe(handle, node.role);
        } catch {
          /* unavailable scope */
        }
        if (state) {
          const add = (kind, suffix = "", value) => {
            if (actions.length >= MAX_ACTIONS) {
              omitted++;
              return;
            }
            const id = `e${actions.length + 1}`;
            const action = {
              id,
              node: `${node.loaderId ?? ""}:${node.backendNodeId ?? node.id}`,
              kind,
              role: node.role,
              label: `${path.length ? path.join(" > ") + " > " : ""}${String(node.name || state.label || node.role).slice(0, 120)}${suffix}`,
              value: value ?? state.value,
              scope: state.scope,
              ...(kind === "select" ? { current_value: state.value } : {}),
              ...(state.checked != null ? { checked: state.checked } : {}),
              ...(state.selected != null ? { selected: state.selected } : {}),
              ...(state.expanded != null ? { expanded: state.expanded } : {}),
            };
            actions.push(action);
            nextMap.set(id, { handle, state, kind, value });
          };
          if (state.tag === "SELECT") {
            for (const option of state.options)
              add("select", ` → ${option.label}`, option.value);
          } else {
            const editable =
              !state.readOnly &&
              (EDITABLE_ROLES.has(node.role) ||
                (node.role === "combobox" &&
                  ["INPUT", "TEXTAREA"].includes(state.tag)));
            add(editable ? "fill" : "click");
            if (editable) add("click", " (open or focus)");
            if (
              state.focused &&
              ["combobox", "searchbox", "textbox"].includes(node.role)
            )
              add("key", " (press Enter)", "Enter");
          }
        }
      }
    }
    for (const child of node.children ?? []) await walk(child, path);
  };
  await walk(snapshot.root, []);
  const scroll = await page.evaluate(() => ({
    y: scrollY,
    height: document.documentElement.scrollHeight,
    viewport: innerHeight,
  }));
  if (scroll.y + scroll.viewport < scroll.height - 2)
    actions.push({
      id: "scroll_down",
      kind: "scroll",
      label: "Scroll down to explore",
      delta: 560,
    });
  if (scroll.y > 0)
    actions.push({
      id: "scroll_up",
      kind: "scroll",
      label: "Scroll up to explore",
      delta: -560,
    });
  actions.push({
    id: "wait",
    kind: "wait",
    label: "Wait for the page to update",
  });
  const visible = await visibleText();
  const url = page.url();
  const title = await page.title();
  const after = await currentMarker();
  if (before !== after)
    fail("StalePage", "Page changed during semantic observation");
  marker = after;
  revision++;
  actionMap = nextMap;
  const text = (
    `Visible viewport content:\n${visible.text.slice(0, 3000)}\n` +
    (visible.omittedFrames
      ? `[${visible.omittedFrames} same-origin frame(s) omitted from visible evidence because embedding visibility was not established]\n`
      : "") +
    `Document accessibility structure (may include offscreen content):\n${structure.slice(0, 2800)}`
  ).slice(0, 6000);
  return {
    url,
    title,
    text,
    visible_text: visible.text,
    visible_frame_omissions: visible.omittedFrames,
    actions,
    scroll,
    omitted_actions: omitted,
    fingerprint: hash([url, title, text, actions, scroll]),
    marker: String(revision),
  };
}

async function fresh(request) {
  pendingDialog();
  if (request.marker !== String(revision) || marker !== (await currentMarker()))
    return false;
  if (!request.actionId) return true;
  if (["scroll_down", "scroll_up", "wait"].includes(request.actionId))
    return true;
  const entry = actionMap.get(request.actionId);
  if (!entry) return false;
  try {
    const current = await describe(entry.handle, entry.state.role);
    return current !== null && hash(current) === hash(entry.state);
  } catch {
    return false;
  }
}

async function act(request) {
  if (!(await fresh({ marker: request.marker, actionId: request.action.id }))) {
    fail("StalePage", "Observed target or page changed before input");
  }
  const action = request.action;
  if (action.kind === "wait") {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { executed: action.id };
  }
  if (action.kind === "scroll") {
    if (!["scroll_down", "scroll_up"].includes(action.id))
      fail("StalePage", "Unknown scroll candidate");
    await page.mouse.wheel({ deltaY: action.delta });
    await new Promise((resolve) => setTimeout(resolve, 120));
    return { executed: action.id };
  }
  const entry = actionMap.get(action.id);
  if (!entry || entry.kind !== action.kind)
    fail("StalePage", "Unknown observed candidate");
  const settle = new WaitForHelper(page, 1, 1);
  try {
    await settle.waitForEventsAfterAction(
      async () => {
        if (action.kind === "click") await entry.handle.asLocator().click();
        else if (action.kind === "fill") {
          if (typeof request.text !== "string")
            fail("InputError", "Native text helper returned no string");
          await entry.handle.asLocator().fill(request.text);
        } else if (action.kind === "select") {
          const selected = await entry.handle.select(entry.value);
          if (!selected.includes(entry.value))
            fail("InputError", "Selected option was not confirmed");
        } else if (
          action.kind === "key" &&
          entry.value === "Enter" &&
          entry.state.focused
        ) {
          await page.keyboard.press("Enter");
        } else fail("InputError", "Unsupported observed action kind");
      },
      { timeout: 3000 },
    );
  } catch (error) {
    pendingDialog();
    throw error;
  }
  pendingDialog();
  return { executed: action.id };
}

async function dispatch(request) {
  if (stopping) fail("Stopped", "Browser worker is stopping");
  if (request.operation === "init") return init(request);
  if (!page) fail("AdmissionError", "Browser target was not admitted");
  if (request.operation === "observe") return observe();
  if (request.operation === "fresh") return fresh(request);
  if (request.operation === "act") return act(request);
  if (request.operation === "release") {
    await shutdown();
    return { disconnected: true };
  }
  fail("InputError", "Unknown private browser operation");
}

// Narrow offline seam: tests supply one selected Puppeteer-page-shaped external
// dependency while running this module's real observation/freshness/action code.
export function installSelectedPageForTest(selectedPage) {
  page = selectedPage;
  dialog = undefined;
  marker = undefined;
  revision = 0;
  actionMap = new Map();
  stopping = false;
  page.on("dialog", (value) => {
    dialog = value;
  });
}

export {
  observe,
  fresh,
  act,
  frameState,
  frameEmbeddingVisible,
  visibleText,
  armExactTargetDialogEvents,
};

function stopFromParent() {
  // If an in-flight locator never settles after disconnection, parent loss
  // still cannot leave an idle worker behind.
  setTimeout(() => process.exit(0), 1200).unref();
  void shutdown().finally(() => {
    process.exitCode = 0;
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const input = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });
  input.on("line", (line) => {
    queue = queue
      .then(async () => {
        if (line.length > MAX_LINE)
          fail("InputError", "Private browser request is oversized");
        let reply;
        try {
          const request = JSON.parse(line);
          reply = { id: request.id, ok: true, result: await dispatch(request) };
        } catch (error) {
          reply = {
            id: (() => {
              try {
                return JSON.parse(line).id;
              } catch {
                return null;
              }
            })(),
            ok: false,
            error: {
              type: error.code || error.name || "BrowserError",
              message: String(error.message || error).slice(0, 512),
            },
          };
        }
        if (!stopping || reply.result?.disconnected)
          process.stdout.write(`${JSON.stringify(reply)}\n`);
      })
      .catch(() => {
        void shutdown();
      });
  });
  input.on("close", stopFromParent);
  process.on("SIGTERM", stopFromParent);
}
