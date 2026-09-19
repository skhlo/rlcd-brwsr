import { spawn } from "node:child_process";

const origin = process.argv[2] ?? "http://127.0.0.1:43113";

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ESRCH")
      return false;
    throw error;
  }
}

async function runCli(args, options = {}) {
  const child = spawn("chrome-devtools", args, {
    shell: false,
    signal: options.signal,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let spawnError;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.on("error", (error) => {
    spawnError = error;
  });
  const closed = await new Promise((resolve) => {
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    pid: child.pid,
    ...closed,
    spawnError: spawnError
      ? {
          name: spawnError.name,
          code: spawnError.code,
          message: spawnError.message,
        }
      : null,
    processRemaining: isRunning(child.pid),
    stdout: stdout.slice(-2_000),
    stderr: stderr.slice(-2_000),
  };
}

const timeout = await runCli([
  "new_page",
  `${origin}/slow?case=timeout`,
  "--timeout",
  "250",
  "--output-format=json",
]);

const controller = new AbortController();
const cancelledPromise = runCli(
  [
    "new_page",
    `${origin}/slow?case=cancelled`,
    "--timeout",
    "30000",
    "--output-format=json",
  ],
  { signal: controller.signal },
);
setTimeout(() => controller.abort(new Error("host-check cancellation")), 150);
const cancelled = await cancelledPromise;

console.log(JSON.stringify({ timeout, cancelled }, null, 2));
if (timeout.processRemaining || cancelled.processRemaining)
  process.exitCode = 1;
