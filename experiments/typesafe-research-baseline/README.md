# Normal-Pi TypeSafe research baseline

This directory owns the issue #2 baseline for the fixed task in [`task.md`](task.md).
It measures a genuine Pi research pass and a separate Pi evaluation pass. It does
not measure Jev or force documentation research through a browser.

## Frozen inputs and isolation

The task, shared repository context and
[`evaluation-checklist.md`](evaluation-checklist.md) are fixed before the measured
trials. For every run, `run-trial.mjs` materializes the three shared context files
directly from Git commit `6d7aa3f294e8da64aaa2b2ae5958c846e18472e3`.
It does not copy those files from the working tree. The runner records SHA-256
hashes of all inputs in `metrics.json`; a missing Git object or path fails the
trial.

Research and evaluation each start in a separate `--no-session` Pi context inside
an isolated temporary workspace. The researcher receives the fixed task and
context, but not the checklist, an earlier answer, another trial's sources or its
evaluation. The evaluator receives the resulting brief and fixed checklist, but
not the research transcript.

## Normal research path

The runner leaves Pi's normal extension, skill, prompt-template and tool discovery
enabled. In particular, the TypeSafe skill is available. The prompts allow Pi to
choose direct Markdown/HTTP retrieval or Chrome and do not require browser clicks.
Firecrawl remains excluded because it was not explicitly requested. The runner
removes `TYPESAFE_API_KEY`, and both prompts forbid TypeSafe API and Jev calls.

`fetch-doc.mjs` remains available as optional instrumentation. It permits only
`docs.typesafe.ai` in real trials and retains one record for each HTTP response or
failed attempt, including response-body failures. Pi may instead use another
normal retrieval path. Consequently, the runner reports exact helper attempts but
marks the total direct-HTTP count unknown. It likewise reports observable Chrome
tool calls while marking the total browser-command count unknown rather than
turning an unrestricted path into a false zero.

Raw Pi event streams and sessions are not retained because they can contain
reasoning text and private host paths. `summarize-events.mjs` extracts the final
answer, model identity, provider-reported token fields, turns and observable tool
counts before the temporary workspace is removed. The committed artifacts retain
the brief, independent evaluation, any helper retrieval records and summarized
measurements.

## Cold and warm observations

These are operational labels, not claims that every upstream cache was purged:

- **Cold** - the first measured normal-path execution after the corrected protocol
  is frozen, in fresh research and evaluation contexts.
- **Warm** - the immediately subsequent matched execution on the same host and
  model settings, again in fresh contexts. It may benefit from ordinary provider
  or network infrastructure caches but receives no prior answer or fetched page
  content.

The optional helper has no application response cache. DNS, TLS, CDN, browser and
provider caches are not controlled. Pi's provider-reported cache-read/cache-write
tokens and the host's `PI_CACHE_RETENTION` setting are recorded. A cold observation
can therefore report cache-read tokens and must not be relabeled.

Issue #2 retains one corrected cold and one corrected warm observation to keep
model use proportionate. Each condition has `n=1`, so its observed value is also
its median. Future matched comparisons should use equal run counts. For larger
samples, sort each condition's successful observations by a metric and use the
middle value for odd `n` or the arithmetic mean of the two middle values for even
`n`; do not discard failed outcomes from the verified-outcome count.

The earlier `2026-09-19-cold-1` and `2026-09-19-warm-1` directories are retained
as constrained pilots. They disabled normal Pi resources and forced all network
access through `fetch-doc.mjs`, so they are not accepted baseline observations and
must not be pooled with the corrected runs. See [`RESULTS.md`](RESULTS.md).

## Run procedure

From the repository root, confirm the intended branch/commit and a clean trial
output path, then run cold immediately before warm:

```sh
node --test experiments/typesafe-research-baseline/trial-tools.test.mjs

node experiments/typesafe-research-baseline/run-trial.mjs \
  --condition cold \
  --output experiments/typesafe-research-baseline/runs/<date>-normal-cold-1

node experiments/typesafe-research-baseline/run-trial.mjs \
  --condition warm \
  --output experiments/typesafe-research-baseline/runs/<date>-normal-warm-1
```

The runner reads `PI_PROVIDER`, `PI_MODEL` and `PI_REASONING_LEVEL` from the
calling Pi shell environment and passes them explicitly to each child context.
Flags with the same names are available for a deliberate matched rerun. It also
records Pi and Node versions without changing host configuration. No TypeSafe
credential, paid inference, dependency installation or global configuration
change is needed.

Do not open a retained brief in the warm research context. Compare `inputSha256`
and material source content before using these observations against a later
fast-loop trial. Rerun the affected baseline when task inputs or material sources
drift.

## Measurement boundaries

`wallTimeMs` starts before isolated-workspace preparation and ends after the
independent evaluator returns. It includes Pi startup, source gathering,
synthesis, brief handoff, citation checking and evaluation. Phase times split
research from verification. Main-model turns are completed assistant messages;
tokens are sums of provider-reported fields.

The accepted normal cold observation has no helper retrieval records. It therefore
has no source-level retrieval timestamps or hashes, only trial and phase
timestamps. This is a declared historical acceptance limit: do not infer those
missing source facts from citations or rerun a later response as if it recovered
the original observation.

The event stream cannot distinguish recovery reasoning from ordinary work, so
`recoveryWork` is unavailable and failed tool calls are reported separately.
Awaiting the two direct Pi children does not prove that descendants are gone, so
retained baseline-owned descendants are also unavailable. Normal browser access
means retained page state is unavailable unless separately inspected. The runner
does not inspect or close pre-existing browser state. These limits are repeated in
each corrected trial's metrics and in [`RESULTS.md`](RESULTS.md).
