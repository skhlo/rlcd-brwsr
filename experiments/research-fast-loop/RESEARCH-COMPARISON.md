# Full TypeSafe research-workflow comparison

Date: 2026-09-20

## Recommendation: NO-GO

Do not roll out RLCD-brwsr for the full TypeSafe documentation research
workflow from this experiment.

Both fast-loop briefs failed the same strict checklist as the accepted normal
baseline. The public documentation page exceeded the runner's 8,000-character
classifier-state bound before inference in both conditions, so the fast loop
provided no multi-page evidence and made no Jev request. Pi recovered with
ordinary official-document retrieval, but that is fallback work rather than an
added fast-loop capability. The fast-loop pooled median was also 6.612 seconds
slower and used 18,021.5 more provider-reported total main-model tokens than the
accepted normal observations.

The separate fixture journey found a narrower browser-execution win: both paths
were independently correct, and the fast-loop observation was 2.541 seconds
faster with 5,828 fewer main-model tokens. That result does not substitute for
the failed primary hypothesis.

## Comparability

The protocol was frozen in
[`RESEARCH-PROTOCOL.md`](RESEARCH-PROTOCOL.md) before public trials. The task,
20-item checklist, evaluator prompt, and three context files have the same
hashes as the accepted normal baseline. All runs used Pi 0.85.1,
`openai-codex/gpt-5.6-sol`, reasoning `xhigh`, Node 26.6.0, and the same host.
The fast-loop researcher received no prior answer, evaluation, or source
packet. Direct official Markdown/HTTP follow-up remained allowed and counted
where observable; this was not a forced browser-only comparison.

The live comparability snapshot re-fetched all 12 sources retained by the
accepted normal warm run. Every HTTP status, byte length, and SHA-256 matched.
The model and price also remained `jev-1.13.0` at US$0.042 per million input
tokens, with free output tokens. No source, context, or model drift required a
normal-condition rerun. See
[`source-comparability-2026-09-20.json`](source-comparability-2026-09-20.json).

The accepted normal observations remain failures and are not repaired or
relabelled:

- cold: **FAIL**, 19/20, 417.316 s;
- warm: **FAIL**, 15/20, 456.307 s.

The constrained baseline pilots are not used.

## Primary end-to-end observations

| Metric                            |            Normal cold |            Fast-loop cold |            Normal warm |            Fast-loop warm |
| --------------------------------- | ---------------------: | ------------------------: | ---------------------: | ------------------------: |
| Verified outcome                  |           FAIL (19/20) |              FAIL (13/20) |           FAIL (15/20) |              FAIL (15/20) |
| Whole-task wall time              |              417.316 s |                 390.615 s |              456.307 s |                 496.233 s |
| Page preparation                  | included, not separate |                   3.021 s | included, not separate |                   2.149 s |
| Research / evidence and synthesis |              227.577 s |                 154.813 s |              220.120 s |                 238.224 s |
| Independent verification          |              189.695 s |                 232.735 s |              236.138 s |                 255.800 s |
| Main-model turns                  |                     22 |                        13 |                     11 |                        23 |
| Input tokens                      |                176,415 |                   115,975 |                124,331 |                   112,107 |
| Output tokens                     |                 19,227 |                    19,402 |                 20,917 |                    23,337 |
| Cache-read tokens                 |                548,736 |                   243,968 |                233,984 |                   644,864 |
| Provider-reported total tokens    |                744,378 |                   379,345 |                379,232 |                   780,308 |
| Instrumented direct HTTP attempts |                      0 |                         9 |                     12 |                         7 |
| Total direct HTTP requests        |                unknown |                   unknown |                unknown |                   unknown |
| Exact measured browser commands   |                unknown |                         4 |                unknown |                         4 |
| Jev requests / tokens             |                  0 / 0 |                     0 / 0 |                  0 / 0 |                     0 / 0 |
| Fast-loop stop reason             |                    n/a | `classifier_state_budget` |                    n/a | `classifier_state_budget` |
| Stale decisions                   |                    n/a |                         0 |                    n/a |                         0 |
| Consequential-action stops        |                    n/a |                         0 |                    n/a |                         0 |
| Observable failed tool calls      |                      0 |                         1 |                      0 |                         0 |

Each condition has `n=1`. The pooled two-observation median uses the predeclared
arithmetic mean for an even sample and is descriptive only.

| Pooled metric (`n=2`)       |    Normal | Fast loop |   Fast-loop delta |
| --------------------------- | --------: | --------: | ----------------: |
| Verified pass rate          |       0/2 |       0/2 |    no improvement |
| Whole-task wall-time median | 436.812 s | 443.424 s |  +6.612 s (+1.5%) |
| Main-model turn median      |      16.5 |        18 |      +1.5 (+9.1%) |
| Input-token median          |   150,373 |   114,041 |  -36,332 (-24.2%) |
| Output-token median         |    20,072 |  21,369.5 |  +1,297.5 (+6.5%) |
| Cache-read-token median     |   391,360 |   444,416 |  +53,056 (+13.6%) |
| Total-token median          |   561,805 | 579,826.5 | +18,021.5 (+3.2%) |
| Research-phase median       | 223.849 s | 196.519 s |         -27.330 s |
| Verification-phase median   | 212.917 s | 244.268 s |         +31.351 s |

The cold fast-loop observation was quicker and used fewer total tokens than its
normal cold counterpart. The warm observation reversed both results. With one
observation per condition, this is not evidence of a cache effect or expected
performance. Across both observations the fast-loop path used 36 main-model
turns and 1,159,653 total tokens, compared with 33 turns and 1,123,610 total
tokens for normal Pi.

The fast-loop checklist omissions were retained as observed. Cold failed RV1,
UN1, UN2, UN3, ML1, ML2, and ML4. Warm failed RV1, UN1, UN2, ML2, and ML4.
Both briefs accurately disclosed the state-budget stop and then used targeted
official follow-up retrievals. Neither result is treated as a fast-loop
completion.

### Public-page failure mode

The actual registered tool took one Chrome snapshot in each primary trial. The
full TypeSafe documentation page exposed enough accessibility text and
code-owned control candidates that serializing the classifier request exceeded
the existing 8,000-character state bound. The runner returned
`classifier_state_budget` before reserving the ledger or calling TypeSafe.
There was no completion claim, stale decision, browser mutation, or hidden paid
attempt.

The prompt, starting page, six-step budget, and uncertainty floor were not
retuned after this result. Direct retrieval let Pi finish a brief, but it did
not demonstrate the proposed fast evidence-gathering loop. The same stop was
visible in the post-benchmark actual TUI check; see
[`public-tui-acceptance-2026-09-20.json`](public-tui-acceptance-2026-09-20.json).

## Secondary browser-only observation

A separate `index.html` to `evidence.html` fixture journey isolated browser
execution. Both fresh Pi contexts started with timed page preparation, used the
same navigation goal, and independently confirmed the destination URL, title,
and completion-warning text. The ordinary path used direct Chrome CLI actions.
The fast-loop path used real Jev for one bounded decision, then a separate
Chrome snapshot. Its `step_budget` was expected after the one-step click and was
not treated as a completion claim.

| Metric (`n=1` each)                                    | Ordinary Pi Chrome CLI |      Fast loop |             Delta |
| ------------------------------------------------------ | ---------------------: | -------------: | ----------------: |
| Independently verified outcome                         |                   PASS |           PASS |              same |
| Wall time, including page preparation and verification |               20.073 s |       17.532 s | -2.541 s (-12.7%) |
| Main-model turns                                       |                      4 |              3 |                -1 |
| Main-model total tokens                                |                 27,425 |         21,597 |   -5,828 (-21.3%) |
| Browser commands                                       |                      7 |              7 |                 0 |
| Jev requests                                           |                      0 |              1 |                +1 |
| Jev input / output tokens                              |                  0 / 0 |       799 / 97 |        +799 / +97 |
| Jev actual cost                                        |                   US$0 | US$0.000033558 |   +US$0.000033558 |
| Fast-loop stop reason                                  |                    n/a |  `step_budget` |               n/a |

This is one small loopback journey, not a statistical result and not a public
research workload. The shared fixture-server startup was excluded from both
journey times and is disclosed in
[`browser-journey-comparison-2026-09-20.json`](browser-journey-comparison-2026-09-20.json).

## Budget

Issue #6 made one paid request, only in the secondary browser journey. It
succeeded with 799 input and 97 output tokens at US$0.000033558. Primary cold,
primary warm, the visible public TUI check, and their state-budget stops made no
requests.

Cumulative issues #5 and #6 accounting after all work:

- attempted requests: 9 (8 issue #5, 1 issue #6);
- actual billed amount represented by successful usage: US$0.000260610;
- unknown-billing reserve: US$0.002688 from the retained issue #5 cancellation;
- committed amount: US$0.002948610;
- remaining authorization: 91 requests and US$4.997051390.

The issue #6 work stayed below the target of 40 additional requests. The shared
ledger was reused, never reset, and no live call used `ledgerPath: false`.

## Lifecycle, cleanup, and retained state

The complete combined check passed before public trials: formatting,
typechecking, and 84 tests. That includes success, service failure,
cancellation, timeout, partial evidence, stale target, and uncertain-mutation
behavior at the agreed public runner, registered-tool, and external-CLI seams.
The production runner, real HTTP adapter, Chrome adapter, fixtures, and fake
integration are byte-unchanged from the task start SHA, so issue #5's actual TUI
cancellation and timeout evidence remains applicable. It showed no retained
RLCD-brwsr-owned CLI child while preserving the limitation that ending the
client does not roll back daemon-side work already dispatched.

The first warm launch is retained as an incomplete, unmeasured launch. It
encountered a Chrome CLI selected-closed-page response before creating a page,
starting Pi, or reserving a Jev attempt. A regression test now reselects the
pre-existing page after post-measurement cleanup. The cold metrics remain
unchanged; their adjacent correction records that the original `about:blank`
page was present and was explicitly reselected before the warm retry.

After all work:

- no fixture listener, ledger lock, task page, task Paseo terminal, or
  RLCD-brwsr-owned process remained;
- Chrome process count was 9 before and after;
- the pre-existing Chrome daemon, selected `about:blank` page, and unrelated Pi
  terminal were retained;
- Tailscale was unavailable and was not installed; the temporary fixture bound
  only to `127.0.0.1`.

See [`process-report-2026-09-20.json`](process-report-2026-09-20.json).

## Limitations

- `n=1` per cold/warm condition and per browser journey cannot establish
  statistical significance or expected cache behavior.
- The fast loop never reached Jev on the public page, so the primary result
  evaluates integration viability and fallback workflow cost, not public-doc
  navigation quality from model decisions.
- Total direct HTTP requests remain unknown when Pi used unrestricted normal
  paths outside `fetch-doc.mjs`.
- Event summaries cannot separate recovery reasoning from normal research and
  synthesis; recovery work is therefore unknown beyond observable tool failures
  and instrumented follow-ups.
- Normal baseline browser commands and retained descendants/pages remain
  unknown under its accepted protocol.
- Chrome accessibility snapshots are not complete DOM source or guaranteed
  viewport-visible text. Fixture success does not generalize to unseen sites.
- The uncertainty floor remains uncalibrated beyond the tiny issue #5 sample;
  no evaluation-driven threshold tuning was performed.

The empirical decision is **NO-GO for the full research workflow** and a
**narrow positive observation for the tested browser-only fixture journey**.
