import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import rlcdBrwsrExtension from "../config/pi/extensions/rlcd-brwsr.ts";

interface RlcdInput {
  url: string;
  goal: string;
  maxActions?: number;
  maxSeconds?: number;
}

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  details: unknown;
}

interface RegisteredTool {
  name: string;
  executionMode?: string;
  execute(
    toolCallId: string,
    params: RlcdInput,
    signal: AbortSignal | undefined,
    onUpdate?: (result: ToolResult) => void,
  ): Promise<ToolResult>;
}

const execFileAsync = promisify(execFile);
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fakePythonPath = join(repositoryRoot, "test", "python");
const nativeDaemonName = "rlcd-brwsr-test";
const nativeCdpUrl = "http://127.0.0.1:43114";
const nativeHarnessConfiguration = `BU_NAME=${nativeDaemonName}\nBU_CDP_URL=${nativeCdpUrl}\n`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function detailsOf(result: ToolResult): Record<string, unknown> {
  assert.ok(isRecord(result.details), "tool details must be an object");
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

function nullableRecordField(
  owner: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = owner[key];
  if (value === null) return null;
  assert.ok(isRecord(value), `${key} must be an object or null`);
  return value;
}

function arrayField(owner: Record<string, unknown>, key: string): unknown[] {
  const value = owner[key];
  assert.ok(Array.isArray(value), `${key} must be an array`);
  return value;
}

function stringField(owner: Record<string, unknown>, key: string): string {
  const value = owner[key];
  assert.ok(typeof value === "string", `${key} must be a string`);
  return value;
}

function booleanField(owner: Record<string, unknown>, key: string): boolean {
  const value = owner[key];
  assert.ok(typeof value === "boolean", `${key} must be a boolean`);
  return value;
}

function numberField(owner: Record<string, unknown>, key: string): number {
  const value = owner[key];
  assert.ok(typeof value === "number", `${key} must be a number`);
  return value;
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  assert.ok(isRecord(value), `${label} must be an object`);
  return value;
}

function registeredTool(): RegisteredTool {
  let registered: RegisteredTool | undefined;
  const pi = {
    registerTool(tool: RegisteredTool) {
      registered = tool;
    },
  } as unknown as ExtensionAPI;
  rlcdBrwsrExtension(pi);
  assert.ok(registered);
  return registered;
}

interface FakeExternalOptions {
  nativeConfiguration?: string;
  browserWorkMarker?: string;
  daemonStartMarker?: string;
}

async function withFakeExternalInteractions<T>(
  scenario: string,
  run: (harnessHome: string) => Promise<T>,
  options: FakeExternalOptions = {},
): Promise<T> {
  const harnessHome = await mkdtemp(join(tmpdir(), "rlcd-harness-"));
  const workspace = join(harnessHome, "agent-workspace");
  await mkdir(workspace);
  await writeFile(
    join(workspace, ".env"),
    options.nativeConfiguration ?? nativeHarnessConfiguration,
  );

  const keys = [
    "BH_AGENT_WORKSPACE",
    "BH_HOME",
    "BROWSER_HARNESS_HOME",
    "BU_AUTOSPAWN",
    "BU_BROWSER_ID",
    "BU_CDP_URL",
    "BU_CDP_WS",
    "BU_NAME",
    "PYTHONPATH",
    "RLCD_TEST_ARGV_MARKER",
    "RLCD_TEST_BROWSER_WORK_MARKER",
    "RLCD_TEST_DAEMON_START_MARKER",
    "RLCD_TEST_EXPECTED_DAEMON",
    "RLCD_TEST_FIELD_MUTATION_MARKER",
    "RLCD_TEST_HELPER_REQUEST_MARKER",
    "RLCD_TEST_SCENARIO",
    "TYPESAFE_API_KEY",
    "TEXT_MODEL_API_KEY",
    "TEXT_MODEL_BASE_URL",
    "TEXT_MODEL",
  ] as const;
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, {
    BH_HOME: harnessHome,
    PYTHONPATH: fakePythonPath,
    RLCD_TEST_EXPECTED_DAEMON: nativeDaemonName,
    RLCD_TEST_SCENARIO: scenario,
    TYPESAFE_API_KEY: "synthetic-typesafe-key",
    ...(options.browserWorkMarker
      ? { RLCD_TEST_BROWSER_WORK_MARKER: options.browserWorkMarker }
      : {}),
    ...(options.daemonStartMarker
      ? { RLCD_TEST_DAEMON_START_MARKER: options.daemonStartMarker }
      : {}),
  });
  try {
    return await run(harnessHome);
  } finally {
    for (const key of keys) {
      const value = before[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(harnessHome, { recursive: true });
  }
}

function baseInput(overrides: Partial<RlcdInput> = {}): RlcdInput {
  return {
    url: "http://127.0.0.1:43113/start.html",
    goal: "Click Continue and stop when the ORBIT-27 marker is visible.",
    maxActions: 3,
    maxSeconds: 10,
    ...overrides,
  };
}

async function capturedFailure(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<Record<string, unknown>> {
  let failure: unknown;
  try {
    await execFileAsync(executable, args, { cwd: repositoryRoot, env });
  } catch (error) {
    failure = error;
  }
  assert.ok(isRecord(failure), "command must fail");
  return failure;
}

test("registered Pi tool loads native Harness workspace configuration and completes a click-only journey", async () => {
  await withFakeExternalInteractions("click_done", async (harnessHome) => {
    const helperRequestMarker = join(harnessHome, "helper-requested");
    process.env.RLCD_TEST_HELPER_REQUEST_MARKER = helperRequestMarker;
    const tool = registeredTool();
    assert.equal(tool.name, "rlcd_brwsr_run");
    assert.equal(tool.executionMode, "sequential");

    const result = await tool.execute(
      "click-journey",
      baseInput(),
      new AbortController().signal,
    );
    const details = detailsOf(result);
    const completionClaim = recordField(details, "completionClaim");
    const observation = nullableRecordField(details, "lastObservation");
    assert.ok(observation);
    const trace = arrayField(details, "trace").map((entry, index) =>
      recordValue(entry, `trace[${index}]`),
    );
    const jevUsage = recordField(recordField(details, "usage"), "jev");
    const decisions = arrayField(jevUsage, "decisions");
    const firstDecision = recordValue(decisions[0], "first Jev decision");
    const cleanup = recordField(details, "cleanup");
    const ownership = recordField(details, "ownership");

    assert.equal(stringField(details, "status"), "completion_claim");
    assert.equal(stringField(details, "stopReason"), "done_claim");
    assert.equal(booleanField(completionClaim, "claimed"), true);
    assert.equal(
      booleanField(completionClaim, "requiresIndependentVerification"),
      true,
    );
    assert.equal(
      stringField(observation, "url"),
      "http://127.0.0.1:43113/destination.html",
    );
    assert.match(stringField(observation, "evidence"), /ORBIT-27/);
    assert.deepEqual(
      trace.map((entry) => stringField(entry, "operation")),
      ["CLICK", "DONE"],
    );
    assert.equal(
      stringField(firstDecision, "reportedModel"),
      "deterministic-jev-external-fake",
    );
    assert.deepEqual(cleanup, {
      taskTab: "closed",
      bridgeProcess: "reaped",
      sharedDaemon: "retained",
    });
    assert.equal(stringField(ownership, "targetId"), "rlcd-owned-target");
    const bridgePid = numberField(ownership, "bridgePid");
    assert.throws(
      () => process.kill(bridgePid, 0),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "ESRCH",
    );
    assert.match(result.content[0]?.text ?? "", /completion_claim/);
    await assert.rejects(access(helperRequestMarker));
  });
});

test("registered Pi tool uses the configured upstream helper for a generated field value", async () => {
  await withFakeExternalInteractions("text_generated", async (harnessHome) => {
    const helperRequestMarker = join(harnessHome, "helper-requested");
    const fieldMutationMarker = join(harnessHome, "field-mutated");
    process.env.RLCD_TEST_HELPER_REQUEST_MARKER = helperRequestMarker;
    process.env.RLCD_TEST_FIELD_MUTATION_MARKER = fieldMutationMarker;
    process.env.TEXT_MODEL_API_KEY = "synthetic-text-helper-key";
    process.env.TEXT_MODEL_BASE_URL = "http://127.0.0.1:43115/v1";
    process.env.TEXT_MODEL = "synthetic-text-helper-v1";

    const result = await registeredTool().execute(
      "generated-field-value",
      baseInput({
        goal: "Fill Destination city with South Korea's second-largest city, then stop when marker FIELD-41 is visible.",
      }),
      new AbortController().signal,
    );
    const details = detailsOf(result);
    const observation = nullableRecordField(details, "lastObservation");
    assert.ok(observation);
    const usage = recordField(details, "usage");
    const jevUsage = recordField(usage, "jev");
    const helperUsage = recordField(usage, "textHelper");
    const helperCalls = arrayField(helperUsage, "calls");
    assert.equal(helperCalls.length, 1);
    const helperCall = recordValue(helperCalls[0], "text helper call");

    assert.equal(stringField(details, "status"), "completion_claim");
    assert.match(stringField(observation, "evidence"), /Busan.*FIELD-41/);
    assert.equal(stringField(jevUsage, "configuredModel"), "jev-1.13.0");
    assert.equal(
      stringField(
        recordValue(arrayField(jevUsage, "decisions")[0], "first Jev decision"),
        "reportedModel",
      ),
      "deterministic-jev-external-fake",
    );
    assert.equal(
      stringField(helperUsage, "configuredModel"),
      "synthetic-text-helper-v1",
    );
    assert.equal(stringField(helperCall, "reportedModel"), "unavailable");
    assert.equal(stringField(helperCall, "field"), "Destination city");
    assert.deepEqual(helperCall.usage, {
      prompt_tokens: 19,
      completion_tokens: 4,
    });
    assert.ok(numberField(helperCall, "latencyMs") >= 0);
    assert.equal(jevUsage.providerHttpAttempts, "unavailable");
    assert.equal(jevUsage.providerCost, "unavailable");
    assert.equal(helperUsage.providerHttpAttempts, "unavailable");
    assert.equal(helperUsage.providerCost, "unavailable");
    assert.deepEqual(
      arrayField(details, "trace").map((entry, index) =>
        stringField(recordValue(entry, `trace[${index}]`), "operation"),
      ),
      ["TYPE_TEXT", "DONE"],
    );
    assert.equal(await access(helperRequestMarker), undefined);
    assert.equal(await access(fieldMutationMarker), undefined);
  });
});

test("unusable helper generations and provider failures stop before field mutation", async () => {
  for (const [scenario, diagnostic] of [
    ["text_malformed", /no valid field value/i],
    ["text_empty", /no valid field value/i],
    ["text_provider_failure", /connection failed/i],
    ["text_status_failure", /HTTP 503/i],
  ] as const) {
    await withFakeExternalInteractions(scenario, async (harnessHome) => {
      const helperRequestMarker = join(harnessHome, "helper-requested");
      const fieldMutationMarker = join(harnessHome, "field-mutated");
      process.env.TEXT_MODEL_API_KEY = "synthetic-text-helper-key";
      process.env.TEXT_MODEL_BASE_URL = "http://127.0.0.1:43115/v1";
      process.env.TEXT_MODEL = "synthetic-text-helper-v1";
      process.env.RLCD_TEST_HELPER_REQUEST_MARKER = helperRequestMarker;
      process.env.RLCD_TEST_FIELD_MUTATION_MARKER = fieldMutationMarker;

      const result = await registeredTool().execute(
        `helper-failure-${scenario}`,
        baseInput({
          goal: "Fill Destination city with South Korea's second-largest city, then stop when marker FIELD-41 is visible.",
        }),
        new AbortController().signal,
      );
      const details = detailsOf(result);
      const usage = recordField(details, "usage");
      const helperUsage = recordField(usage, "textHelper");
      const trace = arrayField(details, "trace").map((entry, index) =>
        recordValue(entry, `trace[${index}]`),
      );

      assert.equal(stringField(details, "status"), "error");
      assert.equal(stringField(details, "stopReason"), "text_helper_error");
      assert.equal(stringField(details, "mutationOutcome"), "not_in_flight");
      assert.match(stringField(details, "diagnostic"), diagnostic);
      assert.equal(trace.length, 1);
      assert.equal(stringField(trace[0]!, "operation"), "TYPE_TEXT");
      assert.equal(stringField(trace[0]!, "outcome"), "text_helper_error");
      assert.equal(
        arrayField(recordField(usage, "jev"), "decisions").length,
        1,
      );
      assert.deepEqual(helperUsage, {
        configured: true,
        configuredModel: "synthetic-text-helper-v1",
        calls: [],
        providerHttpAttempts: "unavailable",
        providerCost: "unavailable",
      });
      assert.equal(await access(helperRequestMarker), undefined);
      await assert.rejects(access(fieldMutationMarker));
    });
  }
});

test("invalid URL and limits stop before runtime preflight", async () => {
  await withFakeExternalInteractions("missing_daemon", async () => {
    const tool = registeredTool();
    for (const input of [
      baseInput({ url: "file:///tmp/not-browser-input" }),
      baseInput({ url: "https://user:secret@example.test/" }),
      baseInput({ maxActions: 0 }),
      baseInput({ maxSeconds: 121 }),
      baseInput({ goal: "   " }),
    ]) {
      const result = await tool.execute(
        "invalid-input",
        input,
        new AbortController().signal,
      );
      const details = detailsOf(result);
      assert.equal(stringField(details, "stopReason"), "invalid_input");
      assert.equal(recordField(details, "ownership").bridgePid, null);
    }
  });
});

test("exact-daemon preflight failure is actionable and starts no task tab", async () => {
  await withFakeExternalInteractions("missing_daemon", async () => {
    const result = await registeredTool().execute(
      "missing-daemon",
      baseInput(),
      new AbortController().signal,
    );
    const details = detailsOf(result);
    const ownership = recordField(details, "ownership");
    const cleanup = recordField(details, "cleanup");

    assert.equal(stringField(details, "status"), "error");
    assert.equal(stringField(details, "stopReason"), "setup_error");
    assert.match(
      stringField(details, "diagnostic"),
      /required daemon.*is not running/,
    );
    assert.equal(stringField(ownership, "daemon"), "rlcd-brwsr-test");
    assert.equal(ownership.targetId, null);
    assert.equal(stringField(cleanup, "taskTab"), "not_created");
    assert.equal(stringField(cleanup, "sharedDaemon"), "retained");
  });
});

test("run rejects a cloud daemon even when its name matches", async () => {
  await withFakeExternalInteractions("remote_daemon", async () => {
    const result = await registeredTool().execute(
      "remote-daemon",
      baseInput(),
      new AbortController().signal,
    );
    const details = detailsOf(result);

    assert.equal(stringField(details, "stopReason"), "setup_error");
    assert.match(
      stringField(details, "diagnostic"),
      /cloud.*local browsers only/i,
    );
    assert.equal(recordField(details, "ownership").targetId, null);
  });
});

test("registered tool rejects resolved remote Harness configuration before browser work", async () => {
  const browserWorkMarker = join(
    tmpdir(),
    `rlcd-browser-work-${process.pid}-${Date.now()}`,
  );
  await rm(browserWorkMarker, { force: true });
  try {
    await withFakeExternalInteractions(
      "click_done",
      async () => {
        const result = await registeredTool().execute(
          "remote-native-configuration",
          baseInput(),
          new AbortController().signal,
        );
        const details = detailsOf(result);

        assert.equal(stringField(details, "stopReason"), "setup_error");
        assert.match(
          stringField(details, "diagnostic"),
          /remote\/cloud.*local browser configuration.*BU_BROWSER_ID/i,
        );
        assert.equal(recordField(details, "ownership").targetId, null);
        await assert.rejects(access(browserWorkMarker));
      },
      {
        nativeConfiguration: `${nativeHarnessConfiguration}BU_BROWSER_ID=synthetic-cloud-browser\n`,
        browserWorkMarker,
      },
    );
  } finally {
    await rm(browserWorkMarker, { force: true });
  }
});

test("click-only use advertises missing text capability and stops before TYPE_TEXT", async () => {
  await withFakeExternalInteractions("needs_text", async (harnessHome) => {
    const helperRequestMarker = join(harnessHome, "helper-requested");
    const fieldMutationMarker = join(harnessHome, "field-mutated");
    process.env.RLCD_TEST_HELPER_REQUEST_MARKER = helperRequestMarker;
    process.env.RLCD_TEST_FIELD_MUTATION_MARKER = fieldMutationMarker;
    const result = await registeredTool().execute(
      "needs-text",
      baseInput(),
      new AbortController().signal,
    );
    const details = detailsOf(result);
    const trace = arrayField(details, "trace");
    assert.equal(trace.length, 1);
    const entry = recordValue(trace[0], "trace[0]");
    const textUsage = recordField(recordField(details, "usage"), "textHelper");
    const timing = recordField(details, "timing");

    assert.equal(stringField(details, "status"), "stopped");
    assert.equal(stringField(details, "stopReason"), "needs_text");
    assert.match(stringField(details, "diagnostic"), /TEXT_MODEL_API_KEY/);
    assert.deepEqual(
      {
        step: numberField(entry, "step"),
        operation: stringField(entry, "operation"),
        action: stringField(entry, "action"),
        outcome: stringField(entry, "outcome"),
      },
      {
        step: 1,
        operation: "TYPE_TEXT",
        action: "Optional search",
        outcome: "needs_text",
      },
    );
    const traceElapsedMs = numberField(entry, "elapsedMs");
    assert.ok(Number.isFinite(traceElapsedMs));
    assert.ok(traceElapsedMs >= 0);
    assert.ok(traceElapsedMs <= numberField(timing, "elapsedMs"));
    assert.deepEqual(textUsage, {
      configured: false,
      configuredModel: null,
      calls: [],
      providerHttpAttempts: "unavailable",
      providerCost: "unavailable",
    });
    assert.equal(
      stringField(recordField(details, "cleanup"), "taskTab"),
      "closed",
    );
    await assert.rejects(access(helperRequestMarker));
    await assert.rejects(access(fieldMutationMarker));
  });
});

test("incomplete or invalid helper settings never select upstream defaults or mutate a field", async () => {
  await withFakeExternalInteractions("needs_text", async (harnessHome) => {
    const cases = [
      {
        name: "incomplete",
        environment: { TEXT_MODEL_API_KEY: "synthetic-lone-helper-key" },
        diagnostic: /missing TEXT_MODEL_BASE_URL, TEXT_MODEL/,
      },
      {
        name: "invalid-endpoint",
        environment: {
          TEXT_MODEL_API_KEY: "synthetic-text-helper-key",
          TEXT_MODEL_BASE_URL: "http://helper.example.test/v1",
          TEXT_MODEL: "synthetic-text-helper-v1",
        },
        diagnostic: /HTTPS endpoint or loopback HTTP endpoint/,
      },
    ] as const;

    for (const helperCase of cases) {
      const helperRequestMarker = join(
        harnessHome,
        `${helperCase.name}-helper-requested`,
      );
      const fieldMutationMarker = join(
        harnessHome,
        `${helperCase.name}-field-mutated`,
      );
      delete process.env.TEXT_MODEL_API_KEY;
      delete process.env.TEXT_MODEL_BASE_URL;
      delete process.env.TEXT_MODEL;
      Object.assign(process.env, helperCase.environment);
      process.env.RLCD_TEST_HELPER_REQUEST_MARKER = helperRequestMarker;
      process.env.RLCD_TEST_FIELD_MUTATION_MARKER = fieldMutationMarker;

      const result = await registeredTool().execute(
        `${helperCase.name}-helper`,
        baseInput(),
        new AbortController().signal,
      );
      const details = detailsOf(result);
      const helperUsage = recordField(
        recordField(details, "usage"),
        "textHelper",
      );

      assert.equal(stringField(details, "status"), "stopped");
      assert.equal(stringField(details, "stopReason"), "needs_text");
      assert.match(stringField(details, "diagnostic"), helperCase.diagnostic);
      assert.equal(helperUsage.configured, false);
      assert.equal(helperUsage.configuredModel, null);
      assert.deepEqual(arrayField(helperUsage, "calls"), []);
      await assert.rejects(access(helperRequestMarker));
      await assert.rejects(access(fieldMutationMarker));
    }
  });
});

test("helper secrets are redacted from progress, results, and retained diagnostics", async () => {
  await withFakeExternalInteractions(
    "text_secret_error",
    async (harnessHome) => {
      const helperSecret = "synthetic-text-helper-secret-ALPHA-73";
      const typesafeSecret = process.env.TYPESAFE_API_KEY;
      assert.ok(typesafeSecret);
      process.env.TEXT_MODEL_API_KEY = helperSecret;
      process.env.TEXT_MODEL_BASE_URL = "http://127.0.0.1:43115/v1";
      process.env.TEXT_MODEL = "synthetic-text-helper-v1";
      const updates: ToolResult[] = [];
      const argvArtifact = join(harnessHome, "bridge-argv.json");
      process.env.RLCD_TEST_ARGV_MARKER = argvArtifact;

      const result = await registeredTool().execute(
        "redacted-helper-failure",
        baseInput({
          goal: "Fill Destination city with South Korea's second-largest city, then stop when marker FIELD-41 is visible.",
        }),
        new AbortController().signal,
        (update) => updates.push(update),
      );
      const details = detailsOf(result);
      const retainedArtifact = join(harnessHome, "retained-tool-evidence.json");
      await writeFile(retainedArtifact, JSON.stringify({ result, updates }));
      const retained = await readFile(retainedArtifact, "utf8");
      const bridgeArgv = await readFile(argvArtifact, "utf8");

      assert.equal(stringField(details, "stopReason"), "text_helper_error");
      assert.match(stringField(details, "diagnostic"), /\[REDACTED\]/);
      for (const serialized of [
        JSON.stringify(result.content),
        JSON.stringify(result.details),
        JSON.stringify(updates),
        retained,
        bridgeArgv,
      ]) {
        assert.doesNotMatch(serialized, new RegExp(helperSecret));
        assert.doesNotMatch(serialized, new RegExp(typesafeSecret));
      }
      assert.match(JSON.stringify(updates), /\[REDACTED\]/);
      assert.doesNotMatch(bridgeArgv, /TEXT_MODEL|synthetic|Busan|FIELD-41/);
    },
  );
});

test("action budget stops further upstream dispatch and retains observed evidence", async () => {
  await withFakeExternalInteractions("always_click", async () => {
    const result = await registeredTool().execute(
      "action-budget",
      baseInput({ maxActions: 1 }),
      new AbortController().signal,
    );
    const details = detailsOf(result);
    const observation = nullableRecordField(details, "lastObservation");
    assert.ok(observation);
    const trace = arrayField(details, "trace").map((entry, index) =>
      recordValue(entry, `trace[${index}]`),
    );
    const cleanup = recordField(details, "cleanup");

    assert.equal(stringField(details, "stopReason"), "action_budget");
    assert.match(stringField(observation, "evidence"), /ORBIT-27/);
    assert.deepEqual(
      trace.map((entry) => ({
        operation: stringField(entry, "operation"),
        outcome: stringField(entry, "outcome"),
      })),
      [{ operation: "CLICK", outcome: "executed" }],
    );
    assert.equal(stringField(cleanup, "taskTab"), "closed");
    assert.equal(stringField(cleanup, "bridgeProcess"), "reaped");
  });
});

test("valid WAIT-heavy progress reaches the wall budget instead of a record-count protocol error", async () => {
  await withFakeExternalInteractions("wait_heavy", async () => {
    let progressUpdates = 0;
    const result = await registeredTool().execute(
      "wait-heavy",
      baseInput({ maxActions: 20, maxSeconds: 5 }),
      new AbortController().signal,
      () => {
        progressUpdates += 1;
      },
    );
    const details = detailsOf(result);
    const trace = arrayField(details, "trace");

    assert.equal(stringField(details, "status"), "stopped");
    assert.equal(stringField(details, "stopReason"), "time_budget");
    assert.notEqual(stringField(details, "stopReason"), "protocol_error");
    assert.ok(progressUpdates > 128);
    assert.equal(booleanField(details, "traceTruncated"), true);
    assert.ok(trace.length > 0);
    assert.ok(trace.length <= 24);
    assert.equal(
      stringField(recordField(details, "cleanup"), "bridgeProcess"),
      "reaped",
    );
  });
});

test("Pi cancellation cooperatively closes the owned tab and reaps the bridge", async () => {
  await withFakeExternalInteractions("cancel_model", async () => {
    const controller = new AbortController();
    let cancellationRequested = false;
    const result = await registeredTool().execute(
      "cancel-model",
      baseInput(),
      controller.signal,
      (update) => {
        if (
          !cancellationRequested &&
          update.content[0]?.text.includes('"phase":"observation"')
        ) {
          cancellationRequested = true;
          controller.abort(new Error("test cancellation"));
        }
      },
    );
    const details = detailsOf(result);
    const ownership = recordField(details, "ownership");
    const cleanup = recordField(details, "cleanup");

    assert.equal(cancellationRequested, true);
    assert.equal(stringField(details, "status"), "stopped");
    assert.equal(stringField(details, "stopReason"), "cancelled");
    assert.equal(stringField(ownership, "targetId"), "rlcd-owned-target");
    assert.deepEqual(cleanup, {
      taskTab: "closed",
      bridgeProcess: "reaped",
      sharedDaemon: "retained",
    });
    const bridgePid = numberField(ownership, "bridgePid");
    assert.throws(
      () => process.kill(bridgePid, 0),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "ESRCH",
    );
  });
});

test("wall budget includes model work and returns partial observed evidence", async () => {
  await withFakeExternalInteractions("slow_model", async () => {
    const result = await registeredTool().execute(
      "wall-budget",
      baseInput({ maxSeconds: 1 }),
      new AbortController().signal,
    );
    const details = detailsOf(result);
    const observation = nullableRecordField(details, "lastObservation");
    assert.ok(observation);
    const timing = recordField(details, "timing");
    const cleanup = recordField(details, "cleanup");

    assert.equal(stringField(details, "status"), "stopped");
    assert.equal(stringField(details, "stopReason"), "time_budget");
    assert.match(stringField(observation, "evidence"), /Click Continue/);
    assert.equal(numberField(timing, "wallBudgetMs"), 1_000);
    assert.ok(numberField(timing, "elapsedMs") >= 900);
    assert.equal(stringField(cleanup, "taskTab"), "closed");
    assert.equal(stringField(cleanup, "bridgeProcess"), "reaped");
  });
});

test("provider failures cannot expose configured credentials", async () => {
  await withFakeExternalInteractions("provider_secret_error", async () => {
    const secret = process.env.TYPESAFE_API_KEY;
    assert.ok(secret);
    const result = await registeredTool().execute(
      "redacted-provider-failure",
      baseInput(),
      new AbortController().signal,
    );
    const details = detailsOf(result);
    const observation = nullableRecordField(details, "lastObservation");
    assert.ok(observation);

    assert.equal(stringField(details, "stopReason"), "upstream_error");
    assert.match(stringField(details, "diagnostic"), /\[REDACTED\]/);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
    assert.match(stringField(observation, "evidence"), /Click Continue/);
  });
});

test("model-visible output stays bounded while disclosing truncated evidence", async () => {
  await withFakeExternalInteractions("large_evidence", async () => {
    const result = await registeredTool().execute(
      "bounded-output",
      baseInput(),
      new AbortController().signal,
    );
    const details = detailsOf(result);
    const observation = nullableRecordField(details, "lastObservation");
    assert.ok(observation);

    assert.equal(stringField(details, "stopReason"), "done_claim");
    assert.equal(booleanField(observation, "evidenceTruncated"), true);
    assert.ok(stringField(observation, "evidence").length <= 4_000);
    assert.ok((result.content[0]?.text.length ?? Infinity) <= 12_000);
  });
});

test("large bounded traces still produce a terminal result through the registered tool", async () => {
  await withFakeExternalInteractions("large_trace", async () => {
    const result = await registeredTool().execute(
      "large-trace",
      baseInput({ maxActions: 20 }),
      new AbortController().signal,
    );
    const details = detailsOf(result);
    const trace = arrayField(details, "trace");

    assert.equal(stringField(details, "stopReason"), "action_budget");
    assert.equal(stringField(details, "status"), "stopped");
    assert.ok(trace.length > 0);
    assert.equal(booleanField(details, "traceTruncated"), true);
    assert.deepEqual(recordField(details, "cleanup"), {
      taskTab: "closed",
      bridgeProcess: "reaped",
      sharedDaemon: "retained",
    });
  });
});

test("executable preflight loads native Harness workspace configuration", async () => {
  await withFakeExternalInteractions("click_done", async () => {
    const result = await execFileAsync(
      join(repositoryRoot, "scripts", "preflight-runtime.sh"),
      [],
      { cwd: repositoryRoot, env: { ...process.env } },
    );
    const report: unknown = JSON.parse(result.stdout);
    assert.ok(isRecord(report));
    assert.equal(report.ok, true);
    const checks = recordField(report, "checks");
    assert.equal(stringField(checks, "daemon"), nativeDaemonName);
    assert.equal(stringField(checks, "browserMode"), "cdp");
  });
});

test("preflight reports only coherent explicit helper configuration", async () => {
  await withFakeExternalInteractions("click_done", async () => {
    const secret = "synthetic-preflight-helper-secret";
    process.env.TEXT_MODEL_API_KEY = secret;
    process.env.TEXT_MODEL_BASE_URL = "https://helper.example.test/v1";
    process.env.TEXT_MODEL = "configured-helper-model-v1";
    const result = await execFileAsync(
      join(repositoryRoot, "scripts", "preflight-runtime.sh"),
      [],
      { cwd: repositoryRoot, env: { ...process.env } },
    );
    const report: unknown = JSON.parse(result.stdout);
    assert.ok(isRecord(report));
    const checks = recordField(report, "checks");

    assert.equal(checks.textHelperConfigured, true);
    assert.equal(stringField(checks, "textHelperConfiguration"), "configured");
    assert.equal(
      stringField(checks, "textHelperModel"),
      "configured-helper-model-v1",
    );
    assert.doesNotMatch(result.stdout, new RegExp(secret));
  });
});

test("preflight never creates or syncs a missing project environment", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "rlcd-preflight-"));
  const scriptsDirectory = join(temporaryRoot, "scripts");
  const fakeBin = join(temporaryRoot, "bin");
  const uvMarker = join(temporaryRoot, "uv-was-run");
  try {
    await mkdir(scriptsDirectory);
    await mkdir(fakeBin);
    await cp(
      join(repositoryRoot, "scripts", "preflight-runtime.sh"),
      join(scriptsDirectory, "preflight-runtime.sh"),
    );
    await writeFile(
      join(fakeBin, "uv"),
      `#!/usr/bin/env bash\nprintf called > ${JSON.stringify(uvMarker)}\n`,
      { mode: 0o755 },
    );

    const failure = await capturedFailure(
      "/bin/bash",
      [join(scriptsDirectory, "preflight-runtime.sh")],
      {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      },
    );
    assert.match(stringField(failure, "stderr"), /project runtime is missing/i);
    await assert.rejects(access(uvMarker));
  } finally {
    await rm(temporaryRoot, { recursive: true });
  }
});

test("explicit setup provisions from native Harness workspace configuration", async () => {
  await withFakeExternalInteractions("click_done", async (harnessHome) => {
    const daemonStartMarker = join(harnessHome, "daemon-started");
    process.env.RLCD_TEST_DAEMON_START_MARKER = daemonStartMarker;
    const result = await execFileAsync(
      join(repositoryRoot, "scripts", "provision-browser.sh"),
      [],
      { cwd: repositoryRoot, env: { ...process.env } },
    );

    assert.match(result.stdout, /Browser Harness daemon.*rlcd-brwsr-test/i);
    assert.equal(await access(daemonStartMarker), undefined);
  });
});

test("explicit setup rejects remote Harness configuration before daemon startup", async () => {
  const daemonStartMarker = join(
    tmpdir(),
    `rlcd-daemon-start-${process.pid}-${Date.now()}`,
  );
  await rm(daemonStartMarker, { force: true });
  try {
    await withFakeExternalInteractions(
      "click_done",
      async () => {
        const failure = await capturedFailure(
          join(repositoryRoot, "scripts", "provision-browser.sh"),
          [],
          { ...process.env },
        );
        assert.match(
          stringField(failure, "stderr"),
          /remote\/cloud.*local browser configuration.*BU_CDP_WS/i,
        );
        await assert.rejects(access(daemonStartMarker));
      },
      {
        nativeConfiguration: `BU_NAME=${nativeDaemonName}\nBU_CDP_WS=wss://synthetic-cloud.example.test/session\n`,
        daemonStartMarker,
      },
    );
  } finally {
    await rm(daemonStartMarker, { force: true });
  }
});
