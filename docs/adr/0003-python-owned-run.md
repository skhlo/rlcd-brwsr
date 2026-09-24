# Let upstream Python own the run

Status: accepted and implemented; the tab-targeting amendment is locally
verified at corrected candidate `ff49875`. The current compact-handoff amendment
separates goal-aware model-facing content from bounded diagnostic `details` and
has deterministic plus isolated command-driven Pi-TUI evidence with synthetic
browser/provider boundaries. Live Jev relevance quality remains pending. The
helper remains direct DeepSeek `deepseek-flash` with native thinking disabled;
Jev and Pi's outer model are unchanged. See the
[current verification record](../thin-python-evidence.md#compact-handoff), which
preserves older tab-targeting, rewrite and live Ling evidence at their recorded
heads. Publication and public-site acceptance remain pending. Supersedes
ADR-0002's command-level orchestration,
Pi-native helper relay and parent shadow-state design, not its dependency pins or
native Browser Harness ownership.

Use the pinned `Agent.run()` generator and native API-key text helper behind a
small Pi process launcher. Python owns the `Agent`, upstream state, result
projection, known-target retention, and handled-run cleanup. Pi validates the
public input, then one spawn-first supervisor sends one JSON request over stdin,
bounds both child pipes, owns the first stop reason and original absolute
deadline, escalates `SIGTERM` to `SIGKILL` only while exit remains unobserved,
waits for the child to be reaped, and presents one terminal result. There is no
asynchronous file-access precheck or separate pre-spawn stop owner.

The run interface requires `goal`, accepts optional `maxSeconds`, and requires
at least one of `url` or `targetId`. A URL alone creates a tab and preserves the
existing optional `retainTab` policy. A target ID alone continues the exact
borrowed tab without startup navigation; supplying both explicitly navigates
that borrowed tab before the goal. `retainTab` is invalid whenever `targetId`
is supplied, including when its value is false. A separate read-only
`rlcd_brwsr_list_tabs` tool discovers bounded eligible page targets without
navigation, foreground selection, Agent construction or model calls. Discovery
is technical eligibility, not authorization. `maxActions` remains removed
without an alias or replacement setting. Upstream retains its 60-history-entry
and 120-decision limits. The parent wall deadline is coarse and is not a
no-dispatch guarantee.

`config/runtime.json` is the single owner for the 32 KiB serialized-request cap,
16 KiB terminal/full-details JSON cap, Jev model, and selected native helper.
Compact model-facing content is structurally fitted within the same hard cap:
direct DeepSeek `deepseek-flash` at `https://api.deepseek.com/v1`, with
`TEXT_MODEL_REASONING=disabled`. The `/v1` path preserves the pinned helper's
slash-sensitive direct-DeepSeek branch, and the non-`none` reasoning value keeps
its native `thinking: {"type":"disabled"}` request instead of the OpenRouter
`reasoning` shape. The model name is DeepSeek's current V4.1 Flash alias, not an
immutable version pin.

One shared runtime owner first loads Browser Harness's native workspace
environment, then supplies the selected `TEXT_MODEL_BASE_URL`, `TEXT_MODEL`, and
`TEXT_MODEL_REASONING` values in its process when absent and rejects conflicts
before daemon checks or browser startup. `TEXT_MODEL_API_KEY` is a DeepSeek-issued
key and remains optional until upstream selects a fill. Run results retain the
selected helper tuple but omit guessed helper availability; preflight separately
reports nonblank resolved key presence without claiming provider or credential
validity. There is no Pi OAuth/Luna completion, backend selector, or replacement
helper orchestration.

The implementation retains three revision-pinned integrations:

1. Rebind upstream's imported `ensure_daemon` symbol to Browser Harness's
   `require_existing_daemon` after rejecting currently resolved remote/cloud
   configuration and unsupported reported modes.
2. For a created tab, use the known target after `Agent` construction for normal
   requested retention or one direct `Target.closeTarget` call, reporting
   `closed` only for `success: true`.
3. For a borrowed tab, acquire one exact flattened session and temporarily bind
   the pinned `jev_ultrafast.agent.Browser` factory to a Browser object that
   retains native observation, freshness and input behavior. Its lifetime owner
   performs optional exact-session navigation, background focus emulation,
   explicit focus disable and `Target.detachFromTarget`; it never invokes the
   normal Browser constructor or `Target.closeTarget`.

The existing-daemon check does not bind a same-named `cdp` daemon to the current
endpoint, profile, or local-vs-remote settings; the reported mode is not endpoint
attestation. Browser Harness consumes those settings at daemon startup. After a
browser setting changes, the operator must stop the existing daemon, restart it,
and reprovision before preflight or another run, or the stale daemon can still
reach a remote or otherwise wrong browser. This accepted limitation avoids a
second configuration-to-daemon binding owner.

Python consumes `Agent.run()` rather than calling `predict` and `act`. Its full
result contains only bounded existing page/history/model/usage state, target and
cleanup outcomes, a sanitized primary diagnostic, and bounded reporting
metadata. Complete native key and Bearer strings are redacted before reporting
and clipping. Full snapshots and raw prompts/responses are not projected.
Native usage remains source-labelled and incomplete; Pi receives no top-level
`usage`, so footer/session totals are knowingly incomplete.

After handled cleanup, one Python reporting module can issue one batched Noul
request through the pinned `jev_ultrafast.model.post_json` transport for normal
completion or native `BLOCKED` with available observations. It builds generic
bounded candidates from sanitized final visible text and the last six recorded
actions. Page candidates preserve exact source text and token boundaries; action
candidates expose only step, operation, action label and page-change. The model
judges relevance, including units, periods, estimates, exclusions, caveats and
ambiguity. Code validates every answer/model/usage field, resolves substantial
overlap, applies the evaluation-only 0.5 threshold, and copies at most three
source records. The request has a 98,304-byte bound and at most 128 candidates;
the pinned observer supplies at most 6,000 characters of visible text.

The reporter never receives URL, target ID, diagnostic, configuration, usage
history or raw native request/reply data. Missing source/key, provider or
validation failure, and cooperative interruption return explicit reporting
states with no raw-text fallback and never replace the browser outcome or
primary diagnostic. A validated response adds one `jev_handoff` usage record;
failed/retried usage remains unknown. Reporting shares the original parent wall
deadline and adds no cleanup grace or second stop owner.

Pi keeps this full bounded result in tool `details`. Run `content` is separately
built from exactly `outcome`, `lastObservedLocation`, `evidence`, `cleanup`,
`diagnostic`, `reporting`, and `output`. It excludes full page text, history,
model configuration, per-call usage and relevance scores. Structural fitting
drops whole evidence records, then optional location/report fields, while
preserving outcome, cleanup, opaque IDs and primary-error identity. Both
surfaces retain the existing 16 KiB hard cap. Discovery stays unchanged.

Only one structurally valid terminal envelope followed by an observed zero exit
without a signal can carry child execution and cleanup claims. A valid normal
completion claim may win a late parent stop race when the child did not report a
stopped run; retention requires that completion claim, which still needs
independent outer verification. Interrupted or untrusted outcomes preserve the
parent's first stop. Agent-construction interruption, nonzero or forced exit,
or missing/invalid terminal output from a started child leaves execution and
task-tab cleanup unknown. Synchronous or asynchronous no-PID launch failures
remain `not_started`/`not_created`. If Python starts but its script is absent,
the observed non-clean exit instead leaves execution and task-tab cleanup
unknown. An exception escaping projection after request acceptance also falls
back to unknown rather than `invalid_input`. A fitting
fallback preserves a parent's first cancellation/deadline and observed process
reap if adding that evidence
would exceed the terminal cap. The borrowed owner validates exact target type and current URL before attach,
then repeats current eligibility through a session-bound page/frame observation
before navigation or Agent construction. HTTP(S) pages can continue in place;
`about:blank` requires an explicit HTTP(S) URL. Missing, closed or unsuitable
targets do not fall back by URL, title or target difference. Borrowed cleanup
reports focus-disable and detach acknowledgements independently. An acknowledged
focus disable does not prove restoration of document or OS focus, and a forced
child exit can strand both emulation and attachment in the persistent daemon.
There is no startup target interception for created tabs, parent fallback
cleanup, tab-difference inference, automatic retry, progress journal, generic
protocol framework, or strict action-at-deadline guarantee.

Ordinary registered-tool tests cross the real runner and actual pinned
Agent/native helper while substituting external Browser/CDP and provider
interactions. They also exercise discovery, exact borrowed continuation and
navigation, ownership-aware cleanup and forced-exit uncertainty through those
public tool interfaces. One labelled lifecycle case wraps the real Agent for
known-target recovery. Internal process/outcome tests and a direct Python
projection contract cover supervision and synthetic oversized state without
global event/timer patches, whole-extension copies or Agent-history mutation.
Historical TUI command checks exercise real Chrome with synthetic provider
replies at their recorded heads. The later live Ling follow-up covers one helper
payload and a local fixture through Pi's normal agent turn on that historical
production code; it is not provider evidence for the current direct DeepSeek
selection. Tab-targeting acceptance, when recorded in the owning plan and local
handoff, is command-invoked registered-tool evidence with synthetic providers,
not live-provider or outer-model evidence. These checks do not establish general
model quality, complete billing, public-site reliability or delivery. The
[owning plan](../RLCD-BRWSR.md) records the evidence and remaining limits; the
[feasibility record](../thin-python-feasibility.md) remains historical evidence.
