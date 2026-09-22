# Thin Python rewrite - local verification

Tested implementation: `b3b42036685eba64f3e7bc8ccc296e16b9910fe9`.
The initial rewrite is `3f984e54`; the corrected implementation was checked again,
not accepted solely on the earlier candidate's results.

## Automated and review checks

- `pnpm check`: 20 passing tests, TypeScript checks, formatting and Python
  compilation. The tests cross the registered tool, real Python runner and
  pinned upstream Agent/native helper, replacing external browser/provider work.
- `uv lock --check`, shell syntax and Git whitespace checks passed. Dependency
  pins and both lockfiles are unchanged.
- A deliberately broken close-acknowledgement guard made its public-seam test
  fail, then passed after restoration.
- Four correction regressions were observed red before their fixes: native
  workspace helper conflicts masked by defaults; post-dispatch projection
  interruption misreported as not started; terminal claims trusted after a
  nonzero exit; and output fitting replacing the parent's time-budget stop.
  Additional checks cover a flushed terminal followed by forced termination,
  invalid envelopes and child-native-environment key privacy.
- Independent targeted Standards and Spec rechecks found no unresolved
  documented-standard or specification defect. A test-only scenario-branching
  maintainability heuristic was deferred rather than adding a fake framework.

The corrected supervisor requires a valid terminal envelope and a clean observed
exit before accepting child claims. Forced/non-clean/incomplete outcomes remain
unknown, with the parent's first stop and observed process reap preserved.
Native Harness environment loading precedes selected-helper defaults and conflict
checks in both the runner and preflight.

## Actual Pi TUI and Chrome

Four cases passed again at the corrected implementation, each in a fresh Pi
0.85.1 TUI with the real runner, upstream Agent, existing Harness and approved
isolated Chrome. Jev and helper HTTP replies were synthetic. Independent CDP and
process observers checked outcomes rather than trusting the completion claim.

| Case                     | Independent observation                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Click, default close     | `ORBIT-27` observed on the exact task target before close; runner exited and target disappeared.                                             |
| Text, explicit retention | `Busan` and `FIELD-41` observed on the exact retained target after runner exit; only that target was then closed with a successful response. |
| Time budget              | Delayed synthetic reply reached; result was `stopped/time_budget`; actual runner exit and task-target absence verified.                      |
| TUI Escape               | Escape sent during the visible command's run; result was `stopped/cancelled`; actual runner exit and task-target absence verified.           |

Each case restored the exact four-target baseline. The fixture, observer/Pi
terminals, runner processes and task tabs were stopped or independently observed
absent; fixture port 43113 was free. The existing isolated Chrome, Harness and
profile were retained, not installed or restarted by this build.

**Invocation limitation:** a test slash command loaded the production extension
and invoked the registered tool definition's real `execute` method. These were
not outer-LLM-issued tool turns and do not verify Pi's entire agent-turn/tool
scheduling path. The isolated Pi state had no copied authentication or model;
no outer Pi, Jev or OpenRouter inference was performed.

## Bounded live follow-up

The user subsequently authorized one native Ling helper probe followed by one
30-second local browser fixture through a normal Pi agent turn. Both passed at
`4e243c24` (unchanged production `b3b42036`). The existing host-local TypeSafe and
OpenRouter keys were loaded only into test process environments; no credential
file was copied or global Pi configuration changed.

- The unchanged native helper returned validated `Busan` in 1,450 ms. OpenRouter
  reported model `inclusionai/ling-3.0-flash`, provider `DeepInfra`, 186 tokens,
  zero reasoning tokens and cost `0.00001212` USD. The request used JSON mode and
  disabled reasoning. These are observations of one successful call, not a
  latency/reliability guarantee or universal routing claim.
- In a fresh, explicitly scoped Pi TUI, the existing outer model
  `openai-codex/gpt-5.6-sol` issued exactly one standard `rlcd_brwsr_run` tool
  call. Pi's normal tool lifecycle executed the production extension with live
  Jev and Ling. No model reply was substituted. The browser tool returned in
  about 3,865 ms with a completion claim and a retained target.
- After independent observation of Python exit, direct CDP inspection of that
  exact existing target verified `Busan` and `FIELD-41` without navigation.
  Exact-target closure succeeded and restored the four-target baseline. This
  live case covers the normal agent-turn path that the earlier test commands
  did not cover; it does not cover every user extension/configuration.
- Two Jev decision records and one helper record were retained by the browser
  run. Two outer Pi completions were observed. Record counts are not asserted
  to be HTTP attempt counts; upstream retries and failed-call usage remain
  unknown, and no manual retry or extra browser-tool call occurred.

Keep cost provenance separate. OpenRouter's two successful helper responses
report `0.00002634` USD together. Pi separately calculates a `0.01443` USD
rate-based estimate for the outer model; it is not an observed Codex bill or
additional charge. TypeSafe cost and complete billing remain unknown. The
30-second browser limit was a time limit, not a spend cap.

The two loaded native key values were absent from a full-value scan of the
local artifacts; Pi OAuth secrets were not inspected. The fixture, runner,
observers and temporary terminals were stopped. Chrome/Harness, their profile,
unrelated terminals and the four-target baseline remain retained.

## Remaining limits and retained evidence

The live follow-up establishes this helper payload and this local fixture, not
general model quality, public-site reliability, complete billing or general
interruption recovery. Hard termination/construction uncertainty has offline
coverage, not a real-browser cleanup guarantee. Native usage remains incomplete
and absent from Pi's top-level totals. A benign public-site acceptance task and
publication remain pending; GitHub issues describing the superseded
implementation have not been closed or represented as satisfied.

Raw, local-only artifacts remain under `artifacts/thin-python-build/`:

- `standards-review.md`, `spec-review.md`, `review-decisions.md`, and both rechecks;
- `spec-probes/` and `correction/` for reproductions and red/green logs;
- `tui/` for the first candidate, including setup attempts;
- `tui-correction/REPORT.md`, `LEDGER.md` and case evidence for the corrected head.

Live evidence remains separately under `artifacts/thin-python-live/`: `REPORT.md`,
`CALL-LEDGER.md`, `RESOURCE-LEDGER.md`, request/response metadata, standard Pi tool
lifecycle events and independent target/process observations. Raw responses,
authorization headers and credential values were not retained.

Earlier experiments and the cancelled, not-passed delivery gate remain historical
and unchanged. No push, PR, merge or new delivery-gate run was performed.
