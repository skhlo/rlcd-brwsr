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
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import rlcdBrwsrExtension from "../config/pi/extensions/rlcd-brwsr.ts";

interface RlcdInput {
  url: string;
  goal: string;
  maxActions?: number;
  maxSeconds?: number;
  retainTab?: boolean;
}

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  details: unknown;
  usage?: unknown;
}

interface RegisteredTool {
  name: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  executionMode?: string;
  execute(
    toolCallId: string,
    params: RlcdInput,
    signal: AbortSignal | undefined,
    onUpdate?: (result: ToolResult) => void,
  ): Promise<ToolResult>;
}

interface HelperCompletionCall {
  provider: string;
  model: string;
  systemPrompt: string | undefined;
  userPrompt: string;
  reasoningEffort: unknown;
  signal: AbortSignal | undefined;
}

interface RegisteredToolOptions {
  helperCalls?: HelperCompletionCall[];
  helperModelAvailable?: boolean;
  helperAuthAvailable?: boolean;
}

const syntheticOAuthAccessToken = "synthetic-oauth-access-token-MOON-62";
const syntheticPiUsage = {
  input: 19,
  output: 4,
  cacheRead: 0,
  cacheWrite: 0,
  reasoning: 2,
  totalTokens: 23,
  cost: {
    input: 0.0019,
    output: 0.0004,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0.0023,
  },
};

const execFileAsync = promisify(execFile);
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fakePythonPath = join(repositoryRoot, "test", "python");
const nativeDaemonName = "rlcd-brwsr-test";
const nativeCdpUrl = "http://127.0.0.1:43114";
const nativeHarnessConfiguration = `BU_NAME=${nativeDaemonName}\nBU_CDP_URL=${nativeCdpUrl}\n`;

function codePointLength(value: string): number {
  return Array.from(value).length;
}

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

function registeredTool(options: RegisteredToolOptions = {}): RegisteredTool {
  type CapturedTool = Omit<RegisteredTool, "execute"> & {
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
  rlcdBrwsrExtension(pi);
  assert.ok(registered);
  const captured = registered;
  let helperCompletionCount = 0;
  const context = {
    modelRegistry: {
      find(provider: string, model: string) {
        if (process.env.RLCD_TEST_SCENARIO === "pre_spawn_delay") {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_100);
        }
        if (
          options.helperModelAvailable === false ||
          provider !== "openai-codex" ||
          model !== "gpt-5.6-luna"
        ) {
          return undefined;
        }
        return {
          id: model,
          provider,
          api: "openai-codex-responses",
          reasoning: true,
        };
      },
      hasConfiguredAuth() {
        return options.helperAuthAvailable !== false;
      },
      async complete(
        model: { id: string; provider: string },
        completionContext: {
          systemPrompt?: string;
          messages: Array<{
            role: string;
            content: Array<{ type: string; text: string }>;
          }>;
        },
        completionOptions: {
          reasoningEffort?: unknown;
          signal?: AbortSignal;
        },
      ) {
        helperCompletionCount += 1;
        const userPrompt = completionContext.messages
          .flatMap((message) => message.content)
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n");
        options.helperCalls?.push({
          provider: model.provider,
          model: model.id,
          systemPrompt: completionContext.systemPrompt,
          userPrompt,
          reasoningEffort: completionOptions.reasoningEffort,
          signal: completionOptions.signal,
        });
        const marker = process.env.RLCD_TEST_HELPER_REQUEST_MARKER;
        if (marker) await writeFile(marker, "called\n", { flag: "a" });
        const scenario = process.env.RLCD_TEST_SCENARIO;
        if (scenario === "text_helper_waits") {
          await delay(30_000, undefined, {
            signal: completionOptions.signal,
          });
        }
        if (scenario === "text_helper_late") {
          await delay(1_100);
        }
        if (scenario === "text_provider_failure") {
          const error = new Error(
            `OAuth refresh failed with access_token=${syntheticOAuthAccessToken}`,
          ) as Error & { body: string };
          error.body = JSON.stringify({
            error: "invalid_grant",
            access_token: syntheticOAuthAccessToken,
          });
          error.stack = `SyntheticProviderError: access_token=${syntheticOAuthAccessToken}`;
          throw error;
        }
        const text =
          scenario === "text_malformed" ||
          (scenario === "text_many_helpers_missing_last" &&
            helperCompletionCount === 25)
            ? "not-json"
            : scenario === "text_empty"
              ? JSON.stringify({ text: " " })
              : scenario === "text_extra_key"
                ? JSON.stringify({ text: "Busan", note: "unexpected" })
                : scenario === "text_value_too_long"
                  ? JSON.stringify({ text: "x".repeat(2_001) })
                  : scenario === "text_helper_oversized"
                    ? "x".repeat(12_001)
                    : scenario === "text_helper_late"
                      ? JSON.stringify({ text: "Late-Seoul" })
                      : JSON.stringify({ text: "Busan" });
        const stopReason =
          scenario === "text_status_failure"
            ? "error"
            : scenario === "text_length_failure"
              ? "length"
              : scenario === "text_aborted_failure"
                ? "aborted"
                : "stop";
        return {
          role: "assistant",
          content: [{ type: "text", text }],
          api: "openai-codex-responses",
          provider: model.provider,
          model: model.id,
          responseModel:
            scenario === "text_many_helpers_missing_last"
              ? `helper-attempt-${helperCompletionCount}`
              : scenario === "text_large_metadata"
                ? "R".repeat(500)
                : "gpt-5.6-luna-synthetic-provider",
          usage: syntheticPiUsage,
          stopReason,
          ...(scenario === "text_status_failure"
            ? {
                errorMessage: `OAuth response body: {"access_token":"${syntheticOAuthAccessToken}"}`,
              }
            : {}),
          timestamp: Date.now(),
        };
      },
    },
  } as unknown as ExtensionContext;
  return {
    name: captured.name,
    description: captured.description,
    promptSnippet: captured.promptSnippet,
    promptGuidelines: captured.promptGuidelines,
    ...(captured.executionMode === undefined
      ? {}
      : { executionMode: captured.executionMode }),
    execute(toolCallId, params, signal, onUpdate) {
      return captured.execute(toolCallId, params, signal, onUpdate, context);
    },
  };
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
    "RLCD_TEST_INPUT_DISPATCH_MARKER",
    "RLCD_TEST_MODEL_WORK_MARKER",
    "RLCD_TEST_PHASE_MARKER",
    "RLCD_TEST_PROTOCOL_MARKER",
    "RLCD_TEST_SCENARIO",
    "RLCD_TEST_STDIN_MARKER",
    "RLCD_TEST_TARGET_EVENTS_MARKER",
    "TYPESAFE_API_KEY",
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

async function waitForFile(path: string, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await delay(10);
    }
  }
  assert.fail(`timed out waiting for ${path}`);
}

async function targetEvents(path: string): Promise<string[]> {
  try {
    return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean);
  } catch {
    return [];
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
    const tool = registeredTool({ helperModelAvailable: false });
    assert.equal(tool.name, "rlcd_brwsr_run");
    assert.equal(tool.executionMode, "sequential");
    for (const guidance of [
      tool.description,
      tool.promptSnippet,
      ...tool.promptGuidelines,
    ]) {
      assert.match(guidance, /benign, unauthenticated, non-booking/i);
    }

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
    const usage = recordField(details, "usage");
    const jevUsage = recordField(usage, "jev");
    const helperUsage = recordField(usage, "textHelper");
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
    assert.equal(helperUsage.availability, "unavailable");
    assert.equal(helperUsage.model, null);
    assert.deepEqual(arrayField(helperUsage, "calls"), []);
    assert.match(result.content[0]?.text ?? "", /completion_claim/);
    await assert.rejects(access(helperRequestMarker));
  });
});

test("registered Pi tool uses Luna through Pi for generated field values", async () => {
  await withFakeExternalInteractions(
    "text_two_helpers",
    async (harnessHome) => {
      const helperRequestMarker = join(harnessHome, "helper-requested");
      const fieldMutationMarker = join(harnessHome, "field-mutated");
      const completionCalls: HelperCompletionCall[] = [];
      process.env.RLCD_TEST_HELPER_REQUEST_MARKER = helperRequestMarker;
      process.env.RLCD_TEST_FIELD_MUTATION_MARKER = fieldMutationMarker;

      const result = await registeredTool({
        helperCalls: completionCalls,
      }).execute(
        "generated-field-values",
        baseInput({
          goal: "Fill both destination fields, then stop when marker FIELD-41 is visible.",
        }),
        new AbortController().signal,
      );
      const details = detailsOf(result);
      const observation = nullableRecordField(details, "lastObservation");
      assert.ok(observation);
      const usage = recordField(details, "usage");
      const jevUsage = recordField(usage, "jev");
      const helperUsage = recordField(usage, "textHelper");
      const helperCalls = arrayField(helperUsage, "calls").map((call, index) =>
        recordValue(call, `text helper call ${index}`),
      );

      assert.equal(stringField(details, "status"), "completion_claim");
      assert.match(
        stringField(observation, "evidence"),
        /Busan.*Busan.*FIELD-41/,
      );
      assert.equal(stringField(jevUsage, "configuredModel"), "jev-1.13.0");
      assert.equal(
        stringField(
          recordValue(
            arrayField(jevUsage, "decisions")[0],
            "first Jev decision",
          ),
          "reportedModel",
        ),
        "deterministic-jev-external-fake",
      );
      assert.equal(
        stringField(helperUsage, "model"),
        "openai-codex/gpt-5.6-luna",
      );
      assert.deepEqual(
        helperCalls.map((call) => stringField(call, "reportedModel")),
        ["gpt-5.6-luna-synthetic-provider", "gpt-5.6-luna-synthetic-provider"],
      );
      assert.deepEqual(
        helperCalls.map((call) => stringField(call, "field")),
        ["Destination city", "Country code"],
      );
      for (const helperCall of helperCalls) {
        assert.deepEqual(helperCall.usage, {
          input: 19,
          output: 4,
          cacheRead: 0,
          cacheWrite: 0,
          reasoning: 2,
          totalTokens: 23,
        });
        assert.ok(numberField(helperCall, "latencyMs") >= 0);
      }
      assert.deepEqual(result.usage, {
        input: 38,
        output: 8,
        cacheRead: 0,
        cacheWrite: 0,
        reasoning: 4,
        totalTokens: 46,
        cost: {
          input: 0.0038,
          output: 0.0008,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0.0046,
        },
      });
      assert.equal(jevUsage.providerHttpAttempts, "unavailable");
      assert.equal(jevUsage.providerCost, "unavailable");
      assert.equal(helperUsage.providerHttpAttempts, "unavailable");
      assert.equal(helperUsage.providerCost, "unavailable");
      assert.deepEqual(
        arrayField(details, "trace").map((entry, index) =>
          stringField(recordValue(entry, `trace[${index}]`), "operation"),
        ),
        ["TYPE_TEXT", "TYPE_TEXT", "DONE"],
      );
      assert.equal(await access(helperRequestMarker), undefined);
      assert.equal(await access(fieldMutationMarker), undefined);
      assert.equal(
        (await readFile(fieldMutationMarker, "utf8")).trim().split("\n").length,
        2,
        "both externally observed fields must be mutated",
      );
      assert.deepEqual(
        {
          provider: completionCalls[0]?.provider,
          model: completionCalls[0]?.model,
          reasoningEffort: completionCalls[0]?.reasoningEffort,
        },
        {
          provider: "openai-codex",
          model: "gpt-5.6-luna",
          reasoningEffort: "high",
        },
      );
      assert.match(completionCalls[0]?.systemPrompt ?? "", /JSON object/i);
      const fieldContext: unknown = JSON.parse(
        completionCalls[0]?.userPrompt ?? "",
      );
      assert.ok(isRecord(fieldContext));
      assert.equal(
        recordField(fieldContext, "field").label,
        "Destination city",
      );
      assert.match(
        stringField(fieldContext, "goal"),
        /both destination fields/,
      );
      assert.match(
        stringField(recordField(fieldContext, "page"), "text"),
        /FIELD-41/,
      );
    },
  );
});

test("Unicode-heavy upstream helper prompts cross the bounded relay unchanged", async () => {
  await withFakeExternalInteractions(
    "text_unicode_context",
    async (harnessHome) => {
      const fieldMutationMarker = join(harnessHome, "field-mutated");
      const completionCalls: HelperCompletionCall[] = [];
      process.env.RLCD_TEST_FIELD_MUTATION_MARKER = fieldMutationMarker;

      const result = await registeredTool({
        helperCalls: completionCalls,
      }).execute(
        "unicode-helper-context",
        baseInput({ goal: "目".repeat(1_200) }),
        new AbortController().signal,
      );
      const details = detailsOf(result);

      assert.equal(stringField(details, "status"), "completion_claim");
      assert.equal(completionCalls.length, 1);
      const deliveredPrompt = completionCalls[0]?.userPrompt ?? "";
      assert.ok(deliveredPrompt.length > 32_000);
      const context: unknown = JSON.parse(deliveredPrompt);
      assert.ok(isRecord(context));
      assert.equal(
        stringField(recordField(context, "page"), "text"),
        "界".repeat(6_000),
      );
      assert.equal(await access(fieldMutationMarker), undefined);
    },
  );
});

test("helper measurements retain an aligned bounded suffix", async () => {
  await withFakeExternalInteractions(
    "text_many_helpers_missing_last",
    async () => {
      const completionCalls: HelperCompletionCall[] = [];
      const result = await registeredTool({
        helperCalls: completionCalls,
      }).execute(
        "bounded-helper-history",
        baseInput({
          goal: "Fill all twenty fields with the generated value.",
          maxActions: 20,
          maxSeconds: 20,
        }),
        new AbortController().signal,
      );
      const details = detailsOf(result);
      const helperUsage = recordField(
        recordField(details, "usage"),
        "textHelper",
      );
      const calls = arrayField(helperUsage, "calls").map((call, index) =>
        recordValue(call, `text helper call ${index}`),
      );

      assert.equal(stringField(details, "status"), "error");
      assert.equal(stringField(details, "stopReason"), "upstream_error");
      assert.equal(completionCalls.length, 25);
      assert.equal(calls.length, 24);
      assert.equal(booleanField(helperUsage, "callsTruncated"), true);
      assert.equal(stringField(calls[0]!, "reportedModel"), "helper-attempt-2");
      assert.equal(stringField(calls[0]!, "field"), "Field 1");
      assert.equal(
        stringField(calls.at(-2)!, "reportedModel"),
        "helper-attempt-24",
      );
      assert.equal(stringField(calls.at(-2)!, "field"), "Field 19");
      assert.equal(
        stringField(calls.at(-1)!, "reportedModel"),
        "helper-attempt-25",
      );
      assert.equal("field" in calls.at(-1)!, false);
      const combinedUsage = recordValue(result.usage, "combined Pi usage");
      assert.equal(numberField(combinedUsage, "input"), 475);
      assert.equal(numberField(combinedUsage, "totalTokens"), 575);
    },
  );
});

test("bounded metadata discloses every clipped source field", async () => {
  await withFakeExternalInteractions("text_large_metadata", async () => {
    const result = await registeredTool().execute(
      "large-metadata",
      baseInput(),
      new AbortController().signal,
    );
    const details = detailsOf(result);
    const observation = nullableRecordField(details, "lastObservation");
    assert.ok(observation);
    const trace = arrayField(details, "trace").map((entry, index) =>
      recordValue(entry, `trace[${index}]`),
    );
    const fill = trace.find(
      (entry) => stringField(entry, "operation") === "TYPE_TEXT",
    );
    assert.ok(fill);
    const usage = recordField(details, "usage");
    const decision = recordValue(
      arrayField(recordField(usage, "jev"), "decisions")[0],
      "first Jev decision",
    );
    const helperCall = recordValue(
      arrayField(recordField(usage, "textHelper"), "calls")[0],
      "text helper call",
    );

    assert.equal(stringField(details, "status"), "completion_claim");
    assert.equal(codePointLength(stringField(observation, "url")), 2_048);
    assert.equal(booleanField(observation, "urlTruncated"), true);
    assert.equal(codePointLength(stringField(observation, "title")), 300);
    assert.equal(booleanField(observation, "titleTruncated"), true);
    assert.equal(codePointLength(stringField(fill, "action")), 300);
    assert.equal(booleanField(fill, "actionTruncated"), true);
    assert.equal(booleanField(fill, "operationTruncated"), false);
    assert.equal(codePointLength(stringField(fill, "url")), 2_048);
    assert.equal(booleanField(fill, "urlTruncated"), true);
    assert.equal(codePointLength(stringField(decision, "reportedModel")), 160);
    assert.equal(booleanField(decision, "reportedModelTruncated"), true);
    assert.equal(
      codePointLength(stringField(helperCall, "reportedModel")),
      160,
    );
    assert.equal(booleanField(helperCall, "reportedModelTruncated"), true);
    assert.equal(codePointLength(stringField(helperCall, "field")), 300);
    assert.equal(booleanField(helperCall, "fieldTruncated"), true);
  });
});

test("unusable helper generations and provider failures stop before field mutation", async () => {
  for (const helperCase of [
    {
      scenario: "text_provider_failure",
      diagnostic: /Pi text helper request failed/i,
      hasSdkUsage: false,
      containsOAuth: true,
    },
    {
      scenario: "text_status_failure",
      diagnostic: /Pi text helper completion failed/i,
      hasSdkUsage: true,
      containsOAuth: true,
    },
    {
      scenario: "text_length_failure",
      diagnostic: /Pi text helper output was incomplete/i,
      hasSdkUsage: true,
      containsOAuth: false,
    },
    {
      scenario: "text_aborted_failure",
      diagnostic: /Pi text helper completion was aborted/i,
      hasSdkUsage: true,
      containsOAuth: false,
    },
    {
      scenario: "text_malformed",
      diagnostic: /no valid field value/i,
      hasSdkUsage: true,
      containsOAuth: false,
    },
    {
      scenario: "text_empty",
      diagnostic: /no valid field value/i,
      hasSdkUsage: true,
      containsOAuth: false,
    },
    {
      scenario: "text_extra_key",
      diagnostic: /no valid field value/i,
      hasSdkUsage: true,
      containsOAuth: false,
    },
    {
      scenario: "text_value_too_long",
      diagnostic: /no valid field value/i,
      hasSdkUsage: true,
      containsOAuth: false,
    },
    {
      scenario: "text_helper_oversized",
      diagnostic: /exceeded 12000 characters/i,
      hasSdkUsage: true,
      containsOAuth: false,
    },
  ] as const) {
    const { scenario, diagnostic, hasSdkUsage, containsOAuth } = helperCase;
    await withFakeExternalInteractions(scenario, async (harnessHome) => {
      const helperRequestMarker = join(harnessHome, "helper-requested");
      const fieldMutationMarker = join(harnessHome, "field-mutated");
      const rawBridgeInputArtifact = join(harnessHome, "bridge-stdin.jsonl");
      const updates: ToolResult[] = [];
      process.env.RLCD_TEST_HELPER_REQUEST_MARKER = helperRequestMarker;
      process.env.RLCD_TEST_FIELD_MUTATION_MARKER = fieldMutationMarker;
      if (containsOAuth) {
        process.env.RLCD_TEST_STDIN_MARKER = rawBridgeInputArtifact;
      }

      const result = await registeredTool().execute(
        `helper-failure-${scenario}`,
        baseInput({
          goal: "Fill Destination city with South Korea's second-largest city, then stop when marker FIELD-41 is visible.",
        }),
        new AbortController().signal,
        (update) => updates.push(update),
      );
      const details = detailsOf(result);
      const usage = recordField(details, "usage");
      const helperUsage = recordField(usage, "textHelper");
      const trace = arrayField(details, "trace").map((entry, index) =>
        recordValue(entry, `trace[${index}]`),
      );

      assert.equal(stringField(details, "status"), "error");
      assert.equal(stringField(details, "stopReason"), "upstream_error");
      assert.equal(stringField(details, "mutationOutcome"), "not_in_flight");
      assert.match(stringField(details, "diagnostic"), diagnostic);
      assert.ok(stringField(details, "diagnostic").length <= 600);
      assert.equal(trace.length, 1);
      assert.equal(stringField(trace[0]!, "operation"), "TYPE_TEXT");
      assert.equal(stringField(trace[0]!, "outcome"), "upstream_error");
      assert.equal(
        arrayField(recordField(usage, "jev"), "decisions").length,
        1,
      );
      assert.equal(helperUsage.availability, "available");
      assert.equal(helperUsage.model, "openai-codex/gpt-5.6-luna");
      assert.equal(
        arrayField(helperUsage, "calls").length,
        hasSdkUsage ? 1 : 0,
      );
      assert.equal(helperUsage.providerHttpAttempts, "unavailable");
      assert.equal(helperUsage.providerRetries, "unavailable");
      assert.equal(helperUsage.providerCost, "unavailable");
      assert.deepEqual(
        result.usage,
        hasSdkUsage ? syntheticPiUsage : undefined,
      );
      assert.equal(await access(helperRequestMarker), undefined);
      await assert.rejects(access(fieldMutationMarker));

      if (containsOAuth) {
        const rawBridgeInput = await readFile(rawBridgeInputArtifact, "utf8");
        const retainedArtifact = join(
          harnessHome,
          `retained-${scenario}-evidence.json`,
        );
        await writeFile(
          retainedArtifact,
          JSON.stringify({ result, updates, rawBridgeInput }),
        );
        const retainedOutput = await readFile(retainedArtifact, "utf8");
        for (const [surface, serialized] of [
          ["tool content", JSON.stringify(result.content)],
          ["details", JSON.stringify(result.details)],
          ["progress", JSON.stringify(updates)],
          ["raw bridge input", rawBridgeInput],
          ["retained output", retainedOutput],
        ] as const) {
          assert.doesNotMatch(
            serialized,
            new RegExp(syntheticOAuthAccessToken),
            `${surface} exposed Pi OAuth material from ${scenario}`,
          );
        }
      }
    });
  }
});

test("Pi cancellation aborts a waiting helper and prevents field mutation", async () => {
  await withFakeExternalInteractions(
    "text_helper_waits",
    async (harnessHome) => {
      const helperRequestMarker = join(harnessHome, "helper-requested");
      const fieldMutationMarker = join(harnessHome, "field-mutated");
      const completionCalls: HelperCompletionCall[] = [];
      process.env.RLCD_TEST_HELPER_REQUEST_MARKER = helperRequestMarker;
      process.env.RLCD_TEST_FIELD_MUTATION_MARKER = fieldMutationMarker;
      const controller = new AbortController();
      const running = registeredTool({ helperCalls: completionCalls }).execute(
        "cancel-waiting-helper",
        baseInput(),
        controller.signal,
      );

      await waitForFile(helperRequestMarker);
      controller.abort(new Error("cancel helper wait"));
      const result = await running;
      const details = detailsOf(result);

      assert.equal(stringField(details, "status"), "stopped");
      assert.equal(stringField(details, "stopReason"), "cancelled");
      assert.equal(stringField(details, "mutationOutcome"), "not_in_flight");
      assert.equal(completionCalls[0]?.signal?.aborted, true);
      assert.deepEqual(
        arrayField(
          recordField(recordField(details, "usage"), "textHelper"),
          "calls",
        ),
        [],
      );
      assert.equal(result.usage, undefined);
      await assert.rejects(access(fieldMutationMarker));
      const bridgePid = numberField(
        recordField(details, "ownership"),
        "bridgePid",
      );
      assert.throws(
        () => process.kill(bridgePid, 0),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "ESRCH",
      );
    },
  );
});

test("helper deadline ignores a late completion without writing into a later run", async () => {
  await withFakeExternalInteractions(
    "text_helper_late",
    async (harnessHome) => {
      const helperRequestMarker = join(harnessHome, "helper-requested");
      const fieldMutationMarker = join(harnessHome, "field-mutated");
      const completionCalls: HelperCompletionCall[] = [];
      process.env.RLCD_TEST_HELPER_REQUEST_MARKER = helperRequestMarker;
      process.env.RLCD_TEST_FIELD_MUTATION_MARKER = fieldMutationMarker;
      const tool = registeredTool({ helperCalls: completionCalls });

      const expired = await tool.execute(
        "deadline-waiting-helper",
        baseInput({ maxSeconds: 1 }),
        new AbortController().signal,
      );
      const expiredDetails = detailsOf(expired);
      assert.equal(stringField(expiredDetails, "status"), "stopped");
      assert.equal(stringField(expiredDetails, "stopReason"), "time_budget");
      assert.equal(
        stringField(expiredDetails, "mutationOutcome"),
        "not_in_flight",
      );
      assert.equal(completionCalls[0]?.signal?.aborted, true);
      assert.equal(
        arrayField(
          recordField(recordField(expiredDetails, "usage"), "textHelper"),
          "calls",
        ).length,
        1,
      );
      assert.deepEqual(expired.usage, syntheticPiUsage);
      await assert.rejects(access(fieldMutationMarker));

      process.env.RLCD_TEST_SCENARIO = "text_generated";
      const completed = await tool.execute(
        "run-after-late-helper",
        baseInput(),
        new AbortController().signal,
      );
      const completedDetails = detailsOf(completed);
      assert.equal(stringField(completedDetails, "status"), "completion_claim");
      const completedObservation = nullableRecordField(
        completedDetails,
        "lastObservation",
      );
      assert.ok(completedObservation);
      assert.match(stringField(completedObservation, "evidence"), /Busan/);
      assert.equal(
        arrayField(
          recordField(recordField(completedDetails, "usage"), "textHelper"),
          "calls",
        ).length,
        1,
      );
      assert.deepEqual(completed.usage, syntheticPiUsage);
      assert.equal(await access(fieldMutationMarker), undefined);
    },
  );
});

test("pre-helper browser freshness transport failures remain conservative upstream errors", async () => {
  await withFakeExternalInteractions(
    "text_freshness_failure",
    async (harnessHome) => {
      const helperRequestMarker = join(harnessHome, "helper-requested");
      const fieldMutationMarker = join(harnessHome, "field-mutated");
      process.env.RLCD_TEST_HELPER_REQUEST_MARKER = helperRequestMarker;
      process.env.RLCD_TEST_FIELD_MUTATION_MARKER = fieldMutationMarker;

      const result = await registeredTool().execute(
        "pre-helper-freshness-failure",
        baseInput({
          goal: "Fill Destination city with South Korea's second-largest city, then stop when marker FIELD-41 is visible.",
        }),
        new AbortController().signal,
      );
      const details = detailsOf(result);
      const trace = arrayField(details, "trace").map((entry, index) =>
        recordValue(entry, `trace[${index}]`),
      );

      assert.equal(stringField(details, "status"), "error");
      assert.equal(stringField(details, "stopReason"), "upstream_error");
      assert.equal(stringField(details, "mutationOutcome"), "not_in_flight");
      assert.match(
        stringField(details, "diagnostic"),
        /transport failed during the pre-helper freshness check/i,
      );
      assert.equal(trace.length, 1);
      assert.equal(stringField(trace[0]!, "operation"), "TYPE_TEXT");
      assert.equal(stringField(trace[0]!, "outcome"), "upstream_error");
      await assert.rejects(access(helperRequestMarker));
      await assert.rejects(access(fieldMutationMarker));
    },
  );
});

test("a cached generated value does not make a later fill failure safe to retry", async () => {
  await withFakeExternalInteractions(
    "text_cached_fill_failure",
    async (harnessHome) => {
      const helperRequestMarker = join(harnessHome, "helper-requested");
      const inputDispatchMarker = join(harnessHome, "input-dispatched");
      process.env.RLCD_TEST_HELPER_REQUEST_MARKER = helperRequestMarker;
      process.env.RLCD_TEST_INPUT_DISPATCH_MARKER = inputDispatchMarker;

      const result = await registeredTool().execute(
        "cached-generated-fill-failure",
        baseInput({
          goal: "Fill Destination city with South Korea's second-largest city, then stop when marker FIELD-41 is visible.",
        }),
        new AbortController().signal,
      );
      const details = detailsOf(result);

      assert.equal(stringField(details, "status"), "error");
      assert.equal(stringField(details, "stopReason"), "upstream_error");
      assert.equal(stringField(details, "mutationOutcome"), "unknown");
      assert.match(
        stringField(details, "diagnostic"),
        /cached fill failed after dispatched browser input/i,
      );
      assert.equal(
        (await readFile(helperRequestMarker, "utf8")).trim().split("\n").length,
        1,
        "the stale retry must reuse upstream's cached generated value",
      );
      assert.equal(await access(inputDispatchMarker), undefined);
    },
  );
});

test("valid Unicode URL and goal bounds cross the serialized request", async () => {
  await withFakeExternalInteractions("click_done", async (harnessHome) => {
    const targetMarker = join(harnessHome, "unicode-request-targets");
    process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;

    const result = await registeredTool().execute(
      "unicode-request",
      baseInput({
        url: `https://example.test/${"😀".repeat(2_027)}`,
        goal: "🧭".repeat(1_200),
      }),
      new AbortController().signal,
    );

    assert.equal(stringField(detailsOf(result), "status"), "completion_claim");
    assert.deepEqual(await targetEvents(targetMarker), [
      "created:rlcd-owned-target",
      "close:rlcd-owned-target",
    ]);
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

test("pre-bridge results leave Pi helper capability and model unknown", async () => {
  await withFakeExternalInteractions("click_done", async () => {
    const result = await registeredTool().execute(
      "invalid-before-Pi-helper-check",
      baseInput({ url: "file:///tmp/not-browser-input" }),
      new AbortController().signal,
    );
    const helperUsage = recordField(
      recordField(detailsOf(result), "usage"),
      "textHelper",
    );

    assert.equal(helperUsage.availability, "unknown");
    assert.equal(helperUsage.model, "unknown");
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

test("missing Pi helper model or login stops TYPE_TEXT before helper work", async () => {
  await withFakeExternalInteractions("needs_text", async (harnessHome) => {
    const cases = [
      {
        name: "missing-model",
        tool: registeredTool({ helperModelAvailable: false }),
        diagnostic: /model openai-codex\/gpt-5\.6-luna is unavailable/i,
      },
      {
        name: "missing-login",
        tool: registeredTool({ helperAuthAvailable: false }),
        diagnostic: /Pi login for openai-codex\/gpt-5\.6-luna is unavailable/i,
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
      process.env.RLCD_TEST_HELPER_REQUEST_MARKER = helperRequestMarker;
      process.env.RLCD_TEST_FIELD_MUTATION_MARKER = fieldMutationMarker;

      const result = await helperCase.tool.execute(
        helperCase.name,
        baseInput(),
        new AbortController().signal,
      );
      const details = detailsOf(result);
      const trace = arrayField(details, "trace");
      assert.equal(trace.length, 1);
      const entry = recordValue(trace[0], "trace[0]");
      const textUsage = recordField(
        recordField(details, "usage"),
        "textHelper",
      );
      const timing = recordField(details, "timing");

      assert.equal(stringField(details, "status"), "stopped");
      assert.equal(stringField(details, "stopReason"), "needs_text");
      assert.match(stringField(details, "diagnostic"), helperCase.diagnostic);
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
        availability: "unavailable",
        model: null,
        calls: [],
        providerHttpAttempts: "unavailable",
        providerRetries: "unavailable",
        providerCost: "unavailable",
      });
      assert.equal(
        stringField(recordField(details, "cleanup"), "taskTab"),
        "closed",
      );
      await assert.rejects(access(helperRequestMarker));
      await assert.rejects(access(fieldMutationMarker));
    }
  });
});

test("native workspace Jev secrets are redacted before child protocol emission", async () => {
  const childTypesafeSecret = "synthetic-typesafe-secret-ALPHA-73";
  await withFakeExternalInteractions(
    "provider_secret_error",
    async (harnessHome) => {
      delete process.env.TYPESAFE_API_KEY;
      const updates: ToolResult[] = [];
      const argvArtifact = join(harnessHome, "bridge-argv.json");
      const protocolArtifact = join(harnessHome, "raw-bridge-protocol.jsonl");
      process.env.RLCD_TEST_ARGV_MARKER = argvArtifact;
      process.env.RLCD_TEST_PROTOCOL_MARKER = protocolArtifact;

      const result = await registeredTool().execute(
        "redacted-native-jev-failure",
        baseInput(),
        new AbortController().signal,
        (update) => updates.push(update),
      );
      const details = detailsOf(result);
      const rawProtocol = await readFile(protocolArtifact, "utf8");
      const retainedArtifact = join(harnessHome, "retained-tool-evidence.json");
      await writeFile(
        retainedArtifact,
        JSON.stringify({ result, updates, rawProtocol }),
      );
      const retained = await readFile(retainedArtifact, "utf8");
      const bridgeArgv = await readFile(argvArtifact, "utf8");

      assert.equal(stringField(details, "stopReason"), "upstream_error");
      assert.match(stringField(details, "diagnostic"), /\[REDACTED\]/);
      const progress = JSON.stringify(updates);
      assert.match(progress, /\[REDACTED\]/);
      for (const [surface, serialized] of [
        ["content", JSON.stringify(result.content)],
        ["details", JSON.stringify(result.details)],
        ["progress", progress],
        ["raw bridge protocol", rawProtocol],
        ["retained artifact", retained],
        ["bridge arguments", bridgeArgv],
      ] as const) {
        assert.doesNotMatch(
          serialized,
          new RegExp(childTypesafeSecret),
          `${surface} exposed the child-loaded Jev secret`,
        );
      }
      assert.doesNotMatch(bridgeArgv, new RegExp(childTypesafeSecret));
    },
    {
      nativeConfiguration:
        `${nativeHarnessConfiguration}` +
        `TYPESAFE_API_KEY=${childTypesafeSecret}\n`,
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

test("upstream BLOCKED and stale re-observation remain distinct outcomes", async () => {
  await withFakeExternalInteractions("blocked", async () => {
    const result = await registeredTool().execute(
      "blocked-outcome",
      baseInput(),
      new AbortController().signal,
    );
    const details = detailsOf(result);
    const trace = arrayField(details, "trace").map((entry, index) =>
      recordValue(entry, `trace[${index}]`),
    );

    assert.equal(stringField(details, "status"), "stopped");
    assert.equal(stringField(details, "stopReason"), "blocked");
    assert.equal(stringField(trace[0]!, "outcome"), "blocked");
    assert.doesNotMatch(JSON.stringify(result), /unsupported.action/i);
  });

  await withFakeExternalInteractions("stale_click_once", async () => {
    const result = await registeredTool().execute(
      "stale-reobservation",
      baseInput(),
      new AbortController().signal,
    );
    const details = detailsOf(result);
    const trace = arrayField(details, "trace").map((entry, index) =>
      recordValue(entry, `trace[${index}]`),
    );

    assert.equal(stringField(details, "status"), "completion_claim");
    assert.equal(stringField(details, "stopReason"), "done_claim");
    assert.equal(stringField(trace[0]!, "outcome"), "stale_reobserved");
    assert.ok(
      trace.some(
        (entry) =>
          stringField(entry, "operation") === "CLICK" &&
          stringField(entry, "outcome") === "executed",
      ),
    );
  });

  await withFakeExternalInteractions(
    "post_action_stale_reobservation",
    async () => {
      const result = await registeredTool().execute(
        "stale-after-execution",
        baseInput(),
        new AbortController().signal,
      );
      const details = detailsOf(result);
      const trace = arrayField(details, "trace").map((entry, index) =>
        recordValue(entry, `trace[${index}]`),
      );

      assert.equal(stringField(details, "status"), "completion_claim");
      assert.equal(stringField(trace[0]!, "operation"), "CLICK");
      assert.equal(stringField(trace[0]!, "outcome"), "executed");
    },
  );
});

test("valid WAIT-heavy progress reaches the wall budget instead of a record-count protocol error", async () => {
  await withFakeExternalInteractions("wait_heavy", async () => {
    let progressUpdates = 0;
    const result = await registeredTool().execute(
      "wait-heavy",
      baseInput({ maxActions: 20, maxSeconds: 10 }),
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
    assert.ok(
      progressUpdates > 128,
      `received ${progressUpdates} progress updates`,
    );
    assert.equal(booleanField(details, "traceTruncated"), true);
    assert.ok(trace.length > 0);
    assert.ok(trace.length <= 24);
    assert.equal(
      stringField(recordField(details, "cleanup"), "bridgeProcess"),
      "reaped",
    );
  });
});

test("pre-spawn work consumes the original wall budget", async () => {
  await withFakeExternalInteractions("pre_spawn_delay", async (harnessHome) => {
    const targetMarker = join(harnessHome, "pre-spawn-targets");
    process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;

    const result = await registeredTool().execute(
      "pre-spawn-deadline",
      baseInput({ maxSeconds: 1 }),
      new AbortController().signal,
    );
    const details = detailsOf(result);

    assert.equal(stringField(details, "status"), "stopped");
    assert.equal(stringField(details, "stopReason"), "time_budget");
    assert.equal(recordField(details, "ownership").bridgePid, null);
    assert.deepEqual(recordField(details, "cleanup"), {
      taskTab: "not_created",
      bridgeProcess: "reaped",
      sharedDaemon: "retained",
    });
    await assert.rejects(access(targetMarker));
  });
});

test("a prediction crossing the deadline cannot dispatch an action", async () => {
  await withFakeExternalInteractions(
    "prediction_crosses_deadline",
    async (harnessHome) => {
      const inputMarker = join(harnessHome, "deadline-input");
      process.env.RLCD_TEST_INPUT_DISPATCH_MARKER = inputMarker;

      let parentBlocked = false;
      const result = await registeredTool().execute(
        "prediction-deadline",
        baseInput({ maxSeconds: 1 }),
        new AbortController().signal,
        (update) => {
          if (
            !parentBlocked &&
            update.content[0]?.text.includes('"phase":"observation"')
          ) {
            parentBlocked = true;
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_200);
          }
        },
      );
      const details = detailsOf(result);
      const trace = arrayField(details, "trace").map((entry, index) =>
        recordValue(entry, `trace[${index}]`),
      );

      assert.equal(parentBlocked, true);
      assert.equal(stringField(details, "status"), "stopped");
      assert.equal(stringField(details, "stopReason"), "time_budget");
      assert.equal(stringField(trace[0]!, "outcome"), "time_budget");
      assert.equal(stringField(details, "mutationOutcome"), "not_in_flight");
      await assert.rejects(access(inputMarker));
    },
  );
});

test("immediate Pi cancellation does not start browser or model work", async () => {
  await withFakeExternalInteractions("click_done", async (harnessHome) => {
    const browserWorkMarker = join(harnessHome, "browser-work");
    const modelWorkMarker = join(harnessHome, "model-work");
    const targetMarker = join(harnessHome, "target-events");
    process.env.RLCD_TEST_BROWSER_WORK_MARKER = browserWorkMarker;
    process.env.RLCD_TEST_MODEL_WORK_MARKER = modelWorkMarker;
    process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;
    const controller = new AbortController();

    const running = registeredTool().execute(
      "immediate-cancellation",
      baseInput(),
      controller.signal,
    );
    controller.abort(new Error("immediate test cancellation"));
    const result = await running;
    const details = detailsOf(result);

    assert.equal(stringField(details, "status"), "stopped");
    assert.equal(stringField(details, "stopReason"), "cancelled");
    assert.deepEqual(recordField(details, "ownership"), {
      targetId: null,
      targetIdTruncated: false,
      bridgePid: null,
      daemon: null,
      daemonTruncated: false,
    });
    assert.deepEqual(recordField(details, "cleanup"), {
      taskTab: "not_created",
      bridgeProcess: "reaped",
      sharedDaemon: "retained",
    });
    await assert.rejects(access(browserWorkMarker));
    await assert.rejects(access(modelWorkMarker));
    await assert.rejects(access(targetMarker));
  });
});

test("cancellation after Agent construction still closes the owned tab", async () => {
  await withFakeExternalInteractions(
    "cancel_after_agent_construction",
    async (harnessHome) => {
      const targetMarker = join(harnessHome, "constructed-agent-targets");
      process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;

      const result = await registeredTool().execute(
        "cancel-after-agent-construction",
        baseInput(),
        new AbortController().signal,
      );
      const details = detailsOf(result);

      assert.equal(stringField(details, "status"), "stopped");
      assert.equal(stringField(details, "stopReason"), "cancelled");
      assert.equal(
        stringField(recordField(details, "cleanup"), "taskTab"),
        "closed",
      );
      assert.deepEqual(await targetEvents(targetMarker), [
        "created:rlcd-owned-target",
        "close:rlcd-owned-target",
      ]);
    },
  );
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
    assert.equal(stringField(details, "mutationOutcome"), "not_in_flight");
    const observation = nullableRecordField(details, "lastObservation");
    assert.ok(observation);
    assert.match(stringField(observation, "evidence"), /Click Continue/);
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

test("cancellation preserves known execution and uncertain dispatch distinctly", async () => {
  for (const [scenario, phase, mutationOutcome, traceOutcome] of [
    ["cancel_observation", "observation-started", "not_in_flight", "executed"],
    ["cancel_dispatched_input", "input-dispatched", "unknown", "dispatched"],
  ] as const) {
    await withFakeExternalInteractions(scenario, async (harnessHome) => {
      const phaseMarker = join(harnessHome, `${scenario}-phase`);
      const targetMarker = join(harnessHome, `${scenario}-targets`);
      process.env.RLCD_TEST_PHASE_MARKER = phaseMarker;
      process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;
      const controller = new AbortController();
      const running = registeredTool().execute(
        `cancel-${scenario}`,
        baseInput({ retainTab: true }),
        controller.signal,
      );

      await waitForFile(phaseMarker);
      assert.match(await readFile(phaseMarker, "utf8"), new RegExp(phase));
      controller.abort(new Error("interrupt in-flight browser work"));
      const result = await running;
      const details = detailsOf(result);
      const observation = nullableRecordField(details, "lastObservation");
      assert.ok(observation);
      const ownership = recordField(details, "ownership");
      const trace = arrayField(details, "trace").map((entry, index) =>
        recordValue(entry, `trace[${index}]`),
      );

      assert.equal(stringField(details, "status"), "stopped");
      assert.equal(stringField(details, "stopReason"), "cancelled");
      assert.equal(stringField(details, "mutationOutcome"), mutationOutcome);
      assert.match(stringField(observation, "evidence"), /Click Continue/);
      assert.equal(stringField(ownership, "targetId"), "rlcd-owned-target");
      assert.equal(stringField(trace.at(-1)!, "outcome"), traceOutcome);
      assert.deepEqual(recordField(details, "cleanup"), {
        taskTab: "closed",
        bridgeProcess: "reaped",
        sharedDaemon: "retained",
      });
      assert.deepEqual(await targetEvents(targetMarker), [
        "created:rlcd-owned-target",
        "close:rlcd-owned-target",
      ]);
      const bridgePid = numberField(ownership, "bridgePid");
      assert.throws(
        () => process.kill(bridgePid, 0),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "ESRCH",
      );
    });
  }
});

test("post-action observation errors retain authoritative execution history", async () => {
  await withFakeExternalInteractions(
    "post_action_observation_failure",
    async () => {
      const result = await registeredTool().execute(
        "post-action-observation-failure",
        baseInput(),
        new AbortController().signal,
      );
      const details = detailsOf(result);
      const trace = arrayField(details, "trace").map((entry, index) =>
        recordValue(entry, `trace[${index}]`),
      );

      assert.equal(stringField(details, "status"), "error");
      assert.equal(stringField(details, "stopReason"), "upstream_error");
      assert.equal(stringField(details, "mutationOutcome"), "not_in_flight");
      assert.equal(stringField(trace[0]!, "outcome"), "executed");
      assert.match(
        stringField(details, "diagnostic"),
        /post-action observation failed after execution/i,
      );
    },
  );
});

test("reconciled stale execution survives bridge death", async () => {
  await withFakeExternalInteractions(
    "post_action_stale_bridge_death",
    async (harnessHome) => {
      const targetMarker = join(harnessHome, "stale-death-targets");
      process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;

      const result = await registeredTool().execute(
        "stale-reobservation-death",
        baseInput(),
        new AbortController().signal,
      );
      const details = detailsOf(result);
      const trace = arrayField(details, "trace").map((entry, index) =>
        recordValue(entry, `trace[${index}]`),
      );

      assert.equal(stringField(details, "status"), "error");
      assert.equal(stringField(details, "stopReason"), "bridge_error");
      assert.equal(stringField(trace[0]!, "outcome"), "executed");
      assert.equal(stringField(details, "mutationOutcome"), "not_in_flight");
      assert.equal(
        stringField(recordField(details, "cleanup"), "taskTab"),
        "closed",
      );
      assert.deepEqual(await targetEvents(targetMarker), [
        "created:rlcd-owned-target",
        "close:rlcd-owned-target",
      ]);
    },
  );
});

test("bridge death retains reported ownership and progress and targets only that tab for cleanup", async () => {
  await withFakeExternalInteractions(
    "bridge_death_cleanup_confirmed",
    async (harnessHome) => {
      const targetMarker = join(harnessHome, "target-events");
      process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;
      const updates: ToolResult[] = [];

      const result = await registeredTool().execute(
        "bridge-death-after-progress",
        baseInput(),
        new AbortController().signal,
        (update) => updates.push(update),
      );
      const details = detailsOf(result);
      const observation = nullableRecordField(details, "lastObservation");
      assert.ok(observation);
      const ownership = recordField(details, "ownership");

      assert.equal(stringField(details, "status"), "error");
      assert.equal(stringField(details, "stopReason"), "bridge_error");
      assert.match(stringField(observation, "evidence"), /Click Continue/);
      assert.equal(stringField(ownership, "targetId"), "rlcd-owned-target");
      assert.equal(
        stringField(recordField(details, "cleanup"), "taskTab"),
        "closed",
      );
      assert.equal(
        stringField(recordField(details, "cleanup"), "sharedDaemon"),
        "retained",
      );
      assert.ok(
        updates.some((update) =>
          update.content[0]?.text.includes('"type":"ownership"'),
        ),
      );
      assert.ok(
        updates.some((update) => {
          const updateOwnership = recordField(detailsOf(update), "ownership");
          return updateOwnership.targetId === "rlcd-owned-target";
        }),
      );
      assert.deepEqual(await targetEvents(targetMarker), [
        "created:rlcd-owned-target",
        "close:rlcd-owned-target",
      ]);
      const bridgePid = numberField(ownership, "bridgePid");
      assert.throws(
        () => process.kill(bridgePid, 0),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "ESRCH",
      );
    },
  );
});

test("an unconfirmed primary close uses targeted fallback cleanup", async () => {
  await withFakeExternalInteractions(
    "primary_cleanup_unconfirmed",
    async (harnessHome) => {
      const targetMarker = join(harnessHome, "primary-cleanup-targets");
      process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;

      const result = await registeredTool().execute(
        "primary-cleanup-unconfirmed",
        baseInput(),
        new AbortController().signal,
      );
      const details = detailsOf(result);

      assert.equal(stringField(details, "status"), "completion_claim");
      assert.equal(
        stringField(recordField(details, "cleanup"), "taskTab"),
        "closed",
      );
      assert.match(
        stringField(details, "diagnostic"),
        /primary task-tab cleanup was not confirmed/i,
      );
      assert.match(
        stringField(details, "diagnostic"),
        /targeted fallback cleanup confirmed/i,
      );
      assert.deepEqual(await targetEvents(targetMarker), [
        "created:rlcd-owned-target",
        "close:rlcd-owned-target",
        "close:rlcd-owned-target",
      ]);
    },
  );
});

test("failed targeted cleanup remains unconfirmed without disturbing shared resources", async () => {
  const cleanupSecret = "synthetic-cleanup-secret-BRAVO-18";
  await withFakeExternalInteractions(
    "bridge_death_cleanup_unconfirmed",
    async (harnessHome) => {
      delete process.env.TYPESAFE_API_KEY;
      const targetMarker = join(harnessHome, "target-events");
      process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;

      const result = await registeredTool().execute(
        "bridge-death-cleanup-unconfirmed",
        baseInput(),
        new AbortController().signal,
      );
      const details = detailsOf(result);

      assert.equal(stringField(details, "stopReason"), "bridge_error");
      assert.equal(
        stringField(recordField(details, "cleanup"), "taskTab"),
        "unconfirmed",
      );
      assert.equal(
        stringField(recordField(details, "cleanup"), "sharedDaemon"),
        "retained",
      );
      assert.match(
        stringField(details, "diagnostic"),
        /targeted cleanup.*unconfirmed|transport unavailable/i,
      );
      assert.match(stringField(details, "diagnostic"), /\[REDACTED\]/);
      assert.doesNotMatch(JSON.stringify(result), new RegExp(cleanupSecret));
      assert.deepEqual(await targetEvents(targetMarker), [
        "created:rlcd-owned-target",
        "close:rlcd-owned-target",
      ]);
    },
    {
      nativeConfiguration:
        `${nativeHarnessConfiguration}` + `TYPESAFE_API_KEY=${cleanupSecret}\n`,
    },
  );
});

test("an initial observation failure before reported ownership stays unknown", async () => {
  await withFakeExternalInteractions(
    "initial_observation_failure",
    async (harnessHome) => {
      const targetMarker = join(harnessHome, "target-events");
      process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;

      const result = await registeredTool().execute(
        "initial-observation-failure",
        baseInput(),
        new AbortController().signal,
      );
      const details = detailsOf(result);
      const ownership = recordField(details, "ownership");

      assert.equal(stringField(details, "status"), "error");
      assert.equal(stringField(details, "stopReason"), "upstream_error");
      assert.equal(ownership.targetId, null);
      assert.equal(details.lastObservation, null);
      assert.equal(
        stringField(recordField(details, "cleanup"), "taskTab"),
        "unconfirmed",
      );
      assert.deepEqual(await targetEvents(targetMarker), [
        "created:rlcd-owned-target",
        "close:rlcd-owned-target",
      ]);
    },
  );
});

test("malformed, truncated, and oversized bridge streams retain bounded partial evidence", async () => {
  for (const scenario of [
    "malformed_protocol",
    "truncated_protocol",
    "oversized_protocol",
  ] as const) {
    await withFakeExternalInteractions(scenario, async (harnessHome) => {
      const targetMarker = join(harnessHome, `${scenario}-targets`);
      process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;

      const result = await registeredTool().execute(
        scenario,
        baseInput(),
        new AbortController().signal,
      );
      const details = detailsOf(result);
      const observation = nullableRecordField(details, "lastObservation");
      assert.ok(observation);

      assert.equal(stringField(details, "status"), "error");
      assert.equal(stringField(details, "stopReason"), "protocol_error");
      assert.equal(
        stringField(recordField(details, "ownership"), "targetId"),
        "rlcd-owned-target",
      );
      assert.match(stringField(observation, "evidence"), /Click Continue/);
      assert.ok(stringField(details, "diagnostic").length <= 4_000);
      assert.ok(codePointLength(result.content[0]?.text ?? "") <= 12_000);
      assert.equal(
        stringField(recordField(details, "cleanup"), "taskTab"),
        "closed",
      );
      assert.ok(
        (await targetEvents(targetMarker)).every(
          (event) =>
            event === "created:rlcd-owned-target" ||
            event === "close:rlcd-owned-target",
        ),
      );
    });
  }
});

test("malformed output after a large valid observation still has hard-bounded model-visible JSON", async () => {
  await withFakeExternalInteractions(
    "large_progress_malformed",
    async (harnessHome) => {
      const targetMarker = join(harnessHome, "large-progress-targets");
      process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;
      process.env.TYPESAFE_API_KEY = "synthetic";

      const result = await registeredTool().execute(
        "large-progress-malformed",
        baseInput(),
        new AbortController().signal,
      );
      const details = detailsOf(result);
      const observation = nullableRecordField(details, "lastObservation");
      assert.ok(observation);
      assert.equal(stringField(observation, "url").length, 14_000);
      assert.equal(
        stringField(observation, "title").length,
        15_000,
        "parent redaction expansion must remain inside the output budget",
      );

      const content = result.content[0]?.text ?? "";
      assert.ok(
        codePointLength(content) <= 12_000,
        `content was ${codePointLength(content)} characters`,
      );
      assert.doesNotMatch(content, /synthetic/);
      const modelVisible: unknown = JSON.parse(content);
      assert.ok(isRecord(modelVisible));
      assert.equal(modelVisible.status, "error");
      assert.equal(modelVisible.stopReason, "protocol_error");
      const completionClaim = recordField(modelVisible, "completionClaim");
      assert.equal(completionClaim.claimed, false);
      assert.equal(completionClaim.requiresIndependentVerification, true);
      const disclosure = recordField(modelVisible, "modelVisible");
      assert.equal(disclosure.truncated, true);
      assert.equal(disclosure.maxChars, 12_000);
      assert.ok(arrayField(disclosure, "omissions").length > 0);
      const events = await targetEvents(targetMarker);
      assert.equal(events[0], "created:rlcd-owned-target");
      assert.ok(events.includes("close:rlcd-owned-target"));
      assert.ok(
        events.every(
          (event) =>
            event === "created:rlcd-owned-target" ||
            event === "close:rlcd-owned-target",
        ),
      );
    },
  );
});

test("an abnormal exit after a terminal claim does not preserve stale completion state", async () => {
  await withFakeExternalInteractions(
    "terminal_abnormal",
    async (harnessHome) => {
      const targetMarker = join(harnessHome, "target-events");
      process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;

      const result = await registeredTool().execute(
        "stale-terminal",
        baseInput(),
        new AbortController().signal,
      );
      const details = detailsOf(result);

      assert.equal(stringField(details, "status"), "error");
      assert.equal(stringField(details, "stopReason"), "bridge_error");
      assert.equal(
        booleanField(recordField(details, "completionClaim"), "claimed"),
        false,
      );
      assert.equal(
        stringField(recordField(details, "cleanup"), "taskTab"),
        "closed",
      );
      assert.match(stringField(details, "diagnostic"), /exited abnormally/i);
    },
  );
});

test("completion-only retention leaves the identified tab but reaps the bridge", async () => {
  await withFakeExternalInteractions("click_done", async (harnessHome) => {
    const targetMarker = join(harnessHome, "target-events");
    process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;

    const result = await registeredTool().execute(
      "retain-completed-tab",
      baseInput({ retainTab: true }),
      new AbortController().signal,
    );
    const details = detailsOf(result);
    const ownership = recordField(details, "ownership");

    assert.equal(stringField(details, "status"), "completion_claim");
    assert.equal(
      stringField(recordField(details, "cleanup"), "taskTab"),
      "retained",
    );
    assert.deepEqual(await targetEvents(targetMarker), [
      "created:rlcd-owned-target",
    ]);
    const bridgePid = numberField(ownership, "bridgePid");
    assert.throws(
      () => process.kill(bridgePid, 0),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "ESRCH",
    );
  });
});

test("expiry after a retention claim still cleans up the reported tab", async () => {
  await withFakeExternalInteractions(
    "retained_terminal_hang",
    async (harnessHome) => {
      const targetMarker = join(harnessHome, "target-events");
      process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;

      const result = await registeredTool().execute(
        "expired-retention-claim",
        baseInput({ maxSeconds: 1, retainTab: true }),
        new AbortController().signal,
      );
      const details = detailsOf(result);

      assert.equal(stringField(details, "status"), "stopped");
      assert.equal(stringField(details, "stopReason"), "time_budget");
      assert.equal(
        booleanField(recordField(details, "completionClaim"), "claimed"),
        false,
      );
      assert.equal(
        stringField(recordField(details, "cleanup"), "taskTab"),
        "closed",
      );
      assert.deepEqual(await targetEvents(targetMarker), [
        "created:rlcd-owned-target",
        "close:rlcd-owned-target",
      ]);
    },
  );
});

test("retention requests do not retain failed runs", async () => {
  await withFakeExternalInteractions(
    "provider_secret_error",
    async (harnessHome) => {
      const targetMarker = join(harnessHome, "target-events");
      process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;

      const result = await registeredTool().execute(
        "failed-retention-request",
        baseInput({ retainTab: true }),
        new AbortController().signal,
      );
      const details = detailsOf(result);

      assert.equal(stringField(details, "status"), "error");
      assert.equal(
        stringField(recordField(details, "cleanup"), "taskTab"),
        "closed",
      );
      assert.deepEqual(await targetEvents(targetMarker), [
        "created:rlcd-owned-target",
        "close:rlcd-owned-target",
      ]);
    },
  );
});

test("wall expiry bounds non-cooperative cleanup, reaps the child, and reports overrun", async () => {
  await withFakeExternalInteractions(
    "slow_primary_cleanup",
    async (harnessHome) => {
      const targetMarker = join(harnessHome, "target-events");
      process.env.RLCD_TEST_TARGET_EVENTS_MARKER = targetMarker;
      const startedAt = Date.now();

      const result = await registeredTool().execute(
        "wall-expiry-slow-cleanup",
        baseInput({ maxSeconds: 1 }),
        new AbortController().signal,
      );
      const outerElapsedMs = Date.now() - startedAt;
      const details = detailsOf(result);
      const timing = recordField(details, "timing");
      const ownership = recordField(details, "ownership");

      assert.equal(stringField(details, "status"), "stopped");
      assert.equal(stringField(details, "stopReason"), "time_budget");
      assert.equal(
        stringField(recordField(details, "cleanup"), "taskTab"),
        "closed",
      );
      assert.ok(numberField(timing, "cleanupElapsedMs") >= 1_400);
      assert.ok(numberField(timing, "cleanupOverrunMs") >= 1_400);
      assert.ok(outerElapsedMs < 4_000, `shutdown took ${outerElapsedMs}ms`);
      assert.deepEqual(await targetEvents(targetMarker), [
        "created:rlcd-owned-target",
        "close:rlcd-owned-target",
        "close:rlcd-owned-target",
      ]);
      const bridgePid = numberField(ownership, "bridgePid");
      assert.throws(
        () => process.kill(bridgePid, 0),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "ESRCH",
      );
    },
  );
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

test("long bridge diagnostics disclose truncation", async () => {
  await withFakeExternalInteractions("long_provider_error", async () => {
    const result = await registeredTool().execute(
      "long-provider-diagnostic",
      baseInput(),
      new AbortController().signal,
    );
    const details = detailsOf(result);
    const diagnostic = stringField(details, "diagnostic");

    assert.equal(stringField(details, "status"), "error");
    assert.equal(stringField(details, "stopReason"), "upstream_error");
    assert.ok(diagnostic.length <= 600);
    assert.match(diagnostic, /diagnostic truncated from \d+ characters/i);
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
    assert.ok(codePointLength(stringField(observation, "evidence")) <= 4_000);
    assert.ok(codePointLength(result.content[0]?.text ?? "") <= 12_000);
  });
});

test("astral-Unicode terminal framing uses code-point bounds", async () => {
  await withFakeExternalInteractions("astral_trace", async () => {
    const result = await registeredTool().execute(
      "astral-trace",
      baseInput({ maxActions: 20 }),
      new AbortController().signal,
    );
    const details = detailsOf(result);
    const trace = arrayField(details, "trace").map((entry, index) =>
      recordValue(entry, `trace[${index}]`),
    );

    assert.equal(stringField(details, "status"), "stopped");
    assert.equal(stringField(details, "stopReason"), "action_budget");
    assert.ok(trace.length > 0);
    assert.ok(
      trace.some(
        (entry) => typeof entry.url === "string" && entry.url.includes("😀"),
      ),
    );
    assert.ok(codePointLength(result.content[0]?.text ?? "") <= 12_000);
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

test("standalone preflight reports Pi helper capability as unknown", async () => {
  await withFakeExternalInteractions("click_done", async () => {
    const result = await execFileAsync(
      join(repositoryRoot, "scripts", "preflight-runtime.sh"),
      [],
      { cwd: repositoryRoot, env: { ...process.env } },
    );
    const report: unknown = JSON.parse(result.stdout);
    assert.ok(isRecord(report));
    const checks = recordField(report, "checks");

    assert.equal(checks.textHelperAvailability, "unknown");
    assert.equal(checks.textHelperModel, "unknown");
    assert.match(
      stringField(checks, "textHelperReason"),
      /Pi owns text-helper model and login checks/i,
    );
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
