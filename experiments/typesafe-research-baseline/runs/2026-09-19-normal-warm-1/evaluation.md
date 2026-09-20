## Checklist evaluation

| ID | Result | Evidence |
|---|---|---|
| QD1 | PASS | Keeps control flow, validation, side effects, candidate construction, and fixed Chrome commands in code; Jev only selects bounded, code-owned options. |
| QD2 | FAIL | The state includes the goal, page URL/title/accessibility excerpt, recent actions, retained sources, and fingerprint, but only names an undefined `candidateSummary`. It does not explicitly include an inventory of controls observed in and bound to the decision snapshot. |
| QD3 | PASS | Requires narrow questions, complete instructions because IDs are not model context, contrastive criteria, Choice for closed sets, and `NO_MATCH` for incomplete sets. |
| QD4 | PASS | Operations and candidates are code-owned; target questions state the assumed operation; complete field/value and field/option pairs preserve compatibility. |
| SF1 | PASS | Recommends one request containing the operation and every compatible target head and notes that extra questions consume tokens. |
| SF2 | PASS | Code consumes only the target matching the selected operation and explicitly ignores unused answers and their confidence. |
| SF3 | PASS | Reserves a second request for dependencies requiring new evidence or a newly constructed candidate set. |
| RV1 | FAIL | Most boundary checks are present, but the brief gives no documented numeric tolerance for probability sums, does not explicitly reject unexpected answer IDs, and makes usage-field validation conditional despite usage being part of the expected response. |
| RV2 | PASS | Rechecks operation, candidate, UID/value, snapshot membership, and exclusions; model output never becomes a selector, URL, command, or JavaScript. |
| RV3 | PASS | Malformed, unoffered, stale, or uncertain results stop without mutation; uncertain browser mutations are never retried. |
| UN1 | FAIL | It explains Choice confidence and denies that confidence or typed output proves safety/correctness, but omits Score-confidence semantics and the fact that Noul has no separate confidence. |
| UN2 | PASS | Thresholds and consequences remain in code, are calibrated on RLCD-brwsr fixtures/data, and uncertain or consequential cases return to the outer agent. |
| UN3 | PASS | `DONE` is expressly only a completion claim requiring independent verification. |
| ML1 | PASS | Correctly recommends pinning `jev-1.13.0`, identifies moving aliases, and reports the current 64k total, 32k state-plus-longest-question, and 255-option limits. |
| ML2 | PASS | Describes Jev as text-only and non-generative, leaves exact text and synthesis to the outer agent, and returns difficult cases for external handling. |
| ML3 | PASS | Covers literal interpretation, indirection, irrelevant large state, adversarial content, generation limits, arithmetic/counting/date weaknesses, and code-owned exact checks. |
| ML4 | FAIL | It explains that surviving candidates can change meaning and typed output is not safety, but omits the official warning that calibration is measured across groups and does not guarantee any individual decision. It also does not explicitly address apparently harmless labels as non-proof of effects. |
| SC1 | PASS | Material TypeSafe product, model, primitive, and API claims use official pages present in the current `llms.txt`. |
| SC2 | FAIL | All cited URLs resolved, but the Confidence citation supports distribution concentration and risk-based thresholds—not the full nearby claim that confidence is not workflow correctness, authorization, or browser safety. That boundary is supported by the uncited System One page instead. |
| SC3 | PASS | All five requested topics receive substantive, implementation-oriented coverage. |

## Citation audit

Repeated citations are consolidated by URL.

| Cited URL | Resolution | Nearby-claim support |
|---|---|---|
| https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md | HTTP 200 | Supported: code owns deterministic work, control flow, and side effects; model judgments remain narrow. |
| https://docs.typesafe.ai/concepts/state.md | HTTP 200 | Supported: structured named state and shared state across independent questions. It does not cure the brief’s missing explicit snapshot-control inventory. |
| https://docs.typesafe.ai/primitives.md | HTTP 200 | Supported: narrow judgments, IDs not sent to the model, parallel questions, and genuine serial dependencies. |
| https://docs.typesafe.ai/primitives/choice.md | HTTP 200 | Supported: closed options, full distributions, confidence, no-match options, token cost, and the 255-option limit. |
| https://docs.typesafe.ai/primitives/advanced.md | HTTP 200 | Supported: structured and contrastive instructions and criteria. |
| https://docs.typesafe.ai/patterns/fan-out.md | HTTP 200 | Supported: speculative questions in one call and code ignoring irrelevant branches. |
| https://docs.typesafe.ai/model-jaggedness/jev-1.13.md | HTTP 200 | Supported: literalness, indirection, irrelevant state, adversarial content, arithmetic/date/counting limitations, structural non-identities, and generation limitations. |
| https://docs.typesafe.ai/models.md | HTTP 200 | Supported: current model/version aliases, pinning guidance, text-only input, context limits, language support, and resolved model identity. |
| https://docs.typesafe.ai/api.md | HTTP 200 | Supported: endpoint, response fields, Choice distribution contract, and documented error/retry statuses. It does not specify a probability-sum tolerance or tie/rounding policy. |
| https://docs.typesafe.ai/confidence.md | HTTP 200 | Partially supported: concentration semantics, range, Noul’s lack of separate confidence, domain-specific thresholds, and own-data testing are documented. The page does not itself support the full workflow-correctness/authorization/browser-safety disclaimer attached to the citation. |

Targeted independent checks:

- https://docs.typesafe.ai/concepts/system-one.md resolved with HTTP 200 and explicitly states that calibration is measured across groups and does not guarantee an individual answer.
- https://docs.typesafe.ai/primitives/noul.md resolved with HTTP 200 and explicitly states that Noul has no separate confidence value.

## Unsupported, missing, or stale findings

### Unsupported or under-supported

- The Confidence citation does not fully support the accompanying claim about workflow correctness, authorization, and browser safety.
- The API documentation does not provide the numeric rounding tolerance or tie policy needed to implement the proposed “approximately 1” and maximal-probability checks consistently.

### Missing

- An explicit state field containing controls observed in and bound to the decision snapshot.
- Rejection of unexpected response question IDs.
- A documented probability-sum tolerance.
- Unconditional usage validation for the expected raw response.
- Score-confidence semantics and Noul’s lack of separate confidence.
- The population-level meaning of calibration and its non-guarantee for an individual decision.
- An explicit warning that an apparently harmless control label does not prove an action’s effects.

### Stale

None observed.

## Source drift observed during evaluation

No material version or limit drift was observed: the live index still lists `jev-1.13.0`, both aliases still resolve to it, and the cited context and Choice limits remain current.

The documentation discrepancies identified by the brief also remain live:

- Models gives the precise 64k/32k limits while Primitives says “around 32,000 tokens.”
- API restricts Choice criterion values to `string | null`, while Advanced permits objects and arrays.
- Models says responses report the resolved versioned ID, while API and Choice examples still show the alias.

VERDICT: FAIL
