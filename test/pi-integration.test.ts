import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  registerRlcdBrwsr,
  type Classifier,
  type RlcdRunInput,
  type RlcdRunResult,
} from "../config/pi/extensions/rlcd-brwsr.ts";

interface RegisteredTool {
  name: string;
  executionMode?: string;
  parameters: {
    properties?: Record<string, unknown>;
  };
  execute(
    toolCallId: string,
    params: RlcdRunInput,
    signal: AbortSignal | undefined,
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    details: unknown;
  }>;
}

function snapshot(children: unknown[] = []): unknown {
  return {
    snapshot: {
      id: "1_0",
      role: "RootWebArea",
      name: "Registered tool fixture",
      url: "http://127.0.0.1/registered",
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

function registerWithExternalFakes(options: {
  classifier: Classifier;
  exec: NonNullable<ExtensionAPI["exec"]>;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}) {
  let registered: RegisteredTool | undefined;
  const pi = {
    registerTool(tool: RegisteredTool) {
      registered = tool;
    },
    exec: options.exec,
  } as unknown as ExtensionAPI;

  registerRlcdBrwsr(pi, {
    classifier: options.classifier,
    clock: { now: () => 1_000 },
    wait:
      options.wait ??
      (async () => {
        await new Promise(() => {});
      }),
  });
  assert.ok(registered);
  return registered;
}

describe("Pi registration", () => {
  test("executes the real runner through registered schema, signal, and Pi CLI seams", async () => {
    const execCalls: Array<{
      command: string;
      args: string[];
      options: { signal?: AbortSignal; timeout?: number };
    }> = [];
    let classifierSignal: AbortSignal | undefined;
    const registered = registerWithExternalFakes({
      classifier: async (request, context) => {
        classifierSignal = context.signal;
        return {
          answers: {
            operation: choice("BLOCKED", request.candidates.operations),
          },
        };
      },
      exec: async (command, args, options) => {
        execCalls.push({ command, args, options: options ?? {} });
        return processResult(
          snapshot([
            {
              id: "1_1",
              role: "StaticText",
              name: "No action can advance the goal.",
            },
          ]),
        );
      },
    });

    assert.equal(registered.name, "rlcd_brwsr_run");
    assert.equal(registered.executionMode, "sequential");
    assert.deepEqual(Object.keys(registered.parameters.properties ?? {}), [
      "goal",
      "maxSteps",
      "maxSeconds",
    ]);

    const controller = new AbortController();
    const toolResult = await registered.execute(
      "call-1",
      { goal: "Return source evidence", maxSteps: 3, maxSeconds: 12 },
      controller.signal,
    );
    const details = toolResult.details as RlcdRunResult;
    const content = JSON.parse(toolResult.content[0]!.text) as Record<
      string,
      unknown
    >;

    assert.equal(details.stopReason, "blocked");
    assert.equal(content.stopReason, "blocked");
    assert.equal(classifierSignal instanceof AbortSignal, true);
    assert.equal(execCalls[0]!.command, "chrome-devtools");
    assert.deepEqual(execCalls[0]!.args, [
      "take_snapshot",
      "--output-format=json",
    ]);
    assert.equal(execCalls[0]!.options.signal instanceof AbortSignal, true);
    assert.equal(execCalls[0]!.options.signal?.aborted, false);
    assert.equal(execCalls[0]!.options.timeout, 12_000);
  });

  test("bounds model-visible output for a candidate-rich registered-tool run", async () => {
    const controls = Array.from({ length: 16 }, (_, index) => ({
      id: `control-${index}`,
      role: "link",
      name: `Documentation control ${index}`,
    }));
    let execCalls = 0;
    const registered = registerWithExternalFakes({
      classifier: async (request) => {
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
      exec: async () => {
        execCalls += 1;
        return processResult(
          snapshot([
            ...controls,
            {
              id: `state-${execCalls}`,
              role: "StaticText",
              name: `Observed state ${execCalls}`,
            },
          ]),
        );
      },
      wait: async (milliseconds, signal) => {
        if (milliseconds === 250) return;
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      },
    });

    const toolResult = await registered.execute(
      "call-stress",
      {
        goal: "Inspect many documentation controls without losing evidence",
        maxSteps: 12,
        maxSeconds: 120,
      },
      new AbortController().signal,
    );
    const details = toolResult.details as RlcdRunResult;
    const content = JSON.parse(toolResult.content[0]!.text) as {
      stopReason: string;
      trace: Array<Record<string, unknown>>;
      modelVisible: {
        truncated: boolean;
        omitted: string[];
        maxChars: number;
      };
    };

    assert.equal(details.stopReason, "evidence_budget");
    assert.equal(details.trace.length, 4);
    assert.equal(
      Object.keys(details.trace[0]!.targetProbabilities ?? {}).length,
      17,
    );
    assert.equal(execCalls, 5);
    assert.equal(content.stopReason, "evidence_budget");
    assert.equal(content.trace.length, 4);
    assert.equal("operationProbabilities" in content.trace[0]!, false);
    assert.equal("targetProbabilities" in content.trace[0]!, false);
    assert.equal(content.modelVisible.truncated, true);
    assert.ok(content.modelVisible.omitted.includes("trace probabilities"));
    assert.ok(
      toolResult.content[0]!.text.length <= content.modelVisible.maxChars,
    );
    assert.equal(
      content.modelVisible.maxChars,
      details.limits.maxToolContentChars,
    );
  });
});
