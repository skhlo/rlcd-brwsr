# Two-page host check

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
