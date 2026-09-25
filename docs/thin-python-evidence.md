# Python-owned runner verification

This document owns the current verification status, evidence classes, known
limits, and compact commit/receipt index. The complete pre-cleanup chronology is
still available without restoring it to the working tree:

```bash
git show c9a655a:docs/thin-python-evidence.md
```

The [archive index](archive.md) separates public history from operator-local
resources. This document publishes evidence summaries, not the raw receipts:
`artifacts/` is ignored and does not ship with a clone. Paths below are local
receipt locators, not public download links. No receipt or historical trial is
setup guidance or authorization to repeat live work.

## Design A local candidate (2026-09-25)

**Local implementation; verification remains incomplete. Not activated or
published.** The owner accepted the already-open-dialog limitation:
the adapter must leave that dialog untouched, but may return a bounded
stop/error rather than identify it explicitly. This does not authorize a
persistent observer or automatic dialog handling.

The offline correction batch passed 75 Node tests and five Python tests, plus
type, formatting and syntax checks. Three focused tests cross the actual Node
worker with an external selected-page-shaped dependency; the existing
registered-tool browser/provider stand-ins remain documented. Deliberately
breaking exact-ID selection and the complete RPC line bound produced the
expected failures; both guards were restored.

The initial two browser passes failed during setup (sandbox fixture bind and an
overlong Harness Unix-socket path). A separately authorized renewed window then
used two disposable Chrome launches and 13 charged logical cases, with synthetic
model transports and no live Jev/DeepSeek/reporting calls. Its receipts establish:

- the original open-shadow freshness and offscreen-iframe text defects on real
  fixtures, and their corrected behavior through the real adapter;
- exact borrowed-target continuation despite duplicate URLs, same-target
  explicit navigation and missing-target refusal without fallback;
- created-target retention after completion and closure after BLOCKED/error;
- an already-open confirm dialog remained untouched and produced a bounded
  stop, not a typed `DialogPending` handoff. That limitation is now accepted.

Full acceptance did **not** pass. The first renewed run's Pi launcher failed
before Pi ran because macOS `script` could not use socket-backed stdin. A Python
PTY launcher was checked with `pi --version`. The second run stopped before its
remaining cases because the test driver looked for Enter in `action.key`, while
the adapter uses `action.value`. That check is corrected offline; it does not
establish a production Enter defect. Earlier mechanics steps ran, but their
independent final-state oracle was not reached.

A later one-launch pass on `9649545` established the normal Pi TUI path, but
premature test-driver cleanup prevented its six remaining checks. Its synthetic
reporting reply also had invalid usage metadata. Those failures remain recorded
in `artifacts/design-a/verification/REPORT.md`.

A separately authorized additional launch on `617c5c9` (unchanged production
code) followed offline red/green checks of cleanup ordering and the synthetic
reporting response. All seven browser checks ran; six passed:

- the actual Pi TUI tool, native Agent/text helper and CLI adapter filled City
  with `Busan` and clicked Submit, independently verified on the exact target;
  valid synthetic `no_match` reporting rendered without a diagnostic;
- fill, select, checkbox, nested-panel, open-shadow, same-origin-frame and Enter
  mechanics had independently confirmed final fixture states;
- stale input was refused without incrementing the click counter;
- cooperative stop acknowledged focus disable, detach and bridge reap;
- forced Python exit reported unknown cleanup and bridge reap, preserving the
  borrowed tab; and
- an unrelated exact session retained its sentinel, input and counters.

The dialog check returned `blocked` / `DialogPending`, acknowledged detach and
reported focus cleanup `unconfirmed`. Its assertion required a focus-disable
acknowledgement, although the existing contract permits `unconfirmed`. This
is not a demonstrated adapter contract violation, but the independent
pending-dialog/untouched assertions were not reached. That gap remains; the
failed check is not relabelled as passed. The owner subsequently accepted it for
adoption in [#20](https://github.com/skhlo/rlcd-brwsr/issues/20), with in-session
testing afterward. It is not a pre-adoption blocker.

The launch allowance is consumed. Owned processes stopped; the candidate remains
unactivated. Raw results and limitations are in
`artifacts/design-a/verification/RENEWAL.md`. No live-provider or public-site
acceptance, general reliability, speed benefit or #17 fix is claimed.

Retired verification material is archived locally under `artifacts/design-a/`:
`history.tar.gz` retains the earlier implementation/dispatch history, while
`verification-history.tar.gz` retains the later raw receipts, exercised scripts,
profiles and offline checks under `verification/`. Both archives were
byte-verified before retiring unpacked copies. The two readable reports remain
outside the archives. `artifacts/design-a/README.md` is the current entry point;
no active acceptance driver remains. Historical commands do not authorize a
rerun. Verification processes stopped, and seven receipt-identified orphaned
runtime directories were removed; branches, worktrees and shared browser
resources were retained. The prior live Jev–CLI probe remains separate evidence
for a different controller, not acceptance of this adapter.

## Compact handoff

At cleanup base `c9a655ad1a2c8ab8d7bd03ced772474167878e06`, the owner accepted
the then-local implementation as a good-enough operating baseline with
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
Local receipts under `artifacts/compact-output/span-judges/`: `HANDOFF.md`,
`pi-tui/acceptance-summary.json`, and `parent-checks.log`.

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
unknown. Local receipt: `artifacts/compact-output/real-use-pilot/REPORT.md`.

### Visible co-browse observations

Two later normal-session tasks exercised the repo-scoped skill with a real,
authorized Chrome tab visible to the user:

- At `c0a8ae5`, a Wikipedia search reached the Blancpain article and returned a
  completion claim. Independent exact-target inspection confirmed the article
  and History content. The outer agent then performed one direct scroll for
  reading position and checked visibility again. This was a successful shared
  workflow, not proof that Jev alone handled final positioning.
- At `1a4db4e`, the amended skill delegated navigation and final positioning to
  Jev. One call requested the actual Fifty Fathoms heading near the top with its
  opening paragraph visible. The loop repeatedly scrolled/revisited the section
  and returned `ValueError: Stopped at the 60-action demo budget`, not a
  completion claim. One read-only inspection afterward found the heading at
  75–97 px and its paragraph at 110–240 px within a visible 987 px viewport.
  There was no corrective action or retry. The final state satisfied the goal,
  but the first step at which it did so is unknown.

The second observation is tracked with the exact goal and retained action tail
in [issue #17](https://github.com/skhlo/rlcd-brwsr/issues/17). Cause and
repeatability remain open. The borrowed tab and shared browser services were
left available to the user. These observations add neither a reliability rate
nor a speed claim. Local first-task receipt:
`artifacts/co-browse-blancpain/RESULT.md`.

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
was tuned after the results. Local receipts under
`artifacts/compact-output/span-judges/live-evaluation/`: `REPORT.md`,
`attempts.json`, `results.json`, and `content-comparison.json`.
A further live trial requires a new finite allowance.

## Bounded live follow-up

The earlier corrected Python-owned rewrite at runtime `b3b42036` passed four
actual Pi-TUI/isolated-Chrome journeys with synthetic provider replies: created
click/default close, created text/retention, wall deadline, and TUI cancellation.
Independent observers checked exact targets, browser effects, child exits, and
restored baselines. The invocation was command-driven rather than an
outer-model-issued tool turn. Its detailed artifacts remain in an
operator-local retained checkout; [the archive index](archive.md) explains
which evidence is distributed publicly.

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
attachment. Local receipt:
`artifacts/tab-targeting/implementation/correction/HANDOFF.md`.

## Capability-selection fixtures

A later [capability evaluation](browser-capability-run-results.md) compared the
registered RLCD tool with real Harness and Chrome DevTools CLI reference paths
on disposable local fixtures, using synthetic application-model replies. Its
corrected, combined results inform capability selection, not live-Jev quality
or a fix for #17. The report preserves driver failures, the macOS startup
correction, separate execution allowances and untested subchecks.

A separately authorized [live Jev–CLI prototype](jev-cli-live-probe.md) then
used real Jev choices on four local fixtures: three model DONE outcomes and one
code-enforced dialog handoff were independently confirmed. It reused the pinned
choice policy but bypassed `Agent.run()` and the registered Pi tool, so it is
not acceptance of a changed production runner or an established fix for #17.

## Known limits

The accepted baseline retains these limits:

- Current context/span separation is structurally verified, but the latest live
  reporter missed three expected positive excerpts. A `no_match` is not proof
  that useful source text is absent.
- A completion claim is not independent proof. The public-page pilot and later
  co-browse observations are small task samples, not a reliability rate or
  prompt-injection guarantee.
- Jev can continue acting until its native cap despite a satisfactory final
  page position; [#17](https://github.com/skhlo/rlcd-brwsr/issues/17) remains
  unresolved. The single observation does not establish its cause.
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
- The base Python-owned runner merged in
  [PR #16](https://github.com/skhlo/rlcd-brwsr/pull/16), and the subsequent
  DeepSeek, existing-tab, compact-handoff and co-browse work merged in
  [PR #18](https://github.com/skhlo/rlcd-brwsr/pull/18). Merging adds no new
  validation evidence and does not satisfy the retired #9–#13 checklists.
- Earlier cancelled-gate findings concern the removed larger protocol and remain
  historical; cancellation was never rewritten as a pass.

No old semantic result is upgraded by the good-enough product decision. In
particular, failed excerpt checks remain failures and synthetic checks remain
synthetic.

## Commit and receipt index

Commit references identify source/documentation checkpoints, not public copies
of the ignored raw receipts. Evidence classes and limits are stated above.

| Reference             | What it records                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `b3b42036`            | Python-owned rewrite and actual Pi-TUI/Chrome fixtures with synthetic providers; later merged via PR #16 |
| `ff49875`             | Corrected exact existing-tab targeting                                                                   |
| `0b3c5ab` / `f6a7c54` | Compact content/details split and protected-fact pressure guards                                         |
| `6cf6a80`             | Three actual outer-turn public-page tasks on the recorded runtime                                        |
| `8233340`             | Corrected grouped selector and its synthetic/live-model evidence                                         |
| `3d9f0f6`             | Context/span separation, 70 tests, offline replay and synthetic TUI check                                |
| `c9a655a`             | Live span result: four of seven configured excerpt/status checks                                         |
| `a521ea9`             | Behavior-preserving cleanup with 70 tests and offline parity checks                                      |
| `c0a8ae5` / `1a4db4e` | Repo-scoped co-browse skill and subsequent goal-based delegation; observations above                     |
| `8afaa0e`             | PR #18 merge into `main`; integration/publication event, not a new test result                           |

For the removed chronology and every older section, use
`git show c9a655a:docs/thin-python-evidence.md`. Do not delete retained evidence
because it is old; [archive.md](archive.md) distinguishes public history from
operator-local resources whose retention is managed separately.
