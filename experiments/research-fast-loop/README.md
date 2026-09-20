# Research fast-loop fixtures

These fixtures demonstrate issues #3 and #4 without a TypeSafe API key or paid inference. The frozen issue #6 end-to-end protocol is in [`RESEARCH-PROTOCOL.md`](RESEARCH-PROTOCOL.md), its public command is `run-research-trial.mjs`, and the retained outcome is in [`RESEARCH-COMPARISON.md`](RESEARCH-COMPARISON.md).

1. Start `node experiments/research-fast-loop/serve-fixture.mjs`.
2. Open and select either loopback fixture with Chrome DevTools CLI:
   - `index.html` for the two-page link and retained-evidence journey;
   - `journey.html` for exact text, a native select, PageDown, PageUp, WAIT and a tab;
   - `ambiguous-select.html` for duplicate option labels backed by distinct source values; and
   - `adversarial.html` for untrusted instructions alongside relevant documentation and unrelated
     Login and Donate controls.
3. Explicitly load `experiments/research-fast-loop/fake-jev-extension.ts` with Pi's `-e` flag.
4. Call `rlcd_brwsr_run`. For `journey.html`, include the exact quoted value
   `"Jev fast — café docs"` and use at least seven steps.

The injected responder is Jev-shaped but deterministic. It answers all non-empty speculative target
heads while the runner consumes only the head for the selected operation. It makes no network or
model requests. The main extension remains at `config/pi/extensions/rlcd-brwsr.ts`; this file is only
the offline host-check adapter and is not installed globally.

## Real Jev trial controls

The production extension now uses built-in `fetch` with the pinned `jev-1.13.0` model and the
`TYPESAFE_API_KEY` environment variable. It sends one request containing the runner's generic map of
operation and conditional target questions. Use `run-jev-calibration.ts` only for the four labeled
calibration cases; those examples are separate from later TUI evaluation trials. The calibration
script feeds labeled accessibility snapshots through the exported production runner, so candidate
construction, state and question wording come from the extension rather than a copied request.

Every real request for issues #5 and #6 must use the repository ledger at
`../jev-trial-ledger.json`. The corresponding non-secret owner-approval scope and cumulative caps are
retained in [`../jev-trial-approval.json`](../jev-trial-approval.json). The adapter reserves one
64k-input-token worst-case request before calling TypeSafe, records reported usage after a valid
response, and retains the full reservation when
billing is unknown after an error or cancellation. Never set `ledgerPath: false` outside offline
contract tests. Do not run trials concurrently; the adjacent `.lock` directory blocks overlapping
writers and a surviving lock after a crash requires checking that no trial process remains before
manual cleanup.

Before issue #6 sends any request:

1. Re-read `https://docs.typesafe.ai/models` and stop if the pinned model or input price no longer
   fits the recorded reservation.
2. Read the ledger, count every attempt, and sum `actualUsd` where present or `reservedUsd` where
   actual billing is unknown.
3. Keep the existing 100-request / US$5 cumulative caps and use `trialIssue: 6` with a short
   non-sensitive purpose. Do not replace or reset the ledger.
4. Source the host-owned credential without printing it, then run the child process in that shell.

The research-trial command writes schema-v2 success metrics with separate measured-work, cleanup,
and full-total timing. A failed invocation writes `failure.json` after its cleanup attempt, including
the failed stage, measured failure/cleanup timing, final page state, and ledger-attempt count when
available. Historical 2026-09-20 totals remain unknown where those timestamps were not retained.

The model page currently documents a 64k shared request context and a 32k limit for state plus the
longest question, while the primitives page describes the request budget as around 32k. The adapter
therefore keeps the runner's 8,000-character state bound and also rejects an HTTP payload over 24,000
UTF-8 bytes, rather than relying on the larger figure. Its cost reservation still uses the documented
64k maximum. The selected pre-evaluation uncertainty floor stops an applicable operation or target
head only when it is maximally uncertain (zero confidence or no unique probability leader within the
0.001 validation tolerance); uncertainty on unused speculative heads is retained but ignored. This
is not a calibrated general threshold. Broader gating must wait for labeled real-model results.

Chrome DevTools CLI 1.7.0 replaces each native option's AX `value` with its displayed name in the
snapshot. Its `fill` implementation resolves that name to the first matching option before reading the
underlying DOM value. RLCD-brwsr therefore uses a unique observed option name as the executable value
and returns `ambiguous_select_option` without classification when one field exposes duplicate names.
It does not interpret an option UID or the rewritten AX `value` as a distinct fill value. A UID is
rechecked against the decision snapshot and the CLI can reject a missing or detached target, but a
surviving UID does not prove that the element still has the same meaning.

The adversarial fixture's fake responder deliberately returns an excluded, unoffered target choice.
The fixture verifies ordinary-code response validation and the absence of a dispatched mutation; it
does not use real Jev and does not establish prompt-injection immunity for Jev or unseen pages.

Pi schedules this tool sequentially, but that is not a page lock. Another Chrome client or a person
can still change the selected page during a run.

For the lifecycle check, select `lifecycle.html` and invoke the same registered tool. The fake
classifier selects `Open slow documentation`; `/slow` delays its response for 60 seconds. Use a
one-second tool budget for timeout, or a longer budget and cancel the active tool in Pi for
cancellation. This path uses the production `createChromeCliExecutor(pi.exec)` adapter inside the
real runner. Compare `pgrep -lf chrome-devtools` before dispatch, while the tool runs, and after its
result to identify the task-created CLI client without stopping the pre-existing executor daemon.
List pages before and after, close only the task-created fixture page, and preserve unrelated pages.
The removed `check-cli-lifecycle.mjs` spawn surrogate is not valid evidence for runner cleanup.
