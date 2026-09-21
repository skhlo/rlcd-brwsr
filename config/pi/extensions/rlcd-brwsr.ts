import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
import { access, constants } from "node:fs/promises";
import { isIP } from "node:net";
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
const MAX_STDERR_CHARS = 4_000;
const MAX_TOOL_CONTENT_CHARS = 12_000;
const STOP_GRACE_MS = 1_500;
const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const runtimeConfig = loadRuntimeConfig();
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

type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type Measurement = number | "unavailable";

interface Observation {
  url: string;
  title: string;
  evidence: string;
  evidenceTruncated: boolean;
}

interface TraceEntry {
  step: number;
  operation: string;
  action: string;
  outcome: string;
  elapsedMs: number;
  url?: string;
}

interface ModelMeasurement {
  reportedModel: string;
  field?: string;
  latencyMs: Measurement;
  usage: JsonValue;
}

interface Usage {
  jev: {
    configuredModel: string;
    decisions: ModelMeasurement[];
    decisionsTruncated?: boolean;
    providerHttpAttempts: Measurement;
    providerCost: Measurement;
  };
  textHelper: {
    configured: boolean;
    configuredModel: string | null;
    calls: ModelMeasurement[];
    callsTruncated?: boolean;
    providerHttpAttempts: Measurement;
    providerCost: Measurement;
  };
}

export interface RlcdRunResult {
  status: "completion_claim" | "stopped" | "error";
  stopReason: string;
  completionClaim: {
    claimed: boolean;
    requiresIndependentVerification: true;
  };
  lastObservation: Observation | null;
  trace: TraceEntry[];
  traceTruncated: boolean;
  usage: Usage;
  timing: {
    elapsedMs: number;
    wallBudgetMs: number;
  };
  ownership: {
    targetId: string | null;
    bridgePid: number | null;
    daemon: string | null;
  };
  mutationOutcome: "not_in_flight" | "unknown";
  diagnostic: string | null;
  cleanup: {
    taskTab: "not_created" | "closed" | "unconfirmed";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadRuntimeConfig(): { jevModel: string } {
  const path = resolve(projectRoot, "config", "runtime.json");
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read runtime configuration at ${path}`, {
      cause: error,
    });
  }
  if (
    !isRecord(value) ||
    typeof value.jevModel !== "string" ||
    !value.jevModel
  ) {
    throw new Error("Runtime configuration must define a non-empty jevModel");
  }
  return { jevModel: value.jevModel };
}

function boundedText(value: string, maximum: number): string {
  return value.length <= maximum ? value : value.slice(0, maximum);
}

function localHttpHelperHost(hostname: string): boolean {
  const address = hostname.replace(/^\[|\]$/g, "");
  if (address === "localhost" || address === "::1") return true;
  return isIP(address) === 4 && address.startsWith("127.");
}

function configuredTextHelper(): {
  configured: boolean;
  configuredModel: string | null;
} {
  const key = process.env.TEXT_MODEL_API_KEY;
  const baseUrl = process.env.TEXT_MODEL_BASE_URL;
  const model = process.env.TEXT_MODEL;
  if (![key, baseUrl, model].every((value) => value?.trim())) {
    return { configured: false, configuredModel: null };
  }
  if ([key, baseUrl, model].some((value) => value !== value?.trim())) {
    return { configured: false, configuredModel: null };
  }
  try {
    const parsed = new URL(baseUrl as string);
    const allowedTransport =
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" && localHttpHelperHost(parsed.hostname));
    if (
      !allowedTransport ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return { configured: false, configuredModel: null };
    }
  } catch {
    return { configured: false, configuredModel: null };
  }
  return { configured: true, configuredModel: model as string };
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
  const textHelper = configuredTextHelper();
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
        configuredModel: runtimeConfig.jevModel,
        decisions: [],
        providerHttpAttempts: "unavailable",
        providerCost: "unavailable",
      },
      textHelper: {
        configured: textHelper.configured,
        configuredModel: textHelper.configuredModel,
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

function sanitizedJson(
  value: unknown,
  credentials: readonly string[],
): JsonValue | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return redactText(value, credentials);
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const output: JsonValue[] = [];
    for (const item of value) {
      const sanitized = sanitizedJson(item, credentials);
      if (sanitized === undefined) return undefined;
      output.push(sanitized);
    }
    return output;
  }
  if (!isRecord(value)) return undefined;
  const output: { [key: string]: JsonValue } = {};
  for (const [key, item] of Object.entries(value)) {
    const sanitized = sanitizedJson(item, credentials);
    if (sanitized === undefined) return undefined;
    output[key] = sanitized;
  }
  return output;
}

function isNonnegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizedObservation(
  value: unknown,
  credentials: readonly string[],
): Observation | null | undefined {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.url !== "string" ||
    typeof value.title !== "string" ||
    typeof value.evidence !== "string" ||
    typeof value.evidenceTruncated !== "boolean"
  ) {
    return undefined;
  }
  return {
    url: redactText(value.url, credentials),
    title: redactText(value.title, credentials),
    evidence: redactText(value.evidence, credentials),
    evidenceTruncated: value.evidenceTruncated,
  };
}

function normalizedTraceEntry(
  value: unknown,
  credentials: readonly string[],
): TraceEntry | undefined {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.step) ||
    !isNonnegativeFinite(value.step) ||
    typeof value.operation !== "string" ||
    typeof value.action !== "string" ||
    typeof value.outcome !== "string" ||
    !isNonnegativeFinite(value.elapsedMs) ||
    (value.url !== undefined && typeof value.url !== "string")
  ) {
    return undefined;
  }
  return {
    step: value.step,
    operation: redactText(value.operation, credentials),
    action: redactText(value.action, credentials),
    outcome: redactText(value.outcome, credentials),
    elapsedMs: value.elapsedMs,
    ...(typeof value.url === "string"
      ? { url: redactText(value.url, credentials) }
      : {}),
  };
}

function normalizedMeasurement(value: unknown): Measurement | undefined {
  return value === "unavailable" || isNonnegativeFinite(value)
    ? value
    : undefined;
}

function normalizedModelMeasurements(
  value: unknown,
  credentials: readonly string[],
): ModelMeasurement[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const output: ModelMeasurement[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.reportedModel !== "string" ||
      (item.field !== undefined && typeof item.field !== "string") ||
      (item.latencyMs !== "unavailable" && !isNonnegativeFinite(item.latencyMs))
    ) {
      return undefined;
    }
    const usage = sanitizedJson(item.usage, credentials);
    if (usage === undefined) return undefined;
    output.push({
      reportedModel: redactText(item.reportedModel, credentials),
      ...(typeof item.field === "string"
        ? { field: redactText(item.field, credentials) }
        : {}),
      latencyMs: item.latencyMs,
      usage,
    });
  }
  return output;
}

function normalizedUsage(
  value: unknown,
  credentials: readonly string[],
): Usage | undefined {
  if (!isRecord(value) || !isRecord(value.jev) || !isRecord(value.textHelper)) {
    return undefined;
  }
  const decisions = normalizedModelMeasurements(
    value.jev.decisions,
    credentials,
  );
  const calls = normalizedModelMeasurements(
    value.textHelper.calls,
    credentials,
  );
  const jevAttempts = normalizedMeasurement(value.jev.providerHttpAttempts);
  const jevCost = normalizedMeasurement(value.jev.providerCost);
  const textAttempts = normalizedMeasurement(
    value.textHelper.providerHttpAttempts,
  );
  const textCost = normalizedMeasurement(value.textHelper.providerCost);
  if (
    decisions === undefined ||
    calls === undefined ||
    jevAttempts === undefined ||
    jevCost === undefined ||
    textAttempts === undefined ||
    textCost === undefined ||
    typeof value.jev.configuredModel !== "string" ||
    typeof value.textHelper.configured !== "boolean" ||
    (value.textHelper.configuredModel !== null &&
      typeof value.textHelper.configuredModel !== "string") ||
    (value.jev.decisionsTruncated !== undefined &&
      typeof value.jev.decisionsTruncated !== "boolean") ||
    (value.textHelper.callsTruncated !== undefined &&
      typeof value.textHelper.callsTruncated !== "boolean")
  ) {
    return undefined;
  }
  return {
    jev: {
      configuredModel: redactText(value.jev.configuredModel, credentials),
      decisions,
      ...(typeof value.jev.decisionsTruncated === "boolean"
        ? { decisionsTruncated: value.jev.decisionsTruncated }
        : {}),
      providerHttpAttempts: jevAttempts,
      providerCost: jevCost,
    },
    textHelper: {
      configured: value.textHelper.configured,
      configuredModel:
        typeof value.textHelper.configuredModel === "string"
          ? redactText(value.textHelper.configuredModel, credentials)
          : null,
      calls,
      ...(typeof value.textHelper.callsTruncated === "boolean"
        ? { callsTruncated: value.textHelper.callsTruncated }
        : {}),
      providerHttpAttempts: textAttempts,
      providerCost: textCost,
    },
  };
}

function normalizedBridgeResult(
  value: unknown,
  credentials: readonly string[],
): RlcdRunResult | undefined {
  if (!isRecord(value)) return undefined;
  const status = value.status;
  if (
    status !== "completion_claim" &&
    status !== "stopped" &&
    status !== "error"
  ) {
    return undefined;
  }
  const observation = normalizedObservation(value.lastObservation, credentials);
  const usage = normalizedUsage(value.usage, credentials);
  if (
    typeof value.stopReason !== "string" ||
    !isRecord(value.completionClaim) ||
    typeof value.completionClaim.claimed !== "boolean" ||
    value.completionClaim.requiresIndependentVerification !== true ||
    observation === undefined ||
    !Array.isArray(value.trace) ||
    typeof value.traceTruncated !== "boolean" ||
    usage === undefined ||
    !isRecord(value.timing) ||
    !isNonnegativeFinite(value.timing.elapsedMs) ||
    !isNonnegativeFinite(value.timing.wallBudgetMs) ||
    !isRecord(value.ownership) ||
    (value.ownership.targetId !== null &&
      typeof value.ownership.targetId !== "string") ||
    (value.ownership.bridgePid !== null &&
      (!Number.isInteger(value.ownership.bridgePid) ||
        !isNonnegativeFinite(value.ownership.bridgePid))) ||
    (value.ownership.daemon !== null &&
      typeof value.ownership.daemon !== "string") ||
    (value.mutationOutcome !== "not_in_flight" &&
      value.mutationOutcome !== "unknown") ||
    (value.diagnostic !== null && typeof value.diagnostic !== "string") ||
    !isRecord(value.cleanup) ||
    !["not_created", "closed", "unconfirmed"].includes(
      String(value.cleanup.taskTab),
    ) ||
    value.cleanup.sharedDaemon !== "retained"
  ) {
    return undefined;
  }
  const trace: TraceEntry[] = [];
  for (const item of value.trace) {
    const entry = normalizedTraceEntry(item, credentials);
    if (!entry) return undefined;
    trace.push(entry);
  }
  const taskTab = value.cleanup.taskTab;
  if (
    taskTab !== "not_created" &&
    taskTab !== "closed" &&
    taskTab !== "unconfirmed"
  ) {
    return undefined;
  }
  return {
    status,
    stopReason: redactText(value.stopReason, credentials),
    completionClaim: {
      claimed: value.completionClaim.claimed,
      requiresIndependentVerification: true,
    },
    lastObservation: observation,
    trace,
    traceTruncated: value.traceTruncated,
    usage,
    timing: {
      elapsedMs: value.timing.elapsedMs,
      wallBudgetMs: value.timing.wallBudgetMs,
    },
    ownership: {
      targetId:
        typeof value.ownership.targetId === "string"
          ? redactText(value.ownership.targetId, credentials)
          : null,
      bridgePid:
        typeof value.ownership.bridgePid === "number"
          ? value.ownership.bridgePid
          : null,
      daemon:
        typeof value.ownership.daemon === "string"
          ? redactText(value.ownership.daemon, credentials)
          : null,
    },
    mutationOutcome: value.mutationOutcome,
    diagnostic:
      typeof value.diagnostic === "string"
        ? redactText(value.diagnostic, credentials)
        : null,
    cleanup: {
      taskTab,
      bridgeProcess: "reaped",
      sharedDaemon: "retained",
    },
  };
}

function normalizedProgressRecord(
  value: unknown,
  credentials: readonly string[],
): { [key: string]: JsonValue } | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "ready") {
    if (
      value.protocolVersion !== 1 ||
      typeof value.daemon !== "string" ||
      !isRecord(value.capabilities) ||
      typeof value.capabilities.textHelperConfigured !== "boolean" ||
      !["absent", "incomplete", "invalid", "configured"].includes(
        String(value.capabilities.textHelperConfiguration),
      ) ||
      (value.capabilities.textHelperConfiguredModel !== null &&
        typeof value.capabilities.textHelperConfiguredModel !== "string")
    ) {
      return undefined;
    }
    return {
      type: "ready",
      protocolVersion: 1,
      daemon: redactText(value.daemon, credentials),
      capabilities: {
        textHelperConfigured: value.capabilities.textHelperConfigured,
        textHelperConfiguration: String(
          value.capabilities.textHelperConfiguration,
        ),
        textHelperConfiguredModel:
          typeof value.capabilities.textHelperConfiguredModel === "string"
            ? redactText(
                value.capabilities.textHelperConfiguredModel,
                credentials,
              )
            : null,
      },
    };
  }
  if (value.type === "ownership") {
    if (value.targetId !== null && typeof value.targetId !== "string")
      return undefined;
    return {
      type: "ownership",
      targetId:
        typeof value.targetId === "string"
          ? redactText(value.targetId, credentials)
          : null,
    };
  }
  if (value.type !== "progress") return undefined;
  if (
    !["observation", "prediction", "action"].includes(String(value.phase)) ||
    !Number.isInteger(value.executedActions) ||
    !isNonnegativeFinite(value.executedActions)
  ) {
    return undefined;
  }
  if (value.phase === "observation") {
    const observation = normalizedObservation(value.observation, credentials);
    if (observation === undefined) return undefined;
    return {
      type: "progress",
      phase: "observation",
      observation:
        observation === null
          ? null
          : {
              url: observation.url,
              title: observation.title,
              evidence: observation.evidence,
              evidenceTruncated: observation.evidenceTruncated,
            },
      executedActions: value.executedActions,
    };
  }
  const key = value.phase === "prediction" ? "decision" : "action";
  const entry = normalizedTraceEntry(value[key], credentials);
  if (!entry) return undefined;
  return {
    type: "progress",
    phase: value.phase === "prediction" ? "prediction" : "action",
    [key]: {
      step: entry.step,
      operation: entry.operation,
      action: entry.action,
      outcome: entry.outcome,
      elapsedMs: entry.elapsedMs,
      ...(entry.url === undefined ? {} : { url: entry.url }),
    },
    executedActions: value.executedActions,
  };
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
  daemon: string | null,
): Promise<RlcdRunResult> {
  const credentials = knownCredentials();
  let stdoutBuffer = "";
  let stderr = "";
  let protocolError: string | undefined;
  let terminal: RlcdRunResult | undefined;
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
    if (!rawLine || protocolError) return;
    if (rawLine.length > MAX_PROTOCOL_LINE_CHARS) {
      protocolError = `bridge emitted a line longer than ${MAX_PROTOCOL_LINE_CHARS} characters`;
      requestStop("cancelled");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawLine);
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
    if (parsed.type === "result") {
      if (terminal) {
        protocolError = "bridge emitted more than one terminal result";
      } else {
        terminal = normalizedBridgeResult(parsed.result, credentials);
        if (!terminal)
          protocolError = "bridge emitted an invalid terminal result";
      }
      if (protocolError) requestStop("cancelled");
      return;
    }
    const safeRecord = normalizedProgressRecord(parsed, credentials);
    if (!safeRecord) {
      protocolError = `bridge emitted an invalid ${JSON.stringify(parsed.type)} record`;
      requestStop("cancelled");
      return;
    }
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

  const safeTerminal = terminal;
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
  const daemon = null;
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
        "Project runtime is missing. Run `scripts/setup-runtime.sh` in the RLCD-brwsr checkout",
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
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    TYPESAFE_MODEL: runtimeConfig.jevModel,
  };
  const child = spawn(pythonExecutable, [bridgeExecutable], {
    cwd: projectRoot,
    env: childEnvironment,
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
    description: `Run one bounded Jev Ultrafast browser task in an owned tab. Defaults: ${DEFAULT_MAX_ACTIONS} executed actions and ${DEFAULT_MAX_SECONDS} seconds; maxima: ${MAX_ACTIONS} actions and ${MAX_SECONDS} seconds. Browser Harness natively selects the required existing local daemon, which the tool preserves along with unrelated tabs. A completion claim requires independent verification. Output is bounded to ${MAX_TOOL_CONTENT_CHARS} model-visible characters.`,
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
