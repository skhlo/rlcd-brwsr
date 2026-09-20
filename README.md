# RLCD-brwsr

Fast browser execution for Pi using Jev classification and Chrome DevTools CLI.

The research fast loop is experimental. It supports code-owned clicks, exact
quoted text, native observed options, fixed page scrolling, bounded waits and
pinned Jev HTTP inference. Start with the [v0.1 plan](docs/RLCD-BRWSR.md), use the terms in
[CONTEXT.md](CONTEXT.md), and preserve the decisions under
[docs/adr/](docs/adr/). The extension is loaded explicitly with `-e`; it is not
installed globally or included in the baseline.

The retained normal-Pi TypeSafe research baseline is under
[`experiments/typesafe-research-baseline/`](experiments/typesafe-research-baseline/).
The fixtures, live Jev checks and research comparison are under
[`experiments/research-fast-loop/`](experiments/research-fast-loop/).

The initial research evaluation is a
[**NO-GO for rollout**](experiments/research-fast-loop/RESEARCH-COMPARISON.md):
public TypeSafe documentation exceeded the classifier-state limit before
inference. A small browser-only fixture worked, but does not establish a research
improvement. The report preserves failed runs and states the measurement limits.
