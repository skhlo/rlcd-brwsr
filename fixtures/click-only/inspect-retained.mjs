const endpoint = process.env.RLCD_ACCEPTANCE_CDP_URL;
const targetId = process.env.RLCD_ACCEPTANCE_TARGET_ID;

if (!endpoint) throw new Error("RLCD_ACCEPTANCE_CDP_URL is required");
if (!targetId) throw new Error("RLCD_ACCEPTANCE_TARGET_ID is required");

const base = new URL(endpoint);
const endpointHost = base.hostname.replace(/^\[|\]$/g, "");
if (
  base.protocol !== "http:" ||
  !["127.0.0.1", "::1", "localhost"].includes(endpointHost) ||
  base.username ||
  base.password
) {
  throw new Error("RLCD_ACCEPTANCE_CDP_URL must be a loopback HTTP endpoint");
}

const response = await fetch(new URL("/json/list", base));
if (!response.ok)
  throw new Error(`/json/list returned HTTP ${response.status}`);
const targets = await response.json();
const target = targets.find(
  (entry) =>
    entry.type === "page" &&
    entry.id === targetId &&
    entry.webSocketDebuggerUrl,
);
if (!target) throw new Error(`retained target ${targetId} was not found`);

const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const opened = new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener(
    "error",
    () => reject(new Error("CDP WebSocket failed")),
    { once: true },
  );
});
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result ?? {});
});

async function call(method, params = {}) {
  await opened;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

try {
  const evaluated = await call("Runtime.evaluate", {
    expression: `JSON.stringify({
      url: location.href,
      title: document.title,
      marker: document.body?.innerText?.includes("Acceptance marker: ORBIT-27") ?? false
    })`,
    returnByValue: true,
  });
  const observed = JSON.parse(evaluated.result?.value ?? "{}");
  if (
    observed.url !== "http://127.0.0.1:43113/destination.html" ||
    observed.marker !== true
  ) {
    throw new Error(
      `retained target did not show the expected destination: ${JSON.stringify(observed)}`,
    );
  }
  console.log(
    JSON.stringify(
      {
        observer: "independent direct Chrome CDP after tool return",
        targetId,
        ...observed,
        targetLeftOpen: true,
      },
      null,
      2,
    ),
  );
} finally {
  socket.close();
}
