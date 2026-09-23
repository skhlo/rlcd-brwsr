# RLCD-brwsr

**Active checkout:** `~/Repositories/rlcd-brwsr/`, branch `feat/jev-ultrafast-pi`.
Old experiments are archived in Git and a verified backup, not mixed into the
current working tree. The sibling checkout is retained only for test resources
and evidence. See the [archive index](docs/archive.md).

**Implementation status:** the thin Python-owned rewrite passes 20 local tests
and four repeated Pi-TUI/real-Chrome checks with synthetic provider replies at
`b3b42036`. A subsequent live Ling helper probe also passed. Then a normal Pi
agent turn completed one local fixture using real Jev and Ling. Public-site acceptance remains
pending; see [verification and limits](docs/thin-python-evidence.md). Current GitHub issues
still describe the superseded implementation and are not claimed as satisfied.
See the
[owning plan](docs/RLCD-BRWSR.md),
[ADR-0003](docs/adr/0003-python-owned-run.md), and the historical
[feasibility evidence](docs/thin-python-feasibility.md).

RLCD-brwsr delegates one bounded browser task to the pinned Jev Ultrafast Agent.
Python constructs the upstream `Agent` and consumes `Agent.run()`; upstream owns
observation, decisions, native field-text generation, and Browser Harness input.
Pi validates the request, supervises one Python process, and returns one bounded
terminal JSON result. A Jev `DONE` response is a completion claim, not proof; the
outer agent must independently verify the visible result.

## Project-local setup

Setup is explicit. Loading the extension only registers `rlcd_brwsr_run`; it does
not install packages, start services, open Chrome, or make model calls.

```bash
pnpm install --frozen-lockfile
scripts/setup-runtime.sh

# In Browser Harness's normal host-local environment/workspace configuration:
#   BU_NAME=rlcd-brwsr
#   BU_CDP_URL=http://127.0.0.1:<selected-chrome-port>

export TYPESAFE_API_KEY=...        # Jev; host-local, never commit
export TEXT_MODEL_API_KEY=...      # OpenRouter; optional for click-only tasks

# These are the only accepted native helper settings. After Browser Harness
# loads its native workspace environment, the child supplies absent values
# process-locally and rejects conflicts:
export TEXT_MODEL_BASE_URL=https://openrouter.ai/api/v1
export TEXT_MODEL=inclusionai/ling-3.0-flash
export TEXT_MODEL_REASONING=none

scripts/provision-browser.sh
scripts/preflight-runtime.sh
```

After changing any native Browser Harness browser selector, endpoint, or profile
setting, stop the existing same-named daemon with Harness's native controls,
then restart it through `scripts/provision-browser.sh` before preflight or tool
use.

`uv.lock` fixes Python 3.12, Jev Ultrafast commit
`1231850a0bf1a0c0341fe408ef1668dbbfdfac46`, and Browser Harness 0.1.13.
`config/runtime.json` fixes Jev to `jev-1.13.0`, the helper tuple above, a
32 KiB serialized-request limit, and a 16 KiB terminal/model-visible JSON limit.
Those two byte budgets have one configuration owner.

Browser Harness remains the only browser-configuration owner. The runner and
preflight first load its native workspace `.env`, then one shared runtime owner
installs missing selected-model defaults and rejects helper-tuple conflicts.
Conflicts stop before daemon checks or browser startup. Explicit provisioning may
start the natively configured daemon. Preflight and tool runs require that named
daemon to be healthy and already running. Runs reject currently resolved cloud,
remote WebSocket, `BU_AUTOSPAWN`, and non-loopback CDP settings; they never
recover or replace the daemon through upstream `ensure_daemon()`.

These checks do not attest that an already-running same-named `cdp` daemon still
uses the current endpoint, profile, or local-vs-remote settings. Browser Harness
consumes those settings when the daemon starts, and its reported `cdp` mode does
not identify the live endpoint. Skipping the required stop/restart/reprovision
step after a settings change can therefore route a run to a stale remote or
otherwise wrong browser.

The helper key is checked only when upstream selects `TYPE_TEXT`, so click-only
tasks work without it. Native missing-key, provider, and value-validation errors
return sanitized available state and never invent replacement text or switch to
Pi's active model.

## Pi tool

Load the project extension in a fresh Pi session:

```bash
pi -e ./config/pi/extensions/rlcd-brwsr.ts -t rlcd_brwsr_run
```

The registered interface is:

```ts
rlcd_brwsr_run({
  url: string;
  goal: string;
  maxSeconds?: number; // default 30, maximum 120
  retainTab?: boolean;
});
```

There is no `maxActions`, alias, or replacement per-call step setting. Upstream's
unchanged limits remain 60 history entries (including waits and scrolls) and 120
decisions. They are not HTTP-attempt or spend caps.

`maxSeconds` is a coarse parent stop deadline measured from before startup. Pi
sends `SIGTERM`, allows a fixed 1.5-second cooperative cleanup grace, then sends
`SIGKILL` only if process exit has not been observed. It does not guarantee that
an action cannot cross the deadline. The process is reported reaped only after
its exit is observed. Pi trusts child execution and cleanup claims only from one
structurally valid terminal envelope followed by an observed zero exit without a
signal. A structurally valid normal completion claim followed by a clean zero
exit wins a late parent stop race when the child did not report a stopped run;
completion still requires independent verification. Interrupted or untrusted
outcomes preserve the parent's first stop. Nonzero, signalled, abrupt,
incomplete, or invalid-terminal exits leave execution and task-tab cleanup
unknown. An exception escaping final projection after request acceptance also
falls back to unknown rather than `invalid_input`. Process exit is not rollback
and the tool does not retry automatically.

`retainTab: true` is honored only after a normal completion claim with the known
task target. Every other handled outcome makes one direct `Target.closeTarget`
request. Closure is `closed` only when its response contains `success: true`.
The shared daemon and unrelated targets are preserved. Scheduling is sequential
inside Pi, not a global browser lock.

Python projects only bounded current page fields, executed-history summaries,
configured models, available upstream-recorded usage, known target, cleanup, and
a sanitized diagnostic. Full snapshots, raw prompts/responses, child stderr, and
invalid terminal fragments are not returned. Complete native key values are
redacted before any clipping, including diagnostics and usage dictionary keys;
invalid Unicode and non-finite numbers are normalized. The result discloses
field/record omissions. If adding supervised process evidence would exceed the
same terminal cap, Pi omits the child projection conservatively while preserving
its first cancellation/deadline reason and observed process reap.

Available usage records are source-labelled but incomplete: failed calls,
attempts, retries, and charges can be absent. The tool deliberately returns no
Pi top-level `usage`, so Pi footer and session totals exclude these native calls.

## Local checks

```bash
pnpm fixture # loopback fixture: http://127.0.0.1:43113
pnpm check
uv lock --check
git diff --check
```

The automated suite crosses the registered Pi tool -> real Python runner -> real
pinned `Agent.run()`/native helper seam. It substitutes only external Browser
Harness CDP and provider responses. Separate real-Chrome/TUI command checks cover
click, text retention, timeout and cancellation. The later bounded live check
covers one helper payload and one local fixture through Pi's normal agent turn.
These checks do not establish general model quality, public-site reliability or
complete billing.
