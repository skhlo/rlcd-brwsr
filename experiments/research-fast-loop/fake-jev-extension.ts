import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  registerRlcdBrwsr,
  type ClassifierRequest,
} from "../../config/pi/extensions/rlcd-brwsr.ts";

const ACTION_QUERY = "Jev fast — café docs";
const ACTION_SEQUENCE = [
  "TYPE_TEXT",
  "SELECT",
  "PAGE_DOWN",
  "PAGE_UP",
  "WAIT",
  "CLICK",
  "DONE",
] as const;

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

function targetChoices(
  request: ClassifierRequest,
  head: "click_target" | "type_text_pair" | "select_pair",
): string[] | undefined {
  const question = request.questions[head];
  return question ? Object.keys(question.options) : undefined;
}

function completeAnswers(
  request: ClassifierRequest,
  operation: string,
  selectedTarget?: {
    head: "click_target" | "type_text_pair" | "select_pair";
    id: string;
  },
): Record<string, unknown> {
  const answers: Record<string, unknown> = {
    operation: choice(operation, request.candidates.operations),
  };
  for (const head of [
    "click_target",
    "type_text_pair",
    "select_pair",
  ] as const) {
    const offered = targetChoices(request, head);
    if (!offered) continue;
    const selected =
      selectedTarget?.head === head ? selectedTarget.id : "NO_MATCH";
    answers[head] = choice(selected, offered);
  }
  return answers;
}

function ordinaryFixtureDecision(request: ClassifierRequest): {
  operation: string;
  target?: {
    head: "click_target";
    id: string;
  };
} {
  const target = request.candidates.clickTargets.find(
    (candidate) =>
      candidate.label === "Continue to uncertainty evidence" ||
      candidate.label === "Open slow documentation",
  );
  if (target) {
    return {
      operation: "CLICK",
      target: { head: "click_target", id: target.id },
    };
  }
  return {
    operation:
      request.observation.title === "RLCD uncertainty evidence"
        ? "DONE"
        : "BLOCKED",
  };
}

let actionJourneyStep = 0;

function actionFixtureDecision(request: ClassifierRequest): {
  operation: string;
  target?: {
    head: "click_target" | "type_text_pair" | "select_pair";
    id: string;
  };
} {
  if (
    request.observation.text.includes("No exact query yet.") &&
    actionJourneyStep !== 0
  ) {
    actionJourneyStep = 0;
  }

  const operation = ACTION_SEQUENCE[actionJourneyStep] ?? "DONE";
  actionJourneyStep += 1;
  if (operation === "TYPE_TEXT") {
    const pair = request.candidates.typeTextPairs.find(
      (candidate) =>
        candidate.fieldLabel === "Documentation search" &&
        candidate.value === ACTION_QUERY,
    );
    return {
      operation,
      ...(pair
        ? { target: { head: "type_text_pair" as const, id: pair.id } }
        : {}),
    };
  }
  if (operation === "SELECT") {
    const pair = request.candidates.selectPairs.find(
      (candidate) =>
        candidate.fieldLabel === "Research topic" &&
        candidate.option.startsWith("Speculative fan-out"),
    );
    return {
      operation,
      ...(pair
        ? { target: { head: "select_pair" as const, id: pair.id } }
        : {}),
    };
  }
  if (operation === "CLICK") {
    const target = request.candidates.clickTargets.find(
      (candidate) => candidate.label === "Show gathered evidence",
    );
    return {
      operation,
      ...(target
        ? { target: { head: "click_target" as const, id: target.id } }
        : {}),
    };
  }
  return { operation };
}

function fakeJevResponse(request: ClassifierRequest): unknown {
  const decision =
    request.observation.title === "RLCD action journey"
      ? actionFixtureDecision(request)
      : ordinaryFixtureDecision(request);
  return {
    model: "fake-jev-1.13.0",
    answers: completeAnswers(request, decision.operation, decision.target),
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
