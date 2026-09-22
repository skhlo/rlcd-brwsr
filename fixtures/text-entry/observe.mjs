const endpoint = process.env.RLCD_ACCEPTANCE_CDP_URL;
const taskUrl = "http://127.0.0.1:43113/text-entry.html";
const requestedTargetId = process.env.RLCD_ACCEPTANCE_TARGET_ID;
const timeoutMs = Number.parseInt(
  process.env.RLCD_ACCEPTANCE_OBSERVER_TIMEOUT_MS ?? "120000",
  10,
);
const deadline = Date.now() + timeoutMs;

if (!endpoint) {
  throw new Error("RLCD_ACCEPTANCE_CDP_URL is required");
}
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

async function getJson(path) {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
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
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result ?? {});
  });
  return {
    async call(method, params = {}) {
      await opened;
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

let observed;
let observedTargetId;
let sightings = 0;
let lastError;
while (Date.now() < deadline && !observed) {
  const targets = await getJson("/json/list");
  const target = targets.find(
    (entry) =>
      entry.type === "page" &&
      (!requestedTargetId || entry.id === requestedTargetId) &&
      entry.url.startsWith(taskUrl) &&
      entry.webSocketDebuggerUrl,
  );
  if (!target) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    continue;
  }
  sightings += 1;
  const client = connect(target.webSocketDebuggerUrl);
  try {
    const evaluated = await client.call("Runtime.evaluate", {
      expression: `JSON.stringify({
        url: location.href,
        title: document.title,
        fieldValue: document.querySelector('#destination-city')?.value ?? null,
        marker: document.querySelector('#verification-marker')?.textContent ?? null
      })`,
      returnByValue: true,
    });
    const candidate = JSON.parse(evaluated.result?.value ?? "{}");
    if (
      candidate.fieldValue === "Busan" &&
      typeof candidate.marker === "string" &&
      candidate.marker.includes("Acceptance marker: FIELD-41")
    ) {
      observed = candidate;
      observedTargetId = target.id;
    }
  } catch (error) {
    // The run may replace or close a target between discovery and inspection.
    lastError = error instanceof Error ? error.message : String(error);
  } finally {
    client.close();
  }
  if (!observed) await new Promise((resolve) => setTimeout(resolve, 50));
}

if (!observed) {
  throw new Error(
    `did not observe the generated field value before task cleanup ` +
      `(target sightings: ${sightings}, last error: ${lastError ?? "none"})`,
  );
}
console.log(
  JSON.stringify(
    {
      observer: "independent direct Chrome CDP",
      targetId: observedTargetId,
      ...observed,
      fieldVerified: true,
      markerVerified: true,
      ...(requestedTargetId
        ? { targetLeftForCallerCleanup: true }
        : { targetLeftForRunOwnedCleanup: true }),
    },
    null,
    2,
  ),
);
