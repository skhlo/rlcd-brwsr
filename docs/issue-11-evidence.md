# Issue #11 evidence

Base: `f103e64571d93ce8a1cb26546f78eacc1936dc85`.

The generated field-value slice runs through the registered Pi tool, real
TypeScript extension, real Python bridge, pinned upstream Agent, Browser Harness
0.1.13, and the approved isolated Chrome. Tests and TUI acceptance replaced only
external Jev/helper replies and browser transport where applicable. No real
credential, paid Jev/helper call, provider provisioning, browser configuration
change, or retention feature was used.

The helper is available only when native upstream `TEXT_MODEL_API_KEY`,
`TEXT_MODEL_BASE_URL`, and `TEXT_MODEL` settings are explicit and coherent. A
partial or invalid tuple remains unavailable to click-only work and returns
`needs_text` before any helper request or field mutation if Jev selects
`TYPE_TEXT`. Upstream still constructs field context, validates the generated
JSON value, checks freshness, and performs the fill.

Offline registered-tool coverage retains the original 18 tests and adds five
issue #11 tests. The 23-test suite covers the generated-value journey, helper use
only for `TYPE_TEXT`, absent/incomplete helper handoff, malformed and empty
values, connection/status failures, explicit preflight reporting, and
synthetic-secret redaction across fixed process arguments, progress, content,
details, and a retained test artifact. The cheap generated-journey guard failed
before implementation and passed afterward; raw proof is ignored under
`artifacts/issue-11/guard-proof-{red,green}.txt`.

Actual Pi TUI acceptance used Paseo CLI and the loopback
`/text-entry.html` fixture. The natural-language goal asked for South Korea's
second-largest city; the synthetic helper reply supplied `Busan`. The
observer-coordinated rerun returned `completion_claim`/`done_claim` after
`TYPE_TEXT` and `DONE`. Tool evidence showed `Busan` and `FIELD-41`. A separate
direct-CDP observer inspected the same owned target
`B027B2C12576FBB41490E2E81209E0EE` while it remained open, independently read
the input value `Busan` and visible `FIELD-41` marker, and left closure to the
run. The target then closed normally. An initial short-lived observer missed the
inspection window and is retained as failed evidence; no page-state claim is
based on that attempt or on a closed target.

The acceptance responder is explicitly synthetic. It replaced Jev and helper
HTTP work at upstream's external `post_json` boundary; the Agent, field-context
construction, generated-value validation, Harness, and Chrome stayed real. No
Jev/helper HTTP request left the process. The result separately reported Jev's
configured `jev-1.13.0` and synthetic provider-reported ID, plus helper's
configured `synthetic-text-helper-v1`. Upstream does not retain the helper
provider response's model ID, so the result reported it as `unavailable`.
Available decision/call usage and latency were present; provider attempt counts
and costs remained `unavailable`.

Raw TUI/session, helper-summary, observer, preflight, and resource-census
evidence is gitignored under
`artifacts/issue-11/tui-acceptance-20260921T031638Z/`. Retained captures were
scanned for the synthetic Jev/helper credential values after the TUI capture was
redacted. The task fixture and three task-owned Paseo terminals were stopped.
Regular Chrome PID 69653, old automation Chrome PID 74985, approved isolated
Chrome PID 89627, Harness PID 89979, their pre-existing tabs, and pre-existing
Paseo terminal `7d560f42-7cb3-4b8c-ae6c-f6d9ff383074` remained.

## Correction pass

The correction from candidate `a31bcae` moved known-credential redaction into
the Python emission and diagnostic boundary. The bridge refreshes known values
immediately after native Harness workspace configuration resolution and redacts
protocol records and standard-error diagnostics before they reach the parent.
The parent still redacts its own known values. The regression puts a synthetic
helper tuple only in an isolated Harness workspace `.env`, has an external
failure echo it through observation, progress, and error surfaces, and verifies
its absence from content, details, updates, raw bridge JSONL, arguments, and a
retained test artifact.

Fill-phase failures before a recorded helper result now remain conservative
`upstream_error` results. A registered-tool regression fails the second real
upstream freshness transport check, before `field_text`; it verifies no helper
request, no field mutation, `mutationOutcome: not_in_flight`, and bounded useful
diagnostics. Malformed/empty helper output and provider failures preserve the
same mutation outcome and diagnostics without retries. Python now solely
classifies native helper configuration; pre-bridge parent results report helper
capability and model as unknown.

The correction acceptance repeated the actual Pi TUI text-entry fixture with
the real pinned Agent, Browser Harness, and approved Chrome, replacing only Jev
and helper HTTP replies with the deterministic synthetic responder. The tool
returned `completion_claim`/`done_claim` after `TYPE_TEXT` and `DONE`. While the
owned target `2697F2A490C9B78E8B48D42232A32A6B` was still open, the independent
direct-CDP observer read `Busan` and the visible `FIELD-41` marker from that same
target. Normal run cleanup then closed it and reaped bridge PID 21959.

Correction raw evidence is ignored under
`artifacts/issue-11/correction-tui-acceptance-20260921T034349Z/`; focused red and
green guard logs remain alongside it under `artifacts/issue-11/`. The correction
run stopped its fixture and three task-owned Paseo terminals. Chrome PIDs 69653,
74985, and 89627 and Harness PID 89979 remained. The requested old Paseo terminal
`7d560f42-7cb3-4b8c-ae6c-f6d9ff383074` was already absent from the pre-run Paseo
census, so the correction run took no action on it. The final `pnpm check`
passed formatting, TypeScript, all 25 registered-tool/production-load tests, and
Python compilation; `pnpm-lock.yaml` and `uv.lock` hashes were unchanged.
