# RLCD-brwsr plan

Status: the thin Python-owned rewrite is **implemented and locally verified**.
Corrected implementation `b3b42036` passed 20 automated tests and four repeated
Pi-TUI/real-Chrome command checks with synthetic provider replies. Those command
checks invoke the registered tool, not an outer-LLM-issued tool turn. A later
bounded live helper probe and one local fixture through Pi's normal agent-turn
path also passed, using real Jev and Ling on that unchanged historical
implementation. The current helper selection is direct DeepSeek
`deepseek-flash`, with native thinking disabled in the request; Jev and Pi's
outer model remain unchanged. The configuration-only switch itself had no live
or actual-surface check. The local tab-targeting candidate extends it with a
49-test deterministic suite and two bounded command-driven
actual-Pi-TUI/real-Chrome acceptance passes using only local fixture tabs and
synthetic provider replies. Those passes invoked the production registered definitions by name and used no
outer model, live inference or public site. See the historical
[verification record](thin-python-evidence.md) and the retained local handoff
under `artifacts/tab-targeting/implementation/`.
The user confirmed dropping `maxActions` and accepted available native usage
with explicitly incomplete Pi totals. This model change excluded live calls.
Historical live checks used Ling and covered bounded helper/local-fixture cases,
not public-site trials. The DeepSeek change is local and unpublished.

The larger experimental Pi-native-helper implementation remains historical at
`dde01a46dba112dbf9d002aeb2ebe2626363c034`. Its delivery gate was cancelled,
not passed; four static review findings remain recorded. Recovery preserved all
three gate correction commits. Nothing was pushed and no new PR was created.
The old as-built contract remains available in this document's Git history at
that commit, with historical verification in the issue evidence files.

## Decision and reason

Use the pinned upstream `Agent.run()` generator and its native API-key text
helper. Python owns the browser run and its state. Pi launches it, requests stop,
reaps the process and displays a bounded result. Do not port upstream to
TypeScript or retain a Pi-Luna callback as another helper backend.

This trades an additional host-local text-provider key for less orchestration:
no bidirectional helper relay, no TypeScript shadow browser state and no
cross-language action-history reconciliation. It also deliberately promises
less after forced termination. [ADR-0003](adr/0003-python-owned-run.md) records
this change to ADR-0002's later amendments.

## What the investigation established

[Thin Python feasibility](thin-python-feasibility.md) owns the source citations
and probe findings. The evidence is narrow:

- At the pinned revision, `Agent.run()` returns a synchronous generator. It
  yields snapshots; exhausting it does not return a separate result object.
- Eleven offline assertions exercised native completion, text validation,
  limits and signals with external Browser/provider fakes. Expected failures
  and unknown cleanup counted as passing assertions, not successful cleanup.
- Two direct-runtime fixtures used the real Agent, native helper validation,
  Browser Harness and isolated Chrome, with synthetic Jev/helper HTTP replies.
  Independent CDP inspection verified the exact click and text-entry targets.
  Exact close responses were true and the target baseline was restored.
- A separate normal-retention probe confirmed an exact task target remained
  inspectable after its Python child exited and was reaped, then closed that
  target. A preceding harness setup failure is retained; this was not a
  first-attempt reliability result.
- At that stage no new Pi wrapper had been tested. No live Jev/helper inference,
  provider compatibility, public-site reliability, general cancellation
  guarantee or speed improvement was established.

The source/probe distinction still matters: those direct upstream fixtures were
a reason to build the wrapper, not acceptance evidence for the implementation.

## Implemented interface

The extension registers two inert tools:

```ts
rlcd_brwsr_list_tabs({});

rlcd_brwsr_run({
  url?: string;
  targetId?: string;
  goal: string;
  maxSeconds?: number;
  retainTab?: boolean;
});
```

- Discovery lists bounded eligible HTTP(S) and exact `about:blank` page targets
  from the same configured existing Harness connection. It sorts exact IDs,
  distinguishes empty success from error, clips untrusted titles/URLs with
  labels, omits any ID it cannot return exactly, and performs no navigation,
  foreground selection, Agent/model call or daemon startup. Technical
  eligibility is not authorization.
- A URL alone preserves created-tab behavior. A target ID alone continues an
  exact eligible HTTP(S) borrowed tab without startup navigation. Supplying both
  navigates that borrowed tab before the goal; `about:blank` therefore requires
  an explicit HTTP(S) URL. Missing, closed and unsuitable targets do not fall
  back by title, URL or target difference.
- Target IDs are nonblank opaque strings of at most 512 UTF-8 bytes and remain
  byte-for-byte unchanged. At least one of URL or target ID is required. Any
  supplied `retainTab`, including false, is invalid in borrowed mode.
- Validate the HTTP(S) URL, nonempty goal and serialized request before starting
  a process. No shell interpolation or credentials in argv.
- `maxSeconds` is a coarse stop-request deadline measured by Pi from before
  startup. A fixed shutdown grace follows it. It is not a promise that no browser
  action crossed the deadline or that stopping a process rolled back input.
- `retainTab` applies only to a normal upstream completion claim for a created
  tab. Retention requires a usable task-target handle and must not retain the
  runner process.
- Schedule sequentially within Pi, without claiming a global browser or user-tab
  lock.

**Implemented contract reduction:** `maxActions` is absent. There is no
replacement per-call step knob or compatibility alias. Upstream's native limits
remain unchanged: history counts waits
and scrolls as well as clicks/fills and is capped at 60, with a separate
120-decision cap. These are not HTTP-attempt or spend caps. The wrapper adds
only the coarse `maxSeconds` stop request.

## Ownership and smallest implementation

```text
Pi tool
  -> validate input; start fixed project-local Python with one JSON stdin request
  -> Python resolves native configuration and requires the existing named Harness daemon
  -> Python constructs Agent and consumes Agent.run()
  -> upstream owns observation, Jev selection, native helper HTTP and browser input
  -> Python projects available state, makes the normal cleanup/retention decision
  <- one bounded terminal JSON result
```

The small TypeScript launcher owns only input validation, process I/O bounds,
its stop reason, stop/reap handling and presentation. It does not reconstruct
browser phases or merge helper replies with Python history. Installed Pi 0.85.1
`pi.exec` lacks the stdin and output-bound controls this interface needs; use a
small Node built-in `spawn` helper rather than another process package/framework.
For each valid request, one spawn-first supervisor owns the child, first observed
stop, original absolute deadline, pipe bounds, escalation and observed reap.
There is no asynchronous file-access precheck or separate pre-spawn stop owner.
A no-PID launch error remains a definite pre-start setup result; Python starting
with an absent script becomes a reaped non-clean result with unknown execution
and task-tab cleanup. The escalation path is exercised locally with a child that
ignores `SIGTERM`.

Python owns the Agent reference, current upstream state, known task target,
provider configuration, result projection, redaction and normal cleanup. Iterate
`Agent.run()` rather than separately driving `predict` and `act`. Keep state
local to Python; do not stream a second model of the run to Pi. On a handled
exception, project only state that actually exists. Do not dump full native
snapshots: they contain raw model request/answer data and potentially large
history and page data.

Three small pinned integrations remain justified:

1. Bind upstream's imported `ensure_daemon` startup symbol to Harness's
   `require_existing_daemon`, retaining the current resolved-configuration and
   reported-mode checks. Calling direct `Agent` otherwise permits automatic
   setup/recovery.
2. Once created-tab construction returns a known target, use its pinned handle
   for optional retention and one direct `Target.closeTarget` call. Report
   confirmed closure only from a successful response; `Agent.close()` returning
   is not proof.
3. In borrowed mode, acquire one exact flattened session and temporarily bind
   the pinned `jev_ultrafast.agent.Browser` factory to a Browser object that
   reuses native observe/fresh/act behavior without native constructor effects.
   Its one lifetime owner handles optional exact-session navigation, focus
   enable/disable and `Target.detachFromTarget`, and never closes the target.

Borrowed mode validates target type and current URL before attach, then checks
eligibility again through a session-bound page/frame observation before
navigation or Agent construction. Cleanup attempts explicit focus disable and
exact detach independently. Focus acknowledgement does not establish original
document or OS focus restoration. Forced termination may strand both operations
in the persistent daemon; the selected contract reports unknown cleanup and has
no parent fallback. No created-tab startup interception, tab-difference ownership
inference, generic RPC framework, new daemon or durable run journal is part of
the implementation.

## Configuration and operating scope

Retain the uv-managed Python 3.12 environment, Jev Ultrafast commit
`1231850a0bf1a0c0341fe408ef1668dbbfdfac46`, Browser Harness 0.1.13 and evaluated
Jev model pin. Browser Harness remains the single browser-configuration owner.
Loading the Pi extension stays inert; installation/provisioning is explicit,
and tool runs require the already-provisioned named daemon while rejecting
currently resolved remote/cloud configuration and unsupported reported modes.

This intentionally does not attest that an already-running same-named `cdp`
daemon matches the current endpoint, profile, or local-vs-remote settings.
Browser Harness consumes those settings at daemon startup, and `cdp` is only a
reported mode. After any browser setting changes, the operator must explicitly
stop the existing daemon, restart it, and reprovision through the project setup
path before preflight or another tool run. Otherwise the stale daemon can still
reach a remote or otherwise wrong browser.

Use native `TYPESAFE_API_KEY` and `TEXT_MODEL_*` settings through the authorized
host-local environment/configuration. Do not introduce a secret store, copy
existing credentials or read Pi's OAuth credentials. `TYPESAFE_API_KEY`
authenticates Jev decisions. `TEXT_MODEL_API_KEY` must be a DeepSeek-issued key
for the optional field-text helper. Jev remains the decision model.

After Browser Harness loads its native workspace environment, one shared runtime
owner supplies these selected settings process-locally when absent and rejects
conflicting values before daemon checks or browser startup:

```text
TEXT_MODEL_BASE_URL=https://api.deepseek.com/v1
TEXT_MODEL=deepseek-flash
TEXT_MODEL_REASONING=disabled
```

The `/v1` path is required by the pinned helper's slash-sensitive native
DeepSeek branch. `deepseek-flash` is the currently documented DeepSeek-V4.1-Flash
alias, not immutable version identity. `disabled` is a readable non-`none` value
that preserves the unchanged helper's native
`thinking: {"type":"disabled"}` payload; it is not an upstream enum. The exact
fake-provider seam verifies that payload, the absence of the OpenRouter
`reasoning` field, the direct URL, model, JSON-object format and 1,024-token cap.
See the [current direct-provider evidence](deepseek-direct-flash.md).

The parent-owned, human-run four-stage wizard will supply the named values in
Browser Harness's native workspace `.env`; this task does not author or run it
and did not read or write a host `.env`. Do not use the retained old `pi-rlcd`
launcher for direct DeepSeek: it injects an OpenRouter key into
`TEXT_MODEL_API_KEY`. The parent task will make that launcher fail closed without
deleting it; this repository change does not edit the launcher.

The earlier DeepSeek-through-OpenRouter selection is preserved as
[superseded local research](openrouter-deepseek-v4.1-flash.md), and the authorized
Ling tests remain historical at their recorded heads in the
[Ling provider evidence](openrouter-ling-3.0-flash.md). No provider adapter or
routing selector is added.

The helper remains optional for click-only tasks. Native missing-key or invalid
value errors return sanitized errors and available state, without inventing a
field value or switching to the outer Pi model. Run results retain the configured
helper model, base URL and reasoning setting but omit the former guessed
`models.textHelper.availability`. Preflight's separate
`textHelperAvailability` reports only whether the resolved key is nonblank; it
does not prove provider availability or credential validity.

Initial tasks remain benign, unauthenticated and non-booking. The outer agent
owns permissions and verification. Neither the wrapper nor upstream guarantees
recognition of every consequential control or prompt-injection immunity. No
custom extractor, site script, TypeScript port, Chrome-CLI fallback, page-cleanup
LLM, recordings or automatic rollout is added.

## Results and deliberately narrower guarantees

Python returns a small projection: completion claim or stop/error, last actually
observed page when available, bounded recorded history, configured model names,
upstream-retained usage, known target, cleanup outcome and a sanitized diagnostic.
`config/runtime.json` owns a 32 KiB serialized-request cap and one 16 KiB
terminal/model-visible JSON cap, including JSON escaping and terminal framing.
The result reports omitted fields/records. Content and details use the same final
projection. Local executable tests cover overflow, malformed Unicode, non-finite
numbers and complete-key redaction before clipping.

- `DONE` is a completion claim, never independent proof of the goal.
- Redact complete raw values before clipping or preview. Keep both Jev/helper
  key privacy checks; no OAuth relay exists in this target design.
- A handled error or cooperative stop may provide available Agent state. A hard
  kill, failed construction or invalid/missing result may provide none. After a
  request is accepted for dispatch, an exception escaping final projection falls
  back to unknown execution and cleanup rather than an input-error claim.
- Trusted borrowed outcomes use `taskTab: "not_owned"` and independently report
  focus release as `not_applied`, `disable_acknowledged`, or `unconfirmed`, and
  attachment release as `not_acquired`, `detach_acknowledged`, or `unconfirmed`.
  Requested navigation crosses the conservative effect boundary before
  `Page.navigate`; provider/input races after admission retain unknown effects.
- Trust child execution and cleanup claims only from one structurally valid
  terminal envelope followed by an observed zero exit without a signal. After
  forced, nonzero, signalled, invalid-terminal, or incomplete exits, report
  execution and all applicable cleanup fields as unknown; do not infer zero side
  effects, zero charges or closed tabs. A task tab can remain for operator
  inspection. Do not automatically retry uncertain input.
- Keep the parent's first stop reason when requested shutdown yields no trusted
  terminal result. A structurally valid normal completion claim followed by an
  observed clean zero exit may win a late parent stop race when the child did
  not report a stopped run; it remains a claim requiring independent
  verification. Retention is valid only with that completion claim. Confirm
  child exit before reporting it reaped; a sent signal is not an exit
  observation. If supervised process evidence would push a child projection
  over the terminal cap, omit that projection conservatively while retaining
  the parent's stop and the observed reap.
- An unexpected EOF on the child's stdout while Python remains alive is not a
  stop trigger and proves neither completion, process exit, provider
  cancellation nor cleanup. Browser work can continue until Pi cancellation,
  the wall deadline or process exit.
- No live phase-by-phase progress, hard-kill evidence recovery or universal
  no-dispatch-after-deadline guarantee is promised.

An upstream budget exception is not the same as Jev choosing `BLOCKED`; preserve
the exception rather than translating solely from upstream's status field.

Available usage is only the subset upstream retained. Invalid helper responses,
failed requests and retry counts can be absent. Do not equate record count with
request count or missing usage with zero. **Confirmed initial accounting policy:**
show bounded source-labelled records and unavailable values in tool details;
omit Pi top-level `usage`. This leaves Pi footer/session totals incomplete and
must be disclosed. Rate-based estimated totals are outside this initial build.
Published provider rates do not recover missing fields or failed-call usage and
are not a reason to build a billing adapter now.

## Reuse and leave behind

Reuse dependency pins/setup, native Harness configuration and existing-daemon
checks, inert Pi registration, browser fixtures, independent observation helpers,
and the redaction/bounding/cleanup lessons. Reuse behavior tests where the
contract is unchanged; do not preserve the old implementation solely for tests.

The rewrite replaced the TypeScript protocol engine and Python command-level
bridge. It removed the Pi-Luna completion adapter, helper reply channel and
sentinel backend, shadow state, phase validators/reducers, usage-to-field merge
and parent fallback cleanup mode. Tests for deliberately removed promises were
replaced with the reduced public contract. Historical branches, reports, raw
evidence and the earlier custom-loop work remain retained.

## Implementation and verification sequence

The deterministic suite separates its evidence interfaces. Ordinary registered
Pi-tool cases cross the real runner and pinned Agent/native helper while
replacing external Browser/CDP and provider interactions. Tab-targeting cases
cover model-free discovery, empty/error/omission distinctions, request modes,
exact continuation and navigation, pre-effect rejection, post-navigation
uncertainty, handled borrowed cleanup and forced-exit uncertainty. One labelled
lifecycle case wraps the real Agent to interrupt known-target recovery. Internal
process/outcome tests exercise spawn, stop precedence, fitting, EOF, hard-stop
and observed reap without global event/timer patches or whole-extension copies.
A direct Python projection contract supplies explicit synthetic state rather
than mutating Agent history. The read-readiness fixture scopes a child, marker
and workspace through callback and timeout, including the callback's lifetime;
its cleanup bounds observation, not filesystem deletion or arbitrary callback
execution. A timed-out filesystem removal reports its exact workspace as
pending or unconfirmed, and late rejection is handled. Callback JavaScript
cannot be forcibly cancelled by a Promise race.

Together, 49 tests cover click/fill/DONE/BLOCKED/error, missing and malformed
helper values, preflight/input failure, byte bounds, Unicode/non-finite
normalization, native `.env` ordering and key privacy, first-stop precedence,
post-dispatch projection interruption, conservative output fitting, cooperative
cleanup, non-clean terminal rejection, a reaped TERM-ignoring child, and the
borrowed/discovery cases above. No live credentials or model calls were used for
this candidate.

The click/default-close, text/retention, time-budget and TUI-cancellation cases
were repeated successfully at corrected implementation `b3b42036`, using real
upstream/Harness/Chrome and synthetic provider replies. Independent observers
checked exact targets, retained field values, actual runner exits and restored
browser baselines. This verifies command-invoked execution of the registered
tool in Pi's TUI, not the whole outer-model agent-turn/tool-scheduling path.

The tab-targeting actual-surface acceptance ran twice successfully as a slash
command in Pi 0.87.1 with the production registrations loaded explicitly; the
second pass repeated the final production code after a cleanup exception-type
narrowing. Each distinguished two
same-URL fixture tabs, completed two sequential goals on one exact ID, navigated
a second exact borrowed ID, and preserved created-tab default closure.
Independent CDP observations verified tested form/viewport preservation,
deliberate state changes, detached sessions, exact identity, the Maps tab and
the full unrelated page baseline. Twelve assertions passed. A first harness
attempt is retained because its synthetic selector mistakenly returned `DONE`
before the phase actions; correcting goal extraction and rerunning produced the
accepted evidence. No production code changed between those attempts.

The historical bounded Ling follow-up passed: the native OpenRouter helper
returned a valid field value, and Pi's normal outer-model/tool path completed
one local text-entry fixture using real Jev and Ling. Independent post-exit
inspection verified the retained target, then exact cleanup restored the
baseline. No manual retry or extra browser-tool invocation occurred. It is not
live evidence for the current direct DeepSeek selection.

A benign public-site acceptance task remains pending and needs its own applicable
allowance. Preserve earlier ledgers; native step limits do not constitute a
billing budget. Report unknown attempts/charges conservatively.

Do not add a broader test or runtime framework to satisfy every hypothetical
failure. A discovered limitation may require a narrower disclosed contract,
not another state owner. The tested live local fixture does not imply general-web
acceptance, compatibility across providers/configurations, or delivery.

## Evidence and history

The canonical development checkout is now `~/Repositories/rlcd-brwsr/`. The
[archive index](archive.md) owns historical branch/backup locations and explains
why the former implementation checkout remains for test resources. Pre-consolidation
raw artifact paths below resolve under that retained checkout.

- [Thin rewrite verification and limits](thin-python-evidence.md).
- [Feasibility source/probe record](thin-python-feasibility.md).
- [Selected direct DeepSeek helper evidence](deepseek-direct-flash.md).
- [Superseded local OpenRouter DeepSeek research](openrouter-deepseek-v4.1-flash.md).
- [Historical Ling helper evidence](openrouter-ling-3.0-flash.md).
- [Next architecture decision](adr/0003-python-owned-run.md).
- [Recovered architecture and amendments](adr/0002-wrap-pinned-jev-ultrafast-agent.md).
- Earlier verification: [#10](issue-10-evidence.md), [#11](issue-11-evidence.md),
  [#12](issue-12-evidence.md). Those are not tests of this rewrite.
- Local raw probes and recovery receipts: `artifacts/thin-python-plan/`.
- Cancelled gate: `01M33MP2Y3PGGAM3EARNPYQMTQ`; unresolved static findings R23-R26
  are preserved in the local review log, not represented as fixed or reproduced.

GitHub issues #9-#13 still describe the prior implementation and have not been
rewritten by this local implementation task. The approved direction and this
current implementation must be reconciled with those issues before the work is
presented as satisfying them. PR #8 and historical research commits remain
unchanged. The user's later checkout-consolidation request replaced the visible
experimental working tree with the current implementation while preserving the
research branches and a verified archive.
