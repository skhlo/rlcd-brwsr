import { createHash } from "node:crypto";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const DEFAULT_MAX_STEPS = 6;
const DEFAULT_MAX_SECONDS = 30;
const MAX_STEPS = 12;
const MAX_SECONDS = 120;
const MAX_GOAL_CHARS = 1_200;
const MAX_CLI_OUTPUT_CHARS = 256_000;
const MAX_ERROR_CHARS = 500;
const MAX_ERRORS = 4;
const MAX_SNAPSHOT_NODES = 2_000;
const MAX_CLICK_TARGETS = 16;
const MAX_TARGET_LABEL_CHARS = 160;
const MAX_URL_CHARS = 2_048;
const MAX_EXCERPT_CHARS = 1_200;
const MAX_SOURCE_RECORDS = 4;
const MAX_TOTAL_EVIDENCE_CHARS = 3_600;
const MAX_MODEL_VISIBLE_CHARS = 8_000;
const WAIT_MILLISECONDS = 250;

type Operation = "CLICK" | "WAIT" | "DONE" | "BLOCKED";
type StopReason =
  | "done_claim"
  | "blocked"
  | "cancelled"
  | "time_budget"
  | "step_budget"
  | "evidence_budget"
  | "command_failed"
  | "uncertain_execution"
  | "classifier_failed"
  | "invalid_classifier_response"
  | "unchanged_state";

export interface RlcdRunInput {
  goal: string;
  maxSteps?: number;
  maxSeconds?: number;
}

export interface ClickTarget {
  uid: string;
  role: string;
  label: string;
}

export interface ClassifierRequest {
  goal: string;
  observation: {
    url: string;
    title: string;
    text: string;
    textTruncated: boolean;
  };
  candidates: {
    operations: Operation[];
    clickTargets: ClickTarget[];
    clickTargetsTruncated: boolean;
  };
  retainedSources: Array<{
    url: string;
    title: string;
    excerptPreview: string;
  }>;
  recentActions: Array<{
    operation: Operation;
    targetLabel?: string;
    outcome: string;
  }>;
}

export interface ClassifierContext {
  signal: AbortSignal;
}

export type Classifier = (
  request: ClassifierRequest,
  context: ClassifierContext,
) => Promise<unknown>;

export interface CliOptions {
  signal: AbortSignal;
  timeoutMs: number;
}

export type CliExecutor = (
  argv: readonly string[],
  options: CliOptions,
) => Promise<unknown>;

export interface RlcdDependencies {
  classifier: Classifier;
  cli: CliExecutor;
  clock: { now(): number };
  wait(milliseconds: number, signal: AbortSignal): Promise<void>;
}

export interface EvidenceSource {
  url: string;
  title: string;
  excerpt: string;
  excerptTruncated: boolean;
}

export interface ActionTraceEntry {
  step: number;
  operation: Operation;
  targetUid?: string;
  targetLabel?: string;
  outcome: string;
  model?: string;
  operationProbabilities: Record<string, number>;
  targetProbabilities?: Record<string, number>;
}

export interface RlcdRunResult {
  status: "completion_claim" | "stopped";
  stopReason: StopReason;
  completionClaim: {
    claimed: boolean;
    requiresIndependentVerification: true;
    sourceCoverageComplete: false;
  };
  finalPage: {
    url: string;
    title: string;
    excerpt: string;
    excerptTruncated: boolean;
  };
  evidence: {
    sources: EvidenceSource[];
    totalExcerptChars: number;
    truncated: boolean;
    omittedCaptures: number;
  };
  trace: ActionTraceEntry[];
  errors: string[];
  metrics: {
    elapsedMs: number;
    classifierCalls: number;
    browserCommands: number;
    waits: number;
    modelInputTokens: number;
    modelOutputTokens: number;
  };
  limits: {
    maxSourceRecords: number;
    maxExcerptChars: number;
    maxTotalEvidenceChars: number;
    maxModelVisibleChars: number;
  };
}

interface SnapshotNode {
  id?: string;
  role?: string;
  name?: string;
  url?: string;
  children?: unknown[];
}

interface Observation {
  url: string;
  title: string;
  captureSignature: string;
  text: string;
  textTruncated: boolean;
  clickTargets: ClickTarget[];
  clickTargetsTruncated: boolean;
}

interface ChoiceAnswer {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

interface ValidDecision {
  operation: ChoiceAnswer & { choice: Operation };
  clickTarget?: ChoiceAnswer;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

interface CommandSuccess {
  observation: Observation;
}

interface CommandFailure {
  message: string;
  uncertain: boolean;
  killed: boolean;
}

interface BoundedSuccess<T> {
  kind: "success";
  value: T;
}

interface BoundedCancelled {
  kind: "cancelled";
}

interface BoundedTimeout {
  kind: "timeout";
}

interface BoundedError {
  kind: "error";
  error: unknown;
}

type BoundedResult<T> =
  BoundedSuccess<T> | BoundedCancelled | BoundedTimeout | BoundedError;

interface EvidenceState {
  sources: EvidenceSource[];
  signatures: Set<string>;
  totalExcerptChars: number;
  truncated: boolean;
  omittedCaptures: number;
}

const consequentialControl =
  /\b(?:buy|checkout|pay|purchase|book|reserve|upload|download|install|delete|remove|publish|post|send|submit|sign[ -]?in|log[ -]?in|consent|authorize|grant)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: string, maximum: number): string {
  return value.length <= maximum ? value : value.slice(0, maximum);
}

function errorText(error: unknown): string {
  return boundedText(
    error instanceof Error ? error.message : String(error),
    MAX_ERROR_CHARS,
  );
}

export function waitForDuration(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

async function runBounded<T>(
  work: (signal: AbortSignal) => Promise<T>,
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
  wait: RlcdDependencies["wait"],
): Promise<BoundedResult<T>> {
  if (parentSignal?.aborted) return { kind: "cancelled" };
  if (timeoutMs <= 0) return { kind: "timeout" };

  const workController = new AbortController();
  const timerController = new AbortController();
  let settleAbort: (() => void) | undefined;
  const abortPromise = new Promise<{ kind: "cancelled" }>((resolve) => {
    settleAbort = () => resolve({ kind: "cancelled" });
  });
  const onParentAbort = () => {
    workController.abort(parentSignal?.reason);
    settleAbort?.();
  };
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });

  const workPromise: Promise<BoundedResult<T>> = Promise.resolve()
    .then(() => work(workController.signal))
    .then(
      (value) => ({ kind: "success", value }),
      (error: unknown) => ({ kind: "error", error }),
    );
  const timeoutPromise: Promise<{ kind: "timeout" | "cancelled" }> = wait(
    timeoutMs,
    timerController.signal,
  ).then(
    () => ({ kind: "timeout" }),
    () => ({ kind: "cancelled" }),
  );

  const settled = await Promise.race([
    workPromise,
    timeoutPromise,
    abortPromise,
  ]);

  timerController.abort();
  parentSignal?.removeEventListener("abort", onParentAbort);
  if (settled.kind === "timeout")
    workController.abort(new Error("time budget expired"));
  if (settled.kind === "cancelled" && !workController.signal.aborted) {
    workController.abort(parentSignal?.reason);
  }
  return settled;
}

function parseNode(value: unknown): SnapshotNode | undefined {
  if (!isRecord(value)) return undefined;
  return {
    ...(typeof value.id === "string" ? { id: value.id } : {}),
    ...(typeof value.role === "string" ? { role: value.role } : {}),
    ...(typeof value.name === "string" ? { name: value.name } : {}),
    ...(typeof value.url === "string" ? { url: value.url } : {}),
    ...(Array.isArray(value.children) ? { children: value.children } : {}),
  };
}

function observationFromSnapshot(value: unknown): Observation | undefined {
  if (!isRecord(value)) return undefined;
  const root = parseNode(value.snapshot);
  if (
    !root ||
    root.role !== "RootWebArea" ||
    typeof root.url !== "string" ||
    root.url.length > MAX_URL_CHARS
  )
    return undefined;

  const captureSignature = createHash("sha256")
    .update(JSON.stringify(value.snapshot))
    .digest("hex");
  const textParts: string[] = [];
  const clickTargets: ClickTarget[] = [];
  let textLength = 0;
  let scannedNodes = 0;
  let textTruncated = false;
  let clickTargetsTruncated = false;
  const stack = [...(root.children ?? [])].reverse();

  while (stack.length > 0) {
    if (scannedNodes >= MAX_SNAPSHOT_NODES) {
      textTruncated = true;
      clickTargetsTruncated = true;
      break;
    }
    scannedNodes += 1;
    const node = parseNode(stack.pop());
    if (!node) continue;

    if (node.children) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push(node.children[index]);
      }
    }

    const name = node.name?.trim();
    if (name) {
      const separatorLength = textParts.length === 0 ? 0 : 1;
      const remaining = MAX_EXCERPT_CHARS - textLength - separatorLength;
      if (remaining > 0) {
        const part = boundedText(name, remaining);
        textParts.push(part);
        textLength += separatorLength + part.length;
        if (part.length < name.length) textTruncated = true;
      } else {
        textTruncated = true;
      }
    }

    const role = node.role?.toLowerCase();
    if (
      node.id &&
      name &&
      (role === "link" || role === "button" || role === "tab") &&
      !consequentialControl.test(name)
    ) {
      if (clickTargets.length < MAX_CLICK_TARGETS) {
        clickTargets.push({
          uid: node.id,
          role,
          label: boundedText(name, MAX_TARGET_LABEL_CHARS),
        });
      } else {
        clickTargetsTruncated = true;
      }
    }
  }

  return {
    url: root.url,
    title: boundedText(root.name?.trim() ?? "", MAX_TARGET_LABEL_CHARS),
    captureSignature,
    text: textParts.join("\n"),
    textTruncated,
    clickTargets,
    clickTargetsTruncated,
  };
}

function externalErrorMessage(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const messages = value
    .filter(isRecord)
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string);
  if (messages.length === 0) return "Chrome CLI returned an error response";
  return boundedText(messages.join(" "), MAX_ERROR_CHARS);
}

function parseCommandResult(
  value: unknown,
  mutation: boolean,
): CommandSuccess | CommandFailure {
  if (!isRecord(value)) {
    return {
      message: "Chrome CLI returned a malformed process result",
      uncertain: mutation,
      killed: false,
    };
  }

  const killed = value.killed === true;
  const code = value.code;
  const stdout = typeof value.stdout === "string" ? value.stdout : "";
  const stderr = typeof value.stderr === "string" ? value.stderr : "";
  if (killed) {
    return {
      message: boundedText(
        stderr || "Chrome CLI process was killed",
        MAX_ERROR_CHARS,
      ),
      uncertain: mutation,
      killed: true,
    };
  }
  if (typeof code !== "number" || code !== 0) {
    return {
      message: boundedText(
        stderr || `Chrome CLI exited with code ${String(code)}`,
        MAX_ERROR_CHARS,
      ),
      uncertain: mutation,
      killed: false,
    };
  }
  if (stdout.length > MAX_CLI_OUTPUT_CHARS) {
    return {
      message: `Chrome CLI output exceeded ${MAX_CLI_OUTPUT_CHARS} characters`,
      uncertain: mutation,
      killed: false,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    return {
      message: "Chrome CLI returned invalid JSON",
      uncertain: mutation,
      killed: false,
    };
  }
  const cliError = externalErrorMessage(parsed);
  if (cliError) {
    return { message: cliError, uncertain: mutation, killed: false };
  }
  const observation = observationFromSnapshot(parsed);
  if (!observation) {
    return {
      message: "Chrome CLI success response did not contain a valid snapshot",
      uncertain: mutation,
      killed: false,
    };
  }
  return { observation };
}

function validateChoice(
  value: unknown,
  offered: readonly string[],
): ChoiceAnswer | undefined {
  if (!isRecord(value)) return undefined;
  if (value.type !== "choice" || typeof value.choice !== "string")
    return undefined;
  if (!offered.includes(value.choice)) return undefined;
  if (
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    !isRecord(value.probabilities)
  ) {
    return undefined;
  }

  const entries = Object.entries(value.probabilities);
  if (entries.length !== offered.length) return undefined;
  const probabilities: Record<string, number> = {};
  let total = 0;
  for (const [candidate, probability] of entries) {
    if (
      !offered.includes(candidate) ||
      typeof probability !== "number" ||
      !Number.isFinite(probability) ||
      probability < 0 ||
      probability > 1
    ) {
      return undefined;
    }
    probabilities[candidate] = probability;
    total += probability;
  }
  if (Math.abs(total - 1) > 0.001) return undefined;
  return { choice: value.choice, confidence: value.confidence, probabilities };
}

function validateDecision(
  value: unknown,
  request: ClassifierRequest,
): ValidDecision | undefined {
  if (!isRecord(value) || !isRecord(value.answers)) return undefined;
  const operation = validateChoice(
    value.answers.operation,
    request.candidates.operations,
  );
  if (!operation) return undefined;

  let clickTarget: ChoiceAnswer | undefined;
  if (request.candidates.clickTargets.length > 0) {
    clickTarget = validateChoice(
      value.answers.click_target,
      request.candidates.clickTargets.map((target) => target.uid),
    );
    if (!clickTarget) return undefined;
  } else if (value.answers.click_target !== undefined) {
    return undefined;
  }

  let usage: ValidDecision["usage"];
  if (value.usage !== undefined) {
    if (!isRecord(value.usage)) return undefined;
    const inputTokens = value.usage.input_tokens;
    const outputTokens = value.usage.output_tokens;
    if (
      typeof inputTokens !== "number" ||
      !Number.isSafeInteger(inputTokens) ||
      inputTokens < 0 ||
      typeof outputTokens !== "number" ||
      !Number.isSafeInteger(outputTokens) ||
      outputTokens < 0
    ) {
      return undefined;
    }
    usage = { inputTokens, outputTokens };
  }

  return {
    operation: { ...operation, choice: operation.choice as Operation },
    ...(clickTarget ? { clickTarget } : {}),
    ...(typeof value.model === "string"
      ? { model: boundedText(value.model, MAX_TARGET_LABEL_CHARS) }
      : {}),
    ...(usage ? { usage } : {}),
  };
}

function addEvidence(
  evidence: EvidenceState,
  observation: Observation,
): boolean {
  if (evidence.signatures.has(observation.captureSignature)) return false;
  evidence.signatures.add(observation.captureSignature);

  if (evidence.sources.length >= MAX_SOURCE_RECORDS) {
    evidence.truncated = true;
    evidence.omittedCaptures += 1;
    return true;
  }

  const remaining = MAX_TOTAL_EVIDENCE_CHARS - evidence.totalExcerptChars;
  if (remaining <= 0) {
    evidence.truncated = true;
    evidence.omittedCaptures += 1;
    return true;
  }

  const excerpt = boundedText(observation.text, remaining);
  const aggregateTruncated = excerpt.length < observation.text.length;
  evidence.sources.push({
    url: observation.url,
    title: observation.title,
    excerpt,
    excerptTruncated: observation.textTruncated || aggregateTruncated,
  });
  evidence.truncated ||= observation.textTruncated;
  evidence.totalExcerptChars += excerpt.length;
  if (
    aggregateTruncated ||
    evidence.totalExcerptChars >= MAX_TOTAL_EVIDENCE_CHARS
  ) {
    evidence.truncated = true;
    return true;
  }
  return false;
}

function makeClassifierRequest(
  goal: string,
  observation: Observation,
  evidence: EvidenceState,
  trace: readonly ActionTraceEntry[],
): ClassifierRequest | undefined {
  const operations: Operation[] = [
    ...(observation.clickTargets.length > 0 ? (["CLICK"] as const) : []),
    "WAIT",
    "DONE",
    "BLOCKED",
  ];
  const request: ClassifierRequest = {
    goal,
    observation: {
      url: observation.url,
      title: observation.title,
      text: observation.text,
      textTruncated: observation.textTruncated,
    },
    candidates: {
      operations,
      clickTargets: observation.clickTargets,
      clickTargetsTruncated: observation.clickTargetsTruncated,
    },
    retainedSources: evidence.sources.map((source) => ({
      url: source.url,
      title: source.title,
      excerptPreview: boundedText(source.excerpt, 120),
    })),
    recentActions: trace.slice(-4).map((entry) => ({
      operation: entry.operation,
      ...(entry.targetLabel ? { targetLabel: entry.targetLabel } : {}),
      outcome: entry.outcome,
    })),
  };
  return JSON.stringify(request).length <= MAX_MODEL_VISIBLE_CHARS
    ? request
    : undefined;
}

function emptyObservation(): Observation {
  return {
    url: "",
    title: "",
    captureSignature: "",
    text: "",
    textTruncated: false,
    clickTargets: [],
    clickTargetsTruncated: false,
  };
}

export function createRlcdBrwsrRunner(dependencies: RlcdDependencies) {
  return async function run(
    input: RlcdRunInput,
    signal?: AbortSignal,
  ): Promise<RlcdRunResult> {
    const goal = boundedText(input.goal.trim(), MAX_GOAL_CHARS);
    const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS;
    const maxSeconds = input.maxSeconds ?? DEFAULT_MAX_SECONDS;
    if (
      goal.length === 0 ||
      goal.length !== input.goal.trim().length ||
      !Number.isInteger(maxSteps) ||
      maxSteps < 1 ||
      maxSteps > MAX_STEPS ||
      !Number.isFinite(maxSeconds) ||
      maxSeconds < 1 ||
      maxSeconds > MAX_SECONDS
    ) {
      throw new RangeError("Invalid goal or run budget");
    }

    const startedAt = dependencies.clock.now();
    const deadline = startedAt + maxSeconds * 1_000;
    const evidence: EvidenceState = {
      sources: [],
      signatures: new Set(),
      totalExcerptChars: 0,
      truncated: false,
      omittedCaptures: 0,
    };
    const trace: ActionTraceEntry[] = [];
    const errors: string[] = [];
    let observation = emptyObservation();
    let classifierCalls = 0;
    let browserCommands = 0;
    let waits = 0;
    let modelInputTokens = 0;
    let modelOutputTokens = 0;
    let unchangedMutationCount = 0;

    const addError = (message: string) => {
      if (errors.length < MAX_ERRORS)
        errors.push(boundedText(message, MAX_ERROR_CHARS));
    };
    const finish = (stopReason: StopReason): RlcdRunResult => ({
      status: stopReason === "done_claim" ? "completion_claim" : "stopped",
      stopReason,
      completionClaim: {
        claimed: stopReason === "done_claim",
        requiresIndependentVerification: true,
        sourceCoverageComplete: false,
      },
      finalPage: {
        url: observation.url,
        title: observation.title,
        excerpt: observation.text,
        excerptTruncated: observation.textTruncated,
      },
      evidence: {
        sources: evidence.sources,
        totalExcerptChars: evidence.totalExcerptChars,
        truncated: evidence.truncated,
        omittedCaptures: evidence.omittedCaptures,
      },
      trace,
      errors,
      metrics: {
        elapsedMs: Math.max(0, dependencies.clock.now() - startedAt),
        classifierCalls,
        browserCommands,
        waits,
        modelInputTokens,
        modelOutputTokens,
      },
      limits: {
        maxSourceRecords: MAX_SOURCE_RECORDS,
        maxExcerptChars: MAX_EXCERPT_CHARS,
        maxTotalEvidenceChars: MAX_TOTAL_EVIDENCE_CHARS,
        maxModelVisibleChars: MAX_MODEL_VISIBLE_CHARS,
      },
    });
    const remainingMs = () => deadline - dependencies.clock.now();
    const runCli = async (
      argv: readonly string[],
      mutation: boolean,
    ): Promise<CommandSuccess | RlcdRunResult> => {
      browserCommands += 1;
      const execution = await runBounded(
        (operationSignal) =>
          dependencies.cli(argv, {
            signal: operationSignal,
            timeoutMs: Math.max(1, remainingMs()),
          }),
        signal,
        remainingMs(),
        dependencies.wait,
      );
      if (execution.kind === "cancelled") {
        return finish(mutation ? "uncertain_execution" : "cancelled");
      }
      if (execution.kind === "timeout") {
        return finish(mutation ? "uncertain_execution" : "time_budget");
      }
      if (execution.kind === "error") {
        addError(errorText(execution.error));
        return finish(mutation ? "uncertain_execution" : "command_failed");
      }

      const parsed = parseCommandResult(execution.value, mutation);
      if ("message" in parsed) {
        addError(parsed.message);
        if (parsed.killed && signal?.aborted && !parsed.uncertain)
          return finish("cancelled");
        return finish(
          parsed.uncertain ? "uncertain_execution" : "command_failed",
        );
      }
      return parsed;
    };

    if (signal?.aborted) return finish("cancelled");
    const initial = await runCli(
      ["take_snapshot", "--output-format=json"],
      false,
    );
    if ("status" in initial) return initial;
    observation = initial.observation;
    if (addEvidence(evidence, observation)) return finish("evidence_budget");

    for (let step = 1; step <= maxSteps; step += 1) {
      if (signal?.aborted) return finish("cancelled");
      if (remainingMs() <= 0) return finish("time_budget");

      const request = makeClassifierRequest(goal, observation, evidence, trace);
      if (!request) {
        addError("Model-visible state exceeded its configured bound");
        return finish("evidence_budget");
      }
      classifierCalls += 1;
      const classified = await runBounded(
        (operationSignal) =>
          dependencies.classifier(request, { signal: operationSignal }),
        signal,
        remainingMs(),
        dependencies.wait,
      );
      if (classified.kind === "cancelled") return finish("cancelled");
      if (classified.kind === "timeout") return finish("time_budget");
      if (classified.kind === "error") {
        addError(errorText(classified.error));
        return finish("classifier_failed");
      }
      if (signal?.aborted) return finish("cancelled");
      if (remainingMs() <= 0) return finish("time_budget");

      const decision = validateDecision(classified.value, request);
      if (!decision) {
        addError("Classifier returned a malformed or unoffered choice");
        return finish("invalid_classifier_response");
      }
      if (decision.usage) {
        modelInputTokens += decision.usage.inputTokens;
        modelOutputTokens += decision.usage.outputTokens;
      }

      const baseTrace: ActionTraceEntry = {
        step,
        operation: decision.operation.choice,
        outcome: "selected",
        ...(decision.model ? { model: decision.model } : {}),
        operationProbabilities: decision.operation.probabilities,
        ...(decision.clickTarget
          ? { targetProbabilities: decision.clickTarget.probabilities }
          : {}),
      };

      if (decision.operation.choice === "DONE") {
        trace.push({ ...baseTrace, outcome: "completion_claimed" });
        return finish("done_claim");
      }
      if (decision.operation.choice === "BLOCKED") {
        trace.push({ ...baseTrace, outcome: "blocked" });
        return finish("blocked");
      }
      if (decision.operation.choice === "WAIT") {
        trace.push({ ...baseTrace, outcome: "waited" });
        waits += 1;
        const waited = await runBounded(
          (waitSignal) => dependencies.wait(WAIT_MILLISECONDS, waitSignal),
          signal,
          remainingMs(),
          dependencies.wait,
        );
        if (waited.kind === "cancelled") return finish("cancelled");
        if (waited.kind === "timeout") return finish("time_budget");
        if (waited.kind === "error") {
          if (signal?.aborted) return finish("cancelled");
          addError(errorText(waited.error));
          return finish("command_failed");
        }
        const refreshed = await runCli(
          ["take_snapshot", "--output-format=json"],
          false,
        );
        if ("status" in refreshed) return refreshed;
        observation = refreshed.observation;
        if (addEvidence(evidence, observation))
          return finish("evidence_budget");
        continue;
      }

      const selectedUid = decision.clickTarget?.choice;
      const target = observation.clickTargets.find(
        (candidate) => candidate.uid === selectedUid,
      );
      if (!selectedUid || !target) {
        addError("Classifier selected a click target that was not offered");
        return finish("invalid_classifier_response");
      }
      const traceIndex = trace.push({
        ...baseTrace,
        targetUid: target.uid,
        targetLabel: target.label,
        outcome: "executing",
      });
      const clicked = await runCli(
        ["click", target.uid, "--includeSnapshot", "--output-format=json"],
        true,
      );
      if ("status" in clicked) {
        trace[traceIndex - 1] = {
          ...trace[traceIndex - 1]!,
          outcome: clicked.stopReason,
        };
        return clicked;
      }
      trace[traceIndex - 1] = {
        ...trace[traceIndex - 1]!,
        outcome: "observed",
      };
      const stateUnchanged =
        clicked.observation.captureSignature === observation.captureSignature;
      unchangedMutationCount = stateUnchanged ? unchangedMutationCount + 1 : 0;
      observation = clicked.observation;
      if (addEvidence(evidence, observation)) return finish("evidence_budget");
      if (unchangedMutationCount >= 3) return finish("unchanged_state");
    }

    return finish("step_budget");
  };
}

export type PiExec = (
  command: string,
  args: string[],
  options: { signal?: AbortSignal; timeout?: number },
) => Promise<unknown>;

export function createChromeCliExecutor(exec: PiExec): CliExecutor {
  return (argv, options) =>
    exec("chrome-devtools", [...argv], {
      signal: options.signal,
      timeout: options.timeoutMs,
    });
}

const toolParameters = Type.Object({
  goal: Type.String({
    minLength: 1,
    maxLength: MAX_GOAL_CHARS,
    description:
      "The browser goal. A completion claim still requires independent verification.",
  }),
  maxSteps: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: MAX_STEPS,
      description: `Maximum classifier decisions (default ${DEFAULT_MAX_STEPS})`,
    }),
  ),
  maxSeconds: Type.Optional(
    Type.Number({
      minimum: 1,
      maximum: MAX_SECONDS,
      description: `Wall-clock budget in seconds (default ${DEFAULT_MAX_SECONDS})`,
    }),
  ),
});

export interface RegistrationOptions {
  runner?: ReturnType<typeof createRlcdBrwsrRunner>;
}

export function registerRlcdBrwsr(
  pi: ExtensionAPI,
  options: RegistrationOptions = {},
): void {
  const runner =
    options.runner ??
    createRlcdBrwsrRunner({
      classifier: async (_request, context) => {
        context.signal.throwIfAborted();
        throw new Error(
          "No classifier adapter is configured. Load an explicitly injected fixture adapter for the offline slice.",
        );
      },
      cli: createChromeCliExecutor(pi.exec.bind(pi) as PiExec),
      clock: { now: () => Date.now() },
      wait: waitForDuration,
    });

  pi.registerTool({
    name: "rlcd_brwsr_run",
    label: "RLCD-brwsr",
    description:
      "Run a bounded CLICK/WAIT browser loop on the page selected by Chrome DevTools CLI. Returns copied page evidence and a completion claim that the outer agent must independently verify.",
    promptSnippet:
      "Run a bounded browser fast loop and return retained source evidence",
    promptGuidelines: [
      "Use rlcd_brwsr_run only for already-authorized browser work, and independently verify any completion claim it returns.",
    ],
    parameters: toolParameters,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal) {
      const result = await runner(params, signal);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });
}

export default function rlcdBrwsrExtension(pi: ExtensionAPI): void {
  registerRlcdBrwsr(pi);
}
