# Baseline results

## Outcome

Two genuine normal-Pi observations were retained: one cold and one warm. Both
produced substantial cited briefs, and both received `FAIL` from fresh independent
evaluation contexts under the fixed all-items-must-pass rule. Verified success
was therefore **0/2 (0%)**. The failures are retained rather than repaired or
hidden; a later fast-loop comparison must meet the same checklist.

The cold brief passed 16 of 20 checklist items. It missed complete uncertainty
semantics (`UN1`), explicit handoff of uncertain/consequential cases to Pi
(`UN2`), the full no-prose/no-code/no-explanation capability boundary and Pi's
retained synthesis/recovery role (`ML2`), and the population-level meaning of
calibration (`ML4`). Its evaluator found no unsupported affirmative claim or bad
citation.

The warm brief passed 15 of 20 items. It missed the genuine serial-dependency
exception to fan-out (`SF3`), complete Choice/Score/Noul uncertainty semantics
(`UN1`), Pi's retained synthesis/recovery role (`ML2`), and the population-level
calibration and harmless-label caveats (`ML4`). It also failed citation
correctness (`SC2`) because the nearby API citation did not itself support
built-in `fetch` or the versioned-response wording; the Models page supported
the latter elsewhere.

## Observations and medians

Each condition has `n=1`, so its condition median equals its observation. The
pooled two-run median follows the predeclared even-sample arithmetic-mean rule;
it is descriptive only and does not make the failed outcomes successful.

| Metric | Cold / median (`n=1`) | Warm / median (`n=1`) | Pooled median (`n=2`) |
|---|---:|---:|---:|
| Verified outcome | FAIL | FAIL | 0/2 pass |
| Whole-task wall time | 366.754 s | 494.940 s | 430.847 s |
| Research wall time | 161.126 s | 241.781 s | 201.454 s |
| Independent verification wall time | 205.597 s | 253.129 s | 229.363 s |
| Main-model turns | 14 | 19 | 16.5 |
| Provider-reported input tokens | 117,417 | 110,824 | 114,120.5 |
| Provider-reported output tokens | 16,491 | 19,349 | 17,920 |
| Provider-reported cache-read tokens | 278,272 | 349,184 | 313,728 |
| Provider-reported cache-write tokens | 0 | 0 | 0 |
| Provider-reported total tokens | 412,180 | 479,357 | 445,768.5 |
| Direct documentation HTTP responses/attempts | 27 | 24 | 25.5 |
| Browser commands | 0 | 0 | 0 |
| Jev requests / tokens | 0 / 0 | 0 / 0 | 0 / 0 |
| Failed tool calls | 0 | 0 | 0 |
| Retained baseline-owned processes | 0 | 0 | 0 |
| Retained browser pages | 0 | 0 | 0 |

Across both observations, the measured workflow used 33 main-model turns,
891,537 provider-reported total tokens (including 627,456 cache-read tokens), 51
direct documentation responses/attempts, no browser command and no Jev call.
The warm observation was slower and used more turns and total tokens than the
cold observation. With one observation per condition, that is an observation,
not a claim about cache effects or expected performance.

## Configuration and comparability

Both runs used Pi `0.85.1`, `openai-codex/gpt-5.6-sol`, reasoning `xhigh`, Node
`v26.6.0`, and the same `darwin-arm64` host. `PI_CACHE_RETENTION` was unset. Each
research and evaluation phase started with `--no-session`; provider-reported
cache use is recorded honestly despite the cold/warm labels. The input hashes in
both metrics files are identical.

All retained source URLs are official `docs.typesafe.ai` pages. Retrieval records
include UTC start/completion timestamps, status, byte count and body SHA-256.
Pages fetched in both trials retained identical hashes during the measured
window. Evaluators found no broken links or current model-ID drift, while
recording live documentation discrepancies in their reports.

Whole-task time includes isolated input preparation, Pi startup, retrieval,
synthesis, brief handoff, independent citation retrieval and evaluation. It
excludes one-time protocol development. Verification is reported as a separate
phase and is included in the total. Stale decisions and consequential-action
stops are not applicable to this non-browser baseline.

Recovery work beyond failed tool calls is unavailable: Pi's event stream does
not distinguish recovery reasoning from ordinary work. No failed tool call was
observed. Raw event streams and sessions were intentionally not retained because
they can contain reasoning and private host paths, so no finer recovery or hidden
network accounting is claimed.

## Retained artifacts

- [`runs/2026-09-19-cold-1/brief.md`](runs/2026-09-19-cold-1/brief.md)
- [`runs/2026-09-19-cold-1/evaluation.md`](runs/2026-09-19-cold-1/evaluation.md)
- [`runs/2026-09-19-cold-1/metrics.json`](runs/2026-09-19-cold-1/metrics.json)
- [`runs/2026-09-19-cold-1/retrievals.jsonl`](runs/2026-09-19-cold-1/retrievals.jsonl)
- [`runs/2026-09-19-warm-1/brief.md`](runs/2026-09-19-warm-1/brief.md)
- [`runs/2026-09-19-warm-1/evaluation.md`](runs/2026-09-19-warm-1/evaluation.md)
- [`runs/2026-09-19-warm-1/metrics.json`](runs/2026-09-19-warm-1/metrics.json)
- [`runs/2026-09-19-warm-1/retrievals.jsonl`](runs/2026-09-19-warm-1/retrievals.jsonl)
