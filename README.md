# RLCD-brwsr

RLCD-brwsr is a thin Pi extension over the pinned Jev Ultrafast Agent. It runs
one bounded browser task in an owned tab through an explicitly selected local
Browser Harness daemon. A Jev `DONE` response is a completion claim, not proof;
the outer agent must independently verify the page outcome.

The active design and safety envelope are in
[the v0.1 plan](docs/RLCD-BRWSR.md). The earlier custom Chrome DevTools CLI
experiment remains historical evidence, not an active runtime or fallback.

## Project-local setup

The setup is explicit. Loading the extension never installs packages, starts a
daemon, opens Chrome, or requests browser permission.

```bash
pnpm install --frozen-lockfile
scripts/setup-runtime.sh
export RLCD_BRWSR_DAEMON=rlcd-brwsr
export TYPESAFE_API_KEY=... # host-local; never commit it
scripts/provision-browser.sh
scripts/preflight-runtime.sh
```

`uv.lock` fixes Python 3.12, Jev Ultrafast commit
`1231850a0bf1a0c0341fe408ef1668dbbfdfac46`, and Browser Harness 0.1.13. The
bridge fixes the Jev model to `jev-1.13.0`. `scripts/provision-browser.sh`
provisions only the named `rlcd-brwsr` daemon against the currently selected
local Chrome. If Chrome asks for remote-debugging permission, the operator must
approve it; the script does not automate permission.

`TEXT_MODEL_API_KEY` and its OpenAI-compatible helper settings are optional for
click-only work. If upstream chooses `TYPE_TEXT` without that configuration, the
tool stops before a helper request or field mutation.

## Explicit Pi use

Load and enable the project extension for one fresh Pi session:

```bash
RLCD_BRWSR_DAEMON=rlcd-brwsr pi \
  -e ./config/pi/extensions/rlcd-brwsr.ts \
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
