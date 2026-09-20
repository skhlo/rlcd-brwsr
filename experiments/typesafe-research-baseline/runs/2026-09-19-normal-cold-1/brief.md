# Research brief: using TypeSafe for RLCD-brwsr

## Recommendation

Use Jev as a bounded semantic selector, not as a browser agent:

- Code derives every allowed operation and candidate from the current Chrome accessibility snapshot.
- One TypeSafe request selects an operation and speculatively selects compatible targets.
- Code validates the entire response, consumes only the target corresponding to the selected operation, and constructs a fixed Chrome CLI invocation.
- Uncertain, malformed, stale, consequential, or unsupported decisions return control to the outer agent.
- `DONE` remains a **completion claim**, not proof that the research task is complete. The outer agent must independently inspect the retained evidence, cover all requested topics, and verify citations.

This follows TypeSafe’s intended architecture: deterministic control flow and side effects remain in code while System One handles narrow semantic judgments ([How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)).

## 1. Question design

### State

Represent each observation as a named object rather than one long prompt. TypeSafe recommends structured state when several related facts must be compared, and all questions in a request see the same state independently ([State](https://docs.typesafe.ai/concepts/state.md)).

For RLCD-brwsr, include only bounded, observed facts:

- goal, including exact quoted text values supplied by Pi;
- snapshot identity, current URL and title;
- bounded accessibility text from the current snapshot;
- recent action trace and unchanged-state indicators;
- compact retained-source inventory;
- currently allowed operation names;
- code-owned candidate IDs with observed role, accessible name, and relevant context;
- complete `(field, quoted value)` and `(field, option)` candidates.

Keep full retained research evidence outside the classifier state unless it is needed for the next browser decision. Jev’s documented accuracy declines when state contains irrelevant detail, so source excerpts useful to the eventual brief should not automatically become classifier context ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).

### Questions

Choice is the appropriate primitive because RLCD-brwsr needs one value from a code-defined set. Choice returns the selected option, its full probability distribution, and confidence ([Choice](https://docs.typesafe.ai/primitives/choice.md)).

Ask these heads:

1. **Operation Choice** over only operations currently available, plus `DONE` and `BLOCKED`.
2. **Click-target Choice** over current low-consequence click candidates.
3. **Type-pair Choice** over complete `(field, quoted value)` candidates.
4. **Select-pair Choice** over complete `(field, observed option)` candidates.

Each target instruction must state its premise explicitly, for example: “Assuming the operation is `CLICK`, which candidate best advances the goal?” Questions are independent, and question IDs are not sent to the model, so an ID such as `click_target` cannot carry that meaning by itself ([Primitives](https://docs.typesafe.ai/primitives.md)).

Use contrastive criteria:

- `DONE`: the currently observed page directly supports a claim that the browser portion of the goal is satisfied; it does not mean the final brief has been written or verified.
- `BLOCKED`: no offered non-consequential action can advance the goal, required exact text is unavailable, or continuing requires returning control.
- `CLICK`: one offered low-consequence control should be activated.
- `TYPE_TEXT`: one offered complete field/value pair should be applied.
- `SELECT`: one offered complete field/option pair should be applied.

For target criteria, describe what each candidate is and what distinguishes it from neighboring candidates. TypeSafe recommends explicit, narrow questions and contrastive option descriptions ([How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)). Composite pair candidates are preferable to independently selecting a field and a value because independent questions are not guaranteed to agree.

The initial implementation should use clear string criteria. Although TypeSafe’s advanced guide says Choice descriptions may also be objects or arrays ([Advanced structure](https://docs.typesafe.ai/primitives/advanced.md)), the HTTP API reference currently documents Choice values only as `string | null` ([HTTP API](https://docs.typesafe.ai/api.md)); this discrepancy is unresolved below.

## 2. Speculative fan-out

Send the operation and all non-empty compatible target heads in one request. TypeSafe evaluates questions independently and in parallel, and specifically recommends asking branch-specific questions speculatively and ignoring answers from unused branches ([Speculative fan-out](https://docs.typesafe.ai/patterns/fan-out.md)).

For RLCD-brwsr:

- If the operation is `CLICK`, consume only `click_target`.
- If it is `TYPE_TEXT`, consume only `type_pair`.
- If it is `SELECT`, consume only `select_pair`.
- `PAGE_UP`, `PAGE_DOWN`, `WAIT`, `DONE`, and `BLOCKED` need no target.
- Do not reject a usable selected branch merely because an unused branch has low confidence. Do structurally validate every returned branch before allowing any mutation.

A second TypeSafe request is justified only after an action produces a new observation or when code cannot construct the next options without an earlier result. Serially asking for the operation and then its target would add a round trip and give the page more time to diverge from the decision snapshot.

Fan-out is not literally free. Extra questions consume tokens and share request limits even though the documentation says they usually add little latency ([Primitives](https://docs.typesafe.ai/primitives.md)). Candidate inventories should therefore remain bounded. Choice also has a documented maximum of 255 options ([Choice](https://docs.typesafe.ai/primitives/choice.md)); if deterministic filtering cannot produce a valid bounded set, return control rather than silently omitting plausible candidates and forcing a bad choice.

## 3. Response validation

The API contract is `POST https://api.typesafe.ai/v1/systemone`, returning `model`, an answer under each requested question ID, and usage data ([HTTP API](https://docs.typesafe.ai/api.md)). Despite TypeSafe describing outputs as typed and constrained, RLCD-brwsr should treat the HTTP response as untrusted input.

Before constructing any Chrome command, validate:

1. HTTP success and parseable JSON.
2. Top-level `model`, `answers`, and `usage` shapes.
3. The returned model against the pinned expected version.
4. Exactly the expected question IDs and matching answer type.
5. For every Choice:
   - `choice` is an offered key;
   - probability keys exactly match the offered set;
   - every probability is finite and within `[0,1]`;
   - probabilities sum to one within a locally defined floating-point tolerance;
   - `choice` is a highest-probability option;
   - `confidence` is finite and within `[0,1]`.
6. The active operation and target are compatible.
7. The candidate still maps to the immutable decision snapshot.
8. The resulting command uses only a fixed code-owned command template.

The API documents Choice as returning every offered option, probabilities summing to one, and the highest-probability option as `choice` ([HTTP API](https://docs.typesafe.ai/api.md)). It does not prescribe client-side handling for missing keys, extra keys, ties, or floating-point tolerance, so RLCD-brwsr must define and test those rules.

The API recommends exponential-backoff retries for `429` and `529`; `401` and `422` indicate authentication or request problems ([HTTP API](https://docs.typesafe.ai/api.md)). In this browser loop, a delayed classification must not be executed against an assumed-fresh page. A bounded service retry may occur before any mutation, but the safer post-delay path is to re-observe and classify again. An uncertain browser mutation must never be retried.

## 4. Uncertainty policy

For Choice, `confidence` summarizes how concentrated the returned probability distribution is. A flatter distribution means the options are harder to distinguish; the full probabilities remain available if RLCD-brwsr needs a different statistic ([Confidence](https://docs.typesafe.ai/confidence.md)).

Use separate calibrated gates for:

- operation selection;
- the selected operation’s target head;
- `DONE`;
- mutations versus non-mutating choices such as `WAIT`.

Both the operation and active target must pass their applicable policy. Thresholds must be measured on RLCD-brwsr fixtures with the pinned model, representative candidate-set sizes, stale controls, duplicate-looking controls, missing values, and adversarial page text. TypeSafe explicitly says thresholds depend on the domain and consequences and should be tested on the application’s own data ([Confidence](https://docs.typesafe.ai/confidence.md)).

Confidence is not correctness, authorization, safety, or completion. TypeSafe states that calibration is measured across groups and does not guarantee an individual answer ([System One](https://docs.typesafe.ai/concepts/system-one.md)). Therefore:

- High confidence cannot authorize a consequential action.
- High confidence cannot establish that a UID is fresh.
- High confidence in `DONE` produces only a completion claim.
- Several equally acceptable controls may spread probability without implying that all are unsafe; deduplicate equivalent candidates where code can do so.
- `BLOCKED` and no-match criteria are necessary because a Choice otherwise selects the best offered option even when the candidate set is incomplete.

An additional completion Noul could be tested, but it must not be assumed to agree arithmetically with `DONE` in the operation Choice. Jev 1.13 does not guarantee structural consistency between differently phrased or differently typed questions ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).

## 5. Model limitations and consequences for RLCD-brwsr

Pin `jev-1.13.0`; do not use the moving `jev-latest` alias after calibrating thresholds. The Models page currently maps both public aliases to `jev-1.13.0` but warns that aliases move and answers can change ([Models](https://docs.typesafe.ai/models.md)).

Relevant limitations are:

- **Text only.** Jev does not inspect screenshots, images, audio, or video. RLCD-brwsr must classify the bounded accessibility representation and stop when the decision depends on visual-only evidence ([System One](https://docs.typesafe.ai/concepts/system-one.md)).
- **No generation or reasoning explanation.** It should not generate text, selectors, URLs, JavaScript, or commands. Pi supplies exact values; code owns execution ([System One](https://docs.typesafe.ai/concepts/system-one.md)).
- **Literal and weak at indirection.** Instructions must state exact premises and boundary cases and point directly to relevant named state fields ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).
- **Weak at counting, arithmetic, and dates.** Step budgets, elapsed time, loop detection, candidate counts, URL checks, deduplication, and date comparisons belong in code ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).
- **Context rot.** Large irrelevant snapshots reduce accuracy. Bound and filter state rather than relying only on the maximum context window ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).
- **Adversarial content.** Jev does not treat state as hostile by default; injected page instructions can move its answer. Explicit criteria and adversarial tests help but do not turn it into a security boundary ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).
- **Language variation.** English is the primary training language; other languages are accepted with lower documented accuracy and require separate evaluation ([Models](https://docs.typesafe.ai/models.md)).
- **Independent-head inconsistency.** Operation and target answers may not obey imagined cross-question invariants. Code must consume only the selected branch and enforce compatibility itself ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)).

## Documentation gaps and discrepancies

1. **Token limits conflict.** The current Models page states a 64k per-request budget, with a 32k limit for state plus the longest question ([Models](https://docs.typesafe.ai/models.md)). The Primitives page instead describes an approximately 32k budget shared by state and all questions ([Primitives](https://docs.typesafe.ai/primitives.md)). RLCD-brwsr should stay well below both until the service contract is clarified.
2. **Structured Choice criteria conflict.** Advanced documentation permits object and array descriptions, while the HTTP API reference documents Choice values as `string | null`. Plain strings are the conservative v0.1 choice.
3. **Returned model identity is ambiguous.** The Models page says the response reports the versioned model ID, while API examples show `"model": "jev-latest"`. Because no API call was made to resolve this, implementation fixtures should establish the real response before enforcing an exact production check.
4. **Confidence formula is unpublished.** The Confidence page says its exact computation and alternatives will be covered separately. RLCD-brwsr therefore cannot independently reconstruct or interpret it beyond distribution concentration.
5. **Validation details are unspecified.** The API does not define probability tolerance, tie handling, extra response fields, or a detailed error-body schema. These must be local, tested policy.
6. **No browser-safety guarantee exists.** TypeSafe documents adversarial susceptibility and individual prediction error. Nothing in the official documentation makes a confident classification proof of a control’s effect, page freshness, permission, research completeness, or successful completion.
