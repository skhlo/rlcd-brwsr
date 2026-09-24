# Python-owned runner verification

This document owns the current verification status, evidence classes, known
limits, and compact commit/receipt index. The complete pre-cleanup chronology is
still available without restoring it to the working tree:

```bash
git show c9a655a:docs/thin-python-evidence.md
```

Historical artifacts that live only in the locked sibling checkout are mapped
by [docs/archive.md](archive.md). Current-checkout raw receipts remain under
`artifacts/`; they are evidence, not setup instructions or authorization to
repeat live work.

## Compact handoff

At cleanup base `c9a655ad1a2c8ab8d7bd03ced772474167878e06`, the owner accepts
the local, unpublished implementation as a good-enough operating baseline with
independent verification. This is a product decision. It does not add evidence
of accuracy, relevance, reliability, speed, provider cost, or complete billing.
Future optimization should answer observed lost information, avoidable follow-up,
or slowness rather than pursue smaller output by itself.

### Current deterministic and synthetic evidence

The span/context implementation at `3d9f0f6` recorded:

- 70/70 deterministic tests passing across the registered tools, real Python
  runner, and pinned Agent/native helper, with external Browser/CDP and provider
  interactions replaced;
- direct projection checks passing for protected outcome, location, cleanup,
  diagnostic, privacy, usage, omission, and fitting facts;
- TypeScript, Prettier, no-write Python parsing, shell syntax, lock stability,
  pin stability, and Git whitespace checks passing; and
- one isolated Pi 0.87.1 TUI slash command passing 24/24 assertions through the
  production registration and runner with synthetic browser/provider boundaries.

The TUI check was command-driven, not an outer-model-issued turn. It did not
connect to Chrome or call a live model. Its five-candidate request used broader
context to interpret fine spans, returned exactly 56 bytes of requested
amount/exclusion evidence in 820 bytes of compact content, retained 1,822 bytes
of bounded details, and leaked none of the unrelated context into evidence.
Raw receipts: [span-judge handoff](../artifacts/compact-output/span-judges/HANDOFF.md),
[acceptance summary](../artifacts/compact-output/span-judges/pi-tui/acceptance-summary.json),
and [parent checks](../artifacts/compact-output/span-judges/parent-checks.log).

The subsequent behavior-preserving cleanup reran all 70 tests, types and
formatting. Offline request/report/compact-output parity receipts were
byte-identical; selector policies and algorithms were AST-identical. No live
trial was repeated. Receipts: `artifacts/cleanup-good-enough/`.

These checks establish structure, bounds, lifecycle behavior at synthetic
external boundaries, and exact-copy presentation. They do not establish model
quality or general browser reliability.

### Evidence classes

Keep these results distinct:

- **Deterministic registered-tool tests** cross production public seams but
  replace external browser/provider behavior.
- **Synthetic Pi-TUI checks** invoke the production tool from an actual Pi TUI
  command. The latest span check had synthetic browser/provider boundaries and
  no outer-model turn. Earlier rewrite/tab-target checks used real isolated
  Chrome with synthetic providers at their recorded heads.
- **Actual outer-turn browser pilots** use Pi's normal model/tool path, the real
  pinned Jev/provider path, and independently inspect the exact target. They are
  task observations, not reliability rates.
- **Live model-only replays** call the reporting model on retained sanitized
  states without a browser task. Their checks concern selected excerpts/status,
  not browser success.
- **Offline replays** regenerate production requests/presentation without a
  model or browser.
- **Synthetic oracle calculations** assign hand-authored scores to show what the
  representation can express. They are not predictions of Jev behavior.

### Actual outer-turn public-page pilot

At recorded head `6cf6a80` (runtime `0b3c5ab`), three normal-session public-page
tasks used real Jev and direct DeepSeek through the registered tool: a Google
search, Wikipedia article navigation, and a birth-date lookup continuing on the
same exact Wikipedia target. All three completion claims were independently
verified with one read-only exact-target inspection each. There was no tool-call
retry or extra recovery inspection. The two returned pilot targets were then
closed with acknowledgement and the exact browser baseline was restored.

This proves those three task outcomes on that recorded head. It does not prove a
reliability rate, general public-site quality, a speedup, or a cost reduction.
The shared observer exposed the birth date before the third goal, so the final
zero-action continuation demonstrates goal-conditioned retrieval from existing
state rather than newly obtaining the fact. Compact content totaled 3,533 bytes;
the reporter's model work remained substantial and complete billing remained
unknown. Raw receipt: [real-use pilot report](../artifacts/compact-output/real-use-pilot/REPORT.md).

### Offline representation and latest live model-only result

The saved seven-case span replay used no model or browser. All cases retained
complete meaningful source coverage. The three pilot request shapes contained
84/116/114 candidates and 50,049/70,046/68,705 serialized bytes, larger than the
superseded grouped requests. Hand-authored oracle scores then produced useful
pilot content of 1,390/751/832 bytes, or 2,973 bytes total versus the exactly
reproduced historical 3,533. Protected outcome, location, cleanup, and diagnostic
facts were held constant. This 15.9% calculation proves only that the structure
can represent a smaller useful handoff.

The subsequently authorized live span replay made seven model-only TypeSafe
calls against the same sanitized cases. It passed **three of six positive
excerpt checks plus the negative control: four of seven configured checks**.
These were selected-excerpt/status checks, not seven browser tasks and not three
browser failures. The date appeared once; the identifier and qualified estimate
were retained without configured filler. Google and Wikipedia selected weak or
irrelevant excerpts instead of the expected page text, and the Korean example
returned no evidence despite the expected text being available. Every returned
record was still an exact offered source copy.

Holding historical browser facts fixed, the live selections produced a 3,255-byte
offline counterfactual versus 3,533 bytes, 7.9% smaller. Smaller output with
missing expected evidence is not successful general compression. For the same
three source/goal pairs, reporting usage was 62,622 input and 6,292 output tokens,
near the original pilot's 63,679/6,232 rather than the lower grouped replay. No
paired latency, end-to-end speed, billing, or reliability benefit is established.

All seven authorized calls are consumed. No prompt, threshold, corpus, or code
was tuned after the results. Raw receipts:
[live report](../artifacts/compact-output/span-judges/live-evaluation/REPORT.md),
[attempts](../artifacts/compact-output/span-judges/live-evaluation/attempts.json),
[results](../artifacts/compact-output/span-judges/live-evaluation/results.json),
and [content comparison](../artifacts/compact-output/span-judges/live-evaluation/content-comparison.json).
A further live trial requires a new finite allowance.

## Bounded live follow-up

The earlier corrected Python-owned rewrite at runtime `b3b42036` passed four
actual Pi-TUI/isolated-Chrome journeys with synthetic provider replies: created
click/default close, created text/retention, wall deadline, and TUI cancellation.
Independent observers checked exact targets, browser effects, child exits, and
restored baselines. The invocation was command-driven rather than an
outer-model-issued tool turn. Its detailed artifacts remain in the retained
sibling checkout identified by [the archive index](archive.md).

A later bounded follow-up at `4e243c24` used the then-selected OpenRouter Ling
field helper and one local fixture through Pi's normal outer-model/tool path.
The helper payload and retained exact target were independently verified, then
cleaned up. That is historical evidence for Ling at its recorded head, not
provider evidence for the current direct DeepSeek helper. The owning provider
note links this heading so the anchor is retained.

The current direct-DeepSeek route was subsequently exercised by the three-task
public pilot above. Current model-only replays used Browser Harness's normal
native loader to resolve existing host-local keys without manually inspecting,
copying, or editing the credential store. Values were excluded from arguments
and retained artifacts. Earlier live phases retain their own credential-loading
provenance in their receipts. These observations are not a provider-validity
guarantee or permission to reuse credentials for another experiment.

## Existing-tab targeting

Corrected candidate `ff49875` added read-only discovery and exact borrowed-tab
continuation/navigation. Its deterministic suite passed 54 tests. A fresh Pi
0.87.1 TUI command used real isolated Chrome and synthetic provider replies and
passed 13/13 assertions covering discovery, same-target continuation, explicit
navigation, created-tab closure, primary-error preservation, independent focus
release/detach reporting, and unrelated-target preservation.

This was command-driven fixture evidence, not an outer-model turn, live-provider
check, or general-web test. Forced exits can still strand focus emulation or an
attachment. Raw receipt:
[tab-targeting correction handoff](../artifacts/tab-targeting/implementation/correction/HANDOFF.md).

## Known limits

The accepted baseline retains these limits:

- Current context/span separation is structurally verified, but the latest live
  reporter missed three expected positive excerpts. A `no_match` is not proof
  that useful source text is absent.
- A completion claim is not independent proof. Public-site evidence consists of
  three recorded tasks, not a reliability sample or prompt-injection guarantee.
- `maxSeconds` is a coarse parent stop deadline. Hard termination can leave
  execution, created-tab cleanup, borrowed focus emulation, and attachment
  unknown; no parent fallback repair exists.
- Existing-daemon checks do not attest that a same-named `cdp` daemon still uses
  current endpoint/profile settings.
- Usage includes only retained upstream records. Attempts, retries, failed-call
  usage, provider cost, and complete billing can be unknown, and Pi top-level
  totals omit native calls.
- Direct `deepseek-flash` is a mutable alias. Recorded successful calls do not
  guarantee future provider acceptance, latency, JSON adherence, or quality.
- The current branch is local and unpublished. GitHub issues that describe the
  superseded implementation are not represented as satisfied.
- Earlier cancelled-gate findings concern the removed larger protocol and remain
  historical; cancellation was never rewritten as a pass.

No old semantic result is upgraded by the good-enough product decision. In
particular, failed excerpt checks remain failures and synthetic checks remain
synthetic.

## Commit and receipt index

| Reference             | What it establishes                                                                               | Raw record                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `b3b42036`            | Corrected Python-owned rewrite and actual Pi-TUI/Chrome fixture journeys with synthetic providers | Retained sibling checkout; see [archive.md](archive.md)                                                  |
| `ff49875`             | Corrected exact existing-tab targeting                                                            | [correction handoff](../artifacts/tab-targeting/implementation/correction/HANDOFF.md)                    |
| `0b3c5ab` / `f6a7c54` | Corrected compact details/content split and protected-fact pressure guards                        | [pressure follow-up](../artifacts/compact-output/implementation/correction/pressure-followup/HANDOFF.md) |
| `6cf6a80`             | Three actual outer-turn public-page tasks and exact-target verification on the recorded runtime   | [pilot report](../artifacts/compact-output/real-use-pilot/REPORT.md)                                     |
| `8233340`             | Corrected grouped selector and its synthetic/live-model evidence                                  | [correction handoff](../artifacts/compact-output/selector-refinement/correction/HANDOFF.md)              |
| `3d9f0f6`             | Current context/span separation, 70 tests, offline replay, and 24-assertion synthetic TUI check   | [span handoff](../artifacts/compact-output/span-judges/HANDOFF.md)                                       |
| `c9a655a`             | Latest model-only span result: four of seven configured excerpt/status checks                     | [live report](../artifacts/compact-output/span-judges/live-evaluation/REPORT.md)                         |

For the removed chronology and every older section, use
`git show c9a655a:docs/thin-python-evidence.md`. Do not delete retained evidence
because it is old; [archive.md](archive.md) owns sibling locations and resource
retention constraints.
