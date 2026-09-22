# RLCD-brwsr plan

Status: the thin Python-owned direction is approved; the replacement is **not
implemented**. This document owns the next implementation plan. Detailed
interface choices below are recommendations to confirm before the rewrite.

The existing code is the larger experimental Pi-native-helper implementation,
recovered at `dde01a46dba112dbf9d002aeb2ebe2626363c034`. Its delivery gate was
cancelled, not passed; four static review findings remain recorded. Recovery
preserved all three gate correction commits. Nothing was pushed and no new PR
was created. The as-built contract remains available in this document's Git
history at that commit, with historical verification in the issue evidence files.

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
- No new Pi wrapper was tested. No live Jev/helper inference, provider
  compatibility, public-site reliability, general cancellation guarantee or
  speed improvement was established.

The source/probe distinction matters: direct upstream fixture viability is a
reason to try the small wrapper, not acceptance of a wrapper that does not exist.

## Proposed interface

Keep `rlcd_brwsr_run` and initially expose only:

```ts
rlcd_brwsr_run({
  url: string;
  goal: string;
  maxSeconds?: number;
  retainTab?: boolean;
});
```

- Validate the HTTP(S) URL, nonempty goal and serialized request before starting
  a process. No shell interpolation or credentials in argv.
- `maxSeconds` is a coarse stop-request deadline measured by Pi from before
  startup. A fixed shutdown grace follows it. It is not a promise that no browser
  action crossed the deadline or that stopping a process rolled back input.
- `retainTab` applies only to a normal upstream completion claim. Retention
  requires a usable task-target handle and must not retain the runner process.
- Schedule sequentially within Pi, without claiming a global browser lock.

**Recommended contract reduction:** omit the current mutation-only `maxActions`
knob initially and preserve upstream's fixed limits. Native history counts waits
and scrolls as well as clicks/fills; it is capped at 60, with a separate
120-decision cap. These are not HTTP-attempt or spend caps. If a lower per-call
limit is needed, consider a clearly named `maxSteps` after testing its semantics;
do not silently reinterpret `maxActions`. This interface reduction needs
confirmation before implementation.

## Ownership and smallest implementation

```text
Pi tool
  -> validate input; start fixed project-local Python with one JSON stdin request
  -> Python resolves native configuration and requires the existing local Harness
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
The source scout's escalation concern has not been runtime-probed.

Python owns the Agent reference, current upstream state, known task target,
provider configuration, result projection, redaction and normal cleanup. Iterate
`Agent.run()` rather than separately driving `predict` and `act`. Keep state
local to Python; do not stream a second model of the run to Pi. On a handled
exception, project only state that actually exists. Do not dump full native
snapshots: they contain raw model request/answer data and potentially large
history and page data.

Two small pinned integrations remain justified:

1. Bind upstream's imported `ensure_daemon` startup symbol to Harness's
   `require_existing_daemon`, retaining the existing small local-mode check.
   Calling direct `Agent` otherwise permits automatic setup/recovery.
2. Once construction returns a known target, use its pinned handle for optional
   retention and one direct `Target.closeTarget` call. Report confirmed closure
   only from a successful response; `Agent.close()` returning is not proof.

No startup target interception, parent fallback-cleanup mode, tab-difference
ownership inference, generic RPC framework, new daemon or durable run journal
is part of this proposal.

## Configuration and operating scope

Retain the uv-managed Python 3.12 environment, Jev Ultrafast commit
`1231850a0bf1a0c0341fe408ef1668dbbfdfac46`, Browser Harness 0.1.13 and evaluated
Jev model pin. Browser Harness remains the single browser-configuration owner.
Loading the Pi extension stays inert; installation/provisioning is explicit,
and tool runs require the already-provisioned local named daemon.

Use native `TYPESAFE_API_KEY` and `TEXT_MODEL_*` settings through the authorized
host-local environment/configuration. Do not introduce a secret store, copy
existing credentials or read Pi's OAuth credentials. The future helper provider
and model have not been chosen. A key alone selects upstream's DeepSeek defaults;
other providers also require their base URL and model. “OpenAI-compatible” is
not proof that the provider accepts this pin's reasoning parameters.

The helper remains optional for click-only tasks. Native missing-key or invalid
value errors must return useful sanitized errors and available state, without
inventing a field value or switching to the outer Pi model.

Initial tasks remain benign, unauthenticated and non-booking. The outer agent
owns permissions and verification. Neither the wrapper nor upstream guarantees
recognition of every consequential control or prompt-injection immunity. No
custom extractor, site script, TypeScript port, Chrome-CLI fallback, page-cleanup
LLM, recordings or automatic rollout is added.

## Results and deliberately narrower guarantees

Python returns a small projection: completion claim or stop/error, last actually
observed page when available, bounded recorded history, configured model names,
upstream-retained usage, known target, cleanup outcome and a sanitized diagnostic.
Use one explicit UTF-8 byte budget for the projected terminal result and report
omitted fields/records. The same projection can serve content and details;
there is no need for competing detailed state reconstructions. Final cap values
and pathological Unicode/metadata behavior still require executable tests.

- `DONE` is a completion claim, never independent proof of the goal.
- Redact complete raw values before clipping or preview. Keep both Jev/helper
  key privacy checks; no OAuth relay exists in this target design.
- A handled error or cooperative stop may provide available Agent state. A hard
  kill, failed construction or invalid/missing result may provide none.
- After forced or incomplete exits, report execution and cleanup as unknown;
  do not infer zero side effects, zero charges or closed tabs. A task tab can
  remain for operator inspection. Do not automatically retry uncertain input.
- Keep the parent's first stop reason when requested shutdown yields no valid
  terminal result. Confirm child exit before reporting it reaped; a sent signal
  is not an exit observation.
- No live phase-by-phase progress, hard-kill evidence recovery or universal
  no-dispatch-after-deadline guarantee is promised.

An upstream budget exception is not the same as Jev choosing `BLOCKED`; preserve
the exception rather than translating solely from upstream's status field.

Available usage is only the subset upstream retained. Invalid helper responses,
failed requests and retry counts can be absent. Do not equate record count with
request count or missing usage with zero. **Initial accounting recommendation:**
show bounded source-labelled records and unavailable values in tool details;
omit Pi top-level `usage` unless its required numeric fields are supportable.
This leaves Pi footer/session totals incomplete and must be disclosed. Whether
to add rate-based estimated totals is an open choice after provider selection,
not a reason to build a billing adapter now.

## Reuse and leave behind

Reuse dependency pins/setup, native Harness configuration and existing-daemon
checks, inert Pi registration, browser fixtures, independent observation helpers,
and the redaction/bounding/cleanup lessons. Reuse behavior tests where the
contract is unchanged; do not preserve the old implementation solely for tests.

Replace the current TypeScript protocol engine and Python command-level bridge.
Remove the Pi-Luna completion adapter, helper reply channel and sentinel backend,
shadow state, phase validators/reducers, usage-to-field merge and parent fallback
cleanup mode. Retire tests for deliberately removed promises and replace them
with the reduced public contract. Do not delete historical branches, reports,
raw evidence or the earlier custom-loop work.

## Implementation and verification sequence

1. Confirm the proposed removal of mutation-only `maxActions` and the initial
   accounting limitation. Select concrete request/result byte budgets without
   clipping upstream observations or helper prompts.
2. Build a small Python runner plus the small Pi launcher. No provider
   credential or live model call is needed for the deterministic work.
3. Test through the registered Pi tool with the real new runner and external
   fakes: native click/fill/DONE/BLOCKED/error behavior, empty/malformed helper
   values, preflight/input failure, output overflow/Unicode/privacy, stop
   precedence, cooperative cleanup and unknown-on-hard-kill/construction.
4. Repeat the click/text fixtures through the actual Pi TUI and new runner with
   real upstream/Harness/Chrome and synthetic provider replies. Independently
   inspect known owned targets, test retention/default close and a real bounded
   stop, and measure resource outcomes instead of inferring them from signals.
5. Only after provider selection and explicit applicable allowance, test its
   native helper payload, then a benign public task using real Jev/helper calls.
   Preserve earlier ledgers; native step limits do not constitute a billing
   budget. Report unknown attempts/charges conservatively.

Do not add a broader test or runtime framework to satisfy every hypothetical
failure. A discovered limitation may require a narrower disclosed contract,
not another state owner. No implementation, live-provider acceptance or delivery
is implied by this plan.

## Evidence and history

- [Feasibility source/probe record](thin-python-feasibility.md).
- [Next architecture decision](adr/0003-python-owned-run.md).
- [Recovered architecture and amendments](adr/0002-wrap-pinned-jev-ultrafast-agent.md).
- Earlier verification: [#10](issue-10-evidence.md), [#11](issue-11-evidence.md),
  [#12](issue-12-evidence.md). Those are not tests of the proposed rewrite.
- Local raw probes and recovery receipts: `artifacts/thin-python-plan/`.
- Cancelled gate: `01M33MP2Y3PGGAM3EARNPYQMTQ`; unresolved static findings R23-R26
  are preserved in the local review log, not represented as fixed or reproduced.

GitHub issues #9-#13 still describe the prior implementation and have not been
rewritten by this planning task. The later approved direction and this plan
must be reconciled with those issues before implementation is presented as
satisfying them. PR #8 and the sibling experiment checkout remain untouched.
