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

## Remaining limits and retained evidence

This establishes the tested local behavior, not live provider compatibility,
model quality, public-site reliability, actual billing or general interruption
recovery. Hard termination/construction uncertainty has offline coverage, not a
real-browser cleanup guarantee. Native usage remains incomplete and absent from
Pi's top-level totals. Live acceptance and publication require separate approval;
GitHub issues describing the superseded implementation have not been closed or
represented as satisfied.

Raw, local-only artifacts remain under `artifacts/thin-python-build/`:

- `standards-review.md`, `spec-review.md`, `review-decisions.md`, and both rechecks;
- `spec-probes/` and `correction/` for reproductions and red/green logs;
- `tui/` for the first candidate, including setup attempts;
- `tui-correction/REPORT.md`, `LEDGER.md` and case evidence for the corrected head.

Earlier experiments and the cancelled, not-passed delivery gate remain historical
and unchanged. No push, PR, merge or new delivery-gate run was performed.
