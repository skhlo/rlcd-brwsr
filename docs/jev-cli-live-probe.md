# Live Jev driving the Chrome DevTools CLI

Recorded 2026-09-24. **Real Jev successfully selected CLI targets on all four
local fixtures. It chose DONE itself on three; code handed back the fourth's
dialog without accepting it.** Each outcome was checked independently.

This is a disposable alternative-loop probe, not a production backend switch,
current `rlcd_brwsr_run` acceptance, or a fix for
[#17](https://github.com/skhlo/rlcd-brwsr/issues/17).

## What ran

```text
CLI semantic snapshot and page location
  -> bounded projection of roles, names, values and hierarchy
  -> pinned Jev operation/compatible-target choice policy
  -> real TypeSafe request to jev-1.13.0
  -> validate the answer and map it to an offered CLI UID
  -> fresh-observation check, then an allowlisted CLI click or wait
  -> repeat until model DONE/BLOCKED, a code handoff, error or budget
```

The model selected the actions and targets; the controller supplied no expected
click sequence. It reused the pinned Jev Ultrafast `choose()` policy/validation,
not `Agent.run()` or its Browser implementation. A Node controller owned the
probe loop/history, a model-only Python child made each real decision request,
and Chrome DevTools CLI 1.7.0 owned browser execution.

CLI snapshots were rendered into hierarchy-preserving semantic text and an
observed button/link candidate list. Code retained the mapping to exact CLI
UIDs. Only CLICK, WAIT, DONE and BLOCKED were offered; no generated shell code,
arbitrary scripts, text generation or dialog acceptance was available to Jev.
A changed semantic snapshot caused the proposed action to be discarded rather
than applied to stale state.

The browser was an isolated, headless Chrome `153.0.8010.53` instance with the
verified mock-keychain startup configuration and a disposable profile. A live
owned sentinel protected case resets. The model never received private fixture
oracles; an independent observer used those only after the terminal outcome.
The iframe/shadow fixture kept both success confirmations in public page state
rather than testing memory of a disappeared message.

## Observed results

| Task                                                 | Real Jev decisions | Terminal source       | Independent outcome                                                                                 |
| ---------------------------------------------------- | ------------------ | --------------------- | --------------------------------------------------------------------------------------------------- |
| Open the requested history page, not the decoy       | CLICK, DONE        | Model                 | Correct destination URL and page text                                                               |
| Activate an off-screen control inside a nested panel | CLICK, DONE        | Model                 | Intended control activated once; panel scrolled 737 CSS px, document stayed at zero                 |
| Activate iframe and open-shadow controls             | CLICK, CLICK, DONE | Model                 | Both controls activated exactly once; both confirmations present                                    |
| Open a benign confirm dialog without accepting it    | CLICK              | Code's dialog handoff | CLI reported the pending confirm dialog; independent dialog metadata agreed; no acceptance occurred |

No unrelated control was activated. The controller did not correct the model's
choices or repeat a failed case. The dialog action still produced a CLI input
error while the dialog was open; it is the **explicit blocker information**, not
an error-free click, that made handoff possible. Dismissal happened only during
logged cleanup, after capturing the blocker, and is not attributed to Jev.

The three model completion claims were checked against actual fixture state,
not against the model's confidence. The four final screenshots were retained;
navigation, nested-panel and embedded-control images were independently opened.
The dialog screenshot shows post-dismissal cleanup state; the original blocker
is established by the CLI result and separate dialog event metadata.

## Allowance, usage and timing

The owner authorized one four-case pass: at most eight HTTP attempts per case,
32 total, six dispatched actions per case, 60-second case and six-minute overall
requested deadlines, plus 90 seconds for cleanup. No automatic/manual retries,
DeepSeek helper or reporting-model calls were allowed.

- **8 observed TypeSafe POST attempts, all HTTP 200**, with reported model
  `jev-1.13.0`: 2 navigation, 2 nested-panel, 3 embedded-control, 1 dialog.
- **9,683 input / 565 output tokens** reported across those responses.
- Model transport durations were 436–524 ms each, 3,882 ms summed. These are
  request timings, not the whole browser task.
- Case-controller durations were 5,197 / 5,136 / 8,423 / 7,954 ms, including
  setup/observation/CLI work and per-case cleanup. This was not a matched
  comparison with the existing extension and proves no speedup.
- Billing was not returned or independently reconciled. Token usage and the
  request cap are not a dollar-cost guarantee.

Adapter, fixture and prompt-source hashes were frozen before inference and
matched afterward. Offline checks first exercised projection, native response
validation, rejection of unoffered IDs/operations and negative completion
oracles. No live prompt or adapter tuning occurred. The allowance is consumed
as a completed single pass; unused attempts do not authorize another trial.

## Credentials and resources

The model-only child used Browser Harness's normal host-native environment
loader to read existing workspace configuration. Credentials were not manually
displayed, copied into an artifact, placed in arguments or passed into Chrome
or the CLI. Its replacement transport used a fixed TypeSafe endpoint, disabled
retries/proxy inheritance, reserved each attempt before sending and redacted
resolved key values from retained results. This is not a universal secret-leak
proof or a claim that the credential file was never read.

All case contexts closed and the CLI sentinel was restored before each reset.
The CLI daemon, owned Chrome process and fixture server stopped; recorded child
PIDs were independently checked absent. The temporary Serve route was removed
and the pre-existing Serve configuration restored. No user tab or shared browser
was used as a test subject. Inactive profiles, source captures, requests,
validated answers, screenshots and cleanup receipts remain operator-local under
`artifacts/browser-capability-run/jev-cli-live/`, not distributed in a clone.

## What this supports - and what remains

This supports **Jev plus the CLI's semantic observation/action layer as a
coherent integration candidate**, not merely a source of disconnected helpers.
The nested-panel task illustrates the division: Jev chose the named control;
the CLI handled bringing it into view and clicking it. Jev did not calculate
scroll distances or pixel coordinates.

The probe is not a drop-in replacement for the current extension:

- It used exclusively owned fixtures and unique local URLs to associate CLI
  pages with the test targets. It has not implemented RLCD's opaque `targetId`
  admission for arbitrary existing tabs. CLI page IDs are not CDP target IDs.
- It could stop the entire owned executor/browser. Shared-browser per-task
  cancellation, focus and cleanup guarantees remain an adoption requirement.
- It bypassed the Pi tool and native `Agent.run()`. Production supervision,
  compact handoff/privacy contracts and field-text generation need integration
  work rather than being inferred from these results.
- Filling, keyboard/history operations, cross-origin frames, closed roots,
  virtualized/absent targets, authenticated or consequential flows and larger
  real-page snapshots were not tested. Candidate/size bounds were never stressed
  by these small fixtures.
- Three model stops on explicit local success state do not establish reliable
  reading-position completion on Wikipedia or solve #17.

These are positive bounded integration observations, not a reliability rate,
public-site acceptance, full CLI coverage or authorization to change production.
