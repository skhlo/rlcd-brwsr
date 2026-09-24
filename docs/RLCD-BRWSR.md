# RLCD-brwsr contract

RLCD-brwsr delegates one bounded browser task to the pinned Jev Ultrafast Agent.
The outer agent remains responsible for authorization, consequential-action
judgment, recovery, and independent verification. The initial operating scope is
benign, unauthenticated, and non-booking. Neither the wrapper nor upstream
claims prompt-injection immunity or recognition of every consequential control.

Baseline acceptance, verification status, and raw evidence are owned by
[thin-python-evidence.md](thin-python-evidence.md#compact-handoff).

## Public tools

The extension registers two inert, sequential Pi tools:

```ts
rlcd_brwsr_list_tabs({});

rlcd_brwsr_run({
  url?: string;
  targetId?: string;
  goal: string;
  maxSeconds?: number; // default 30; 1 through 120
  retainTab?: boolean;
});
```

Registration performs no installation, browser/service operation, tab
inspection, or model call. Sequential execution prevents overlap inside one Pi
session; it is not a global browser or user lock.

### Tab discovery

Discovery has a fixed five-second parent deadline and reads the configured,
already-running Browser Harness connection. It returns bounded `page` targets
whose current URL is HTTP(S), plus exact `about:blank` pages. It:

- performs no navigation, foreground selection, Agent construction, or model
  call;
- sorts exact target IDs by UTF-8 byte order;
- returns IDs unchanged or omits them;
- clips titles to 512 UTF-8 bytes and URLs to 2,048 bytes with field labels;
- distinguishes an empty successful list from an error; and
- reports omitted tab records within the 16 KiB terminal bound.

Titles and URLs are untrusted display data. Discovery establishes technical
eligibility, not authorization to act.

### Run input

At least one of `url` or `targetId` is required:

- `url` alone creates a task tab and preserves optional `retainTab` behavior.
- `targetId` alone continues the exact borrowed tab's current HTTP(S) page
  without startup navigation.
- Both values navigate that exact borrowed tab to the HTTP(S) URL before the
  goal. An `about:blank` target is eligible only in this mode.

URLs must be absolute HTTP(S), contain no credentials, and be at most 2,048
characters. Goals are trimmed, nonempty, and at most 24,000 characters. Target
IDs are opaque, nonblank, valid UTF-8 strings of at most 512 bytes; they are
never trimmed, case-folded, shortened, guessed, or matched by title/URL. Any
supplied `retainTab`, including `false`, is invalid with `targetId`. The
serialized child request, including its newline, is capped at 32,768 UTF-8
bytes.

There is no `maxActions`, alias, or per-call step setting. Upstream's pinned
limits remain 60 history entries, including waits and scrolls, and 120
decisions. They are not HTTP-attempt, token, or spend caps.

## Ownership

```text
Pi extension
  -> validate one request and start one fixed project-local Python child
  -> own the absolute deadline, first parent stop, bounded pipes, escalation,
     observed exit, terminal validation, and compact presentation
Python runner
  -> load native configuration and require the existing named Harness daemon
  -> construct the upstream Agent or exact-session borrowed-tab adapter
  -> consume Agent.run(), project bounded state, and perform handled cleanup
Upstream Jev Ultrafast + Browser Harness
  -> own observation, candidates, decisions, field-text generation, freshness,
     browser input, and native run state
Python reporter, after handled cleanup
  -> optionally ask pinned Jev to select exact bounded handoff evidence
Pi extension
  <- retain bounded diagnostic details and show separate compact content
```

Python is the sole owner of the Agent reference, upstream state, target handle,
normal cleanup, result projection, redaction, and reporting request. Pi does not
reconstruct browser phases, shadow history, merge helper replies, or infer
cleanup from target differences. No TypeScript browser executor, Pi-model text
callback, alternate helper backend, parent fallback cleanup, durable progress
journal, or automatic retry exists.

Three revision-pinned integrations remain:

1. The runner rebinds upstream's imported `ensure_daemon` symbol to Harness's
   `require_existing_daemon`, preventing run-time startup/recovery.
2. Created-tab cleanup uses the pinned target handle and one direct
   `Target.closeTarget`; only `{success: true}` confirms closure.
3. Borrowed mode acquires one exact flattened session and temporarily supplies a
   Browser object that reuses upstream observe/fresh/act behavior without normal
   Browser-constructor ownership effects.

Pin changes must revalidate these seams.

## Runtime and configuration

The project-local lock fixes Python 3.12, Jev Ultrafast commit
`1231850a0bf1a0c0341fe408ef1668dbbfdfac46`, and Browser Harness 0.1.13.
`config/runtime.json` is the single owner of:

```text
Jev model                 jev-1.13.0
field-text base           https://api.deepseek.com/v1
field-text model          deepseek-flash
field-text reasoning      disabled
serialized request cap    32,768 UTF-8 bytes
terminal/details cap      16,384 UTF-8 bytes
```

`deepseek-flash` is DeepSeek's current V4.1 Flash alias, not immutable version
identity. The `/v1` form selects the pinned helper's slash-sensitive direct
DeepSeek branch. The readable `disabled` value preserves upstream's native
`thinking: {"type":"disabled"}` payload; it is not an upstream enum.

Browser Harness owns browser configuration through `BU_NAME` and its native
workspace environment. The runner first triggers that native loader, then sets
missing selected model values process-locally and rejects conflicts before
daemon checks or browser startup. `TYPESAFE_API_KEY` authenticates Jev decisions
and optional handoff reporting. `TEXT_MODEL_API_KEY` must be a DeepSeek-issued
key for upstream text entry; click-only tasks do not need it. Preflight's helper availability means only that the resolved key is
nonblank, not that the credential or provider is valid.

Resolved cloud, remote WebSocket, `BU_AUTOSPAWN`, and non-loopback CDP settings
are rejected. Provisioning may invoke Harness's native startup path. Preflight
and runs require the selected daemon to be healthy and already running and
accept only Harness-reported `local` or `cdp` mode.

A same-named running `cdp` daemon is not bound to the current endpoint, profile,
or local/remote selection by these checks. Harness consumes those settings when
it starts, and its reported mode does not identify the live endpoint. After any
browser-setting change, stop the daemon, restart it, and reprovision before
preflight or use. Otherwise a stale daemon may reach a wrong or remote browser.

## Supervision and terminal trust

`maxSeconds` is a coarse parent stop deadline measured from before startup. For
a valid request, one spawn-first supervisor owns the original absolute deadline,
first observed parent stop, stdout/stderr drainage, and process reap. It sends
`SIGTERM`, allows 1.5 seconds for cooperative cleanup, and sends `SIGKILL` only
while exit remains unobserved. It does not guarantee that no browser action
crosses the deadline or that termination rolled back input.

A pre-spawn cancellation/deadline or no-PID launch failure is `not_started`. Once
Python starts, an absent script, nonzero or signalled exit, stdout overflow,
missing/invalid terminal result, or exception escaping final projection leaves
execution and applicable cleanup `unknown`. An unexpected stdout EOF while the
child remains alive is not a stop trigger and proves no lifecycle fact.

Pi trusts child execution and cleanup claims only when exactly one structurally
valid terminal envelope is followed by an observed zero exit without a signal.
The process is `reaped` only after exit is observed. The parent's first
cancellation/deadline wins unless a trusted normal completion claim is followed
by a clean exit and the child did not report a stopped run; that late completion
remains a claim requiring verification. A native budget exception is not
rewritten as Jev `BLOCKED`.

Raw child stderr, invalid terminal fragments, and untrusted child claims are not
returned. If parent process evidence makes an otherwise valid projection exceed
the terminal cap, Pi uses a conservative bounded result that preserves the
parent stop and observed reap while reporting child facts unknown.

## Tab ownership and cleanup

For a created tab, `retainTab: true` is honored only after a normal completion
claim with a known target. Every other handled outcome with a usable created
target attempts one direct close. Cleanup is `closed` only after an acknowledged
success; otherwise it is `unconfirmed` or `unknown`. The shared daemon and
unrelated targets are always retained.

A borrowed tab is never closed by the wrapper or upstream cleanup. Before Agent
construction, Python validates exact target type/current URL, attaches one
flattened session, then repeats eligibility through a session-bound top-level
page observation. Requested navigation crosses the conservative effect boundary
before `Page.navigate`; provider or input races after admission therefore retain
unknown effects.

Handled outcomes independently attempt focus-emulation disable and exact-session
detach. Trusted borrowed results use `taskTab: "not_owned"` and report focus as
`not_applied`, `disable_acknowledged`, or `unconfirmed`, and attachment as
`not_acquired`, `detach_acknowledged`, or `unconfirmed`. Acknowledged focus
disable does not prove restoration of the original document or OS focus. Forced
termination can strand both operations; untrusted exits overwrite all three
claims with `unknown` rather than attempting parent repair.

## Results, evidence, and privacy

Python's diagnostic projection contains only available current page fields, a
bounded history suffix, configured models, upstream-retained usage, known target,
cleanup, one sanitized primary diagnostic, output disclosures, and optional
reporting metadata. It never returns full snapshots, raw model prompts/replies,
unbounded history, raw stderr, or invalid terminal bytes.

Before optional reporting, Python applies these principal limits:

- last observed URL 2,048 bytes, title 512 bytes, and text 4,096 bytes;
- the newest 24 history records, with bounded action/operation/URL fields;
- at most 24 usage records, each bounded to 2,048 bytes of usage data;
- primary diagnostic message 1,024 bytes; and
- at most 32 explicit omission labels.

It fits valid JSON rather than truncating serialized bytes. Page text, then
history, then usage and other variable diagnostics can be omitted in the
disclosed fitting order. Outcome, cleanup, and primary-error identity remain
protected. Opaque target IDs are returned exactly or omitted.

Complete native key values and nonempty bare or `Authorization: Bearer` values
are redacted before clipping or reporting. Invalid Unicode is normalized;
non-finite and JavaScript-unsafe numeric values do not survive as trusted
numbers. Sanitized page data remains untrusted.

### Optional handoff reporting

After handled cleanup, normal completion claims and native `BLOCKED` outcomes
with a page observation may issue one batched request through the pinned Jev
transport. The reporter receives the sanitized goal, a bounded final-visible-page
`judgmentContext`, and allowlisted candidates from that page plus the last six
actions. It receives no browser-location metadata, target ID, primary
diagnostic, model configuration, usage history, or raw native request/reply.

The judgment context is bounded to 24,576 UTF-8 bytes; the pinned observer itself
exposes at most 6,000 characters. It preserves source order, labels, neighbors,
and qualifications for interpretation, but is untrusted and never becomes
returned evidence automatically. The request has at most 128 candidates and a
98,304-byte bound.

Selectable page records are exact contiguous source copies. Short useful
paragraphs remain independent. Long fragmented paragraphs offer individual
nonempty lines; long lines and prose use token-aligned spans near a 128-byte soft
target. One unsplittable token may remain whole up to the 512-byte record cap;
larger tokens are omitted and disclosed. Under candidate pressure, adjacent
spans may coalesce up to that cap to preserve later source without keyword
shortlisting. Source, candidate, action, or request fitting marks coverage
partial even if omitted selectable text remains in `judgmentContext`.

One shared trusted policy limits usefulness to requested answer facts, visible
goal-result evidence, blockers, necessary action evidence, and qualifications.
Topic background, incidental instruction compliance, and generic site furniture
are excluded unless themselves requested or result evidence. Each independent
Noul judges only its offered exact page span or allowlisted action record, using
context only for interpretation. Page identity ignores location/cut flags and
normalizes only a leading semicolon followed by whitespace; signs, currencies,
units, versions, caveats, no-space semicolons, and action steps remain distinct.

Every answer/model/usage field is validated. At most three records at or above
the 0.5 evaluation threshold survive whole-record identity deduplication. Missing
source/key, provider failure, invalid response, or cooperative interruption
produces an explicit deterministic reporting state without raw-text fallback,
invented evidence, or changed browser facts. Reporting shares the parent
deadline and adds no cleanup grace or second stop owner.

Python bounds the browser projection before adding reporting, so evidence,
report metadata, and `jev_handoff` usage cannot evict page text, history, or
native usage that already fit. If the entire optional block cannot fit, details
omit it. Absence reports reporting unavailable; it does not imply no useful
evidence or zero reporting charges.

Pi's model-facing `content` is a separate compact JSON object containing only
`outcome`, `lastObservedLocation`, `evidence`, `cleanup`, `diagnostic`,
`reporting`, and `output`. It excludes full page text, history, model
configuration, per-call usage, and scores. Whole evidence records, then optional
location/report fields, are omitted to fit the same 16 KiB cap; extracted values
and opaque IDs are never shortened. `details` retains the bounded diagnostic
projection. Discovery content and details remain identical.

### Usage accounting

Available usage is only what upstream retained. A native `usage: null` remains
an honest unavailable value. Provider attempts, retries, failed-call usage, and
complete billing can be absent; record count is not request count and missing
usage is not zero. A validated report may add a source-labelled `jev_handoff`
record when space remains. The tool deliberately returns no Pi top-level
`usage`, so Pi footer/session totals exclude all native calls. Rate-derived
billing estimates are outside this contract.

## Verification requirements

Routine local verification is:

```bash
pnpm check
uv lock --check
git diff --check
```

The deterministic registered-tool suite must continue to cross the real Python
runner and pinned Agent/native helper while replacing external Browser/CDP and
provider boundaries. It covers request modes, exact tab identity, lifecycle
trust, cleanup, bounds, privacy, evidence selection, omissions, and both output
surfaces. Browser/lifecycle changes require acceptance on the actual Pi surface;
provider or public-site inference requires a separately authorized finite
allowance. Preserve failed checks as evidence rather than rewriting them as
passes.

Future optimization is justified by observed lost information, avoidable
follow-up, or slowness. Smaller output alone is not success when expected
evidence is lost.
