# RLCD-brwsr v0.1 plan

Status: approved direction; upstream-backed click and generated-field slices in issues #10 and #11.

RLCD-brwsr is a thin Pi extension over the pinned Jev Ultrafast `Agent`. The
outer agent supplies a starting URL, a natural-language goal, and finite
execution budgets. Jev Ultrafast owns browser observation, indexed action
candidates, action selection, text-helper handoff, stale-state checks, and
execution through Browser Harness. RLCD-brwsr owns the Pi-facing contract,
process bounds, progress capture, normalized result, Pi-native text completion,
and run-owned cleanup.

This optimizes browser work that Pi has already authorized. It is not a new
authorization system, a global browser lock, or proof that model-selected page
controls are harmless.

The human-facing name is **RLCD-brwsr**. Its source slug is `rlcd-brwsr`, and its
single Pi tool is `rlcd_brwsr_run`.

## Interface

The first slice accepts:

```ts
rlcd_brwsr_run({
  url: string;
  goal: string;
  maxActions?: number;
  maxSeconds?: number;
  retainTab?: boolean;
});
```

Inputs are validated before a bridge, browser, or model is used. The defaults
are 6 executed actions and 30 seconds; the maxima are 20 actions and 120
seconds. Pi schedules this tool sequentially, which does not prevent another
browser client from changing the page. `retainTab` defaults to false and applies
only to a completion claim; stopped, failed, expired, and cancelled runs still
attempt cleanup.

The result is one of a completion claim, an explicit stop, or a structured
error. It includes:

- the stop reason and whether Jev claimed completion;
- the last successfully observed URL, title, and bounded page evidence;
- a compact executed-action trace and available Jev/text-helper decisions;
- available timing and usage measurements, including bounded cleanup overrun,
  with unavailable measurements named;
- bounded, redacted diagnostics with explicit truncation; and
- task-tab retention/cleanup and bridge cleanup status.

A Jev `DONE` choice is supporting evidence. The outer agent verifies the
requested outcome independently.

## Architecture

```text
Pi calls rlcd_brwsr_run(url, goal, budgets)
  -> TypeScript validates input and project-local runtime availability
  -> TypeScript resolves fixed Luna availability through Pi's model registry
  -> TypeScript starts one project-local Python bridge with fixed argv
  -> bridge requires the configured existing Browser Harness daemon
  -> bridge constructs the pinned upstream Agent
  -> upstream observes, predicts, and executes through Browser Harness
  -> TYPE_TEXT relays the unchanged upstream helper prompt to Pi over the bridge
  -> bridge emits bounded JSONL ownership, progress, and terminal records
  -> TypeScript enforces the wall deadline/cancellation and normalizes output
  -> bridge closes its run-owned tab unless a completion-only retention request applies
  -> shared daemon and unrelated tabs remain
```

There is one active tool implementation. The extension has no DOM extractor,
action policy, site scripts, TypeScript port of Jev Ultrafast, Chrome DevTools
CLI fallback, MCP wrapper, or maintained upstream fork.

The Python dependency is pinned to
`browser-use/jev-ultrafast@1231850a0bf1a0c0341fe408ef1668dbbfdfac46`.
That manifest pins Browser Harness `0.1.13` and requires Python 3.12. The project
uses uv for its Python environment and lock. The evaluated Jev model is pinned
as `jev-1.13.0`, not a moving alias.

The integration deliberately uses upstream's revision-pinned
prediction/action/state seam so the wrapper can enforce a smaller action budget
and emit progress after each observation or execution. Observation, candidate
construction, selection, stale checks, helper prompt/value validation, and
execution remain upstream code; Pi owns the helper completion itself.
Compatibility tests are required before any upstream pin update.

## Browser setup and ownership

Extension loading is inert apart from registering the tool. It does not install
software, start a bridge or daemon, navigate Chrome, request browser permission,
or call a model.

Browser Harness is the single authoritative owner of browser connection
configuration. It resolves `BU_NAME` and its native connection settings itself,
including its normal workspace `.env` loading. The wrapper has no browser
aliases, dotenv parser, selector precedence, endpoint mirror, or target-set
binding comparison. RLCD-brwsr applies only its local safety envelope after
Harness resolution: native local discovery and a loopback HTTP `BU_CDP_URL` are
supported, while resolved `BU_BROWSER_ID`, `BU_CDP_WS`, `BU_AUTOSPAWN`, a
non-loopback CDP URL, or a live cloud daemon are rejected rather than silently
overridden.

`scripts/setup-runtime.sh` runs the frozen uv sync.
`scripts/provision-browser.sh` is the separately requested setup action that may
call Browser Harness's native `ensure_daemon()` after the resolved configuration
passes local validation. `scripts/preflight-runtime.sh` checks pins,
configuration, the version-pinned integration seam, and the configured existing
named daemon without starting or repairing one. At run time the bridge requires
that existing daemon and directly substitutes Browser Harness's native
`require_existing_daemon()` for the upstream Agent's automatic startup hook. A
run never invokes daemon recovery, selects another browser, starts Chrome, or
automates a permission flow. Preflight invokes only the existing
`.venv/bin/python`; it never creates or synchronizes the environment.

Browser Harness consumes connection settings when its daemon starts. The
wrapper does not independently detect or reconcile a same-named local daemon
left running after those settings change. The operator must stop/restart Harness
using the old native configuration, update that configuration, and explicitly
provision again. This intentionally replaces the earlier stronger wrapper
contract that independently compared an `RLCD_BRWSR_CDP_URL` endpoint with live
daemon target identifiers.

Each upstream `Agent` creates one task tab and reports its target identifier as
soon as available. A normal run closes that tab and reaps its bridge. An explicit
completion-only retention request can instead leave that identified tab open
after the bridge exits. The shared Harness daemon, selected Chrome process, and
unrelated tabs are not run-owned and remain. Concurrent clients are still an
operating limitation.

## Model responsibilities

Jev chooses only from upstream's observed, code-owned action candidates.
Upstream validates the selected operation and operation-specific target before
execution. Model output never becomes a selector, coordinate, URL, shell
command, or executable JavaScript.

The only text helper is Pi-native `openai-codex/gpt-5.6-luna` at high
reasoning. The TypeScript extension resolves that exact model from the current
tool context and calls `ctx.modelRegistry.complete()`. Pi owns its existing
login, OAuth refresh, provider transport, and completion. RLCD-brwsr neither
reads/copies OAuth material nor changes the session's main model or thinking
level. There is no helper endpoint, API-key setup, backend selector, daemon,
credential store, or fallback model in this project.

The helper remains optional for click-only work. Before bridge readiness, and in
standalone Python preflight, helper capability/model are `unknown`. During a
tool run the bridge receives only Pi's available/unavailable judgment. If
upstream first selects `TYPE_TEXT` while the model or Pi login is unavailable,
the run stops before a helper request or field mutation and returns `needs_text`
with prior progress.

At the pinned upstream seam, Python installs a narrow transport interception for
only the API-key-shaped call made by `field_text()`. Internal nonsecret sentinel
values satisfy that fixed upstream interface and cannot reach HTTP. The bridge
relays the exact upstream system and user prompt over its existing stdin/stdout;
TypeScript translates upstream's generic low-effort request to the one approved
high-effort Luna call. The response and available token usage return over the
same single-inflight exchange. Upstream remains the sole owner of
`field_context()`, prompt construction, and validation that the response is
exactly `{text}` with a nonempty string of at most 2,000 characters.

## First vertical slice

Issue #10 proves one benign click-only journey on a loopback fixture through the
registered Pi tool, real TypeScript extension, real Python bridge, and pinned
upstream `Agent`. External browser/model interactions may be deterministic in
offline tests and acceptance, and must be labeled as such.

The slice provides:

- uv-managed Python 3.12 setup and a reproducible lock;
- exact existing-daemon preflight and actionable setup errors;
- bounded JSONL readiness/ownership, progress, and terminal records;
- basic action and elapsed-time bounds plus Pi cancellation;
- bounded evidence, trace, diagnostics, and measurement disclosure;
- normal task-tab and bridge cleanup; and
- a missing-text-helper capability handoff.

Issue #11 added the text-entry journey through the same tool. The later
Pi-native ownership revision keeps its upstream field-context construction,
generated-value validation, and browser fill while replacing the separate
OpenAI-compatible helper configuration with fixed Luna/high completion through
Pi. The wrapper adds only capability handoff, a bounded single-inflight relay,
bounded failure classification, and normalized helper evidence. It does not add
prepared values, a second generator, page cleanup, or site planning.

Issue #12 extends the same registered-tool/real-bridge seam with in-flight
interruption, abnormal-exit cleanup, and completion-only retained tabs. It does
not add a tab manager or permit an unbounded runner.

## Operating scope

The outer agent decides which authorized work to delegate. Initial use is
limited to benign, unauthenticated, non-booking tasks. Credentials, payments,
purchases, bookings, uploads, downloads, account changes, consent grants,
messages, posts, publication, deletion, and installation remain with the outer
agent.

Page content is untrusted data. The unchanged upstream policy has no distinct
consequential-action permission outcome, so this wrapper does not promise to
recognize every consequential control. `BLOCKED`, stale state, missing
capability, uncertainty, or setup failure returns control to the outer agent.
The wrapper does not add a second permission classifier or site policy.

## Bounds and stopping

The wall budget includes bridge startup, initial observation, model/helper
calls, waits, and browser work. The action budget counts executed browser
mutations; predictions and waits are reported separately. The wrapper stops
dispatching new work after cancellation or expiry and preserves upstream's
stricter limits.

The first slice stops for:

- a Jev `DONE` completion claim or upstream `BLOCKED` state;
- unavailable Luna model or Pi login when text entry is selected;
- the configured action or wall-clock budget;
- Pi cancellation;
- stale/invalid upstream state, provider failure, or uncertain execution; or
- bridge/protocol/setup failure.

A dispatched mutation may remain uncertain after cancellation or process exit.
Stopping the bridge is not rollback, and the wrapper does not retry it. A fill
failure before a recorded helper result can also originate in the preceding
browser freshness check, so the wrapper reports a conservative upstream error
rather than inventing a helper-specific origin; it still reports whether a
mutation could have started. In particular, an unchanged helper-call count does
not prove safety when upstream can reuse a cached generated value after a stale
retry. Partial observations and executed-action records remain useful. Cleanup
is reported as confirmed or unconfirmed rather than inferred.

## Protocol and result bounds

The extension starts a fixed project-local Python executable with a fixed bridge
path. It sends one structured run request on stdin, followed only by correlated
text-helper replies when requested. URL, goal, page text, and model output are
data and never enter a shell command.

Standard output is protocol-only JSON Lines:

1. one readiness record, including Pi-helper availability;
2. ownership as soon as a task target exists;
3. bounded progress after observations, predictions, mutation dispatch, and
   executions;
4. at most one in-flight text-helper request, correlated with one bounded reply
   on stdin; and
5. exactly one terminal result on a normal bridge path.

The parent keeps task-run stdin open only for that sequential helper exchange;
targeted standalone cleanup retains its one-line-plus-EOF contract.
Cancellation, wall expiry, protocol failure, and child EOF abort a waiting Pi
completion and prevent a late reply from being written into a closed or later
exchange.

Diagnostics use standard error. The parent bounds ordinary protocol lines to
32,000 characters and the unchanged upstream text-helper request to 384,000
characters, with the same serialized bounds enforced by the bridge. It streams
validated progress without retaining an unbounded record list or imposing a
competing record-count stop. Model-visible results are
bounded to 12,000 characters, last-observation evidence to 4,000 characters,
and terminal trace/decision lists to 24 entries. After native Harness
configuration resolution, the child redacts its known credentials from every
protocol record and diagnostic stream before emission. The parent separately
retains its defense for values it knows. Redaction therefore covers retained
errors, progress, tool content, and details without serializing child-only
secrets to the parent. Measurements name the configured Jev model and fixed Pi
helper separately from provider-reported identities. Helper latency, response
model, and available Pi token usage are captured for every resolved response,
including incomplete or late responses observed during shutdown. Combined Pi
helper usage is also returned as the tool result's top-level nested-call usage;
Python-echoed usage is not counted again. A thrown completion with no response
usage does not invent any. Raw Pi SDK error messages, bodies, and stacks never
enter the bridge or tool result; non-stop responses and thrown failures use
fixed failure text. Provider attempt, retry, subscription-spend, and cost counts
that are not exposed remain `unavailable`, not zero. Cleanup elapsed time remains unavailable
when an abnormal exit prevents measuring the whole interval; total elapsed time
and any overrun beyond the wall budget remain parent-observed. The Jev model
identifier has one executable owner in `config/runtime.json`, which the
extension, bridge, and preflight consume.

## Verification

The agreed TDD seam is the registered Pi tool. Tests load the real extension and
run the real bridge. They substitute only external upstream/browser/model
interactions and assert public outcomes rather than private parsing helpers or
incidental call order.

The first slice covers inert loading, invalid input, explicit preflight,
click-only completion, basic action/time/cancellation bounds, missing text-helper
handoff, bounded/redacted failure output, and owned-resource cleanup. The
Pi-native text slice covers a complete request/reply round trip through the
registered tool and real bridge; exact upstream prompt/value validation;
missing model/login; malformed, empty, extra-key, overlong, and oversized
responses; provider failures; cancellation/deadline while waiting; late reply
suppression; click-only no-call behavior; separate model/usage reporting; and
synthetic Jev-secret redaction through raw child, parent, and retained surfaces.
Focused regressions cross the executable setup, executable preflight, and
registered-tool seams while letting real Browser Harness import-time workspace
`.env` loading resolve synthetic local and conflicting cloud settings. Cheap
guards are proven red before implementation. Issue #12 adds interruption
at observation/model/dispatched-input phases, missing-terminal partial evidence,
failed initialization before ownership, malformed/truncated/oversized output,
abnormal exit, confirmed and unconfirmed targeted cleanup, default closure, and
completion-only retention. Fallback cleanup starts the same bridge executable in
a bounded cleanup mode, resolves Harness's native configuration again, requires
the existing daemon, and sends one direct close for only the incrementally
reported target identifier. It never lists or reconciles a target set.

Acceptance also uses a fresh actual Pi TUI controlled through Paseo CLI, the
named Browser Harness daemon, the loopback fixture, and honestly labelled
deterministic responders. Those responders replace external Jev and Pi helper
completion only; the pinned Agent, DOM observation, upstream helper
context/value validation, Browser Harness, and Chrome remain real. A separate browser observation verifies the
click destination or inspects the text field and `FIELD-41` marker on the owned
target while the text run is still open; `DONE` alone does not pass. Resource
census records tabs, processes, the named shared daemon, and any run-owned bridge
before and after.

Repository formatting, type checks, focused tests, full tests, and upstream
bridge compatibility checks run before a local candidate commit.

## Superseded direction and retained evidence

ADR-0001 and the original version of this plan chose a custom TypeScript loop
over Chrome DevTools CLI because adopting Python and Browser Harness before
that experiment would have added an untested runtime and provisioning path.
That rationale was appropriate for the experiment. The experiment then showed
that the wrapper was rebuilding upstream ownership and introduced restrictive
observation limits, probability-wire validation failures, and timing/visibility
problems. Its broader research trial did not establish an end-to-end speedup.
Those results do not establish a general limitation of Jev.

Issue #9 and ADR-0002 supersede the runtime decision: the pinned upstream Agent
is now the implementation, and Browser Harness is its only browser execution
path. The issue #10 implementation initially added wrapper-specific
`RLCD_BRWSR_DAEMON`/`RLCD_BRWSR_CDP_URL` settings and a live target-identity
binding check. A later user-approved simplification supersedes that connection
contract: Browser Harness now owns native resolution, while the wrapper retains
only local-mode validation and existing-daemon-only runtime behavior. A further
user-approved simplification supersedes issue #11's separate API-key helper:
Pi now solely owns fixed Luna/high model lookup, login, refresh, and completion;
the Python side retains only the pinned upstream prompt/validation seam and a
bounded relay. Historical custom-loop code, tests, reports, and raw observations remain
in open PR #8 at `5dafb11` and in the sibling experiment history through
`6df4b4b0f8b17420f9c9bc0a8176072312ec6de3`. They are references, not a branch
to merge and not results from this wrapper.

## References

- Parent implementation spec: GitHub issue #9.
- First vertical slice: GitHub issue #10.
- Architecture revision: `docs/adr/0002-wrap-pinned-jev-ultrafast-agent.md`.
- Prior decision: `docs/adr/0001-classifier-over-existing-browser-executor.md`.
- Jev Ultrafast pin: `1231850a0bf1a0c0341fe408ef1668dbbfdfac46`.
- Browser Harness pin: `0.1.13` (owned by the upstream manifest and uv lock).
- Initial Jev model pin: `jev-1.13.0`.
- Issue #10 verification summary: `docs/issue-10-evidence.md`.
- Generated field-value slice: GitHub issue #11.
- Issue #11 verification summary: `docs/issue-11-evidence.md`.
- Interrupted-run and retention slice: GitHub issue #12.
- Issue #12 verification summary: `docs/issue-12-evidence.md`.
