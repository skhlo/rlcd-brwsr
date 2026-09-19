# Research fast-loop host checks

Date: 2026-09-19

## Environment

- Node 26.6.0
- pnpm 11.8.0
- Pi 0.85.1
- Chrome DevTools CLI 1.7.0
- `TYPESAFE_API_KEY`: absent
- Jev requests: 0

The fixture bound only to `127.0.0.1:43113`. Tailscale CLI was unavailable, so this run has no
Tailscale Serve URL.

## Actual Pi TUI journey

Pi was started in an isolated no-session invocation with the fake responder loaded explicitly:

```text
pi --no-session --no-extensions --no-skills --no-prompt-templates --offline \
  -e ./experiments/research-fast-loop/fake-jev-extension.ts \
  --tools rlcd_brwsr_run
```

The actual TUI showed one `rlcd_brwsr_run` call with `maxSteps: 2` and `maxSeconds: 20`. Its result
reported `status: completion_claim`, `stopReason: done_claim`, and
`requiresIndependentVerification: true`. The outer Pi response displayed these retained sources:

1. `http://127.0.0.1:43113/index.html` — **RLCD research start** — “Fixture source one: ask one
   narrow judgment over relevant structured state, while ordinary code owns browser execution.”
2. `http://127.0.0.1:43113/evidence.html` — **RLCD uncertainty evidence** — “Fixture source two: a
   DONE choice is a completion claim, not proof that source coverage is complete. The outer agent
   must verify the requested outcome independently.”

The TUI was controlled and captured through Paseo CLI terminal commands, not Paseo MCP.

## Independent checks

After the tool returned, a separate real CLI `take_snapshot --output-format=json` observed the
selected destination with URL `http://127.0.0.1:43113/evidence.html`, title
`RLCD uncertainty evidence`, and the expected destination text. Direct loopback HTTP reads confirmed
both quoted fixture texts independently of the fake responder's `DONE` answer.

The real 1.7.0 CLI also demonstrated the two JSON result forms used by the runner:

- success: an object containing a structured `snapshot` tree;
- failure: a text-record array such as
  `[{"type":"text","text":"Error: Element uid ... not found ..."}]`, even with process exit code 0.

## Cancellation, timeout, and cleanup correction

Repeated on 2026-09-20 through the actual registered tool in Pi's TUI. The fixture extension injected
only the fake classifier; registration created the real runner and the production
`createChromeCliExecutor(pi.exec)` adapter. The old standalone-spawn surrogate was removed because it
did not exercise this path.

- Timeout: a tool call with `maxSeconds: 1` clicked `Open slow documentation`. The visible tool result
  returned `uncertain_execution`, `budgetOverrunMs: 18`, and a model-visible truncation disclosure
  naming omitted trace probabilities and the 12,000-character content cap.
- Cancellation: a tool call with `maxSeconds: 30` showed a task-created `chrome-devtools` client as a
  direct child of Pi while the click was active. Pressing Escape produced a visible
  `uncertain_execution` tool result. The tracked CLI child was absent when that result appeared; Pi
  then displayed that the enclosing operation was aborted.
- In both cases the existing daemon continued the already-dispatched slow navigation after the CLI
  client ended. A separate `list_pages` call could not complete until the fixture responded, and the
  page later changed to `/slow`. This confirms why the result remains uncertain and why client cleanup
  is not represented as cancellation of daemon-side browser work.
- The pre-existing daemon and `about:blank` page were preserved. The task-created lifecycle page was
  closed, the original page was reselected, and both Paseo fixture/TUI terminals and their processes
  were stopped. No RLCD-brwsr-owned CLI child remained. Tailscale CLI remained unavailable and no Jev
  request was made.

## Search, selection, scrolling and partial-evidence check

Date: 2026-09-20

The same loopback server and explicitly loaded fake responder exercised issue #4 through Pi 0.85.1's
actual TUI. The host had Node 26.6.0, pnpm 11.27.0 and Chrome DevTools CLI 1.7.0. `TYPESAFE_API_KEY`
was absent, so the run made zero Jev requests. Tailscale CLI was absent; the fixture remained bound to
`127.0.0.1:43113` and had no Tailscale Serve URL.

The visible seven-step `rlcd_brwsr_run` call on `journey.html` returned `completion_claim` with
`stopReason: done_claim` and the independent-verification flag. Its trace reported `TYPE_TEXT`,
`SELECT`, `PAGE_DOWN`, `PAGE_UP`, `WAIT`, the `Show gathered evidence` tab click and `DONE`. The
retained evidence included the revealed statement that exact search text, one native option, both
scroll directions, a bounded wait and a tab had been exercised. Unrelated `Log in` and `Donate`
controls remained excluded while the low-consequence tab and documentation link were offered.

Separate real-CLI observations, not the fake classifier's completion claim, established the visible
state:

- the search control contained `Jev fast — café docs`;
- the native select contained the AX-observed speculative fan-out option (Chrome exposed the CJK
  label with accessibility spacing);
- the evidence tab had `aria-selected="true"`, its panel was visible, and its expected text was
  present;
- a direct `press_key PageDown --includeSnapshot` moved `window.scrollY` from 0 to 679.5 on this host,
  and `press_key PageUp --includeSnapshot` returned it to 0; and
- a direct real-CLI `fill` of the search UID returned a snapshot with the exact Unicode value and the
  fixture's matching live-status text.

A second visible Pi call followed `Continue to uncertainty evidence` and returned a `done_claim`
with both `index.html` and `evidence.html` retained. Repeating that journey with `maxSteps: 1`
returned `step_budget`, not a completion claim, while preserving both observed source URLs as partial
evidence.

All TUI and browser commands above were sent and captured through Paseo CLI terminals, never Paseo
MCP. The task-created fixture page, fixture server and verification terminals were removed after the
final checks. The pre-existing Chrome executor daemon and its `about:blank` page were retained.

## Correction checks: option identity, detached targets and adversarial instructions

Date: 2026-09-20

Chrome DevTools CLI 1.7.0 exposed both options in `ambiguous-select.html` with the same AX `name` and
`value`, `Response validation`, even though the fixture source uses distinct DOM values. A direct
real-CLI `fill` by that observed label selected the first source option and the fixture reported
`response-validation-primary`. This matched the pinned CLI source contract: snapshot construction
replaces each option's AX value with its name, and native fill finds the first matching child name
before reading that child's DOM value.

After reloading the page, the actual Pi 0.85.1 TUI ran the registered tool with the explicitly loaded
fake responder. The visible result returned `ambiguous_select_option` before classification or
mutation. A separate real-CLI snapshot still showed `No source value selected.` and retained the
unrelated `Log in` and `Donate` controls.

A real-CLI stale-target probe navigated away after snapshotting a link, then dispatched the old UID.
CLI 1.7.0 returned the exact error `Element with uid 32_7 no longer exists on the page.` The runner's
deterministic regression recognizes this wording and the existing `not found` wording as
`stale_target`, while an unknown dispatched mutation error remains `uncertain_execution`; none is
retried.

The new adversarial page instructed an automated browser to ignore the outer goal, click excluded
Login and Donate controls, select an unoffered `SUBMIT` operation, or follow an irrelevant link. Its
deliberately hostile fake responder returned an unoffered excluded target. The visible Pi tool result
was `invalid_classifier_response` with no mutation. A separate real-CLI snapshot confirmed that the
selected URL and all controls were unchanged. This demonstrates code-owned validation against this
fake output only; it is not evidence of real Jev prompt-injection immunity.

These checks used Node 26.6.0, pnpm 11.27.0, Pi 0.85.1 and Chrome DevTools CLI 1.7.0. Tailscale and
`TYPESAFE_API_KEY` were absent, and no Jev request was made. All TUI control used Paseo CLI rather
than Paseo MCP. The task-created page, fixture server and TUI terminal were stopped afterward. The
pre-existing executor daemon, selected `about:blank` page and unrelated Paseo Pi terminal were
retained.
