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
