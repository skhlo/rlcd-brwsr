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
  url: string;
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
  helperKey?: string | null;
  textModel?: string;
  signal?: AbortSignal;
  abortWhenModelStarts?: AbortController;
  abortAfterTermAcknowledgement?: AbortController;
  params?: Partial<RlcdInput>;
  nativeEnvironment?: string;
  deferExternalFakesUntilNativeEnvironment?: boolean;
}

interface ScenarioMarkers {
  argv: string;
  stdin: string;
  browser: string;
  field: string;
  model: string;
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
const syntheticHelperKey = "synthetic-openrouter-key-STAR-73";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function detailsOf(result: ToolResult): Record<string, unknown> {
  assert.ok(isRecord(result.details), "tool details must be an object");
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0]?.type, "text");
  assert.deepEqual(JSON.parse(result.content[0]?.text ?? ""), result.details);
  assert.equal(
    result.usage,
    undefined,
    "native usage must not enter Pi totals",
  );
  return result.details;
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
    taskTab?: "not_created" | "unknown" | "retained" | "closed" | "unconfirmed";
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
        configuredModel: "inclusionai/ling-3.0-flash",
        baseUrl: "https://openrouter.ai/api/v1",
        reasoning: "none",
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
      taskTab: options.taskTab ?? "unknown",
      sharedDaemon: "retained",
    },
    diagnostic: null,
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
  const observation = recordField(details, "lastObservation");
  const emptySize = Buffer.byteLength(JSON.stringify(details), "utf8");
  observation.text = "P".repeat(terminalByteLimit - emptySize);
  assert.equal(
    Buffer.byteLength(JSON.stringify(details), "utf8"),
    terminalByteLimit,
  );
  return details;
}

function registeredTool(
  extension: typeof rlcdBrwsrExtension = rlcdBrwsrExtension,
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

  let registered: CapturedTool | undefined;
  const pi = {
    registerTool(tool: CapturedTool) {
      registered = tool;
    },
  } as unknown as ExtensionAPI;

  extension(pi);
  assert.ok(registered);
  const captured = registered;
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
    pid: join(directory, "pid.txt"),
    termAcknowledgement: join(directory, "term-acknowledged.txt"),
  };
  if (options.nativeEnvironment !== undefined) {
    await writeFile(join(directory, ".env"), options.nativeEnvironment, "utf8");
  }
  const environment: Record<string, string | undefined> = {
    RLCD_TEST_SCENARIO: scenario,
    RLCD_TEST_ARGV_MARKER: markers.argv,
    RLCD_TEST_STDIN_MARKER: markers.stdin,
    RLCD_TEST_BROWSER_MARKER: markers.browser,
    RLCD_TEST_FIELD_MARKER: markers.field,
    RLCD_TEST_MODEL_MARKER: markers.model,
    RLCD_TEST_PID_MARKER: markers.pid,
    RLCD_TEST_TERM_ACK_MARKER: markers.termAcknowledgement,
    BH_AGENT_WORKSPACE: directory,
    BU_NAME: "rlcd-brwsr-test",
    BU_CDP_URL: "http://127.0.0.1:43114",
    TYPESAFE_API_KEY: syntheticTypesafeKey,
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
      options.abortWhenModelStarts ?? options.abortAfterTermAcknowledgement;
    const abortMarker = options.abortWhenModelStarts
      ? markers.model
      : markers.termAcknowledgement;
    let toolSettled = false;
    const toolWork = registeredTool()
      .execute(
        "test-call",
        {
          url: "https://example.test/start",
          goal: "Complete the deterministic fixture",
          ...options.params,
        },
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
    (error: NodeJS.ErrnoException) => error.code === "ESRCH",
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

test("the extension loads inertly and registers only the reduced sequential tool", () => {
  const tool = registeredTool();
  assert.equal(tool.name, "rlcd_brwsr_run");
  assert.equal(tool.executionMode, "sequential");
  assert.deepEqual(Object.keys(tool.parameters.properties ?? {}).sort(), [
    "goal",
    "maxSeconds",
    "retainTab",
    "url",
  ]);
  assert.doesNotMatch(tool.description, /maxActions|action budget/i);
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

test("native workspace helper conflicts are rejected before browser startup", async () => {
  await withScenario(
    "click",
    {
      helperKey: null,
      nativeEnvironment: [
        "TEXT_MODEL_API_KEY=synthetic-native-conflict-key",
        "TEXT_MODEL_BASE_URL=https://api.deepseek.com/v1",
        "TEXT_MODEL=deepseek-chat",
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

test("native field helper fills through the selected OpenRouter defaults", async () => {
  await withScenario("click", { helperKey: null }, ({ result }) => {
    assert.equal(detailsOf(result).status, "completion_claim");
  });
  await withScenario("fill", {}, async ({ result, markers }) => {
    const details = detailsOf(result);
    assert.equal(details.status, "completion_claim");
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
      "inclusionai/ling-3.0-flash",
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
    await withScenario(scenario, {}, ({ result }) => {
      const details = detailsOf(result);
      const text = result.content[0]?.text ?? "";
      assert.ok(Buffer.byteLength(text, "utf8") <= terminalByteLimit);
      assert.doesNotMatch(text, /[\uD800-\uDFFF]/u);
      assert.doesNotMatch(text, /NaN|Infinity/);
      if (scenario === "terminal_overflow") {
        assert.equal(recordField(details, "output").clipped, true);
        assert.ok(
          arrayField(recordField(details, "output"), "omissions").length > 0,
        );
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
      ["-I", "-B", join(fakePythonPath, "projection_contract.py")],
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
        /projection contract: 2 checks passed/,
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
    const text = result.content[0]?.text ?? "";
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
