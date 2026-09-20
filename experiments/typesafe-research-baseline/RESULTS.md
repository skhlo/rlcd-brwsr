# Baseline results

## Corrected normal-Pi outcome

One genuine cold and one genuine warm normal-Pi observation were retained. Both
used fresh researcher and evaluator contexts, normal Pi resource discovery, the
available TypeSafe skill and unrestricted normal documentation paths. Neither
researcher received an earlier brief or evaluation. Both briefs received `FAIL`
from their fresh independent evaluator under the unchanged all-items-must-pass
rule. Verified success was therefore **0/2 (0%)**. The failures are retained rather
than repaired or hidden; a later fast-loop comparison must meet the same checklist.

The cold brief passed 19 of 20 items. It missed the complete uncertainty semantics
in `UN1`: Score confidence, Noul's lack of separate confidence and the distinction
between typed structure and truth.

The warm brief passed 15 of 20 items. It failed `QD2`, `RV1`, `UN1`, `ML4` and
`SC2`: the control inventory was not explicit; response validation omitted a
numeric probability tolerance, unexpected-ID rejection and unconditional usage
validation; uncertainty semantics were incomplete; population calibration and
harmless-label caveats were incomplete; and one nearby confidence citation did
not support the full claim.

## Corrected observations and medians

Each condition has `n=1`, so its condition median equals its observation. The
pooled two-run median follows the predeclared even-sample arithmetic-mean rule; it
is descriptive only and does not make the failed outcomes successful.

| Metric | Cold / median (`n=1`) | Warm / median (`n=1`) | Pooled median (`n=2`) |
|---|---:|---:|---:|
| Verified outcome | FAIL | FAIL | 0/2 pass |
| Whole-task wall time | 417.316 s | 456.307 s | 436.812 s |
| Research wall time | 227.577 s | 220.120 s | 223.849 s |
| Independent verification wall time | 189.695 s | 236.138 s | 212.917 s |
| Main-model turns | 22 | 11 | 16.5 |
| Provider-reported input tokens | 176,415 | 124,331 | 150,373 |
| Provider-reported output tokens | 19,227 | 20,917 | 20,072 |
| Provider-reported cache-read tokens | 548,736 | 233,984 | 391,360 |
| Provider-reported cache-write tokens | 0 | 0 | 0 |
| Provider-reported total tokens | 744,378 | 379,232 | 561,805 |
| Instrumented `fetch-doc` attempts | 0 | 12 | 6 |
| Total direct HTTP requests | unknown | unknown | unknown |
| Observable browser tool calls | 0 | 0 | 0 |
| Total browser commands | unknown | unknown | unknown |
| Jev requests / tokens | 0 / 0 | 0 / 0 | 0 / 0 |
| Failed tool calls | 0 | 0 | 0 |
| Retained baseline-owned descendants | unknown | unknown | unknown |
| Retained browser pages | unknown | unknown | unknown |

Across both observations, the workflow used 33 main-model turns and 1,123,610
provider-reported total tokens, including 782,720 cache-read tokens. The warm
observation was slower but used fewer turns and fewer total tokens than the cold
observation. With one observation per condition, these are observations, not
claims about cache effects or expected performance.

## Configuration and comparability

Both corrected runs used Pi `0.85.1`, `openai-codex/gpt-5.6-sol`, reasoning
`xhigh`, Node `v26.6.0`, and the same `darwin-arm64` host. `PI_CACHE_RETENTION` was
unset. Each research and evaluation phase started with `--no-session`;
provider-reported cache use is recorded despite the cold/warm labels. Input hashes
are identical across the two runs. The context hashes correspond to files read
directly from Git object `6d7aa3f294e8da64aaa2b2ae5958c846e18472e3`, not the working tree.

Whole-task time includes isolated input preparation, Pi startup, retrieval,
synthesis, brief handoff, independent source checking and evaluation. It excludes
one-time protocol development. Verification is reported separately and included
in the total. Stale decisions and consequential-action stops do not apply to this
non-fast-loop baseline.

The optional helper produced no retrieval records in the cold run and 12 in the
warm research phase. Other normal direct HTTP and Chrome paths were permitted.
Because the event summary cannot fully count those unrestricted paths, total HTTP
requests and browser commands are unknown rather than inferred from helper records
or reported as zero. Source URLs remain in each brief and citation audit; exact
helper timestamps and hashes are retained when the helper was used. The accepted
cold observation did not use the helper and therefore has no source-level
retrieval timestamps or hashes, only trial and phase timestamps. That historical
acceptance limit is retained rather than reconstructed from later fetches.

Recovery work beyond failed tool calls is unavailable because the summarized Pi
events do not distinguish it from ordinary work. Retained descendants are
unavailable because direct child exit does not establish descendant exit. Retained
browser pages are unavailable because the runner neither inspects nor changes
pre-existing browser state.

## Constrained pilots - archival only

The earlier `2026-09-19-cold-1` and `2026-09-19-warm-1` runs disabled extensions,
skills and prompt templates, restricted Pi's tools, and required every network
request to use `fetch-doc.mjs`. Those runs are **constrained pilots, not accepted
normal-Pi baseline observations**. Their raw briefs, evaluations and retrieval
logs remain unchanged for archival fidelity. Their former retained-process zero
was derived only from direct child exit; corrected metrics mark descendant
retention unavailable.

The pilot cold and warm briefs failed at 16/20 and 15/20 checklist items,
respectively. Their 366.754 s and 494.940 s wall times, 14 and 19 turns, and exact
27 and 24 helper attempts describe only that constrained protocol. Do not pool
those figures with the corrected observations or use them as the issue #2
baseline.

## Retained artifacts

Corrected normal-Pi observations:

- [`runs/2026-09-19-normal-cold-1/brief.md`](runs/2026-09-19-normal-cold-1/brief.md)
- [`runs/2026-09-19-normal-cold-1/evaluation.md`](runs/2026-09-19-normal-cold-1/evaluation.md)
- [`runs/2026-09-19-normal-cold-1/metrics.json`](runs/2026-09-19-normal-cold-1/metrics.json)
- [`runs/2026-09-19-normal-cold-1/retrievals.jsonl`](runs/2026-09-19-normal-cold-1/retrievals.jsonl)
- [`runs/2026-09-19-normal-warm-1/brief.md`](runs/2026-09-19-normal-warm-1/brief.md)
- [`runs/2026-09-19-normal-warm-1/evaluation.md`](runs/2026-09-19-normal-warm-1/evaluation.md)
- [`runs/2026-09-19-normal-warm-1/metrics.json`](runs/2026-09-19-normal-warm-1/metrics.json)
- [`runs/2026-09-19-normal-warm-1/retrievals.jsonl`](runs/2026-09-19-normal-warm-1/retrievals.jsonl)

Constrained pilots:

- [`runs/2026-09-19-cold-1/`](runs/2026-09-19-cold-1/)
- [`runs/2026-09-19-warm-1/`](runs/2026-09-19-warm-1/)
