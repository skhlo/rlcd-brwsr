# Browser capability evaluation results

Recorded 2026-09-24. This is the combined exploratory result of the
[run plan](browser-capability-run-plan.md), not a clean single-pass benchmark,
production acceptance or live-Jev evaluation. All application-model responses
were synthetic; the browser interactions and reference tools were real.

## Selection summary

The strongest next adaptation candidate is **target-aware scrolling**: current
RLCD could not reach a control inside a nested scroll panel, while a Harness
wheel recipe and the CLI's locator-based click both reached it without scrolling
the document. This is a practical capability difference, unlike the earlier
one-pixel geometry distinction.

Two other concrete candidates are **explicit pending-dialog handoff** and
**selective semantic observation for shadow roots/frames**. Retain current
freshness, exact-target ownership, basic form handling and bounded reporting.
The evaluation does not justify replacing the whole executor, adding geometry
to every observation, or relaxing the three-no-change guard. It did not
reproduce or fix [#17](https://github.com/skhlo/rlcd-brwsr/issues/17).

## What was compared

- **A - current RLCD:** programmatic invocation of the registered run tool, real
  Python runner, pinned Jev and real Chrome; not a Pi TUI/outer-agent turn. Only
  external decision, field-text and reporting transports were replaced with
  deterministic replies. This exercises mechanics, not Jev's
  interpretation of natural-language goals.
- **B - Harness reference:** real Browser Harness 0.1.13 helpers and a declared
  AX/box-model interaction recipe. A failed recipe is not proof that the library
  lacks every alternative.
- **C - CLI reference:** actual Chrome DevTools CLI 1.7.0 commands and its real
  executor. A scripted driver selected observed targets; no model planned it.

Chrome was `153.0.8010.53`. Cases used disposable local fixtures, synthetic
configuration, exact owned targets, sequential lanes and independent fixture
state checks. The CLI had its own browser/daemon. Existing user tabs and browser
services were not used as test subjects.

## Inventory dispositions

“Worked” below means the stated fixture/subcheck worked, not that every possible
variant or the full planned row was covered.

| Item                         | Observed comparison                                                                                                                                                                                                                       | Proposed disposition                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **01 - semantic content**    | All lanes exposed the requested launch-year fact in their observations (A's captured model request, B/C snapshots). Harness/CLI also supplied explicit heading semantics.                                                                 | **Keep** simple reading; evaluate AX selectively where missing structure prevents a practical action. More metadata alone is not an improvement.        |
| **02 - target freshness**    | All lanes rejected the replaced-node attempt without activating the replacement; a fresh observation then activated the intended control once.                                                                                            | **Keep** current identity/freshness guarantees. Do not replace them merely to adopt CLI UIDs.                                                           |
| **03 - reach/scroll**        | Current RLCD did not reach the nested-panel target. Harness's positioned wheel and CLI's known-target click moved the panel, not the document, and activated the intended control.                                                        | **Adapt first:** observed scroll-container targeting or known-target viewport entry, within one execution owner.                                        |
| **04 - navigation**          | All lanes followed the local link to the intended destination. CLI back/reload also worked. Current RLCD inputs used the existing target as borrowed.                                                                                     | **Keep** current startup/link navigation. History operations remain a separate action-interface choice; created-tab lifetime was not re-tested here.    |
| **05 - settling**            | All lanes observed delayed success and error outcomes despite an unrelated ongoing DOM animation. The driver distinguished intermediate loading from the eventual result.                                                                 | **Keep** current default; compare explicit condition waits when needed. Neither DOM quiet nor this scripted success proves Jev will wait appropriately. |
| **06 - forms/keys**          | All lanes set the requested text/select/autocomplete values, preserved the checked toggle and submitted once. Harness/CLI Enter and Escape subchecks worked; those are not selectable Jev operations.                                     | **Keep** native text/select behavior. Consider a small keyboard vocabulary only for tasks that cannot use the existing route.                           |
| **07 - tab identity**        | The authorized fixture tab was used, the decoy remained unchanged and the missing-target attempt was rejected. CLI case isolation needed explicit selection of a live sentinel before fixture disposal.                                   | **Keep** RLCD's exact-target/session policy. Do not substitute a shared selected-page fallback. Foreground visibility remains untested.                 |
| **08 - handoff evidence**    | Changed location and partial-state/error facts were available in recorded results/details. A's reporting selector was synthetic, so compact-evidence relevance was not evaluated. Failure types differed between lanes.                   | **Keep** the current bounded handoff. These are fault-path examples, not a comparable error-rate result or a reason to retune compression.              |
| **09 - dialog blocker**      | RLCD stopped on its time budget with an input IPC timeout, without a dialog-specific handoff. Harness's pending-dialog helper and the CLI response identified the confirm dialog; neither accepted it. Input itself could still time out. | **Adapt detection/handoff**, not automatic acceptance. Session ownership and action uncertainty must remain explicit.                                   |
| **10 - visual evidence**     | The registered RLCD tool does not expose screenshots, so its trial was skipped. Harness and CLI produced exact-target PNGs; independent inspection read `VISUAL CHECK 42`.                                                                | **Recovery only:** retain screenshot access for the outer agent. This provides no evidence for Jev vision or universal coordinate enrichment.           |
| **11 - frames/shadow roots** | Current Jev did not offer the descendant controls. The Harness root-AX recipe reached the open-shadow control but did not find the iframe control. The CLI reached both.                                                                  | **Investigate selective observation/target support.** The iframe result limits that Harness recipe, not every available Harness approach.               |

## Why this was not one clean run

All original receipts were retained; corrections had separate owner approval.

1. An initial setup attempt failed before cases because the native Tailscale CLI
   did not work in the stripped test environment. Native service control was
   separated from the synthetic evaluation environments.
2. The initial matrix made **32 case executions** and recorded the known
   screenshot omission without a browser trial. A/B yielded useful evidence,
   but all CLI cases were invalidated by a driver mistake: startup-only options
   had been passed to ordinary CLI commands.
3. A separately authorized **12-case reference correction** validated CLI
   semantic observation and the Harness dialog recipe. The remaining CLI cases
   were inconclusive: disposing its selected fixture context left subsequent
   `list_pages` calls returning “The selected page has been closed.” This was
   not evidence that the individual CLI capabilities were absent.
4. The user cancelled macOS keychain prompts. The manual Chrome launcher had
   used a synthetic HOME and omitted automation keychain defaults. It was
   replaced with the installed Puppeteer defaults, an owned-profile guard and
   the real OS HOME. Offline checks passed. A separately authorized ten-second
   startup-only check verified effective mock-keychain flags and normal exit;
   the user explicitly confirmed that no prompt appeared.
5. A separately authorized **10-case CLI pass** exercised cases 02–11 with that
   launcher, update checks disabled, guarded sockets and a live owned sentinel
   selected before fixture disposal. All ten exercised case subsets worked.
   Screenshot output stayed within the CLI's permitted temporary directory.

The consolidated table therefore draws on **54 case executions across three
batches**, plus the separate startup-only check and failed pre-case setup. It
is not a success-rate sample. Launch/reset behavior changed between batches;
do not pool their timing as a matched performance comparison.

The first CLI setup also performed an unplanned npm-registry update check.
Later invocations disabled that check and used explicit socket/autostart guards.
No dependency upgrade or live TypeSafe/DeepSeek call was performed. This is not
a claim that every browser/OS background request was monitored.

## Limits and cleanup

- No real Jev decision quality, helper-generation quality, public-site success,
  pricing or end-to-end speed improvement was measured.
- Foreground visibility, the delayed-enabled-control subcheck, registered tab
  discovery, created-tab lifetime, cross-origin frames, closed shadow roots,
  drag and upload were not established. Later passing rows do not erase those omissions.
- Negative controls included replaced target identity, a decoy tab, a missing
  target, delayed error output and refusal to accept a dialog. A full independent
  negative control for every planned oracle was not completed.
- The A/B runs and first valid CLI observation predate the startup hardening.
  Their exact observed fixture outcomes remain evidence, not proof of clean
  general operation under the final launcher.
- The initial supervisor incorrectly treated signal exits as unconfirmed;
  subsequent process-absence checks resolved that uncertainty. Graceful Harness
  shutdown also required process-level fallback. Those original errors remain
  in the receipts rather than being rewritten as clean shutdowns.
- Owned test processes were stopped and their observed PIDs were checked absent.
  Fixture servers closed. Temporary Tailscale Serve routes were removed and the
  pre-existing configuration was restored. Inactive profiles, scripts, images
  and receipts remain operator-local; no production code or installed package
  was changed.

## Evidence and next decision

Operator-local records are under `artifacts/browser-capability-run/`, including
`combined-results.json`, per-case commands/oracles, all run budgets, explicit
correction authorizations, cleanup records and `keychain/STARTUP-CHECK.json`.
They are not distributed files in a public clone.

The next architectural choice is whether to adapt selected behaviors or reuse
the CLI's observation/execution layer as a coherent whole. The mechanics results
do not require adopting only one capability; implementation order is separate
from capability selection.

A subsequent, separately authorized [live Jev–CLI probe](jev-cli-live-probe.md)
tested real model decisions over CLI observations. That evidence is separate
from this synthetic-policy comparison. Production adoption still needs an
explicit decision about the run owner, exact-tab routing and lifecycle
contract; neither evaluation declares #17 fixed.
