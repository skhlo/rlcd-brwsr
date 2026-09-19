## Checklist evaluation

| ID | Result | Evidence |
|---|---|---|
| QD1 | PASS | Recommends Jev only for bounded candidate selection; TypeScript owns control flow, validation, uncertainty policy, and Chrome side effects. |
| QD2 | PASS | State includes goal, URL/title, bounded accessibility text, recent actions, retained sources, and observed operation/target candidates from the snapshot. |
| QD3 | PASS | Provides narrow Choice questions, complete instructions, notes that IDs are invisible, recommends contrastive criteria, and includes `NO_MATCH`. |
| QD4 | PASS | Operations and compatible targets/values are code-owned; each target question names its assumed operation; text/select choices are complete pairs. |
| SF1 | PASS | Recommends one request containing operation and applicable target heads over shared state, while acknowledging token and context costs. |
| SF2 | PASS | Code consumes only the target head matching the selected operation; irrelevant valid heads are ignored and uncertainty gates apply only to required heads. |
| SF3 | FAIL | Does not explain that a separate request is appropriate when an earlier answer is needed to fetch evidence, construct new state, or determine later options. Classification retries are not this dependency exception. |
| RV1 | PASS | Requires local pre-mutation validation of IDs, answer types, offered choices, exact probability keys, finite/ranged values, sums with tolerance, confidence, model identity, and usage. |
| RV2 | PASS | Requires operation/candidate membership and snapshot UID membership; prohibits model-produced selectors, URLs, shell fragments, and JavaScript. |
| RV3 | PASS | Malformed, unoffered, or stale results stop without mutation; uncertain browser mutations are never retried. |
| UN1 | FAIL | Correctly distinguishes Choice probability from confidence, but does not state the corresponding Choice/Score semantics or that Noul has no separate confidence. Its correctness caveats only partially satisfy the remaining requirement. |
| UN2 | PASS | Keeps thresholds and consequences in code, calls for RLCD-brwsr fixture calibration, and returns uncertain or consequential cases to the outer agent rather than copying cookbook thresholds. |
| UN3 | PASS | Treats `DONE` as a completion claim requiring independent outer-agent verification. |
| ML1 | PASS | Recommends pinning `jev-1.13.0`; current Models documentation confirms the alias mapping and 64k request/32k state-plus-longest-question limits. |
| ML2 | FAIL | States text-only input and no text generation, but does not explicitly record that Jev cannot produce replies/code/explanations or that Pi therefore retains synthesis and difficult recovery. |
| ML3 | PASS | Covers literalness, indirection, irrelevant large state, adversarial content, generation, counting, dates, and keeping arithmetic/exact checks in code. |
| ML4 | FAIL | Covers snapshot/UID staleness, but omits that calibrated probabilities describe population behavior rather than guaranteeing an individual decision. It also does not explicitly address apparently harmless labels. |
| SC1 | PASS | All material TypeSafe claims cite official pages present in the current `llms.txt` index. |
| SC2 | FAIL | All cited pages resolved, but the API citation does not itself support the nearby claim that the response contains a versioned model ID, and it does not prescribe built-in `fetch`. The Models page supports the versioned-ID fact, but it is not the nearby citation. |
| SC3 | PASS | All five requested topics receive substantive, actionable treatment independent of page counts or completion claims. |

## Citation audit

| Cited URL | Resolved | Supported nearby claim |
|---|---:|---|
| https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md | Yes | Yes — supports code-owned workflows, atomic questions, contrastive criteria, and independent parallel questions. |
| https://docs.typesafe.ai/api.md | Yes | **Partial** — supports endpoint, headers, request/response shapes, errors, and backoff. It does not prescribe built-in `fetch`, and by itself does not establish that `response.model` is versioned; its example returns `jev-latest`. |
| https://docs.typesafe.ai/models.md | Yes | Yes — supports version pinning, alias behavior, text-only input, language caveat, and 64k/32k limits. It also states that responses report the versioned model ID. |
| https://docs.typesafe.ai/concepts/state.md | Yes | Yes — supports structured state and shared, independently evaluated state. |
| https://docs.typesafe.ai/model-jaggedness/jev-1.13.md | Yes | Yes — supports literalness, numeric/date limitations, indirection, context rot, adversarial content, structural inconsistency, and lack of generation. |
| https://docs.typesafe.ai/primitives/choice.md | Yes | Yes — supports fixed choices, probabilities, confidence, invisible question IDs, visible option names/descriptions, 255-option limit, token cost, and none-of-the-above options. |
| https://docs.typesafe.ai/patterns/fan-out.md | Yes | Yes — supports speculative one-request fan-out and ignoring irrelevant answers. |
| https://docs.typesafe.ai/cookbooks/function_calling.md | Yes | Yes — supports asking for a function and closed-set arguments together, consuming only the selected function’s answers, and using the least-certain required judgment. |
| https://docs.typesafe.ai/confidence.md | Yes | Yes — supports distribution concentration versus probability, application-specific thresholds, and Noul having no separate confidence. |
| https://docs.typesafe.ai/primitives/advanced.md | Yes | Yes — supports structured Choice descriptions and the documented schema discrepancy noted by the brief. |

Additional official verification pages retrieved from the current index:

- `https://docs.typesafe.ai/introduction/machine-learning-primer.md` explicitly says calibration rates describe groups of predictions, not a guarantee for one answer; this required limitation is absent from the brief.
- `https://docs.typesafe.ai/concepts/system-one.md` explicitly says System One does not write replies, produce code, or generate explanations; the brief does not fully carry this capability boundary into Pi’s retained responsibilities.

## Unsupported, missing, or stale findings

- **Missing:** The genuine-dependency exception to speculative fan-out.
- **Missing:** Score confidence semantics and the absence of separate Noul confidence.
- **Missing:** An explicit statement that typed output or high confidence does not establish semantic correctness.
- **Missing:** Pi’s retained responsibility for synthesis and difficult recovery.
- **Missing:** Calibration as population behavior rather than an individual-decision guarantee.
- **Missing:** Explicit warning that a harmless-looking control label does not prove effects.
- **Citation mismatch:** The API page does not support the nearby “versioned model” wording; the Models page does.
- **Stale source detail:** The current function-calling cookbook still pins `jev-1.12`. Its architectural pattern remains applicable, but it is not current model-version guidance.

## Source drift observed

- Every cited page remains in the current `llms.txt` index and resolves.
- `jev-latest` currently still points to `jev-1.13.0`; the stated 64k/32k limits remain current.
- Current documentation retains the brief’s identified internal inconsistencies:
  - API Choice criteria are typed as `string | null`, while Choice/Advanced allow structured objects and arrays.
  - Fan-out says additional questions typically add no latency, while Choice says they “barely” change response time and still cost tokens.
  - The API example returns `model: "jev-latest"`, while Models says the response reports the versioned ID.
- The function-calling cookbook’s `jev-1.12` example is stale relative to the current model page.

VERDICT: FAIL
