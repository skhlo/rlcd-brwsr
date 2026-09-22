# RLCD-brwsr

**Planning status:** this branch preserves the larger experimental implementation
recovered from a cancelled, not-passed delivery gate. The approved next direction
is a thinner Python-owned wrapper with a native API-key text helper; that rewrite
has **not** been implemented. See the [next plan](docs/RLCD-BRWSR.md) and
[source/probe evidence](docs/thin-python-feasibility.md). Setup and behavior below
describe the recovered Pi-native-helper code, not the proposed replacement.

The recovered RLCD-brwsr extension wraps the pinned Jev Ultrafast Agent. It runs
one bounded browser task in an owned tab through the existing local daemon
selected by Browser Harness's native configuration. A Jev `DONE` response is a
completion claim, not proof; the outer agent must independently verify the page
outcome.

The next design and operating scope are owned by
[the plan](docs/RLCD-BRWSR.md); the recovered implementation's decisions are
preserved in [ADR-0002](docs/adr/0002-wrap-pinned-jev-ultrafast-agent.md). The
earlier custom Chrome DevTools CLI experiment remains historical evidence, not
an active runtime or fallback.

## Project-local setup

The setup is explicit. Loading the extension never installs packages, starts a
daemon, opens Chrome, or requests browser permission.

```bash
pnpm install --frozen-lockfile
scripts/setup-runtime.sh

# Edit Browser Harness's trusted host-local configuration. Its default location
# is ~/.config/browser-harness/agent-workspace/.env:
#   BU_NAME=rlcd-brwsr
#   BU_CDP_URL=http://127.0.0.1:<selected-chrome-port>

export TYPESAFE_API_KEY=... # host-local; never commit it

# Text entry uses Pi's existing OpenAI Codex login. RLCD-brwsr does not
# configure or copy that login.

scripts/provision-browser.sh
scripts/preflight-runtime.sh
```

`uv.lock` fixes Python 3.12, Jev Ultrafast commit
`1231850a0bf1a0c0341fe408ef1668dbbfdfac46`, and Browser Harness 0.1.13. The
runtime configuration fixes the Jev model to `jev-1.13.0`.

Browser Harness is the sole owner of browser connection selection. It loads
`BU_NAME` and its native connection settings from its normal environment and
workspace `.env` resolution; the wrapper has no aliases or second browser
configuration. RLCD-brwsr accepts native local discovery or a loopback HTTP
`BU_CDP_URL` and rejects resolved cloud/remote selectors. Explicit provisioning
may start the natively configured daemon. Preflight and tool runs require that
named daemon to be healthy and already running, and never recover it through
`ensure_daemon()`.

The wrapper deliberately does not compare the configured endpoint with target
sets from an already-running same-named daemon. Browser Harness reads connection
settings when its daemon starts, so stop/restart the daemon with its current
native configuration before changing those settings, then explicitly provision
it again. RLCD-brwsr does not silently reconcile a running daemon after a
configuration change. Preflight never creates or synchronizes `.venv`. If Chrome
asks for remote-debugging permission during explicit provisioning, the operator
must approve it; the script does not automate permission.

Text entry uses only Pi's native `openai-codex/gpt-5.6-luna` model at high
reasoning through the extension context's model registry. Pi owns model lookup,
its existing login, OAuth refresh, and completion. RLCD-brwsr does not read or
copy Pi credentials, change the session's main model or thinking level, or
support a separate API-key/helper endpoint. Standalone Python preflight reports
helper capability as unknown because only a running Pi tool context can assess
it.

A click-only run remains usable when Luna or its Pi login is unavailable. If
upstream selects `TYPE_TEXT` in that state, the run returns `needs_text` before
a helper request or field mutation and retains prior evidence. For an available
helper, the version-pinned bridge intercepts only upstream's helper-shaped
transport call and relays its unchanged system/user prompt over the existing
stdin/stdout channel. Pi returns text and available token usage; upstream still
performs the sole `{text}` JSON-value validation, including the nonempty
2,000-character limit, before browser input.

Results identify the configured Jev model separately from the fixed Pi helper
model and report a provider response model only when Pi supplies one. Available
per-call token usage and latency remain separate. Provider HTTP-attempt, retry,
subscription-spend, and cost totals remain `unavailable`; the wrapper does not
invent them. Failures before a fill's helper result remain conservative upstream
errors because the preceding browser freshness check can fail at the same
boundary.

## Explicit Pi use

Load and enable the project extension for one fresh Pi session:

```bash
pi -e ./config/pi/extensions/rlcd-brwsr.ts \
  -t rlcd_brwsr_run
```

The registered tool accepts an absolute HTTP(S) `url`, a natural-language
`goal`, optional `maxActions` and `maxSeconds`, and optional `retainTab`.
Defaults are 6 executed actions and 30 seconds; maxima are 20 actions and 120
seconds. `retainTab: true` keeps the identified task tab only after a completion
claim; its bridge still exits, while cancelled, expired, stopped, and failed
runs attempt cleanup. Pi schedules the tool sequentially, which is not a global
browser lock.

The recovered parent contains progress retention, cooperative shutdown and
exact-target fallback-cleanup mechanisms. They were intended to preserve useful
partial state without touching shared services. They are **not verified
lifecycle guarantees** at the recovered head: unresolved static findings R23-R26
question late helper dispatch, stop-reason precedence, terminal/ownership
agreement and progress-transition interpretation. Do not treat its reported
partial state or cleanup as proven merely because a record was shape-validated.
The findings are retained in `artifacts/thin-python-plan/gate-review-log.txt`;
this planning task did not reproduce or fix them. Process exit is not rollback.

## Local fixture and checks

```bash
pnpm fixture # loopback only: http://127.0.0.1:43113
pnpm check
```

The loopback fixture serves both the click-only `ORBIT-27` journey and the
`/text-entry.html` generated-value journey with marker `FIELD-41`. Deterministic
acceptance responders under the fixture directories replace external Jev
responses and Pi text completion only; they do not replace the upstream Agent,
its text-helper field context/value validation, Browser Harness, or Chrome.
