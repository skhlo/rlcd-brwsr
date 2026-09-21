# Issue #10 evidence

The first upstream-backed slice was exercised through the registered Pi tool,
the real Python bridge and pinned Jev Agent, Browser Harness 0.1.13, and an
isolated Chrome. Model HTTP was replaced by the deterministic fixture responder;
no paid Jev or text-helper inference was used.

The correction-pass acceptance on 2026-09-21 returned
`completion_claim`/`done_claim` after `CLICK` then `DONE`. The tool's last
observation contained the destination URL, title, and `ORBIT-27`. It reported
its task tab closed, bridge reaped, and shared daemon retained. Independent
evidence consisted of the isolated Chrome history's new start-to-destination
visit pair captured before observing, plus a fresh direct-CDP observer that read
`Acceptance marker: ORBIT-27` from the destination DOM and closed only its own
target. Default cleanup had already removed the task target, so no post-return
DOM claim is attributed to that closed target.

The selected browser was the user-approved isolated profile at
`artifacts/issue-10/real-host-acceptance-20260921T010911Z/chrome-profile`, exposed
only at loopback `http://127.0.0.1:63729`. The named `rlcd-brwsr` daemon and that
Chrome were retained for later slices. The regular Chrome, old automation
Chrome, unrelated tabs, and pre-existing Paseo terminal were not touched.

The initial browser mismatch was not evidence that either old profile exposed a
usable endpoint: the user toggled the old Chrome DevTools CLI pipe instance, and
neither old profile had a WebSocket endpoint. The approved resolution was the
new isolated profile and explicit loopback endpoint. Provision, preflight, and
run now verify that endpoint rather than silently selecting personal/default
Chrome.

Offline correction regressions cover cloud and mismatched same-name daemons,
correct local reuse despite inherited Browser Harness selectors, a WAIT-heavy
stream beyond the former 128-record stop, and missing-runtime preflight without
`uv` execution. `pnpm check`, executable real-host preflight, and `uv lock
--check` passed; the uv lock hash remained unchanged. Larger TUI, session,
Chrome-history, CDP, and resource-census evidence remains gitignored under
`artifacts/issue-10/`.
