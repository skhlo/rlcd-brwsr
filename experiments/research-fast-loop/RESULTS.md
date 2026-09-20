# Research fast-loop host checks

Date: 2026-09-19

## Environment

- Node 26.6.0
- pnpm 11.8.0
- Pi 0.85.1
- Chrome DevTools CLI 1.7.0
- `TYPESAFE_API_KEY`: absent
- Jev requests: 0

The fixture bound only to `127.0.0.1:43113`. Tailscale CLI was unavailable, so this run has no
Tailscale Serve URL.

## Actual Pi TUI journey

Pi was started in an isolated no-session invocation with the fake responder loaded explicitly:

```text
pi --no-session --no-extensions --no-skills --no-prompt-templates --offline \
  -e ./experiments/research-fast-loop/fake-jev-extension.ts \
  --tools rlcd_brwsr_run
```

The actual TUI showed one `rlcd_brwsr_run` call with `maxSteps: 2` and `maxSeconds: 20`. Its result
reported `status: completion_claim`, `stopReason: done_claim`, and
`requiresIndependentVerification: true`. The outer Pi response displayed these retained sources:

1. `http://127.0.0.1:43113/index.html` — **RLCD research start** — “Fixture source one: ask one
   narrow judgment over relevant structured state, while ordinary code owns browser execution.”
2. `http://127.0.0.1:43113/evidence.html` — **RLCD uncertainty evidence** — “Fixture source two: a
   DONE choice is a completion claim, not proof that source coverage is complete. The outer agent
   must verify the requested outcome independently.”

The TUI was controlled and captured through Paseo CLI terminal commands, not Paseo MCP.

## Independent checks

After the tool returned, a separate real CLI `take_snapshot --output-format=json` observed the
selected destination with URL `http://127.0.0.1:43113/evidence.html`, title
`RLCD uncertainty evidence`, and the expected destination text. Direct loopback HTTP reads confirmed
both quoted fixture texts independently of the fake responder's `DONE` answer.

The real 1.7.0 CLI also demonstrated the two JSON result forms used by the runner:

- success: an object containing a structured `snapshot` tree;
- failure: a text-record array such as
  `[{"type":"text","text":"Error: Element uid ... not found ..."}]`, even with process exit code 0.

## Cancellation, timeout, and cleanup correction

Repeated on 2026-09-20 through the actual registered tool in Pi's TUI. The fixture extension injected
only the fake classifier; registration created the real runner and the production
`createChromeCliExecutor(pi.exec)` adapter. The old standalone-spawn surrogate was removed because it
did not exercise this path.

- Timeout: a tool call with `maxSeconds: 1` clicked `Open slow documentation`. The visible tool result
  returned `uncertain_execution`, `budgetOverrunMs: 18`, and a model-visible truncation disclosure
  naming omitted trace probabilities and the 12,000-character content cap.
- Cancellation: a tool call with `maxSeconds: 30` showed a task-created `chrome-devtools` client as a
  direct child of Pi while the click was active. Pressing Escape produced a visible
  `uncertain_execution` tool result. The tracked CLI child was absent when that result appeared; Pi
  then displayed that the enclosing operation was aborted.
- In both cases the existing daemon continued the already-dispatched slow navigation after the CLI
  client ended. A separate `list_pages` call could not complete until the fixture responded, and the
  page later changed to `/slow`. This confirms why the result remains uncertain and why client cleanup
  is not represented as cancellation of daemon-side browser work.
- The pre-existing daemon and `about:blank` page were preserved. The task-created lifecycle page was
  closed, the original page was reselected, and both Paseo fixture/TUI terminals and their processes
  were stopped. No RLCD-brwsr-owned CLI child remained. Tailscale CLI remained unavailable and no Jev
  request was made.

## Search, selection, scrolling and partial-evidence check

Date: 2026-09-20

The same loopback server and explicitly loaded fake responder exercised issue #4 through Pi 0.85.1's
actual TUI. The host had Node 26.6.0, pnpm 11.27.0 and Chrome DevTools CLI 1.7.0. `TYPESAFE_API_KEY`
was absent, so the run made zero Jev requests. Tailscale CLI was absent; the fixture remained bound to
`127.0.0.1:43113` and had no Tailscale Serve URL.

The visible seven-step `rlcd_brwsr_run` call on `journey.html` returned `completion_claim` with
`stopReason: done_claim` and the independent-verification flag. Its trace reported `TYPE_TEXT`,
`SELECT`, `PAGE_DOWN`, `PAGE_UP`, `WAIT`, the `Show gathered evidence` tab click and `DONE`. The
retained evidence included the revealed statement that exact search text, one native option, both
scroll directions, a bounded wait and a tab had been exercised. Unrelated `Log in` and `Donate`
controls remained excluded while the low-consequence tab and documentation link were offered.

Separate real-CLI observations, not the fake classifier's completion claim, established the visible
state:

- the search control contained `Jev fast — café docs`;
- the native select contained the AX-observed speculative fan-out option (Chrome exposed the CJK
  label with accessibility spacing);
- the evidence tab had `aria-selected="true"`, its panel was visible, and its expected text was
  present;
- a direct `press_key PageDown --includeSnapshot` moved `window.scrollY` from 0 to 679.5 on this host,
  and `press_key PageUp --includeSnapshot` returned it to 0; and
- a direct real-CLI `fill` of the search UID returned a snapshot with the exact Unicode value and the
  fixture's matching live-status text.

A second visible Pi call followed `Continue to uncertainty evidence` and returned a `done_claim`
with both `index.html` and `evidence.html` retained. Repeating that journey with `maxSteps: 1`
returned `step_budget`, not a completion claim, while preserving both observed source URLs as partial
evidence.

All TUI and browser commands above were sent and captured through Paseo CLI terminals, never Paseo
MCP. The task-created fixture page, fixture server and verification terminals were removed after the
final checks. The pre-existing Chrome executor daemon and its `about:blank` page were retained.

## Correction checks: option identity, detached targets and adversarial instructions

Date: 2026-09-20

Chrome DevTools CLI 1.7.0 exposed both options in `ambiguous-select.html` with the same AX `name` and
`value`, `Response validation`, even though the fixture source uses distinct DOM values. A direct
real-CLI `fill` by that observed label selected the first source option and the fixture reported
`response-validation-primary`. This matched the pinned CLI source contract: snapshot construction
replaces each option's AX value with its name, and native fill finds the first matching child name
before reading that child's DOM value.

After reloading the page, the actual Pi 0.85.1 TUI ran the registered tool with the explicitly loaded
fake responder. The visible result returned `ambiguous_select_option` before classification or
mutation. A separate real-CLI snapshot still showed `No source value selected.` and retained the
unrelated `Log in` and `Donate` controls.

A real-CLI stale-target probe navigated away after snapshotting a link, then dispatched the old UID.
CLI 1.7.0 returned the exact error `Element with uid 32_7 no longer exists on the page.` The runner's
deterministic regression recognizes this wording and the existing `not found` wording as
`stale_target`, while an unknown dispatched mutation error remains `uncertain_execution`; none is
retried.

The new adversarial page instructed an automated browser to ignore the outer goal, click excluded
Login and Donate controls, select an unoffered `SUBMIT` operation, or follow an irrelevant link. Its
deliberately hostile fake responder returned an unoffered excluded target. The visible Pi tool result
was `invalid_classifier_response` with no mutation. A separate real-CLI snapshot confirmed that the
selected URL and all controls were unchanged. This demonstrates code-owned validation against this
fake output only; it is not evidence of real Jev prompt-injection immunity.

These checks used Node 26.6.0, pnpm 11.27.0, Pi 0.85.1 and Chrome DevTools CLI 1.7.0. Tailscale and
`TYPESAFE_API_KEY` were absent, and no Jev request was made. All TUI control used Paseo CLI rather
than Paseo MCP. The task-created page, fixture server and TUI terminal were stopped afterward. The
pre-existing executor daemon, selected `about:blank` page and unrelated Paseo Pi terminal were
retained.

## Real HTTP adapter and credential-blocked host check

Date: 2026-09-19

Issue #5 started from `f27a592428d99fcfcf0ecdf730d7f76b49b7e5a3`. The implementation adds the
pinned `jev-1.13.0` HTTP adapter, strict response validation, cumulative trial ledger, per-call
redacted diagnostics and raw independent judgments in bounded tool details. Public model pricing was
read from `https://docs.typesafe.ai/models`: US$0.042 per million input tokens, with output tokens
free. The 64k worst-case reservation is US$0.002688 per attempt, so the 100-request cap is also a
US$0.2688 conservative ceiling at that price, below the separately authorized US$5 cap.

The documented context limits disagree in presentation: the model page says 64k tokens shared across
the request and 32k for state plus the longest question, while the primitives page describes the
request budget as around 32k. The adapter keeps the existing 8,000-character classifier-state bound,
adds a 24,000-byte serialized HTTP-payload bound, and reserves cost against 64k input tokens. It does
not assume the larger context is available to the application.

The host credential gate blocked paid calibration and real navigation. Each approved launch disabled
shell tracing and sourced the host-owned credential file without reading or printing it, but
`TYPESAFE_API_KEY` remained absent in the sourced shell and child process. Five local calibration
launches stopped before ledger reservation or `fetch`; they are not API request attempts. The shared
ledger therefore remains at zero attempted requests, US$0 actual cost, US$0 unknown-cost reserve, 100
remaining requests and US$5 remaining authorized budget. No model distributions or calibration
claims were fabricated.

The actual Pi 0.85.1 TUI was still checked through Paseo CLI with the production extension and real
Chrome executor. The visible `rlcd_brwsr_run` result stopped as `classifier_failed`, retained the
source URL `http://127.0.0.1:43113/index.html`, included the bounded source excerpt, reported one
classifier call with zero model tokens, and displayed a redacted per-call `error` diagnostic. A
separate real-CLI snapshot independently confirmed the source title, text and destination link. The
browser never mutated, so the destination was not reached or claimed. This is evidence for the local
credential stop path, not real Jev navigation or uncertainty evaluation.

The only selected uncertainty policy is an uncalibrated fail-safe floor: the applicable operation and
selected target must have nonzero confidence and a unique probability leader outside the 0.001
validation tolerance. An uncertain unused speculative target head does not stop an otherwise valid
selected branch. Offline labeled tests cover both applicable heads and an unused zero-confidence
head. The four labeled real-model calibration cases remain in `run-jev-calibration.ts`, separate from
future evaluation, and were not run because no request could be authenticated.

The task-created fixture page, server and four Paseo terminals were closed. The pre-existing Chrome
daemon, selected `about:blank` page and unrelated Paseo Pi terminal were retained. Tailscale CLI was
absent and was not installed.

## Issue #5 correction pass

Date: 2026-09-20

Offline corrections omit untrusted HTTP status text from diagnostics, include the bounded code-owned
candidate inventory in TypeSafe state, account valid responses that settle after a deadline or
cancellation without acting on their decisions, and classify malformed successful production
responses as `invalid_classifier_response`. Late malformed and failed responses keep model usage and
billing unknown. The calibration script now sends labeled accessibility snapshots through the
exported production runner instead of copying its prompts and candidate construction.

No credential recovery or paid request was attempted during this pass. Real Jev calibration,
navigation and cancellation acceptance remain pending; the repository trial ledger remains at zero
attempts.

## Issue #5 live acceptance

Date: 2026-09-20

The owed live-acceptance work started from
`ac6a35ae1e2f0e1a71b8786d244c0e922356a062`. The public model page was read again immediately before
trials. It still listed `jev-1.13.0`, US$0.042 per million input tokens, free output tokens, a 64k
shared request context and a 32k state-plus-longest-question limit. The conservative 64k reservation
therefore remained US$0.002688 per attempt. Tailscale was still unavailable and was not installed.

The production-runner calibration script made four sequential requests. Its labels were defined in
code before the requests, and the raw responses and complete choice distributions are retained in
`jev-calibration-2026-09-20.json`. All four operation labels were correct: two CLICK, one DONE and
one BLOCKED. Both applicable click-target labels were also correct. The selected-operation
confidences were 0.98, 0.64, 0.87 and 0.83; their probability leaders and runners-up were 0.99/0.01,
0.72/0.17, 0.90/0.09 and 0.86/0.11 respectively. The target choices each had probability 1.00.

This is only four operation examples and two target examples. It contains no incorrect or
near-boundary calibration answer and cannot establish error rates or a broader confidence threshold.
It shows only that the existing maximum-uncertainty floor would not have stopped these correctly
labeled examples. That floor remains explicitly uncalibrated.

The separate evaluation used Pi 0.85.1's actual TUI, the production extension, real Jev and the real
Chrome DevTools CLI. The credential was sourced in the TUI's own terminal shell before Pi started;
its value and owning path are not recorded here. A two-step call correctly selected and clicked
`Continue to uncertainty evidence`, reached `evidence.html`, retained both fixture sources, and then
incorrectly selected PAGE_DOWN instead of the independently labeled DONE. It returned `step_budget`
rather than a completion claim. A separate one-step call from the destination selected PAGE_DOWN
again and also returned `step_budget`. These failed destination labels were retained without policy
or prompt retuning.

A separate Chrome CLI snapshot independently observed the destination URL, title and completion
warning after the navigation. Normalized direct HTTP reads independently matched both fixture source
statements. Thus the navigation and retained source evidence passed, but real Jev did not make the
expected completion choice on the actual destination in either evaluation call.

Cancellation was exercised while a real classifier request was active. The visible TUI result
returned `cancelled`, with one cancelled classifier diagnostic, no trace entry, one non-mutating
snapshot command and the source page unchanged. The ledger records that request as `cancelled` with
unknown billing, so its full US$0.002688 reservation remains charged to the local budget.

Across calibration, evaluation and cancellation, issue #5 attempted 8 requests: 7 valid responses
reported 5,406 input and 577 output tokens for US$0.000227052 actual cost, and 1 cancelled request
retains US$0.002688 unknown-billing reserve. Total committed cost is US$0.002915052. The shared issue
#5/#6 budget has 92 requests and US$4.997084948 remaining. Structured TUI metrics, independent checks,
sample limitations and exact accounting are retained in `jev-live-acceptance-2026-09-20.json`. This
was local fixture acceptance only; issue #6's public research benchmark was not run.

The task fixture page, server and live-acceptance TUI terminal were closed. The fixture listener and
ledger lock were absent afterward, and the Chrome process count returned from 10 with the task page
to the pre-run count of 9. The pre-existing Chrome daemon, selected `about:blank` page and unrelated
Paseo Pi terminal were retained.

## Issue #6 full research-workflow result

Date: 2026-09-20

The fixed cold and warm fast-loop research observations both failed the unchanged checklist. Their
recorded subtotals through independent verification were 390.615 seconds and 496.233 seconds, and
their provider-reported total main-model use was 379,345 and 780,308 tokens. Cleanup was outside both
timers; the first failed warm launch and recovery were also unmeasured. Full end-to-end totals are
therefore unknown. Both actual registered-tool calls stopped at `classifier_state_budget` after one
Chrome snapshot and before TypeSafe inference, so the primary trials made zero Jev requests and
supplied no multi-page fast-loop evidence. Pi completed each brief through allowed direct
official-document follow-ups; those fallbacks remained inside the measured research phase. The
briefs passed 13/20 and 15/20 items respectively and were not repaired.

Compared with the accepted normal observations, the fast-loop recorded-subtotal median was 443.424
seconds versus 436.812 seconds and 579,826.5 total tokens versus 561,805. Both paths had 0/2 verified
passes. Partial historical source-hash coverage and incomplete timing prevent a precise end-to-end
speed comparison. The result is therefore **NO-GO for the tested implementation's viability**, independently of
that missing speed total, because neither primary brief passed and the fast loop made zero primary
inferences. This is not a Jev quality finding. No starting page, prompt, step budget or uncertainty
threshold was retuned after the public-page failure; public-document navigation quality from Jev
decisions remains untested.

The separate loopback browser journey passed independently on both paths. Its recorded pre-cleanup
subtotal was 17.532 seconds and 21,597 main-model tokens for the fast loop versus 20.073 seconds and
27,425 tokens for ordinary Pi Chrome CLI. Cleanup timing is unknown, so this is not a precise
end-to-end speedup. Browser commands were seven on both paths. The fast loop used one successful Jev
request with 799 input and 97 output tokens at US$0.000033558 and returned the expected one-step
`step_budget` after the correct click. This is a narrow browser-only observation with `n=1`, not a
substitute for the primary result.

The primary numerical runs used Pi JSON mode for instrumentation. A post-benchmark actual Pi TUI
check, controlled through Paseo CLI, visibly reproduced only the registered tool's public
`classifier_state_budget` stop and made no Jev request. Real-tool TUI failure/cancellation behavior
was also verified, but the complete issue #6 research, synthesis, and verification workflow was not
repeated in the TUI; that literal acceptance item remains unmet. The combined 84-test check passed
before public trials. All task pages, fixture/TUI terminals, the fixture listener and ledger lock
were absent after cleanup. The pre-existing Chrome daemon, selected `about:blank` page and unrelated
Pi terminal were retained. The approval receipt, source-coverage audit, timing corrections, ML1
original-rubric adjudication, metrics, and limitations are in
[`RESEARCH-COMPARISON.md`](RESEARCH-COMPARISON.md).

## PR #8 review-correction TUI label check

Date: 2026-09-20

Pi 0.85.1's actual TUI was controlled through Paseo CLI with the loopback `index.html` fixture and a
deterministic fake classifier. A temporary test-only slash command invoked the exact `execute`
function captured from the registered `rlcd_brwsr_run` tool and displayed its returned content as a
TUI-only entry, avoiding both a main-model request and a Jev request. The visible JSON used
`lastObservedPage`, showed the observed fixture URL and title, and did not contain `finalPage`. The
TUI footer remained at US$0.000; the shared Jev ledger remained at 9 attempts and US$0.002948610
committed.

The task fixture page, loopback server, two task Paseo terminals and temporary extension were removed.
The pre-existing Chrome daemon, selected `about:blank` page and unrelated Paseo Pi terminal were
retained.
