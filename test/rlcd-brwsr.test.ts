import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createRlcdBrwsrRunner,
  type ClassifierRequest,
  type RlcdDependencies,
} from "../config/pi/extensions/rlcd-brwsr.ts";

function snapshot(
  id: string,
  url: string,
  title: string,
  children: unknown[],
): unknown {
  return {
    snapshot: {
      id,
      role: "RootWebArea",
      name: title,
      url,
      children,
    },
  };
}

function processResult(payload: unknown) {
  return {
    code: 0,
    killed: false,
    stderr: "",
    stdout: JSON.stringify(payload),
  };
}

function choice(selected: string, offered: readonly string[]) {
  return {
    type: "choice",
    choice: selected,
    confidence: 1,
    probabilities: Object.fromEntries(
      offered.map((candidate) => [candidate, candidate === selected ? 1 : 0]),
    ),
  };
}

describe("rlcd_brwsr runner", () => {
  test("returns evidence from both pages after a code-owned click and DONE claim", async () => {
    const startUrl = "http://127.0.0.1:43113/index.html";
    const destinationUrl = "http://127.0.0.1:43113/evidence.html";
    const browserResults = [
      processResult(
        snapshot("1_0", startUrl, "Research start", [
          {
            id: "1_1",
            role: "heading",
            name: "Question design",
          },
          {
            id: "1_2",
            role: "StaticText",
            name: "Ask narrow questions over relevant state.",
          },
          {
            id: "1_3",
            role: "link",
            name: "Continue to uncertainty evidence",
            url: destinationUrl,
          },
          { id: "1_6", role: "textbox", name: "Unused search" },
          { id: "1_4", role: "link", name: "Log in" },
          { id: "1_5", role: "button", name: "Donate" },
        ]),
      ),
      processResult(
        snapshot("2_0", destinationUrl, "Uncertainty evidence", [
          {
            id: "2_1",
            role: "heading",
            name: "Verify completion independently",
          },
          {
            id: "2_2",
            role: "StaticText",
            name: "A DONE choice is a claim, not proof of source coverage.",
          },
        ]),
      ),
    ];
    const argv: string[][] = [];
    const classifierRequests: ClassifierRequest[] = [];

    const dependencies: RlcdDependencies = {
      classifier: async (request) => {
        classifierRequests.push(request);
        const operation =
          request.observation.url === startUrl ? "CLICK" : "DONE";
        const answers: Record<string, unknown> = {
          operation: choice(operation, request.candidates.operations),
        };
        if (request.candidates.clickTargets.length > 0) {
          const targetIds = request.candidates.clickTargets.map(
            (target) => target.id,
          );
          answers.click_target = choice(targetIds[0]!, [
            ...targetIds,
            "NO_MATCH",
          ]);
          answers.type_text_pair = {
            type: "choice",
            choice: "malformed-unused-speculative-branch",
          };
        }
        return {
          model: "fake-jev-1.13.0",
          answers,
          usage: { input_tokens: 0, output_tokens: 0 },
        };
      },
      cli: async (args) => {
        argv.push([...args]);
        const result = browserResults.shift();
        assert.ok(result, "unexpected CLI call");
        return result;
      },
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    };

    const result = await createRlcdBrwsrRunner(dependencies)({
      goal: 'Collect both fixture pages; an unused field value is "unused"',
      maxSteps: 2,
      maxSeconds: 10,
    });

    assert.deepEqual(argv, [
      ["take_snapshot", "--output-format=json"],
      ["click", "1_3", "--includeSnapshot", "--output-format=json"],
    ]);
    assert.equal(classifierRequests.length, 2);
    assert.match(
      classifierRequests[0]!.questions.click_target?.instruction ?? "",
      /^Assuming the selected operation is CLICK,/,
    );
    assert.deepEqual(classifierRequests[0]!.candidates.clickTargets, [
      {
        id: "CLICK_0",
        uid: "1_3",
        role: "link",
        label: "Continue to uncertainty evidence",
      },
    ]);
    assert.equal(result.status, "completion_claim");
    assert.equal(result.stopReason, "done_claim");
    assert.deepEqual(
      result.evidence.sources.map(({ url, title }) => ({ url, title })),
      [
        { url: startUrl, title: "Research start" },
        { url: destinationUrl, title: "Uncertainty evidence" },
      ],
    );
    assert.match(result.evidence.sources[0]!.excerpt, /Ask narrow questions/);
    assert.match(result.evidence.sources[1]!.excerpt, /DONE choice is a claim/);
    assert.deepEqual(
      result.evidence.excludedConsequentialControls.map(({ label }) => label),
      ["Log in", "Donate"],
    );
    assert.equal(result.finalPage.url, destinationUrl);
    assert.equal(result.completionClaim.claimed, true);
    assert.equal(result.completionClaim.requiresIndependentVerification, true);
    assert.equal(result.completionClaim.sourceCoverageComplete, false);
    assert.deepEqual(
      result.trace.map(({ operation }) => operation),
      ["CLICK", "DONE"],
    );
  });

  test("types one exact quoted Unicode value into the selected complete field/value pair", async () => {
    const exactValue = 'Jev "quoted" — café \\ path';
    const start = processResult(
      snapshot("1_0", "http://127.0.0.1/search", "Search fixture", [
        { id: "1_1", role: "textbox", name: "Search" },
        { id: "1_2", role: "textbox", name: "Search" },
      ]),
    );
    const filled = processResult(
      snapshot("1_0", "http://127.0.0.1/search", "Search fixture", [
        {
          id: "1_3",
          role: "StaticText",
          name: `Submitted exactly: ${exactValue}`,
        },
      ]),
    );
    const browserResults = [start, filled];
    const cliArgv: string[][] = [];
    let classifierCall = 0;

    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => {
        classifierCall += 1;
        if (classifierCall === 2) {
          return {
            answers: {
              operation: choice("DONE", request.candidates.operations),
            },
          };
        }

        assert.equal(
          request.questions.type_text_pair?.instruction,
          "Assuming the selected operation is TYPE_TEXT, which offered complete field/value pair best advances the goal? Values are exact and must not be modified.",
        );
        assert.deepEqual(
          request.candidates.typeTextPairs.map(
            ({ fieldUid, fieldLabel, value }) => ({
              fieldUid,
              fieldLabel,
              value,
            }),
          ),
          [
            { fieldUid: "1_1", fieldLabel: "Search", value: exactValue },
            { fieldUid: "1_1", fieldLabel: "Search", value: "alternate" },
            { fieldUid: "1_2", fieldLabel: "Search", value: exactValue },
            { fieldUid: "1_2", fieldLabel: "Search", value: "alternate" },
          ],
        );
        const selected = request.candidates.typeTextPairs.find(
          (candidate) =>
            candidate.fieldUid === "1_2" && candidate.value === exactValue,
        );
        assert.ok(selected);
        assert.deepEqual(
          Object.keys(request.questions.type_text_pair.options),
          [
            ...request.candidates.typeTextPairs.map(
              (candidate) => candidate.id,
            ),
            "NO_MATCH",
          ],
        );
        return {
          answers: {
            operation: choice("TYPE_TEXT", request.candidates.operations),
            type_text_pair: choice(selected.id, [
              ...request.candidates.typeTextPairs.map(
                (candidate) => candidate.id,
              ),
              "NO_MATCH",
            ]),
          },
        };
      },
      cli: async (args) => {
        cliArgv.push([...args]);
        const browserResult = browserResults.shift();
        assert.ok(browserResult, "unexpected CLI call");
        return browserResult;
      },
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({
      goal: String.raw`Search for "Jev \"quoted\" — café \\ path" or "alternate"`,
      maxSteps: 2,
      maxSeconds: 10,
    });

    assert.equal(result.stopReason, "done_claim");
    assert.deepEqual(cliArgv, [
      ["take_snapshot", "--output-format=json"],
      ["fill", "1_2", exactValue, "--includeSnapshot", "--output-format=json"],
    ]);
  });

  test("selects one complete native field/observed-option pair with duplicate labels", async () => {
    const option = 'Speculative "fan-out" — 日本語';
    const nativeSelect = (id: string) => ({
      id,
      role: "combobox",
      name: "Topic",
      children: [
        {
          id: `${id}_1`,
          role: "option",
          name: "Question design",
          value: "Question design",
        },
        {
          id: `${id}_2`,
          role: "option",
          name: option,
          value: option,
        },
      ],
    });
    const browserResults = [
      processResult(
        snapshot("1_0", "http://127.0.0.1/select", "Select fixture", [
          nativeSelect("1_1"),
          nativeSelect("1_2"),
        ]),
      ),
      processResult(
        snapshot("1_0", "http://127.0.0.1/select", "Select fixture", [
          {
            id: "1_3",
            role: "StaticText",
            name: `Second Topic selected: ${option}`,
          },
        ]),
      ),
    ];
    const cliArgv: string[][] = [];
    let classifierCall = 0;

    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => {
        classifierCall += 1;
        if (classifierCall === 2) {
          return {
            answers: {
              operation: choice("DONE", request.candidates.operations),
            },
          };
        }

        assert.match(
          request.questions.select_pair?.instruction ?? "",
          /^Assuming the selected operation is SELECT,/,
        );
        assert.deepEqual(
          request.candidates.selectPairs.map(
            ({ fieldUid, fieldLabel, option: observedOption }) => ({
              fieldUid,
              fieldLabel,
              option: observedOption,
            }),
          ),
          [
            {
              fieldUid: "1_1",
              fieldLabel: "Topic",
              option: "Question design",
            },
            { fieldUid: "1_1", fieldLabel: "Topic", option },
            {
              fieldUid: "1_2",
              fieldLabel: "Topic",
              option: "Question design",
            },
            { fieldUid: "1_2", fieldLabel: "Topic", option },
          ],
        );
        const selected = request.candidates.selectPairs.find(
          (candidate) =>
            candidate.fieldUid === "1_2" && candidate.option === option,
        );
        assert.ok(selected);
        return {
          answers: {
            operation: choice("SELECT", request.candidates.operations),
            select_pair: choice(selected.id, [
              ...request.candidates.selectPairs.map(
                (candidate) => candidate.id,
              ),
              "NO_MATCH",
            ]),
          },
        };
      },
      cli: async (args) => {
        cliArgv.push([...args]);
        const browserResult = browserResults.shift();
        assert.ok(browserResult, "unexpected CLI call");
        return browserResult;
      },
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({
      goal: "Choose the Japanese fan-out topic",
      maxSteps: 2,
      maxSeconds: 10,
    });

    assert.equal(result.stopReason, "done_claim");
    assert.deepEqual(cliArgv, [
      ["take_snapshot", "--output-format=json"],
      ["fill", "1_2", option, "--includeSnapshot", "--output-format=json"],
    ]);
  });

  test("hands off when a native select has duplicate executable labels", async () => {
    let classifierCalled = false;
    const cliArgv: string[][] = [];

    const result = await createRlcdBrwsrRunner({
      classifier: async () => {
        classifierCalled = true;
        return {};
      },
      cli: async (args) => {
        cliArgv.push([...args]);
        return processResult(
          snapshot(
            "1_0",
            "http://127.0.0.1/ambiguous-select",
            "Ambiguous select fixture",
            [
              {
                id: "1_1",
                role: "combobox",
                name: "Research topic",
                children: [
                  {
                    id: "1_2",
                    role: "option",
                    name: "Response validation",
                    value: "Response validation",
                  },
                  {
                    id: "1_3",
                    role: "option",
                    name: "Response validation",
                    value: "Response validation",
                  },
                ],
              },
            ],
          ),
        );
      },
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({
      goal: "Choose the relevant response validation source",
      maxSteps: 1,
      maxSeconds: 10,
    });

    assert.equal(result.stopReason, "ambiguous_select_option");
    assert.equal(classifierCalled, false);
    assert.deepEqual(cliArgv, [["take_snapshot", "--output-format=json"]]);
  });

  test("scrolls down and up with fixed keys while WAIT refreshes without an empty target head", async () => {
    const browserResults = [
      processResult(
        snapshot("1_0", "http://127.0.0.1/scroll", "Scroll fixture", [
          { id: "1_1", role: "StaticText", name: "At the top" },
        ]),
      ),
      processResult(
        snapshot("1_0", "http://127.0.0.1/scroll", "Scroll fixture", [
          { id: "1_1", role: "StaticText", name: "Lower evidence visible" },
        ]),
      ),
      processResult(
        snapshot("1_0", "http://127.0.0.1/scroll", "Scroll fixture", [
          { id: "1_1", role: "StaticText", name: "Lower evidence visible" },
        ]),
      ),
      processResult(
        snapshot("1_0", "http://127.0.0.1/scroll", "Scroll fixture", [
          {
            id: "1_1",
            role: "StaticText",
            name: "Top and lower evidence collected",
          },
        ]),
      ),
    ];
    const operations = ["PAGE_DOWN", "WAIT", "PAGE_UP", "DONE"];
    const cliArgv: string[][] = [];

    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => {
        assert.deepEqual(Object.keys(request.questions), ["operation"]);
        const operation = operations.shift();
        assert.ok(operation);
        return {
          answers: {
            operation: choice(operation, request.candidates.operations),
          },
        };
      },
      cli: async (args) => {
        cliArgv.push([...args]);
        const browserResult = browserResults.shift();
        assert.ok(browserResult, "unexpected CLI call");
        return browserResult;
      },
      clock: { now: () => 1_000 },
      wait: async (milliseconds) => {
        if (milliseconds === 250) return;
        await new Promise(() => {});
      },
    })({ goal: "Collect top and lower evidence", maxSteps: 4, maxSeconds: 10 });

    assert.equal(result.stopReason, "done_claim");
    assert.deepEqual(cliArgv, [
      ["take_snapshot", "--output-format=json"],
      ["press_key", "PageDown", "--includeSnapshot", "--output-format=json"],
      ["take_snapshot", "--output-format=json"],
      ["press_key", "PageUp", "--includeSnapshot", "--output-format=json"],
    ]);
    assert.deepEqual(
      result.trace.map(({ operation }) => operation),
      ["PAGE_DOWN", "WAIT", "PAGE_UP", "DONE"],
    );
    assert.equal(result.metrics.waits, 1);
  });

  test("does not offer disabled fields or empty operation-specific heads", async () => {
    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => {
        assert.equal(
          request.candidates.operations.includes("TYPE_TEXT"),
          false,
        );
        assert.equal(request.candidates.operations.includes("SELECT"), false);
        assert.deepEqual(Object.keys(request.questions), ["operation"]);
        return {
          answers: {
            operation: choice("BLOCKED", request.candidates.operations),
          },
        };
      },
      cli: async () =>
        processResult(
          snapshot("1_0", "http://127.0.0.1/disabled", "Disabled fixture", [
            {
              id: "1_1",
              role: "textbox",
              name: "Disabled search",
              disabled: true,
            },
            {
              id: "1_2",
              role: "combobox",
              name: "Disabled topic",
              disabled: true,
              children: [
                {
                  id: "1_3",
                  role: "option",
                  name: "Observed but unavailable",
                  value: "Observed but unavailable",
                },
              ],
            },
          ]),
        ),
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({
      goal: 'Do not mutate disabled controls with "supplied text"',
      maxSteps: 1,
      maxSeconds: 10,
    });

    assert.equal(result.stopReason, "blocked");
    assert.equal(result.metrics.browserCommands, 1);
  });

  test("returns needs_text after BLOCKED when observed fields have no supplied quoted value", async () => {
    const cliArgv: string[][] = [];

    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => {
        assert.equal(
          request.candidates.operations.includes("TYPE_TEXT"),
          false,
        );
        assert.equal(request.questions.type_text_pair, undefined);
        return {
          answers: {
            operation: choice("BLOCKED", request.candidates.operations),
          },
        };
      },
      cli: async (args) => {
        cliArgv.push([...args]);
        return processResult(
          snapshot("1_0", "http://127.0.0.1/search", "Search fixture", [
            { id: "1_1", role: "searchbox", name: "Documentation search" },
          ]),
        );
      },
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({ goal: "Search the documentation", maxSteps: 1, maxSeconds: 10 });

    assert.equal(result.stopReason, "needs_text");
    assert.equal(result.trace[0]!.outcome, "needs_text");
    assert.deepEqual(cliArgv, [["take_snapshot", "--output-format=json"]]);
  });

  test("returns needs_text without mutation when TYPE_TEXT selects explicit NO_MATCH", async () => {
    const cliArgv: string[][] = [];

    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => {
        const offered = Object.keys(
          request.questions.type_text_pair?.options ?? {},
        );
        return {
          answers: {
            operation: choice("TYPE_TEXT", request.candidates.operations),
            type_text_pair: choice("NO_MATCH", offered),
          },
        };
      },
      cli: async (args) => {
        cliArgv.push([...args]);
        return processResult(
          snapshot("1_0", "http://127.0.0.1/search", "Search fixture", [
            { id: "1_1", role: "textbox", name: "Search" },
          ]),
        );
      },
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({
      goal: 'Search with a value that fits, otherwise return "wrong value"',
      maxSteps: 1,
      maxSeconds: 10,
    });

    assert.equal(result.stopReason, "needs_text");
    assert.equal(result.trace[0]!.outcome, "no_matching_target");
    assert.deepEqual(cliArgv, [["take_snapshot", "--output-format=json"]]);
  });

  test("hands off when recognized consequential controls are the only click actions", async () => {
    let classifierCalled = false;
    const cliArgv: string[][] = [];
    const result = await createRlcdBrwsrRunner({
      classifier: async () => {
        classifierCalled = true;
        return {};
      },
      cli: async (args) => {
        cliArgv.push([...args]);
        return processResult(
          snapshot("1_0", "http://127.0.0.1/account", "Account documentation", [
            {
              id: "1_1",
              role: "StaticText",
              name: "Read the public account documentation before continuing.",
            },
            { id: "1_2", role: "link", name: "Log in to continue" },
            { id: "1_3", role: "button", name: "Donate now" },
          ]),
        );
      },
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({
      goal: "Continue only if the public documentation permits it",
      maxSteps: 2,
      maxSeconds: 10,
    });

    assert.equal(result.stopReason, "consequential_action");
    assert.equal(result.completionClaim.claimed, false);
    assert.equal(classifierCalled, false);
    assert.deepEqual(cliArgv, [["take_snapshot", "--output-format=json"]]);
    assert.deepEqual(
      result.evidence.excludedConsequentialControls.map(({ role, label }) => ({
        role,
        label,
      })),
      [
        { role: "link", label: "Log in to continue" },
        { role: "button", label: "Donate now" },
      ],
    );
    assert.equal(result.evidence.excludedConsequentialControlsTruncated, false);
  });

  test("rejects an unoffered classifier target before browser mutation", async () => {
    const start = processResult(
      snapshot("1_0", "http://127.0.0.1/start", "Invalid choice fixture", [
        { id: "1_1", role: "link", name: "Offered link" },
      ]),
    );
    const cliArgv: string[][] = [];

    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => ({
        answers: {
          operation: choice("CLICK", request.candidates.operations),
          click_target: {
            ...choice("1_1", ["1_1"]),
            choice: "model-invented-uid",
          },
        },
      }),
      cli: async (args) => {
        cliArgv.push([...args]);
        return start;
      },
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({ goal: "Reject invented targets", maxSteps: 2, maxSeconds: 10 });

    assert.equal(result.stopReason, "invalid_classifier_response");
    assert.deepEqual(cliArgv, [["take_snapshot", "--output-format=json"]]);
    assert.equal(result.evidence.sources.length, 1);
  });

  test("rejects an unoffered text pair before mutating its field", async () => {
    const cliArgv: string[][] = [];

    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => {
        const offered = [
          ...request.candidates.typeTextPairs.map((candidate) => candidate.id),
          "NO_MATCH",
        ];
        return {
          answers: {
            operation: choice("TYPE_TEXT", request.candidates.operations),
            type_text_pair: {
              ...choice(offered[0]!, offered),
              choice: "model-invented-field-value-pair",
            },
          },
        };
      },
      cli: async (args) => {
        cliArgv.push([...args]);
        return processResult(
          snapshot("1_0", "http://127.0.0.1/search", "Search fixture", [
            { id: "1_1", role: "textbox", name: "Search" },
          ]),
        );
      },
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({ goal: 'Search for "offered exactly"', maxSteps: 1, maxSeconds: 10 });

    assert.equal(result.stopReason, "invalid_classifier_response");
    assert.deepEqual(cliArgv, [["take_snapshot", "--output-format=json"]]);
  });

  test("returns control instead of truncating more than 254 executable target options", async () => {
    let classifierCalled = false;
    const links = Array.from({ length: 255 }, (_, index) => ({
      id: `1_${index + 1}`,
      role: "link",
      name: `Documentation link ${index + 1}`,
    }));

    const result = await createRlcdBrwsrRunner({
      classifier: async () => {
        classifierCalled = true;
        return {};
      },
      cli: async () =>
        processResult(
          snapshot(
            "1_0",
            "http://127.0.0.1/many-targets",
            "Many targets fixture",
            links,
          ),
        ),
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({ goal: "Find one documentation link", maxSteps: 1, maxSeconds: 10 });

    assert.equal(result.stopReason, "candidate_overflow");
    assert.equal(classifierCalled, false);
    assert.equal(result.evidence.sources.length, 1);
  });

  test("counts duplicate native options before enforcing target capacity", async () => {
    let classifierCalled = false;
    const duplicateOptions = Array.from({ length: 255 }, (_, index) => ({
      id: `1_${index + 2}`,
      role: "option",
      name: "Same displayed label",
      value: "Same displayed label",
    }));

    const result = await createRlcdBrwsrRunner({
      classifier: async () => {
        classifierCalled = true;
        return {};
      },
      cli: async () =>
        processResult(
          snapshot(
            "1_0",
            "http://127.0.0.1/select-capacity",
            "Native option capacity fixture",
            [
              {
                id: "1_1",
                role: "combobox",
                name: "Research topic",
                children: duplicateOptions,
              },
            ],
          ),
        ),
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({ goal: "Choose one observed topic", maxSteps: 1, maxSeconds: 10 });

    assert.equal(result.stopReason, "candidate_overflow");
    assert.equal(classifierCalled, false);
  });

  test("returns candidate_overflow when complete field/value pairs exceed the choice limit", async () => {
    let classifierCalled = false;
    const quotedValues = Array.from(
      { length: 128 },
      (_, index) => `"v${index}"`,
    ).join(" ");

    const result = await createRlcdBrwsrRunner({
      classifier: async () => {
        classifierCalled = true;
        return {};
      },
      cli: async () =>
        processResult(
          snapshot("1_0", "http://127.0.0.1/pairs", "Pair fixture", [
            { id: "1_1", role: "textbox", name: "First field" },
            { id: "1_2", role: "textbox", name: "Second field" },
          ]),
        ),
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({ goal: `Use one of ${quotedValues}`, maxSteps: 1, maxSeconds: 10 });

    assert.equal(result.stopReason, "candidate_overflow");
    assert.equal(classifierCalled, false);
  });

  test("cancels a classifier call cooperatively and returns retained evidence", async () => {
    const controller = new AbortController();
    let classifierStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      classifierStarted = resolve;
    });

    const run = createRlcdBrwsrRunner({
      classifier: async (_request, context) => {
        classifierStarted();
        await new Promise<void>((_resolve, reject) => {
          context.signal.addEventListener(
            "abort",
            () => reject(context.signal.reason),
            {
              once: true,
            },
          );
        });
        return {};
      },
      cli: async () =>
        processResult(
          snapshot("1_0", "http://127.0.0.1/cancel", "Cancellation fixture", [
            {
              id: "1_1",
              role: "StaticText",
              name: "Evidence before cancellation",
            },
          ]),
        ),
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    });

    const pendingResult = run(
      { goal: "Cancel cleanly", maxSteps: 2, maxSeconds: 10 },
      controller.signal,
    );
    await started;
    controller.abort(new Error("test cancellation"));
    const result = await pendingResult;

    assert.equal(result.stopReason, "cancelled");
    assert.match(
      result.evidence.sources[0]!.excerpt,
      /Evidence before cancellation/,
    );
    assert.equal(result.metrics.classifierCalls, 1);
  });

  test("waits for a cancelled CLI adapter to settle before returning", async () => {
    const controller = new AbortController();
    let markCliStarted!: () => void;
    const cliStarted = new Promise<void>((resolve) => {
      markCliStarted = resolve;
    });
    let markCliAborted!: () => void;
    const cliAborted = new Promise<void>((resolve) => {
      markCliAborted = resolve;
    });
    let settleCli!: () => void;

    const run = createRlcdBrwsrRunner({
      classifier: async () => {
        throw new Error(
          "classifier must not run before the initial observation",
        );
      },
      cli: async (_args, options) => {
        markCliStarted();
        await new Promise<void>((resolve) => {
          settleCli = resolve;
          options.signal.addEventListener("abort", markCliAborted, {
            once: true,
          });
        });
        return {
          code: null,
          killed: true,
          stderr: "cancelled after CLI cleanup",
          stdout: "",
        };
      },
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    });

    let returned = false;
    const pendingResult = run(
      { goal: "Cancel the initial observation", maxSteps: 1, maxSeconds: 10 },
      controller.signal,
    ).then((result) => {
      returned = true;
      return result;
    });
    await cliStarted;
    controller.abort(new Error("test cancellation"));
    await cliAborted;
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(returned, false);
    settleCli();
    const result = await pendingResult;

    assert.equal(returned, true);
    assert.equal(result.stopReason, "cancelled");
    assert.equal(result.metrics.browserCommands, 1);
  });

  test("waits for a timed-out CLI adapter and reports cleanup beyond the budget", async () => {
    let now = 1_000;
    let markCliStarted!: () => void;
    const cliStarted = new Promise<void>((resolve) => {
      markCliStarted = resolve;
    });
    let markCliAborted!: () => void;
    const cliAborted = new Promise<void>((resolve) => {
      markCliAborted = resolve;
    });
    let settleCli!: () => void;
    let expireTimer!: () => void;

    const run = createRlcdBrwsrRunner({
      classifier: async () => {
        throw new Error(
          "classifier must not run before the initial observation",
        );
      },
      cli: async (_args, options) => {
        markCliStarted();
        await new Promise<void>((resolve) => {
          settleCli = resolve;
          options.signal.addEventListener("abort", markCliAborted, {
            once: true,
          });
        });
        return {
          code: null,
          killed: true,
          stderr: "timed out after CLI cleanup",
          stdout: "",
        };
      },
      clock: { now: () => now },
      wait: async (_milliseconds, signal) => {
        await new Promise<void>((resolve, reject) => {
          expireTimer = resolve;
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      },
    });

    let returned = false;
    const pendingResult = run({
      goal: "Time out the initial observation",
      maxSteps: 1,
      maxSeconds: 1,
    }).then((result) => {
      returned = true;
      return result;
    });
    await cliStarted;
    now = 2_000;
    expireTimer();
    await cliAborted;
    now = 2_250;
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(returned, false);
    settleCli();
    const result = await pendingResult;

    assert.equal(result.stopReason, "time_budget");
    assert.equal(result.metrics.elapsedMs, 1_250);
    assert.equal(result.metrics.budgetOverrunMs, 250);
  });

  test("does not retry a killed click whose mutation outcome is uncertain", async () => {
    const cliArgv: string[][] = [];
    const start = processResult(
      snapshot("1_0", "http://127.0.0.1/start", "Uncertain fixture", [
        { id: "1_1", role: "link", name: "Attempt one click" },
      ]),
    );

    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => {
        const targetIds = request.candidates.clickTargets.map(
          (target) => target.id,
        );
        return {
          answers: {
            operation: choice("CLICK", request.candidates.operations),
            click_target: choice(targetIds[0]!, [...targetIds, "NO_MATCH"]),
          },
        };
      },
      cli: async (args) => {
        cliArgv.push([...args]);
        if (cliArgv.length === 1) return start;
        return {
          code: null,
          killed: true,
          stderr: "click command timed out",
          stdout: "",
        };
      },
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({ goal: "Never retry unknown mutations", maxSteps: 4, maxSeconds: 10 });

    assert.equal(result.stopReason, "uncertain_execution");
    assert.equal(cliArgv.length, 2);
    assert.equal(result.evidence.sources.length, 1);
    assert.equal(result.trace[0]!.outcome, "uncertain_execution");
  });

  test("stops on an executor stale-target rejection without retrying the mutation", async () => {
    const cliArgv: string[][] = [];
    const start = processResult(
      snapshot("1_0", "http://127.0.0.1/stale", "Stale fixture", [
        { id: "1_1", role: "link", name: "Detached documentation link" },
      ]),
    );

    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => {
        const targetIds = request.candidates.clickTargets.map(
          (target) => target.id,
        );
        return {
          answers: {
            operation: choice("CLICK", request.candidates.operations),
            click_target: choice(targetIds[0]!, [...targetIds, "NO_MATCH"]),
          },
        };
      },
      cli: async (args) => {
        cliArgv.push([...args]);
        if (cliArgv.length === 1) return start;
        return processResult([
          {
            type: "text",
            text: 'Error: Element uid "1_1" not found on page 1.',
          },
        ]);
      },
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({ goal: "Follow the detached link", maxSteps: 3, maxSeconds: 10 });

    assert.equal(result.stopReason, "stale_target");
    assert.equal(cliArgv.length, 2);
    assert.equal(result.trace[0]!.outcome, "stale_target");
    assert.equal(result.evidence.sources.length, 1);
  });

  test("recognizes the pinned CLI detached-target wording without retrying", async () => {
    const cliArgv: string[][] = [];
    const start = processResult(
      snapshot("1_0", "http://127.0.0.1/stale", "Stale fixture", [
        { id: "1_1", role: "link", name: "Detached documentation link" },
      ]),
    );

    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => {
        const targetIds = request.candidates.clickTargets.map(
          (target) => target.id,
        );
        return {
          answers: {
            operation: choice("CLICK", request.candidates.operations),
            click_target: choice(targetIds[0]!, [...targetIds, "NO_MATCH"]),
          },
        };
      },
      cli: async (args) => {
        cliArgv.push([...args]);
        if (cliArgv.length === 1) return start;
        return processResult([
          {
            type: "text",
            text: "Error: Element with uid 1_1 no longer exists on the page.",
          },
        ]);
      },
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({ goal: "Follow the detached link", maxSteps: 3, maxSeconds: 10 });

    assert.equal(result.stopReason, "stale_target");
    assert.equal(cliArgv.length, 2);
    assert.equal(result.trace[0]!.outcome, "stale_target");
  });

  test("keeps an unknown dispatched CLI mutation failure uncertain", async () => {
    const cliArgv: string[][] = [];
    const start = processResult(
      snapshot("1_0", "http://127.0.0.1/error", "Mutation error fixture", [
        { id: "1_1", role: "link", name: "Documentation link" },
      ]),
    );

    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => {
        const targetIds = request.candidates.clickTargets.map(
          (target) => target.id,
        );
        return {
          answers: {
            operation: choice("CLICK", request.candidates.operations),
            click_target: choice(targetIds[0]!, [...targetIds, "NO_MATCH"]),
          },
        };
      },
      cli: async (args) => {
        cliArgv.push([...args]);
        if (cliArgv.length === 1) return start;
        return processResult([
          {
            type: "text",
            text: "Error: Element with uid 1_1 could not be activated.",
          },
        ]);
      },
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({ goal: "Follow the documentation link", maxSteps: 3, maxSeconds: 10 });

    assert.equal(result.stopReason, "uncertain_execution");
    assert.equal(cliArgv.length, 2);
    assert.equal(result.trace[0]!.outcome, "uncertain_execution");
  });

  test("treats the CLI JSON error array as failure rather than a success snapshot", async () => {
    let classifierCalled = false;
    const result = await createRlcdBrwsrRunner({
      classifier: async () => {
        classifierCalled = true;
        return {};
      },
      cli: async () =>
        processResult([
          {
            type: "text",
            text: 'Error: Element uid "missing" not found on page 1.',
          },
        ]),
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({ goal: "Parse CLI errors", maxSteps: 1, maxSeconds: 10 });

    assert.equal(result.stopReason, "command_failed");
    assert.equal(classifierCalled, false);
    assert.match(result.errors[0]!, /not found/);
  });

  test("WAIT observes again, deduplicates unchanged evidence, then honors BLOCKED", async () => {
    const page = processResult(
      snapshot("1_0", "http://127.0.0.1/wait", "Wait fixture", [
        { id: "1_1", role: "StaticText", name: "Unchanged source text" },
      ]),
    );
    const cliArgv: string[][] = [];
    let classifierCall = 0;

    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => {
        classifierCall += 1;
        const operation = classifierCall === 1 ? "WAIT" : "BLOCKED";
        return {
          answers: {
            operation: choice(operation, request.candidates.operations),
          },
        };
      },
      cli: async (args) => {
        cliArgv.push([...args]);
        return page;
      },
      clock: { now: () => 1_000 },
      wait: async (milliseconds) => {
        if (milliseconds === 250) return;
        await new Promise(() => {});
      },
    })({ goal: "Wait once", maxSteps: 2, maxSeconds: 10 });

    assert.equal(result.stopReason, "blocked");
    assert.deepEqual(cliArgv, [
      ["take_snapshot", "--output-format=json"],
      ["take_snapshot", "--output-format=json"],
    ]);
    assert.equal(result.evidence.sources.length, 1);
    assert.equal(result.metrics.waits, 1);
    assert.deepEqual(
      result.trace.map(({ operation }) => operation),
      ["WAIT", "BLOCKED"],
    );
  });

  test("cancels during WAIT without dispatching another browser command and keeps evidence", async () => {
    const controller = new AbortController();
    let markWaitStarted!: () => void;
    const waitStarted = new Promise<void>((resolve) => {
      markWaitStarted = resolve;
    });
    const cliArgv: string[][] = [];

    const pending = createRlcdBrwsrRunner({
      classifier: async (request) => ({
        answers: { operation: choice("WAIT", request.candidates.operations) },
      }),
      cli: async (args) => {
        cliArgv.push([...args]);
        return processResult(
          snapshot("1_0", "http://127.0.0.1/wait", "Wait fixture", [
            {
              id: "1_1",
              role: "StaticText",
              name: "Evidence retained before wait cancellation",
            },
          ]),
        );
      },
      clock: { now: () => 1_000 },
      wait: async (milliseconds, signal) => {
        if (milliseconds === 250) markWaitStarted();
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      },
    })(
      { goal: "Cancel during the bounded wait", maxSteps: 2, maxSeconds: 10 },
      controller.signal,
    );

    await waitStarted;
    controller.abort(new Error("cancel wait"));
    const result = await pending;

    assert.equal(result.stopReason, "cancelled");
    assert.deepEqual(cliArgv, [["take_snapshot", "--output-format=json"]]);
    assert.match(
      result.evidence.sources[0]!.excerpt,
      /Evidence retained before wait cancellation/,
    );
    assert.equal(result.metrics.waits, 1);
  });

  test("truncates oversized accessibility excerpts before classifier and result use", async () => {
    let classifierTextLength = 0;
    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => {
        classifierTextLength = request.observation.text.length;
        return {
          answers: { operation: choice("DONE", request.candidates.operations) },
        };
      },
      cli: async () =>
        processResult(
          snapshot("1_0", "http://127.0.0.1/large", "Large fixture", [
            { id: "1_1", role: "StaticText", name: "x".repeat(2_000) },
          ]),
        ),
      clock: { now: () => 1_000 },
      wait: async () => {
        await new Promise(() => {});
      },
    })({ goal: "Bound copied evidence", maxSteps: 1, maxSeconds: 10 });

    assert.equal(result.stopReason, "done_claim");
    assert.equal(classifierTextLength, 1_200);
    assert.equal(result.evidence.sources[0]!.excerpt.length, 1_200);
    assert.equal(result.evidence.sources[0]!.excerptTruncated, true);
    assert.equal(result.evidence.truncated, true);
  });

  test("stops when the bounded source-record inventory is full", async () => {
    let page = 0;
    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => ({
        answers: { operation: choice("WAIT", request.candidates.operations) },
      }),
      cli: async () => {
        page += 1;
        return processResult(
          snapshot(
            `${page}_0`,
            `http://127.0.0.1/page-${page}`,
            `Page ${page}`,
            [{ id: `${page}_1`, role: "StaticText", name: `Evidence ${page}` }],
          ),
        );
      },
      clock: { now: () => 1_000 },
      wait: async (milliseconds) => {
        if (milliseconds === 250) return;
        await new Promise(() => {});
      },
    })({ goal: "Respect evidence bounds", maxSteps: 6, maxSeconds: 10 });

    assert.equal(result.stopReason, "evidence_budget");
    assert.equal(result.evidence.sources.length, 4);
    assert.equal(result.evidence.omittedCaptures, 1);
    assert.equal(result.evidence.truncated, true);
    assert.equal(result.finalPage.url, "http://127.0.0.1/page-5");
  });

  test("stops after three non-WAIT operations show no observed progress", async () => {
    const unchanged = processResult(
      snapshot("1_0", "http://127.0.0.1/unchanged", "Unchanged fixture", [
        { id: "1_1", role: "link", name: "No-op link" },
      ]),
    );
    let cliCalls = 0;
    const operations = ["PAGE_DOWN", "WAIT", "PAGE_UP", "CLICK"];

    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => {
        const operation = operations.shift();
        assert.ok(operation);
        const answers: Record<string, unknown> = {
          operation: choice(operation, request.candidates.operations),
        };
        if (operation === "CLICK") {
          const targetIds = request.candidates.clickTargets.map(
            (target) => target.id,
          );
          answers.click_target = choice(targetIds[0]!, [
            ...targetIds,
            "NO_MATCH",
          ]);
        }
        return { answers };
      },
      cli: async () => {
        cliCalls += 1;
        return unchanged;
      },
      clock: { now: () => 1_000 },
      wait: async (milliseconds) => {
        if (milliseconds === 250) return;
        await new Promise(() => {});
      },
    })({ goal: "Stop a no-op loop", maxSteps: 6, maxSeconds: 10 });

    assert.equal(result.stopReason, "unchanged_state");
    assert.equal(cliCalls, 5);
    assert.deepEqual(
      result.trace.map(({ operation }) => operation),
      ["PAGE_DOWN", "WAIT", "PAGE_UP", "CLICK"],
    );
    assert.equal(result.evidence.sources.length, 1);
  });

  test("stops on the wall-clock budget before dispatching a selected mutation", async () => {
    let now = 1_000;
    const cliArgv: string[][] = [];
    const start = processResult(
      snapshot("1_0", "http://127.0.0.1/start", "Budget fixture", [
        { id: "1_1", role: "link", name: "Next page" },
      ]),
    );

    const result = await createRlcdBrwsrRunner({
      classifier: async (request) => {
        now = 2_001;
        const targetIds = request.candidates.clickTargets.map(
          (target) => target.id,
        );
        return {
          model: "fake-jev-1.13.0",
          answers: {
            operation: choice("CLICK", request.candidates.operations),
            click_target: choice(targetIds[0]!, [...targetIds, "NO_MATCH"]),
          },
        };
      },
      cli: async (args) => {
        cliArgv.push([...args]);
        return start;
      },
      clock: { now: () => now },
      wait: async () => {
        await new Promise(() => {});
      },
    })({ goal: "Do not outlive the budget", maxSteps: 2, maxSeconds: 1 });

    assert.equal(result.stopReason, "time_budget");
    assert.deepEqual(cliArgv, [["take_snapshot", "--output-format=json"]]);
    assert.equal(result.evidence.sources.length, 1);
  });
});
