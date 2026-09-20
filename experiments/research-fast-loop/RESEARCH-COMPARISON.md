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
added fast-loop capability. The recorded fast-loop timing subtotal median was
6.612 seconds higher and used 18,021.5 more provider-reported total main-model
tokens than the accepted normal observations. Cleanup and the failed first warm
launch/recovery were not timed, so this is not a precise end-to-end speed
comparison.

The separate fixture journey found a narrower positive observation: both paths
were independently correct, and the fast-loop recorded pre-cleanup subtotal was
2.541 seconds lower with 5,828 fewer main-model tokens. Its cleanup timing is
also unknown. That result does not substitute for the failed primary
hypothesis, and neither result establishes Jev's public-document navigation
quality because the primary path made zero inferences.

## Comparability

The protocol was frozen in
[`RESEARCH-PROTOCOL.md`](RESEARCH-PROTOCOL.md) before public trials. The task,
20-item checklist, evaluator prompt, and three context files have the same
hashes as the accepted normal baseline. All runs used Pi 0.85.1,
`openai-codex/gpt-5.6-sol`, reasoning `xhigh`, Node 26.6.0, and the same host.
The fast-loop researcher received no prior answer, evaluation, or source
packet. Direct official Markdown/HTTP follow-up remained allowed and counted
where observable; this was not a forced browser-only comparison.

The live comparability snapshot re-fetched the 12 instrumented sources retained
by the accepted normal warm research phase. Every checked HTTP status, byte
length, and SHA-256 matched. The model and price also remained `jev-1.13.0` at
US$0.042 per million input tokens, with free output tokens. This does not cover
the uninstrumented accepted cold or evaluator source responses. Their historical
hashes are unknown, including evaluator checks of `concepts/system-one.md` and
`primitives/noul.md`; rerunning now could not recover those old bytes. The task,
checklist, and frozen context match, but full source matching and a fully paired
quantitative comparison are not proved. See the coverage audit in
[`source-comparability-2026-09-20.json`](source-comparability-2026-09-20.json).

The accepted normal observations remain failures and are not repaired or
relabelled:

- cold: **FAIL**, 19/20, 417.316 s recorded subtotal;
- warm: **FAIL**, 15/20, 456.307 s recorded subtotal.

The constrained baseline pilots are not used.

## Primary observations and timing coverage

| Metric                                       |            Normal cold |            Fast-loop cold |            Normal warm |            Fast-loop warm |
| -------------------------------------------- | ---------------------: | ------------------------: | ---------------------: | ------------------------: |
| Verified outcome                             |           FAIL (19/20) |              FAIL (13/20) |           FAIL (15/20) |              FAIL (15/20) |
| Recorded timed subtotal through verification |              417.316 s |                 390.615 s |              456.307 s |                 496.233 s |
| Cleanup time                                 |                unknown |                   unknown |                unknown |                   unknown |
| Prior failed launch/recovery                 |          none recorded |             none recorded |          none recorded |      unknown and excluded |
| Full end-to-end wall time                    |                unknown |                   unknown |                unknown |                   unknown |
| Page preparation                             | included, not separate |                   3.021 s | included, not separate |                   2.149 s |
| Research / evidence and synthesis            |              227.577 s |                 154.813 s |              220.120 s |                 238.224 s |
| Independent verification                     |              189.695 s |                 232.735 s |              236.138 s |                 255.800 s |
| Main-model turns                             |                     22 |                        13 |                     11 |                        23 |
| Input tokens                                 |                176,415 |                   115,975 |                124,331 |                   112,107 |
| Output tokens                                |                 19,227 |                    19,402 |                 20,917 |                    23,337 |
| Cache-read tokens                            |                548,736 |                   243,968 |                233,984 |                   644,864 |
| Provider-reported total tokens               |                744,378 |                   379,345 |                379,232 |                   780,308 |
| Instrumented direct HTTP attempts            |                      0 |                         9 |                     12 |                         7 |
| Total direct HTTP requests                   |                unknown |                   unknown |                unknown |                   unknown |
| Exact measured pre-cleanup browser commands  |                unknown |                         4 |                unknown |                         4 |
| Jev requests / tokens                        |                  0 / 0 |                     0 / 0 |                  0 / 0 |                     0 / 0 |
| Fast-loop stop reason                        |                    n/a | `classifier_state_budget` |                    n/a | `classifier_state_budget` |
| Stale decisions                              |                    n/a |                         0 |                    n/a |                         0 |
| Consequential-action stops                   |                    n/a |                         0 |                    n/a |                         0 |
| Observable failed tool calls                 |                      0 |                         1 |                      0 |                         0 |

Each condition has `n=1`. The pooled two-observation median uses the predeclared
arithmetic mean for an even sample and is descriptive only.

| Pooled metric (`n=2`)            |    Normal | Fast loop |   Fast-loop delta |
| -------------------------------- | --------: | --------: | ----------------: |
| Verified pass rate               |       0/2 |       0/2 |    no improvement |
| Recorded timed-subtotal median   | 436.812 s | 443.424 s |  +6.612 s (+1.5%) |
| Full end-to-end wall-time median |   unknown |   unknown |           unknown |
| Main-model turn median           |      16.5 |        18 |      +1.5 (+9.1%) |
| Input-token median               |   150,373 |   114,041 |  -36,332 (-24.2%) |
| Output-token median              |    20,072 |  21,369.5 |  +1,297.5 (+6.5%) |
| Cache-read-token median          |   391,360 |   444,416 |  +53,056 (+13.6%) |
| Total-token median               |   561,805 | 579,826.5 | +18,021.5 (+3.2%) |
| Research-phase median            | 223.849 s | 196.519 s |         -27.330 s |
| Verification-phase median        | 212.917 s | 244.268 s |         +31.351 s |

The cold fast-loop recorded subtotal was lower and used fewer total tokens than
its normal cold counterpart. The warm recorded subtotal reversed both results.
With one observation per condition, incomplete source matching, and unknown
cleanup/recovery timing, this is neither evidence of a cache effect nor a
precise end-to-end speed comparison. Across both observations the fast-loop path
used 36 main-model turns and 1,159,653 total tokens, compared with 33 turns and
1,123,610 total tokens for normal Pi.

The fast-loop checklist omissions were retained as observed. Cold failed RV1,
UN1, UN2, UN3, ML1, ML2, and ML4. Warm failed RV1, UN1, UN2, ML2, and ML4.
Both briefs accurately disclosed the state-budget stop and then used targeted
official follow-up retrievals. Neither result is treated as a fast-loop
completion.

### Original-rubric ML1 adjudication

The frozen ML1 item requires the pinned contract and relevant API/context
limits; it does not add every dynamic service rate as a separate requirement.
The raw evaluations and scores remain unchanged. Under that original rubric,
fast-loop cold still fails ML1 because its brief omits the relevant 255-option
Choice cap. Normal cold (brief line 73), normal warm (line 96), and fast-loop
warm include that cap, pin the model, and cover the context limits, so their ML1
passes are consistent. The evaluator's additional dynamic rate-limit criticism
is retained as observed text but is not a new frozen requirement.

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
not demonstrate the proposed fast evidence-gathering loop. The numerical
research and independent-evaluation runs used Pi's JSON mode for instrumentation.
A later actual-TUI check verified the registered tool and the same visible
`classifier_state_budget` stop only; it did not repeat research, synthesis, and
verification in the TUI. The literal issue #6 TUI acceptance item therefore
remains unmet. Another full TUI research repeat was not run after the
deterministic pre-inference failure. See
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
| Recorded subtotal through preparation and verification |               20.073 s |       17.532 s | -2.541 s (-12.7%) |
| Cleanup time                                           |                unknown |        unknown |           unknown |
| Full end-to-end wall time                              |                unknown |        unknown |           unknown |
| Main-model turns                                       |                      4 |              3 |                -1 |
| Main-model total tokens                                |                 27,425 |         21,597 |   -5,828 (-21.3%) |
| Browser commands                                       |                      7 |              7 |                 0 |
| Jev requests                                           |                      0 |              1 |                +1 |
| Jev input / output tokens                              |                  0 / 0 |       799 / 97 |        +799 / +97 |
| Jev actual cost                                        |                   US$0 | US$0.000033558 |   +US$0.000033558 |
| Fast-loop stop reason                                  |                    n/a |  `step_budget` |               n/a |

This is one small loopback journey, not a statistical result and not a public
research workload. The shared fixture-server startup and cleanup were excluded
from both recorded subtotals, so the result supports only the displayed
pre-cleanup cost difference, not a precise end-to-end speedup. Coverage is
disclosed in
[`browser-journey-comparison-2026-09-20.json`](browser-journey-comparison-2026-09-20.json).

## Budget

The owner explicitly approved minimal development dependencies and Jev trials
for issues #5 and #6 under cumulative caps of 100 requests and US$5 before the
first paid call. The exact approval timestamp was not retained. The durable,
non-secret scope receipt is
[`../jev-trial-approval.json`](../jev-trial-approval.json); it is not a
transcript or signed proof.

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
starting Pi, or reserving a Jev attempt. Its launch, cleanup attempt, and manual
recovery timestamps/commands were not retained, so their cost is unknown. A
public-command regression now uses a stateful external Chrome fake that refuses
to list pages after the selected page is closed until the original page is
reselected. It asserts final page state and public metrics rather than a private
command sequence. Future successful runs record separate work, cleanup, and
full timing; failed invocations persist `failure.json` with stage, measured
failure/cleanup timing, cleanup outcome, and available ledger counts. The cold
observed values remain unchanged; their adjacent correction records that the
original `about:blank` page was present and was explicitly reselected before the
warm retry.

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
- Historical cleanup time and first-warm-launch recovery time were not retained,
  so full primary and secondary end-to-end totals and speed deltas are unknown.
- Only 12 instrumented accepted-warm research sources have matched historical
  hashes. Accepted-cold and evaluator response hashes are incomplete, so source
  comparability is partial.
- The fast loop never reached Jev on the public page, so the primary result
  evaluates integration viability and fallback workflow cost, not public-doc
  navigation quality from model decisions.
- The primary numerical runs used JSON mode. Actual-TUI checks covered the real
  tool's failure/cancellation surfaces and deterministic public stop, not the
  complete research, synthesis, and verification workflow required literally by
  issue #6.
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

The empirical decision is **NO-GO for the tested RLCD-brwsr implementation on
the full research workflow** and a **narrow positive observation for the tested
browser-only fixture journey**. It is not a claim about Jev efficacy: zero
primary inferences means public-document navigation quality remains untested.
