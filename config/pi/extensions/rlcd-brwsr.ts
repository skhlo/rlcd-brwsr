import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
import { access, constants } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

const DEFAULT_MAX_ACTIONS = 6;
const DEFAULT_MAX_SECONDS = 30;
const MAX_ACTIONS = 20;
const MAX_SECONDS = 120;
const MAX_URL_CHARS = 2_048;
const MAX_GOAL_CHARS = 1_200;
const MAX_REQUEST_BYTES = 20_000;
const MAX_PROTOCOL_LINE_CHARS = 32_000;
const MAX_HELPER_REQUEST_LINE_CHARS = 384_000;
const MAX_RETAINED_RECORDS = 24;
const MAX_STDERR_CHARS = 4_000;
const MAX_TOOL_CONTENT_CHARS = 12_000;
const STOP_GRACE_MS = 1_500;
const MAX_HELPER_RESPONSE_CHARS = 12_000;
const TEXT_HELPER_PROVIDER = "openai-codex";
const TEXT_HELPER_MODEL = "gpt-5.6-luna";
const TEXT_HELPER_DISPLAY_MODEL = `${TEXT_HELPER_PROVIDER}/${TEXT_HELPER_MODEL}`;
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
    retainTab: Type.Optional(
      Type.Boolean({
        description:
          "Keep the owned tab only after a completion claim; failed, stopped, and cancelled runs still clean up",
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
  helperRequestId?: number;
  latencyMs: Measurement;
  usage: JsonValue;
}

type TextHelperAvailability = "available" | "unavailable" | "unknown";

interface ReadyProtocolRecord {
  type: "ready";
  protocolVersion: 2;
  daemon: string;
  capabilities: {
    textHelperAvailability: Exclude<TextHelperAvailability, "unknown">;
  };
}

interface TextHelperRequestProtocolRecord {
  type: "text_helper_request";
  requestId: number;
  prompt: {
    system: string;
    user: string;
  };
}

interface OwnershipProtocolRecord {
  type: "ownership";
  targetId: string | null;
}

interface ObservationProtocolRecord {
  type: "progress";
  phase: "observation";
  observation: Observation | null;
  executedActions: number;
}

interface PredictionProtocolRecord {
  type: "progress";
  phase: "prediction";
  decision: TraceEntry;
  measurement: ModelMeasurement;
  executedActions: number;
}

interface ActionProtocolRecord {
  type: "progress";
  phase: "dispatch" | "action";
  action: TraceEntry;
  executedActions: number;
}

type NormalizedProgressRecord =
  | ReadyProtocolRecord
  | OwnershipProtocolRecord
  | ObservationProtocolRecord
  | PredictionProtocolRecord
  | ActionProtocolRecord;

interface Usage {
  jev: {
    configuredModel: string;
    decisions: ModelMeasurement[];
    decisionsTruncated?: boolean;
    providerHttpAttempts: Measurement;
    providerRetries: Measurement;
    providerCost: Measurement;
  };
  textHelper: {
    availability: TextHelperAvailability;
    model: string | null | "unknown";
    calls: ModelMeasurement[];
    callsTruncated?: boolean;
    providerHttpAttempts: Measurement;
    providerRetries: Measurement;
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
    cleanupElapsedMs: Measurement;
    cleanupOverrunMs: number;
  };
  ownership: {
    targetId: string | null;
    bridgePid: number | null;
    daemon: string | null;
  };
  mutationOutcome: "not_in_flight" | "unknown";
  diagnostic: string | null;
  cleanup: {
    taskTab: "not_created" | "closed" | "retained" | "unconfirmed";
    bridgeProcess: "reaped" | "unconfirmed";
    sharedDaemon: "retained";
  };
  modelVisible?: {
    truncated: boolean;
    maxChars: number;
    omissions: string[];
  };
}

type PiUsage = NonNullable<AgentToolResult<unknown>["usage"]>;

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: RlcdRunResult;
  usage?: PiUsage;
}

interface BridgeRunInput extends Required<RlcdRunInput> {
  textHelperAvailable: boolean;
  textHelperUnavailableReason: string | null;
}

interface TextHelperCompletion {
  response: string;
  failure: string | null;
  reportedModel: string;
  latencyMs: number;
  usage: JsonValue;
  piUsage: PiUsage;
}

interface PiTextHelper {
  available: boolean;
  unavailableReason: string | null;
  complete(
    prompt: TextHelperRequestProtocolRecord["prompt"],
    signal: AbortSignal,
  ): Promise<TextHelperCompletion>;
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
  if (value.retainTab !== undefined && typeof value.retainTab !== "boolean") {
    return "retainTab must be a boolean";
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
        configuredModel: runtimeConfig.jevModel,
        decisions: [],
        providerHttpAttempts: "unavailable",
        providerRetries: "unavailable",
        providerCost: "unavailable",
      },
      textHelper: {
        availability: "unknown",
        model: "unknown",
        calls: [],
        providerHttpAttempts: "unavailable",
        providerRetries: "unavailable",
        providerCost: "unavailable",
      },
    },
    timing: {
      elapsedMs,
      wallBudgetMs: maxSeconds * 1_000,
      cleanupElapsedMs: 0,
      cleanupOverrunMs: Math.max(0, elapsedMs - maxSeconds * 1_000),
    },
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
  return [process.env.TYPESAFE_API_KEY].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

function copyPiUsage(usage: PiUsage): PiUsage {
  return {
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    ...(usage.cacheWrite1h === undefined
      ? {}
      : { cacheWrite1h: usage.cacheWrite1h }),
    ...(usage.reasoning === undefined ? {} : { reasoning: usage.reasoning }),
    totalTokens: usage.totalTokens,
    cost: {
      input: usage.cost.input,
      output: usage.cost.output,
      cacheRead: usage.cost.cacheRead,
      cacheWrite: usage.cost.cacheWrite,
      total: usage.cost.total,
    },
  };
}

function combinePiUsage(current: PiUsage | undefined, next: PiUsage): PiUsage {
  if (!current) return copyPiUsage(next);
  return {
    input: current.input + next.input,
    output: current.output + next.output,
    cacheRead: current.cacheRead + next.cacheRead,
    cacheWrite: current.cacheWrite + next.cacheWrite,
    ...(current.cacheWrite1h === undefined && next.cacheWrite1h === undefined
      ? {}
      : {
          cacheWrite1h: (current.cacheWrite1h ?? 0) + (next.cacheWrite1h ?? 0),
        }),
    ...(current.reasoning === undefined && next.reasoning === undefined
      ? {}
      : { reasoning: (current.reasoning ?? 0) + (next.reasoning ?? 0) }),
    totalTokens: current.totalTokens + next.totalTokens,
    cost: {
      input: current.cost.input + next.cost.input,
      output: current.cost.output + next.cost.output,
      cacheRead: current.cost.cacheRead + next.cost.cacheRead,
      cacheWrite: current.cost.cacheWrite + next.cost.cacheWrite,
      total: current.cost.total + next.cost.total,
    },
  };
}

function helperUsageDetails(usage: PiUsage): JsonValue {
  return {
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    ...(usage.cacheWrite1h === undefined
      ? {}
      : { cacheWrite1h: usage.cacheWrite1h }),
    ...(usage.reasoning === undefined ? {} : { reasoning: usage.reasoning }),
    totalTokens: usage.totalTokens,
  };
}

function resolvedCompletionFailure(stopReason: string): string | null {
  switch (stopReason) {
    case "stop":
      return null;
    case "length":
      return "Pi text helper output was incomplete";
    case "aborted":
      return "Pi text helper completion was aborted";
    case "error":
      return "Pi text helper completion failed";
    default:
      return "Pi text helper returned an unsupported completion state";
  }
}

function createPiTextHelper(ctx: ExtensionContext): PiTextHelper {
  const model = ctx.modelRegistry.find(TEXT_HELPER_PROVIDER, TEXT_HELPER_MODEL);
  const unavailableReason = !model
    ? `Pi text helper model ${TEXT_HELPER_DISPLAY_MODEL} is unavailable`
    : !ctx.modelRegistry.hasConfiguredAuth(model)
      ? `Pi login for ${TEXT_HELPER_DISPLAY_MODEL} is unavailable`
      : null;

  return {
    available: unavailableReason === null,
    unavailableReason,
    async complete(prompt, signal) {
      if (!model || unavailableReason) {
        throw new Error(
          `Pi text helper ${TEXT_HELPER_DISPLAY_MODEL} is unavailable`,
        );
      }
      if (signal.aborted) {
        throw new Error("Pi text helper request was aborted");
      }
      const startedAt = Date.now();
      const response = await (async () => {
        try {
          return await ctx.modelRegistry.complete(
            model,
            {
              systemPrompt: prompt.system,
              messages: [
                {
                  role: "user",
                  content: [{ type: "text", text: prompt.user }],
                  timestamp: Date.now(),
                },
              ],
            },
            { reasoningEffort: "high", signal },
          );
        } catch {
          throw new Error(
            signal.aborted
              ? "Pi text helper request was aborted"
              : "Pi text helper request failed",
          );
        }
      })();
      const piUsage = copyPiUsage(response.usage);
      const usage = helperUsageDetails(piUsage);
      const reportedModel = response.responseModel ?? "unavailable";
      const latencyMs = Date.now() - startedAt;
      const failure = resolvedCompletionFailure(response.stopReason);
      const text = failure
        ? ""
        : response.content
            .filter(
              (part): part is { type: "text"; text: string } =>
                part.type === "text",
            )
            .map((part) => part.text)
            .join("\n");
      return {
        response: text,
        failure,
        reportedModel,
        latencyMs,
        usage,
        piUsage,
      };
    },
  };
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

function normalizedModelMeasurement(
  value: unknown,
  credentials: readonly string[],
): ModelMeasurement | undefined {
  if (
    !isRecord(value) ||
    typeof value.reportedModel !== "string" ||
    (value.field !== undefined && typeof value.field !== "string") ||
    (value.helperRequestId !== undefined &&
      (!Number.isInteger(value.helperRequestId) ||
        !isNonnegativeFinite(value.helperRequestId))) ||
    (value.latencyMs !== "unavailable" && !isNonnegativeFinite(value.latencyMs))
  ) {
    return undefined;
  }
  const usage = sanitizedJson(value.usage, credentials);
  if (usage === undefined) return undefined;
  return {
    reportedModel: redactText(value.reportedModel, credentials),
    ...(typeof value.field === "string"
      ? { field: redactText(value.field, credentials) }
      : {}),
    ...(typeof value.helperRequestId === "number"
      ? { helperRequestId: value.helperRequestId }
      : {}),
    latencyMs: value.latencyMs,
    usage,
  };
}

function normalizedModelMeasurements(
  value: unknown,
  credentials: readonly string[],
): ModelMeasurement[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const output: ModelMeasurement[] = [];
  for (const item of value) {
    const measurement = normalizedModelMeasurement(item, credentials);
    if (!measurement) return undefined;
    output.push(measurement);
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
  const jevRetries = normalizedMeasurement(value.jev.providerRetries);
  const jevCost = normalizedMeasurement(value.jev.providerCost);
  const textAttempts = normalizedMeasurement(
    value.textHelper.providerHttpAttempts,
  );
  const textRetries = normalizedMeasurement(value.textHelper.providerRetries);
  const textCost = normalizedMeasurement(value.textHelper.providerCost);
  if (
    decisions === undefined ||
    calls === undefined ||
    jevAttempts === undefined ||
    jevRetries === undefined ||
    jevCost === undefined ||
    textAttempts === undefined ||
    textRetries === undefined ||
    textCost === undefined ||
    typeof value.jev.configuredModel !== "string" ||
    (value.textHelper.availability !== "available" &&
      value.textHelper.availability !== "unavailable") ||
    (value.textHelper.model !== null &&
      typeof value.textHelper.model !== "string") ||
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
      providerRetries: jevRetries,
      providerCost: jevCost,
    },
    textHelper: {
      availability: value.textHelper.availability,
      model:
        typeof value.textHelper.model === "string"
          ? redactText(value.textHelper.model, credentials)
          : null,
      calls,
      ...(typeof value.textHelper.callsTruncated === "boolean"
        ? { callsTruncated: value.textHelper.callsTruncated }
        : {}),
      providerHttpAttempts: textAttempts,
      providerRetries: textRetries,
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
  const cleanupElapsedMs = isRecord(value.timing)
    ? normalizedMeasurement(value.timing.cleanupElapsedMs)
    : undefined;
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
    cleanupElapsedMs === undefined ||
    !isNonnegativeFinite(value.timing.cleanupOverrunMs) ||
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
    taskTab !== "retained" &&
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
      cleanupElapsedMs,
      cleanupOverrunMs: value.timing.cleanupOverrunMs,
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
): NormalizedProgressRecord | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "ready") {
    if (
      value.protocolVersion !== 2 ||
      typeof value.daemon !== "string" ||
      !isRecord(value.capabilities) ||
      (value.capabilities.textHelperAvailability !== "available" &&
        value.capabilities.textHelperAvailability !== "unavailable")
    ) {
      return undefined;
    }
    return {
      type: "ready",
      protocolVersion: 2,
      daemon: redactText(value.daemon, credentials),
      capabilities: {
        textHelperAvailability: value.capabilities.textHelperAvailability,
      },
    };
  }
  if (value.type === "ownership") {
    if (value.targetId !== null && typeof value.targetId !== "string") {
      return undefined;
    }
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
      observation,
      executedActions: value.executedActions,
    };
  }
  if (value.phase === "prediction") {
    const decision = normalizedTraceEntry(value.decision, credentials);
    const measurement = normalizedModelMeasurement(
      value.measurement,
      credentials,
    );
    if (!decision || !measurement) return undefined;
    return {
      type: "progress",
      phase: "prediction",
      decision,
      measurement,
      executedActions: value.executedActions,
    };
  }
  if (value.phase === "dispatch" || value.phase === "action") {
    const action = normalizedTraceEntry(value.action, credentials);
    if (!action) return undefined;
    return {
      type: "progress",
      phase: value.phase,
      action,
      executedActions: value.executedActions,
    };
  }
  return undefined;
}

function normalizedTextHelperRequest(
  value: Record<string, unknown>,
): TextHelperRequestProtocolRecord | undefined {
  if (
    value.type !== "text_helper_request" ||
    !Number.isInteger(value.requestId) ||
    !isNonnegativeFinite(value.requestId) ||
    !isRecord(value.prompt) ||
    typeof value.prompt.system !== "string" ||
    typeof value.prompt.user !== "string"
  ) {
    return undefined;
  }
  return {
    type: "text_helper_request",
    requestId: value.requestId,
    prompt: {
      system: value.prompt.system,
      user: value.prompt.user,
    },
  };
}

function boundedJsonText(
  value: string,
  maximumSerializedChars: number,
): { text: string; truncated: boolean } {
  if (JSON.stringify(value).length <= maximumSerializedChars) {
    return { text: value, truncated: false };
  }

  let text = "";
  let serializedChars = 2;
  for (const character of value) {
    const encodedCharacter = JSON.stringify(character).slice(1, -1);
    if (serializedChars + encodedCharacter.length > maximumSerializedChars) {
      break;
    }
    text += character;
    serializedChars += encodedCharacter.length;
  }
  return { text, truncated: true };
}

function toolContent(result: RlcdRunResult): string {
  const serialized = JSON.stringify(result, null, 2);
  if (serialized.length <= MAX_TOOL_CONTENT_CHARS) return serialized;

  const omissions: string[] = ["usage"];
  const clipped = (
    path: string,
    value: string,
    maximumSerializedChars: number,
  ): string => {
    const bounded = boundedJsonText(value, maximumSerializedChars);
    if (bounded.truncated) omissions.push(`${path} remainder`);
    return bounded.text;
  };
  const observationEvidence =
    result.lastObservation === null
      ? null
      : boundedJsonText(result.lastObservation.evidence, 1_200);
  if (observationEvidence?.truncated) {
    omissions.push("lastObservation.evidence remainder");
  }
  const observation =
    result.lastObservation === null || observationEvidence === null
      ? null
      : {
          url: clipped("lastObservation.url", result.lastObservation.url, 800),
          title: clipped(
            "lastObservation.title",
            result.lastObservation.title,
            400,
          ),
          evidence: observationEvidence.text,
          evidenceTruncated:
            result.lastObservation.evidenceTruncated ||
            observationEvidence.truncated,
        };
  const trace = result.trace.slice(-2).map((entry, index) => {
    const path = `trace[${index}]`;
    return {
      step: entry.step,
      operation: clipped(`${path}.operation`, entry.operation, 160),
      action: clipped(`${path}.action`, entry.action, 400),
      outcome: clipped(`${path}.outcome`, entry.outcome, 160),
      elapsedMs: entry.elapsedMs,
      ...(entry.url === undefined
        ? {}
        : { url: clipped(`${path}.url`, entry.url, 400) }),
    };
  });
  if (result.traceTruncated || result.trace.length > trace.length) {
    omissions.push("earlier trace entries");
  }
  const stopReason = clipped("stopReason", result.stopReason, 400);
  const diagnostic =
    result.diagnostic === null
      ? null
      : clipped("diagnostic", result.diagnostic, 600);
  const targetId =
    result.ownership.targetId === null
      ? null
      : clipped("ownership.targetId", result.ownership.targetId, 300);
  const daemon =
    result.ownership.daemon === null
      ? null
      : clipped("ownership.daemon", result.ownership.daemon, 300);
  const compact = {
    status: result.status,
    stopReason,
    completionClaim: result.completionClaim,
    lastObservation: observation,
    trace,
    traceTruncated: result.traceTruncated || result.trace.length > trace.length,
    timing: result.timing,
    ownership: {
      targetId,
      bridgePid: result.ownership.bridgePid,
      daemon,
    },
    mutationOutcome: result.mutationOutcome,
    diagnostic,
    cleanup: result.cleanup,
    modelVisible: {
      truncated: true,
      maxChars: MAX_TOOL_CONTENT_CHARS,
      omissions,
    },
  };
  const compactSerialized = JSON.stringify(compact, null, 2);
  if (compactSerialized.length <= MAX_TOOL_CONTENT_CHARS) {
    return compactSerialized;
  }

  const minimalStopReason = boundedJsonText(result.stopReason, 400);
  return JSON.stringify({
    status: result.status,
    stopReason: minimalStopReason.text,
    completionClaim: result.completionClaim,
    modelVisible: {
      truncated: true,
      maxChars: MAX_TOOL_CONTENT_CHARS,
      omissions: [
        "lastObservation",
        "trace",
        "usage",
        "timing",
        "ownership",
        "mutationOutcome",
        "diagnostic",
        "cleanup",
        ...(minimalStopReason.truncated ? ["stopReason remainder"] : []),
      ],
    },
  });
}

function asToolResult(result: RlcdRunResult, usage?: PiUsage): ToolResult {
  return {
    content: [{ type: "text", text: toolContent(result) }],
    details: result,
    ...(usage ? { usage } : {}),
  };
}

interface PartialBridgeState {
  daemon: string | null;
  targetId: string | null;
  ownershipReported: boolean;
  bridgePid: number | null;
  lastObservation: Observation | null;
  trace: TraceEntry[];
  traceTruncated: boolean;
  decisions: ModelMeasurement[];
  decisionsTruncated: boolean;
  textHelperAvailability: TextHelperAvailability;
  textHelperModel: string | null | "unknown";
  textHelperCalls: ModelMeasurement[];
  textHelperCallsTruncated: boolean;
  piUsage: PiUsage | undefined;
  mutationOutcome: "not_in_flight" | "unknown";
}

interface BridgeRunOutcome {
  result: RlcdRunResult;
  usage?: PiUsage;
}

interface ClosedProcess {
  code: number | null;
  signal: NodeJS.Signals | null;
  spawnError?: Error;
}

interface TargetedCleanupResult {
  confirmed: boolean;
  elapsedMs: number;
  diagnostic: string | null;
}

function boundedDiagnostic(
  parts: Array<string | null | undefined>,
): string | null {
  const joined = parts
    .filter((part): part is string => Boolean(part))
    .join("; ");
  if (!joined) return null;
  if (joined.length <= MAX_STDERR_CHARS) return joined;
  const suffix = ` [diagnostic truncated from ${joined.length} characters]`;
  return `${joined.slice(0, MAX_STDERR_CHARS - suffix.length)}${suffix}`;
}

function publicTextHelperCall(call: ModelMeasurement): ModelMeasurement {
  return {
    reportedModel: call.reportedModel,
    ...(call.field === undefined ? {} : { field: call.field }),
    latencyMs: call.latencyMs,
    usage: call.usage,
  };
}

function partialBridgeResult(
  state: PartialBridgeState,
  stopReason: string,
  diagnostic: string,
  status: RlcdRunResult["status"],
  elapsedMs: number,
  maxSeconds: number,
): RlcdRunResult {
  const result = basicResult(
    stopReason,
    diagnostic,
    elapsedMs,
    maxSeconds,
    state.daemon,
    status,
  );
  result.lastObservation = state.lastObservation;
  result.trace = state.trace;
  result.traceTruncated = state.traceTruncated;
  result.usage.jev.decisions = state.decisions;
  result.usage.jev.decisionsTruncated = state.decisionsTruncated;
  result.usage.textHelper.availability = state.textHelperAvailability;
  result.usage.textHelper.model = state.textHelperModel;
  result.usage.textHelper.calls =
    state.textHelperCalls.map(publicTextHelperCall);
  if (state.textHelperCallsTruncated) {
    result.usage.textHelper.callsTruncated = true;
  }
  result.ownership = {
    targetId: state.targetId,
    bridgePid: state.bridgePid,
    daemon: state.daemon,
  };
  result.mutationOutcome = state.mutationOutcome;
  result.cleanup.taskTab = "unconfirmed";
  result.timing.cleanupElapsedMs = "unavailable";
  return result;
}

function upsertTrace(state: PartialBridgeState, entry: TraceEntry): void {
  const existing = state.trace.findIndex((item) => item.step === entry.step);
  if (existing >= 0) {
    state.trace[existing] = entry;
    return;
  }
  if (state.trace.length === MAX_RETAINED_RECORDS) {
    state.trace.shift();
    state.traceTruncated = true;
  }
  state.trace.push(entry);
}

function applyProgressRecord(
  state: PartialBridgeState,
  record: NormalizedProgressRecord,
): void {
  if (record.type === "ready") {
    state.daemon = record.daemon;
    state.textHelperAvailability = record.capabilities.textHelperAvailability;
    state.textHelperModel =
      record.capabilities.textHelperAvailability === "available"
        ? TEXT_HELPER_DISPLAY_MODEL
        : null;
    return;
  }
  if (record.type === "ownership") {
    state.ownershipReported = true;
    state.targetId = record.targetId;
    return;
  }

  if (record.phase === "observation") {
    if (record.observation !== null) {
      state.lastObservation = record.observation;
      state.mutationOutcome = "not_in_flight";
    }
    return;
  }
  if (record.phase === "prediction") {
    upsertTrace(state, record.decision);
    if (state.decisions.length === MAX_RETAINED_RECORDS) {
      state.decisions.shift();
      state.decisionsTruncated = true;
    }
    state.decisions.push(record.measurement);
    return;
  }

  upsertTrace(state, record.action);
  state.mutationOutcome =
    record.phase === "dispatch" ? "unknown" : "not_in_flight";
}

function progressToolResult(
  record: NormalizedProgressRecord,
  state: PartialBridgeState,
  startedAt: number,
  maxSeconds: number,
): ToolResult {
  const serialized = JSON.stringify(record);
  const text =
    serialized.length <= 2_000
      ? serialized
      : JSON.stringify({
          type: record.type,
          phase: record.type === "progress" ? record.phase : null,
          truncated: true,
          maxChars: 2_000,
        });
  return {
    content: [{ type: "text", text }],
    details: partialBridgeResult(
      state,
      "running",
      "Bridge run in progress",
      "stopped",
      Date.now() - startedAt,
      maxSeconds,
    ),
  };
}

async function waitForClose(
  child: ChildProcessWithoutNullStreams,
): Promise<ClosedProcess> {
  return new Promise((resolveClose) => {
    let spawnError: Error | undefined;
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code, signal) => {
      resolveClose({
        code,
        signal,
        ...(spawnError ? { spawnError } : {}),
      });
    });
  });
}

async function targetedCleanup(
  targetId: string,
  childEnvironment: NodeJS.ProcessEnv,
  credentials: readonly string[],
): Promise<TargetedCleanupResult> {
  const startedAt = Date.now();
  const child = spawn(pythonExecutable, [bridgeExecutable], {
    cwd: projectRoot,
    env: childEnvironment,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let stderrOmitted = 0;
  let forced = false;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    if (stdout.length < MAX_PROTOCOL_LINE_CHARS + 1) {
      stdout += chunk.slice(0, MAX_PROTOCOL_LINE_CHARS + 1 - stdout.length);
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    const available = Math.max(0, MAX_STDERR_CHARS - stderr.length);
    stderr += chunk.slice(0, available);
    stderrOmitted += Math.max(0, chunk.length - available);
  });
  child.stdin.end(
    `${JSON.stringify({ requestType: "cleanup_target", targetId })}\n`,
  );

  const stopTimer = setTimeout(() => child.kill("SIGTERM"), STOP_GRACE_MS);
  stopTimer.unref();
  const forceTimer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      forced = true;
      child.kill("SIGKILL");
    }
  }, STOP_GRACE_MS + 250);
  forceTimer.unref();
  const closed = await waitForClose(child);
  clearTimeout(stopTimer);
  clearTimeout(forceTimer);

  let record: Record<string, unknown> | undefined;
  const lines = stdout.trim().split("\n").filter(Boolean);
  if (lines.length === 1 && lines[0]!.length <= MAX_PROTOCOL_LINE_CHARS) {
    try {
      const parsed: unknown = JSON.parse(lines[0]!);
      if (isRecord(parsed)) record = parsed;
    } catch {
      record = undefined;
    }
  }
  const confirmed =
    !forced &&
    closed.code === 0 &&
    closed.signal === null &&
    record?.type === "cleanup" &&
    record.targetId === targetId &&
    record.closed === true;
  const protocolDiagnostic =
    typeof record?.diagnostic === "string"
      ? redactText(record.diagnostic, credentials)
      : null;
  const stderrDiagnostic = stderr.trim()
    ? `cleanup stderr: ${redactText(stderr.trim(), credentials)}${stderrOmitted ? ` [${stderrOmitted} chars omitted]` : ""}`
    : null;
  const exitDiagnostic = confirmed
    ? null
    : `targeted cleanup unconfirmed (code ${String(closed.code)}, signal ${String(closed.signal)})`;
  return {
    confirmed,
    elapsedMs: Date.now() - startedAt,
    diagnostic: boundedDiagnostic([
      protocolDiagnostic,
      stderrDiagnostic,
      exitDiagnostic,
    ]),
  };
}

async function waitForBridge(
  child: ChildProcessWithoutNullStreams,
  childEnvironment: NodeJS.ProcessEnv,
  input: BridgeRunInput,
  serializedInput: string,
  textHelper: PiTextHelper,
  signal: AbortSignal | undefined,
  onUpdate: ((result: ToolResult) => void) | undefined,
  startedAt: number,
): Promise<BridgeRunOutcome> {
  const credentials = knownCredentials();
  const state: PartialBridgeState = {
    daemon: null,
    targetId: null,
    ownershipReported: false,
    bridgePid: child.pid ?? null,
    lastObservation: null,
    trace: [],
    traceTruncated: false,
    decisions: [],
    decisionsTruncated: false,
    textHelperAvailability: "unknown",
    textHelperModel: "unknown",
    textHelperCalls: [],
    textHelperCallsTruncated: false,
    piUsage: undefined,
    mutationOutcome: "not_in_flight",
  };
  let stdoutBuffer = "";
  let stderr = "";
  let stderrOmitted = 0;
  let protocolError: string | undefined;
  let terminal: RlcdRunResult | undefined;
  let requestedStop: "cancelled" | "time_budget" | undefined;
  let shutdownStartedAt: number | undefined;
  let forced = false;
  let graceTimer: NodeJS.Timeout | undefined;
  let helperRequestId: number | undefined;
  let helperTask: Promise<void> | undefined;
  let helperSettleDiagnostic: string | undefined;
  const helperAbort = new AbortController();

  const stopChild = () => {
    helperAbort.abort();
    if (!child.stdin.destroyed) child.stdin.end();
    shutdownStartedAt ??= Date.now();
    child.kill("SIGTERM");
    if (graceTimer) return;
    graceTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        forced = true;
        child.kill("SIGKILL");
      }
    }, STOP_GRACE_MS);
    graceTimer.unref();
  };
  const requestStop = (reason: "cancelled" | "time_budget") => {
    requestedStop ??= reason;
    stopChild();
  };
  const failProtocol = (diagnostic: string) => {
    protocolError ??= diagnostic;
    stopChild();
  };

  const writeToBridge = (record: unknown) => {
    if (
      requestedStop ||
      protocolError ||
      child.stdin.destroyed ||
      !child.stdin.writable
    ) {
      return;
    }
    const line = JSON.stringify(record);
    if (line.length > MAX_PROTOCOL_LINE_CHARS) {
      failProtocol("text helper reply exceeded the bridge protocol bound");
      return;
    }
    child.stdin.write(`${line}\n`, (error) => {
      if (error && !requestedStop && !protocolError) {
        failProtocol(`could not send text helper reply: ${error.message}`);
      }
    });
  };

  const handleTextHelperRequest = (
    request: TextHelperRequestProtocolRecord,
  ) => {
    if (helperRequestId !== undefined) {
      failProtocol("bridge requested more than one text helper call at a time");
      return;
    }
    helperRequestId = request.requestId;
    helperTask = (async () => {
      try {
        const completion = await textHelper.complete(
          request.prompt,
          helperAbort.signal,
        );
        if (state.textHelperCalls.length === MAX_RETAINED_RECORDS) {
          state.textHelperCalls.shift();
          state.textHelperCallsTruncated = true;
        }
        state.textHelperCalls.push({
          reportedModel: completion.reportedModel,
          helperRequestId: request.requestId,
          latencyMs: completion.latencyMs,
          usage: completion.usage,
        });
        state.piUsage = combinePiUsage(state.piUsage, completion.piUsage);
        if (
          helperAbort.signal.aborted ||
          requestedStop ||
          protocolError ||
          helperRequestId !== request.requestId
        ) {
          return;
        }
        if (completion.failure) {
          writeToBridge({
            type: "text_helper_response",
            requestId: request.requestId,
            error: completion.failure,
          });
        } else if (completion.response.length > MAX_HELPER_RESPONSE_CHARS) {
          writeToBridge({
            type: "text_helper_response",
            requestId: request.requestId,
            error: `Pi text helper response exceeded ${MAX_HELPER_RESPONSE_CHARS} characters`,
          });
        } else {
          writeToBridge({
            type: "text_helper_response",
            requestId: request.requestId,
            response: completion.response,
            usage: completion.usage,
          });
        }
      } catch {
        if (
          helperAbort.signal.aborted ||
          requestedStop ||
          protocolError ||
          helperRequestId !== request.requestId
        ) {
          return;
        }
        writeToBridge({
          type: "text_helper_response",
          requestId: request.requestId,
          error: "Pi text helper request failed",
        });
      } finally {
        if (helperRequestId === request.requestId) {
          helperRequestId = undefined;
        }
      }
    })();
  };

  const onAbort = () => requestStop("cancelled");
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) requestStop("cancelled");
  const deadline = setTimeout(
    () => requestStop("time_budget"),
    input.maxSeconds * 1_000,
  );
  deadline.unref();

  const handleLine = (rawLine: string) => {
    if (!rawLine || protocolError) return;
    if (rawLine.length > MAX_HELPER_REQUEST_LINE_CHARS) {
      failProtocol(
        `bridge emitted a line longer than ${MAX_HELPER_REQUEST_LINE_CHARS} characters`,
      );
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawLine);
    } catch {
      failProtocol("bridge stdout contained a non-JSON protocol line");
      return;
    }
    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      failProtocol("bridge emitted an invalid protocol record");
      return;
    }
    const maximumLineChars =
      parsed.type === "text_helper_request"
        ? MAX_HELPER_REQUEST_LINE_CHARS
        : MAX_PROTOCOL_LINE_CHARS;
    if (rawLine.length > maximumLineChars) {
      failProtocol(
        `bridge emitted a line longer than ${maximumLineChars} characters`,
      );
      return;
    }
    if (parsed.type === "result") {
      if (terminal) {
        failProtocol("bridge emitted more than one terminal result");
      } else {
        terminal = normalizedBridgeResult(parsed.result, credentials);
        if (!terminal) {
          failProtocol("bridge emitted an invalid terminal result");
        }
      }
      return;
    }
    if (parsed.type === "text_helper_request") {
      const request = normalizedTextHelperRequest(parsed);
      if (!request) {
        failProtocol("bridge emitted an invalid text helper request");
      } else {
        handleTextHelperRequest(request);
      }
      return;
    }
    const safeRecord = normalizedProgressRecord(parsed, credentials);
    if (!safeRecord) {
      failProtocol(
        `bridge emitted an invalid ${JSON.stringify(parsed.type)} record`,
      );
      return;
    }
    applyProgressRecord(state, safeRecord);
    onUpdate?.(
      progressToolResult(safeRecord, state, startedAt, input.maxSeconds),
    );
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    if (protocolError) return;
    stdoutBuffer += chunk;
    let newline = stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      handleLine(stdoutBuffer.slice(0, newline));
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      newline = stdoutBuffer.indexOf("\n");
    }
    if (stdoutBuffer.length > MAX_HELPER_REQUEST_LINE_CHARS) {
      stdoutBuffer = stdoutBuffer.slice(0, MAX_HELPER_REQUEST_LINE_CHARS + 1);
      failProtocol(
        `bridge emitted a line longer than ${MAX_HELPER_REQUEST_LINE_CHARS} characters`,
      );
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    const available = Math.max(0, MAX_STDERR_CHARS - stderr.length);
    stderr += chunk.slice(0, available);
    stderrOmitted += Math.max(0, chunk.length - available);
  });

  child.stdin.on("error", (error) => {
    if (!requestedStop && !protocolError) {
      failProtocol(`bridge stdin failed: ${error.message}`);
    }
  });

  if (!requestedStop) {
    if (signal?.aborted) requestStop("cancelled");
    else {
      child.stdin.write(serializedInput, (error) => {
        if (error && !requestedStop && !protocolError) {
          failProtocol(`could not send bridge request: ${error.message}`);
        }
      });
    }
  }

  const closed = await waitForClose(child);
  helperAbort.abort();
  if (!child.stdin.destroyed) child.stdin.end();
  if (helperTask) {
    let settled = false;
    let settleTimer: NodeJS.Timeout | undefined;
    await Promise.race([
      helperTask.then(() => {
        settled = true;
      }),
      new Promise<void>((resolve) => {
        settleTimer = setTimeout(resolve, STOP_GRACE_MS);
        settleTimer.unref();
      }),
    ]);
    if (settleTimer) clearTimeout(settleTimer);
    if (!settled) {
      helperSettleDiagnostic =
        "aborted Pi text helper did not settle within shutdown grace";
    }
  }
  clearTimeout(deadline);
  if (graceTimer) clearTimeout(graceTimer);
  signal?.removeEventListener("abort", onAbort);
  if (stdoutBuffer.trim() && !protocolError) handleLine(stdoutBuffer.trim());

  const abnormalExit =
    closed.spawnError !== undefined ||
    closed.code !== 0 ||
    closed.signal !== null;
  const terminalTrusted = Boolean(terminal && !protocolError && !abnormalExit);
  const exitDiagnostic = closed.spawnError
    ? `bridge could not start: ${closed.spawnError.message}`
    : abnormalExit
      ? `bridge exited abnormally (code ${String(closed.code)}, signal ${String(closed.signal)})`
      : !terminal
        ? "bridge exited without a terminal result"
        : null;
  const stderrDiagnostic = stderr.trim()
    ? `stderr: ${redactText(stderr.trim(), credentials)}${stderrOmitted ? ` [${stderrOmitted} chars omitted]` : ""}`
    : null;

  let result: RlcdRunResult;
  if (terminalTrusted && terminal) {
    result = terminal;
  } else {
    const stopReason = protocolError
      ? "protocol_error"
      : (requestedStop ?? "bridge_error");
    result = partialBridgeResult(
      state,
      stopReason,
      boundedDiagnostic([protocolError, exitDiagnostic]) ?? stopReason,
      requestedStop && !protocolError ? "stopped" : "error",
      Date.now() - startedAt,
      input.maxSeconds,
    );
  }

  if (requestedStop) {
    result.status = "stopped";
    result.stopReason = requestedStop;
    result.completionClaim.claimed = false;
  }
  if (protocolError) {
    result.status = "error";
    result.stopReason = "protocol_error";
    result.completionClaim.claimed = false;
  } else if (abnormalExit) {
    result.status = requestedStop ? "stopped" : "error";
    result.stopReason = requestedStop ?? "bridge_error";
    result.completionClaim.claimed = false;
  }

  const resultHelperCalls = result.usage.textHelper.calls;
  const fieldsByRequestId = new Map<number, string>();
  for (const call of resultHelperCalls) {
    if (call.helperRequestId !== undefined && call.field !== undefined) {
      fieldsByRequestId.set(call.helperRequestId, call.field);
    }
  }
  result.usage.textHelper.availability = state.textHelperAvailability;
  result.usage.textHelper.model = state.textHelperModel;
  result.usage.textHelper.calls = state.textHelperCalls.map((call) => {
    const field =
      call.helperRequestId === undefined
        ? undefined
        : fieldsByRequestId.get(call.helperRequestId);
    return publicTextHelperCall({
      ...call,
      ...(field === undefined ? {} : { field }),
    });
  });
  if (
    state.textHelperCallsTruncated ||
    result.usage.textHelper.callsTruncated === true
  ) {
    result.usage.textHelper.callsTruncated = true;
  } else {
    delete result.usage.textHelper.callsTruncated;
  }

  const trustedRetainedTab =
    terminalTrusted &&
    !requestedStop &&
    result.status === "completion_claim" &&
    input.retainTab &&
    result.cleanup.taskTab === "retained";
  let needsTargetedCleanup =
    !trustedRetainedTab &&
    state.ownershipReported &&
    state.targetId !== null &&
    (!terminalTrusted ||
      result.cleanup.taskTab === "unconfirmed" ||
      (result.cleanup.taskTab === "retained" && !trustedRetainedTab));
  if (forced) needsTargetedCleanup = state.targetId !== null;

  let targeted: TargetedCleanupResult | undefined;
  if (needsTargetedCleanup && state.targetId) {
    targeted = await targetedCleanup(
      state.targetId,
      childEnvironment,
      credentials,
    );
    result.cleanup.taskTab = targeted.confirmed ? "closed" : "unconfirmed";
  } else if (!terminalTrusted && !trustedRetainedTab) {
    result.cleanup.taskTab = closed.spawnError ? "not_created" : "unconfirmed";
  }

  const elapsedMs = Date.now() - startedAt;
  let cleanupElapsedMs = result.timing.cleanupElapsedMs;
  if (shutdownStartedAt !== undefined) {
    cleanupElapsedMs = Date.now() - shutdownStartedAt;
  } else if (
    targeted &&
    typeof result.timing.cleanupElapsedMs === "number" &&
    terminalTrusted
  ) {
    cleanupElapsedMs = result.timing.cleanupElapsedMs + targeted.elapsedMs;
  } else if (targeted && !terminalTrusted) {
    cleanupElapsedMs = "unavailable";
  }
  result.timing = {
    elapsedMs,
    wallBudgetMs: input.maxSeconds * 1_000,
    cleanupElapsedMs,
    cleanupOverrunMs: Math.max(0, elapsedMs - input.maxSeconds * 1_000),
  };
  result.cleanup.bridgeProcess = "reaped";
  result.cleanup.sharedDaemon = "retained";
  result.diagnostic = boundedDiagnostic([
    result.diagnostic,
    protocolError,
    exitDiagnostic,
    stderrDiagnostic,
    helperSettleDiagnostic,
    targeted?.diagnostic,
  ]);
  return {
    result,
    ...(state.piUsage ? { usage: state.piUsage } : {}),
  };
}

async function runRegisteredTool(
  params: RlcdRunInput,
  signal: AbortSignal | undefined,
  onUpdate: ((result: ToolResult) => void) | undefined,
  ctx: ExtensionContext,
): Promise<ToolResult> {
  const startedAt = Date.now();
  const maxSeconds = params.maxSeconds ?? DEFAULT_MAX_SECONDS;
  const daemon = null;
  const cancelledBeforeBridge = () =>
    asToolResult(
      basicResult(
        "cancelled",
        "Pi cancelled before bridge startup",
        Date.now() - startedAt,
        maxSeconds,
        daemon,
        "stopped",
      ),
    );
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
  if (signal?.aborted) return cancelledBeforeBridge();
  try {
    await access(pythonExecutable, constants.X_OK);
    if (signal?.aborted) return cancelledBeforeBridge();
    await access(bridgeExecutable, constants.R_OK);
  } catch {
    if (signal?.aborted) return cancelledBeforeBridge();
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

  if (signal?.aborted) return cancelledBeforeBridge();

  const textHelper = createPiTextHelper(ctx);
  const input: BridgeRunInput = {
    url: params.url,
    goal: params.goal.trim(),
    maxActions: params.maxActions ?? DEFAULT_MAX_ACTIONS,
    maxSeconds,
    retainTab: params.retainTab ?? false,
    textHelperAvailable: textHelper.available,
    textHelperUnavailableReason: textHelper.unavailableReason,
  };
  const serializedInput = `${JSON.stringify(input)}\n`;
  if (Buffer.byteLength(serializedInput, "utf8") > MAX_REQUEST_BYTES) {
    return asToolResult(
      basicResult(
        "invalid_input",
        `serialized input must not exceed ${MAX_REQUEST_BYTES} bytes`,
        Date.now() - startedAt,
        maxSeconds,
        daemon,
      ),
    );
  }
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
  const outcome = await waitForBridge(
    child,
    childEnvironment,
    input,
    serializedInput,
    textHelper,
    signal,
    onUpdate,
    startedAt,
  );
  return asToolResult(outcome.result, outcome.usage);
}

export default function rlcdBrwsrExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "rlcd_brwsr_run",
    label: "RLCD Browser",
    description: `Run one bounded Jev Ultrafast browser task in an owned tab. Defaults: ${DEFAULT_MAX_ACTIONS} executed actions and ${DEFAULT_MAX_SECONDS} seconds; maxima: ${MAX_ACTIONS} actions and ${MAX_SECONDS} seconds. Set retainTab only to keep a completion-claimed tab for inspection; other outcomes still attempt cleanup. Browser Harness natively selects the required existing local daemon, which the tool preserves along with unrelated tabs. A completion claim requires independent verification. Output is bounded to ${MAX_TOOL_CONTENT_CHARS} model-visible characters.`,
    promptSnippet:
      "Delegate one already-authorized benign browser task to the bounded Jev Ultrafast loop",
    promptGuidelines: [
      "Use rlcd_brwsr_run only for an already-authorized benign browser task, and independently verify every completion claim.",
    ],
    parameters: rlcdBrwsrParameters,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return runRegisteredTool(params, signal, onUpdate, ctx);
    },
  });
}
