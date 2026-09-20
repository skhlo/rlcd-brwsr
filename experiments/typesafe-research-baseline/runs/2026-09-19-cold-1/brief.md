# Research brief: using TypeSafe for RLCD-brwsr

## Recommendation

Use Jev as a **bounded classifier**, not as a browser agent. At each observation, RLCD-brwsr should send one structured state and several independent `Choice` questions to TypeSafe. Code must own candidate construction, validation, uncertainty policy, command construction, side effects, and stopping.

Call `POST https://api.typesafe.ai/v1/systemone` with built-in `fetch` and pin `model: "jev-1.13.0"`. TypeSafe accepts versioned IDs even when model listing returns aliases, and warns that moving aliases can change answers and invalidate tuned thresholds ([Models](https://docs.typesafe.ai/models.md), [API reference](https://docs.typesafe.ai/api.md)).

## 1. Question design

### State

Use a compact JSON object such as:

```json
{
  "goal": "Search for \"Jev System One browser execution\".",
  "page": {
    "url": "https://example.test/docs",
    "title": "Documentation",
    "accessibility_text": "..."
  },
  "recent_actions": ["CLICK c3"],
  "retained_sources": [
    {"url": "...", "title": "...", "excerpt": "..."}
  ],
  "candidates": {
    "operations": ["CLICK", "TYPE_TEXT", "PAGE_DOWN", "DONE", "BLOCKED"],
    "clicks": [
      {"id": "c3", "uid": "17", "role": "link", "name": "API reference"}
    ],
    "text_pairs": [
      {"id": "t1", "uid": "22", "field": "Search", "value": "Jev System One browser execution"}
    ]
  }
}
```

TypeSafe recommends structured state with descriptive fields and explicit references to relevant paths. All questions in a request see the same state and are evaluated independently ([State](https://docs.typesafe.ai/concepts/state.md), [Primitives](https://docs.typesafe.ai/primitives.md)). Keep excerpts and history bounded: Jev’s accuracy falls when state contains large amounts of irrelevant detail ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).

### Questions

Use one narrow `Choice` per decision:

1. **Operation:** currently available operations plus `DONE` and `BLOCKED`.
2. **Click target:** complete code-owned click candidates.
3. **Text action:** complete `(field, supplied value)` pairs.
4. **Select action:** complete `(field, observed option)` pairs.

A Choice is appropriate because each answer must be one member of a fixed set and returns the selected option, the full distribution, and confidence ([Choice](https://docs.typesafe.ai/primitives/choice.md)). Questions should each represent one fast, focused judgment; broad reasoning should be decomposed and recombined in code ([Primitives](https://docs.typesafe.ai/primitives.md), [How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)).

Each target instruction must state its assumption explicitly, for example:

> Assuming `CLICK` is the selected operation, which offered click candidate best advances `goal` from the current `page`?

One question’s answer is not context for another, so the click head cannot implicitly know that the operation head chose `CLICK` ([Primitives](https://docs.typesafe.ai/primitives.md)).

Criteria should distinguish boundaries:

- `DONE`: the observed page itself visibly satisfies the goal.
- `BLOCKED`: no offered, permitted operation can advance the goal.
- `CLICK`: an offered low-consequence control advances the goal.
- `TYPE_TEXT`: one offered complete pair uses an exact supplied value.
- `NO_MATCH`: no offered target fits the assumed operation.

TypeSafe recommends `other` or `none of the above` when the offered list might not cover the input ([Choice](https://docs.typesafe.ai/primitives/choice.md)). For RLCD-brwsr, a code-owned `NO_MATCH` sentinel prevents a target head from being forced to select an unsuitable UID. If it wins for the selected operation, stop without mutation; for text, return `needs_text` where appropriate.

Question IDs are only response correlation keys and are not shown to the model; instructions must therefore contain the complete question. Option keys and descriptions *are* model input, so candidate descriptions should include role, accessible name, and relevant context, while the returned key remains an opaque code-owned ID ([Choice](https://docs.typesafe.ai/primitives/choice.md)).

Jev must never generate selectors, coordinates, URLs, JavaScript, commands, or text values. Jev 1.13 is not trained for generation; TypeSafe recommends producing candidates in code and using Choice to select among them ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).

## 2. Speculative fan-out

Send the operation and all currently constructible target questions in **one request per observed state**. TypeSafe recommends asking speculative questions together, then letting code ignore answers irrelevant to the selected path. Questions run independently and in parallel ([Speculative fan-out](https://docs.typesafe.ai/patterns/fan-out.md)).

For RLCD-brwsr:

```text
snapshot
  -> construct operation, click, text-pair and select-pair choices
  -> one TypeSafe request
  -> validate every returned head
  -> read operation
  -> consume only its compatible target head
  -> construct one fixed browser command
```

Do not attempt to reconcile unused heads. A speculative click answer is irrelevant when the operation is `PAGE_DOWN`; disagreement between independently evaluated heads is not itself an instruction to act. If the selected operation requires a target and its matching head is absent, uncertain, or returns `NO_MATCH`, stop.

A second TypeSafe call is justified only after execution creates a new snapshot and therefore a new state or candidate set. TypeSafe says serial requests are needed when a later question cannot be built until an earlier result exists; that does not apply here because all compatible candidates can be derived from the current snapshot ([Primitives](https://docs.typesafe.ai/primitives.md)).

Fan-out is not free:

- Additional questions consume tokens even though they usually add little latency ([Choice](https://docs.typesafe.ai/primitives/choice.md)).
- A Choice supports at most 255 options ([Choice](https://docs.typesafe.ai/primitives/choice.md)).
- If a browser snapshot yields more candidates, RLCD-brwsr needs a deterministic, reported bounding policy or must stop; it should not silently discard arbitrary controls and then treat `BLOCKED` as reliable.

## 3. Response validation

The HTTP API documents one answer per requested question, keyed by the supplied ID. A Choice answer contains `type`, `choice`, `probabilities`, and `confidence`; probabilities cover every option and sum to one, while `choice` is the highest-probability option ([API reference](https://docs.typesafe.ai/api.md)).

Before any browser mutation, validate:

1. HTTP success and parseable JSON.
2. Top-level `model`, `answers`, and `usage` shapes.
3. Returned `model === "jev-1.13.0"`.
4. Exactly one answer for every requested question and no unexpected IDs.
5. Every answer has `type === "choice"`.
6. `choice` is one of that question’s offered keys.
7. Probability keys exactly equal the offered keys.
8. Every probability is finite and within `[0, 1]`.
9. Probabilities sum to one within a documented floating-point tolerance.
10. The chosen option is not below the maximum probability beyond that tolerance; ties require an explicit policy.
11. `confidence` is finite and within `[0, 1]`.
12. Usage fields are non-negative integers.
13. The selected target still belongs to the candidate table from the decision snapshot.

Reject the whole decision before constructing a command if any check fails—even if the malformed answer belongs to a speculative head. Do not recompute confidence: TypeSafe says it is derived from the probability distribution but does not publish the formula ([Confidence](https://docs.typesafe.ai/confidence.md)).

Map validated IDs through exhaustive code switches to fixed Chrome DevTools argument arrays. Never interpolate model-provided prose into a shell command.

The API documents `401` and `422` as request failures, and recommends exponential backoff for `429` and `529` ([API reference](https://docs.typesafe.ai/api.md)). Because RLCD-brwsr uses raw `fetch`, it must implement bounded backoff itself. A TypeSafe classification request may be retried before browser execution, subject to the wall-clock budget; a browser mutation whose outcome is uncertain must not be retried.

Validation against the decision snapshot cannot make observation and execution atomic. A surviving UID can change meaning between classification and execution, so stale-target rejection and uncertain executor outcomes must still stop the fast loop.

## 4. Uncertainty policy

For Choice answers, `confidence` summarizes how concentrated the returned distribution is; it is distinct from the selected option’s probability. TypeSafe recommends high-confidence automatic action, cautious handling at medium confidence, and escalation or clarification at low confidence, with thresholds chosen according to consequence and tested on application data ([Confidence](https://docs.typesafe.ai/confidence.md), [Confidence-gated routing](https://docs.typesafe.ai/patterns/confidence-routing.md)).

RLCD-brwsr should therefore gate **every answer needed for execution**:

- Gate the operation head.
- For `CLICK`, `TYPE_TEXT`, or `SELECT`, independently gate the matching target head.
- Optionally evaluate the selected probability and runner-up margin in addition to TypeSafe confidence, since the full distribution is available.
- Calibrate thresholds on version-pinned RLCD-brwsr fixtures; do not copy documentation example values.
- Stop without mutation on low confidence, malformed output, `NO_MATCH`, or inconsistent selected-operation/target combinations.
- Preserve distributions in the trace for later evaluation.

Confidence must not authorize consequential actions. Such candidates remain excluded in code regardless of score. Likewise, high confidence does not make a browser target safe or eliminate page races.

`DONE` needs especially conservative treatment. It is only a completion claim based on observed text. Return the evidence and stop the loop, but require the outer agent to verify the requested outcome independently.

## 5. Model limitations and browser implications

Jev 1.13’s documented limits map directly onto RLCD-brwsr:

- **Text only:** no image, audio, or video input. The classifier can use bounded accessibility text and structured metadata, but not the final screenshot itself ([Models](https://docs.typesafe.ai/models.md)).
- **Literal interpretation:** write exact conditions and boundary cases for `DONE`, `BLOCKED`, and each operation. Do not expect Jev to infer intended browser policy ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).
- **Indirection:** avoid instructions with multiple logical hops. Name relevant state fields directly.
- **Math, counting, and dates:** retain budgets, loop counts, elapsed time, arithmetic, and date comparison in TypeScript.
- **Large or irrelevant state:** aggressively bound accessibility text, source excerpts, history, and candidate descriptions.
- **Adversarial content:** Jev does not treat state as hostile by default; page text designed to steer classification can alter the result. Explicit criteria and adversarial fixtures reduce risk but provide no guarantee ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).
- **No cross-question invariants:** separate questions and their negations need not obey arithmetic identities. Do not infer consistency between operation and target distributions; enforce application invariants in code.
- **No generation:** continue extracting exact quoted strings in code and offer complete pairs.
- **Language:** English is the primary training language; other languages are accepted with lower documented accuracy and require separate testing ([Models](https://docs.typesafe.ai/models.md)).
- **Version sensitivity:** pin `jev-1.13.0`, record the returned model, and recalibrate before upgrading an alias or version ([Models](https://docs.typesafe.ai/models.md)).

## Documentation gaps and unresolved discrepancies

1. **Token limits conflict.** The Primitives page says the shared request budget is “around 32,000 tokens,” while Models specifies a 64k total budget plus a separate 32k limit for `state` plus the longest question ([Primitives](https://docs.typesafe.ai/primitives.md), [Models](https://docs.typesafe.ai/models.md)). Use a conservative budget pending clarification.

2. **Structured Choice criteria conflict.** The HTTP API describes Choice criteria values as `string | null`, but the Advanced page says they may also be objects or arrays ([API reference](https://docs.typesafe.ai/api.md), [Advanced: structure](https://docs.typesafe.ai/primitives/advanced.md)). For a raw-HTTP v0.1 integration, plain strings are the least ambiguous choice unless structured criteria are verified in integration tests.

3. **No normative client validator is documented.** The API specifies response fields but not unknown-field policy, floating-point tolerance, tie handling, or how to verify consistency between `confidence` and probabilities. RLCD-brwsr must define and test these rules itself.

4. **No universal threshold is documented.** Confidence examples are illustrative; TypeSafe explicitly delegates threshold selection to the application and its data. RLCD-brwsr’s thresholds remain an empirical design decision.

5. **Fan-out latency wording is qualitative.** The docs variously say extra questions have “no speed cost,” “typically” add no latency, or “barely” change response time, while acknowledging token cost ([Speculative fan-out](https://docs.typesafe.ai/patterns/fan-out.md), [Choice](https://docs.typesafe.ai/primitives/choice.md)). Treat batching as an architectural recommendation, not a latency guarantee.

6. **Browser safety is outside TypeSafe’s contract.** The documentation does not address authorization, stale DOM identities, concurrent page mutation, consequential-action recognition, or independent verification of browser completion. Those remain responsibilities of RLCD-brwsr, Chrome DevTools, and the outer agent.
