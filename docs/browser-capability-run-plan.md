# Browser capability evaluation run

**Status: evaluation recorded, with limitations.** The initial matrix and two
separately authorized reference follow-ups produced the
[combined results](browser-capability-run-results.md). Driver failures,
permission interruption, startup correction and deferred subchecks remain part
of that record; this was not one clean pass. The allowances are consumed, and
no further browser trial is currently authorized. The protocol below is retained
for comparison with what actually ran. Live inference, production changes and
publication remain excluded.

## Decision the run should enable

For each inventory item, decide: **keep the current implementation, investigate
one adaptation, leave it as outer-agent recovery, or defer it**. Compare useful
behavior, not the length of a tool catalogue or pixel-perfect positioning.

Use one runner with independent cases, not one long journey whose first failure
prevents testing everything else. The output is one comparison report and an
explicit disposition for every item. No broad performance or reliability claim
comes from one run.

## Three distinct questions

1. **Available mechanics:** what can the current extension and the reference
   tools actually observe or do on a controlled page?
2. **Integration:** can one selected idea fit the existing Jev/Harness owner
   without losing identity, lifecycle or safety guarantees?
3. **Decision quality:** can real Jev select and use that capability toward a
   natural-language goal?

The initial run answers question 1 only. A scripted or synthetic-model success
is never reported as Jev understanding the task. Questions 2 and 3 are separate
follow-ups after selecting a candidate; do not build every possible adaptation
before learning which ones are useful.

## Proposed test seams and lanes

Confirm these seams with the owner before implementing the runner:

| Lane                      | Exercise                                                                                                                                   | Substitution and interpretation                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A - current RLCD**      | Registered `rlcd_brwsr_run`/discovery interfaces, real Python runner and pinned Jev/Browser Harness, against real disposable Chrome pages. | Replace only external model transports with deterministic replies. Capture the emitted provider request when assessing what Jev can observe. Do not fake observations, the executor or terminal results. This tests mechanics and wrapper behavior, not model judgment. |
| **B - Harness reference** | Actual pinned Harness helpers or the exact documented interaction recipe, through its own named task daemon and authorized targets.        | A case driver supplies deterministic intent. Identify whether the result came from a helper or a documented raw-CDP recipe. Do not present a recipe as a native helper.                                                                                                 |
| **C - CLI reference**     | Actual installed `chrome-devtools` commands, their real daemon/tool implementation and structured output.                                  | A case driver supplies the same intent. Use the generated CLI surface: no invented `wait_for`, `fill_form` or `scroll` command. Underlying MCP-only implementations remain source-only references in this run.                                                          |

A supporting observation capture is diagnostic evidence, not a replacement for
the public interface's result. Fixture oracles may inspect only exact
fixture-owned targets. Their private selectors/markers establish ground truth;
they must not tell the subject driver which target to choose or perform the
missing action for it. Drivers resolve actions from their lane's own observed
candidates. Once a capability is unavailable, record that rather than rescuing
the case with a different tool.

The lanes remain separate reference experiments. This does not install a CLI
fallback inside the production extension or change ADR-0003.

## Case matrix

Each row is one inventory item and one case per eligible lane. Use small static
fixtures, literal expected outcomes and explicit readiness signals. A lane may
satisfy a task through different supported actions; do not require one click
sequence or one output representation merely to match another lane.

| ID / item                               | Controlled scenario and counterexample                                                                                                                                                                       | Observable criterion                                                                                                                                                                                                                                 | Comparison and limit                                                                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **01 - semantic observation**           | Article with the same words in a contents link and the real section heading; labelled, disabled and unlabelled controls nearby.                                                                              | The returned observation distinguishes heading from link and preserves the actionable control's accessible name/state. A decoy must not be reported as the requested section.                                                                        | Compare current model-facing state, Harness AX recipe and CLI snapshot. Record an ambiguous/missing representation as a gap; no live classification is inferred.                                                              |
| **02 - target identity/freshness**      | Observe a button, then replace that DOM node with a same-labelled node before the action. A fresh-observation control follows on a reset fixture.                                                            | A stale identity is rejected without activating the replacement or decoy. Freshly observed identity activates exactly the intended marker once.                                                                                                      | Compare actual refusal/effect, not UID syntax. Never repair an old ID through label guessing. This is a protection the existing implementation should retain.                                                                 |
| **03 - reach/actionability/scroll**     | A requested control is outside a nested scroll panel's visible area; the document itself need not scroll. Include a disabled control that becomes enabled at an explicit fixture signal.                     | The intended enabled control is reached and activated; a decoy is untouched. Record which scroll container moved and whether input preceded readiness.                                                                                               | Compare known-target locator behavior and targeted wheel recipes with native visible-candidate/fixed-point scrolling. Missing off-screen candidates are an observation gap, not an executor failure. No one-pixel thresholds. |
| **04 - navigation**                     | Local page A links to B, each with a distinct visible marker. Exercise startup navigation and the observed link; report history/reload subchecks separately.                                                 | Correct marker and URL appear on the intended target. Created versus borrowed lifetime follows lane-specific ownership; no other target is navigated.                                                                                                | Current RLCD's link route may pass while history/reload are unsupported. CLI/Harness startup convenience is not permission to reuse an unrelated blank tab or silently accept a dialog.                                       |
| **05 - settling/waits**                 | A click produces a delayed result after a known fixture-ready event. Include a terminal error variant and an unrelated continuing DOM animation.                                                             | Record what was returned immediately, when the result/error became observable and whether it was reported accurately within the case bound. Early state must not be called settled; continuous unrelated animation must not cause an unbounded wait. | A fresh `loading` observation is not itself a failure. Compare actual settling guarantees and supported follow-up waits; DOM quiet/network idle must not be equated with goal completion.                                     |
| **06 - forms/keys/controls**            | One small form with text, native select, an already-checked toggle and an autocomplete result. Separate keyboard-only subcheck uses Enter/Escape.                                                            | Read back exact field values and the selected result; the already-satisfied toggle stays set. Submission occurs once, only when requested.                                                                                                           | Synthetic text-helper values are declared fixtures, not generated-value quality evidence. A click route may satisfy the main form task even if keyboard operations are unsupported. Do not hide that distinction.             |
| **07 - tab/session/visibility**         | Two fixture-owned tabs with similar titles and distinct markers. Continue on the authorized one, then repeat with its target removed. Test foregrounding only in the expressly approved visibility subcheck. | The decoy is unchanged; a missing exact target produces an explicit error rather than fallback. Borrowed tab lifetime stays unowned. Foreground status requires OS/window evidence or user confirmation, not focus emulation.                        | CLI page IDs and Harness attached-session state remain lane-local. If visibility cannot be established, report it as unverified rather than starting an OS permission flow.                                                   |
| **08 - post-action evidence/handoff**   | An action changes URL and a visible result marker. A reset variant fails after an observable intermediate state.                                                                                             | The result identifies the observed location/state and distinguishes claims, partial evidence, errors and unknown effects. An old snapshot is never presented as verified final state.                                                                | Compare useful evidence, not byte count as a winner. Keep RLCD's bounded content/details contract; do not redesign its selector. Optional reporting transport stays synthetic.                                                |
| **09 - blockers/dialogs**               | A fixture opens a harmless confirm dialog; its accept path increments a marker. The assigned task is to detect/report the blocker, not accept it.                                                            | Dialog/blocker information or an honest bounded error returns; the accept marker remains zero. Record whether the lane detects the blocker or merely times out.                                                                                      | A default auto-accept is a mismatched policy, not a successful task. Dismissal needed for cleanup is a separate logged cleanup action on the owned fixture.                                                                   |
| **10 - selective visual recovery**      | A canvas-only result or an overlay makes text output insufficient.                                                                                                                                           | A lane with screenshot support returns an image of the exact owned target; the independent observer can identify the fixture marker or obstruction. Lack of image support is reported.                                                               | This tests evidence availability, not Jev vision. Human/outer-agent inspection is labelled. Targeted geometry may support diagnosis, but pixel-perfect containment is not the goal.                                           |
| **11 - frames/shadow/advanced widgets** | Separate controls inside a same-origin iframe and an open shadow root, with a top-level decoy.                                                                                                               | Where supported, observations resolve the intended descendant and the action changes only its marker. Record observation and execution failures separately.                                                                                          | Cross-origin frames, closed roots, drag and upload are explicitly deferred subitems, not passes. Their scope/permission and fixture requirements need a later decision; the row is not a blanket claim of widget coverage.    |

Negative variants and subchecks share the row's budget. If a case cannot fit
without hiding work or weakening its oracle, split and re-budget it **before**
execution. Every deferred or unsupported subitem stays visible in the report.

## Controls against misleading results

- Freeze versions, fixtures, viewport, expected markers and per-lane action
  recipes before the run. Use the inventory's installed/reference pins and the
  same Chrome binary; record actual versions rather than installing upgrades.
- Begin every lane/case from an independently checked reset state. Use identical
  fixture content and declared timing, fresh target/session identities and no
  cookies or storage inherited from real browsing. Re-observe IDs after reset.
- Do not compare scripted CLI command counts with Jev decision counts as if they
  measured the same thing. Timings are labelled boundary measurements, not
  end-to-end speedups; zero paid inference also means no real model-cost result.
- Before trusting each oracle, demonstrate a cheap negative control: wrong
  marker, stale target, premature result, unwanted toggle or missing image as
  applicable. It must be capable of rejecting the actual bad outcome, not just
  confirm that a source file contains an expected token.
- More metadata is not automatically useful. Record representation differences
  separately from task gaps; a richer AX tree or extra coordinates alone do not
  establish that the current lane cannot satisfy the practical intent.
- Keep harness errors separate from capability gaps. A broken fixture or wrong
  CLI signature invalidates that case; it does not count against the tool.
- All lanes run sequentially. No simultaneous controllers compete for browser
  state, and no user browsing target participates in the experiment.

## Execution packet and bounds

Before implementation/execution approval, present one packet containing the
confirmed seams, case IDs, pins, command recipes, exact expected results,
resource ledger and runner stop/cleanup behavior.

Proposed initial allowance:

- **No live model/provider calls and no real provider credentials.** Stub the
  TypeSafe decision, field-text and optional reporting transports; deny external
  provider traffic. Synthetic replies are labelled in every relevant receipt.
- At most **33 primary case executions**: 11 rows × 3 lanes. Unsupported or
  deferred lanes consume no browser trial and still receive a result row.
- At most **two additional case executions total**, only for diagnosed fixture
  or driver mistakes. Preserve the original result and describe the correction.
  No rerunning an unexpected tool result until it passes.
- **20-second requested deadline per case execution**, **20-minute overall
  run deadline**, plus a separately bounded **90-second final cleanup allowance**.
  These are stop requests, not guarantees that an in-flight action cannot cross
  a deadline. Stop dispatch before beginning cleanup.
- No dependency installation, production edits, provider/pin changes, GitHub
  writes or publication. Implement only disposable evaluation artifacts; do not
  create a new permanent test framework.

Reference tools must use new task-owned browser profiles/endpoints and their
own uniquely named daemons, not the shared RLCD/user browser. Lane A gets an
isolated Harness instance; lane B may use it only sequentially after a clean
case reset. The CLI gets a separate isolated browser/daemon because its page
wrapping and selected-page behavior must not touch another lane's tabs.
Use isolated synthetic workspace configuration and explicit endpoints; verify
that the resolved settings are synthetic without copying host credentials.
Disable optional telemetry/remote metrics through supported flags. Missing
prerequisites stop the run instead of triggering installs, browser discovery or
permission flows.

### macOS native-app startup guard

Keep the real OS account `HOME` for Chrome and other native macOS apps. Isolate
Chrome with a new, run-owned `--user-data-dir`; isolate Python/Node workspace
configuration separately. Do not point a native app at a fake home directory
and then grant keychain permissions to compensate.

Reuse the installed Puppeteer launch defaults instead of maintaining a shortened
manual argument list. The reviewed [Puppeteer defaults](https://github.com/puppeteer/puppeteer/blob/f8d63c73c3d7c21a8b0f421411e7df8386195436/packages/puppeteer-core/src/node/ChromeLauncher.ts)
include `--use-mock-keychain`, the macOS automation safeguard, and
`--password-store=basic`. These settings are **only for disposable fixtures**,
never personal profiles, real logins or credential storage.

Before spawning, fail closed unless the emitted command uses a profile beneath
the owned run directory, retains the mock-keychain setting, keeps the real OS
home and forwards no provider credentials. The evaluation launcher now enforces
this and its offline executable-capture/negative-control checks pass. A separately
authorized ten-second startup check on Chrome `153.0.8010.53` verified the
effective mock-keychain arguments, healthy startup and normal exit; the user
confirmed that no prompt appeared. That is one observed startup, not a guarantee
for every future browser/version. Never reset a keychain, change its default or
approve/retry an OS prompt as recovery. New execution still needs an explicit
scope and allowance.

Fixture servers bind to loopback. Any user-facing test UI uses an explicitly
owned Tailscale Serve route/URL; preserve unrelated routes. If that requires an
unapproved setup change, stop for a setup decision. Foreground changes are
allowed only for case 07 after explicit approval.

The execution packet names the guarded traffic interfaces: model-provider
transports, fixture page requests, configured CDP endpoints and CLI telemetry
controls. Allowlist only their required local endpoints and any approved Serve
route. An unexpected request observed at those interfaces stops the run. Other
browser/OS background traffic remains unverified unless separately isolated and
monitored; this plan does not claim whole-host egress isolation.

Every target, context, process, socket, profile and optional Serve route has an
owner and a cleanup receipt. A CLI timeout does not prove that its daemon stopped
acting: stop the owned executor and confirm its exit before reusing anything.
Cleanup independently attempts owned-resource release, preserves primary errors
and reports uncertainty. **After a stop, any unconfirmed ability to continue
acting prevents further cases. An ownership violation stops the entire run.**
Never close or stop resources merely because they appeared after the run began.

## One report, not a pass-rate scoreboard

Each `(case, lane)` result records:

```text
caseId, lane, sourceVersion, fixtureRevision, executionSeam
status: pass | capability_gap | policy_mismatch | unsupported |
        deferred | inconclusive | harness_error
observedOutcome, oracleResult, sideEffects, resourceCleanup
elapsedBoundary, observations/actions/commands (separately labelled)
evidencePaths, limitations, proposedDisposition
```

An expected stale-target rejection is a passing guard case. A capability absent
from the current model interface is not a new regression. A reference result
can expose a useful pattern without proving that porting it will help Jev.

The final summary gives all 11 inventory items a disposition and points to the
smallest evidence supporting it. Suggested evidence threshold for an adaptation:

1. a practical task exposes a current gap;
2. the reference behavior addresses that gap on the same fixture;
3. the behavior can preserve RLCD's ownership and safety contract; and
4. the integration cost/changed upstream seam is stated before implementation.

If these are unmet, choose **keep**, **recovery only**, **defer** or
**needs a smaller probe**, rather than inventing a winner.

## Later integration and live-Jev gate

After this report, select at most one adaptation for a separately approved
vertical slice. First prove its mechanics at the agreed public seam with a
regression that fails without the behavior. Then consider a finite live-Jev
comparison of baseline and candidate on the relevant fixture goal, followed by
one independent outcome read. Only that stage can test whether Jev uses the
capability or stops more appropriately.

That later allowance must name cases, logical calls, maximum HTTP attempts
including retries/reporting/helper work, wall bounds and any spend ceiling. It
is **zero under this plan**. Public-site verification of #17 is also separate;
the original one-pixel probe does not stand in for that task.

## Approval checkpoint

The initial, reference-correction, startup-check and remaining-CLI records are
historical, not a standing allowance. Before further work, review the
[results and omissions](browser-capability-run-results.md), choose one justified
adaptation and approve its finite scope. No live inference was performed, and
no production capability has been adopted from this evaluation.
