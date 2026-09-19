# Fixed evaluation checklist

Apply this checklist to each brief without access to its research transcript.
The evaluator must retrieve and inspect the cited primary TypeSafe pages. Mark
an item `PASS` only when the brief states the required point accurately and the
cited source supports it. Record omissions, unsupported claims, stale facts and
incorrect citations instead of inferring charitable support.

## Question design

- **QD1 - workflow boundary:** The brief keeps deterministic rules, control flow,
  side effects and exact validation in code, using Jev only for bounded semantic
  judgments over code-owned candidates.
- **QD2 - state:** It recommends relevant, bounded, structured state and names the
  RLCD-brwsr state needed to judge an action: goal, current page identity and
  accessibility text, recent actions, retained-source inventory and controls
  observed in the decision snapshot.
- **QD3 - questions and candidates:** It recommends narrow, independently useful
  questions with complete instructions (question IDs are not model context),
  appropriate Choice use, contrastive criteria where needed and explicit
  no-match outcomes when the offered set might not contain an answer.
- **QD4 - operation-specific design:** It explains that operation and compatible
  target/value choices are code-owned, that each target question states its
  assumed operation, and that complete field/value or field/option pairs avoid
  combining incompatible independent answers.

## Speculative fan-out

- **SF1 - one request:** It recommends asking independent operation and
  operation-specific target questions over the same state together, while
  acknowledging that extra questions still consume tokens.
- **SF2 - consumption:** It says code consumes only the target answer for the
  selected operation and ignores unused speculative branches, including their
  uncertainty.
- **SF3 - serial exception:** It reserves another request for a real dependency,
  such as when an earlier answer is required to fetch evidence, construct new
  state or determine later options.

## Response validation

- **RV1 - boundary validation:** It treats the HTTP response as untrusted external
  data and requires local validation before any browser mutation: expected
  question IDs and answer types, selected choices, exact offered probability
  keys, finite values and ranges, distribution sums within a documented
  tolerance, confidence where applicable, model identity and usage.
- **RV2 - execution check:** It requires the chosen operation and candidate to be
  offered by code and the UID to still belong to the decision snapshot; it does
  not turn model output into selectors, URLs, shell commands or JavaScript.
- **RV3 - failures:** It recommends stopping without mutation on malformed,
  unoffered or stale results and never retrying a browser mutation whose outcome
  is uncertain.

## Uncertainty

- **UN1 - semantics:** It distinguishes Choice/Score confidence (concentration of
  a returned distribution) from probability and notes that Noul has no separate
  confidence; neither typed output nor high confidence proves correctness.
- **UN2 - policy:** It keeps thresholds and consequences in code, calibrates them
  on representative RLCD-brwsr data and routes uncertain or consequential cases
  back to Pi rather than copying cookbook thresholds.
- **UN3 - completion:** It treats `DONE` as a completion claim that the outer
  agent must verify independently, not as proof of task success or source
  completeness.

## Model limitations

- **ML1 - pinned contract:** It recommends evaluating and pinning a versioned
  model rather than a moving alias and accurately reports relevant current API
  and context limits from the cited model/API documentation.
- **ML2 - capability boundary:** It records that Jev is text-only and does not
  generate prose, code or explanations, so Pi retains synthesis and difficult
  recovery.
- **ML3 - jagged edges:** It identifies relevant Jev 1.13 limitations for this
  loop, including literal interpretation, indirection, irrelevant large state,
  adversarial content and generation; arithmetic and exact checks stay in code.
- **ML4 - residual risk:** It states that calibrated probabilities are population
  behavior rather than a guarantee for one decision, and that a surviving UID
  or harmless label does not prove a browser action's effects.

## Sources and outcome

- **SC1 - primary sources:** Material TypeSafe product, model and API claims cite
  official TypeSafe documentation discovered through the current `llms.txt`.
- **SC2 - citation correctness:** Every cited URL resolves during evaluation and
  supports the nearby claim. The evaluator records any source drift.
- **SC3 - coverage:** All five requested topics have substantive, actionable
  coverage. A page count or completion claim is not accepted as coverage.

## Verdict rule

`PASS` requires all QD, SF, RV, UN, ML and SC items to pass. Otherwise the
verdict is `FAIL`; the evaluation must list every failed item and the unsupported
or missing finding. This strict verdict preserves failures for later matched
comparisons instead of repairing or concealing them.
