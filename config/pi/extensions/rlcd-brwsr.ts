import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

const DEFAULT_MAX_ACTIONS = 6;
const DEFAULT_MAX_SECONDS = 30;
const MAX_ACTIONS = 20;
const MAX_SECONDS = 120;
const MAX_URL_CHARS = 2_048;
const MAX_GOAL_CHARS = 1_200;
const MAX_PROTOCOL_LINE_CHARS = 32_000;
const MAX_PROTOCOL_RECORDS = 128;
const MAX_STDERR_CHARS = 4_000;
const MAX_TOOL_CONTENT_CHARS = 12_000;
const STOP_GRACE_MS = 1_500;
const JEV_MODEL = "jev-1.13.0";
const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const pythonExecutable = resolve(projectRoot, ".venv", "bin", "python");
const bridgeExecutable = resolve(projectRoot, "bridge", "rlcd_brwsr_bridge.py");

export const rlcdBrwsrParameters = Type.Object(
  {
    url: Type.String({
      description: "HTTP(S) page where the owned task tab starts",
      maxLength: MAX_URL_CHARS,
    }),
    goal: Type.String({
      description: "Natural-language goal for the bounded browser run",
      maxLength: MAX_GOAL_CHARS,
    }),
    maxActions: Type.Optional(
      Type.Integer({
        description: `Maximum executed browser actions (default ${DEFAULT_MAX_ACTIONS}, maximum ${MAX_ACTIONS})`,
        minimum: 1,
        maximum: MAX_ACTIONS,
      }),
    ),
    maxSeconds: Type.Optional(
      Type.Integer({
        description: `Wall-clock budget in seconds (default ${DEFAULT_MAX_SECONDS}, maximum ${MAX_SECONDS})`,
        minimum: 1,
        maximum: MAX_SECONDS,
      }),
    ),
  },
  { additionalProperties: false },
);

export type RlcdRunInput = Static<typeof rlcdBrwsrParameters>;

export interface RlcdRunResult {
  status: "completion_claim" | "stopped" | "error";
  stopReason: string;
  completionClaim: {
    claimed: boolean;
    requiresIndependentVerification: true;
  };
  lastObservation: {
    url: string;
    title: string;
    evidence: string;
    evidenceTruncated: boolean;
  } | null;
  trace: Array<Record<string, unknown>>;
  traceTruncated: boolean;
  usage: Record<string, unknown>;
  timing: {
    elapsedMs: number;
    wallBudgetMs: number;
  };
  ownership: {
    targetId: string | null;
    bridgePid: number | null;
    daemon: string | null;
  };
  mutationOutcome: string;
  diagnostic: string | null;
  cleanup: {
    taskTab: string;
    bridgeProcess: "reaped" | "unconfirmed";
    sharedDaemon: "retained";
  };
  modelVisible?: {
    truncated: boolean;
    maxChars: number;
  };
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: RlcdRunResult;
}

interface BridgeRecord {
  type: string;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: string, maximum: number): string {
  return value.length <= maximum ? value : value.slice(0, maximum);
}

function validateInput(value: RlcdRunInput): string | undefined {
  if (typeof value.url !== "string" || !value.url.trim()) {
    return "url must be a non-empty absolute HTTP(S) URL";
  }
  if (value.url.length > MAX_URL_CHARS) {
    return `url must not exceed ${MAX_URL_CHARS} characters`;
  }
  let parsed: URL;
  try {
    parsed = new URL(value.url);
  } catch {
    return "url must be a valid absolute HTTP(S) URL";
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password
  ) {
    return "url must be an absolute HTTP(S) URL without embedded credentials";
  }
  if (typeof value.goal !== "string" || !value.goal.trim()) {
    return "goal must be a non-empty string";
  }
  if (value.goal.length > MAX_GOAL_CHARS) {
    return `goal must not exceed ${MAX_GOAL_CHARS} characters`;
  }
  const maxActions = value.maxActions ?? DEFAULT_MAX_ACTIONS;
  if (
    !Number.isInteger(maxActions) ||
    maxActions < 1 ||
    maxActions > MAX_ACTIONS
  ) {
    return `maxActions must be an integer from 1 through ${MAX_ACTIONS}`;
  }
  const maxSeconds = value.maxSeconds ?? DEFAULT_MAX_SECONDS;
  if (
    !Number.isInteger(maxSeconds) ||
    maxSeconds < 1 ||
    maxSeconds > MAX_SECONDS
  ) {
    return `maxSeconds must be an integer from 1 through ${MAX_SECONDS}`;
  }
  return undefined;
}

function basicResult(
  stopReason: string,
  diagnostic: string,
  elapsedMs: number,
  maxSeconds: number,
  daemon: string | null,
  status: RlcdRunResult["status"] = "error",
): RlcdRunResult {
  return {
    status,
    stopReason,
    completionClaim: {
      claimed: false,
      requiresIndependentVerification: true,
    },
    lastObservation: null,
    trace: [],
    traceTruncated: false,
    usage: {
      jev: {
        decisions: [],
        providerHttpAttempts: "unavailable",
        providerCost: "unavailable",
      },
      textHelper: {
        configured: Boolean(process.env.TEXT_MODEL_API_KEY?.trim()),
        calls: [],
        providerHttpAttempts: "unavailable",
        providerCost: "unavailable",
      },
    },
    timing: { elapsedMs, wallBudgetMs: maxSeconds * 1_000 },
    ownership: { targetId: null, bridgePid: null, daemon },
    mutationOutcome: "not_in_flight",
    diagnostic,
    cleanup: {
      taskTab: "not_created",
      bridgeProcess: "reaped",
      sharedDaemon: "retained",
    },
  };
}

function knownCredentials(): string[] {
  return [process.env.TYPESAFE_API_KEY, process.env.TEXT_MODEL_API_KEY].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

function redactText(value: string, credentials: readonly string[]): string {
  let redacted = value;
  for (const credential of credentials) {
    redacted = redacted.split(credential).join("[REDACTED]");
  }
  return redacted.replaceAll(
    /\b(?:Bearer|Authorization:)\s+[A-Za-z0-9._~+\-/=]{8,}/gi,
    "[REDACTED]",
  );
}

function sanitize(value: unknown, credentials: readonly string[]): unknown {
  if (typeof value === "string") return redactText(value, credentials);
  if (Array.isArray(value))
    return value.map((item) => sanitize(item, credentials));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sanitize(item, credentials),
    ]),
  );
}

function normalizedBridgeResult(value: unknown): RlcdRunResult | undefined {
  if (!isRecord(value)) return undefined;
  if (
    !["completion_claim", "stopped", "error"].includes(String(value.status)) ||
    typeof value.stopReason !== "string" ||
    !isRecord(value.completionClaim) ||
    typeof value.completionClaim.claimed !== "boolean" ||
    value.completionClaim.requiresIndependentVerification !== true ||
    !Array.isArray(value.trace) ||
    !isRecord(value.usage) ||
    !isRecord(value.timing) ||
    typeof value.timing.elapsedMs !== "number" ||
    typeof value.timing.wallBudgetMs !== "number" ||
    !isRecord(value.ownership) ||
    !isRecord(value.cleanup)
  ) {
    return undefined;
  }
  return value as unknown as RlcdRunResult;
}

function toolContent(result: RlcdRunResult): string {
  let serialized = JSON.stringify(result, null, 2);
  if (serialized.length <= MAX_TOOL_CONTENT_CHARS) return serialized;

  const compact: RlcdRunResult = {
    ...result,
    lastObservation:
      result.lastObservation === null
        ? null
        : {
            ...result.lastObservation,
            evidence: boundedText(result.lastObservation.evidence, 1_000),
            evidenceTruncated: true,
          },
    trace: result.trace.slice(-8),
    traceTruncated: true,
    diagnostic:
      result.diagnostic === null ? null : boundedText(result.diagnostic, 300),
    modelVisible: { truncated: true, maxChars: MAX_TOOL_CONTENT_CHARS },
  };
  serialized = JSON.stringify(compact, null, 2);
  if (serialized.length <= MAX_TOOL_CONTENT_CHARS) return serialized;

  return JSON.stringify(
    {
      status: compact.status,
      stopReason: compact.stopReason,
      completionClaim: compact.completionClaim,
      lastObservation: compact.lastObservation,
      trace: compact.trace.slice(-3),
      timing: compact.timing,
      ownership: compact.ownership,
      mutationOutcome: compact.mutationOutcome,
      diagnostic: compact.diagnostic,
      cleanup: compact.cleanup,
      modelVisible: compact.modelVisible,
    },
    null,
    2,
  );
}

function asToolResult(result: RlcdRunResult): ToolResult {
  return {
    content: [{ type: "text", text: toolContent(result) }],
    details: result,
  };
}

async function waitForBridge(
  child: ChildProcessWithoutNullStreams,
  input: Required<RlcdRunInput>,
  signal: AbortSignal | undefined,
  onUpdate: ((result: ToolResult) => void) | undefined,
  startedAt: number,
  daemon: string,
): Promise<RlcdRunResult> {
  const credentials = knownCredentials();
  let stdoutBuffer = "";
  let stderr = "";
  let protocolError: string | undefined;
  let terminal: RlcdRunResult | undefined;
  let recordCount = 0;
  let requestedStop: "cancelled" | "time_budget" | undefined;
  let forced = false;
  let graceTimer: NodeJS.Timeout | undefined;

  const requestStop = (reason: "cancelled" | "time_budget") => {
    if (requestedStop) return;
    requestedStop = reason;
    child.kill("SIGTERM");
    graceTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        forced = true;
        child.kill("SIGKILL");
      }
    }, STOP_GRACE_MS);
    graceTimer.unref();
  };

  const onAbort = () => requestStop("cancelled");
  signal?.addEventListener("abort", onAbort, { once: true });
  const deadline = setTimeout(
    () => requestStop("time_budget"),
    input.maxSeconds * 1_000,
  );
  deadline.unref();

  const handleLine = (rawLine: string) => {
    if (!rawLine) return;
    recordCount += 1;
    if (recordCount > MAX_PROTOCOL_RECORDS) {
      protocolError = `bridge emitted more than ${MAX_PROTOCOL_RECORDS} records`;
      requestStop("cancelled");
      return;
    }
    if (rawLine.length > MAX_PROTOCOL_LINE_CHARS) {
      protocolError = `bridge emitted a line longer than ${MAX_PROTOCOL_LINE_CHARS} characters`;
      requestStop("cancelled");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawLine) as unknown;
    } catch {
      protocolError = "bridge stdout contained a non-JSON protocol line";
      requestStop("cancelled");
      return;
    }
    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      protocolError = "bridge emitted an invalid protocol record";
      requestStop("cancelled");
      return;
    }
    const record = parsed as BridgeRecord;
    if (record.type === "result") {
      terminal = normalizedBridgeResult(record.result);
      if (!terminal)
        protocolError = "bridge emitted an invalid terminal result";
      return;
    }
    if (!["ready", "ownership", "progress"].includes(record.type)) {
      protocolError = `bridge emitted unknown record type ${JSON.stringify(record.type)}`;
      requestStop("cancelled");
      return;
    }
    const safeRecord = sanitize(record, credentials);
    onUpdate?.({
      content: [
        {
          type: "text",
          text: boundedText(JSON.stringify(safeRecord), 2_000),
        },
      ],
      details: basicResult(
        "running",
        "Bridge run in progress",
        Date.now() - startedAt,
        input.maxSeconds,
        daemon,
        "stopped",
      ),
    });
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    let newline = stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      handleLine(stdoutBuffer.slice(0, newline));
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      newline = stdoutBuffer.indexOf("\n");
    }
    if (stdoutBuffer.length > MAX_PROTOCOL_LINE_CHARS) {
      protocolError = `bridge emitted a line longer than ${MAX_PROTOCOL_LINE_CHARS} characters`;
      requestStop("cancelled");
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = boundedText(stderr + chunk, MAX_STDERR_CHARS);
  });

  const closed = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    spawnError?: Error;
  }>((resolveClose) => {
    let spawnError: Error | undefined;
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code, closeSignal) => {
      resolveClose({
        code,
        signal: closeSignal,
        ...(spawnError ? { spawnError } : {}),
      });
    });
  });

  clearTimeout(deadline);
  if (graceTimer) clearTimeout(graceTimer);
  signal?.removeEventListener("abort", onAbort);
  if (stdoutBuffer.trim()) handleLine(stdoutBuffer.trim());

  const elapsed = Date.now() - startedAt;
  if (protocolError) {
    return basicResult(
      "protocol_error",
      protocolError,
      elapsed,
      input.maxSeconds,
      daemon,
    );
  }
  if (!terminal) {
    const diagnostic = closed.spawnError
      ? `bridge could not start: ${closed.spawnError.message}`
      : `bridge exited without a terminal result (code ${String(closed.code)}, signal ${String(closed.signal)})`;
    const result = basicResult(
      requestedStop ?? "bridge_error",
      diagnostic,
      elapsed,
      input.maxSeconds,
      daemon,
      requestedStop ? "stopped" : "error",
    );
    result.cleanup.bridgeProcess = "reaped";
    result.cleanup.taskTab = forced ? "unconfirmed" : "not_created";
    return result;
  }

  const safeTerminal = sanitize(terminal, credentials) as RlcdRunResult;
  safeTerminal.cleanup = {
    taskTab: safeTerminal.cleanup.taskTab,
    bridgeProcess: "reaped",
    sharedDaemon: "retained",
  };
  if (requestedStop) {
    safeTerminal.status = "stopped";
    safeTerminal.stopReason = requestedStop;
    safeTerminal.completionClaim.claimed = false;
    if (forced) safeTerminal.cleanup.taskTab = "unconfirmed";
  }
  const safeStderr = redactText(stderr.trim(), credentials);
  if (safeStderr) {
    safeTerminal.diagnostic = boundedText(
      safeTerminal.diagnostic
        ? `${safeTerminal.diagnostic}; stderr: ${safeStderr}`
        : `stderr: ${safeStderr}`,
      MAX_STDERR_CHARS,
    );
  }
  return safeTerminal;
}

async function runRegisteredTool(
  params: RlcdRunInput,
  signal: AbortSignal | undefined,
  onUpdate: ((result: ToolResult) => void) | undefined,
): Promise<ToolResult> {
  const startedAt = Date.now();
  const maxSeconds = params.maxSeconds ?? DEFAULT_MAX_SECONDS;
  const daemon = process.env.RLCD_BRWSR_DAEMON?.trim() || null;
  const inputError = validateInput(params);
  if (inputError) {
    return asToolResult(
      basicResult(
        "invalid_input",
        inputError,
        Date.now() - startedAt,
        maxSeconds,
        daemon,
      ),
    );
  }
  if (signal?.aborted) {
    return asToolResult(
      basicResult(
        "cancelled",
        "Pi cancelled before bridge startup",
        Date.now() - startedAt,
        maxSeconds,
        daemon,
        "stopped",
      ),
    );
  }
  if (!daemon) {
    return asToolResult(
      basicResult(
        "setup_error",
        "Set RLCD_BRWSR_DAEMON to the exact provisioned Browser Harness daemon name",
        Date.now() - startedAt,
        maxSeconds,
        null,
      ),
    );
  }
  if (!process.env.TYPESAFE_API_KEY?.trim()) {
    return asToolResult(
      basicResult(
        "setup_error",
        "TYPESAFE_API_KEY is not configured; no browser or model work started",
        Date.now() - startedAt,
        maxSeconds,
        daemon,
      ),
    );
  }
  try {
    await access(pythonExecutable, constants.X_OK);
    await access(bridgeExecutable, constants.R_OK);
  } catch {
    return asToolResult(
      basicResult(
        "setup_error",
        "Project runtime is missing. Run `uv sync --frozen` in the RLCD-brwsr checkout",
        Date.now() - startedAt,
        maxSeconds,
        daemon,
      ),
    );
  }

  const input: Required<RlcdRunInput> = {
    url: params.url,
    goal: params.goal.trim(),
    maxActions: params.maxActions ?? DEFAULT_MAX_ACTIONS,
    maxSeconds,
  };
  const child = spawn(pythonExecutable, [bridgeExecutable], {
    cwd: projectRoot,
    env: {
      ...process.env,
      BU_NAME: daemon,
      RLCD_BRWSR_DAEMON: daemon,
      TYPESAFE_MODEL: JEV_MODEL,
    },
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end(`${JSON.stringify(input)}\n`);
  return asToolResult(
    await waitForBridge(child, input, signal, onUpdate, startedAt, daemon),
  );
}

export default function rlcdBrwsrExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "rlcd_brwsr_run",
    label: "RLCD Browser",
    description: `Run one bounded Jev Ultrafast browser task in an owned tab. Defaults: ${DEFAULT_MAX_ACTIONS} executed actions and ${DEFAULT_MAX_SECONDS} seconds; maxima: ${MAX_ACTIONS} actions and ${MAX_SECONDS} seconds. The tool requires an exact configured existing Browser Harness daemon, preserves the shared daemon and unrelated tabs, and returns a completion claim that requires independent verification. Output is bounded to ${MAX_TOOL_CONTENT_CHARS} model-visible characters.`,
    promptSnippet:
      "Delegate one already-authorized benign browser task to the bounded Jev Ultrafast loop",
    promptGuidelines: [
      "Use rlcd_brwsr_run only for an already-authorized benign browser task, and independently verify every completion claim.",
    ],
    parameters: rlcdBrwsrParameters,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, onUpdate) {
      return runRegisteredTool(params, signal, onUpdate);
    },
  });
}
