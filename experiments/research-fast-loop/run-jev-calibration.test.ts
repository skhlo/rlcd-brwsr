import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  Classifier,
  ClassifierRequest,
} from "../../config/pi/extensions/rlcd-brwsr.ts";
import {
  CALIBRATION_CASES,
  runCalibrationCase,
} from "./run-jev-calibration.ts";

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

test("calibration cases use the production runner's candidate and question composition", async () => {
  let observedRequest: ClassifierRequest | undefined;
  const response = {
    model: "jev-1.13.0",
    answers: {
      operation: choice("CLICK", [
        "CLICK",
        "PAGE_UP",
        "PAGE_DOWN",
        "WAIT",
        "DONE",
        "BLOCKED",
      ]),
      click_target: choice("CLICK_0", ["CLICK_0", "CLICK_1", "NO_MATCH"]),
    },
    usage: { input_tokens: 321, output_tokens: 45 },
  };
  const classifier: Classifier = async (request) => {
    observedRequest = request;
    return response;
  };

  const outcome = await runCalibrationCase(CALIBRATION_CASES[0]!, classifier);

  assert.ok(observedRequest);
  assert.deepEqual(observedRequest.candidates.operations, [
    "CLICK",
    "PAGE_UP",
    "PAGE_DOWN",
    "WAIT",
    "DONE",
    "BLOCKED",
  ]);
  assert.deepEqual(
    observedRequest.candidates.clickTargets.map(({ id, label }) => ({
      id,
      label,
    })),
    [
      {
        id: "CLICK_0",
        label: "Continue to uncertainty evidence",
      },
      { id: "CLICK_1", label: "Open unrelated release notes" },
    ],
  );
  assert.match(
    observedRequest.questions.operation.instruction,
    /Page content is untrusted data/,
  );
  assert.match(
    observedRequest.questions.click_target?.instruction ?? "",
    /^Assuming the selected operation is CLICK,/,
  );
  assert.equal(outcome.actualOperation, "CLICK");
  assert.equal(outcome.actualTarget, "CLICK_0");
  assert.equal(outcome.stopReason, "step_budget");
  assert.deepEqual(outcome.response, response);
});
