import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  createRlcdBrwsrRunner,
  createTypeSafeClassifier,
  type ClassifierRequest,
} from "../config/pi/extensions/rlcd-brwsr.ts";

function classifierRequest(): ClassifierRequest {
  return {
    goal: "Open the uncertainty evidence",
    observation: {
      url: "http://127.0.0.1:43113/index.html",
      title: "RLCD research start",
      text: "Question design\nContinue to uncertainty evidence",
      textTruncated: false,
    },
    candidates: {
      operations: ["CLICK", "WAIT", "DONE", "BLOCKED"],
      clickTargets: [
        {
          id: "CLICK_0",
          uid: "1_3",
          role: "link",
          label: "Continue to uncertainty evidence",
        },
      ],
      typeTextPairs: [],
      selectPairs: [],
    },
    questions: {
      operation: {
        type: "choice",
        instruction: "Which operation best advances the goal?",
        options: {
          CLICK: "CLICK",
          WAIT: "WAIT",
          DONE: "DONE",
          BLOCKED: "BLOCKED",
        },
      },
      click_target: {
        type: "choice",
        instruction:
          "Assuming the selected operation is CLICK, which target best advances the goal?",
        options: {
          CLICK_0: 'link "Continue to uncertainty evidence"',
          NO_MATCH: "No offered click candidate matches the goal",
        },
      },
    },
    retainedSources: [
      {
        url: "http://127.0.0.1:43113/index.html",
        title: "RLCD research start",
        excerptPreview: "Question design",
      },
    ],
    recentActions: [],
  };
}

function choice(selected: string, offered: readonly string[], confidence = 1) {
  return {
    type: "choice",
    choice: selected,
    confidence,
    probabilities: Object.fromEntries(
      offered.map((candidate) => [candidate, candidate === selected ? 1 : 0]),
    ),
  };
}

function emptyTrialLedger() {
  return {
    schemaVersion: 1,
    scope: "TypeSafe Jev trials for GitHub issues #5 and #6",
    budget: {
      maxRequests: 100,
      maxUsd: 5,
      model: "jev-1.13.0",
      inputUsdPerMillionTokens: 0.042,
      reservationInputTokensPerAttempt: 64_000,
      reservationUsdPerAttempt: 0.002688,
    },
    pricing: {
      source: "https://docs.typesafe.ai/models",
      retrievedAt: "2026-09-20",
      note: "Input tokens are billed; output tokens are free.",
    },
    attempts: [],
  };
}

test("TypeSafe classifier rejects a missing credential before fetch", async () => {
  let fetchCalled = false;
  const classifier = createTypeSafeClassifier({
    apiKey: "",
    fetch: (async () => {
      fetchCalled = true;
      throw new Error("must not fetch");
    }) as typeof fetch,
    ledgerPath: false,
  });

  await assert.rejects(
    classifier(classifierRequest(), {
      signal: new AbortController().signal,
    }),
    /TYPESAFE_API_KEY is not configured/,
  );
  assert.equal(fetchCalled, false);
});

test("TypeSafe classifier reserves the shared trial ledger before fetch and records actual usage", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "rlcd-jev-ledger-"));
  t.after(() => rm(directory, { recursive: true }));
  const ledgerPath = join(directory, "jev-trial-ledger.json");
  await writeFile(
    ledgerPath,
    `${JSON.stringify(emptyTrialLedger(), null, 2)}\n`,
    "utf8",
  );
  const request = classifierRequest();
  const classifier = createTypeSafeClassifier({
    apiKey: "local-test-key",
    ledgerPath,
    trialIssue: 5,
    trialPurpose: "HTTP contract test",
    fetch: (async () => {
      const reserved = JSON.parse(await readFile(ledgerPath, "utf8")) as {
        attempts: Array<Record<string, unknown>>;
      };
      assert.deepEqual(reserved.attempts, [
        {
          id: 1,
          issue: 5,
          purpose: "HTTP contract test",
          startedAt: reserved.attempts[0]!.startedAt,
          outcome: "reserved",
          reservedUsd: 0.002688,
        },
      ]);
      return new Response(JSON.stringify(validResponse(request)), {
        status: 200,
      });
    }) as typeof fetch,
  });

  await classifier(request, { signal: new AbortController().signal });

  const completed = JSON.parse(await readFile(ledgerPath, "utf8")) as {
    attempts: Array<Record<string, unknown>>;
  };
  assert.deepEqual(completed.attempts, [
    {
      id: 1,
      issue: 5,
      purpose: "HTTP contract test",
      startedAt: completed.attempts[0]!.startedAt,
      outcome: "success",
      reservedUsd: 0.002688,
      inputTokens: 321,
      outputTokens: 45,
      actualUsd: 0.000013482,
    },
  ]);
});

test("TypeSafe classifier enforces the cumulative request budget before fetch", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "rlcd-jev-budget-"));
  t.after(() => rm(directory, { recursive: true }));
  const ledgerPath = join(directory, "jev-trial-ledger.json");
  const ledger = {
    ...emptyTrialLedger(),
    attempts: Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      issue: index < 50 ? 5 : 6,
      purpose: "prior trial",
      startedAt: "2026-09-20T00:00:00.000Z",
      outcome: "success",
      reservedUsd: 0.002688,
      inputTokens: 0,
      outputTokens: 0,
      actualUsd: 0,
    })),
  };
  await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  let fetchCalled = false;
  const classifier = createTypeSafeClassifier({
    apiKey: "local-test-key",
    ledgerPath,
    fetch: (async () => {
      fetchCalled = true;
      throw new Error("must not fetch");
    }) as typeof fetch,
  });

  await assert.rejects(
    classifier(classifierRequest(), {
      signal: new AbortController().signal,
    }),
    /Jev trial budget is exhausted; no TypeSafe request was sent/,
  );
  assert.equal(fetchCalled, false);
});

test("TypeSafe classifier sends the exact pinned HTTP request with bearer auth", async () => {
  const request = classifierRequest();
  const controller = new AbortController();
  let observedInput: string | URL | Request | undefined;
  let observedInit: RequestInit | undefined;
  const responseBody = {
    model: "jev-1.13.0",
    answers: {
      operation: choice(
        "CLICK",
        Object.keys(request.questions.operation.options),
      ),
      click_target: choice(
        "CLICK_0",
        Object.keys(request.questions.click_target!.options),
      ),
    },
    usage: { input_tokens: 321, output_tokens: 45 },
  };
  const classifier = createTypeSafeClassifier({
    apiKey: "local-test-key",
    fetch: (async (input, init) => {
      observedInput = input;
      observedInit = init;
      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
    ledgerPath: false,
  });

  const result = await classifier(request, { signal: controller.signal });

  assert.equal(observedInput, "https://api.typesafe.ai/v1/systemone");
  assert.equal(observedInit?.method, "POST");
  assert.equal(observedInit?.signal, controller.signal);
  const headers = new Headers(observedInit?.headers);
  assert.equal(headers.get("authorization"), "Bearer local-test-key");
  assert.equal(headers.get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(observedInit?.body)), {
    state: {
      goal: request.goal,
      current_page: request.observation,
      retained_sources: request.retainedSources,
      recent_actions: request.recentActions,
    },
    model: "jev-1.13.0",
    questions: {
      operation: {
        type: "choice",
        instructions: request.questions.operation.instruction,
        criteria: request.questions.operation.options,
      },
      click_target: {
        type: "choice",
        instructions: request.questions.click_target!.instruction,
        criteria: request.questions.click_target!.options,
      },
    },
  });
  assert.deepEqual(result, responseBody);
});

test("TypeSafe classifier accepts an offered NO_MATCH answer", async () => {
  const request = classifierRequest();
  const targetOptions = Object.keys(request.questions.click_target!.options);
  const responseBody = {
    ...validResponse(request),
    answers: {
      ...validResponse(request).answers,
      click_target: choice("NO_MATCH", targetOptions),
    },
  };
  const classifier = createTypeSafeClassifier({
    apiKey: "local-test-key",
    ledgerPath: false,
    fetch: (async () =>
      new Response(JSON.stringify(responseBody), {
        status: 200,
      })) as typeof fetch,
  });

  const result = await classifier(request, {
    signal: new AbortController().signal,
  });

  assert.deepEqual(result, responseBody);
});

function validResponse(request = classifierRequest()) {
  return {
    model: "jev-1.13.0",
    answers: {
      operation: choice(
        "CLICK",
        Object.keys(request.questions.operation.options),
      ),
      click_target: choice(
        "CLICK_0",
        Object.keys(request.questions.click_target!.options),
      ),
    },
    usage: { input_tokens: 321, output_tokens: 45 },
  };
}

test("TypeSafe classifier rejects an oversized UTF-8 payload before fetch", async () => {
  const request = classifierRequest();
  request.observation.text = "🙂".repeat(10_000);
  let fetchCalled = false;
  const classifier = createTypeSafeClassifier({
    apiKey: "local-test-key",
    fetch: (async () => {
      fetchCalled = true;
      throw new Error("must not fetch");
    }) as typeof fetch,
    ledgerPath: false,
  });

  await assert.rejects(
    classifier(request, { signal: new AbortController().signal }),
    /TypeSafe request exceeds the 24000-byte conservative bound/,
  );
  assert.equal(fetchCalled, false);
});

test("TypeSafe classifier rejects malformed JSON from a successful response", async () => {
  const classifier = createTypeSafeClassifier({
    apiKey: "local-test-key",
    fetch: (async () =>
      new Response("{not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch,
    ledgerPath: false,
  });

  await assert.rejects(
    classifier(classifierRequest(), {
      signal: new AbortController().signal,
    }),
    /TypeSafe returned malformed JSON/,
  );
});

test("TypeSafe classifier rejects malformed successful response contracts", async (t) => {
  const request = classifierRequest();
  const malformedCases: Array<{ name: string; body: unknown }> = [
    { name: "non-object", body: null },
    { name: "wrong model", body: { ...validResponse(), model: "jev-latest" } },
    {
      name: "missing answer id",
      body: {
        ...validResponse(),
        answers: { operation: validResponse().answers.operation },
      },
    },
    {
      name: "unexpected answer id",
      body: {
        ...validResponse(),
        answers: {
          ...validResponse().answers,
          invented: { type: "noul", noul: 1 },
        },
      },
    },
    {
      name: "wrong answer type",
      body: {
        ...validResponse(),
        answers: {
          ...validResponse().answers,
          click_target: { type: "noul", noul: 1 },
        },
      },
    },
    {
      name: "unoffered choice",
      body: {
        ...validResponse(),
        answers: {
          ...validResponse().answers,
          click_target: {
            ...validResponse().answers.click_target,
            choice: "CLICK_INVENTED",
          },
        },
      },
    },
    {
      name: "probability keys differ",
      body: {
        ...validResponse(),
        answers: {
          ...validResponse().answers,
          click_target: {
            ...validResponse().answers.click_target,
            probabilities: { CLICK_0: 1 },
          },
        },
      },
    },
    {
      name: "probability outside range",
      body: {
        ...validResponse(),
        answers: {
          ...validResponse().answers,
          click_target: {
            ...validResponse().answers.click_target,
            probabilities: { CLICK_0: 1.1, NO_MATCH: -0.1 },
          },
        },
      },
    },
    {
      name: "probabilities do not sum within tolerance",
      body: {
        ...validResponse(),
        answers: {
          ...validResponse().answers,
          click_target: {
            ...validResponse().answers.click_target,
            probabilities: { CLICK_0: 0.8, NO_MATCH: 0.1 },
          },
        },
      },
    },
    {
      name: "choice is not a highest-probability option",
      body: {
        ...validResponse(),
        answers: {
          ...validResponse().answers,
          click_target: {
            ...validResponse().answers.click_target,
            choice: "CLICK_0",
            probabilities: { CLICK_0: 0.4, NO_MATCH: 0.6 },
          },
        },
      },
    },
    {
      name: "confidence outside range",
      body: {
        ...validResponse(),
        answers: {
          ...validResponse().answers,
          click_target: {
            ...validResponse().answers.click_target,
            confidence: 1.1,
          },
        },
      },
    },
    {
      name: "missing usage",
      body: { model: "jev-1.13.0", answers: validResponse().answers },
    },
    {
      name: "invalid usage",
      body: {
        ...validResponse(),
        usage: { input_tokens: -1, output_tokens: 1.5 },
      },
    },
    {
      name: "input usage exceeds the reserved model maximum",
      body: {
        ...validResponse(),
        usage: { input_tokens: 64_001, output_tokens: 1 },
      },
    },
  ];

  for (const malformed of malformedCases) {
    await t.test(malformed.name, async () => {
      const classifier = createTypeSafeClassifier({
        apiKey: "local-test-key",
        fetch: (async () =>
          new Response(JSON.stringify(malformed.body), {
            status: 200,
            headers: { "content-type": "application/json" },
          })) as typeof fetch,
        ledgerPath: false,
      });

      await assert.rejects(
        classifier(request, { signal: new AbortController().signal }),
        /TypeSafe returned an invalid response/,
      );
    });
  }
});

test("TypeSafe classifier reports and redacts response body read failures", async () => {
  const classifier = createTypeSafeClassifier({
    apiKey: "local-test-key",
    fetch: (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        async text() {
          throw new Error("body stream failed with local-test-key");
        },
      }) as unknown as Response) as typeof fetch,
    ledgerPath: false,
  });

  await assert.rejects(
    classifier(classifierRequest(), {
      signal: new AbortController().signal,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /TypeSafe response body read failed/);
      assert.match(error.message, /body stream failed/);
      assert.doesNotMatch(error.message, /local-test-key/);
      return true;
    },
  );
});

test("TypeSafe classifier passes cancellation to fetch and retains its unknown-cost reserve", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "rlcd-jev-cancel-"));
  t.after(() => rm(directory, { recursive: true }));
  const ledgerPath = join(directory, "jev-trial-ledger.json");
  await writeFile(
    ledgerPath,
    `${JSON.stringify(emptyTrialLedger(), null, 2)}\n`,
    "utf8",
  );
  const controller = new AbortController();
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const classifier = createTypeSafeClassifier({
    apiKey: "local-test-key",
    fetch: (async (_input, init) => {
      markStarted();
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
      throw new Error("unreachable");
    }) as typeof fetch,
    ledgerPath,
  });

  const pending = classifier(classifierRequest(), {
    signal: controller.signal,
  });
  await started;
  controller.abort(new Error("cancel TypeSafe request"));

  await assert.rejects(pending, /cancel TypeSafe request/);
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8")) as {
    attempts: Array<Record<string, unknown>>;
  };
  assert.equal(ledger.attempts.length, 1);
  assert.equal(ledger.attempts[0]!.outcome, "cancelled");
  assert.equal(ledger.attempts[0]!.reservedUsd, 0.002688);
  assert.equal("actualUsd" in ledger.attempts[0]!, false);
});

test("runner deadline aborts the active TypeSafe fetch and returns partial evidence", async () => {
  let now = 1_000;
  let expireDeadline!: () => void;
  let markFetchStarted!: () => void;
  const fetchStarted = new Promise<void>((resolve) => {
    markFetchStarted = resolve;
  });
  const classifier = createTypeSafeClassifier({
    apiKey: "local-test-key",
    ledgerPath: false,
    fetch: (async (_input, init) => {
      markFetchStarted();
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
      throw new Error("unreachable");
    }) as typeof fetch,
  });
  const runner = createRlcdBrwsrRunner({
    classifier,
    cli: async () => ({
      code: 0,
      killed: false,
      stderr: "",
      stdout: JSON.stringify({
        snapshot: {
          id: "1_0",
          role: "RootWebArea",
          name: "Deadline fixture",
          url: "http://127.0.0.1/deadline",
          children: [
            {
              id: "1_1",
              role: "StaticText",
              name: "Evidence retained before the classifier deadline",
            },
          ],
        },
      }),
    }),
    clock: { now: () => now },
    wait: async (_milliseconds, signal) => {
      await new Promise<void>((resolve, reject) => {
        expireDeadline = resolve;
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    },
  });

  const pending = runner({
    goal: "Stop at the classifier deadline",
    maxSteps: 1,
    maxSeconds: 1,
  });
  await fetchStarted;
  now = 2_001;
  expireDeadline();
  const result = await pending;

  assert.equal(result.stopReason, "time_budget");
  assert.equal(result.classifierDiagnostics[0]!.outcome, "timeout");
  assert.match(
    result.evidence.sources[0]!.excerpt,
    /Evidence retained before the classifier deadline/,
  );
});

test("TypeSafe classifier redacts network failures", async () => {
  const classifier = createTypeSafeClassifier({
    apiKey: "local-test-key",
    fetch: (async () => {
      throw new Error("socket closed while using local-test-key");
    }) as typeof fetch,
    ledgerPath: false,
  });

  await assert.rejects(
    classifier(classifierRequest(), {
      signal: new AbortController().signal,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /TypeSafe network request failed/);
      assert.match(error.message, /socket closed/);
      assert.doesNotMatch(error.message, /local-test-key/);
      return true;
    },
  );
});

for (const testCase of [
  {
    status: 401,
    label: "Unauthorized",
    body: JSON.stringify({ error: "invalid local-test-key" }),
  },
  {
    status: 422,
    label: "Unprocessable Entity",
    body: "question body failed validation",
  },
  { status: 429, label: "Too Many Requests", body: "" },
  { status: 529, label: "Overloaded", body: "overloaded ".repeat(200) },
]) {
  test(`TypeSafe classifier returns a bounded diagnostic for HTTP ${testCase.status}`, async () => {
    const classifier = createTypeSafeClassifier({
      apiKey: "local-test-key",
      fetch: (async () =>
        new Response(testCase.body, {
          status: testCase.status,
          statusText: testCase.label,
        })) as typeof fetch,
      ledgerPath: false,
    });

    await assert.rejects(
      classifier(classifierRequest(), {
        signal: new AbortController().signal,
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, new RegExp(`HTTP ${testCase.status}`));
        assert.match(error.message, new RegExp(testCase.label));
        assert.doesNotMatch(error.message, /local-test-key/);
        assert.ok(error.message.length <= 600);
        return true;
      },
    );
  });
}
