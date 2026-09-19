# Research brief: using TypeSafe for RLCD-brwsr

## Recommendation

Use Jev as a narrow classifier inside the existing code-owned browser workflow:

1. TypeScript builds a bounded textual state and closed candidate sets.
2. Jev selects among those candidates.
3. TypeScript validates the complete response and applies uncertainty policy.
4. Chrome DevTools executes one fixed command.
5. The outer agent independently verifies any completion claim.

This matches TypeSafe’s recommended architecture: deterministic control flow and side effects remain in code, while System One answers narrow, structured questions over unstructured data ([How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)).

Call `POST https://api.typesafe.ai/v1/systemone` with built-in `fetch`, authorization, JSON content type, and `model: "jev-1.13.0"` ([API reference](https://docs.typesafe.ai/api.md)). Pinning is appropriate because aliases move; TypeSafe specifically recommends a versioned ID when thresholds have been tuned for that version ([Models](https://docs.typesafe.ai/models.md)).

## 1. Question design

### State

Use a structured object rather than one flattened prompt:

```ts
{
  goal: "...",
  page: {
    url: "...",
    title: "...",
    accessibility_excerpt: "...",
    excerpt_truncated: "false"
  },
  recent_actions: [...],
  retained_sources: [
    { url: "...", title: "...", observed_excerpt: "..." }
  ],
  candidates: {
    operations: [...],
    clicks: [...],
    text_pairs: [...],
    select_pairs: [...]
  }
}
```

TypeSafe recommends descriptive structured state and says every question in one request sees the same state independently ([State](https://docs.typesafe.ai/concepts/state.md)). Keep only information relevant to the next decision: large amounts of unrelated state reduce Jev 1.13 accuracy, so bounded accessibility text, a compact action history, and a compact source inventory are preferable to an accumulating page dump ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).

The retained-source inventory should be presented as observations, not as evidence that research is complete. Mark truncation explicitly so `DONE` is not inferred from missing material.

### Closed Choice questions

A `Choice` is the correct primitive because RLCD-brwsr needs one value from a code-defined set. TypeSafe returns the selected option, every option’s probability, and confidence ([Choice](https://docs.typesafe.ai/primitives/choice.md)).

Build these dynamic questions:

- **`operation`**: only currently available operations, plus `DONE` and `BLOCKED`.
- **`click_target`**: observed, allowed click candidates.
- **`text_pair`**: complete `(field, quoted value)` candidates.
- **`select_pair`**: complete `(field, observed option)` candidates.

Use opaque, code-owned keys such as `click_17` or `text_pair_4`, with descriptions containing the observed role, label, and value. The model may return only the key; TypeScript resolves it through the immutable candidate map. Choice option keys and descriptions are both visible to the model, while question IDs are not, so the instructions—not names such as `click_target`—must state the full decision ([Choice](https://docs.typesafe.ai/primitives/choice.md)).

Suggested instructions:

- **Operation:** “Given the goal and this decision snapshot, select the single offered next disposition. `DONE` means the visible observed evidence directly satisfies the goal, subject to independent verification. `BLOCKED` means no offered low-consequence operation can advance it.”
- **Click target:** “Assume the next operation is `CLICK`. Select the offered low-consequence control that most directly advances the goal.”
- **Text pair:** “Assume the next operation is `TYPE_TEXT`. Select one complete offered field-and-value pair. Values must not be invented.”
- **Select pair:** “Assume the next operation is `SELECT`. Select one complete offered field-and-option pair.”

Descriptions should distinguish nearby choices and include boundary conditions. TypeSafe recommends explicit, atomic questions and contrastive criteria describing what belongs in an option and what does not ([How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)). Jev 1.13 reads instructions literally, so the exact meaning of `DONE`, `BLOCKED`, and each operation should be written rather than implied ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).

A code-owned, non-executable `NO_MATCH` target sentinel is worth considering because TypeSafe recommends `none of the above` when a Choice set might not contain a fitting answer ([Choice](https://docs.typesafe.ai/primitives/choice.md)). Selecting it must stop the loop, never construct a browser command.

Do not offer:

- selectors, coordinates, URLs, shell fragments, or JavaScript;
- text not quoted in the outer goal;
- stale controls;
- unsupported or recognized consequential controls.

A Choice supports at most 255 options, so RLCD-brwsr must deterministically bound large control lists before constructing the request ([Choice](https://docs.typesafe.ai/primitives/choice.md)).

## 2. Speculative fan-out

Send the operation and all applicable target heads in one request. TypeSafe recommends asking speculative questions together, then letting code use only the answers relevant to the selected branch ([Speculative fan-out](https://docs.typesafe.ai/patterns/fan-out.md)). Its function-calling example follows the analogous pattern of asking for a function and closed-set arguments together, then reading only the chosen function’s arguments ([Function calling](https://docs.typesafe.ai/cookbooks/function_calling.md)).

For RLCD-brwsr:

```text
operation == CLICK      -> consume click_target only
operation == TYPE_TEXT  -> consume text_pair only
operation == SELECT     -> consume select_pair only
operation == PAGE_*     -> consume no target answer
operation == WAIT       -> consume no target answer
operation == DONE       -> return a completion claim for outer verification
operation == BLOCKED    -> stop
```

Questions are independent; an operation answer is not hidden context for its target question ([How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)). Therefore every target instruction must explicitly say which operation it assumes. Complete pair choices prevent independently selected fields and values from disagreeing, but independence still means there is no guaranteed joint consistency between the operation head and target head.

Omit an operation and its head when no compatible candidates exist. Validate even speculative answers before accepting the response, although irrelevant valid answers are subsequently ignored.

Fan-out is not free in every sense: additional questions consume tokens, and all questions count toward the request context budget ([Choice](https://docs.typesafe.ai/primitives/choice.md), [Models](https://docs.typesafe.ai/models.md)).

## 3. Response validation

The documented response contains a versioned `model`, one answer under each submitted question ID, and token `usage`. A Choice answer contains `type`, `choice`, `probabilities`, and `confidence`; probabilities cover every offered option and sum to one ([API reference](https://docs.typesafe.ai/api.md)).

Before constructing any Chrome command, RLCD-brwsr should require:

1. A successful HTTP response and parseable JSON object.
2. `model === "jev-1.13.0"`.
3. Exactly the expected answer IDs, with no missing or unexpected answers.
4. `type === "choice"` for every submitted head.
5. `choice` equal to an offered key.
6. Probability keys exactly equal to the offered candidate keys.
7. Every probability finite and within `[0,1]`, summing to one within a small documented floating-point tolerance.
8. `choice` tied for or equal to the maximum returned probability.
9. `confidence` finite and within `[0,1]`.
10. Non-negative integer usage fields.
11. The selected executable candidate still belonging to the candidate map associated with the decision snapshot.

Immediately before execution, resolve the candidate through that snapshot’s immutable map and confirm that the UID is still the selected candidate. Pass fixed command arguments to `pi.exec`; never concatenate model output into a shell command. A missing or stale target, malformed response, or selected stop sentinel returns control to the outer agent without mutation.

The API documents `401` and `422` as authentication/configuration failures and recommends exponential backoff for `429` and `529` ([API reference](https://docs.typesafe.ai/api.md)). A bounded retry of the classification request can occur before any browser mutation, subject to the wall-clock budget. This must not become a retry of a browser mutation whose outcome is uncertain.

## 4. Uncertainty policy

For Choice answers, `probabilities[choice]` is the winning option’s probability, while `confidence` summarizes how concentrated the whole distribution is. A flat distribution produces low confidence; TypeSafe exposes the full distribution so applications may use another uncertainty measure where appropriate ([Confidence](https://docs.typesafe.ai/confidence.md)).

Apply uncertainty at both levels:

- Gate the operation answer.
- If the operation requires a target, separately gate that matching target answer.
- Stop if either required answer is uncertain.
- Treat `NO_MATCH`, `BLOCKED`, or an insufficiently certain `DONE` as a return to the outer agent.
- Never admit a consequential action merely because confidence is high.

A conservative aggregate for an executable compound decision is the minimum confidence among the operation and required target judgments. TypeSafe’s function-calling cookbook uses the least-certain judgment because one wrong argument can spoil the call, rather than multiplying values simply because there are several questions ([Function calling](https://docs.typesafe.ai/cookbooks/function_calling.md)). RLCD-brwsr should nevertheless calibrate operation-specific and target-specific thresholds on its own fixtures; TypeSafe says thresholds depend on domain, stakes, and observed performance ([Confidence](https://docs.typesafe.ai/confidence.md)).

Do not transfer thresholds between different primitive formulations or assume arithmetic consistency between independent questions. Jev 1.13 does not guarantee that equivalent Noul and Choice formulations—or a question and its negation—produce complementary values ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).

`DONE` remains only a completion claim. The outer agent must inspect retained sources, final page state, URLs, and executor evidence and independently verify the research outcome.

## 5. Model limitations relevant to RLCD-brwsr

- **Text only:** Jev accepts textual strings or structured textual state, not images, audio, or video. It cannot inspect the final screenshot; screenshots remain evidence for the outer agent ([Models](https://docs.typesafe.ai/models.md)).
- **Context bounds:** Jev 1.13 has a 64k-token request budget and a 32k budget for state plus the longest question. Bound and report truncation rather than silently overflowing or dropping earlier evidence ([Models](https://docs.typesafe.ai/models.md)).
- **Context rot:** Irrelevant detail lowers accuracy. Do not send an unbounded browser transcript or every retained page excerpt on every step ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).
- **Literalness and indirection:** Keep instructions direct, identify relevant state fields, and avoid double negatives or implicit browser semantics ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).
- **Numbers, counting, and dates:** Perform budgets, loop detection, elapsed-time checks, counts, date comparisons, and probability arithmetic in code ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).
- **Adversarial page content:** Jev 1.13 does not treat state as hostile by default, so page instructions can steer it. Structured boundaries and precise criteria help but are not a security guarantee. Code-owned candidates, excluded consequential controls, response validation, and fixed execution are essential ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).
- **No generation:** Jev is not trained to generate text. RLCD-brwsr’s quoted-value extraction and closed pair selection are the appropriate design; missing text should return `needs_text` to the outer agent ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).
- **Language:** English is the primary training language; non-English browser content requires workload-specific testing ([Models](https://docs.typesafe.ai/models.md)).
- **No atomic browser guarantee:** A valid enum and UID do not establish that the page remained unchanged between observation and execution. TypeSafe documentation does not address browser staleness or concurrent page ownership; RLCD-brwsr must enforce its own stop policy.

## Documentation gaps and discrepancies

1. The HTTP API page types Choice criteria values as `string | null`, while the advanced guide says Choice descriptions may also be objects or arrays ([API reference](https://docs.typesafe.ai/api.md), [Advanced: structure](https://docs.typesafe.ai/primitives/advanced.md)). For the direct-HTTP v0.1 integration, plain-string descriptions are the least ambiguous choice until this is clarified or contract-tested.
2. The state guide describes objects or arrays of text values but also shows numeric JSON fields, while the API reference simply permits an object or array ([State](https://docs.typesafe.ai/concepts/state.md), [API reference](https://docs.typesafe.ai/api.md)). Representing UIDs and browser metadata as strings avoids relying on the unclear boundary.
3. The fan-out page says extra questions have “no speed cost,” whereas the Choice page says they “barely” change response time and explicitly notes added token cost ([Speculative fan-out](https://docs.typesafe.ai/patterns/fan-out.md), [Choice](https://docs.typesafe.ai/primitives/choice.md)). Treat fan-out latency as an empirical property, not a guarantee.
4. The confidence documentation does not publish the exact confidence formula or prescribe production thresholds; it explicitly leaves alternative computations and thresholds to the application ([Confidence](https://docs.typesafe.ai/confidence.md)).
5. The documentation specifies structured response shapes but does not provide direct-HTTP guidance for defensive checks such as exact answer-key equality, probability tolerances, model-version mismatch, or stale browser candidates. Those remain RLCD-brwsr application requirements.
6. TypeSafe provides no browser-specific guarantee for consequential-action detection, resistance to page prompt injection, completion verification, or observation/execution atomicity. High confidence cannot fill those gaps.
