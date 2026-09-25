# Let upstream Python own the run

Status: accepted and implemented on `main`. The initial Python-owned
implementation merged in [PR #16](https://github.com/skhlo/rlcd-brwsr/pull/16);
the direct DeepSeek helper, tab-targeting and handoff amendments merged in
[PR #18](https://github.com/skhlo/rlcd-brwsr/pull/18).

The local Design A candidate in [ADR-0004](0004-task-scoped-cli-browser-mechanics.md)
supersedes this ADR's browser observation/input assignment and private-seam
count. It retains this ADR's Python `Agent.run()` and reporting ownership.
Native browser acceptance of the candidate is still pending.

## Context

The earlier wrapper split one browser run across a command-level Python bridge
and a TypeScript protocol engine. Pi relayed text-helper completions, kept shadow
browser state, reconciled progress, and attempted parent-side cleanup. That
created two owners for run history, lifecycle, helper state, and cleanup while
still depending on revision-pinned Jev and Browser Harness behavior.

The pinned Jev `Agent.run()` already owns observation, decisions, native field
text, freshness checks, actions, and run state. It exposes a synchronous
generator and fixed native limits, but no cancellation token, strict action
deadline, stable target-ownership API, or complete usage accounting. A smaller
wrapper is possible only by accepting conservative results after interruption.

The browser result also needs a bounded handoff to Pi's outer model. Full page
and history state is useful for diagnosis but too broad for routine model-facing
content. Earlier candidate-grouping refinements mixed interpretation context
with selectable output and accumulated amendment chronology in this ADR.

## Decision

Use the pinned upstream `Agent.run()` and native API-key field-text helper behind
a small Pi process launcher:

- Python exclusively owns the Agent, upstream state, target handle, normal
  cleanup, bounded projection, redaction, and optional evidence reporting.
- Pi validates public input, starts one fixed Python child, owns one absolute
  deadline and first parent stop, bounds pipes, escalates and observes reap,
  validates one terminal envelope, and builds compact model-facing content.
- Browser Harness remains the sole browser-configuration and input owner.
- The outer agent owns authorization, consequential-action judgment, recovery,
  and independent verification of every completion claim.

There is no TypeScript port, command-level `predict`/`act` loop, Pi-native helper
relay, shadow browser state, phase protocol, parent fallback cleanup, alternate
helper backend, or automatic retry.

The implementation retains only three private, revision-pinned integrations:
existing-daemon rebinding, exact created-target close/retention, and an
exact-session borrowed-tab Browser adapter. The
[current contract](../RLCD-BRWSR.md) owns their precise interface, lifecycle,
configuration, privacy, output, and verification requirements.

## Current handoff decision

After handled browser cleanup, Python may make one batched Jev reporting request
for a normal completion claim or native `BLOCKED` outcome with an observation.
It sends two deliberately separate source views:

1. `judgmentContext` - the bounded, sanitized final visible page text in source
   order, used only to interpret labels, neighbors, and qualifications.
2. candidates - exact selectable page spans plus allowlisted recent action
   fields. Only these records can become evidence.

Useful short paragraphs remain independent. Long fragmented text offers
individual nonempty lines; long prose uses token-aligned spans near 128 UTF-8
bytes. Candidate pressure may coalesce adjacent spans within the unchanged
512-byte record bound to preserve source coverage. The request retains one
shared usefulness policy, independent candidate-path Nouls, the 0.5 evaluation
threshold, and a three-record output cap.

Context is untrusted data, never an instruction source or automatic output.
Evidence is copied only from offered records. Source/request omissions are
reported even when omitted selectable text remains in context. This separation
keeps qualifications available to the judge without requiring surrounding page
text in the compact handoff.

This section consolidates and supersedes this ADR's prior reporting,
selector-refinement, and span-judge amendments. It does not reverse their final
decisions; it replaces their chronology with the current architecture. The full
pre-consolidation text remains available with:

```bash
git show c9a655a:docs/adr/0003-python-owned-run.md
```

## Rationale

One run-state owner removes cross-language phase reconciliation and lets the
pinned upstream implementation own the behavior it already couples. The native
field-text path avoids a bidirectional helper protocol. One terminal result
makes lifecycle trust depend on a clean observed exit rather than on progress
messages that can disagree with process state.

Separate diagnostic and model-facing surfaces preserve bounded machine facts for
inspection while reducing routine context. Separating judgment context from
selectable evidence allows fine exact copies without discarding distant labels
or qualifications. The reporting module remains one owner rather than a generic
schema, ranking, or browser framework.

The tradeoffs are accepted:

- The host must supply a TypeSafe key and, for text entry, a separate
  DeepSeek-issued key through Browser Harness's native environment.
- A hard stop can lose state and strand created/borrowed cleanup; the result is
  `unknown`, not reconstructed certainty.
- The parent deadline is coarse and cannot promise no boundary action.
- Existing-daemon health does not attest endpoint/profile identity.
- Optional reporting adds model work and can miss useful evidence.
- Native usage and Pi totals remain incomplete.
- Private pinned seams must be retested on dependency updates.

These are narrower, inspectable guarantees rather than reasons to recreate the
larger protocol.

## Consequences

- Extension loading stays inert; setup and provisioning remain explicit.
- Runs require the configured local daemon to be already running and preserve
  the shared daemon and unrelated targets.
- Created tabs can be retained only after a normal completion claim; borrowed
  tabs are never wrapper-owned.
- Interrupted or untrusted exits preserve parent-observed stop/reap facts and
  report browser effects and cleanup conservatively.
- Full snapshots, prompts, replies, raw stderr, and credential values do not
  enter results.
- Compact content and bounded diagnostic details are distinct surfaces under one
  configured hard cap.

ADR-0003 supersedes ADR-0002's command-level orchestration, Pi-native helper
relay, parent shadow-state, and fallback-cleanup direction. It retains the
upstream dependency pins, native Browser Harness ownership, explicit setup, and
inert registration decisions. ADR-0002 remains decision history, not the current
implementation contract.

Verification status, known limits, commit references, and raw receipts are owned
by [thin-python-evidence.md](../thin-python-evidence.md#compact-handoff).
