# RLCD-brwsr v0.1 plan

Status: experimental operations and Jev HTTP inference are implemented; the initial research comparison is [NO-GO for rollout](../experiments/research-fast-loop/RESEARCH-COMPARISON.md). Public documentation exceeded the classifier-state limit before inference. Measurement and acceptance limitations are retained in the report.

RLCD-brwsr is a minimal Pi extension that uses TypeSafe Jev as a fast
classifier inside a bounded browser loop. Pi owns the goal, planning,
permissions, text preparation, verification and difficult recovery. The existing
Chrome DevTools CLI owns browser observation and deterministic execution.

This optimizes browser work Pi already performs. It is not a new authorization
system or a claim that browser actions are safer when selected by Jev.

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
a consequential step is recognized, execution becomes uncertain, or a budget
expires.

The result reports:

- completion status and stop reason;
- final URL and bounded page state;
- bounded source excerpts with URLs and titles from multiple observed pages;
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
  -> TypeScript retains bounded source evidence from the observation
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
title, bounded accessibility text, recent actions, a compact inventory of
retained sources, and an indexed set of allowed controls from the latest
accessibility snapshot. The source inventory records observed evidence, not
inferred research completeness.

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

## First research workload

The first end-to-end task is:

> Research how to use TypeSafe for RLCD-brwsr. Cover question design,
> speculative fan-out, response validation, uncertainty, and model limitations.
> Cite the relevant docs.

Pi sets the research question and supplies any exact text values. One fast-loop
call may navigate several documentation pages and gather source material before
returning. Pi then synthesizes the findings and checks the citations. Jev does
not write the research brief or independently verify its completeness.

The primary baseline is Pi's normal research approach, including TypeSafe's
[`llms.txt`](https://docs.typesafe.ai/llms.txt) and directly fetched Markdown
pages. Do not force the baseline through browser clicks. A separate comparison
against Pi's Chrome CLI loop can isolate browser acceleration, but cannot alone
establish that RLCD-brwsr makes this research task faster overall.

### Source evidence

Retain source material as pages are observed, rather than returning only the
last page. Each evidence record carries an observed source URL, title when
available, and copied accessibility text. Do not attribute text to a guessed
URL or replace it with a model-generated summary.

Code bounds the number of records and both per-record and total text size,
deduplicates unchanged captures, and reports truncation or omitted material.
Budget stops and failures return evidence already collected. Exhausting the
total record or text budget returns control to Pi instead of silently discarding
earlier sources to continue browsing. An individual excerpt may be truncated
without ending the run. Pi may fetch sources again to verify or complete the
brief; those follow-up requests count toward the end-to-end benchmark.

The experimental slice separately caps classifier-request state at 8,000
characters and final model-visible tool content at 12,000 characters. The tool
content preserves the stop reason, verification requirement and bounded source
evidence, but omits trace probability distributions and discloses omissions.
The bounded structured `details` retain those distributions for inspection; the
content limit must not be described as a limit on classifier state or vice
versa.

Chrome CLI 1.7.0 JSON snapshots contain a structured `snapshot` tree. Node `id`
values are the action UIDs; the root normally carries the document name and
URL. Accessibility text is not necessarily viewport-visible, complete page
source, or a verbatim rendering of the DOM. The CLI does not accumulate evidence
across navigations or bound snapshot size; RLCD-brwsr owns those result bounds.

## Operating scope and stopping

Pi decides which authorized work to delegate. The fast loop does not expand
that authorization or replace Pi's permission and recovery path. V0.1 experiments
use loopback fixtures and unauthenticated, non-sensitive public documentation.
Tasks involving credentials, payments, purchases, bookings, uploads, downloads,
account changes, consent grants, messages, posts, publication, deletion or
installation remain with Pi.

Page content is untrusted data. Neither Jev, an observed UID, nor a harmless
control label proves an action's effects. The v0.1 mapping records named links,
buttons and tabs whose labels contain a case-insensitive whole-word match for
`buy`, `checkout`, `donate`, `pay`, `purchase`, `book`, `reserve`, `upload`,
`download`, `install`, `delete`, `remove`, `publish`, `post`, `send`, `submit`,
`sign in`, `log in`, `consent`, `authorize` or `grant` as excluded candidates.
It returns `consequential_action` before classification
only when the current observation has at least one such excluded candidate and
no offered low-consequence click candidate. A documentation page can therefore
continue through an offered documentation link even when it also contains an
unrelated Login or Donate control. This is a best-effort explanation for why no
click action is available, not a semantic permission classifier or a guarantee
for arbitrary pages. Do not add a per-site policy framework or a separate
browser-ownership system for v0.1. `DONE` remains the only completion claim.

Stop without another mutation when:

- the selected operation or UID was not offered;
- Jev's response is malformed or falls below the calibrated uncertainty policy;
- the selected UID is absent from the decision snapshot, or the executor
  rejects it as stale;
- a command reports an uncertain mutation outcome;
- three non-`WAIT` steps leave the observed state unchanged;
- the step or wall-clock budget expires; or
- Pi cancels the tool.

Never retry a browser mutation whose outcome is uncertain. On cancellation or
timeout, the runner aborts the active adapter and waits for that adapter to
settle before returning; this keeps a cooperative `pi.exec` CLI child from
outliving the tool result. Cleanup can take the run beyond its budget, which is
reported as `budgetOverrunMs`. A non-cooperating external executor can leave the
run pending indefinitely, so this is not a process-cleanup guarantee for an
arbitrary adapter. A cancelled or timed-out dispatched mutation remains
`uncertain_execution` and is never retried.

Validating a UID against the decision snapshot does not make observation and
execution atomic. The CLI can reject missing or detached targets, but a
surviving element may have changed meaning. Concurrent use of the selected page
remains an operating limitation; sequential tool execution is not an exclusive
page lock.

## Implementation sequence

1. Add offline tests for snapshot parsing, compatible candidate construction,
   quoted values, Jev response validation, excluded candidates, loop detection,
   result redaction and bounded multi-page evidence retention.
2. Implement `config/pi/extensions/rlcd-brwsr.ts` with injected Jev and CLI seams
   so tests use deterministic fakes.
3. Register `rlcd_brwsr_run` with `executionMode: "sequential"` so Pi schedules
   it sequentially; do not claim this prevents other clients changing the page.
4. Build a local HTML fixture covering navigation, search, tabs, native selects,
   scrolling, completion, stale UIDs, unchanged-state loops, adversarial page
   instructions and evidence retained across multiple pages.
5. Exercise the fixture through the real Chrome DevTools CLI with a fake Jev
   responder.
6. With explicit approval for paid requests, run Jev against the local fixture,
   then the TypeSafe documentation research task.
7. Compare the full research workflow with Pi's normal approach. Separately
   compare browser execution with Pi's agent-driven Chrome CLI loop.
8. Only after the experiment passes, add the extension to the builder, rollout
   fixtures and installed baseline.

## Verification and acceptance

Run repository type checking, formatting and tests, plus the Pi integration check
and a host-only browser check. Verify the visible tool call and result in Pi's
actual TUI.

Compare identical research questions and independently checked briefs across
the primary paths. Check coverage of all five requested topics, source support
for the findings, and citation correctness; a `DONE` choice or a count of
visited pages is not a passing result. Use the same main model and comparable
starting knowledge and cache conditions, without seeding either path with the
other path's findings.

Measure the whole task, including preparation, evidence gathering, synthesis,
verification and recovery. Record cold and warm wall time, verified success,
main-model turns and tokens, Jev requests and tokens, browser commands, direct
HTTP requests, stale decisions, consequential-action stops, and retained
processes or pages. Report the secondary browser-only comparison separately.

V0.1 is acceptable when:

- every deterministic fixture passes, including excluded-action and
  adversarial-page cases; excluded actions do not execute in those tests;
- success, failure, cancellation and timeout leave no RLCD-brwsr-owned process;
- research briefs meet the same independently checked outcome criteria as
  Pi's normal research approach; and
- it reduces median end-to-end wall time or main-model use on the tested tasks,
  with any trade-off between the two reported explicitly.

Passing fixtures is not a general guarantee about the effects of controls on
unseen websites. A browser-only speedup without a primary-baseline improvement
is a narrower result, not acceptance of the research-workflow hypothesis.

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
