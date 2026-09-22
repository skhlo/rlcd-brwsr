import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
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
}

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fakePythonPath = join(repositoryRoot, "test", "python");
const deferredFakePythonPath = join(fakePythonPath, "deferred_sitecustomize");
const syntheticTypesafeKey = "synthetic-typesafe-key-MOON-62";
const syntheticHelperKey = "synthetic-openrouter-key-STAR-73";
const syntheticNativeHelperKey = "synthetic-native-env-key-COMET-84";
const terminalByteLimit = 16 * 1024;

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

function registeredTool(): RegisteredTool {
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

  rlcdBrwsrExtension(pi);
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

async function runScenario(
  scenario: string,
  options: ScenarioOptions = {},
): Promise<{
  result: ToolResult;
  directory: string;
  markers: ScenarioMarkers;
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
    const abortWatcher = options.abortWhenModelStarts
      ? (async () => {
          const deadline = Date.now() + 2_000;
          while (Date.now() < deadline) {
            if (await readIfPresent(markers.model)) {
              options.abortWhenModelStarts?.abort();
              return;
            }
            await delay(10);
          }
          throw new Error(
            "external model substitute was not reached before abort",
          );
        })()
      : undefined;
    const result = await registeredTool().execute(
      "test-call",
      {
        url: "https://example.test/start",
        goal: "Complete the deterministic fixture",
        ...options.params,
      },
      options.signal,
    );
    await abortWatcher;
    return {
      result,
      directory,
      markers,
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
      assert.equal(await readIfPresent(markers.model), "");
      assert.equal(await readIfPresent(markers.browser), "");
    });
  }
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
      ({ result }) => {
        const details = detailsOf(result);
        assert.equal(details.status, "completion_claim");
        assert.equal(details.stopReason, "done");
        const cleanup = recordField(details, "cleanup");
        assert.equal(cleanup.taskTab, "retained");
        assert.equal(cleanup.bridgeProcess, "reaped");
      },
    );
  },
);

test("a pre-spawn deadline remains first when cancellation follows", async () => {
  let abortedReads = 0;
  let abortListener: (() => void) | undefined;
  const signal = {
    get aborted() {
      abortedReads += 1;
      return abortedReads > 1;
    },
    addEventListener(_type: string, listener: () => void) {
      abortListener = listener;
    },
    removeEventListener() {},
  } as unknown as AbortSignal;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((
    callback: (...args: unknown[]) => void,
    delayMs?: number,
    ...args: unknown[]
  ) => {
    if ((delayMs ?? 0) > 0) {
      const timer = originalSetTimeout(() => {}, 60_000);
      queueMicrotask(() => {
        callback(...args);
        abortListener?.();
      });
      return timer;
    }
    return originalSetTimeout(callback, delayMs, ...args);
  }) as typeof setTimeout;

  try {
    const result = await registeredTool().execute(
      "test-call",
      {
        url: "https://example.test/start",
        goal: "Complete the deterministic fixture",
        maxSeconds: 1,
      },
      signal,
    );
    const details = detailsOf(result);
    assert.equal(details.status, "stopped");
    assert.equal(details.stopReason, "time_budget");
    assert.equal(details.execution, "not_started");
  } finally {
    globalThis.setTimeout = originalSetTimeout;
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

test("terminal fitting discloses history records removed after field clipping", async () => {
  await withScenario("omission_overflow", {}, ({ result }) => {
    const details = detailsOf(result);
    const output = recordField(details, "output");
    assert.equal(output.clipped, true);
    assert.ok(arrayField(details, "history").length < 16);
    const omissions = arrayField(output, "omissions");
    assert.ok(omissions.includes("history action fields"));
    assert.ok(omissions.includes("history URL fields"));
    assert.ok(omissions.includes("history records"));
  });
});

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

  for (const scenario of ["raw_stdout_overflow", "raw_stderr_exit"]) {
    await withScenario(scenario, {}, ({ result }) => {
      const details = detailsOf(result);
      const text = result.content[0]?.text ?? "";
      assert.equal(details.status, "error");
      assert.equal(details.execution, "unknown");
      assert.equal(recordField(details, "cleanup").taskTab, "unknown");
      assert.doesNotMatch(text, /raw-child-secret|synthetic-typesafe-key/);
      assert.match(
        String(recordField(details, "diagnostic").message),
        /terminal result|byte limit/i,
      );
    });
  }
});
