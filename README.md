# RLCD-brwsr

RLCD-brwsr is a thin Pi extension over the pinned Jev Ultrafast Agent. It runs
one bounded browser task in an owned tab through the existing local daemon
selected by Browser Harness's native configuration. A Jev `DONE` response is a
completion claim, not proof; the outer agent must independently verify the page
outcome.

The active design and safety envelope are in
[the v0.1 plan](docs/RLCD-BRWSR.md). The earlier custom Chrome DevTools CLI
experiment remains historical evidence, not an active runtime or fallback.

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

`TEXT_MODEL_API_KEY` and its OpenAI-compatible helper settings are optional for
click-only work. If upstream chooses `TYPE_TEXT` without that configuration, the
tool stops before a helper request or field mutation.

## Explicit Pi use

Load and enable the project extension for one fresh Pi session:

```bash
pi -e ./config/pi/extensions/rlcd-brwsr.ts \
  -t rlcd_brwsr_run
```

The registered tool accepts an absolute HTTP(S) `url`, a natural-language
`goal`, and optional `maxActions` and `maxSeconds`. Defaults are 6 executed
actions and 30 seconds; maxima are 20 actions and 120 seconds. Pi schedules the
tool sequentially, which is not a global browser lock.

## Local fixture and checks

```bash
pnpm fixture # loopback only: http://127.0.0.1:43113
pnpm check
```

The fixture is benign and click-only. Its destination contains the marker
`ORBIT-27`. The deterministic acceptance responder under
`fixtures/click-only/deterministic-model/` replaces only paid model HTTP
responses; it does not replace the upstream Agent, Browser Harness, or Chrome.
