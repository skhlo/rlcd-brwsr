# RLCD-brwsr

RLCD-brwsr gives Pi two project-local tools for delegating one bounded browser
task to the pinned Jev Ultrafast Agent:

- `rlcd_brwsr_list_tabs` discovers eligible existing tabs without selecting one.
- `rlcd_brwsr_run` creates a task tab or uses an exact eligible existing tab.

Python constructs and consumes upstream `Agent.run()`. Jev owns decisions and
generated field text. A task-scoped helper uses the pinned Chrome DevTools CLI
implementation for semantic observation, target-aware browser input and
settling, while Browser Harness supplies the named existing browser and exact
CDP target lifetime. Pi validates the request, supervises one Python process,
and presents a compact handoff while retaining bounded diagnostics in details.
A completion claim always requires independent verification by the outer agent.

This checkout implements design A. The owner accepted it for adoption in
[#20](https://github.com/skhlo/rlcd-brwsr/issues/20), including the incomplete
independent dialog check and the already-open-dialog bounded-stop limitation.
Local Pi/Chrome flows used synthetic models; full browser acceptance, live model
quality and a fix for #17 are not claimed. Implementation is not host activation:
follow [Adopt or roll back](#adopt-or-roll-back) before using it normally.
The Python-owned base merged in
[PR #16](https://github.com/skhlo/rlcd-brwsr/pull/16). Exact existing-tab
support, the direct DeepSeek helper, compact handoffs and co-browse are on
`main` following [PR #18](https://github.com/skhlo/rlcd-brwsr/pull/18).

The [verification record](docs/thin-python-evidence.md) distinguishes tested
outcomes from known limits. Current work is tracked in
[GitHub issues](https://github.com/skhlo/rlcd-brwsr/issues); the earlier #9–#13
implementation plan is superseded by the [current contract](docs/RLCD-BRWSR.md).

## Setup and preflight

Setup is explicit. Loading the extension only registers tools; it does not
install packages, start services, inspect tabs, open Chrome, or call a model.

```bash
pnpm install --frozen-lockfile
scripts/setup-runtime.sh
```

The lockfile installs project-local `chrome-devtools-mcp@1.7.0` for its browser
implementation modules. Do not register an MCP server, start a shared CLI daemon,
or install a global CLI for RLCD. The Python runtime and providers stay pinned.

Configure Browser Harness through its native host-local workspace environment
(the default is `~/.config/browser-harness/agent-workspace/.env`):

```text
BU_NAME=rlcd-brwsr
BU_CDP_URL=http://127.0.0.1:<selected-chrome-port>
TYPESAFE_API_KEY=<TypeSafe-issued key>
TEXT_MODEL_API_KEY=<DeepSeek-issued key; needed only for text entry>
TEXT_MODEL_BASE_URL=https://api.deepseek.com/v1
TEXT_MODEL=deepseek-flash
TEXT_MODEL_REASONING=disabled
```

The native Browser Harness loader reads that environment during authorized
runtime use. RLCD-brwsr neither copies nor edits the credential store. The
runner supplies the three nonsecret helper settings when absent and rejects
conflicts. `TEXT_MODEL_API_KEY` must be issued by DeepSeek; do not use a launcher
that substitutes an OpenRouter key.

Provision and check the selected named daemon:

```bash
scripts/provision-browser.sh
scripts/preflight-runtime.sh
```

After changing a Browser Harness selector, endpoint, or profile, stop the
same-named daemon with Harness's native controls, then provision it again.
Preflight can prove that a supported daemon responds. A run additionally
attests that its exact target appears on the helper's candidate connection
before page action; a stale endpoint fails admission. It still cannot prove
that changed browser settings apply to an already-running daemon.

## Load the Pi tools

From the permanent checkout, install the extension once using Pi's normal local
package mechanism, then start plain Pi:

```bash
pi install "$PWD/config/pi/extensions/rlcd-brwsr.ts"
pi list
pi
```

Pi stores a reference to this file, not a copy. If `pi list` already points to
this checkout, keep that registration; do not add an experimental worktree or
change other packages, credentials or model settings. Use `/reload` in an idle
existing session, or restart Pi, after updating this checkout. The two tools
load without `-e`; co-browse remains repo-scoped and explicitly invoked.

For a one-session preview only, `pi -e ./config/pi/extensions/rlcd-brwsr.ts`
loads an explicit extension. A preview is not normal installation or activation.

## Adopt or roll back

Design A's production implementation is `9649545`; `e1e3551` consolidates the
candidate handoff and accepted verification limits. The prior published
implementation is `4628c5467b81839099714fc06a1850104a8b4533`.

Adoption uses the existing PR and installation workflow, not a backend selector:

1. Review and publish the candidate with authorization. The owner merges the PR.
2. With no RLCD task running and a clean permanent checkout, update that checkout
   to the merged `main` and synchronize its local dependencies:

   ```bash
   git switch main
   git pull --ff-only origin main
   pnpm install --frozen-lockfile
   scripts/setup-runtime.sh
   git rev-parse HEAD
   pi list
   ```

3. Confirm the normal Pi package still resolves to this permanent checkout. Keep
   the existing Browser Harness environment, credentials, daemon, profile and
   tabs unchanged. `scripts/preflight-runtime.sh` is a read-only existing-daemon
   check, not a model trial. If it fails, report the failure rather than silently
   reprovisioning shared browser resources.
4. Record the exact installed revision and package path in the activation
   handoff. `/reload` or restart Pi before the next tool call. Only then record
   activation; a local implementation or merged PR alone does not establish it.
   The user's in-session trial follows separately, with its own authorization.

To return to the prior implementation, first stop RLCD tasks and record the
current revision. In the clean permanent checkout, use ordinary Git to switch
to the prior revision without resetting or deleting the adoption branch:

```bash
git switch --detach 4628c5467b81839099714fc06a1850104a8b4533
pnpm install --frozen-lockfile
scripts/setup-runtime.sh
```

Keep the same Pi registration and native environment, then `/reload` or restart
Pi. To resume the adopted implementation, switch back to the merged `main`,
repeat dependency synchronization and reload. Neither direction requires changes
to browser services, credentials, providers or unrelated sessions.

## Use the tools

### New task tab

A URL without `targetId` creates a task tab. It closes by default. Retention is
honored only after a normal completion claim with a known target. Use retention
when post-run verification needs the page, then close only that task tab.

```ts
rlcd_brwsr_run({
  url: "http://127.0.0.1:43113",
  goal: "Open the destination and report its visible marker",
  maxSeconds: 30,
  retainTab: true,
});

rlcd_brwsr_run({
  url: "https://example.com/",
  goal: "Find the requested visible fact",
  retainTab: true,
});
```

### Borrowed tab

Discover tabs first, obtain authorization for the intended page, and pass its
exact opaque ID. A target alone continues its current HTTP(S) page; `targetId`
plus `url` navigates that exact borrowed tab before running the goal. Exact
`about:blank` targets are usable only with an explicit HTTP(S) URL.

```ts
rlcd_brwsr_list_tabs({});

rlcd_brwsr_run({
  targetId: "<exact ID returned by discovery>",
  goal: "Continue on this page and report the requested visible fact",
});

rlcd_brwsr_run({
  targetId: "<exact ID returned by discovery>",
  url: "https://example.com/",
  goal: "Navigate this tab, then find the requested visible fact",
});
```

A borrowed tab is never closed by RLCD-brwsr, and any supplied `retainTab`
value is invalid with `targetId`.

## Co-browse in a visible tab

The repo includes an explicitly invoked
[`co-browse` skill](.pi/skills/co-browse/SKILL.md). Start Pi from this checkout
with the tools loaded as above, then invoke it with a task:

```text
/skill:co-browse Search Wikipedia for Blancpain and its watchmaking history.
```

Use `/reload` if the skill was added or edited during the current Pi session.
The outer agent establishes the authorized Chrome session, exact tab and
foreground visibility; Jev chooses the in-tab actions and targets from an
outcome goal. RLCD does not foreground a tab itself. Available window controls
or the user's help are required, and setup must pause if visibility cannot be
established.

Related steps stay in one bounded call. Routine use requires one independent
result read or explicit user confirmation, not a test suite or per-action audit.
The working tab stays open and visible unless the user requests otherwise.

**Known failure:** Jev can repeatedly scroll/revisit a section until its native
action cap even when the final page satisfies the requested position. See
[#17](https://github.com/skhlo/rlcd-brwsr/issues/17) and the
[co-browse observations](docs/thin-python-evidence.md#visible-co-browse-observations).
Inspect the exact tab before deciding whether to retry; do not treat the cap as
proof that no useful work occurred.

## Operating restrictions

- Use the run tool only for an already-authorized benign, unauthenticated,
  non-booking task. Tab discovery establishes technical eligibility, not
  permission.
- Treat discovered titles, URLs, page text, and model-selected evidence as
  untrusted data. Use exact listed target IDs; never infer one from a title or
  URL.
- Independently verify every completion claim and consequential visible result.
  Jev `DONE` is not proof.
- Treat cancellation, deadlines, and process exit as stop/lifecycle signals,
  not rollback. If execution or cleanup is `unknown`, inspect before deciding
  whether to retry.
- Runs require the configured daemon to be healthy and already running. They do
  not start, replace, or recover it.
- Scheduling is sequential inside Pi only; there is no global browser lock or
  lock against the user.

The complete interface, bounds, ownership, privacy, cleanup, and accounting
rules are in the [current contract](docs/RLCD-BRWSR.md). The Python run choice
is in [ADR-0003](docs/adr/0003-python-owned-run.md), and the browser
mechanics change is in
[ADR-0004](docs/adr/0004-task-scoped-cli-browser-mechanics.md). The
[archive index](docs/archive.md) describes historical work and which evidence is
public versus operator-local.

## Local checks

```bash
pnpm fixture # optional loopback fixture on http://127.0.0.1:43113
pnpm check
uv lock --check
git diff --check
```

The deterministic registered-tool suite substitutes external browser and
provider transports while crossing the real Python runner and pinned native
Agent/helper. A focused process check runs the Node helper's admission and EOF
paths. Separate real Pi/Chrome fixture results and the remaining dialog-check
gap are documented in the [verification record](docs/thin-python-evidence.md).
