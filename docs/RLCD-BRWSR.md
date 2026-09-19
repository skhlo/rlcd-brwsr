# RLCD-brwsr v0.1 plan

Status: approved direction; not implemented.

RLCD-brwsr is a minimal Pi extension that uses TypeSafe Jev as a fast
classifier inside a bounded browser loop. Pi owns the goal, planning,
permissions, text preparation, verification and difficult recovery. The existing
Chrome DevTools CLI owns browser observation and deterministic execution.

The human-facing name is **RLCD-brwsr**. Its source slug will be `rlcd-brwsr`, and
its Pi tool will be `rlcd_brwsr_run` because tool names use lowercase letters and
underscores.

## Interface

```ts
rlcd_brwsr_run({
  goal: string;
  maxSteps?: number;
  maxSeconds?: number;
});
```

The tool acts on the page currently selected by Chrome DevTools CLI. It returns
control to Pi when the goal appears complete, no allowed action can advance it,
the page requires a consequential action, execution becomes uncertain, or a
budget expires.

The result reports:

- completion status and stop reason;
- final URL and bounded page state;
- compact action trace and Jev distributions;
- command errors and timing/model usage;
- deterministic evidence available from the executor; and
- a final screenshot when useful.

A Jev `DONE` choice is supporting evidence. Pi must verify the requested outcome
independently.

## Architecture

```text
Pi calls rlcd_brwsr_run(goal)
  -> chrome-devtools take_snapshot --output-format=json
  -> TypeScript derives the allowed operation and target choices
  -> Jev classifies the next operation and compatible target
  -> TypeScript constructs one fixed chrome-devtools invocation
  -> Chrome DevTools executes and returns the next snapshot
  -> repeat within the step and time budgets
```

RLCD-brwsr is one TypeScript Pi extension. It calls TypeSafe through the HTTP API
with built-in `fetch` and invokes Chrome DevTools with `pi.exec(command, args)`.
It has no Python runtime, TypeSafe SDK dependency, MCP wrapper, skill package,
additional browser backend, or extension-owned daemon.

The Chrome DevTools CLI may use its existing daemon. RLCD-brwsr does not manage a
second process lifecycle or introduce a new service.

## Classifier contract

Each observation becomes a compact state containing the goal, current URL and
title, bounded visible text, recent actions, and an indexed set of allowed
controls from the latest accessibility snapshot.

One TypeSafe request asks speculative questions over that state:

- a Choice over the operations currently available, plus `DONE` and `BLOCKED`;
- a Choice over targets compatible with `CLICK`;
- a Choice over complete `(field, value)` pairs compatible with `TYPE_TEXT`; and
- a Choice over complete `(field, option)` pairs compatible with `SELECT`.

Every target question states the operation it assumes. Questions run
independently; code consumes only the target head matching the selected
operation. The extension validates that every returned choice and probability
belongs to the offered set before constructing a command.

Jev never supplies a selector, coordinate, URL, shell command, or executable
JavaScript. The model selects only code-owned enum values and UIDs observed in
the latest snapshot.

Pin the evaluated model version rather than using a moving alias. The initial
candidate is `jev-1.13.0`; thresholds and uncertainty policy must be measured on
RLCD-brwsr fixtures rather than copied from a cookbook.

## Operations

The initial operation set is deliberately small:

- `CLICK` - observed links, tabs, menu items and low-consequence buttons;
- `TYPE_TEXT` - observed text, search and editable combobox fields;
- `SELECT` - observed options for a native select control;
- `PAGE_UP` and `PAGE_DOWN` - fixed key commands;
- `WAIT` - a bounded delay followed by a new observation;
- `DONE`; and
- `BLOCKED`.

Code maps the selected operation to a fixed command shape:

```text
CLICK      -> chrome-devtools click <uid> --includeSnapshot --output-format=json
TYPE_TEXT  -> chrome-devtools fill <uid> <value> --includeSnapshot --output-format=json
SELECT     -> chrome-devtools fill <uid> <option> --includeSnapshot --output-format=json
PAGE_UP    -> chrome-devtools press_key PageUp --includeSnapshot --output-format=json
PAGE_DOWN  -> chrome-devtools press_key PageDown --includeSnapshot --output-format=json
WAIT       -> bounded sleep, then take_snapshot --output-format=json
```

Use the snapshot included by an action when available. Take a separate snapshot
only when the command cannot return one.

## Text values

RLCD-brwsr does not generate text in v0.1. Pi places exact field values in quotes
inside the goal before calling the tool:

```text
Search for "Jev System One browser execution".
```

The extension extracts quoted strings as a closed candidate set. Jev selects a
complete `(field, value)` pair so independently chosen fields and values cannot
disagree. If no supplied value fits the selected field, the tool stops with
`needs_text` and returns control to Pi.

## Safety and stopping

Page content is untrusted data. Jev 1.13 is not itself a prompt-injection or
permission control, so code removes prohibited operations before Jev receives
its candidates.

V0.1 is limited to loopback fixtures and unauthenticated, non-sensitive public
pages. It does not execute credentials, payments, purchases, bookings, uploads,
downloads, account changes, consent grants, messages, posts, publication,
deletion, installation or other consequential actions. A page that requires one
returns `consequential_action` for Pi to handle through its normal permission and
recovery path.

Stop without another mutation when:

- the selected operation or UID was not offered;
- Jev's response is malformed or falls below the calibrated uncertainty policy;
- the latest snapshot no longer supports the selected UID;
- a command reports an uncertain mutation outcome;
- three non-`WAIT` steps leave the observed state unchanged;
- the step or wall-clock budget expires; or
- Pi cancels the tool.

Never retry a browser mutation whose outcome is uncertain.

## Implementation sequence

1. Add offline tests for snapshot parsing, compatible candidate construction,
   quoted values, Jev response validation, prohibited actions, loop detection
   and result redaction.
2. Implement `config/pi/extensions/rlcd-brwsr.ts` with injected Jev and CLI seams
   so tests use deterministic fakes.
3. Register `rlcd_brwsr_run` with `executionMode: "sequential"` to prevent races
   over the selected browser page.
4. Build a local HTML fixture covering navigation, search, tabs, native selects,
   scrolling, completion, stale UIDs, unchanged-state loops and adversarial page
   instructions.
5. Exercise the fixture through the real Chrome DevTools CLI with a fake Jev
   responder.
6. With explicit approval for paid requests, run Jev against the local fixture,
   then bounded public navigation tasks.
7. Compare one RLCD-brwsr call with Pi's current agent-driven Chrome CLI loop.
8. Only after the experiment passes, add the extension to the builder, rollout
   fixtures and installed baseline.

## Verification and acceptance

Run repository type checking, formatting and tests, plus the Pi integration check
and a host-only browser check. Verify the visible tool call and result in Pi's
actual TUI.

Compare identical tasks and independent outcome assertions across both paths.
Record cold and warm wall time, verified success, main-model turns and tokens,
Jev requests and tokens, browser commands, stale decisions, safety stops, and
retained processes or pages.

V0.1 is acceptable when:

- every deterministic and safety fixture passes;
- no prohibited action executes;
- success, failure, cancellation and timeout leave no RLCD-brwsr-owned process;
- its tested outcomes match the current Pi loop's independently verified
  outcomes; and
- it reduces median wall time or main-model use on the tested tasks.

## References

The policy shape comes from
[`browser-use/jev-ultrafast`](https://github.com/browser-use/jev-ultrafast) at
commit `1231850a0bf1a0c0341fe408ef1668dbbfdfac46`; the current implementation was
last changed at `452c1ad2dd628008f1d5608f28158d76e49e6cc0`. That project demonstrates
dynamic operation and operation-specific target heads, validates model outputs,
never turns model output into executable code, does not retry uncertain browser
mutations, and treats completion as requiring independent verification.
RLCD-brwsr adopts those control-flow lessons, not its Python or Browser Harness
runtime.

The current local executor is
[`ChromeDevTools/chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp)
version `1.7.0`, package Git commit
`774d78f5eef5e610407a0c92fa6ec5ed74b027e8`. Before implementation, record its
pin in the owning repository artifact rather than relying only on the installed
global package.
