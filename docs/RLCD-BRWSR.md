# RLCD-brwsr plan

Status: the thin Python-owned rewrite is **implemented and locally verified**.
Corrected implementation `b3b42036` passed 20 automated tests and four repeated
Pi-TUI/real-Chrome command checks with synthetic provider replies. Those command
checks invoke the registered tool, not an outer-LLM-issued tool turn. A later
bounded live helper probe and one local fixture through Pi's normal agent-turn
path also passed, using real Jev and Ling on that unchanged implementation. The
current hardened local candidate has a 37-test deterministic suite; it has not
received a new live, real-Chrome, outer-agent-turn or public-site check. See
the [verification record](thin-python-evidence.md). The user confirmed
dropping `maxActions`, selected OpenRouter `inclusionai/ling-3.0-flash`, and
accepted available native usage with explicitly incomplete Pi totals. The build
itself excluded live calls. The subsequent allowance covered only the live
helper probe and one 30-second local fixture; it did not cover public-site
trials. No push or PR has occurred.

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

Two small pinned integrations remain justified:

1. Bind upstream's imported `ensure_daemon` startup symbol to Harness's
   `require_existing_daemon`, retaining the current resolved-configuration and
   reported-mode checks. Calling direct `Agent` otherwise permits automatic
   setup/recovery.
2. Once construction returns a known target, use its pinned handle for optional
   retention and one direct `Target.closeTarget` call. Report confirmed closure
   only from a successful response; `Agent.close()` returning is not proof.

No startup target interception, parent fallback-cleanup mode, tab-difference
ownership inference, generic RPC framework, new daemon or durable run journal
is part of the implementation.

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
existing credentials or read Pi's OAuth credentials. The selected text helper
is OpenRouter `inclusionai/ling-3.0-flash`; Jev remains the decision model.
After Browser Harness loads its native workspace environment, one shared runtime
owner supplies these selected settings process-locally when absent and rejects
conflicting values before daemon checks or browser startup:

```text
TEXT_MODEL_BASE_URL=https://openrouter.ai/api/v1
TEXT_MODEL=inclusionai/ling-3.0-flash
TEXT_MODEL_REASONING=none
```

`TEXT_MODEL_API_KEY` must come from a host-local OpenRouter key; this build did
not read or configure one during implementation. The later explicitly authorized
tests reused preserved host-local keys in process environments without copying
them to another file. The reasoning setting makes the unchanged upstream helper
send `reasoning.enabled: false`. One subsequent live helper response validated
`Busan` and reported zero reasoning tokens; this does not guarantee every route
or request will behave identically. Its current JSON-mode route and
pricing differ from the model's cheapest advertised route; see the
[provider evidence](openrouter-ling-3.0-flash.md). An offline probe verified the
native request shape and local value validation only. No provider adapter or
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
- Trust child execution and cleanup claims only from one structurally valid
  terminal envelope followed by an observed zero exit without a signal. After
  forced, nonzero, signalled, invalid-terminal, or incomplete exits, report
  execution and cleanup as unknown; do not infer zero side effects, zero charges
  or closed tabs. A task tab can remain for operator inspection. Do not
  automatically retry uncertain input.
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
Selecting OpenRouter and obtaining advertised rates does not recover missing fields or failed-call
usage, and is not a reason to build a billing adapter now.

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
Pi-tool cases cross the real runner and pinned Agent/native helper while replacing
external Browser/CDP and provider interactions. One labelled lifecycle case wraps
the real Agent to interrupt known-target recovery. Internal process/outcome tests
exercise spawn, stop precedence, fitting, EOF, hard-stop and observed reap without
global event/timer patches or whole-extension copies. A direct Python projection
contract supplies explicit synthetic state rather than mutating Agent history.
Together they cover click/fill/DONE/BLOCKED/error, missing and malformed helper
values, preflight/input failure, byte bounds, Unicode/non-finite normalization,
native `.env` ordering and key privacy, first-stop precedence, post-dispatch
projection interruption, conservative output fitting, cooperative cleanup,
non-clean terminal rejection and a reaped TERM-ignoring child. No live credentials
or model calls were used for this candidate.

The click/default-close, text/retention, time-budget and TUI-cancellation cases
were repeated successfully at corrected implementation `b3b42036`, using real
upstream/Harness/Chrome and synthetic provider replies. Independent observers
checked exact targets, retained field values, actual runner exits and restored
browser baselines. This verifies command-invoked execution of the registered
tool in Pi's TUI, not the whole outer-model agent-turn/tool-scheduling path.

The subsequent bounded live follow-up passed: the native OpenRouter helper
returned a valid field value, and Pi's normal outer-model/tool path completed
one local text-entry fixture using real Jev and Ling. Independent post-exit
inspection verified the retained target, then exact cleanup restored the
baseline. No manual retry or extra browser-tool invocation occurred.

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
- [Selected OpenRouter helper evidence](openrouter-ling-3.0-flash.md).
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
