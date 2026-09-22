import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
import { access, constants } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

const DEFAULT_MAX_SECONDS = 30;
const MAX_SECONDS = 120;
const MAX_URL_CHARS = 2_048;
const MAX_GOAL_CHARS = 24_000;
const STOP_GRACE_MS = 1_500;
const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const pythonExecutable = resolve(projectRoot, ".venv", "bin", "python");
const runnerExecutable = resolve(projectRoot, "bridge", "rlcd_brwsr_bridge.py");
const runtimeConfig = loadRuntimeConfig();

interface RuntimeConfig {
  jevModel: string;
  textModelBaseUrl: string;
  textModel: string;
  textModelReasoning: string;
  requestMaxUtf8Bytes: number;
  terminalMaxUtf8Bytes: number;
}

function loadRuntimeConfig(): RuntimeConfig {
  const path = resolve(projectRoot, "config", "runtime.json");
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(parsed))
    throw new Error("runtime configuration must be an object");
  const stringFields = [
    "jevModel",
    "textModelBaseUrl",
    "textModel",
    "textModelReasoning",
  ] as const;
  const integerFields = [
    "requestMaxUtf8Bytes",
    "terminalMaxUtf8Bytes",
  ] as const;
  for (const field of stringFields) {
    if (typeof parsed[field] !== "string" || !parsed[field].trim()) {
      throw new Error(`runtime configuration must define ${field}`);
    }
  }
  for (const field of integerFields) {
    if (!Number.isInteger(parsed[field]) || Number(parsed[field]) <= 0) {
      throw new Error(
        `runtime configuration must define positive integer ${field}`,
      );
    }
  }
  return parsed as unknown as RuntimeConfig;
}

export const rlcdBrwsrParameters = Type.Object(
  {
    url: Type.String({
      description: "Absolute HTTP(S) page where the task tab starts",
      maxLength: MAX_URL_CHARS,
    }),
    goal: Type.String({
      description: "Natural-language goal for the bounded fast loop",
      maxLength: MAX_GOAL_CHARS,
    }),
    maxSeconds: Type.Optional(
      Type.Integer({
        description: `Coarse parent stop deadline in seconds (default ${DEFAULT_MAX_SECONDS}, maximum ${MAX_SECONDS})`,
        minimum: 1,
        maximum: MAX_SECONDS,
      }),
    ),
    retainTab: Type.Optional(
      Type.Boolean({
        description:
          "Keep the known task tab only after a normal completion claim",
      }),
    ),
  },
  { additionalProperties: false },
);

export type RlcdRunInput = Static<typeof rlcdBrwsrParameters>;

type StopReason = "cancelled" | "time_budget" | "output_limit";

interface ChildOutcome {
  terminal: Buffer;
  stdoutOverflow: boolean;
  stderrBytes: number;
  firstStop: StopReason | null;
  exitObserved: boolean;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
  spawnError: boolean;
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function invalidInput(params: RlcdRunInput): string | null {
  const raw = params as Record<string, unknown>;
  const allowed = new Set(["url", "goal", "maxSeconds", "retainTab"]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) {
    return "input contains unsupported fields";
  }
  if (typeof params.url !== "string" || params.url.length > MAX_URL_CHARS) {
    return `url must be a string of at most ${MAX_URL_CHARS} characters`;
  }
  try {
    const parsed = new URL(params.url);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return "url must be an absolute HTTP(S) URL without credentials";
    }
  } catch {
    return "url must be an absolute HTTP(S) URL without credentials";
  }
  if (
    typeof params.goal !== "string" ||
    !params.goal.trim() ||
    Array.from(params.goal).length > MAX_GOAL_CHARS
  ) {
    return `goal must be nonempty and at most ${MAX_GOAL_CHARS} characters`;
  }
  if (
    params.maxSeconds !== undefined &&
    (!Number.isInteger(params.maxSeconds) ||
      params.maxSeconds < 1 ||
      params.maxSeconds > MAX_SECONDS)
  ) {
    return `maxSeconds must be an integer from 1 through ${MAX_SECONDS}`;
  }
  if (params.retainTab !== undefined && typeof params.retainTab !== "boolean") {
    return "retainTab must be a boolean";
  }
  return null;
}

function baseResult(
  status: "stopped" | "error",
  stopReason: string,
  execution: "not_started" | "unknown",
  cleanup: "not_created" | "unknown",
  message: string,
): Record<string, unknown> {
  return {
    status,
    stopReason,
    completionClaim: {
      claimed: false,
      requiresIndependentVerification: true,
    },
    execution,
    lastObservation: null,
    history: [],
    models: {
      jev: { configuredModel: runtimeConfig.jevModel },
      textHelper: {
        configuredModel: runtimeConfig.textModel,
        baseUrl: runtimeConfig.textModelBaseUrl,
        reasoning: runtimeConfig.textModelReasoning,
        availability: "unknown",
      },
    },
    usage: {
      records: [],
      limitations: {
        source: "upstream_recorded_only",
        providerAttempts: "unknown",
        providerRetries: "unknown",
        failedCallUsage: "unknown",
        piTopLevelUsage: "omitted",
      },
    },
    targetId: null,
    cleanup: {
      taskTab: cleanup,
      bridgeProcess: execution === "not_started" ? "not_started" : "unknown",
      sharedDaemon: "retained",
    },
    diagnostic: { type: "SupervisorError", message },
    output: {
      byteLimit: runtimeConfig.terminalMaxUtf8Bytes,
      clipped: false,
      omissions: [],
    },
  };
}

function asToolResult(details: Record<string, unknown>): ToolResult {
  let text = JSON.stringify(details);
  if (utf8Bytes(text) > runtimeConfig.terminalMaxUtf8Bytes) {
    details = baseResult(
      "error",
      "output_limit",
      "unknown",
      "unknown",
      "Terminal result exceeded its configured byte limit",
    );
    const output = details.output;
    if (isRecord(output)) {
      output.clipped = true;
      output.omissions = ["child terminal result"];
    }
    text = JSON.stringify(details);
  }
  return { content: [{ type: "text", text }], details };
}

function requestStopResult(reason: "cancelled" | "time_budget"): ToolResult {
  return asToolResult(
    baseResult(
      "stopped",
      reason,
      "not_started",
      "not_created",
      reason === "cancelled"
        ? "Pi cancelled before runner startup"
        : "The wall deadline expired before runner startup",
    ),
  );
}

function waitForChild(
  child: ChildProcessWithoutNullStreams,
  serializedRequest: string,
  deadlineAt: number,
  signal: AbortSignal | undefined,
): Promise<ChildOutcome> {
  return new Promise((resolvePromise) => {
    const chunks: Buffer[] = [];
    let retainedStdoutBytes = 0;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let firstStop: StopReason | null = null;
    let exitObserved = false;
    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;
    let spawnError = false;
    let hardStopTimer: NodeJS.Timeout | undefined;

    const requestStop = (reason: StopReason) => {
      if (firstStop !== null) return;
      firstStop = reason;
      if (exitObserved || child.pid === undefined) return;
      try {
        child.kill("SIGTERM");
      } catch {
        // Exit observation, not signal delivery, decides whether escalation runs.
      }
      hardStopTimer = setTimeout(() => {
        if (exitObserved) return;
        try {
          child.kill("SIGKILL");
        } catch {
          // The exit/close events remain the only termination evidence.
        }
      }, STOP_GRACE_MS);
    };

    const onAbort = () => requestStop("cancelled");
    signal?.addEventListener("abort", onAbort, { once: true });
    const deadlineTimer = setTimeout(
      () => requestStop("time_budget"),
      Math.max(0, deadlineAt - Date.now()),
    );

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      const remaining =
        runtimeConfig.terminalMaxUtf8Bytes + 1 - retainedStdoutBytes;
      if (remaining > 0) {
        const retained = chunk.subarray(0, remaining);
        chunks.push(retained);
        retainedStdoutBytes += retained.length;
      }
      if (stdoutBytes > runtimeConfig.terminalMaxUtf8Bytes) {
        requestStop("output_limit");
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
    });
    child.on("error", () => {
      spawnError = true;
    });
    child.on("exit", (code, childSignal) => {
      exitObserved = true;
      exitCode = code;
      exitSignal = childSignal;
      if (hardStopTimer) clearTimeout(hardStopTimer);
    });
    child.on("close", () => {
      if (child.pid !== undefined && !exitObserved) return;
      clearTimeout(deadlineTimer);
      if (hardStopTimer) clearTimeout(hardStopTimer);
      signal?.removeEventListener("abort", onAbort);
      resolvePromise({
        terminal: Buffer.concat(chunks),
        stdoutOverflow: stdoutBytes > runtimeConfig.terminalMaxUtf8Bytes,
        stderrBytes,
        firstStop,
        exitObserved,
        exitCode,
        exitSignal,
        spawnError,
      });
    });

    child.stdin.on("error", () => {
      // EPIPE is represented by the missing/invalid terminal result after exit.
    });
    child.stdin.end(serializedRequest, "utf8");

    // A pre-aborted signal does not reliably dispatch a newly added listener.
    if (signal?.aborted) onAbort();
  });
}

function parseTerminal(outcome: ChildOutcome): Record<string, unknown> | null {
  if (
    outcome.stdoutOverflow ||
    !outcome.exitObserved ||
    outcome.spawnError ||
    outcome.terminal.length === 0
  ) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(outcome.terminal.toString("utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function resultFromOutcome(outcome: ChildOutcome): ToolResult {
  let details = parseTerminal(outcome);
  if (!details) {
    const firstStop = outcome.firstStop;
    const stopped = firstStop === "cancelled" || firstStop === "time_budget";
    details = baseResult(
      stopped ? "stopped" : "error",
      firstStop ??
        (outcome.stdoutOverflow ? "output_limit" : "missing_terminal"),
      "unknown",
      "unknown",
      outcome.stdoutOverflow
        ? "Runner output exceeded the terminal byte limit"
        : "Runner exited without one valid terminal result; raw child output was omitted",
    );
    const cleanup = details.cleanup;
    if (isRecord(cleanup)) {
      cleanup.bridgeProcess = outcome.exitObserved ? "reaped" : "not_started";
    }
    if (outcome.stderrBytes > 0) {
      const output = details.output;
      if (isRecord(output)) {
        output.clipped = true;
        output.omissions = ["raw child stderr"];
      }
    }
    return asToolResult(details);
  }

  const cleanup = details.cleanup;
  if (isRecord(cleanup)) cleanup.bridgeProcess = "reaped";
  if (
    outcome.firstStop === "cancelled" ||
    outcome.firstStop === "time_budget"
  ) {
    details.status = "stopped";
    details.stopReason = outcome.firstStop;
    const claim = details.completionClaim;
    if (isRecord(claim)) claim.claimed = false;
  }
  return asToolResult(details);
}

async function runRegisteredTool(
  params: RlcdRunInput,
  signal: AbortSignal | undefined,
): Promise<ToolResult> {
  const startedAt = Date.now();
  const maxSeconds = params.maxSeconds ?? DEFAULT_MAX_SECONDS;
  const deadlineAt = startedAt + maxSeconds * 1_000;
  const inputError = invalidInput(params);
  if (inputError) {
    return asToolResult(
      baseResult(
        "error",
        "invalid_input",
        "not_started",
        "not_created",
        inputError,
      ),
    );
  }
  if (signal?.aborted) return requestStopResult("cancelled");
  if (Date.now() >= deadlineAt) return requestStopResult("time_budget");

  const input = {
    url: params.url,
    goal: params.goal.trim(),
    maxSeconds,
    retainTab: params.retainTab ?? false,
  };
  const serializedRequest = `${JSON.stringify(input)}\n`;
  if (utf8Bytes(serializedRequest) > runtimeConfig.requestMaxUtf8Bytes) {
    return asToolResult(
      baseResult(
        "error",
        "invalid_input",
        "not_started",
        "not_created",
        `serialized request exceeds ${runtimeConfig.requestMaxUtf8Bytes} UTF-8 bytes`,
      ),
    );
  }

  try {
    await access(pythonExecutable, constants.X_OK);
    await access(runnerExecutable, constants.R_OK);
  } catch {
    if (signal?.aborted) return requestStopResult("cancelled");
    if (Date.now() >= deadlineAt) return requestStopResult("time_budget");
    return asToolResult(
      baseResult(
        "error",
        "setup_error",
        "not_started",
        "not_created",
        "Project runtime is missing; run scripts/setup-runtime.sh",
      ),
    );
  }
  if (signal?.aborted) return requestStopResult("cancelled");
  if (Date.now() >= deadlineAt) return requestStopResult("time_budget");

  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(pythonExecutable, [runnerExecutable], {
      cwd: projectRoot,
      env: { ...process.env },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return asToolResult(
      baseResult(
        "error",
        "setup_error",
        "not_started",
        "not_created",
        "Runner process could not be started",
      ),
    );
  }

  const outcome = await waitForChild(
    child,
    serializedRequest,
    deadlineAt,
    signal,
  );
  return resultFromOutcome(outcome);
}

export default function rlcdBrwsrExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "rlcd_brwsr_run",
    label: "RLCD Browser",
    description: `Run one bounded Jev Ultrafast browser task for the initial benign, unauthenticated, non-booking scope. The parent requests stop after maxSeconds (default ${DEFAULT_MAX_SECONDS}, maximum ${MAX_SECONDS}) but cannot guarantee no action crosses that deadline. retainTab applies only to a normal completion claim. Browser Harness must already have the selected local daemon running. Completion claims require independent verification. Terminal JSON, including escaping, is capped at ${runtimeConfig.terminalMaxUtf8Bytes} UTF-8 bytes; omissions are disclosed. Native usage records are incomplete and are omitted from Pi totals.`,
    promptSnippet:
      "Delegate one already-authorized benign, unauthenticated, non-booking browser task to the bounded fast loop",
    promptGuidelines: [
      "Use rlcd_brwsr_run only for an already-authorized benign, unauthenticated, non-booking browser task, and independently verify every completion claim.",
    ],
    parameters: rlcdBrwsrParameters,
    executionMode: "sequential",
    async execute(_toolCallId, input, signal) {
      return runRegisteredTool(input, signal);
    },
  });
}
