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

## Cancellation, timeout, and cleanup

`check-cli-lifecycle.mjs` uses `spawn` with `shell: false` against the real CLI and the fixture's slow
route.

- CLI timeout: `new_page ... --timeout 250` returned the CLI's JSON error array containing
  `Navigation timeout of 250 ms exceeded`; the client exited and its PID was absent afterward.
- Client cancellation: aborting a dispatched `new_page` produced `AbortError` / `ABORT_ERR`, ended the
  client with `SIGTERM`, and its PID was absent afterward.
- The browser was listed after both cases rather than assuming client cancellation stopped work in
  the existing executor daemon. One task-created blank page remained and was closed explicitly.
- The two-page journey tab and all fixture, Pi-demo, cancellation, and timeout processes were stopped.
  The pre-existing `about:blank` page was preserved. The Chrome DevTools CLI daemon was retained
  because it is executor-owned, not RLCD-brwsr-owned.
