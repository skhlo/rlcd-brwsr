# Issue #6 research-workflow protocol

Status: frozen before public-documentation trials on 2026-09-20.

This protocol compares RLCD-brwsr with the accepted normal-Pi observations for
the fixed task in
[`../typesafe-research-baseline/task.md`](../typesafe-research-baseline/task.md).
It tests whether the added fast-loop capability improves the whole research
workflow. It does not assume that the fast loop wins.

## Fixed comparison inputs

- Topic, wording, shared context commit (`6d7aa3f294e8da64aaa2b2ae5958c846e18472e3`), and strict checklist are the
  same as the accepted normal baseline.
- Main model is `openai-codex/gpt-5.6-sol` at `xhigh` under Pi `0.85.1`.
- The accepted baseline is only `2026-09-19-normal-cold-1` and
  `2026-09-19-normal-warm-1`. The constrained pilots remain excluded.
- The baseline outcomes remain honest failures: cold was 19/20 with a
  417.316 s runner-recorded subtotal; warm was 15/20 with a 456.307 s
  runner-recorded subtotal. Their pooled subtotal median was 436.812 s, but
  failed outcomes are not converted to successes. Full end-to-end totals were
  not retained.
- One cold and one immediately subsequent warm fast-loop observation are
  sufficient. Each condition has `n=1`; no statistical-significance claim is
  permitted.

The researcher starts in a fresh no-session context without a prior brief,
evaluation, or source packet. Normal Pi resources remain enabled. The runner
adds the issue #6 real-Jev extension explicitly. The evaluator starts in a
separate fresh no-session context, receives the resulting brief and unchanged
checklist, and has `TYPESAFE_API_KEY` removed.

## Frozen fast-loop policy

The runner times creation and selection of a new Chrome page at
`https://docs.typesafe.ai/concepts/how-to-build-with-system-one`. This page
preparation is included in the recorded work subtotal and in browser-command
counts. The retained 2026-09-20 runner ended that subtotal before cleanup; the
future runner now separately records work, cleanup, and the full total. The
researcher then makes exactly one registered `rlcd_brwsr_run` call with the
goal and budgets frozen in [`prompts/research.md`](prompts/research.md): six
steps and 120 seconds.

The production runner, Chrome CLI adapter, pinned `jev-1.13.0` HTTP adapter,
shared ledger, and existing uncertainty policy are used unchanged. The policy
stops only when the applicable operation or selected target has zero confidence
or lacks a unique probability leader outside the 0.001 response-validation
tolerance. This floor remains uncalibrated; issue #5's four operation labels
and two target labels are too small a sample to tune it. No prompt, threshold,
step budget, or starting page will be changed after seeing these trials.

A Jev `DONE` is only a completion claim. The researcher must independently
check retained evidence and may use direct official Markdown/HTTP follow-ups to
verify citations or fill gaps. This work stays inside the measured research
phase. It is an allowed completion path, not a forced browser restriction and
not a new fast-loop capability. Instrumented helper requests are exact; total
HTTP requests remain unknown when Pi chooses another normal path.

The evaluator applies all 20 checklist items and retrieves sources again. Its
wall time and main-model tokens are part of the recorded work subtotal. The
event summary cannot reliably separate evidence gathering, synthesis, and
recovery reasoning, so the research phase is reported as a combined evidence-
and-synthesis time and unobserved recovery work remains unknown.

## Comparability and source drift

[`source-comparability-2026-09-20.json`](source-comparability-2026-09-20.json)
re-fetched the 12 instrumented URLs retained by the accepted normal warm
research phase. Status, byte length, and SHA-256 matched for those 12 sources.
The accepted cold research and both evaluator phases used uninstrumented source
paths, so their historical response hashes are unknown; this includes
`concepts/system-one.md` and `primitives/noul.md`, which have no accepted-warm
run hash. A rerun cannot retrospectively establish those old bytes. The model
page still documented `jev-1.13.0`, US$0.042 per million input tokens, free
output, 64k shared request context, and a 32k state-plus-longest-question limit.
The fixed task, checklist, and context hashes match the accepted baseline. The
checked warm subset showed no drift, but full historical source matching is not
proved and no normal condition was rerun.

## Paid budget

The issue #5/#6 ledger is cumulative and must never be reset. Before issue #6,
it held eight attempts: seven successful responses with US$0.000227052 actual
cost and one unknown-billing cancellation reserving US$0.002688. Committed cost
was US$0.002915052, leaving 92 requests and US$4.997084948. Issue #6 calls use
`trialIssue: 6` and a condition-specific purpose. Primary and secondary work
target no more than 40 additional attempts and runs sequentially. Errors and
cancellations remain in the ledger; unknown billing retains the full
reservation.

## Primary outcome and recommendation rule

For each trial retain the brief, independent evaluation, retrieval records, and
metrics. Report verified outcome, measured work subtotal, cleanup time and full
total where genuinely retained, phase wall times, main-model turns/tokens, Jev
attempts/tokens/cost, browser commands, instrumented direct HTTP attempts, stop
reasons, stale decisions, observable failures, recovery limits, page cleanup,
and cumulative budget. Unknown timing is reported as unknown, never reconstructed
as zero.

Recommend **GO** only if the fast-loop briefs meet the same all-items-must-pass
checklist and the cold/warm median improves either whole-task wall time or
main-model use. Any regression in the other metric must be explicit. Otherwise
recommend **NO-GO**. A failed outcome, no speed/token improvement, or inability
to run is retained rather than tuned away.

## Secondary browser-only journey

The secondary result uses the loopback `index.html` to `evidence.html` journey
and the same goal for two fresh Pi contexts:

> Navigate from the RLCD research start page to the uncertainty evidence page,
> then independently verify the destination title and completion-warning text.

The ordinary condition uses agent-driven Chrome CLI commands. The fast-loop
condition uses one real-Jev registered-tool call with one step, followed by a
separate Chrome CLI snapshot for independent verification. Page preparation is
timed in both. The fixture server is shared setup and reported separately. Wall
time, model use, Chrome commands, Jev use, and independently asserted outcomes
are reported separately from the primary benchmark. This journey can explain
execution cost but cannot substitute for the research-workflow outcome.

## Host acceptance and cleanup

Before paid public trials, run the complete repository check on the combined
version. Existing issue #5 real-TUI cancellation and timeout evidence may be
reused only because the production runner and adapters are unchanged; modified
trial registration and measurement paths receive their own tests and live use.
After the primary trials, run one visible Pi TUI public-documentation check
through Paseo CLI without retaining raw reasoning.

Close only task-created fixture or documentation pages and stop task-created
servers and Paseo terminals. Preserve the pre-existing Chrome daemon,
`about:blank` page, and unrelated Pi terminal. Report surviving processes and
pages as observed; do not claim that ending a CLI client rolled back a
previously dispatched browser mutation.
