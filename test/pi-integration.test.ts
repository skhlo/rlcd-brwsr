import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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
  details: Record<string, unknown>;
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

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fakePythonPath = join(repositoryRoot, "test", "python");

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
    "PYTHONPATH",
    "RLCD_BRWSR_DAEMON",
    "RLCD_TEST_EXPECTED_DAEMON",
    "RLCD_TEST_SCENARIO",
    "TYPESAFE_API_KEY",
    "TEXT_MODEL_API_KEY",
  ] as const;
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    PYTHONPATH: fakePythonPath,
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
    const details = result.details as {
      status: string;
      stopReason: string;
      completionClaim: {
        claimed: boolean;
        requiresIndependentVerification: boolean;
      };
      lastObservation: { url: string; evidence: string } | null;
      trace: Array<{ operation: string; action: string }>;
      usage: { jev: { decisions: Array<{ model: string }> } };
      cleanup: { taskTab: string; bridgeProcess: string; sharedDaemon: string };
      ownership: { targetId: string | null; bridgePid: number };
    };

    assert.equal(details.status, "completion_claim");
    assert.equal(details.stopReason, "done_claim");
    assert.deepEqual(details.completionClaim, {
      claimed: true,
      requiresIndependentVerification: true,
    });
    assert.equal(
      details.lastObservation?.url,
      "http://127.0.0.1:43113/destination.html",
    );
    assert.match(details.lastObservation?.evidence ?? "", /ORBIT-27/);
    assert.deepEqual(
      details.trace.map(({ operation }) => operation),
      ["CLICK", "DONE"],
    );
    assert.equal(
      details.usage.jev.decisions[0]?.model,
      "deterministic-jev-external-fake",
    );
    assert.deepEqual(details.cleanup, {
      taskTab: "closed",
      bridgeProcess: "reaped",
      sharedDaemon: "retained",
    });
    assert.equal(details.ownership.targetId, "rlcd-owned-target");
    assert.throws(
      () => process.kill(details.ownership.bridgePid, 0),
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
      assert.equal(result.details.stopReason, "invalid_input");
      assert.equal(
        (result.details.ownership as { bridgePid: number | null }).bridgePid,
        null,
      );
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
    const details = result.details as {
      status: string;
      stopReason: string;
      diagnostic: string;
      ownership: { daemon: string; targetId: string | null };
      cleanup: { taskTab: string; sharedDaemon: string };
    };

    assert.equal(details.status, "error");
    assert.equal(details.stopReason, "setup_error");
    assert.match(details.diagnostic, /required daemon.*is not running/);
    assert.equal(details.ownership.daemon, "rlcd-brwsr-test");
    assert.equal(details.ownership.targetId, null);
    assert.equal(details.cleanup.taskTab, "not_created");
    assert.equal(details.cleanup.sharedDaemon, "retained");
  });
});

test("click-only use advertises missing text capability and stops before TYPE_TEXT", async () => {
  await withFakeExternalInteractions("needs_text", async () => {
    const result = await registeredTool().execute(
      "needs-text",
      baseInput(),
      new AbortController().signal,
    );
    const details = result.details as {
      status: string;
      stopReason: string;
      diagnostic: string;
      trace: Array<{ operation: string; outcome: string; elapsedMs: number }>;
      usage: { textHelper: { configured: boolean; calls: unknown[] } };
      cleanup: { taskTab: string };
    };

    assert.equal(details.status, "stopped");
    assert.equal(details.stopReason, "needs_text");
    assert.match(details.diagnostic, /TEXT_MODEL_API_KEY/);
    assert.deepEqual(details.trace, [
      {
        step: 1,
        operation: "TYPE_TEXT",
        action: "Optional search",
        outcome: "needs_text",
        elapsedMs: details.trace[0]?.elapsedMs,
      },
    ]);
    assert.deepEqual(details.usage.textHelper, {
      configured: false,
      calls: [],
      providerHttpAttempts: "unavailable",
      providerCost: "unavailable",
    });
    assert.equal(details.cleanup.taskTab, "closed");
  });
});

test("action budget stops further upstream dispatch and retains observed evidence", async () => {
  await withFakeExternalInteractions("always_click", async () => {
    const result = await registeredTool().execute(
      "action-budget",
      baseInput({ maxActions: 1 }),
      new AbortController().signal,
    );
    const details = result.details as {
      stopReason: string;
      lastObservation: { evidence: string };
      trace: Array<{ operation: string; outcome: string }>;
      cleanup: { taskTab: string; bridgeProcess: string };
    };

    assert.equal(details.stopReason, "action_budget");
    assert.match(details.lastObservation.evidence, /ORBIT-27/);
    assert.deepEqual(
      details.trace.map(({ operation, outcome }) => ({ operation, outcome })),
      [{ operation: "CLICK", outcome: "executed" }],
    );
    assert.equal(details.cleanup.taskTab, "closed");
    assert.equal(details.cleanup.bridgeProcess, "reaped");
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
    const details = result.details as {
      status: string;
      stopReason: string;
      ownership: { targetId: string; bridgePid: number };
      cleanup: { taskTab: string; bridgeProcess: string; sharedDaemon: string };
    };

    assert.equal(cancellationRequested, true);
    assert.equal(details.status, "stopped");
    assert.equal(details.stopReason, "cancelled");
    assert.equal(details.ownership.targetId, "rlcd-owned-target");
    assert.deepEqual(details.cleanup, {
      taskTab: "closed",
      bridgeProcess: "reaped",
      sharedDaemon: "retained",
    });
    assert.throws(
      () => process.kill(details.ownership.bridgePid, 0),
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
    const details = result.details as {
      status: string;
      stopReason: string;
      lastObservation: { evidence: string };
      timing: { elapsedMs: number; wallBudgetMs: number };
      cleanup: { taskTab: string; bridgeProcess: string };
    };

    assert.equal(details.status, "stopped");
    assert.equal(details.stopReason, "time_budget");
    assert.match(details.lastObservation.evidence, /Click Continue/);
    assert.equal(details.timing.wallBudgetMs, 1_000);
    assert.ok(details.timing.elapsedMs >= 900);
    assert.equal(details.cleanup.taskTab, "closed");
    assert.equal(details.cleanup.bridgeProcess, "reaped");
  });
});

test("provider failures cannot expose configured credentials", async () => {
  await withFakeExternalInteractions("provider_secret_error", async () => {
    const secret = process.env.TYPESAFE_API_KEY!;
    const result = await registeredTool().execute(
      "redacted-provider-failure",
      baseInput(),
      new AbortController().signal,
    );

    assert.equal(result.details.stopReason, "upstream_error");
    assert.match(String(result.details.diagnostic), /\[REDACTED\]/);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
    assert.match(
      String(
        (result.details.lastObservation as { evidence: string } | null)
          ?.evidence,
      ),
      /Click Continue/,
    );
  });
});

test("model-visible output stays bounded while disclosing truncated evidence", async () => {
  await withFakeExternalInteractions("large_evidence", async () => {
    const result = await registeredTool().execute(
      "bounded-output",
      baseInput(),
      new AbortController().signal,
    );
    const observation = result.details.lastObservation as {
      evidence: string;
      evidenceTruncated: boolean;
    };

    assert.equal(result.details.stopReason, "done_claim");
    assert.equal(observation.evidenceTruncated, true);
    assert.ok(observation.evidence.length <= 4_000);
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
    const details = result.details as {
      status: string;
      stopReason: string;
      trace: unknown[];
      traceTruncated: boolean;
      cleanup: { taskTab: string; bridgeProcess: string };
    };

    assert.equal(details.stopReason, "action_budget");
    assert.equal(details.status, "stopped");
    assert.ok(details.trace.length > 0);
    assert.equal(details.traceTruncated, true);
    assert.deepEqual(details.cleanup, {
      taskTab: "closed",
      bridgeProcess: "reaped",
      sharedDaemon: "retained",
    });
  });
});
