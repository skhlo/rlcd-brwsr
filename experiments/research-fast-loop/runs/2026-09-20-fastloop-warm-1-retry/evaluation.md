## Checklist evaluation

| ID  | Result   | Evidence                                                                                                                                                                                                                                          |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QD1 | PASS     | The brief keeps control flow, deterministic rules, validation, arithmetic, and browser effects in code. Jev selects only code-created candidates.                                                                                                 |
| QD2 | PASS     | It specifies bounded structured state containing the goal, URL/title, accessibility text, recent actions, retained-source inventory, and indexed controls from the current snapshot.                                                              |
| QD3 | PASS     | It recommends narrow Choice questions, complete instructions independent of question IDs, contrastive criteria, and `BLOCKED`/`NO_MATCH` outcomes.                                                                                                |
| QD4 | PASS     | Operations and compatible targets/values are code-owned; target questions state their assumed operation; text and select candidates are complete pairs.                                                                                           |
| SF1 | PASS     | It batches operation and useful operation-specific target questions over one state and acknowledges that additional questions consume tokens.                                                                                                     |
| SF2 | PASS     | It consumes only the selected operation’s target head and explicitly ignores both answers and uncertainty from unused branches.                                                                                                                   |
| SF3 | PASS     | A later request is reserved for when browser execution produces a new observation or changes the candidate set, creating a genuine state/options dependency.                                                                                      |
| RV1 | **FAIL** | The local validation list covers IDs, types, offered choices, exact probability keys, finite ranges, sums, confidence, and model identity, but never validates the required `usage` object.                                                       |
| RV2 | PASS     | It verifies the operation and target against offered candidates and the UID against the decision snapshot, then maps only to fixed CLI invocations.                                                                                               |
| RV3 | PASS     | It stops before mutation for invalid results and forbids retrying a browser mutation with an uncertain outcome.                                                                                                                                   |
| UN1 | **FAIL** | Choice confidence is explained correctly and typed output is not treated as truth, but Score confidence and Noul’s lack of separate confidence are omitted.                                                                                       |
| UN2 | **FAIL** | Thresholds remain in code and are calibrated on RLCD-brwsr fixtures, and uncertain cases return to the outer agent. Consequential controls are excluded, but the brief does not explicitly route a consequential case back to Pi.                 |
| UN3 | PASS     | `DONE` is expressly a completion claim requiring independent outer-agent verification, not proof of task or research completeness.                                                                                                                |
| ML1 | PASS     | It recommends `jev-1.13.0` rather than a moving alias and accurately gives the 255-option, 64k-request, and 32k state-plus-longest-question limits.                                                                                               |
| ML2 | **FAIL** | It says Jev is text-only and not a text-generation model, but does not expressly cover explanations or assign research synthesis and difficult recovery to Pi.                                                                                    |
| ML3 | PASS     | It covers literal interpretation, indirection, irrelevant state, adversarial content, generation, contradictory guidance, and structural invariants; arithmetic and exact checks remain in code.                                                  |
| ML4 | **FAIL** | It discusses semantic errors and hidden consequences, but omits that calibration describes populations rather than guaranteeing one answer. It also does not explicitly state that a surviving UID or harmless label cannot prove action effects. |
| SC1 | PASS     | All material TypeSafe citations are official pages present in the current `llms.txt`.                                                                                                                                                             |
| SC2 | PASS     | All seven cited URLs returned HTTP 200 and supported their nearby claims. Current cross-page discrepancies are recorded below.                                                                                                                    |
| SC3 | PASS     | Question design, fan-out, validation, uncertainty, and limitations each receive substantive, actionable treatment despite the specific omissions above.                                                                                           |

## Citation audit

| Cited URL                                                         | Resolution | Nearby-claim support                                                                                                                              |
| ----------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md | HTTP 200   | Supports code-owned workflow, relevant structured state, narrow questions, contrastive criteria, and parallel questions.                          |
| https://docs.typesafe.ai/models.md                                | HTTP 200   | Supports `jev-1.13.0`, moving aliases, pinning, text-only input, and the 64k/32k limits.                                                          |
| https://docs.typesafe.ai/primitives/choice.md                     | HTTP 200   | Supports closed-set selection, probabilities/confidence, invisible question IDs, no-match options, 255 options, and token/latency qualifications. |
| https://docs.typesafe.ai/patterns/fan-out.md                      | HTTP 200   | Supports one-request speculative fan-out and ignoring irrelevant branches.                                                                        |
| https://docs.typesafe.ai/api.md                                   | HTTP 200   | Supports response IDs/types, Choice argmax, complete probability distributions, model/usage fields, and 429/529 backoff.                          |
| https://docs.typesafe.ai/confidence.md                            | HTTP 200   | Supports distribution-derived Choice/Score confidence, Noul’s lack of separate confidence, and domain-specific threshold calibration.             |
| https://docs.typesafe.ai/model-jaggedness/jev-1.13.md             | HTTP 200   | Supports the listed Jev 1.13 failure modes and keeping arithmetic and generation outside Jev.                                                     |

Targeted official cross-checks were also retrieved from the current index: [Score](https://docs.typesafe.ai/primitives/score.md), [Noul](https://docs.typesafe.ai/primitives/noul.md), [System One](https://docs.typesafe.ai/concepts/system-one.md), and the [AI primer](https://docs.typesafe.ai/introduction/machine-learning-primer.md). These establish the omitted UN1, ML2, and ML4 details.

## Unsupported, missing, or stale findings

### Unsupported

- The evidence-note assertions about the earlier fast-loop stop, retained excerpt, and prior retrieval process cannot be verified from the supplied artifacts. They were not treated as correctness evidence.

### Missing

- RV1: validation of response `usage`.
- UN1: Score confidence and Noul’s lack of separate confidence.
- UN2: explicit return to Pi when a consequential action is required.
- ML2: explicit inability to generate explanations and explicit Pi ownership of synthesis and difficult recovery.
- ML4: population-level calibration semantics and the explicit surviving-UID/harmless-label residual risk.

### Stale

- None observed.

## Source drift observed during evaluation

No citation-level drift was observed: every cited page remains in the current `llms.txt`, resolves, and retains the supporting material.

The live documentation still contains the discrepancies the brief identifies:

- Fan-out says extra questions typically add no latency and uses “no speed cost,” while Choice says latency changes only slightly and tokens still increase.
- The API reference types Choice criterion values as `string | null`, while Choice guidance permits structured objects and arrays.
- Models says responses report the resolved versioned model, while API examples still show `jev-latest`.

VERDICT: FAIL
