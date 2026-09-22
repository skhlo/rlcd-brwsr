# Issue #11 evidence

Base: `f103e64571d93ce8a1cb26546f78eacc1936dc85`.

The original evidence below records the then-approved API-key helper. The
**Pi-native ownership revision** at the end supersedes that helper setup while
retaining the upstream field-context/value-validation evidence.

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

## Pi-native ownership revision

The later approved simplification removes the separate API-key/helper endpoint
and makes Pi the sole owner of text-helper model lookup, existing login, OAuth
refresh, and completion. The fixed helper is
`openai-codex/gpt-5.6-luna` at high reasoning. Python receives no OAuth material
or model choice; its narrow pinned interception relays only upstream's unchanged
system/user prompt and a bounded response with available token usage over the
existing bridge. Internal nonsecret sentinels satisfy upstream's fixed
API-key-shaped call and cannot fall through to HTTP. Standalone Python preflight
now reports helper capability/model as unknown.

The registered-tool tracer failed before implementation because no Pi
completion was called (`0 !== 1`), then passed through the real extension,
bridge, and pinned Agent. Offline coverage now proves the prompt/reply round
trip, Luna/high selection, upstream exact-`{text}`/nonempty/2,000-character
validation, malformed and bounded oversized replies, provider failure, missing
model/login, click-only no-call behavior, cancellation/deadline while waiting,
late-reply suppression across a later run, process/tab cleanup, bounded output,
child-loaded Jev-secret redaction, and absence of synthetic OAuth material from
bridge stdin, arguments, and tool results. External Pi completion, Jev, and
browser dependencies are synthetic in these tests; no provider call was made.

Fresh visible Pi TUI acceptance then exercised the new relay with the real
pinned Agent, Browser Harness, and approved isolated Chrome profile. A test-only
Pi extension replaced only the external Luna completion; the existing fixture
replacement supplied Jev choices. The tool returned
`completion_claim`/`done_claim` after `TYPE_TEXT` and `DONE`, reported fixed
`openai-codex/gpt-5.6-luna`, high reasoning in the responder record, one helper
call with available token usage, retained target
`E72E617C16C3CE6291564D21E3222932`, and reaped bridge PID `63823`. A separate
direct-CDP observer inspected that exact retained target and read `Busan` plus
the visible `FIELD-41` marker. The target was then closed by exact identifier;
the final target set matched the four-target post-provision baseline.

The previously approved Chrome PID `89627` was absent and endpoint `63729` was
initially down. The same approved profile was restarted explicitly on that
loopback endpoint as PID `63031`; no personal or other profile was selected.
The retained Harness PID `89979` then failed its CDP health check, so the
project's explicit provisioning path replaced only that named task daemon with
healthy PID `63344` against unchanged native configuration. Both approved setup
resources remain. The fixture, Pi, and observer Paseo terminals were stopped;
pre-existing Paseo terminals `7d560f42-...` and `80ded321-...` remain. Raw
ignored TUI, responder, observer, preflight, and census evidence is under
`artifacts/pi-native-text-helper-tui-20260922T022749Z/`; the initial Chrome
restart log also remains under the earlier
`artifacts/pi-native-text-helper-tui-20260922T000000Z/` directory.

No live Jev or Luna completion, provider credential setup, helper HTTP request,
or paid #13 acceptance was performed. The ordinary outer Pi model turn used to
invoke the tool was authorized. Live combined acceptance remains deferred to
issue #13.

Candidate verification passed `pnpm check`: repository formatting, TypeScript,
all 40 registered-tool/production-load tests, and Python compilation. The
project also passed shell syntax checks and `git diff --check`. Lockfiles stayed
stable at `078dfa074e7244bb461ecb0906d0b5570280a917` (`pnpm-lock.yaml`) and
`07c18ae06e215cf23e6391e52e28a6fb0df29ecf` (`uv.lock`).

## Pi-native review correction

The correction after frozen candidate `08e2d4d` replaces raw Pi SDK error
forwarding with fixed bounded failure text. Registered-tool regressions put one
synthetic OAuth access token in an actual resolved SDK `errorMessage` and in a
thrown SDK error's message, body, and stack. The token is absent from content,
details, progress, retained output, and captured bridge stdin. That raw wire
assertion is limited to the intentional contract that OAuth material never
enters Python; cancellation and execution checks use public results, provider
signals and usage, and external field/target state instead.

The adapter now captures response model, latency, and exact SDK usage before
classifying `length`, `error`, or `aborted` responses. Observable late usage is
retained after expiry, while a thrown failure with no supplied usage remains
unaccounted rather than fabricated. The tool returns Pi's top-level `Usage`,
summing multiple helper calls once without adding the copy echoed by Python;
per-helper details still keep Jev and helper measurements separate and leave
unexposed provider attempts and costs unavailable.

Fresh Pi TUI acceptance used the real pinned Agent, Browser Harness PID `63344`,
and approved isolated Chrome PID `63031` at loopback endpoint `63729`. Only
external Jev and Pi-helper completion were synthetic. The tool returned
`completion_claim`/`done_claim`, one helper call with 23 input, 4 output, 2
reasoning, and 27 total tokens, retained target
`83164DE08CDB0D9EEA65B3175BD27ED9`, and reaped bridge PID `72260`. The persisted
Pi tool-result entry contains that same top-level usage. A separate direct-CDP
observer inspected that exact retained target and confirmed `Busan` plus visible
`FIELD-41`; only that target was then closed, restoring the four-target
baseline. The fixture, Pi, observer, and their three task-owned Paseo terminals
were stopped. The approved Chrome, wrapper PID `63029`, Harness, profile, and
pre-existing Paseo terminals remain. Ignored raw evidence is under
`artifacts/pi-native-text-helper-correction-tui-20260922T032230Z/`.

The correction kept all 40 tests and passed focused regressions, full tests,
TypeScript, Python compilation, formatting, and `git diff --check`. Both
lockfile hashes remained unchanged. No live Luna or Jev call, credential read,
host configuration change, dependency, daemon replacement, or #13 acceptance
was performed.
