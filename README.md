# RLCD-brwsr

**Active checkout:** `~/Repositories/rlcd-brwsr/`.
Old experiments are archived in Git and a verified backup, not mixed into the
current working tree. The sibling checkout is retained only for test resources
and evidence. See the [archive index](docs/archive.md).

**Implementation status:** existing-tab targeting is implemented and locally
verified at `ff49875`. The current branch adds the corrected generic compact
handoff and a focused selector refinement: model-facing run content stays small,
while reporting coalesces fragmented lines, shares one precise policy, and
conservatively deduplicates identical page records. All 69 deterministic tests
and an isolated command-driven Pi-TUI check passed with synthetic
browser/provider boundaries. A same-input offline replay reduced the three
pilot request shapes without dropping nonwhitespace source text, but no grouped
question shape has been evaluated live. A separately authorized seven-case live
Jev replay of the earlier shape retained expected evidence in six cases; the
shortened Google case returned no excerpt. This is limited historical relevance
evidence, not a quality guarantee for the refinement. A subsequent three-task
normal-session public-page pilot passed independent verification and motivated
the local change. Only pilot-owned tabs were operated; existing user tabs were
left alone.
Jev and Pi's outer model remain unchanged; the native field helper is direct
DeepSeek `deepseek-flash` with thinking disabled. The feature is local and
unpublished. See [current verification and limits](docs/thin-python-evidence.md#compact-handoff)
and the [owning plan](docs/RLCD-BRWSR.md). Current GitHub issues still describe
the superseded implementation and are not claimed as satisfied.
See the
[owning plan](docs/RLCD-BRWSR.md),
[ADR-0003](docs/adr/0003-python-owned-run.md), and the historical
[feasibility evidence](docs/thin-python-feasibility.md).

RLCD-brwsr delegates one bounded browser task to the pinned Jev Ultrafast Agent.
Python constructs the upstream `Agent` and consumes `Agent.run()`; upstream owns
observation, decisions, native field-text generation, and Browser Harness input.
After handled cleanup, Python can make one optional batched Jev relevance request
that selects exact sanitized page/action evidence for the original goal. Pi
validates the request, supervises one Python process, keeps the full bounded JSON
as diagnostic `details`, and sends only compact content to its outer model. A Jev
`DONE` response is a completion claim, not proof; the outer agent must
independently verify the visible result.

## Project-local setup

Setup is explicit. Loading the extension only registers
`rlcd_brwsr_list_tabs` and `rlcd_brwsr_run`; it does not install packages, start
services, open Chrome, inspect tabs, or make model calls.

```bash
pnpm install --frozen-lockfile
scripts/setup-runtime.sh

# In Browser Harness's normal host-local environment/workspace configuration:
#   BU_NAME=rlcd-brwsr
#   BU_CDP_URL=http://127.0.0.1:<selected-chrome-port>

export TYPESAFE_API_KEY=...        # TypeSafe key for Jev; host-local, never commit
export TEXT_MODEL_API_KEY=...      # DeepSeek-issued key; optional for click-only tasks

# These are the only accepted native helper settings. After Browser Harness
# loads its native workspace environment, the child supplies absent values
# process-locally and rejects conflicts:
export TEXT_MODEL_BASE_URL=https://api.deepseek.com/v1
export TEXT_MODEL=deepseek-flash
export TEXT_MODEL_REASONING=disabled

scripts/provision-browser.sh
scripts/preflight-runtime.sh
```

After changing any native Browser Harness browser selector, endpoint, or profile
setting, stop the existing same-named daemon with Harness's native controls,
then restart it through `scripts/provision-browser.sh` before preflight or tool
use.

`TYPESAFE_API_KEY` authenticates Jev decisions and optional evidence selection.
`TEXT_MODEL_API_KEY` must be a DeepSeek-issued key for the optional native
field-text helper. Configure these through the owning host's Browser Harness
workspace environment. Its normal loader reads that `.env` during authorized
runtime use; this feature does not copy or edit the credential store or rerun
the host-local setup wizard.

Use plain Pi with the native configuration for direct DeepSeek, not a launcher
that maps an OpenRouter credential into `TEXT_MODEL_API_KEY`. Host launcher
management is separate from this repository change.

`uv.lock` fixes Python 3.12, Jev Ultrafast commit
`1231850a0bf1a0c0341fe408ef1668dbbfdfac46`, and Browser Harness 0.1.13.
`config/runtime.json` fixes Jev to `jev-1.13.0`, the helper tuple above, a
32 KiB serialized-request limit, and a 16 KiB terminal/full-details JSON limit.
Compact model-facing content is also structurally fitted within that existing
16 KiB hard cap; there is no separate stricter public byte promise. Those byte
budgets have one configuration owner. The `/v1` base is required
by the pinned helper's slash-sensitive direct-DeepSeek branch. `deepseek-flash`
is DeepSeek's current V4.1 Flash alias, not immutable version identity.
`TEXT_MODEL_REASONING=disabled` preserves the helper's native
`thinking: {"type":"disabled"}` payload; it is not an upstream enum.

Browser Harness remains the only browser-configuration owner. The runner and
preflight first load its native workspace `.env`, then one shared runtime owner
installs missing selected-model defaults and rejects helper-tuple conflicts.
Conflicts stop before daemon checks or browser startup. Explicit provisioning may
start the natively configured daemon. Preflight and tool runs require that named
daemon to be healthy and already running. Runs reject currently resolved cloud,
remote WebSocket, `BU_AUTOSPAWN`, and non-loopback CDP settings; they never
recover or replace the daemon through upstream `ensure_daemon()`.

These checks do not attest that an already-running same-named `cdp` daemon still
uses the current endpoint, profile, or local-vs-remote settings. Browser Harness
consumes those settings when the daemon starts, and its reported `cdp` mode does
not identify the live endpoint. Skipping the required stop/restart/reprovision
step after a settings change can therefore route a run to a stale remote or
otherwise wrong browser.

The helper key is checked only when upstream selects `TYPE_TEXT`, so click-only
tasks work without it. Native missing-key, provider, and value-validation errors
return sanitized available state and never invent replacement text or switch to
Pi's active model. Run results include the configured helper tuple but no guessed
helper-availability field. Preflight separately reports whether the resolved key
is nonblank; that is configuration feedback, not provider or credential validity.

## Pi tool

Load the project extension in a fresh Pi session:

```bash
pi -e ./config/pi/extensions/rlcd-brwsr.ts \
  -t rlcd_brwsr_list_tabs,rlcd_brwsr_run
```

The registered interfaces are:

```ts
rlcd_brwsr_list_tabs({});

rlcd_brwsr_run({
  url?: string;
  targetId?: string;
  goal: string;
  maxSeconds?: number; // default 30, maximum 120
  retainTab?: boolean;
});
```

Tab discovery returns bounded eligible HTTP(S) pages and exact `about:blank`
pages from the configured existing Harness connection. It is read-only: it does
not navigate, activate a foreground tab, construct an Agent or call a model.
Entries are sorted by exact target ID. Titles and URLs are untrusted and can be
explicitly clipped; IDs that cannot be returned exactly are omitted. An empty
success is distinct from a bounded error. Discovery establishes technical
eligibility only and does not authorize a run.

A URL without a target ID preserves created-tab behavior. A target ID without a
URL continues the exact borrowed tab's current HTTP(S) state without startup
navigation. Supplying both explicitly navigates that borrowed tab before the
goal; an exact `about:blank` target is usable only in this mode. At least one of
URL or target ID is required. Target IDs are opaque, nonblank, at most 512 UTF-8
bytes and are never trimmed or case-folded. Any supplied `retainTab`, including
`false`, is invalid with `targetId`.

There is no `maxActions`, alias, or replacement per-call step setting. Upstream's
unchanged limits remain 60 history entries (including waits and scrolls) and 120
decisions. They are not HTTP-attempt or spend caps.

`maxSeconds` is a coarse parent stop deadline measured from before startup. For
a valid request, one spawn-first supervisor owns the child, original absolute
deadline, first observed stop, bounded pipes, escalation and reap; there is no
separate asynchronous file-access stage. Pi sends `SIGTERM`, allows a fixed
1.5-second cooperative cleanup grace, then sends `SIGKILL` only if process exit
has not been observed. It does not guarantee that an action cannot cross the
deadline. A no-PID launch failure stays a pre-start setup error. If Python starts
but its script is absent, the result is instead a reaped non-clean exit with
unknown execution and task-tab cleanup. The process is reported reaped only
after its exit is observed. Pi trusts child execution and cleanup claims only from one
structurally valid terminal envelope followed by an observed zero exit without a
signal. A structurally valid normal completion claim followed by a clean zero
exit wins a late parent stop race when the child did not report a stopped run;
completion still requires independent verification. Interrupted or untrusted
outcomes preserve the parent's first stop. Nonzero, signalled, abrupt,
incomplete, or invalid-terminal exits leave execution and task-tab cleanup
unknown. An exception escaping final projection after request acceptance also
falls back to unknown rather than `invalid_input`. Process exit is not rollback
and the tool does not retry automatically.

For a created tab, `retainTab: true` is honored only after a normal completion
claim with the known task target. Every other handled outcome with a usable
known created target attempts one direct `Target.closeTarget` request. Closure
is `closed` only when its response contains `success: true`.

A borrowed tab is never closed by the wrapper or upstream cleanup. Python owns
its exact flattened attachment, optional navigation, background focus emulation
and idempotent release. It validates the target before attach and repeats current
eligibility through a session-bound page observation before navigation or Agent
construction. Handled completion, error and cancellation attempt focus disable
and exact-session detach independently. Results report those acknowledgements
separately; focus-disable acknowledgement is not proof of original document or
OS focus restoration. A forced child stop can strand attachment and emulation,
which is reported as unknown rather than repaired by a parent fallback. The
shared daemon and unrelated targets are preserved. Scheduling is sequential
inside Pi, not a global browser lock or a lock against the user.

Trusted borrowed results use `cleanup.taskTab: "not_owned"` and report
`cleanup.focusEmulation` as `not_applied`, `disable_acknowledged`, or
`unconfirmed`, plus `cleanup.attachment` as `not_acquired`,
`detach_acknowledged`, or `unconfirmed`. Non-clean, signalled, invalid or
discarded terminal outcomes overwrite all three claims with `unknown` while
retaining parent stop and observed-reap evidence. Requested navigation marks
execution effects uncertain before `Page.navigate`; provider/input races after
admission are likewise not rewritten as pre-start rejection.

Python projects only bounded current page fields, executed-history summaries,
configured models, available upstream-recorded usage, known target, cleanup, a
sanitized primary diagnostic, and optional bounded reporting metadata. Full
snapshots, raw prompts/responses, child stderr, and invalid terminal fragments
are not returned. Complete native key and nonempty Bearer values are redacted
before reporting and before any clipping; invalid Unicode and non-finite numbers
are normalized. A present native `usage: null` remains an honest unavailable
value rather than invalidating known execution or cleanup. The result discloses
field/record omissions. If adding supervised process evidence would exceed the
same terminal cap, Pi omits variable diagnostics conservatively while preserving
outcome, cleanup and primary-error identity.

For normal completion claims and native `BLOCKED` outcomes with observations,
the optional reporter sees the sanitized goal, at most 128 bounded source
candidates, and no URL, target ID, diagnostics, model configuration, raw native
request/reply, or usage history. It keeps ordinary blank-delimited short
paragraphs independent, coalesces adjacent short lines in long fragmented
paragraphs into contiguous spans near 128 UTF-8 bytes, and uses bounded
non-overlapping token-aligned fallback slices. Normal under-limit source remains
covered by exact slices; oversized tokens and any source/candidate truncation
mark coverage partial. Each candidate stays within 512 bytes. One named trusted
policy describes direct goal evidence, necessary qualifications, site furniture,
and untrusted candidate data; concise independent Nouls reference that policy
and their exact candidate path. Evidence is copied exactly from the final
visible text; action evidence copies only step, operation, action label, and
page-change from the last six actions. Up to three records survive the unchanged
0.5 policy after identity-based deduplication. Page identity ignores location and
cut flags and only normalizes the observed leading-semicolon/whitespace variant;
it does not strip general punctuation, normalize values, or use semantic
similarity. Missing source/key, invalid response, provider failure, or
cooperative interruption produces an honest deterministic reporting state
without raw-text fallback or changing browser facts.

Model-facing run content contains only `outcome`, `lastObservedLocation`,
`evidence`, `cleanup`, `diagnostic`, `reporting`, and `output`. It excludes full
page text, complete history, model configuration, per-call usage and relevance
scores. Python bounds the pre-report browser projection first; optional evidence,
report metadata and `jev_handoff` usage cannot evict page text, history or native
usage that already fit. Pi `details` ordinarily retains reporting scores, counts
and usage. Under terminal pressure the whole optional reporting block can be
absent; compact content then explicitly reports reporting unavailable and an
omission rather than claiming complete evidence or zero charges. Discovery
output is unchanged. Available usage records remain incomplete; a validated
reporting call adds source `jev_handoff` when it fits, while failed or retried
call usage stays unknown. The tool deliberately returns no Pi top-level `usage`,
so Pi footer and session totals exclude all native calls.

## Local checks

```bash
pnpm fixture # loopback fixture: http://127.0.0.1:43113
pnpm check
uv lock --check
git diff --check
```

The deterministic suite includes registered-tool cases that cross the real
Python runner and pinned `Agent.run()`/native helper while substituting external
Browser Harness CDP and provider responses. It now checks goal-dependent source
selection, fragmented-source coverage and request shape, shared policy
references, conservative whole-record identities, distant qualifications,
scroll-action evidence, report failure/interruption, strict response/envelope
validation, privacy on both surfaces, and honest bounds. Separate process/outcome
and direct projection checks retain the earlier lifecycle guarantees.

A corrected isolated Pi-TUI slash-command check invoked the production registered
run definition with synthetic browser and provider boundaries. Its 821-byte
content retained exactly 63 bytes of requested amount/exclusion evidence with no
repeated filler, versus 2,362-byte details. It did not touch Chrome, invoke an
outer model, or make a live provider request. Seven production-shaped sanitized
reconstructions ran through the verified old and corrected interpreters without
browser actions: 8,117 old-visible bytes versus 5,697 new-content bytes (29.8%
smaller), while new-details versus new-content was 52.8% smaller. The five
recorded-task inputs are shortened reconstructions, not original snapshots, and
the two synthetic goals use the same document. These are JSON-surface byte
comparisons, not end-to-end performance measurements. Historical real-Chrome
and live-provider evidence remains tied to its recorded heads. A later live
reporting-only replay of seven sanitized cases validated API operation and
retained expected evidence in six, including distinct answers to two goals over
one document and a distant qualification. One shortened Google example was
filtered out. Selection took 175-514 ms per case; these are not browser-task or
end-to-end timings. General-web reliability and complete billing remain
unestablished.
