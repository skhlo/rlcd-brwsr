import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import rlcdBrwsrExtension, {
  createRlcdBrwsrExtension,
  interpretRlcdChildOutcome,
  superviseRlcdProcess,
  type RlcdChildOutcome,
} from "../config/pi/extensions/rlcd-brwsr.ts";
import {
  ReadReadyFixtureError,
  type ReadReadyRunner,
  withReadReadyRunner,
} from "./read-ready-fixture.ts";

interface RlcdInput {
  url?: string;
  targetId?: string;
  goal: string;
  maxSeconds?: number;
  retainTab?: boolean;
  [key: string]: unknown;
}

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  details: unknown;
  usage?: unknown;
}

interface RegisteredTool {
  name: string;
  description: string;
  parameters: {
    properties?: Record<string, unknown>;
  };
  executionMode?: string;
  execute(
    toolCallId: string,
    params: RlcdInput,
    signal: AbortSignal | undefined,
    onUpdate?: (result: ToolResult) => void,
  ): Promise<ToolResult>;
}

interface ScenarioOptions {
  toolName?: "rlcd_brwsr_run" | "rlcd_brwsr_list_tabs";
  helperKey?: string | null;
  typesafeKey?: string | null;
  textModel?: string;
  signal?: AbortSignal;
  abortWhenModelStarts?: AbortController;
  abortWhenReportStarts?: AbortController;
  abortAfterTermAcknowledgement?: AbortController;
  params?: Partial<RlcdInput>;
  omitDefaultUrl?: boolean;
  sharedBrowserState?: string;
  nativeEnvironment?: string;
  deferExternalFakesUntilNativeEnvironment?: boolean;
}

interface ScenarioMarkers {
  argv: string;
  stdin: string;
  browser: string;
  field: string;
  model: string;
  report: string;
  pid: string;
  termAcknowledgement: string;
}

interface ScenarioAbortObservation {
  readonly acknowledgement: string;
  readonly requested: boolean;
  readonly signalAborted: boolean;
  readonly toolPendingAtRequest: boolean;
}

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fakePythonPath = join(repositoryRoot, "test", "python");
const deferredFakePythonPath = join(fakePythonPath, "deferred_sitecustomize");
const syntheticTypesafeKey = "synthetic-typesafe-key-MOON-62";
const syntheticHelperKey = "synthetic-deepseek-key-STAR-73";
const syntheticNativeTypesafeKey = "synthetic-native-typesafe-key-NOVA-19";
const syntheticNativeHelperKey = "synthetic-native-env-key-COMET-84";
const testRuntimeConfig: unknown = JSON.parse(
  readFileSync(join(repositoryRoot, "config", "runtime.json"), "utf8"),
);
if (
  !isRecord(testRuntimeConfig) ||
  !Number.isInteger(testRuntimeConfig.terminalMaxUtf8Bytes) ||
  Number(testRuntimeConfig.terminalMaxUtf8Bytes) <= 0
) {
  throw new Error("runtime configuration must define terminalMaxUtf8Bytes");
}
const terminalByteLimit = Number(testRuntimeConfig.terminalMaxUtf8Bytes);
const fragmentedReportLines = [
  `Context ${"x".repeat(110)}`,
  "Total:",
  "$12",
  ...Array.from(
    { length: 48 },
    (_, index) =>
      `Field ${String(index).padStart(3, "0")}: synthetic value ${String(index).padStart(3, "0")}.`,
  ),
];
const fragmentedReportText = fragmentedReportLines.join("\n");
const duplicateReportRecords = [
  "November 9, 1914",
  ";  November 9, 1914",
  "November 9, 1914",
  "Signed balance: +12 USD",
  "Signed balance: -12 USD",
  "Price: $12 per month",
  "Price: €12 per month",
  "Release: v1.2",
  "Release: v1-2",
  "Capacity: 12 GB",
  "Capacity: 12 GiB",
  "Plan includes support",
  "Plan includes support; excludes setup",
  ";excluded",
  "excluded",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function detailsOf(result: ToolResult): Record<string, unknown> {
  assert.ok(isRecord(result.details), "tool details must be an object");
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0]?.type, "text");
  const content: unknown = JSON.parse(result.content[0]?.text ?? "");
  assert.ok(isRecord(content), "model-facing content must be an object");
  if (Object.hasOwn(result.details, "tabs")) {
    assert.deepEqual(
      content,
      result.details,
      "discovery remains compact and unchanged",
    );
  } else {
    assert.deepEqual(Object.keys(content), [
      "outcome",
      "lastObservedLocation",
      "evidence",
      "cleanup",
      "diagnostic",
      "reporting",
      "output",
    ]);
    assert.equal(Object.hasOwn(content, "history"), false);
    assert.equal(Object.hasOwn(content, "models"), false);
    assert.equal(Object.hasOwn(content, "usage"), false);
    assert.equal(Object.hasOwn(content, "lastObservation"), false);
    assert.notDeepEqual(content, result.details);
    const outcome = recordField(content, "outcome");
    assert.equal(outcome.status, result.details.status);
    assert.equal(outcome.stopReason, result.details.stopReason);
    assert.equal(outcome.execution, result.details.execution);
    assert.deepEqual(outcome.completionClaim, result.details.completionClaim);
    assert.deepEqual(content.cleanup, result.details.cleanup);
    assert.deepEqual(content.diagnostic, result.details.diagnostic);
    assert.ok(
      Buffer.byteLength(result.content[0]?.text ?? "", "utf8") <=
        terminalByteLimit,
    );
    assert.ok(
      Buffer.byteLength(JSON.stringify(result.details), "utf8") <=
        terminalByteLimit,
    );
  }
  assert.equal(
    result.usage,
    undefined,
    "native usage must not enter Pi totals",
  );
  return result.details;
}

function compactOf(result: ToolResult): Record<string, unknown> {
  const value: unknown = JSON.parse(result.content[0]?.text ?? "");
  assert.ok(isRecord(value));
  return value;
}

function serializedSurfaces(result: ToolResult): string {
  return `${result.content[0]?.text ?? ""}\n${JSON.stringify(result.details)}`;
}

function recordField(
  owner: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = owner[key];
  assert.ok(isRecord(value), `${key} must be an object`);
  return value;
}

function arrayField(owner: Record<string, unknown>, key: string): unknown[] {
  const value = owner[key];
  assert.ok(Array.isArray(value), `${key} must be an array`);
  return value;
}

function assertTextHelperAvailabilityAbsent(
  details: Record<string, unknown>,
): void {
  const models = recordField(details, "models");
  const textHelper = recordField(models, "textHelper");
  assert.equal(
    Object.hasOwn(textHelper, "availability"),
    false,
    "run results must not claim text-helper availability",
  );
}

function terminalDetails(
  options: {
    status?: "completion_claim" | "blocked" | "stopped" | "error";
    stopReason?: string;
    execution?: "not_started" | "unknown" | "completed";
    targetId?: string | null;
    taskTab?:
      | "not_created"
      | "not_owned"
      | "unknown"
      | "retained"
      | "closed"
      | "unconfirmed";
    borrowed?: boolean;
    focusEmulation?:
      "not_applied" | "disable_acknowledged" | "unconfirmed" | "unknown";
    attachment?:
      "not_acquired" | "detach_acknowledged" | "unconfirmed" | "unknown";
    observationText?: string;
  } = {},
): Record<string, unknown> {
  const status = options.status ?? "stopped";
  return {
    status,
    stopReason: options.stopReason ?? "cancelled",
    completionClaim: {
      claimed: status === "completion_claim",
      requiresIndependentVerification: true,
    },
    execution: options.execution ?? "unknown",
    lastObservation: {
      url: "https://example.test/result",
      title: "Fixture result",
      text: options.observationText ?? "",
    },
    history: [],
    models: {
      jev: { configuredModel: "jev-1.13.0" },
      textHelper: {
        configuredModel: "deepseek-flash",
        baseUrl: "https://api.deepseek.com/v1",
        reasoning: "disabled",
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
    targetId: options.targetId ?? null,
    cleanup: {
      taskTab: options.taskTab ?? (options.borrowed ? "not_owned" : "unknown"),
      ...(options.borrowed
        ? {
            focusEmulation: options.focusEmulation ?? "unknown",
            attachment: options.attachment ?? "unknown",
          }
        : {}),
      sharedDaemon: "retained",
    },
    diagnostic: null,
    reporting: {
      status: "missing",
      sourceCoverage: "unavailable",
      sourceOmitted: false,
      selectionOmitted: false,
      candidateCount: 0,
      qualifyingCandidateCount: null,
      selectedCount: 0,
      deduplicatedCandidateCount: 0,
      omittedQualifyingCandidateCount: 0,
      evidence: [],
      diagnostic: null,
    },
    output: {
      byteLimit: terminalByteLimit,
      clipped: false,
      omissions: [],
    },
  };
}

function childOutcome(
  details: Record<string, unknown> | null,
  overrides: Partial<RlcdChildOutcome> = {},
): RlcdChildOutcome {
  return {
    terminal: details
      ? Buffer.from(JSON.stringify(details), "utf8")
      : Buffer.alloc(0),
    stdoutOverflow: false,
    stderrBytes: 0,
    firstStop: null,
    exitObserved: true,
    exitCode: 0,
    exitSignal: null,
    processStarted: true,
    spawnError: false,
    ...overrides,
  };
}

function nearLimitTerminal(): Record<string, unknown> {
  const details = terminalDetails();
  const records = arrayField(recordField(details, "usage"), "records");
  const size = () => Buffer.byteLength(JSON.stringify(details), "utf8");
  let index = 0;
  while (size() < terminalByteLimit) {
    const fixedRecord = {
      source: "jev_decision",
      model: `fixture-${index}`,
      usage: { padding: "" },
    };
    records.push(fixedRecord);
    const available = terminalByteLimit - size();
    if (available < 0) {
      records.pop();
      const previous = records.at(-1) as {
        usage: { padding: string };
      };
      previous.usage.padding += "P".repeat(terminalByteLimit - size());
      break;
    }
    const padding = Math.min(2_020, available);
    fixedRecord.usage.padding = "P".repeat(padding);
    index += 1;
    if (padding < 2_020) break;
  }
  assert.equal(size(), terminalByteLimit);
  assert.ok(records.length <= 24);
  return details;
}

function nearLimitOmissionTerminal(
  minimal: boolean,
  includeReporting = true,
): Record<string, unknown> {
  const details = terminalDetails(
    minimal
      ? {
          status: "error",
          stopReason: "synthetic_error",
          execution: "not_started",
          taskTab: "not_created",
        }
      : {
          status: "completion_claim",
          stopReason: "done",
          execution: "completed",
          targetId: "synthetic-target",
          taskTab: "closed",
        },
  );
  if (minimal) {
    details.lastObservation = null;
    details.targetId = null;
    details.models = {
      jev: { configuredModel: "" },
      textHelper: { configuredModel: "", baseUrl: "", reasoning: "" },
    };
  }
  if (!includeReporting) {
    delete details.reporting;
    details.targetId = "opaque-pressure-target";
    details.execution = "unknown";
    recordField(details, "cleanup").taskTab = "unconfirmed";
    details.diagnostic = {
      type: "FixtureDiagnostic",
      message: "Original browser diagnostic; not a reporting error.",
    };
  }
  const output = recordField(details, "output");
  const labels = Array.from(
    { length: 32 },
    (_, index) => `synthetic-omission-${String(index).padStart(2, "0")}-`,
  );
  output.clipped = true;
  output.omissions = labels;
  const size = () => Buffer.byteLength(JSON.stringify(details), "utf8");
  let target = terminalByteLimit - 44;
  if (!includeReporting) {
    const cleanup = recordField(details, "cleanup");
    const beforeProcessEvidence = size();
    cleanup.bridgeProcess = "reaped";
    const processEvidenceBytes = size() - beforeProcessEvidence;
    delete cleanup.bridgeProcess;
    target = terminalByteLimit - processEvidenceBytes;
  }
  const available = target - size();
  assert.ok(available >= 0);
  const each = Math.floor(available / labels.length);
  let remainder = available % labels.length;
  for (let index = 0; index < labels.length; index += 1) {
    labels[index] += "L".repeat(each + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder -= 1;
  }
  assert.equal(size(), target);
  return details;
}

async function productionReportingPressureTerminals(): Promise<
  Record<string, Record<string, unknown>>
> {
  const directory = await mkdtemp(join(tmpdir(), "rlcd-usage-pressure-test-"));
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let closed = false;
  const child = spawn(
    join(repositoryRoot, ".venv", "bin", "python"),
    [
      "-I",
      "-B",
      "-c",
      'import runpy, sys; sys.path.insert(0, sys.argv[1]); runpy.run_path(sys.argv[2], run_name="__main__")',
      join(repositoryRoot, "bridge"),
      join(fakePythonPath, "reporting_pressure_terminals.py"),
    ],
    {
      cwd: repositoryRoot,
      env: {
        HOME: directory,
        TMPDIR: directory,
        PATH: process.env.PATH,
        PYTHONNOUSERSITE: "1",
        PYTHONDONTWRITEBYTECODE: "1",
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  child.on("error", () => {
    // The close result and captured stderr own the fixture outcome.
  });
  const close = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolveClose) => {
    child.once("close", (code, signal) => {
      closed = true;
      resolveClose({ code, signal });
    });
  });

  try {
    const result = await within(close, 3_000, "reporting pressure projection");
    assert.equal(result.code, 0, Buffer.concat(stderr).toString("utf8"));
    assert.equal(result.signal, null);
    const parsed: unknown = JSON.parse(Buffer.concat(stdout).toString("utf8"));
    assert.ok(isRecord(parsed));
    assert.ok(isRecord(parsed.oneRemainingSlot));
    assert.ok(isRecord(parsed.noRemainingSlots));
    return parsed as Record<string, Record<string, unknown>>;
  } finally {
    if (!closed) child.kill("SIGTERM");
    if (!closed) {
      try {
        await within(close, 500, "reporting pressure TERM shutdown");
      } catch {
        if (!closed) child.kill("SIGKILL");
      }
    }
    if (!closed) {
      await within(close, 1_000, "reporting pressure KILL shutdown");
    }
    await rm(directory, { recursive: true });
  }
}

function registeredTool(
  extension: typeof rlcdBrwsrExtension = rlcdBrwsrExtension,
  name = "rlcd_brwsr_run",
): RegisteredTool {
  type CapturedTool = RegisteredTool & {
    execute(
      toolCallId: string,
      params: RlcdInput,
      signal: AbortSignal | undefined,
      onUpdate: ((result: ToolResult) => void) | undefined,
      ctx: ExtensionContext,
    ): Promise<ToolResult>;
  };

  const registered: CapturedTool[] = [];
  const pi = {
    registerTool(tool: CapturedTool) {
      registered.push(tool);
    },
  } as unknown as ExtensionAPI;

  extension(pi);
  const captured = registered.find((tool) => tool.name === name);
  assert.ok(captured, `expected registered tool ${name}`);
  return {
    ...captured,
    execute(toolCallId, params, signal, onUpdate) {
      return captured.execute(
        toolCallId,
        params,
        signal,
        onUpdate,
        {} as ExtensionContext,
      );
    },
  };
}

async function readIfPresent(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

async function waitForScenarioMarker(
  path: string,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = (await readIfPresent(path)).trim();
    if (value) return value;
    await delay(10);
  }
  throw new Error(
    `expected child marker was not reached within ${timeoutMs} ms`,
  );
}

async function runScenario(
  scenario: string,
  options: ScenarioOptions = {},
): Promise<{
  result: ToolResult;
  directory: string;
  markers: ScenarioMarkers;
  abortObservation: ScenarioAbortObservation | undefined;
  cleanup(): Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), "rlcd-thin-test-"));
  const markers = {
    argv: join(directory, "argv.json"),
    stdin: join(directory, "stdin.json"),
    browser: join(directory, "browser.log"),
    field: join(directory, "field.log"),
    model: join(directory, "model.log"),
    report: join(directory, "report.json"),
    pid: join(directory, "pid.txt"),
    termAcknowledgement: join(directory, "term-acknowledged.txt"),
  };
  if (options.nativeEnvironment !== undefined) {
    await writeFile(join(directory, ".env"), options.nativeEnvironment, "utf8");
  }
  const environment: Record<string, string | undefined> = {
    HOME: directory,
    XDG_CONFIG_HOME: join(directory, ".config"),
    TMPDIR: directory,
    BH_HOME: join(directory, "bh-home"),
    BH_CONFIG_DIR: join(directory, "bh-config"),
    BH_TMP_DIR: join(directory, "bh-tmp"),
    RLCD_TEST_SCENARIO: scenario,
    RLCD_TEST_ARGV_MARKER: markers.argv,
    RLCD_TEST_STDIN_MARKER: markers.stdin,
    RLCD_TEST_BROWSER_MARKER: markers.browser,
    RLCD_TEST_FIELD_MARKER: markers.field,
    RLCD_TEST_MODEL_MARKER: markers.model,
    RLCD_TEST_REPORT_MARKER: markers.report,
    RLCD_TEST_PID_MARKER: markers.pid,
    RLCD_TEST_TERM_ACK_MARKER: markers.termAcknowledgement,
    RLCD_TEST_SHARED_STATE_MARKER: options.sharedBrowserState,
    BH_AGENT_WORKSPACE: directory,
    BU_NAME: "rlcd-brwsr-test",
    BU_CDP_URL: "http://127.0.0.1:43114",
    TYPESAFE_API_KEY:
      options.typesafeKey === null
        ? undefined
        : (options.typesafeKey ?? syntheticTypesafeKey),
    TEXT_MODEL_API_KEY:
      options.helperKey === null
        ? undefined
        : (options.helperKey ?? syntheticHelperKey),
    TEXT_MODEL_BASE_URL: undefined,
    TEXT_MODEL: options.textModel,
    TEXT_MODEL_REASONING: undefined,
    RLCD_BASE_FAKE: join(fakePythonPath, "sitecustomize.py"),
    PYTHONPATH: [
      options.deferExternalFakesUntilNativeEnvironment
        ? deferredFakePythonPath
        : fakePythonPath,
      process.env.PYTHONPATH,
    ]
      .filter((value): value is string => Boolean(value))
      .join(delimiter),
  };
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(environment)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  try {
    const abortController =
      options.abortWhenModelStarts ??
      options.abortWhenReportStarts ??
      options.abortAfterTermAcknowledgement;
    const abortMarker = options.abortWhenModelStarts
      ? markers.model
      : options.abortWhenReportStarts
        ? markers.report
        : markers.termAcknowledgement;
    let toolSettled = false;
    const toolWork = registeredTool(
      rlcdBrwsrExtension,
      options.toolName ?? "rlcd_brwsr_run",
    )
      .execute(
        "test-call",
        (options.toolName === "rlcd_brwsr_list_tabs"
          ? {}
          : {
              ...(options.omitDefaultUrl
                ? {}
                : { url: "https://example.test/start" }),
              goal: "Complete the deterministic fixture",
              ...options.params,
            }) as RlcdInput,
        options.signal,
      )
      .then(
        (result) => {
          toolSettled = true;
          return { kind: "result" as const, result };
        },
        (error: unknown) => {
          toolSettled = true;
          return { kind: "error" as const, error };
        },
      );
    const watcherWork = abortController
      ? (async () => {
          const acknowledgement = await waitForScenarioMarker(
            abortMarker,
            2_000,
          );
          if (toolSettled) {
            throw new Error(
              "expected child marker arrived after the tool operation settled",
            );
          }
          abortController.abort();
          return Object.freeze({
            acknowledgement,
            requested: true,
            signalAborted: abortController.signal.aborted,
            toolPendingAtRequest: true,
          });
        })().then(
          (observation) => ({ kind: "observation" as const, observation }),
          (error: unknown) => {
            abortController.abort();
            return { kind: "error" as const, error };
          },
        )
      : Promise.resolve({ kind: "none" as const });
    const [toolOutcome, watcherOutcome] = await Promise.all([
      toolWork,
      watcherWork,
    ]);
    const failures: unknown[] = [];
    if (watcherOutcome.kind === "error") failures.push(watcherOutcome.error);
    if (toolOutcome.kind === "error") failures.push(toolOutcome.error);
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(
        failures,
        "scenario work and watcher both failed",
      );
    }
    assert.equal(toolOutcome.kind, "result");
    return {
      result: toolOutcome.result,
      directory,
      markers,
      abortObservation:
        watcherOutcome.kind === "observation"
          ? watcherOutcome.observation
          : undefined,
      async cleanup() {
        await rm(directory, { recursive: true });
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true });
    throw error;
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function withScenario(
  scenario: string,
  options: ScenarioOptions,
  assertion: (
    run: Awaited<ReturnType<typeof runScenario>>,
  ) => Promise<void> | void,
): Promise<void> {
  const run = await runScenario(scenario, options);
  try {
    await assertion(run);
  } finally {
    await run.cleanup();
  }
}

async function within<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} exceeded ${timeoutMs} ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readReadyFixtureDirectories(): Promise<string[]> {
  return (await readdir(tmpdir(), { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isDirectory() && entry.name.startsWith("rlcd-read-ready-test-"),
    )
    .map((entry) => entry.name)
    .sort();
}

function assertProcessGone(pid: number): void {
  assert.throws(
    () => process.kill(pid, 0),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ESRCH",
  );
}

async function runPreflightCase(options: {
  processHelperKey?: string;
  workspaceHelperKey?: string;
}): Promise<Record<string, unknown>> {
  const directory = await mkdtemp(join(tmpdir(), "rlcd-preflight-test-"));
  await writeFile(
    join(directory, ".env"),
    options.workspaceHelperKey === undefined
      ? ""
      : `TEXT_MODEL_API_KEY=${options.workspaceHelperKey}\n`,
    "utf8",
  );
  const environment: NodeJS.ProcessEnv = {
    HOME: directory,
    TMPDIR: directory,
    PATH: process.env.PATH,
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONPATH: deferredFakePythonPath,
    RLCD_BASE_FAKE: join(fakePythonPath, "sitecustomize.py"),
    RLCD_TEST_SCENARIO: "done",
    BH_AGENT_WORKSPACE: directory,
    BU_NAME: "rlcd-brwsr-test",
    BU_CDP_URL: "http://127.0.0.1:43114",
    TYPESAFE_API_KEY: syntheticTypesafeKey,
  };
  if (options.processHelperKey !== undefined) {
    environment.TEXT_MODEL_API_KEY = options.processHelperKey;
  }

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let closed = false;
  const child = spawn(
    join(repositoryRoot, ".venv", "bin", "python"),
    [join(repositoryRoot, "bridge", "preflight.py")],
    {
      cwd: repositoryRoot,
      env: environment,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  child.on("error", () => {
    // The close result and captured stderr own the fixture outcome.
  });
  const close = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolveClose) => {
    child.once("close", (code, signal) => {
      closed = true;
      resolveClose({ code, signal });
    });
  });

  try {
    const result = await within(close, 3_000, "preflight fixture");
    assert.equal(
      result.code,
      0,
      `${Buffer.concat(stdout).toString("utf8")}\n${Buffer.concat(stderr).toString("utf8")}`,
    );
    assert.equal(result.signal, null);
    const output = JSON.parse(Buffer.concat(stdout).toString("utf8")) as Record<
      string,
      unknown
    >;
    assert.equal(output.ok, true);
    return recordField(output, "checks");
  } finally {
    if (!closed) child.kill("SIGTERM");
    if (!closed) {
      try {
        await within(close, 500, "preflight TERM shutdown");
      } catch {
        if (!closed) child.kill("SIGKILL");
      }
    }
    if (!closed) await within(close, 1_000, "preflight KILL shutdown");
    await rm(directory, { recursive: true });
  }
}

test("the extension loads inertly and registers discovery plus the extended sequential run tool", () => {
  const listTool = registeredTool(rlcdBrwsrExtension, "rlcd_brwsr_list_tabs");
  assert.equal(listTool.executionMode, "sequential");
  assert.deepEqual(Object.keys(listTool.parameters.properties ?? {}), []);
  assert.match(listTool.description, /read-only discovery/i);

  const runTool = registeredTool();
  assert.equal(runTool.executionMode, "sequential");
  assert.deepEqual(Object.keys(runTool.parameters.properties ?? {}).sort(), [
    "goal",
    "maxSeconds",
    "retainTab",
    "targetId",
    "url",
  ]);
  assert.doesNotMatch(runTool.description, /maxActions|action budget/i);
});

test("reporting bounds cover the pinned 6000-character visible-text source", () => {
  const snapshot = readFileSync(
    join(
      repositoryRoot,
      ".venv",
      "lib",
      "python3.12",
      "site-packages",
      "jev_ultrafast",
      "snapshot.js",
    ),
    "utf8",
  );
  assert.match(snapshot, /words\.join\('\\n'\)\.slice\(0,6000\)/);
  const reporter = readFileSync(
    join(repositoryRoot, "bridge", "handoff_report.py"),
    "utf8",
  );
  assert.match(reporter, /REPORT_SOURCE_MAX_UTF8_BYTES = 24_576/);
  assert.match(reporter, /REPORT_CANDIDATE_LIMIT = 128/);
  assert.match(reporter, /REPORT_REQUEST_MAX_UTF8_BYTES = 98_304/);
});

test("discovery needs no model keys and deterministically distinguishes same-URL tabs", async () => {
  await withScenario(
    "list_tabs",
    {
      toolName: "rlcd_brwsr_list_tabs",
      typesafeKey: null,
      helperKey: null,
      nativeEnvironment: "",
    },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "ok");
      assert.equal(details.diagnostic, null);
      const tabs = arrayField(details, "tabs") as Array<
        Record<string, unknown>
      >;
      assert.deepEqual(
        tabs.map((tab) => tab.targetId),
        ["TAB-A", "TAB-BLANK", "TAB-Z"],
      );
      assert.equal(tabs[0]?.url, tabs[2]?.url);
      assert.notEqual(tabs[0]?.targetId, tabs[2]?.targetId);
      assert.equal(await readIfPresent(markers.model), "");
      const browserLog = await readIfPresent(markers.browser);
      assert.match(browserLog, /^get-targets\n$/);
      assert.doesNotMatch(browserLog, /attach:|created:|navigate:|focus:/);
    },
  );
});

test("discovery accepts structurally valid URL display metadata after redaction", async () => {
  for (const [scenario, expectedUrl] of [
    ["list_redacted_host", "https://[REDACTED]/"],
    ["list_redacted_path", "https://example.test/path/[REDACTED]"],
  ] as const) {
    await withScenario(
      scenario,
      { toolName: "rlcd_brwsr_list_tabs" },
      ({ result }) => {
        const details = detailsOf(result);
        assert.equal(details.status, "ok");
        const tabs = arrayField(details, "tabs") as Array<
          Record<string, unknown>
        >;
        assert.equal(tabs.length, 1);
        assert.equal(tabs[0]?.url, expectedUrl);
        assert.doesNotMatch(
          result.content[0]?.text ?? "",
          new RegExp(syntheticHelperKey),
        );
      },
    );
  }
});

test("discovery omits blank IDs without invalidating valid entries", async () => {
  await withScenario(
    "list_blank_id",
    {
      toolName: "rlcd_brwsr_list_tabs",
      typesafeKey: null,
      helperKey: null,
      nativeEnvironment: "",
    },
    ({ result }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "ok");
      const tabs = arrayField(details, "tabs") as Array<
        Record<string, unknown>
      >;
      assert.deepEqual(
        tabs.map((tab) => tab.targetId),
        ["VALID-PAGE-ID"],
      );
      assert.equal(recordField(details, "output").omittedTabs, 1);
    },
  );
});

test("discovery orders opaque IDs by UTF-8 bytes across Python and TypeScript", async () => {
  await withScenario(
    "list_unicode_ids",
    {
      toolName: "rlcd_brwsr_list_tabs",
      typesafeKey: null,
      helperKey: null,
      nativeEnvironment: "",
    },
    ({ result }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "ok");
      const tabs = arrayField(details, "tabs") as Array<
        Record<string, unknown>
      >;
      assert.deepEqual(
        tabs.map((tab) => tab.targetId),
        ["\ue000", "\u{10000}"],
      );
    },
  );
});

test("discovery redacts keys loaded only by the native workspace, including load failures", async () => {
  const nativeEnvironment = [
    `TYPESAFE_API_KEY=${syntheticNativeTypesafeKey}`,
    `TEXT_MODEL_API_KEY=${syntheticNativeHelperKey}`,
    "",
  ].join("\n");
  const options: ScenarioOptions = {
    toolName: "rlcd_brwsr_list_tabs",
    typesafeKey: null,
    helperKey: null,
    nativeEnvironment,
    deferExternalFakesUntilNativeEnvironment: true,
  };

  await withScenario("list_native_redaction", options, ({ result }) => {
    const details = detailsOf(result);
    assert.equal(details.status, "ok");
    const tabs = arrayField(details, "tabs") as Array<Record<string, unknown>>;
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0]?.title, "Native [REDACTED]");
    assert.equal(tabs[0]?.url, "https://example.test/[REDACTED]");
    const text = result.content[0]?.text ?? "";
    assert.doesNotMatch(text, new RegExp(syntheticNativeTypesafeKey));
    assert.doesNotMatch(text, new RegExp(syntheticNativeHelperKey));
  });

  await withScenario("list_native_resolution_error", options, ({ result }) => {
    const details = detailsOf(result);
    assert.equal(details.status, "error");
    const text = result.content[0]?.text ?? "";
    assert.doesNotMatch(text, new RegExp(syntheticNativeTypesafeKey));
    assert.doesNotMatch(text, new RegExp(syntheticNativeHelperKey));
    assert.match(text, /native load failed for \[REDACTED\] and \[REDACTED\]/);
  });
});

test("discovery keeps empty, error, clipping, and omitted-tab outcomes distinct", async () => {
  await withScenario(
    "list_empty",
    { toolName: "rlcd_brwsr_list_tabs", typesafeKey: null, helperKey: null },
    ({ result }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "ok");
      assert.deepEqual(details.tabs, []);
      assert.equal(recordField(details, "output").omittedTabs, 0);
    },
  );

  await withScenario(
    "list_error",
    { toolName: "rlcd_brwsr_list_tabs", typesafeKey: null, helperKey: null },
    ({ result }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "error");
      assert.equal(details.tabs, null);
      assert.ok(recordField(details, "diagnostic"));
      assert.equal(recordField(details, "output").omittedTabs, null);
    },
  );

  await withScenario(
    "list_omission",
    { toolName: "rlcd_brwsr_list_tabs" },
    ({ result }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "ok");
      const output = recordField(details, "output");
      assert.equal(output.clipped, true);
      assert.ok(Number(output.omittedTabs) > 0);
      const tabs = arrayField(details, "tabs") as Array<
        Record<string, unknown>
      >;
      assert.ok(tabs.length > 0 && tabs.length < 40);
      assert.deepEqual(tabs[0]?.clippedFields, ["title", "url"]);
      assert.ok(
        tabs.every(
          (tab, index) =>
            index === 0 ||
            String(tabs[index - 1]?.targetId) < String(tab.targetId),
        ),
      );
      const text = result.content[0]?.text ?? "";
      assert.ok(Buffer.byteLength(text, "utf8") <= terminalByteLimit);
      assert.doesNotMatch(text, new RegExp(syntheticTypesafeKey));
      assert.doesNotMatch(text, new RegExp(syntheticHelperKey));
      assert.match(text, /\[REDACTED\]/);
    },
  );
});

test("invalid input and request overflow stop before Python or external work", async () => {
  const cases: Array<Partial<RlcdInput>> = [
    { url: "file:///tmp/nope" },
    { url: "https://user:secret@example.test/" },
    { goal: "   " },
    { goal: "\u001c" },
    { maxSeconds: 0 },
    { maxSeconds: 1.5 },
    { retainTab: "yes" as unknown as boolean },
    { maxActions: 1 },
    { goal: "😀".repeat(9_000) },
  ];

  for (const params of cases) {
    await withScenario("click", { params }, async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "error");
      assert.equal(details.stopReason, "invalid_input");
      assertTextHelperAvailabilityAbsent(details);
      assert.equal(await readIfPresent(markers.model), "");
      assert.equal(await readIfPresent(markers.browser), "");
    });
  }

  const cancellation = new AbortController();
  cancellation.abort();
  await withScenario(
    "click",
    { signal: cancellation.signal, params: { url: "file:///tmp/nope" } },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "error");
      assert.equal(details.stopReason, "invalid_input");
      assert.equal(await readIfPresent(markers.model), "");
    },
  );
});

test("borrowed input preserves opaque IDs and rejects contradictory lifetime options", async () => {
  for (const params of [
    {},
    { targetId: "   " },
    { targetId: "😀".repeat(129) },
    { targetId: "bad\ud800id" },
    { targetId: "rlcd-borrowed-target", retainTab: false },
  ]) {
    await withScenario(
      "click",
      { omitDefaultUrl: true, params },
      async ({ result, markers }) => {
        const details = detailsOf(result);
        assert.equal(details.status, "error");
        assert.equal(details.stopReason, "invalid_input");
        assert.equal(recordField(details, "cleanup").taskTab, "not_created");
        assert.equal(await readIfPresent(markers.browser), "");
        assert.equal(await readIfPresent(markers.model), "");
      },
    );
  }

  await withScenario(
    "click",
    {
      omitDefaultUrl: true,
      params: { targetId: "  opaque-id  " },
    },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "error");
      assert.equal(details.execution, "not_started");
      const request = JSON.parse(
        await readFile(markers.stdin, "utf8"),
      ) as Record<string, unknown>;
      assert.equal(request.targetId, "  opaque-id  ");
      assert.equal(Object.hasOwn(request, "retainTab"), false);
    },
  );
});

test("URL validation counts code points and passes one canonical URL to Python", async () => {
  const unicodeUrl = `https://example.test/${"😀".repeat(1_014)}`;
  assert.ok(Array.from(unicodeUrl).length <= 2_048);
  assert.ok(unicodeUrl.length > 2_048);

  for (const url of [unicodeUrl, "https:example.com"]) {
    await withScenario(
      "click",
      { params: { url } },
      async ({ result, markers }) => {
        assert.equal(detailsOf(result).status, "completion_claim");
        const request = JSON.parse(await readFile(markers.stdin, "utf8")) as {
          url: string;
        };
        assert.equal(request.url, new URL(url).href);
      },
    );
  }
});

test("maxSeconds remains public while normalized goals enter the child request", async () => {
  await withScenario(
    "click",
    {
      params: {
        goal: "\u001c Complete the deterministic fixture \u001c",
        maxSeconds: 5,
      },
    },
    async ({ result, markers }) => {
      assert.equal(detailsOf(result).status, "completion_claim");
      const request = JSON.parse(
        await readFile(markers.stdin, "utf8"),
      ) as Record<string, unknown>;
      assert.equal(request.goal, "Complete the deterministic fixture");
      assert.equal(Object.hasOwn(request, "maxSeconds"), false);
    },
  );
});

test("native preflight requires the selected helper configuration and existing local daemon", async () => {
  for (const [scenario, options] of [
    ["click", { textModel: "deepseek-chat" }],
    ["missing_daemon", {}],
  ] as const) {
    await withScenario(scenario, options, async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "error");
      assert.equal(details.execution, "not_started");
      assert.equal(recordField(details, "cleanup").taskTab, "not_created");
      assert.equal(await readIfPresent(markers.browser), "");
      assert.equal(await readIfPresent(markers.model), "");
    });
  }
});

test("preflight reports resolved helper-key configuration without claiming validity", async () => {
  const absent = await runPreflightCase({});
  assert.equal(absent.textHelperAvailability, "missing_key");

  const whitespace = await runPreflightCase({ processHelperKey: "   " });
  assert.equal(whitespace.textHelperAvailability, "missing_key");

  const workspace = await runPreflightCase({
    workspaceHelperKey: syntheticNativeHelperKey,
  });
  assert.equal(workspace.textHelperAvailability, "available");
});

test("native workspace conflicts stop a DeepSeek key before a wrong-provider request", async () => {
  const wrongProviderKey = "synthetic-wrong-provider-key";
  await withScenario(
    "click",
    {
      helperKey: null,
      nativeEnvironment: [
        `TEXT_MODEL_API_KEY=${wrongProviderKey}`,
        "TEXT_MODEL_BASE_URL=https://openrouter.ai/api/v1",
        "TEXT_MODEL=deepseek/deepseek-v4.1-flash:nitro",
        "TEXT_MODEL_REASONING=none",
        "",
      ].join("\n"),
      deferExternalFakesUntilNativeEnvironment: true,
    },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "error");
      assert.equal(details.execution, "not_started");
      assert.equal(recordField(details, "cleanup").taskTab, "not_created");
      assert.match(
        String(recordField(details, "diagnostic").message),
        /TEXT_MODEL_BASE_URL/,
      );
      assert.doesNotMatch(
        result.content[0]?.text ?? "",
        new RegExp(wrongProviderKey),
      );
      assert.equal(await readIfPresent(markers.browser), "");
      assert.equal(await readIfPresent(markers.model), "");
    },
  );
});

test("a helper key loaded only by the native workspace stays out of the public process seam", async () => {
  await withScenario(
    "fill",
    {
      helperKey: null,
      nativeEnvironment: `TEXT_MODEL_API_KEY=${syntheticNativeHelperKey}\n`,
      deferExternalFakesUntilNativeEnvironment: true,
    },
    async ({ result, markers }) => {
      assert.equal(detailsOf(result).status, "completion_claim");
      assert.match(await readIfPresent(markers.field), /Busan/);
      for (const value of [
        result.content[0]?.text ?? "",
        await readFile(markers.argv, "utf8"),
        await readFile(markers.stdin, "utf8"),
      ]) {
        assert.doesNotMatch(value, new RegExp(syntheticNativeHelperKey));
      }
    },
  );
});

test("the registered tool consumes native Agent.run for click and completion", async () => {
  await withScenario("click", {}, async ({ result, markers }) => {
    const details = detailsOf(result);
    assert.equal(details.status, "completion_claim");
    assert.equal(recordField(details, "completionClaim").claimed, true);
    assert.equal(details.execution, "completed");
    assert.equal(recordField(details, "cleanup").taskTab, "closed");
    const history = arrayField(details, "history");
    assert.equal(history.length, 1);
    assert.equal((history[0] as Record<string, unknown>).kind, "click");
    assert.match(await readIfPresent(markers.browser), /click:continue/);
    assert.match(
      await readIfPresent(markers.browser),
      /close:rlcd-owned-target/,
    );
  });
});

test("borrowed goals continue on one exact ID without startup navigation or closure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rlcd-borrowed-sequence-"));
  const sharedState = join(directory, "state.json");
  try {
    await withScenario(
      "click",
      {
        omitDefaultUrl: true,
        sharedBrowserState: sharedState,
        params: { targetId: "rlcd-borrowed-target" },
      },
      async ({ result, markers }) => {
        const details = detailsOf(result);
        assert.equal(details.status, "completion_claim");
        assert.equal(details.targetId, "rlcd-borrowed-target");
        const cleanup = recordField(details, "cleanup");
        assert.equal(cleanup.taskTab, "not_owned");
        assert.equal(cleanup.focusEmulation, "disable_acknowledged");
        assert.equal(cleanup.attachment, "detach_acknowledged");
        assert.equal(arrayField(details, "history").length, 1);
        const browserLog = await readIfPresent(markers.browser);
        assert.match(browserLog, /attach:rlcd-borrowed-target/);
        assert.match(browserLog, /focus:rlcd-borrowed-session:true/);
        assert.match(browserLog, /focus:rlcd-borrowed-session:false/);
        assert.match(browserLog, /detach:rlcd-borrowed-session/);
        assert.doesNotMatch(browserLog, /created:|navigate:|close:/);
      },
    );

    await withScenario(
      "click",
      {
        omitDefaultUrl: true,
        sharedBrowserState: sharedState,
        params: { targetId: "rlcd-borrowed-target" },
      },
      ({ result }) => {
        const details = detailsOf(result);
        assert.equal(details.status, "completion_claim");
        assert.equal(details.targetId, "rlcd-borrowed-target");
        assert.deepEqual(details.history, []);
      },
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("explicit borrowed navigation changes only the exact selected target", async () => {
  await withScenario(
    "done",
    {
      params: {
        targetId: "rlcd-borrowed-target",
        url: "https://example.test/navigated",
      },
    },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "completion_claim");
      assert.equal(details.targetId, "rlcd-borrowed-target");
      const request = JSON.parse(
        await readFile(markers.stdin, "utf8"),
      ) as Record<string, unknown>;
      assert.equal(request.targetId, "rlcd-borrowed-target");
      assert.equal(request.url, "https://example.test/navigated");
      assert.equal(Object.hasOwn(request, "retainTab"), false);
      const browserLog = await readIfPresent(markers.browser);
      assert.match(
        browserLog,
        /navigate:rlcd-borrowed-session:https:\/\/example\.test\/navigated/,
      );
      assert.doesNotMatch(browserLog, /created:|close:/);
    },
  );
});

test("about:blank requires explicit borrowed navigation", async () => {
  await withScenario(
    "borrowed_about_blank",
    {
      omitDefaultUrl: true,
      params: { targetId: "rlcd-borrowed-target" },
    },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "error");
      assert.equal(details.execution, "not_started");
      assert.doesNotMatch(await readIfPresent(markers.browser), /attach:/);
    },
  );

  await withScenario(
    "borrowed_about_blank",
    {
      params: {
        targetId: "rlcd-borrowed-target",
        url: "https://example.test/from-blank",
      },
    },
    async ({ result, markers }) => {
      assert.equal(detailsOf(result).status, "completion_claim");
      assert.match(
        await readIfPresent(markers.browser),
        /navigate:rlcd-borrowed-session:https:\/\/example\.test\/from-blank/,
      );
    },
  );
});

test("missing, closed, or unsuitable borrowed targets fail before attachment and model dispatch", async () => {
  for (const scenario of [
    "borrowed_missing",
    "borrowed_closed",
    "borrowed_unsuitable",
  ]) {
    await withScenario(
      scenario,
      {
        omitDefaultUrl: true,
        params: { targetId: "rlcd-borrowed-target" },
      },
      async ({ result, markers }) => {
        const details = detailsOf(result);
        assert.equal(details.status, "error");
        assert.equal(details.execution, "not_started");
        assert.equal(details.targetId, null);
        const cleanup = recordField(details, "cleanup");
        assert.equal(cleanup.taskTab, "not_owned");
        assert.equal(cleanup.focusEmulation, "not_applied");
        assert.equal(cleanup.attachment, "not_acquired");
        assert.equal(await readIfPresent(markers.model), "");
        const browserLog = await readIfPresent(markers.browser);
        assert.doesNotMatch(browserLog, /attach:|navigate:|created:|close:/);
      },
    );
  }
});

test("borrowed constructor failure and cooperative cancellation release without target closure", async () => {
  await withScenario(
    "borrowed_constructor_error",
    {
      omitDefaultUrl: true,
      params: { targetId: "rlcd-borrowed-target" },
    },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "error");
      assert.equal(details.execution, "not_started");
      assert.equal(details.targetId, "rlcd-borrowed-target");
      const cleanup = recordField(details, "cleanup");
      assert.equal(cleanup.focusEmulation, "disable_acknowledged");
      assert.equal(cleanup.attachment, "detach_acknowledged");
      assert.doesNotMatch(await readIfPresent(markers.browser), /close:/);
    },
  );

  const cancellation = new AbortController();
  await withScenario(
    "slow_model",
    {
      omitDefaultUrl: true,
      signal: cancellation.signal,
      abortWhenModelStarts: cancellation,
      params: { targetId: "rlcd-borrowed-target", maxSeconds: 5 },
    },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "stopped");
      assert.equal(details.stopReason, "cancelled");
      assert.equal(details.execution, "unknown");
      const cleanup = recordField(details, "cleanup");
      assert.equal(cleanup.taskTab, "not_owned");
      assert.equal(cleanup.focusEmulation, "disable_acknowledged");
      assert.equal(cleanup.attachment, "detach_acknowledged");
      assert.doesNotMatch(await readIfPresent(markers.browser), /close:/);
    },
  );
});

test("borrowed cleanup acknowledgements stay independent", async () => {
  await withScenario(
    "borrowed_focus_release_failure",
    {
      omitDefaultUrl: true,
      params: { targetId: "rlcd-borrowed-target" },
    },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "completion_claim");
      const cleanup = recordField(details, "cleanup");
      assert.equal(cleanup.focusEmulation, "unconfirmed");
      assert.equal(cleanup.attachment, "detach_acknowledged");
      const browserLog = await readIfPresent(markers.browser);
      assert.match(browserLog, /focus:rlcd-borrowed-session:false/);
      assert.match(browserLog, /detach:rlcd-borrowed-session/);
      assert.doesNotMatch(browserLog, /close:/);
    },
  );

  await withScenario(
    "borrowed_cleanup_attribute_error",
    {
      omitDefaultUrl: true,
      params: { targetId: "rlcd-borrowed-target" },
    },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "error");
      assert.match(
        String(recordField(details, "diagnostic").message),
        /provider failed before a decision/,
      );
      const cleanup = recordField(details, "cleanup");
      assert.equal(cleanup.focusEmulation, "unconfirmed");
      assert.equal(cleanup.attachment, "detach_acknowledged");
      const browserLog = await readIfPresent(markers.browser);
      assert.match(browserLog, /focus:rlcd-borrowed-session:false/);
      assert.match(browserLog, /detach:rlcd-borrowed-session/);
      assert.doesNotMatch(browserLog, /close:/);
    },
  );
});

test("a post-navigation provider race reports unknown effects instead of pre-start rejection", async () => {
  await withScenario(
    "model_error",
    {
      params: {
        targetId: "rlcd-borrowed-target",
        url: "https://example.test/navigated-before-error",
      },
    },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "error");
      assert.equal(details.execution, "unknown");
      assert.equal(details.targetId, "rlcd-borrowed-target");
      assert.match(
        await readIfPresent(markers.browser),
        /navigate:rlcd-borrowed-session:/,
      );
      assert.match(await readIfPresent(markers.model), /request:/);
    },
  );
});

test("native field helper fills through the selected direct DeepSeek defaults", async () => {
  await withScenario("click", { helperKey: null }, ({ result }) => {
    assert.equal(detailsOf(result).status, "completion_claim");
  });
  await withScenario("fill", {}, async ({ result, markers }) => {
    const details = detailsOf(result);
    assert.equal(
      details.status,
      "completion_claim",
      JSON.stringify(details.diagnostic),
    );
    assert.match(await readIfPresent(markers.field), /Busan/);
    const usage = recordField(details, "usage");
    const sources = arrayField(usage, "records").map(
      (record) => (record as Record<string, unknown>).source,
    );
    assert.ok(sources.includes("jev_decision"));
    assert.ok(sources.includes("text_helper"));
    const models = recordField(details, "models");
    assert.equal(
      recordField(models, "textHelper").configuredModel,
      "deepseek-flash",
    );
    assertTextHelperAvailabilityAbsent(details);
  });
});

test("active synthetic terminals omit helper availability", async () => {
  await withScenario("synthetic_terminal", {}, ({ result }) => {
    const details = detailsOf(result);
    assert.equal(details.status, "stopped");
    assert.equal(details.stopReason, "cancelled");
    assertTextHelperAvailabilityAbsent(details);
  });
});

test("native DONE, BLOCKED, and exceptions remain distinct outcomes", async () => {
  await withScenario("done", {}, ({ result }) => {
    const details = detailsOf(result);
    assert.equal(details.status, "completion_claim");
    assert.deepEqual(details.history, []);
  });
  await withScenario("blocked", {}, ({ result }) => {
    const details = detailsOf(result);
    assert.equal(details.status, "blocked");
    assert.equal(recordField(details, "completionClaim").claimed, false);
  });
  await withScenario("model_error", {}, ({ result }) => {
    const details = detailsOf(result);
    assert.equal(details.status, "error");
    assert.notEqual(details.status, "blocked");
    assert.match(
      String(recordField(details, "diagnostic").message),
      /provider failed/,
    );
  });
});

test("goal-aware reporting selects identifier or estimate facts from the same generic document", async () => {
  for (const [goal, included, excluded] of [
    [
      "Return the requested identifier",
      ["Requested identifier: ITEM-482."],
      ["Estimated total:", "Estimate excludes"],
    ],
    [
      "Report the estimated total, period, and any exclusions",
      [
        "Estimated total: 120 credits per month.",
        "Estimate excludes service charges.",
      ],
      ["Requested identifier:"],
    ],
  ] as const) {
    await withScenario(
      "report_goal_document",
      { params: { goal } },
      async ({ result, markers }) => {
        const details = detailsOf(result);
        assert.equal(details.status, "completion_claim");
        const reporting = recordField(details, "reporting");
        assert.equal(reporting.status, "selected");
        const evidence = arrayField(reporting, "evidence") as Array<
          Record<string, unknown>
        >;
        const exact = evidence.map((item) => String(item.exact));
        for (const fragment of included) {
          assert.ok(exact.some((value) => value.includes(fragment)));
        }
        for (const fragment of excluded) {
          assert.ok(exact.every((value) => !value.includes(fragment)));
        }
        assert.ok(exact.every((value) => !value.includes("generic notes")));
        assert.ok(evidence.every((item) => typeof item.relevance === "number"));

        const compact = compactOf(result);
        const compactEvidence = arrayField(compact, "evidence") as Array<
          Record<string, unknown>
        >;
        for (const fragment of included) {
          assert.ok(
            compactEvidence.some((item) =>
              String(item.exact).includes(fragment),
            ),
          );
        }
        assert.ok(
          compactEvidence.every((item) => !Object.hasOwn(item, "relevance")),
        );
        const reportRequest = JSON.parse(
          await readFile(markers.report, "utf8"),
        ) as Record<string, unknown>;
        assert.deepEqual(Object.keys(reportRequest).sort(), [
          "model",
          "questions",
          "state",
        ]);
        const reportState = recordField(reportRequest, "state");
        assert.equal(reportState.goal, goal);
        assert.equal(Object.hasOwn(reportState, "url"), false);
        assert.equal(Object.hasOwn(reportState, "history"), false);
      },
    );
  }
});

test("reporting judges short exact spans with bounded page context without returning that context", async () => {
  const goal = "Report the requested monthly total and any exclusions";
  await withScenario(
    "report_span_context",
    { params: { goal } },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      const reporting = recordField(details, "reporting");
      assert.equal(reporting.status, "selected");
      assert.equal(reporting.sourceCoverage, "complete");

      const request: unknown = JSON.parse(
        await readFile(markers.report, "utf8"),
      );
      assert.ok(isRecord(request));
      const state = recordField(request, "state");
      const context = String(state.judgmentContext);
      assert.match(
        context,
        /Requested monthly total:\n120 credits per month\./,
      );
      assert.match(context, /Unrequested biographical background\./);
      assert.equal(state.goal, goal);

      const offered = arrayField(state, "candidates") as Array<
        Record<string, unknown>
      >;
      const offeredPageExact = offered
        .filter((candidate) => candidate.kind === "page")
        .map((candidate) => String(candidate.exact));
      assert.ok(offeredPageExact.includes("120 credits per month."));
      assert.ok(
        offeredPageExact.includes("Estimate excludes service charges."),
      );

      const detailedEvidence = arrayField(reporting, "evidence") as Array<
        Record<string, unknown>
      >;
      const detailedExact = detailedEvidence.map((item) => String(item.exact));
      assert.deepEqual(detailedExact, [
        "120 credits per month.",
        "Estimate excludes service charges.",
      ]);
      assert.ok(
        detailedEvidence.every(
          (item) =>
            item.kind !== "page" ||
            (offeredPageExact.includes(String(item.exact)) &&
              Buffer.byteLength(String(item.exact), "utf8") <= 512),
        ),
      );

      const compact = compactOf(result);
      assert.deepEqual(
        arrayField(compact, "evidence").map((item) =>
          String((item as Record<string, unknown>).exact),
        ),
        detailedExact,
      );
      assert.doesNotMatch(JSON.stringify(compact), /biographical background/);
      assert.equal(Object.hasOwn(details, "judgmentContext"), false);
      assert.equal(Object.hasOwn(reporting, "judgmentContext"), false);
      assert.equal(Object.hasOwn(compact, "judgmentContext"), false);

      const questions = recordField(request, "questions");
      assert.equal(Object.keys(questions).length, offered.length);
      for (const [index, questionValue] of Object.values(questions).entries()) {
        assert.ok(isRecord(questionValue));
        const question = questionValue;
        const rendered = JSON.stringify(question);
        assert.match(rendered, new RegExp(`candidates\\[${index}\\]`));
        assert.match(rendered, /ONLY/);
        assert.match(rendered, /judgmentContext/);
        assert.match(rendered, /independent/);
      }
    },
  );
});

test("reporting keeps fragmented relationships in context while offering fine exact spans", async () => {
  await withScenario(
    "report_fragmented",
    { params: { goal: "Return Field 047" } },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      const reporting = recordField(details, "reporting");
      assert.equal(reporting.status, "selected");
      assert.equal(reporting.sourceCoverage, "complete");
      assert.equal(reporting.sourceOmitted, false);

      const reportText = await readFile(markers.report, "utf8");
      const request: unknown = JSON.parse(reportText);
      assert.ok(isRecord(request));
      assert.deepEqual(Object.keys(request).sort(), [
        "model",
        "questions",
        "state",
      ]);
      const state = recordField(request, "state");
      assert.deepEqual(Object.keys(state).sort(), [
        "candidates",
        "goal",
        "judgmentContext",
        "trustedSelectionPolicy",
      ]);
      assert.equal(state.goal, "Return Field 047");
      assert.equal(state.judgmentContext, fragmentedReportText);
      const policy = recordField(state, "trustedSelectionPolicy");
      assert.deepEqual(Object.keys(policy).sort(), [
        "answerUsefulness",
        "dataHandling",
        "independence",
        "qualifications",
        "siteFurniture",
        "spanScope",
      ]);
      assert.equal((reportText.match(/"answerUsefulness":/g) ?? []).length, 1);

      const candidates = arrayField(state, "candidates") as Array<
        Record<string, unknown>
      >;
      assert.deepEqual(
        candidates.map((candidate) => candidate.exact),
        fragmentedReportLines,
      );
      assert.equal(reporting.candidateCount, candidates.length);
      assert.ok(
        candidates.every(
          (candidate) =>
            candidate.kind === "page" &&
            Buffer.byteLength(String(candidate.exact), "utf8") <= 512,
        ),
      );
      assert.ok(
        Math.max(
          ...candidates.map((candidate) =>
            Buffer.byteLength(String(candidate.exact), "utf8"),
          ),
        ) <= 128,
      );

      assert.ok(
        candidates.every(
          (candidate) => !String(candidate.exact).includes("Total:\n$12"),
        ),
      );
      assert.ok(candidates.some((candidate) => candidate.exact === "Total:"));
      assert.ok(candidates.some((candidate) => candidate.exact === "$12"));
      let previousStart = 0;
      let coveredEnd = 0;
      for (const candidate of candidates) {
        assert.deepEqual(Object.keys(candidate).sort(), [
          "cutAfter",
          "cutBefore",
          "exact",
          "id",
          "kind",
          "source",
        ]);
        const exact = String(candidate.exact);
        const start = fragmentedReportText.indexOf(exact, previousStart);
        assert.ok(
          start >= previousStart,
          `missing ordered exact candidate after offset ${previousStart}`,
        );
        if (start > coveredEnd) {
          assert.equal(
            fragmentedReportText.slice(coveredEnd, start).trim(),
            "",
          );
        }
        previousStart = start;
        coveredEnd = Math.max(coveredEnd, start + exact.length);
      }
      assert.equal(fragmentedReportText.slice(coveredEnd).trim(), "");

      const questions = recordField(request, "questions");
      assert.equal(Object.keys(questions).length, candidates.length);
      for (let index = 0; index < candidates.length; index += 1) {
        const question = recordField(
          questions,
          `keep_c${String(index).padStart(3, "0")}`,
        );
        assert.equal(question.type, "noul");
        const criteria = recordField(question, "criteria");
        const candidatePath = `candidates[${index}]`;
        for (const value of [
          String(question.instructions),
          String(criteria.true),
          String(criteria.false),
        ]) {
          assert.ok(value.includes(candidatePath));
          assert.match(value, /trustedSelectionPolicy/);
          assert.match(value, /goal/);
        }
        assert.ok(
          !JSON.stringify(question).includes(String(policy.relevance)),
          "the shared policy must not be copied into each question",
        );
      }
      assert.ok(Buffer.byteLength(reportText, "utf8") < 50_000);
      assert.equal(Object.hasOwn(state, "url"), false);
      assert.equal(Object.hasOwn(state, "targetId"), false);
      assert.equal(Object.hasOwn(state, "diagnostic"), false);
      assert.equal(Object.hasOwn(state, "models"), false);
      assert.equal(Object.hasOwn(state, "usage"), false);
      assert.equal(Object.hasOwn(state, "history"), false);
    },
  );
});

test("reporting deduplicates only conservative whole-record identities", async () => {
  await withScenario(
    "report_duplicates",
    { params: { goal: "Retain every relevant comparison record" } },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      const reporting = recordField(details, "reporting");
      assert.equal(reporting.status, "selected");
      assert.equal(reporting.sourceCoverage, "complete");
      assert.equal(reporting.candidateCount, duplicateReportRecords.length);
      assert.equal(
        reporting.qualifyingCandidateCount,
        duplicateReportRecords.length,
      );
      assert.equal(reporting.deduplicatedCandidateCount, 2);
      assert.equal(reporting.selectedCount, 3);
      assert.equal(
        reporting.omittedQualifyingCandidateCount,
        duplicateReportRecords.length - 3,
      );
      assert.equal(reporting.selectionOmitted, true);

      const request: unknown = JSON.parse(
        await readFile(markers.report, "utf8"),
      );
      assert.ok(isRecord(request));
      const offered = arrayField(
        recordField(request, "state"),
        "candidates",
      ) as Array<Record<string, unknown>>;
      assert.deepEqual(
        offered.map((candidate) => candidate.exact),
        duplicateReportRecords,
      );
      assert.notDeepEqual(
        [offered[0]?.cutBefore, offered[0]?.cutAfter],
        [offered[2]?.cutBefore, offered[2]?.cutAfter],
      );

      const exact = arrayField(reporting, "evidence").map((item) =>
        String((item as Record<string, unknown>).exact),
      );
      assert.deepEqual(exact, [
        "November 9, 1914",
        "Signed balance: +12 USD",
        "Signed balance: -12 USD",
      ]);
      assert.ok(exact.every((value) => duplicateReportRecords.includes(value)));
    },
  );
});

test("reporting retains distant qualifications or discloses their omission", async () => {
  await withScenario(
    "report_qualification",
    { params: { goal: "Report the estimated total and any exclusions" } },
    ({ result }) => {
      const details = detailsOf(result);
      const reporting = recordField(details, "reporting");
      assert.equal(reporting.status, "selected");
      const exact = arrayField(reporting, "evidence")
        .map((item) => String((item as Record<string, unknown>).exact ?? ""))
        .join("\n");
      assert.match(exact, /Estimated total: 120 credits/);
      assert.match(exact, /Estimate excludes service charges/);
      assert.doesNotMatch(exact, /General explanatory material/);
      assert.equal(reporting.selectionOmitted, false);
    },
  );
});

test("scrolling goals receive copied action evidence instead of unrelated page prose", async () => {
  await withScenario(
    "report_scroll",
    { params: { goal: "Scroll down once" } },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      const reporting = recordField(details, "reporting");
      assert.equal(reporting.status, "selected");
      const evidence = arrayField(reporting, "evidence") as Array<
        Record<string, unknown>
      >;
      const action = evidence.find((item) => item.kind === "action");
      assert.ok(action);
      assert.deepEqual(
        Object.keys(action).sort(),
        [
          "actionLabel",
          "kind",
          "operation",
          "pageChanged",
          "relevance",
          "source",
          "step",
        ].sort(),
      );
      assert.equal(action.operation, "SCROLL_DOWN");
      assert.equal(action.actionLabel, "Scroll down");
      assert.match(await readIfPresent(markers.browser), /scroll:down/);
      const compactEvidence = arrayField(
        compactOf(result),
        "evidence",
      ) as Array<Record<string, unknown>>;
      assert.ok(compactEvidence.some((item) => item.kind === "action"));
      assert.ok(compactEvidence.every((item) => item.kind !== "page"));
    },
  );
});

test("reporting failures and interruption preserve browser outcome and primary diagnostic", async () => {
  for (const [scenario, expectedStatus] of [
    ["report_invalid", "error"],
    ["report_provider_error", "error"],
    ["report_cancelled", "cancelled"],
    ["report_missing_key", "missing"],
  ] as const) {
    const cancellation =
      scenario === "report_cancelled" ? new AbortController() : undefined;
    await withScenario(
      scenario,
      {
        params: { goal: "Report the capacity", maxSeconds: 5 },
        ...(cancellation
          ? {
              signal: cancellation.signal,
              abortWhenReportStarts: cancellation,
            }
          : {}),
      },
      ({ result }) => {
        const details = detailsOf(result);
        assert.equal(details.status, "completion_claim");
        assert.equal(details.stopReason, "done");
        assert.equal(details.execution, "completed");
        assert.equal(details.diagnostic, null);
        const reporting = recordField(details, "reporting");
        assert.equal(reporting.status, expectedStatus);
        assert.deepEqual(reporting.evidence, []);
        const compact = compactOf(result);
        assert.deepEqual(recordField(compact, "outcome"), {
          status: "completion_claim",
          stopReason: "done",
          execution: "completed",
          completionClaim: {
            claimed: true,
            requiresIndependentVerification: true,
          },
        });
        const reportingDiagnostic = reporting.diagnostic;
        if (isRecord(reportingDiagnostic)) {
          assert.doesNotMatch(
            String(reportingDiagnostic.message),
            /no action executed/i,
          );
        }
      },
    );
  }
});

test("reporting input and both returned surfaces redact complete keys and Bearer values", async () => {
  await withScenario(
    "report_redaction",
    { params: { goal: "Return CLEAR-19" } },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(recordField(details, "reporting").status, "selected");
      for (const value of [
        serializedSurfaces(result),
        await readFile(markers.report, "utf8"),
      ]) {
        assert.doesNotMatch(value, new RegExp(syntheticTypesafeKey));
        assert.doesNotMatch(value, new RegExp(syntheticHelperKey));
        assert.doesNotMatch(value, /Authorization:\s*Bearer\s+synthetic/i);
        assert.doesNotMatch(value, /Bearer abc/i);
        assert.doesNotMatch(value, /Authorization:\s*Bearer\s+xyz/i);
        assert.match(value, /\[REDACTED\]/);
      }
    },
  );
});

test("missing and invalid native helper replies never fabricate field input", async () => {
  for (const [scenario, helperKey] of [
    ["fill", null],
    ["helper_invalid_empty", syntheticHelperKey],
    ["helper_invalid_extra", syntheticHelperKey],
  ] as const) {
    await withScenario(scenario, { helperKey }, async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "error");
      assert.equal(await readIfPresent(markers.field), "");
      assert.equal(recordField(details, "completionClaim").claimed, false);
    });
  }
});

test("normal retention skips close while close success false stays unconfirmed", async () => {
  await withScenario(
    "done",
    { params: { retainTab: true } },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(recordField(details, "cleanup").taskTab, "retained");
      assert.doesNotMatch(await readIfPresent(markers.browser), /close:/);
    },
  );
  await withScenario("close_false", {}, async ({ result, markers }) => {
    const details = detailsOf(result);
    assert.equal(recordField(details, "cleanup").taskTab, "unconfirmed");
    assert.equal(
      (await readIfPresent(markers.browser)).match(/close:/g)?.length,
      1,
    );
  });
});

test("construction interruption reports execution and cleanup unknown", async () => {
  await withScenario(
    "constructor_interrupt",
    {},
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "stopped");
      assert.equal(details.execution, "unknown");
      assert.equal(recordField(details, "cleanup").taskTab, "unknown");
      const browserLog = await readIfPresent(markers.browser);
      assert.match(browserLog, /created:rlcd-owned-target/);
      assert.doesNotMatch(browserLog, /close:/);
    },
  );
});

test("post-construction interruption closes the recovered task target", async () => {
  await withScenario(
    "post_constructor_interrupt",
    {},
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "stopped");
      assert.equal(details.execution, "unknown");
      assert.equal(details.targetId, "rlcd-owned-target");
      assert.equal(recordField(details, "cleanup").taskTab, "closed");
      assert.match(
        await readIfPresent(markers.browser),
        /close:rlcd-owned-target/,
      );
    },
  );
});

test("a projection interruption after browser work falls back to unknown state", async () => {
  await withScenario(
    "projection_interrupt",
    {},
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.status, "stopped");
      assert.equal(details.stopReason, "cancelled");
      assert.equal(details.execution, "unknown");
      const cleanup = recordField(details, "cleanup");
      assert.equal(cleanup.taskTab, "unknown");
      assert.equal(cleanup.bridgeProcess, "reaped");
      const browserLog = await readIfPresent(markers.browser);
      assert.match(browserLog, /click:continue/);
      assert.match(browserLog, /close:rlcd-owned-target/);
    },
  );
});

test("first stop wins and cooperative cancellation preserves close evidence", async () => {
  const immediate = new AbortController();
  immediate.abort();
  await withScenario(
    "click",
    { signal: immediate.signal },
    async ({ result, markers }) => {
      const details = detailsOf(result);
      assert.equal(details.stopReason, "cancelled");
      assert.equal(details.execution, "not_started");
      assert.equal(await readIfPresent(markers.model), "");
    },
  );

  const cancellation = new AbortController();
  await withScenario(
    "slow_close_false",
    {
      signal: cancellation.signal,
      abortWhenModelStarts: cancellation,
      params: { maxSeconds: 2 },
    },
    ({ result }) => {
      const details = detailsOf(result);
      assert.equal(details.stopReason, "cancelled");
      assert.equal(recordField(details, "cleanup").taskTab, "unconfirmed");
    },
  );

  const lateCancellation = new AbortController();
  setTimeout(() => lateCancellation.abort(), 1_200);
  await withScenario(
    "slow_model",
    { signal: lateCancellation.signal, params: { maxSeconds: 1 } },
    ({ result }) => {
      assert.equal(detailsOf(result).stopReason, "time_budget");
    },
  );
});

test(
  "a clean exit before stdio close preserves completion and retention",
  { timeout: 4_000 },
  async () => {
    await withScenario(
      "exit_before_stdio_close",
      { params: { maxSeconds: 1, retainTab: true } },
      async ({ result, markers }) => {
        const details = detailsOf(result);
        assert.equal(details.status, "completion_claim");
        assert.equal(details.stopReason, "done");
        const cleanup = recordField(details, "cleanup");
        assert.equal(cleanup.taskTab, "retained");
        assert.equal(cleanup.bridgeProcess, "reaped");
        const descendantPid = Number(
          (await readFile(markers.pid, "utf8")).trim(),
        );
        assert.throws(
          () => process.kill(descendantPid, 0),
          (error: NodeJS.ErrnoException) => error.code === "ESRCH",
        );
      },
    );
  },
);

test(
  "output bounds remain active while stdio drains after observed exit",
  { timeout: 4_000 },
  async () => {
    await withScenario(
      "exit_before_stdio_overflow",
      { params: { maxSeconds: 3 } },
      async ({ result, markers }) => {
        const details = detailsOf(result);
        assert.equal(details.status, "error");
        assert.equal(details.stopReason, "output_limit");
        assert.equal(details.execution, "unknown");
        assert.equal(recordField(details, "cleanup").bridgeProcess, "reaped");
        const descendantPid = Number(
          (await readFile(markers.pid, "utf8")).trim(),
        );
        assert.throws(
          () => process.kill(descendantPid, 0),
          (error: NodeJS.ErrnoException) => error.code === "ESRCH",
        );
      },
    );
  },
);

test(
  "stdout EOF while Python lives waits for a real parent stop",
  { timeout: 5_000 },
  async () => {
    await withScenario(
      "stdout_eof_while_alive",
      { params: { maxSeconds: 1 } },
      async ({ result, markers }) => {
        const details = detailsOf(result);
        assert.equal(details.status, "stopped");
        assert.equal(details.stopReason, "time_budget");
        assert.equal(details.execution, "unknown");
        assert.equal(recordField(details, "cleanup").bridgeProcess, "reaped");
        assert.match(await readIfPresent(markers.browser), /stdout:eof/);
      },
    );
  },
);

test("the supervisor prevents spawn for pre-abort and an expired absolute deadline", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rlcd-no-spawn-test-"));
  const marker = join(directory, "started");
  const script = join(directory, "mark.py");
  await writeFile(
    script,
    `from pathlib import Path\nPath(${JSON.stringify(marker)}).write_text("started")\n`,
    "utf8",
  );
  const paths = {
    pythonExecutable: join(repositoryRoot, ".venv", "bin", "python"),
    runnerExecutable: script,
  };
  try {
    const cancellation = new AbortController();
    cancellation.abort();
    const cancelled = await superviseRlcdProcess({
      paths,
      serializedRequest: "{}\n",
      deadlineAt: Date.now() - 1,
      signal: cancellation.signal,
    });
    assert.equal(cancelled.firstStop, "cancelled");
    assert.equal(cancelled.processStarted, false);

    const expired = await superviseRlcdProcess({
      paths,
      serializedRequest: "{}\n",
      deadlineAt: Date.now() - 1,
      signal: undefined,
    });
    assert.equal(expired.firstStop, "time_budget");
    assert.equal(expired.processStarted, false);
    assert.equal(await readIfPresent(marker), "");
  } finally {
    await rm(directory, { recursive: true });
  }
});

test(
  "the supervisor rechecks cancellation after child listeners are attached",
  { timeout: 4_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "rlcd-attached-stop-test-"));
    const script = join(directory, "wait.py");
    await writeFile(script, "import time\ntime.sleep(30)\n", "utf8");
    let abortChecks = 0;
    let listenerAttached = false;
    const signal = {
      get aborted() {
        abortChecks += 1;
        return abortChecks > 1;
      },
      addEventListener() {
        listenerAttached = true;
      },
      removeEventListener() {},
    } as unknown as AbortSignal;
    try {
      const outcome = await superviseRlcdProcess({
        paths: {
          pythonExecutable: join(repositoryRoot, ".venv", "bin", "python"),
          runnerExecutable: script,
        },
        serializedRequest: "{}\n",
        deadlineAt: Date.now() + 3_000,
        signal,
      });
      assert.equal(listenerAttached, true);
      assert.equal(outcome.firstStop, "cancelled");
      assert.equal(outcome.processStarted, true);
      assert.equal(outcome.exitObserved, true);
    } finally {
      await rm(directory, { recursive: true });
    }
  },
);

test("borrowed outcome interpretation rejects array-valued cleanup claims", () => {
  const scalar = detailsOf(
    interpretRlcdChildOutcome(
      childOutcome(
        terminalDetails({
          borrowed: true,
          taskTab: "not_owned",
          focusEmulation: "disable_acknowledged",
          attachment: "detach_acknowledged",
        }),
      ),
      true,
    ),
  );
  assert.equal(
    recordField(scalar, "cleanup").focusEmulation,
    "disable_acknowledged",
  );
  assert.equal(
    recordField(scalar, "cleanup").attachment,
    "detach_acknowledged",
  );

  const malformedTerminal = terminalDetails({
    borrowed: true,
    taskTab: "not_owned",
  });
  const malformedCleanup = recordField(malformedTerminal, "cleanup");
  malformedCleanup.focusEmulation = ["disable_acknowledged"];
  malformedCleanup.attachment = ["detach_acknowledged"];
  const rejected = detailsOf(
    interpretRlcdChildOutcome(
      childOutcome(malformedTerminal, { firstStop: "cancelled" }),
      true,
    ),
  );
  assert.equal(rejected.status, "stopped");
  assert.equal(rejected.stopReason, "cancelled");
  assert.equal(rejected.execution, "unknown");
  const cleanup = recordField(rejected, "cleanup");
  assert.equal(cleanup.taskTab, "unknown");
  assert.equal(cleanup.focusEmulation, "unknown");
  assert.equal(cleanup.attachment, "unknown");
  assert.equal(cleanup.bridgeProcess, "reaped");
});

test("outcome interpretation accepts unavailable native usage without losing trusted facts", () => {
  const terminal = terminalDetails({
    status: "completion_claim",
    stopReason: "done",
    execution: "completed",
    targetId: "rlcd-owned-target",
    taskTab: "closed",
  });
  const records = arrayField(recordField(terminal, "usage"), "records");
  records.push({
    source: "jev_decision",
    model: "synthetic-native-model",
    usage: null,
  });
  const details = detailsOf(interpretRlcdChildOutcome(childOutcome(terminal)));
  assert.equal(details.status, "completion_claim");
  assert.equal(details.execution, "completed");
  assert.equal(recordField(details, "cleanup").taskTab, "closed");
  assert.equal(
    (
      arrayField(recordField(details, "usage"), "records")[0] as Record<
        string,
        unknown
      >
    ).usage,
    null,
  );
});

test("outcome interpretation rejects array-valued usage and reporting scalars", () => {
  const malformed = terminalDetails({
    status: "completion_claim",
    stopReason: "done",
    execution: "completed",
    targetId: "rlcd-owned-target",
    taskTab: "closed",
  });
  arrayField(recordField(malformed, "usage"), "records").push({
    source: ["jev_decision"],
    model: "synthetic-native-model",
    usage: { input_tokens: 1 },
  });
  const reporting = recordField(malformed, "reporting");
  reporting.status = ["missing"];
  reporting.sourceCoverage = ["unavailable"];

  const rejected = detailsOf(
    interpretRlcdChildOutcome(childOutcome(malformed)),
  );
  assert.equal(rejected.status, "error");
  assert.equal(rejected.stopReason, "invalid_terminal");
  assert.equal(rejected.execution, "unknown");
  assert.equal(recordField(rejected, "cleanup").taskTab, "unknown");
});

test("production projection fits optional reporting usage within the parent record limit", async () => {
  const projected = await productionReportingPressureTerminals();
  const expected = {
    oneRemainingSlot: { native: 23, reporting: 1 },
    noRemainingSlots: { native: 24, reporting: 0 },
  } as const;

  for (const [name, counts] of Object.entries(expected)) {
    const result = interpretRlcdChildOutcome(
      childOutcome(projected[name] as Record<string, unknown>),
    );
    const details = detailsOf(result);
    assert.equal(details.status, "completion_claim");
    assert.equal(details.execution, "completed");
    assert.equal(recordField(details, "cleanup").taskTab, "closed");
    assert.equal(details.targetId, "rlcd-owned-target");
    assert.deepEqual(details.diagnostic, {
      type: "FixtureDiagnostic",
      message: "Original browser diagnostic; not a reporting error.",
    });
    assert.equal(
      recordField(compactOf(result), "lastObservedLocation").targetId,
      details.targetId,
    );
    const records = arrayField(recordField(details, "usage"), "records");
    const nativeRecords = records.filter(
      (record) =>
        isRecord(record) &&
        (record.source === "jev_decision" || record.source === "text_helper"),
    );
    const reportingRecords = records.filter(
      (record) => isRecord(record) && record.source === "jev_handoff",
    );
    assert.equal(nativeRecords.length, counts.native);
    assert.equal(reportingRecords.length, counts.reporting);
    assert.equal(records.length, 24);

    if (name === "noRemainingSlots") {
      const detailsOmissions = arrayField(
        recordField(details, "output"),
        "omissions",
      );
      assert.ok(detailsOmissions.includes("reporting usage record"));
      assert.ok(
        arrayField(
          recordField(compactOf(result), "output"),
          "omissions",
        ).includes("details.reporting usage record"),
      );
    }
  }
});

test("missing optional reporting stays explicit without replacing browser facts", () => {
  const terminal = terminalDetails({
    status: "completion_claim",
    stopReason: "done",
    execution: "completed",
    targetId: "rlcd-owned-target",
    taskTab: "closed",
    observationText: "Preserved browser diagnostic text.",
  });
  delete terminal.reporting;

  const result = interpretRlcdChildOutcome(childOutcome(terminal));
  const details = detailsOf(result);
  assert.equal(details.status, "completion_claim");
  assert.equal(details.execution, "completed");
  assert.equal(recordField(details, "cleanup").taskTab, "closed");
  assert.equal(
    recordField(details, "lastObservation").text,
    "Preserved browser diagnostic text.",
  );
  assert.equal(Object.hasOwn(details, "reporting"), false);

  const compact = compactOf(result);
  const reporting = recordField(compact, "reporting");
  assert.equal(reporting.status, "unavailable");
  assert.equal(reporting.sourceOmitted, null);
  assert.equal(reporting.selectionOmitted, null);
  assert.equal(
    recordField(reporting, "diagnostic").type,
    "ReportingUnavailable",
  );
  assert.ok(
    arrayField(recordField(compact, "output"), "omissions").includes(
      "details.reporting unavailable",
    ),
  );
});

test("near-cap absent reporting summarizes compact omission metadata without losing details", () => {
  const terminal = nearLimitOmissionTerminal(true, false);
  const originalOmissions = [
    ...arrayField(recordField(terminal, "output"), "omissions"),
  ];
  const result = interpretRlcdChildOutcome(childOutcome(terminal));
  const details = detailsOf(result);
  for (const field of [
    "status",
    "stopReason",
    "execution",
    "completionClaim",
    "targetId",
    "diagnostic",
  ]) {
    assert.deepEqual(details[field], terminal[field], `preserve ${field}`);
  }
  assert.deepEqual(recordField(details, "cleanup"), {
    ...recordField(terminal, "cleanup"),
    bridgeProcess: "reaped",
  });
  assert.equal(
    recordField(compactOf(result), "lastObservedLocation").targetId,
    terminal.targetId,
  );
  assert.equal(Object.hasOwn(details, "reporting"), false);
  assert.deepEqual(
    arrayField(recordField(details, "output"), "omissions"),
    originalOmissions,
  );
  assert.equal(
    Buffer.byteLength(JSON.stringify(details), "utf8"),
    terminalByteLimit,
  );

  const compact = compactOf(result);
  const compactOmissions = arrayField(
    recordField(compact, "output"),
    "omissions",
  );
  assert.ok(
    compactOmissions.includes(
      "details omissions summarized; see details.output.omissions",
    ),
  );
  assert.ok(compactOmissions.includes("details.reporting unavailable"));
  const reporting = recordField(compact, "reporting");
  assert.equal(reporting.status, "unavailable");
  assert.equal(reporting.sourceOmitted, null);
  assert.equal(reporting.selectionOmitted, null);
  assert.match(
    String(recordField(reporting, "diagnostic").message),
    /evidence and usage metadata are unavailable/i,
  );
  assert.doesNotMatch(
    String(recordField(reporting, "diagnostic").message),
    /budget|preserv|omit/i,
  );
});

test("near-cap omission labels remain accepted for normal and minimal envelopes", () => {
  for (const minimal of [false, true]) {
    const result = interpretRlcdChildOutcome(
      childOutcome(nearLimitOmissionTerminal(minimal)),
    );
    const details = detailsOf(result);
    assert.equal(details.stopReason, minimal ? "synthetic_error" : "done");
    assert.ok(
      Buffer.byteLength(result.content[0]?.text ?? "", "utf8") <=
        terminalByteLimit,
    );
    assert.ok(
      Buffer.byteLength(JSON.stringify(details), "utf8") <= terminalByteLimit,
    );
  }
});

test("outcome interpretation rejects malformed handoff evidence", () => {
  const malformed = terminalDetails();
  const reporting = recordField(malformed, "reporting");
  reporting.status = "selected";
  reporting.sourceCoverage = "complete";
  reporting.candidateCount = 1;
  reporting.qualifyingCandidateCount = 1;
  reporting.selectedCount = 1;
  reporting.evidence = [
    {
      kind: "page",
      source: "lastObservation.text",
      exact: "invented",
      cutBefore: false,
      cutAfter: false,
      relevance: Number.NaN,
    },
  ];
  const rejected = detailsOf(
    interpretRlcdChildOutcome(childOutcome(malformed)),
  );
  assert.equal(rejected.status, "error");
  assert.equal(rejected.stopReason, "invalid_terminal");
  assert.deepEqual(recordField(rejected, "reporting").evidence, []);
});

test("outcome interpretation preserves trusted evidence and late-stop precedence", () => {
  const completed = detailsOf(
    interpretRlcdChildOutcome(
      childOutcome(
        terminalDetails({
          status: "completion_claim",
          stopReason: "done",
          execution: "completed",
          targetId: "rlcd-owned-target",
          taskTab: "retained",
        }),
        { firstStop: "time_budget" },
      ),
    ),
  );
  assert.equal(completed.status, "completion_claim");
  assert.equal(completed.stopReason, "done");
  assert.equal(recordField(completed, "cleanup").taskTab, "retained");

  for (const childStatus of ["blocked", "error", "stopped"] as const) {
    const cooperativelyClosed = detailsOf(
      interpretRlcdChildOutcome(
        childOutcome(
          terminalDetails({
            status: childStatus,
            stopReason: childStatus,
            execution: "completed",
            targetId: "rlcd-owned-target",
            taskTab: "closed",
          }),
          { firstStop: "cancelled" },
        ),
      ),
    );
    assert.equal(cooperativelyClosed.status, "stopped");
    assert.equal(cooperativelyClosed.stopReason, "cancelled");
    assert.equal(cooperativelyClosed.execution, "completed");
    assert.equal(recordField(cooperativelyClosed, "cleanup").taskTab, "closed");
  }

  const untrusted = detailsOf(
    interpretRlcdChildOutcome(
      childOutcome(terminalDetails(), {
        firstStop: "cancelled",
        exitCode: 31,
      }),
    ),
  );
  assert.equal(untrusted.status, "stopped");
  assert.equal(untrusted.execution, "unknown");
  assert.equal(recordField(untrusted, "cleanup").taskTab, "unknown");
  assert.equal(recordField(untrusted, "cleanup").bridgeProcess, "reaped");

  const exitUnobserved = detailsOf(
    interpretRlcdChildOutcome(
      childOutcome(null, {
        firstStop: "cancelled",
        exitObserved: false,
        exitCode: null,
      }),
    ),
  );
  assert.equal(recordField(exitUnobserved, "cleanup").bridgeProcess, "unknown");
});

test("final fitting preserves parent stop and reap or reports output limit", () => {
  const parentStopped = detailsOf(
    interpretRlcdChildOutcome(
      childOutcome(nearLimitTerminal(), { firstStop: "time_budget" }),
    ),
  );
  assert.equal(parentStopped.status, "stopped");
  assert.equal(parentStopped.stopReason, "time_budget");
  assert.equal(recordField(parentStopped, "cleanup").bridgeProcess, "reaped");
  assertTextHelperAvailabilityAbsent(parentStopped);

  const noParentStop = detailsOf(
    interpretRlcdChildOutcome(childOutcome(nearLimitTerminal())),
  );
  assert.equal(noParentStop.status, "error");
  assert.equal(noParentStop.stopReason, "output_limit");
  assert.equal(recordField(noParentStop, "cleanup").bridgeProcess, "reaped");
  assertTextHelperAvailabilityAbsent(noParentStop);
});

test(
  "runner cancellation waits for protected stdin-read readiness",
  { timeout: 6_000 },
  async () => {
    let pid: number | undefined;
    await withReadReadyRunner({ startupDelayMs: 800 }, async (runner) => {
      pid = runner.pid;
      const cancellation = runner.cancel();
      assert.strictEqual(runner.cancel(), cancellation);
      const observed = await cancellation;
      assert.equal(observed.cancellation.requested, true);
      assert.equal(observed.cancellation.signal, "SIGTERM");
      assert.equal(observed.cancellation.sent, true);
      assert.deepEqual(observed.exit, observed.close);
      assert.equal(observed.close.code, 0);
      assert.equal(observed.close.signal, null);
      assert.equal(Object.isFrozen(observed), true);
      assert.equal(Object.isFrozen(observed.terminal), true);
      const details = observed.terminal as Record<string, unknown>;
      assert.equal(details.status, "stopped");
      assert.equal(details.stopReason, "cancelled");
      assert.equal(details.execution, "not_started");
      assert.equal(recordField(details, "cleanup").taskTab, "not_created");
      assert.equal(recordField(details, "diagnostic").type, "StopRequested");
      assertTextHelperAvailabilityAbsent(details);
    });
    assert.ok(pid !== undefined);
    assertProcessGone(pid);
  },
);

test("readiness failure still closes input and reaps the owned bridge", async () => {
  const directoriesBefore = await readReadyFixtureDirectories();
  let bodyEntered = false;
  let pid: number | undefined;
  await assert.rejects(
    withReadReadyRunner(
      { suppressReadiness: true, operationTimeoutMs: 100 },
      () => {
        bodyEntered = true;
      },
    ),
    (error: unknown) => {
      if (!(error instanceof ReadReadyFixtureError)) return false;
      pid = error.pid;
      return /read readiness (exceeded|failed)/.test(error.message);
    },
  );
  assert.equal(bodyEntered, false);
  assert.ok(pid !== undefined);
  assertProcessGone(pid);
  assert.deepEqual(await readReadyFixtureDirectories(), directoriesBefore);
});

test(
  "readiness scope cleans up callback failure and closes timed-out operations",
  { timeout: 6_000 },
  async () => {
    const directoriesBefore = await readReadyFixtureDirectories();
    let failedBodyPid: number | undefined;
    await assert.rejects(
      withReadReadyRunner({}, (runner) => {
        failedBodyPid = runner.pid;
        throw new Error("fixture callback failed");
      }),
      /fixture callback failed/,
    );
    assert.ok(failedBodyPid !== undefined);
    assertProcessGone(failedBodyPid);

    let timedOutRunner: ReadReadyRunner | undefined;
    await assert.rejects(
      withReadReadyRunner({ operationTimeoutMs: 1_000 }, async (runner) => {
        timedOutRunner = runner;
        await new Promise<never>(() => {});
      }),
      /read-ready operation exceeded 1000 ms/,
    );
    assert.ok(timedOutRunner !== undefined);
    assertProcessGone(timedOutRunner.pid);
    await assert.rejects(
      timedOutRunner.cancel(),
      /read-ready operation is closed outside its scope/,
    );
    assert.deepEqual(await readReadyFixtureDirectories(), directoriesBefore);
  },
);

test("launch outcomes distinguish no PID from a Python-started missing script", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rlcd-launch-test-"));
  const existingScript = join(directory, "runner.py");
  await writeFile(existingScript, "", "utf8");
  try {
    const noPidResult = await registeredTool(
      createRlcdBrwsrExtension({
        pythonExecutable: join(directory, "missing-python"),
        runnerExecutable: existingScript,
      }),
    ).execute(
      "test-call",
      {
        url: "https://example.test/start",
        goal: "Complete the deterministic fixture",
      },
      undefined,
    );
    const noPid = detailsOf(noPidResult);
    assert.equal(noPid.status, "error");
    assert.equal(noPid.stopReason, "setup_error");
    assert.equal(noPid.execution, "not_started");
    assert.equal(recordField(noPid, "cleanup").taskTab, "not_created");
    assert.equal(recordField(noPid, "cleanup").bridgeProcess, "not_started");

    const synchronousThrow = detailsOf(
      await registeredTool(
        createRlcdBrwsrExtension({
          pythonExecutable: "invalid\0python",
          runnerExecutable: existingScript,
        }),
      ).execute(
        "test-call",
        {
          url: "https://example.test/start",
          goal: "Complete the deterministic fixture",
        },
        undefined,
      ),
    );
    assert.equal(synchronousThrow.status, "error");
    assert.equal(synchronousThrow.stopReason, "setup_error");
    assert.equal(synchronousThrow.execution, "not_started");

    let abortChecks = 0;
    const stopDuringLaunch = {
      get aborted() {
        abortChecks += 1;
        return abortChecks > 1;
      },
      addEventListener() {},
      removeEventListener() {},
    } as unknown as AbortSignal;
    const stoppedNoPid = detailsOf(
      await registeredTool(
        createRlcdBrwsrExtension({
          pythonExecutable: join(directory, "missing-python-after-stop"),
          runnerExecutable: existingScript,
        }),
      ).execute(
        "test-call",
        {
          url: "https://example.test/start",
          goal: "Complete the deterministic fixture",
        },
        stopDuringLaunch,
      ),
    );
    assert.equal(stoppedNoPid.status, "stopped");
    assert.equal(stoppedNoPid.stopReason, "cancelled");
    assert.equal(stoppedNoPid.execution, "not_started");

    const missingScriptResult = await registeredTool(
      createRlcdBrwsrExtension({
        pythonExecutable: join(repositoryRoot, ".venv", "bin", "python"),
        runnerExecutable: join(directory, "missing-runner.py"),
      }),
    ).execute(
      "test-call",
      {
        url: "https://example.test/start",
        goal: "Complete the deterministic fixture",
      },
      undefined,
    );
    const missingScript = detailsOf(missingScriptResult);
    assert.equal(missingScript.status, "error");
    assert.equal(missingScript.stopReason, "nonclean_exit");
    assert.equal(missingScript.execution, "unknown");
    assert.equal(recordField(missingScript, "cleanup").taskTab, "unknown");
    assert.equal(recordField(missingScript, "cleanup").bridgeProcess, "reaped");
    assertTextHelperAvailabilityAbsent(missingScript);

    let missingScriptAbortChecks = 0;
    const stopAfterMissingScriptSpawn = {
      get aborted() {
        missingScriptAbortChecks += 1;
        return missingScriptAbortChecks > 1;
      },
      addEventListener() {},
      removeEventListener() {},
    } as unknown as AbortSignal;
    const stoppedMissingScript = detailsOf(
      await registeredTool(
        createRlcdBrwsrExtension({
          pythonExecutable: join(repositoryRoot, ".venv", "bin", "python"),
          runnerExecutable: join(directory, "missing-after-stop.py"),
        }),
      ).execute(
        "test-call",
        {
          url: "https://example.test/start",
          goal: "Complete the deterministic fixture",
        },
        stopAfterMissingScriptSpawn,
      ),
    );
    assert.equal(stoppedMissingScript.status, "stopped");
    assert.equal(stoppedMissingScript.stopReason, "cancelled");
    assert.equal(stoppedMissingScript.execution, "unknown");
    assert.equal(
      recordField(stoppedMissingScript, "cleanup").bridgeProcess,
      "reaped",
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

test(
  "terminal claims require a clean exit and a valid result envelope",
  { timeout: 8_000 },
  async () => {
    for (const [scenario, maxSeconds] of [
      ["terminal_then_nonzero", 5],
      ["terminal_then_ignore_term", 1],
      ["invalid_terminal_envelope", 5],
      ["invalid_retained_terminal", 5],
    ] as const) {
      await withScenario(
        scenario,
        { params: { maxSeconds } },
        async ({ result, markers }) => {
          const details = detailsOf(result);
          assert.equal(recordField(details, "completionClaim").claimed, false);
          assert.equal(details.execution, "unknown");
          const cleanup = recordField(details, "cleanup");
          assert.equal(cleanup.taskTab, "unknown");
          assert.equal(cleanup.bridgeProcess, "reaped");
          if (scenario === "terminal_then_ignore_term") {
            assert.equal(details.status, "stopped");
            assert.equal(details.stopReason, "time_budget");
            const pid = Number((await readFile(markers.pid, "utf8")).trim());
            assert.throws(
              () => process.kill(pid, 0),
              (error: NodeJS.ErrnoException) => error.code === "ESRCH",
            );
          } else {
            assert.equal(details.status, "error");
          }
        },
      );
    }
  },
);

test(
  "a forced borrowed exit overwrites attachment and focus claims with uncertainty",
  { timeout: 8_000 },
  async () => {
    await withScenario(
      "ignore_term",
      {
        omitDefaultUrl: true,
        params: { targetId: "rlcd-borrowed-target", maxSeconds: 1 },
      },
      async ({ result, markers }) => {
        const details = detailsOf(result);
        assert.equal(details.status, "stopped");
        assert.equal(details.stopReason, "time_budget");
        assert.equal(details.execution, "unknown");
        const cleanup = recordField(details, "cleanup");
        assert.equal(cleanup.taskTab, "unknown");
        assert.equal(cleanup.focusEmulation, "unknown");
        assert.equal(cleanup.attachment, "unknown");
        assert.equal(cleanup.bridgeProcess, "reaped");
        const pid = Number((await readFile(markers.pid, "utf8")).trim());
        assertProcessGone(pid);
      },
    );
  },
);

test(
  "a TERM-ignoring child is hard-stopped, observed exited, and actually reaped",
  { timeout: 8_000 },
  async () => {
    await withScenario(
      "ignore_term",
      { params: { maxSeconds: 1 } },
      async ({ result, markers }) => {
        const details = detailsOf(result);
        assert.equal(details.status, "stopped");
        assert.equal(details.stopReason, "time_budget");
        assert.equal(details.execution, "unknown");
        const cleanup = recordField(details, "cleanup");
        assert.equal(cleanup.taskTab, "unknown");
        assert.equal(cleanup.bridgeProcess, "reaped");
        const pid = Number((await readFile(markers.pid, "utf8")).trim());
        assert.ok(Number.isInteger(pid) && pid > 0);
        assert.throws(
          () => process.kill(pid, 0),
          (error: NodeJS.ErrnoException) => error.code === "ESRCH",
        );
      },
    );
  },
);

test(
  "output fitting preserves a parent time budget and observed process reap",
  { timeout: 5_000 },
  async () => {
    await withScenario(
      "near_limit_terminal_after_stop",
      { params: { maxSeconds: 1 } },
      ({ result }) => {
        const details = detailsOf(result);
        assert.equal(details.status, "stopped");
        assert.equal(details.stopReason, "time_budget");
        assert.equal(details.execution, "unknown");
        const cleanup = recordField(details, "cleanup");
        assert.equal(cleanup.taskTab, "unknown");
        assert.equal(cleanup.bridgeProcess, "reaped");
        assert.ok(
          Buffer.byteLength(result.content[0]?.text ?? "", "utf8") <=
            terminalByteLimit,
        );
      },
    );
  },
);

test("terminal JSON stays bounded and safe for Unicode, numbers, and oversized native state", async () => {
  for (const scenario of ["surrogate_usage", "terminal_overflow"]) {
    await withScenario(scenario, {}, async ({ result, markers }) => {
      const details = detailsOf(result);
      const text = serializedSurfaces(result);
      assert.ok(
        Buffer.byteLength(result.content[0]?.text ?? "", "utf8") <=
          terminalByteLimit,
      );
      assert.doesNotMatch(text, /[\uD800-\uDFFF]/u);
      assert.doesNotMatch(text, /NaN|Infinity/);
      if (scenario === "terminal_overflow") {
        assert.equal(recordField(details, "output").clipped, true);
        assert.ok(
          arrayField(recordField(details, "output"), "omissions").length > 0,
        );
        const compactOutput = recordField(compactOf(result), "output");
        assert.equal(compactOutput.detailsClipped, true);
        assert.equal(compactOutput.clipped, true);
        assert.ok(arrayField(compactOutput, "omissions").length > 0);
        const reporting = recordField(details, "reporting");
        assert.equal(reporting.sourceOmitted, true);
        assert.ok(Number(reporting.candidateCount) <= 128);
        const reportRequest = await readFile(markers.report, "utf8");
        assert.ok(Buffer.byteLength(reportRequest, "utf8") <= 98_304);
      } else {
        assert.doesNotMatch(text, new RegExp(syntheticTypesafeKey));
        assert.doesNotMatch(text, new RegExp(syntheticHelperKey));
        assert.match(text, /\[REDACTED\]/);
        const records = arrayField(recordField(details, "usage"), "records");
        assert.ok(records.length > 0);
        const usage = recordField(
          records[0] as Record<string, unknown>,
          "usage",
        );
        assert.equal(usage.unsafe_integer, null);
        assert.equal(usage.fractional_cost, 0.125);
        assert.equal(usage.not_finite, null);
        assert.ok(Object.values(usage).includes(11));
        assert.ok(Object.values(usage).includes(22));
        assert.equal(
          Object.keys(usage).filter((key) => key.startsWith("[REDACTED]"))
            .length,
          2,
        );
      }
    });
  }
});

test("unsafe numbers in a child terminal envelope are rejected", async () => {
  await withScenario("unsafe_terminal_number", {}, ({ result }) => {
    const details = detailsOf(result);
    assert.equal(details.status, "error");
    assert.equal(details.stopReason, "invalid_terminal");
    assert.equal(details.execution, "unknown");
  });
});

test(
  "projection bounds oversized explicit state without mutating an Agent",
  { timeout: 5_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "rlcd-projection-test-"));
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let closed = false;
    const child = spawn(
      join(repositoryRoot, ".venv", "bin", "python"),
      [
        "-I",
        "-B",
        "-c",
        'import runpy, sys; sys.path.insert(0, sys.argv[1]); runpy.run_path(sys.argv[2], run_name="__main__")',
        join(repositoryRoot, "bridge"),
        join(fakePythonPath, "projection_contract.py"),
      ],
      {
        cwd: repositoryRoot,
        env: {
          HOME: directory,
          TMPDIR: directory,
          PATH: process.env.PATH,
          PYTHONNOUSERSITE: "1",
          PYTHONDONTWRITEBYTECODE: "1",
        },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    const close = new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolveClose) => {
      child.once("close", (code, signal) => {
        closed = true;
        resolveClose({ code, signal });
      });
    });
    child.on("error", () => {
      // The close result and captured stderr own the fixture outcome.
    });

    try {
      const result = await within(close, 3_000, "projection contract");
      assert.equal(result.code, 0, Buffer.concat(stderr).toString("utf8"));
      assert.equal(result.signal, null);
      assert.match(
        Buffer.concat(stdout).toString("utf8"),
        /projection contract: 8 checks passed/,
      );
    } finally {
      if (!closed) child.kill("SIGTERM");
      if (!closed) {
        try {
          await within(close, 500, "projection contract TERM shutdown");
        } catch {
          if (!closed) child.kill("SIGKILL");
        }
      }
      if (!closed) {
        await within(close, 1_000, "projection contract KILL shutdown");
      }
      await rm(directory, { recursive: true });
    }
  },
);

test("both native keys are redacted before clipping and never enter argv or stdin", async () => {
  await withScenario("secret_error", {}, async ({ result, markers }) => {
    const text = serializedSurfaces(result);
    assert.doesNotMatch(text, new RegExp(syntheticTypesafeKey));
    assert.doesNotMatch(text, new RegExp(syntheticHelperKey));
    assert.match(text, /\[REDACTED\]/);
    assert.ok(recordField(detailsOf(result), "lastObservation"));

    const argv = await readFile(markers.argv, "utf8");
    const stdin = await readFile(markers.stdin, "utf8");
    for (const secret of [syntheticTypesafeKey, syntheticHelperKey]) {
      assert.doesNotMatch(argv, new RegExp(secret));
      assert.doesNotMatch(stdin, new RegExp(secret));
    }
  });
});

test("missing, oversized, and raw diagnostic child output are not echoed", async () => {
  await withScenario("missing_terminal", {}, async ({ result, markers }) => {
    const details = detailsOf(result);
    assert.equal(details.status, "error");
    assert.equal(details.execution, "unknown");
    const cleanup = recordField(details, "cleanup");
    assert.equal(cleanup.taskTab, "unknown");
    assert.equal(cleanup.bridgeProcess, "reaped");
    const browser = await readIfPresent(markers.browser);
    assert.match(browser, /created:rlcd-owned-target/);
    assert.doesNotMatch(browser, /close:/);
  });

  const laterCancellation = new AbortController();
  await withScenario(
    "raw_stdout_overflow",
    {
      signal: laterCancellation.signal,
      abortAfterTermAcknowledgement: laterCancellation,
    },
    async ({ result, markers, abortObservation }) => {
      const details = detailsOf(result);
      const text = result.content[0]?.text ?? "";
      const pid = Number((await readFile(markers.pid, "utf8")).trim());
      assert.ok(Number.isInteger(pid) && pid > 0);
      assert.equal(laterCancellation.signal.aborted, true);
      assert.deepEqual(abortObservation, {
        acknowledgement: `term-acknowledged:${pid}`,
        requested: true,
        signalAborted: true,
        toolPendingAtRequest: true,
      });
      assert.equal(details.status, "error");
      assert.equal(details.stopReason, "output_limit");
      assert.equal(details.execution, "unknown");
      const cleanup = recordField(details, "cleanup");
      assert.equal(cleanup.taskTab, "unknown");
      assert.equal(cleanup.bridgeProcess, "reaped");
      assertProcessGone(pid);
      assert.doesNotMatch(text, /raw-child-secret|synthetic-typesafe-key/);
      assert.match(
        String(recordField(details, "diagnostic").message),
        /byte limit/i,
      );
    },
  );

  await withScenario("raw_stderr_exit", {}, ({ result }) => {
    const details = detailsOf(result);
    const text = result.content[0]?.text ?? "";
    assert.equal(details.status, "error");
    assert.equal(details.execution, "unknown");
    assert.equal(recordField(details, "cleanup").taskTab, "unknown");
    assert.doesNotMatch(text, /raw-child-secret|synthetic-typesafe-key/);
    assert.match(
      String(recordField(details, "diagnostic").message),
      /terminal result/i,
    );
  });
});
