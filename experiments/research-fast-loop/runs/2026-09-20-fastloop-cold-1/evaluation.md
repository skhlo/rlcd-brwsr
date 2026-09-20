## Checklist evaluation

| ID  | Result | Evidence                                                                                                                                                                                                                                               |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QD1 | PASS   | Keeps deterministic rules, control flow, validation, authorization, browser commands, and side effects in TypeScript; Jev only selects bounded code-owned candidates.                                                                                  |
| QD2 | PASS   | Recommends bounded structured state containing the goal, URL/title, accessibility text, recent actions, retained-source inventory, offered operations, and candidates derived from controls in the decision snapshot.                                  |
| QD3 | PASS   | Requires narrow complete instructions, notes IDs are not model context, uses Choice appropriately, recommends contrastive criteria, and includes `NO_MATCH` for incomplete candidate coverage.                                                         |
| QD4 | PASS   | Operations and compatible candidates remain code-owned; every target head names its assumed operation; text and select choices use complete field/value or field/option pairs.                                                                         |
| SF1 | PASS   | Places operation and non-empty operation-specific target heads in one request over shared state while acknowledging added question tokens and the shared context budget.                                                                               |
| SF2 | PASS   | Consumes only the target for the selected operation and explicitly ignores unused answers and their uncertainty.                                                                                                                                       |
| SF3 | PASS   | Reserves another request for genuinely new browser state or candidates, rather than serializing questions that can use the original state.                                                                                                             |
| RV1 | FAIL   | Most boundary checks are specified, but local validation of the required `usage` object and fields is absent. Merely noting API usage is not a validation requirement.                                                                                 |
| RV2 | PASS   | Requires offered operations/candidates, current-snapshot UIDs, and mapping opaque IDs to fixed executor calls; prohibits model-provided selectors, URLs, commands, JavaScript, coordinates, and generated text.                                        |
| RV3 | PASS   | Commands are constructed only after validation, so malformed, unoffered, or stale results cannot mutate the browser; uncertain browser mutations are never retried.                                                                                    |
| UN1 | FAIL   | Correctly describes Choice confidence and warns that typed/high-confidence output can be wrong, but omits Score confidence and the fact that Noul has no separate confidence.                                                                          |
| UN2 | FAIL   | Threshold ownership, fixture calibration, and uncertain-case escalation are present. Consequential actions are excluded, but the brief does not explicitly require returning those cases to Pi.                                                        |
| UN3 | FAIL   | Calls `DONE` a completion claim requiring independent verification, but does not explicitly state that it is not proof of source completeness.                                                                                                         |
| ML1 | FAIL   | Correctly pins `jev-1.13.0` and reports the 64k/32k context limits, but omits relevant current service limits—250,000 tokens/second and 1,200 requests/minute, identified as dynamic—and the 255-option Choice cap relevant to browser candidate sets. |
| ML2 | FAIL   | Records text-only input and lack of text generation, but does not state the complete boundary that Jev produces no prose, code, or reasoning explanations, nor that Pi retains synthesis and difficult recovery.                                       |
| ML3 | PASS   | Covers literalness, numerical weakness, indirection, irrelevant state, adversarial content, structural inconsistency, and generation; arithmetic and exact checks remain in code.                                                                      |
| ML4 | FAIL   | Says high confidence can be wrong, but omits that calibration describes population behavior rather than guarantees for individual decisions. It also does not explicitly warn that a surviving UID or harmless label cannot prove an action’s effects. |
| SC1 | PASS   | Material TypeSafe claims cite official pages present in the current `llms.txt`.                                                                                                                                                                        |
| SC2 | PASS   | Every cited URL returned HTTP 200 and supported its nearby claim. Current documentation inconsistencies are recorded below.                                                                                                                            |
| SC3 | PASS   | All five requested topics receive substantive and actionable treatment; this finding does not rely on page counts or classifier completion.                                                                                                            |

## Citation audit

| Cited URL                                                         |  Resolved | Nearby claim supported                                                                                                                 |
| ----------------------------------------------------------------- | --------: | -------------------------------------------------------------------------------------------------------------------------------------- |
| https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md | Yes — 200 | Yes — code-owned workflow, narrow judgments, relevant context, structured and contrastive criteria.                                    |
| https://docs.typesafe.ai/concepts/state.md                        | Yes — 200 | Yes — structured state, named relationships, and text-only state.                                                                      |
| https://docs.typesafe.ai/primitives.md                            | Yes — 200 | Yes — question types, IDs not sent to the model, independent questions, fan-out, real serial dependencies, and shared token budgeting. |
| https://docs.typesafe.ai/primitives/choice.md                     | Yes — 200 | Yes — selected option, complete distribution, confidence, no-match options, and speculative Choice use.                                |
| https://docs.typesafe.ai/patterns/fan-out.md                      | Yes — 200 | Yes — ask speculative branch questions together and ignore irrelevant answers in code.                                                 |
| https://docs.typesafe.ai/api.md                                   | Yes — 200 | Yes — response fields, answer shapes, error statuses, and exponential backoff for 429/529.                                             |
| https://docs.typesafe.ai/confidence.md                            | Yes — 200 | Yes — Choice/Score confidence derives from distribution concentration and thresholds depend on stakes and application data.            |
| https://docs.typesafe.ai/models.md                                | Yes — 200 | Yes — `jev-1.13.0`, alias movement, pinning guidance, model identity, 64k/32k limits, text-only input, and language support.           |
| https://docs.typesafe.ai/model-jaggedness/jev-1.13.md             | Yes — 200 | Yes — all listed Jev 1.13 failure modes and corresponding mitigations.                                                                 |

The current `llms.txt` index also returned 200. Targeted official checks of `primitives/score.md`, `primitives/noul.md`, `concepts/system-one.md`, and `introduction/machine-learning-primer.md` returned 200 and confirmed the missing UN1, ML2, and ML4 points.

## Unsupported, missing, or stale findings

**Unsupported claims:** None observed.

**Missing findings:**

- Validation of `usage.input_tokens` and `usage.output_tokens`.
- Score confidence semantics and Noul’s lack of separate confidence.
- Explicit return of consequential cases to Pi.
- Explicit statement that `DONE` does not prove source completeness.
- Current rate limits and the 255-option Choice limit.
- The complete no-prose/no-code/no-explanations boundary and Pi’s ownership of synthesis and difficult recovery.
- Calibration as population behavior, not a per-decision guarantee.
- The residual action risk of surviving UIDs and harmless-looking labels.

**Stale findings:** None conclusively attributable to the brief; current official sources contain the inconsistencies below.

## Source drift observed

- `primitives.md` describes a shared budget of “around 32,000 tokens,” while `models.md` specifies 64k across state and all questions plus 32k for state and the longest question. The brief correctly records this conflict.
- `fan-out.md` says extra questions have “no speed cost,” while `primitives.md` says they “barely” change response time and still consume tokens. The brief correctly treats this as typical behavior rather than a guarantee.
- `models.md` says the response `model` field reports the versioned model ID, while examples in `api.md` and `choice.md` return `"jev-latest"`.
- `api.md` describes Choice criterion values as `string | null`, while `choice.md` and the building guide say criterion values may also be objects or arrays and demonstrate structured objects.

VERDICT: FAIL
