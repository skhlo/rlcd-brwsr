# Let upstream Python own the run

Status: accepted, implemented and locally verified at `b3b42036`. Twenty
automated tests and four repeated synthetic-provider Pi-TUI/real-Chrome command
checks pass. A subsequent bounded live Ling probe and one local fixture through
Pi's normal outer-model/tool path also passed on the same production code.
Public-site acceptance remains pending; see the
[verification record](../thin-python-evidence.md).
Supersedes ADR-0002's command-level orchestration,
Pi-native helper relay and parent shadow-state design, not its dependency pins or
native Browser Harness ownership.

Use the pinned `Agent.run()` generator and native API-key text helper behind a
small Pi process launcher. Python owns the `Agent`, upstream state, result
projection, known-target retention, and handled-run cleanup. Pi validates the
public input, sends one JSON request over stdin, bounds both child pipes, owns
the first stop reason, escalates `SIGTERM` to `SIGKILL` only while exit remains
unobserved, waits for the child to be reaped, and presents one terminal result.

The public interface is `url`, `goal`, optional `maxSeconds`, and optional
`retainTab`. `maxActions` is removed without an alias or replacement setting.
Upstream retains its 60-history-entry and 120-decision limits. The parent wall
deadline is coarse and is not a no-dispatch guarantee.

`config/runtime.json` is the single owner for the 32 KiB serialized-request cap,
16 KiB terminal/model-visible JSON cap, Jev model, and selected native helper:
OpenRouter `inclusionai/ling-3.0-flash` with reasoning disabled. One shared
runtime owner first loads Browser Harness's native workspace environment, then
supplies the selected `TEXT_MODEL_BASE_URL`, `TEXT_MODEL`, and
`TEXT_MODEL_REASONING` values in its process when absent and rejects conflicts
before daemon checks or browser startup. `TEXT_MODEL_API_KEY` remains optional
until upstream selects a fill. There is no
Pi OAuth/Luna completion, backend selector, or replacement helper orchestration.

The implementation retains two revision-pinned integrations:

1. Rebind upstream's imported `ensure_daemon` symbol to Browser Harness's
   `require_existing_daemon` after rejecting currently resolved remote/cloud
   configuration and unsupported reported modes.
2. After `Agent` construction returns, retain its known target only for a normal
   completion claim when requested; otherwise make one direct
   `Target.closeTarget` call and report `closed` only for `success: true`.

The existing-daemon check does not bind a same-named `cdp` daemon to the current
endpoint, profile, or local-vs-remote settings; the reported mode is not endpoint
attestation. Browser Harness consumes those settings at daemon startup. After a
browser setting changes, the operator must stop the existing daemon, restart it,
and reprovision before preflight or another run, or the stale daemon can still
reach a remote or otherwise wrong browser. This accepted limitation avoids a
second configuration-to-daemon binding owner.

Python consumes `Agent.run()` rather than calling `predict` and `act`. Its result
contains only bounded existing page/history/model/usage state, target and cleanup
outcomes, and a sanitized diagnostic. Complete native key strings are redacted
before clipping, including usage keys. Full snapshots and raw prompts/responses
are not projected. Native usage remains source-labelled and incomplete; Pi
receives no top-level `usage`, so footer/session totals are knowingly incomplete.

Only one structurally valid terminal envelope followed by an observed zero exit
without a signal can carry child execution and cleanup claims. Construction
interruption, nonzero or forced exit, or missing/invalid terminal output leaves
execution and task-tab cleanup unknown. An exception escaping projection after
request acceptance also falls back to unknown rather than `invalid_input`. A
fitting fallback preserves a parent's first cancellation/deadline and observed
process reap if adding that evidence would exceed the terminal cap. There is no startup target interception, parent
fallback cleanup, tab-difference inference, automatic retry, progress journal,
generic protocol framework, or strict action-at-deadline guarantee. `DONE`
remains a completion claim requiring independent outer verification.

Local tests cross the registered tool, real runner, and actual pinned
Agent/native helper while substituting only external Browser/CDP and provider
interactions. Separate TUI command checks exercise real Chrome with synthetic
provider replies. The later live follow-up covers one helper payload and a local
fixture through Pi's normal agent turn. These checks do not establish general
model quality, complete billing, public-site reliability or delivery. The
[owning plan](../RLCD-BRWSR.md) records remaining acceptance steps; the
[feasibility record](../thin-python-feasibility.md) remains historical evidence.
