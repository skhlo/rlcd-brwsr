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
new isolated profile and explicit loopback endpoint.

The first correction then added wrapper-owned `RLCD_BRWSR_DAEMON` and
`RLCD_BRWSR_CDP_URL` settings plus an independent live target-identity check. A
later user-approved design decision superseded that contract. Browser Harness
now owns browser selection through `BU_NAME` and native connection resolution.
The wrapper validates local-only resolved settings and requires the named
existing daemon at run time, but intentionally no longer proves that a
same-named local daemon reflects a changed endpoint. The operator must
explicitly stop/restart and reprovision Harness after changing its browser
configuration.

Current offline regressions let the real upstream import-time workspace `.env`
loader resolve synthetic native settings through executable setup, executable
preflight, and the registered Pi tool. They cover valid local configuration and
remote/cloud rejection before setup starts a daemon or a run starts browser
work. The prior result bounds, privacy, cleanup, WAIT-heavy stream, and
missing-runtime-without-uv coverage remain.

The native-configuration acceptance rerun loaded `BU_NAME=rlcd-brwsr` and the
loopback endpoint from Browser Harness's default trusted workspace `.env`; the
Pi terminal explicitly removed browser selectors from its shell first. The
actual Pi TUI returned `completion_claim`/`done_claim` after `CLICK` then `DONE`
through the real bridge, pinned Agent, Harness, and isolated Chrome. Only model
HTTP was replaced by the deterministic responder. The task tab closed, bridge
was reaped, shared daemon remained, and before/after target sets were identical.
A separate direct-CDP observer saw the destination title and `ORBIT-27`, closed
its own target, and isolated Chrome history recorded a new start/destination
pair at the tool-run timestamp. The task fixture and two task-owned Paseo
terminals were stopped; the approved isolated Chrome and named daemon remain.
Raw TUI, session, history, CDP, and resource-census evidence is gitignored under
`artifacts/issue-10/native-config-acceptance-20260921T024540Z/`.
