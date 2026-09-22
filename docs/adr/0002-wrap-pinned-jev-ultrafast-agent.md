# Wrap the pinned Jev Ultrafast Agent

Status: records the recovered implementation and its earlier accepted amendments.
[ADR-0003](0003-python-owned-run.md) supersedes the orchestration/helper direction
for the planned replacement, which is not implemented. The history below is
retained; it is not a claim that the cancelled delivery gate passed.

This decision originally superseded ADR-0001 for the active implementation.

RLCD-brwsr will expose `browser-use/jev-ultrafast` at commit
`1231850a0bf1a0c0341fe408ef1668dbbfdfac46` through one thin Pi extension and a
small Python bridge. Upstream owns observation, indexed action candidates,
selection, text-helper handoff, stale-state checks, and execution through its
Browser Harness `0.1.13` dependency. The wrapper owns validation, finite
budgets, cancellation, bounded JSONL progress/results, Pi-native text completion,
and run-owned cleanup.

The bridge uses upstream's prediction/action/state integration seam at that
exact revision to report progress and enforce wrapper budgets. This seam is not
a stable upstream API, so pin updates require explicit compatibility tests.
Upstream's browser startup hook is narrowly rebound directly to Browser
Harness's native `require_existing_daemon()` check. The wrapper never falls back
to automatic discovery or startup during a run.

## Browser configuration ownership amendment

Issue #10 initially implemented a stronger wrapper-owned connection contract:
`RLCD_BRWSR_DAEMON` and `RLCD_BRWSR_CDP_URL` overrode Browser Harness settings,
and the wrapper compared endpoint and daemon target identifiers. The user's
later approved simplification supersedes that part of this ADR.

Browser Harness now solely owns connection configuration and resolution through
`BU_NAME` and its native settings, including workspace `.env` loading. The
wrapper no longer parses, aliases, clears, reapplies, mirrors, or independently
reconciles browser selectors. It retains a small local-only check after native
resolution, explicit provisioning, and existing-daemon-only preflight/runtime.
Cloud/remote resolved settings are rejected rather than overridden.

This intentionally removes the independent same-browser target identity
guarantee. Because Harness consumes connection settings at daemon startup, an
operator changing them must explicitly stop/restart and reprovision Harness; the
wrapper does not detect a same-named local daemon still using older settings.

## Pi-native text-helper amendment

Issue #11 initially enabled upstream's generic OpenAI-compatible helper through
an explicit API-key/endpoint/model tuple. The user's later approved
simplification supersedes that helper backend and setup.

The only text-helper model is now Pi-native
`openai-codex/gpt-5.6-luna` at high reasoning. The extension uses the current
`ExtensionContext` model registry, so Pi owns model lookup, existing login,
OAuth refresh, and completion without exposing auth material to Python or tool
arguments. This does not select or modify the session's main model or thinking
level. Missing Luna or Pi login remains an optional-capability stop only when
`TYPE_TEXT` is selected; click-only work remains available.

The pinned upstream `field_context()` and `field_text()` prompt construction and
`{text}` value validation remain authoritative. A narrow, revision-pinned
Python transport interception catches only the helper-shaped `post_json` call,
uses nonsecret sentinel values that cannot fall through to HTTP, and relays one
bounded prompt/reply exchange over the bridge's existing stdin/stdout. The
TypeScript side translates upstream's generic low reasoning request to the
fixed high-effort Pi call. There is no second generator, helper backend selector,
server, daemon, credential store, framework, or new runtime dependency.
Standalone Python preflight reports helper capability as unknown because it
cannot assess Pi's login.

## Interrupted-run and retention amendment

This section records the intended contract, not verified guarantees at the
recovered head. The cancelled gate left static findings R23-R26 unresolved:
late helper dispatch, stop-reason precedence, terminal/ownership disagreement
and invalid progress-transition interpretation. In particular, shape validation
alone did not establish the reported lifecycle facts.

The TypeScript parent was designed to retain ownership, observations, decisions,
and executed-action progress while the bridge runs. Cancellation or wall expiry
was intended to request cooperative cleanup, then stop and reap the bridge after
a fixed grace period. If normal bridge cleanup is absent or unconfirmed, the
parent may start the same Python bridge in a bounded cleanup mode. That mode
resolves Harness's native configuration, requires the existing daemon, and
issues one direct close for only the target identifier that the original bridge
reported incrementally. It does not enumerate target differences, bind a second
browser selector, restart Harness, or touch unrelated targets.

A mutation-dispatch progress record was intended to mark uncertainty before
upstream execution, with later execution/observation records or an agreeing
terminal result narrowing it. R26 leaves that transition interpretation
unreliable in the recovered implementation. The intended rules still reject
process exit as proof of rollback and an unchanged helper-call count as general
proof of no input when cached text can be reused. Cleanup and initialization
without an available handle must remain unconfirmed when evidence is missing.

Default runs close the task tab. `retainTab: true` skips task-tab closure only
for a completion claim; the per-run bridge still exits. Cancellation, expiry,
and every failed/stopped result continue to attempt cleanup. Parent-observed
elapsed time includes bounded shutdown and reports wall-budget overrun, while
provider attempts, retries, and costs stay unavailable when upstream does not
expose them.

## Why this changes ADR-0001

ADR-0001 rejected the Python and Browser Harness runtime before the custom
classifier-plus-Chrome-CLI experiment had tested the simpler direction. That
kept the first experiment small and its rationale remains part of the project
history.

The experiment subsequently showed that the custom wrapper was rebuilding
behavior already owned upstream. It also introduced observation clipping,
probability-wire validation, and control-appearance timing problems. The
research comparison did not establish a general speedup, but those wrapper
failures do not establish a general Jev limitation. Maintaining a second
extractor, policy loop, and executor is not the project objective.

The active direction therefore adopts the pinned upstream runtime instead of
copying its policy shape. Browser Harness becomes the sole executor inside this
capability; Chrome DevTools CLI is not a fallback.

## Consequences

- Python 3.12, the upstream Git pin, and Browser Harness are project-local uv
  dependencies with a reproducible lock and explicit setup.
- Extension loading remains inert. Runtime or browser setup never happens as a
  side effect of registration.
- One natively configured named Browser Harness daemon is explicitly
  provisioned, then required to be already running for preflight and tool runs.
  Native local discovery or a loopback HTTP CDP endpoint is supported; resolved
  cloud/remote settings and live cloud daemons fail closed. Runs preserve the
  selected Chrome, daemon, and unrelated tabs.
- The Pi tool remains one deep interface and is sequential only within Pi.
- Upstream remains the sole owner of field context and generated-value
  validation. Pi owns the fixed Luna/high text completion and its existing
  login; the wrapper owns only the bounded bridge relay. No separate helper
  credential or endpoint configuration remains.
- Historical custom-loop evidence remains in PR #8 at `5dafb11` and sibling
  experiment commit `6df4b4b0f8b17420f9c9bc0a8176072312ec6de3`.
- No maintained upstream fork, TypeScript port, custom extractor, site scripts,
  or second active `rlcd_brwsr_run` implementation is introduced.
