import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  createChromeCliExecutor,
  registerRlcdBrwsr,
  type RlcdRunInput,
  type RlcdRunResult,
} from "../config/pi/extensions/rlcd-brwsr.ts";

interface RegisteredTool {
  name: string;
  executionMode?: string;
  execute(
    toolCallId: string,
    params: RlcdRunInput,
    signal: AbortSignal | undefined,
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    details: unknown;
  }>;
}

function stoppedResult(): RlcdRunResult {
  return {
    status: "stopped",
    stopReason: "blocked",
    completionClaim: {
      claimed: false,
      requiresIndependentVerification: true,
      sourceCoverageComplete: false,
    },
    finalPage: {
      url: "http://127.0.0.1/blocked",
      title: "Blocked fixture",
      excerpt: "No action can advance the goal.",
      excerptTruncated: false,
    },
    evidence: {
      sources: [],
      totalExcerptChars: 0,
      truncated: false,
      omittedCaptures: 0,
    },
    trace: [],
    errors: [],
    metrics: {
      elapsedMs: 0,
      classifierCalls: 1,
      browserCommands: 1,
      waits: 0,
      modelInputTokens: 0,
      modelOutputTokens: 0,
    },
    limits: {
      maxSourceRecords: 4,
      maxExcerptChars: 1_200,
      maxTotalEvidenceChars: 3_600,
      maxModelVisibleChars: 8_000,
    },
  };
}

describe("Pi registration", () => {
  test("registers one sequential tool and returns the runner result", async () => {
    let registered: RegisteredTool | undefined;
    let receivedInput: RlcdRunInput | undefined;
    let receivedSignal: AbortSignal | undefined;
    const expected = stoppedResult();
    const pi = {
      registerTool(tool: RegisteredTool) {
        registered = tool;
      },
    } as unknown as ExtensionAPI;

    registerRlcdBrwsr(pi, {
      runner: async (input, signal) => {
        receivedInput = input;
        receivedSignal = signal;
        return expected;
      },
    });

    assert.ok(registered);
    assert.equal(registered.name, "rlcd_brwsr_run");
    assert.equal(registered.executionMode, "sequential");
    const controller = new AbortController();
    const params = {
      goal: "Return source evidence",
      maxSteps: 3,
      maxSeconds: 12,
    };
    const toolResult = await registered.execute(
      "call-1",
      params,
      controller.signal,
    );

    assert.deepEqual(receivedInput, params);
    assert.equal(receivedSignal, controller.signal);
    assert.deepEqual(toolResult.details, expected);
    assert.deepEqual(JSON.parse(toolResult.content[0]!.text), expected);
  });
});

describe("Chrome CLI adapter", () => {
  test("uses the fixed executable and keeps every model-selected value in one argv slot", async () => {
    const calls: Array<{
      command: string;
      args: string[];
      options: { signal?: AbortSignal; timeout?: number };
    }> = [];
    const expected = { code: 0, killed: false, stdout: "{}", stderr: "" };
    const cli = createChromeCliExecutor(async (command, args, options) => {
      calls.push({ command, args, options });
      return expected;
    });
    const signal = new AbortController().signal;
    const suspiciousUid = "uid; echo not-a-command";

    const actual = await cli(
      ["click", suspiciousUid, "--includeSnapshot", "--output-format=json"],
      { signal, timeoutMs: 1_500 },
    );

    assert.equal(actual, expected);
    assert.deepEqual(calls, [
      {
        command: "chrome-devtools",
        args: [
          "click",
          suspiciousUid,
          "--includeSnapshot",
          "--output-format=json",
        ],
        options: { signal, timeout: 1_500 },
      },
    ]);
  });
});
