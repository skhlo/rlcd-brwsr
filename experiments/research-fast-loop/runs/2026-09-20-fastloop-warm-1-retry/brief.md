# TypeSafe for RLCD-brwsr

## Evidence note

The required fast-loop run stopped with `classifier_state_budget` before making a classifier decision. It retained only a truncated excerpt from TypeSafe’s “How to build” page and made no completion claim. I therefore verified the findings through targeted retrieval of the official Markdown documentation. Every URL cited below was independently checked against its retrieved source.

## Recommended architecture

RLCD-brwsr matches TypeSafe’s intended programming model: ordinary code owns control flow, deterministic rules, and side effects, while Jev answers narrow, typed semantic questions. Jev should select only among code-created candidates; it must never produce selectors, URLs, commands, coordinates, JavaScript, or arbitrary text. This follows TypeSafe’s guidance to keep code in control and use System One only for constrained judgments ([How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)).

Pin `jev-1.13.0` rather than `jev-latest`. TypeSafe warns that aliases move and recommends pinning the version used to tune confidence thresholds ([Models](https://docs.typesafe.ai/models.md)).

## 1. Question design

Use a structured state containing only information relevant to the current browser decision:

- goal;
- current URL and title;
- bounded accessibility text;
- recent actions;
- retained-source inventory;
- current, indexed controls and their code-owned candidate IDs.

TypeSafe recommends small, relevant structured state, explicit references to nested fields, and narrow atomic questions with explicit instructions and criteria ([How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)). Page text should remain clearly separated from instructions because it is untrusted state.

Use `Choice` for every RLCD-brwsr decision because each answer must be one member of a closed set. A Choice returns the selected option, probabilities for every offered option, and confidence ([Choice](https://docs.typesafe.ai/primitives/choice.md)).

A suitable request shape is:

```ts
questions: {
  operation: {
    type: "choice",
    instructions:
      "Which offered operation best advances `goal` from the current browser state?",
    criteria: operationCandidates, // CLICK, WAIT, DONE, BLOCKED, etc.
  },

  click_target: {
    type: "choice",
    instructions:
      "Assuming the operation is CLICK, which offered target best advances `goal`?",
    criteria: clickCandidates
  },

  type_text_pair: {
    type: "choice",
    instructions:
      "Assuming the operation is TYPE_TEXT, which offered complete field/value pair best advances `goal`?",
    criteria: typeTextCandidates
  },

  select_pair: {
    type: "choice",
    instructions:
      "Assuming the operation is SELECT, which offered complete field/option pair best advances `goal`?",
    criteria: selectCandidates
  }
}
```

Concrete design rules:

- Put the complete meaning in `instructions` and `criteria`; question IDs are returned to code but are not shown to the model ([Choice](https://docs.typesafe.ai/primitives/choice.md)).
- Make criteria contrastive: say what each operation or target is for and, where ambiguous, what belongs under a neighboring option instead.
- Include explicit no-match outcomes. `BLOCKED` serves this purpose for the operation question; target heads should have `NO_MATCH` where no candidate may fit. TypeSafe recommends `other` or `none of the above` when candidate coverage may be incomplete ([Choice](https://docs.typesafe.ai/primitives/choice.md)).
- Represent `TYPE_TEXT` and `SELECT` candidates as complete pairs. Independently selecting a field and value would allow incompatible combinations.
- Exclude consequential controls before constructing criteria. Asking Jev not to choose them is weaker than not offering them.
- A Choice supports at most 255 options. If a snapshot or Cartesian product exceeds that, deterministically reduce it without silently losing required coverage, or stop with a candidate-budget reason rather than pretending the remaining shortlist is complete ([Choice](https://docs.typesafe.ai/primitives/choice.md)).
- Keep strings and quoted field values code-owned. Jev selects among them; it does not generate them.

`DONE` should mean only “the observed page appears to satisfy the goal.” Its result is a completion claim for the outer agent to verify, not proof that the research or external task is complete.

## 2. Speculative fan-out

Send the operation question and useful operation-specific target questions in one request. TypeSafe evaluates questions independently and in parallel, and its fan-out pattern recommends asking speculative branch questions up front and letting code ignore irrelevant answers afterward ([Speculative fan-out](https://docs.typesafe.ai/patterns/fan-out.md), [How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)).

For RLCD-brwsr:

1. Ask for `operation`, `click_target`, `type_text_pair`, and `select_pair` together when those candidate sets exist.
2. State each target head’s assumed operation explicitly because independent questions cannot see the operation answer.
3. Consume only the head matching the selected operation.
4. Ignore both the choice and uncertainty of unused speculative heads.
5. Make a new request only after browser execution produces a new observation or changes the candidate set.

Fan-out is a one-round-trip optimization, not unlimited free work. The fan-out page says additional questions typically add no latency and even uses “no speed cost,” while the Choice documentation more cautiously says response time changes little and that extra questions still consume tokens. Jev also has shared request-context limits ([Choice](https://docs.typesafe.ai/primitives/choice.md), [Models](https://docs.typesafe.ai/models.md)). RLCD-brwsr should therefore ask useful branch questions, not every imaginable question.

## 3. Response validation

The HTTP contract says that answers are keyed by the submitted question IDs, answer types match their questions, a Choice contains the highest-probability option, and its probability map contains every offered option with values summing to one ([API reference](https://docs.typesafe.ai/api.md)).

Before constructing any browser command, RLCD-brwsr should defensively validate:

- successful HTTP response and valid JSON;
- expected answer IDs with no missing required head;
- `type === "choice"` for each Choice question;
- `choice` belongs to that question’s exact offered candidate set;
- probability keys exactly match the offered options;
- every probability is finite and within `[0, 1]`;
- probabilities sum to one within a documented floating-point tolerance;
- `choice` is an argmax of the returned distribution;
- `confidence` is finite and within `[0, 1]`;
- the consumed target belongs to the selected operation’s candidate set;
- the selected UID is still present in the decision snapshot;
- the returned model is recorded and checked against the configured pin.

Only after these checks should code map the candidate to a fixed Chrome CLI invocation. Even a schema-valid response can be semantically wrong; TypeSafe’s documented model limitations make typed output an interface guarantee, not a correctness guarantee.

The API recommends exponential backoff for `429` and `529` responses ([API reference](https://docs.typesafe.ai/api.md)). Retrying a pre-action inference request can be safe within the loop budget, but an uncertain browser mutation must never be retried merely because a later TypeSafe request succeeds.

## 4. Uncertainty policy

For Choice answers, `confidence` summarizes how concentrated the full probability distribution is: one strong peak gives high confidence, while a flatter distribution gives low confidence. It is not a separate factual verification signal ([Confidence](https://docs.typesafe.ai/confidence.md)).

Apply that to RLCD-brwsr as follows:

- Require the operation answer and the consumed target answer to pass calibrated thresholds.
- Ignore confidence from unused speculative target heads.
- Stop without mutation when a consumed answer is malformed or below policy.
- Treat low confidence as a reason to return control, gather more evidence, or request outer-agent recovery.
- Keep separate policies for harmless navigation, text entry, and `DONE`; confidence never authorizes a consequential action.
- Return a high-confidence `DONE` as a completion claim requiring independent verification.
- Inspect the full distribution during evaluation because ambiguity between two plausible controls can be more informative than the selected option alone.

TypeSafe explicitly says thresholds depend on the domain, consequences, and measured performance on the application’s own data ([Confidence](https://docs.typesafe.ai/confidence.md)). Cookbook thresholds must therefore not be copied into RLCD-brwsr. Calibrate against browser fixtures, including ambiguous labels, stale candidates, unchanged-state loops, and adversarial page text.

## 5. Model limitations and mitigations

The Jev 1.13 limitations are directly relevant to browser control ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)):

| Limitation                                                        | RLCD-brwsr response                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Literal interpretation                                            | Write exact conditions and boundary cases; avoid implied permission or scope.                           |
| Indirection reduces accuracy                                      | Point directly to named state fields and state every speculative premise.                               |
| Irrelevant large state hurts accuracy                             | Bound and filter accessibility text; retain research evidence separately from classifier state.         |
| Adversarial content can steer answers                             | Treat page text as untrusted data; never let it create candidates or override policy.                   |
| Contradictory instructions and criteria confuse the model         | Generate both from one code-owned policy representation and test them together.                         |
| Counting, arithmetic, dates, and numeric precision are unreliable | Keep budgets, loop detection, elapsed time, probability checks, and all arithmetic in code.             |
| Structural identities are not guaranteed across questions         | Do not expect independently phrased or negated questions to be complements; enforce invariants in code. |
| Jev is not a text-generation model                                | Supply complete candidate values and use Choice rather than asking it to write text.                    |

Jev is text-only and currently documents a 64k-token request limit plus a 32k limit for state combined with the longest question ([Models](https://docs.typesafe.ai/models.md)). RLCD-brwsr’s own smaller state and evidence bounds remain necessary. Its observed fast-loop state-budget stop demonstrates that page snapshots must be compacted before classification; it does not establish anything about research completeness.

No model confidence can solve stale DOM state, concurrent page modification, uncertain executor outcomes, or hidden consequences of a control. Freshness checks, deterministic execution, mutation-stop rules, permission handling, and outer verification remain code and outer-agent responsibilities.

## Documentation gaps and discrepancies

- The official docs specify the response schema but do not prescribe the strict client-side invariant validation needed before browser execution. The validation checklist above is RLCD-brwsr hardening built on the documented contract.
- The fan-out page’s “no speed cost” wording is stronger than the Choice page’s qualified statement that latency changes little and tokens still increase. Treat fan-out as cheaper than serial calls, not free.
- The API reference describes Choice criterion values as `string | null`, while the Choice and building guides say instructions and criteria may also use objects or arrays. For the raw-HTTP v0.1 integration, simple string criteria avoid this unresolved schema inconsistency.
- The Models page names the canonical version `jev-1.13.0`, while the jaggedness page uses `jev-1.13` in prose and an SDK example. RLCD-brwsr should use the canonical `jev-1.13.0`.
- The Models page says the response reports the resolved versioned model, while API examples show `jev-latest` in responses. Log the field and verify real behavior during the explicitly approved integration test before relying on strict alias-resolution semantics.
- TypeSafe documents no browser-specific safety guarantee. In fact, it explicitly warns that adversarial state can move Jev’s answer. Consequential-action exclusion and independent completion verification must remain RLCD-brwsr policies.
