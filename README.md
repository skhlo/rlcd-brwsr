# RLCD-brwsr

RLCD-brwsr gives Pi two project-local tools for delegating one bounded browser
task to the pinned Jev Ultrafast Agent:

- `rlcd_brwsr_list_tabs` discovers eligible existing tabs without selecting one.
- `rlcd_brwsr_run` creates a task tab or uses an exact eligible existing tab.

Python constructs and consumes upstream `Agent.run()`. Upstream owns browser
observation, Jev decisions, generated field text, freshness checks, and Browser
Harness input. Pi validates the request, supervises one Python process, and
presents a compact handoff while retaining bounded diagnostics in tool details.
A completion claim always requires independent verification by the outer agent.

This is an experimental capability, not a general browser-reliability or speed
claim. The Python-owned base merged in
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
Preflight can prove that a supported daemon responds; it cannot prove that an
already-running `cdp` daemon uses the newly configured endpoint or profile.

## Load the Pi tools

Start a fresh Pi session with the project extension:

```bash
pi -e ./config/pi/extensions/rlcd-brwsr.ts \
  -t rlcd_brwsr_list_tabs,rlcd_brwsr_run
```

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
rules are in the [current contract](docs/RLCD-BRWSR.md). The architecture choice
is recorded in [ADR-0003](docs/adr/0003-python-owned-run.md). The
[archive index](docs/archive.md) describes historical work and which evidence is
public versus operator-local.

## Local checks

```bash
pnpm fixture # optional loopback fixture on http://127.0.0.1:43113
pnpm check
uv lock --check
git diff --check
```

The deterministic suite substitutes external browser/provider boundaries while
crossing the registered tools, real Python runner, and pinned upstream
Agent/native helper. Live inference or browser acceptance requires separate,
explicit authorization.
