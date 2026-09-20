# TypeSafe design brief for RLCD-brwsr

## Evidence status

The fast loop stopped with `classifier_state_budget` before making a completion claim. It retained only a truncated excerpt of TypeSafe’s “How to build” page, so that evidence did not cover the research task.

The findings below were independently checked against the linked official Markdown documentation. Each cited URL returned successfully and its relevant text was inspected directly.

## Recommended design

RLCD-brwsr should use Jev only for narrow semantic selection. TypeScript should continue to own candidate construction, validation, browser commands, budgets, authorization, and verification. This follows TypeSafe’s core recommendation: keep deterministic rules and side effects in code, and use System One for constrained judgments over unstructured state ([How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)).

### 1. Question design

Build one compact structured state from the latest browser snapshot:

```text
goal
page: URL, title, bounded accessibility text
recent actions
retained source inventory
offered operations
click candidates
(field, exact text) candidates
(field, option) candidates
```

Structured state is appropriate when identities and relationships matter, and questions should explicitly reference relevant fields rather than relying on implicit context ([State](https://docs.typesafe.ai/concepts/state.md), [Primitives](https://docs.typesafe.ai/primitives.md)).

Use `Choice` because each answer must select one member of a code-owned set. A Choice returns the selected option, the complete probability distribution, and confidence ([Choice](https://docs.typesafe.ai/primitives/choice.md)).

Recommended heads:

- **Operation:** choose among only the operations currently available, plus `DONE` and `BLOCKED`.
- **Click target:** assuming `CLICK`, choose one opaque candidate ID representing an observed UID.
- **Text target:** assuming `TYPE_TEXT`, choose one opaque ID representing a complete `(field UID, exact quoted value)` pair.
- **Select target:** assuming `SELECT`, choose one opaque ID representing a complete `(field UID, offered option)` pair.

Each instruction must be complete because question IDs are not shown to the model. Define criteria contrastively: what each option means, when it applies, and what belongs elsewhere. TypeSafe recommends narrow, explicit questions and structured criteria where boundaries need clarification ([Primitives](https://docs.typesafe.ai/primitives.md), [How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)).

For example, the operation instruction should define:

- `DONE`: the currently observed page evidence satisfies every clause of the goal.
- `BLOCKED`: no offered, allowed operation can advance the goal.
- `CLICK`, `TYPE_TEXT`, and `SELECT`: semantic descriptions of when that operation is appropriate.
- Scrolling and waiting: exact circumstances that distinguish them.

Target criteria should expose useful browser semantics—role, accessible name, nearby context—but keep the option key an opaque code-owned ID. Include a `NO_MATCH` choice where candidate coverage may be incomplete; TypeSafe recommends `other` or `none of the above` when the supplied set might not contain a fit ([Choice](https://docs.typesafe.ai/primitives/choice.md)).

### 2. Speculative fan-out

Send the operation and compatible target questions in one TypeSafe request. Questions sharing a request see the same state, run independently, and cannot see one another’s answers. TypeSafe recommends asking speculative branch-specific questions up front and letting code ignore unused answers ([Speculative fan-out](https://docs.typesafe.ai/patterns/fan-out.md), [Primitives](https://docs.typesafe.ai/primitives.md)).

For RLCD-brwsr this means:

1. Ask the operation head and all non-empty target heads together.
2. State each target premise explicitly: “Assuming the next operation is `CLICK`…”.
3. Read only the target head corresponding to the chosen operation.
4. Never try to reconcile or execute answers from unused heads.
5. Use another request only after browser execution produces genuinely new state or new candidates.

Complete pair choices for text and select operations are important: independently choosing a field and a value would create a relationship that TypeSafe did not judge. Questions are independent, so the model cannot make one answer conditional on another within the same request.

Fan-out is not free. The docs say parallel questions typically add little latency, but they still consume question tokens and share the request context budget. Measure the actual candidate sizes and latency on RLCD-brwsr fixtures rather than treating the pattern as a performance guarantee.

### 3. Response validation

The HTTP API specifies one answer under each submitted question ID. Choice answers contain `type`, `choice`, `probabilities`, and `confidence`; probabilities cover every option and sum to one, while `choice` is the highest-probability option ([API reference](https://docs.typesafe.ai/api.md)).

Before constructing any Chrome command, RLCD-brwsr should strictly validate:

- successful HTTP status and valid JSON;
- expected versioned `model`;
- exactly the expected answer IDs and matching answer types;
- selected choice belonging to the offered option set;
- probability keys exactly matching that set;
- finite probabilities in `[0,1]`, summing to one within a documented tolerance;
- finite confidence in `[0,1]`;
- selected choice being a maximum-probability option;
- selected target head matching the selected operation;
- opaque target ID resolving through the current code-owned candidate map;
- selected UID still belonging to the decision snapshot.

Only after these checks should code map an opaque ID to a fixed executor invocation. Jev must never provide selectors, coordinates, URLs, JavaScript, shell fragments, or generated field text.

The API documents `401` and `422` as request failures and recommends exponential backoff for `429` and `529` responses ([API reference](https://docs.typesafe.ai/api.md)). Any classifier retry must remain inside the wall-clock budget and occur before browser mutation. It does not justify retrying a browser mutation whose outcome is uncertain.

TypeSafe describes outputs as constrained and typed, but this does not remove the need for boundary validation in a direct-HTTP integration. Typed shape is not proof of semantic correctness, current-page freshness, permission, or successful browser execution.

### 4. Uncertainty policy

For Choice answers, confidence summarizes how concentrated the returned distribution is. A flatter distribution means the options are ambiguous; it is not a probability that the whole workflow is correct. Thresholds should vary with consequences and be tested on the application’s own data ([Confidence](https://docs.typesafe.ai/confidence.md)).

RLCD-brwsr should therefore:

- calibrate separate operation and target thresholds on browser fixtures;
- require acceptable uncertainty for the operation and the consumed target head;
- ignore uncertainty on speculative heads that code does not use;
- stop without mutation when a consumed answer falls below policy;
- return ambiguous cases to the outer agent;
- never let high confidence authorize an excluded consequential action;
- treat `DONE` only as a completion claim requiring independent verification.

Several harmless actions can all be reasonable, so spread probability does not necessarily mean the model misunderstood the page. Conversely, high confidence can still be confidently wrong. Calibration should evaluate resulting browser behavior, not confidence alone.

Pin `jev-1.13.0`: official aliases move when a release changes, and the docs specifically advise pinning when thresholds were tuned against a version. The response’s `model` field can be logged to verify which version answered ([Models](https://docs.typesafe.ai/models.md)).

### 5. Model limitations and RLCD-brwsr implications

The Jev 1.13 limitations page identifies literal interpretation, numerical weakness, indirection, irrelevant context, adversarial content, contradictory criteria, non-guaranteed structural invariants, and lack of text generation ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).

Concrete implications:

- **Literalness:** define `DONE`, `BLOCKED`, and every operation precisely; include boundary cases.
- **Math and counting:** keep step counts, budgets, probability checks, timestamps, and loop detection in TypeScript.
- **Indirection:** name relevant state paths directly and avoid multi-hop instructions.
- **Context rot:** retain evidence for the outer agent, but send Jev only the bounded material needed for the next decision.
- **Adversarial page content:** accessibility text is untrusted data and can steer Jev. Explicit criteria and tests reduce risk but do not create a security boundary.
- **Independent heads:** do not expect operation and target answers to be mutually consistent. Consume only the applicable head and validate it in code.
- **No generation:** keep text values, URLs, selectors, and command shapes code-owned.
- **Text-only input:** Jev 1.13 does not accept screenshots, images, audio, or video; RLCD-brwsr must base its judgments on textual snapshot data ([Models](https://docs.typesafe.ai/models.md)).
- **Language variation:** English is the strongest supported language; non-English browser tasks require separate evaluation ([Models](https://docs.typesafe.ai/models.md)).

## Documentation gaps and discrepancies

- The API defines the response schema but does not specify a direct-HTTP validation tolerance for probability sums or an RLCD-style policy for rejecting unexpected candidate keys. RLCD-brwsr must own those rules.
- The [Primitives page](https://docs.typesafe.ai/primitives.md) says the shared request budget is “around 32,000 tokens,” while the dedicated [Models page](https://docs.typesafe.ai/models.md) specifies 64k tokens across state and all questions, plus a 32k limit for state and the single longest question. Until clarified, RLCD-brwsr should stay below its own substantially smaller state bound rather than design near either limit.
- The fan-out documentation sometimes describes additional questions as having “no speed cost,” while other official passages say they “barely” change response time and still cost tokens. Treat low incremental latency as typical behavior, not an SLA.
- TypeSafe documentation does not define browser authorization, stale-target handling, consequential-action recognition, or independent completion verification. Those remain responsibilities of RLCD-brwsr’s deterministic code and the outer agent.
