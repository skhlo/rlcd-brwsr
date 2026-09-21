# Issue #12 evidence

Base: `123313f8fb3c2647d553a34e1450248559e090db`.

The interrupted-run slice stays behind the registered `rlcd_brwsr_run` tool and
uses the real TypeScript extension, real project Python subprocess, and pinned
upstream Agent. Offline tests fake only external Browser Harness transport and
model replies. The parent now retains bounded readiness, ownership, observation,
decision, dispatch, and executed-action progress when a terminal result is
missing. Cancellation and wall expiry request cooperative cleanup, stop and reap
the run-owned bridge after a fixed grace, and report parent-observed elapsed time
and wall-budget overrun.

Fallback cleanup starts the same Python bridge executable in a bounded internal
mode. Python resolves Browser Harness's native configuration, refreshes its
child-owned credential redactor, requires the existing daemon, and sends one
`Target.closeTarget` for only the target identifier reported incrementally by
the failed run. It does not list targets, infer ownership from target-set drift,
restart Harness, or duplicate native browser configuration in TypeScript.
Cleanup remains unconfirmed when ownership was never reported, the terminal is
stale, or the targeted close cannot be confirmed.

`retainTab: true` applies only to a completion claim. It leaves the identified
tab open while the bridge exits; default completion closes it, and failed,
stopped, expired, or cancelled runs still attempt cleanup. A dispatch record
makes an interrupted mutation outcome unknown until later upstream evidence can
narrow it. Process exit is not reported as rollback or as proof that execution
was cancelled. The fill-error guard also distinguishes the known pre-helper
freshness failure from a stale retry that can reuse cached generated text: an
unchanged helper-call count alone no longer proves that browser input did not
start.

The 37-test suite (the original 25 plus 12 issue #12 cases) covers cancellation during model work,
post-input observation, and dispatched input; a bridge death after progress;
initial observation failure before reported ownership; malformed, truncated,
and oversized protocol streams; an abnormal exit after a terminal claim;
confirmed and unconfirmed targeted cleanup; a non-cooperative cleanup forced
after grace; BLOCKED and stale re-observation; default closure; successful
completion-only retention; and retention requests followed by failure or expiry.
It verifies actual child-process exit, bounded diagnostics/content, preserved
partial evidence, target-specific close calls, retained shared-daemon status,
unknown measurements, and synthetic-secret redaction. The cached-text guard
failed before the correction and passed afterward; ignored proof is under
`artifacts/issue-12/guard-proof-{red,green}.txt`.

## Actual Pi TUI and browser verification

The 2026-09-21 acceptance reused the approved existing resources without
reprovisioning: isolated Chrome PID `89627` at loopback
`http://127.0.0.1:63729` and Browser Harness PID `89979`, native name
`rlcd-brwsr`. Preflight passed with Python 3.12.13, the pinned upstream commit,
Browser Harness 0.1.13, and `jev-1.13.0`. The fixture ran only on
`127.0.0.1:43113`. Jev replies were deterministic and synthetic through the
external provider seam; no Jev/helper HTTP request, real credential, provider
setup, or paid browser-model call was used.

Three fresh actual Pi TUIs were created and controlled only through Paseo CLI:

- Cancellation interrupted synthetic slow model work after readiness,
  ownership, and the first real Agent/Harness/Chrome observation. The visible
  tool result returned `stopped`/`cancelled`, retained the start-page evidence
  and target `7B16092BF9876CCD7AC71C4278798197`, reported
  `mutationOutcome: not_in_flight`, closed that tab, and reaped bridge PID
  `28417`.
- Default completion returned `completion_claim`/`done_claim` after `CLICK` and
  `DONE`, observed `ORBIT-27`, closed target
  `9CD3D506B9CE91308E298BA46FA7D954`, and reaped bridge PID `28806`.
- Explicit retention returned the same completion claim and destination
  evidence but reported target `E7F4100ED1384C7A5F2CC57295610850` as retained
  while bridge PID `29317` was already reaped. A separate direct-CDP observer,
  run after tool return, independently inspected that exact target and found the
  destination URL/title and `ORBIT-27`. The target was then closed explicitly by
  identifier through the same existing native-configured Harness.

The Chrome page/browser-UI target set before and after acceptance was identical:
`2EE927EC06E2228F2B18E6A169347F30`,
`9564DBF08857A04C4B2A7F11AC40B92F`,
`963DEBC815B79409D2B83477D49D0196`, and
`E88744FD63ED22A49304B4C9F8DA910D`. Chrome PID `74985`, approved isolated
Chrome PID `89627`, and Harness PID `89979` remained. Chrome PID `69653` was
already absent from the pre-run census and was not touched. The fixture and all
five task-owned Paseo terminals were stopped:
`c1c1e26f-fc8e-4cf6-9adf-5663b03a8f61`,
`392f9313-7cd1-4d0d-b10b-9f9c38541169`,
`8e93fa65-93c1-410b-b349-0b28d25426b1`,
`24287e73-7a70-4c40-b2be-9e4f01c2e121`, and
`cd605ee8-48ea-46da-8ff4-fe1d01648439`. No task fixture, bridge, observer, or
Paseo terminal remained. Raw TUI sessions, captures, and censuses are ignored
under `artifacts/issue-12/tui-acceptance-20260921T041528Z/`.

## Limits

The last observation is the last successfully received snapshot, not an
asserted final page after interruption. Mutation and cleanup state remain
unknown when evidence cannot narrow them. Upstream still owns action choice,
stale handling, generated-text caching, and browser execution. The wrapper does
not retry or roll back input, reconcile changed native browser settings, count
provider attempts/retries/costs that upstream does not expose, or manage
intentionally retained tabs after returning their exact identifier. The candidate `pnpm check` passed formatting, TypeScript, all 37 tests, and
Python compilation; `pnpm-lock.yaml` and `uv.lock` were unchanged. Live Jev and
combined generated-text acceptance remain for issue #13.
