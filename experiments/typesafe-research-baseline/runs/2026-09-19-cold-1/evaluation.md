## Checklist evaluation

| ID | Result | Concise evidence |
|---|---|---|
| QD1 | PASS | Recommends Jev only as a bounded classifier; code owns candidates, control flow, validation, command construction, side effects, and stopping. |
| QD2 | PASS | The structured state includes goal, URL/title/accessibility text, recent actions, retained sources, and controls from the decision snapshot, with explicit bounds. |
| QD3 | PASS | Requires narrow independent questions, complete instructions because IDs are hidden, fixed-set Choice questions, contrastive boundaries, and `NO_MATCH`. |
| QD4 | PASS | Operations and compatible candidates are code-owned; target questions name their assumed operation; text/select candidates are complete field/value or field/option pairs. |
| SF1 | PASS | Recommends one request containing operation and all constructible operation-specific target questions, while noting extra token cost. |
| SF2 | PASS | Code consumes only the matching target head, does not reconcile unused heads, and gates only answers needed for execution; malformed response validation remains separate. |
| SF3 | PASS | Reserves a later call for a genuinely new state/candidate set or when an earlier result is required to construct the later question. |
| RV1 | PASS | Requires pre-mutation local checks of IDs, answer types, offered choices, exact probability keys, finite ranges, sums with documented tolerance, confidence, model, and usage. |
| RV2 | PASS | Requires offered operations/candidates and snapshot membership, then maps IDs through fixed code paths rather than accepting selectors, URLs, shell, or JavaScript. |
| RV3 | PASS | Malformed, unoffered, stale, or uncertain results stop without mutation; uncertain browser mutations are never retried. |
| UN1 | **FAIL** | Explains Choice confidence versus selected probability, but omits Score confidence, Noul’s lack of separate confidence, and the general warning that typed/high-confidence output does not prove correctness. |
| UN2 | **FAIL** | Correctly keeps thresholds and consequences in code and requires fixture calibration, but says only to stop on uncertain/consequential cases rather than explicitly return those cases to Pi. |
| UN3 | PASS | Treats `DONE` as a completion claim requiring independent outer-agent verification. |
| ML1 | PASS | Pins `jev-1.13.0`, warns against moving aliases, and accurately reports the current 64k total, 32k state-plus-longest-question, and 255-option limits. |
| ML2 | **FAIL** | Records text-only input and lack of generation, but does not explicitly state that Jev produces no prose, code, or explanations and that Pi therefore retains synthesis and difficult recovery. |
| ML3 | PASS | Covers literal reading, indirection, irrelevant state, adversarial content, structural invariants, generation, and unreliable arithmetic/counting/dates, with exact work retained in code. |
| ML4 | **FAIL** | Covers UID races and the inability of confidence or harmless labels to establish browser safety, but omits that calibration describes population behavior and cannot guarantee an individual decision. |
| SC1 | PASS | Material TypeSafe claims cite official pages present in the current `llms.txt` index. |
| SC2 | PASS | Every cited documentation URL resolved and supported its nearby claim; no incorrect citation was found. |
| SC3 | PASS | All five requested topics receive substantive, RLCD-brwsr-specific and actionable treatment. |

## Citation audit

| Cited URL | Resolved | Nearby claim supported |
|---|---:|---|
| https://docs.typesafe.ai/models.md | Yes | Yes — current model ID, aliases, version pinning, context limits, text-only input, and language support. |
| https://docs.typesafe.ai/api.md | Yes | Yes — endpoint/request and response shapes, answer fields, usage, error statuses, and retry guidance. |
| https://docs.typesafe.ai/concepts/state.md | Yes | Yes — structured state, descriptive fields, shared state, and independent questions. |
| https://docs.typesafe.ai/primitives.md | Yes | Yes — atomic questions, hidden question IDs, independence, fan-out, serial dependencies, answer shapes, and the approximate token statement. |
| https://docs.typesafe.ai/model-jaggedness/jev-1.13.md | Yes | Yes — literal interpretation, arithmetic/counting/dates, indirection, large state, adversarial content, invariants, and generation limits. |
| https://docs.typesafe.ai/primitives/choice.md | Yes | Yes — fixed choices, distributions, confidence, no-match options, 255-option limit, candidate descriptions, and token/latency trade-offs. |
| https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md | Yes | Yes — code-owned workflow, narrow questions, structured/contrastive criteria, composition, and uncertainty routing. |
| https://docs.typesafe.ai/patterns/fan-out.md | Yes | Yes — speculative questions in one request and code ignoring irrelevant answers. |
| https://docs.typesafe.ai/confidence.md | Yes | Yes — distribution concentration, distinction from option probability, risk-sensitive routing, and application-tested thresholds. It states confidence is derived from probabilities but supplies no formula. |
| https://docs.typesafe.ai/patterns/confidence-routing.md | Yes | Yes — consequence-dependent confidence gates and escalation. |
| https://docs.typesafe.ai/primitives/advanced.md | Yes | Yes — structured objects and arrays are accepted for Choice criteria, confirming the documented API-schema discrepancy. |

The literal API endpoint `https://api.typesafe.ai/v1/systemone` was not called; it is an endpoint declaration, not a documentation citation, and use of the inference API was prohibited.

Additional official omission checks all resolved: `primitives/noul.md` confirms Noul has no separate confidence; `concepts/system-one.md` confirms no replies, code, or explanations and that calibration does not guarantee an individual answer; `introduction/machine-learning-primer.md` explains calibration as behavior across groups of predictions.

## Unsupported, missing, or stale findings

### Unsupported

None observed among the affirmative cited claims.

### Missing

- **UN1:** Score confidence, Noul’s absence of separate confidence, and an explicit statement that typed or high-confidence output is not proof of correctness.
- **UN2:** Explicit handoff of uncertain or consequential cases back to Pi.
- **ML2:** Explicit no-prose/no-code/no-explanation boundary and Pi’s retained responsibility for synthesis and difficult recovery.
- **ML4:** The population-level meaning of calibrated probabilities and lack of a guarantee for any one decision.

### Stale

None observed. `jev-1.13.0` remains the current versioned model in the retrieved Models page.

## Source drift observed during evaluation

No broken-link or model-ID drift was observed. The live documentation retains the inconsistencies the brief reports:

- `primitives.md` says the shared budget is around 32,000 tokens, while `models.md` specifies 64k total and 32k for state plus the longest question.
- `api.md` describes Choice criteria values as `string | null`, while `primitives/advanced.md` and the Choice page permit structured objects and arrays.
- Fan-out latency wording varies between “typically” no added latency, “no speed cost,” and “barely” changed response time, despite acknowledged token cost.

VERDICT: FAIL
