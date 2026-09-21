# Wrap the pinned Jev Ultrafast Agent

Status: accepted; supersedes ADR-0001 for the active implementation.

RLCD-brwsr will expose `browser-use/jev-ultrafast` at commit
`1231850a0bf1a0c0341fe408ef1668dbbfdfac46` through one thin Pi extension and a
small Python bridge. Upstream owns observation, indexed action candidates,
selection, text-helper handoff, stale-state checks, and execution through its
Browser Harness `0.1.13` dependency. The wrapper owns validation, finite
budgets, cancellation, bounded JSONL progress/results, and run-owned cleanup.

The bridge uses upstream's prediction/action/state integration seam at that
exact revision to report progress and enforce wrapper budgets. This seam is not
a stable upstream API, so pin updates require explicit compatibility tests.
Upstream's browser startup hook is narrowly rebound to Browser Harness's
`require_existing_daemon()` check for one explicitly configured named daemon.
The wrapper never falls back to automatic discovery or startup.

## Why this changes ADR-0001

ADR-0001 rejected the Python and Browser Harness runtime before the custom
classifier-plus-Chrome-CLI experiment had tested the simpler direction. That
kept the first experiment small and its rationale remains part of the project
history.

The experiment subsequently showed that the custom wrapper was rebuilding
behavior already owned upstream. It also introduced observation clipping,
probability-wire validation, and control-appearance timing problems. The
research comparison did not establish a general speedup, but those wrapper
failures do not establish a general Jev limitation. Maintaining a second
extractor, policy loop, and executor is not the project objective.

The active direction therefore adopts the pinned upstream runtime instead of
copying its policy shape. Browser Harness becomes the sole executor inside this
capability; Chrome DevTools CLI is not a fallback.

## Consequences

- Python 3.12, the upstream Git pin, and Browser Harness are project-local uv
  dependencies with a reproducible lock and explicit setup.
- Extension loading remains inert. Runtime or browser setup never happens as a
  side effect of registration.
- One named, already-running Browser Harness daemon connects to an explicitly
  selected local Chrome. Runs preserve it and unrelated tabs.
- The Pi tool remains one deep interface and is sequential only within Pi.
- The optional upstream text helper remains upstream-owned and is not replaced
  by custom extraction or the main Pi model.
- Historical custom-loop evidence remains in PR #8 at `5dafb11` and sibling
  experiment commit `6df4b4b0f8b17420f9c9bc0a8176072312ec6de3`.
- No maintained upstream fork, TypeScript port, custom extractor, site scripts,
  or second active `rlcd_brwsr_run` implementation is introduced.
