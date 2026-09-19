import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  registerRlcdBrwsr,
  type ClassifierRequest,
} from "../../config/pi/extensions/rlcd-brwsr.ts";

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

function fakeJevResponse(request: ClassifierRequest): unknown {
  const target = request.candidates.clickTargets.find(
    (candidate) =>
      candidate.label === "Continue to uncertainty evidence" ||
      candidate.label === "Open slow documentation",
  );
  const operation = target
    ? "CLICK"
    : request.observation.title === "RLCD uncertainty evidence"
      ? "DONE"
      : "BLOCKED";
  const answers: Record<string, unknown> = {
    operation: choice(operation, request.candidates.operations),
  };
  if (request.candidates.clickTargets.length > 0) {
    const offeredTargets = request.candidates.clickTargets.map(
      (candidate) => candidate.uid,
    );
    answers.click_target = choice(
      target?.uid ?? offeredTargets[0]!,
      offeredTargets,
    );
  }
  return {
    model: "fake-jev-1.13.0",
    answers,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

export default function fakeJevFixtureExtension(pi: ExtensionAPI): void {
  registerRlcdBrwsr(pi, {
    classifier: async (request, context) => {
      context.signal.throwIfAborted();
      return fakeJevResponse(request);
    },
  });
}
