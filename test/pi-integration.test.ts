import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
const selectedCdpUrl = "http://127.0.0.1:43114";

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

async function withFakeExternalInteractions<T>(
  scenario: string,
  run: () => Promise<T>,
): Promise<T> {
  const keys = [
    "BU_BROWSER_ID",
    "BU_CDP_URL",
    "BU_CDP_WS",
    "PYTHONPATH",
    "RLCD_BRWSR_CDP_URL",
    "RLCD_BRWSR_DAEMON",
    "RLCD_TEST_EXPECTED_DAEMON",
    "RLCD_TEST_SCENARIO",
    "TYPESAFE_API_KEY",
    "TEXT_MODEL_API_KEY",
  ] as const;
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    BU_BROWSER_ID: "inherited-cloud-browser",
    BU_CDP_URL: "https://inherited-cloud.example.test",
    BU_CDP_WS: "wss://inherited-cloud.example.test/devtools/browser/session",
    PYTHONPATH: fakePythonPath,
    RLCD_BRWSR_CDP_URL: selectedCdpUrl,
    RLCD_BRWSR_DAEMON: "rlcd-brwsr-test",
    RLCD_TEST_EXPECTED_DAEMON: "rlcd-brwsr-test",
    RLCD_TEST_SCENARIO: scenario,
    TYPESAFE_API_KEY: "synthetic-typesafe-key",
  });
  delete process.env.TEXT_MODEL_API_KEY;
  try {
    return await run();
  } finally {
    for (const key of keys) {
      const value = before[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
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

test("registered Pi tool completes a click-only journey through the real bridge and Agent", async () => {
  await withFakeExternalInteractions("click_done", async () => {
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
      stringField(firstDecision, "model"),
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
  });
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
      /cloud.*selected loopback/i,
    );
    assert.equal(recordField(details, "ownership").targetId, null);
  });
});

test("run rejects a same-named daemon bound to a different local Chrome", async () => {
  await withFakeExternalInteractions("mismatched_daemon", async () => {
    const result = await registeredTool().execute(
      "mismatched-daemon",
      baseInput(),
      new AbortController().signal,
    );
    const details = detailsOf(result);

    assert.equal(stringField(details, "stopReason"), "setup_error");
    assert.match(stringField(details, "diagnostic"), /binding mismatch/i);
    assert.equal(recordField(details, "ownership").targetId, null);
  });
});

test("run rejects a non-loopback selected browser endpoint before bridge startup", async () => {
  await withFakeExternalInteractions("click_done", async () => {
    process.env.RLCD_BRWSR_CDP_URL =
      "https://cloud.example.test/devtools/browser/session";
    const result = await registeredTool().execute(
      "remote-selected-endpoint",
      baseInput(),
      new AbortController().signal,
    );
    const details = detailsOf(result);

    assert.equal(stringField(details, "stopReason"), "setup_error");
    assert.match(
      stringField(details, "diagnostic"),
      /loopback HTTP CDP endpoint/i,
    );
    assert.equal(recordField(details, "ownership").bridgePid, null);
  });
});

test("click-only use advertises missing text capability and stops before TYPE_TEXT", async () => {
  await withFakeExternalInteractions("needs_text", async () => {
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
      calls: [],
      providerHttpAttempts: "unavailable",
      providerCost: "unavailable",
    });
    assert.equal(
      stringField(recordField(details, "cleanup"), "taskTab"),
      "closed",
    );
  });
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

test("executable preflight rejects a mismatched existing daemon binding", async () => {
  const failure = await capturedFailure(
    join(repositoryRoot, "scripts", "preflight-runtime.sh"),
    [],
    {
      ...process.env,
      BU_BROWSER_ID: "inherited-cloud-browser",
      BU_CDP_URL: "https://inherited-cloud.example.test",
      BU_CDP_WS: "wss://inherited-cloud.example.test/session",
      PYTHONPATH: fakePythonPath,
      RLCD_BRWSR_CDP_URL: selectedCdpUrl,
      RLCD_BRWSR_DAEMON: "rlcd-brwsr-test",
      RLCD_TEST_EXPECTED_DAEMON: "rlcd-brwsr-test",
      RLCD_TEST_SCENARIO: "mismatched_daemon",
      TYPESAFE_API_KEY: "synthetic-typesafe-key",
    },
  );
  assert.match(stringField(failure, "stdout"), /binding mismatch/i);
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

test("provisioning rejects remote or mismatched daemons and reuses the correct selected browser", async () => {
  const script = join(repositoryRoot, "scripts", "provision-browser.sh");
  const inherited = {
    ...process.env,
    BU_BROWSER_ID: "cloud-session",
    BU_CDP_URL: "https://cloud.example.test",
    BU_CDP_WS: "wss://cloud.example.test/session",
    PYTHONPATH: fakePythonPath,
    RLCD_BRWSR_DAEMON: "rlcd-brwsr-test",
    RLCD_TEST_EXPECTED_DAEMON: "rlcd-brwsr-test",
  };

  const missingSelection = await capturedFailure(script, [], inherited);
  assert.match(
    stringField(missingSelection, "stderr"),
    /RLCD_BRWSR_CDP_URL.*loopback/i,
  );

  const remoteDaemon = await capturedFailure(script, [], {
    ...inherited,
    RLCD_BRWSR_CDP_URL: selectedCdpUrl,
    RLCD_TEST_SCENARIO: "remote_daemon",
  });
  assert.match(
    stringField(remoteDaemon, "stderr"),
    /cloud.*selected loopback/i,
  );

  const mismatchedDaemon = await capturedFailure(script, [], {
    ...inherited,
    RLCD_BRWSR_CDP_URL: selectedCdpUrl,
    RLCD_TEST_SCENARIO: "mismatched_daemon",
  });
  assert.match(stringField(mismatchedDaemon, "stderr"), /binding mismatch/i);

  const success = await execFileAsync(script, [], {
    cwd: repositoryRoot,
    env: {
      ...inherited,
      RLCD_BRWSR_CDP_URL: selectedCdpUrl,
      RLCD_TEST_SCENARIO: "click_done",
    },
  });
  assert.match(success.stdout, /connected to the selected local endpoint/i);
});
