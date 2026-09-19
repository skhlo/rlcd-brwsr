# Normal-Pi TypeSafe research baseline

This directory owns the issue #2 baseline for the fixed task in [`task.md`](task.md).
It measures a genuine Pi research pass and a separate Pi evaluation pass. It does
not measure Jev or force documentation research through a browser.

## Frozen inputs

The task, shared repository context and
[`evaluation-checklist.md`](evaluation-checklist.md) are fixed before the measured
trials. `run-trial.mjs` copies only those inputs into an isolated temporary
workspace and records SHA-256 hashes in each trial's `metrics.json`. The
researcher does not receive the checklist, an earlier answer or another trial's
sources. The evaluator receives the resulting brief and checklist but not the
research transcript.

Both phases use Pi's normal main model and built-in read/shell tools. They start
as separate `--no-session` contexts. Project/global context discovery,
extensions, skills and prompt templates are disabled so the recorded files are
the complete shared task context; this does not replace Pi's default system
prompt or host model authentication. The allowed shell path can call the small
`fetch-doc.mjs` helper, which permits only `docs.typesafe.ai` and records one
entry per HTTP response or failed attempt. Browser tools are not prohibited as a
research conclusion; they are simply unnecessary and not enabled for this
primary direct-documentation baseline.

Raw Pi event streams and session files are not retained because they can contain
reasoning text and private host paths. `summarize-events.mjs` extracts the final
answer, model identity, provider-reported token fields, turns and observable tool
counts before the temporary workspace is removed. The committed artifacts keep
the research brief, independent evaluation, retrieval URL/timestamp/status/hash
records and summarized measurements.

## Cold and warm observations

These are operational labels, not claims that every upstream cache was purged:

- **Cold** - the first measured execution after the protocol is frozen, in fresh
  research and evaluation contexts, before any measured run of this prompt.
- **Warm** - the immediately subsequent matched execution on the same host and
  model settings, again in fresh isolated contexts. It may benefit from ordinary
  provider or network infrastructure caches, but it receives no prior answer or
  fetched page content.

Each documentation retrieval is a fresh Node process; it has no application
response cache. DNS, TLS, CDN and provider caches are not controlled. Pi's
provider-reported cache-read/cache-write tokens and the host's
`PI_CACHE_RETENTION` setting are recorded. A “cold” observation can therefore
still report cache-read tokens and must not be relabeled.

Issue #2 intentionally retains one cold and one warm observation to keep model
use proportionate. Each condition has `n=1`, so its observed value is also its
median. Future matched comparisons should use equal run counts. For larger
samples, sort each condition's successful observations by a metric and use the
middle value for odd `n` or the arithmetic mean of the two middle values for even
`n`; do not discard failed outcomes from the verified-outcome count.

## Run procedure

From the repository root, confirm the intended branch/commit and a clean trial
output path, then run:

```sh
node --test experiments/typesafe-research-baseline/trial-tools.test.mjs

node experiments/typesafe-research-baseline/run-trial.mjs \
  --condition cold \
  --output experiments/typesafe-research-baseline/runs/<date>-cold-1

node experiments/typesafe-research-baseline/run-trial.mjs \
  --condition warm \
  --output experiments/typesafe-research-baseline/runs/<date>-warm-1
```

The runner reads `PI_PROVIDER`, `PI_MODEL` and `PI_REASONING_LEVEL` from the
calling Pi shell environment and passes them explicitly to both child contexts.
Flags with the same names are available for a deliberate matched rerun. It also
records Pi and Node versions without changing host configuration. The runner
removes `TYPESAFE_API_KEY` from child environments and the protocol forbids Jev
inference; no TypeSafe credential or inference is needed.

Run cold before warm and do not open a retained brief in the warm research
context. Compare `inputSha256` and the retrieval URL/content hashes before using
these observations against a later fast-loop trial. Rerun the affected baseline
when task inputs or material source content drift.

## Measurement boundaries

`wallTimeMs` starts before isolated-workspace preparation and ends after the
independent evaluator returns. It includes Pi startup, source gathering,
synthesis, brief handoff, citation re-fetching and evaluation. Phase times split
research from verification. Main-model turns are completed assistant messages;
tokens are the sum of provider-reported input, output, cache-read, cache-write
and total fields. Direct HTTP requests are retained helper attempts, including
redirect responses. Browser commands are observable `chrome-devtools` tool or
executable matches in captured tool calls.

The event stream cannot distinguish recovery reasoning from ordinary work.
`recoveryWork` is therefore unavailable rather than guessed; failed tool calls
are counted separately. The runner awaits both Pi children and starts no daemon.
No browser tool is enabled, so this baseline retains no browser page. These
limits are repeated in each trial's metrics and in [`RESULTS.md`](RESULTS.md).
