# RLCD-brwsr

Fast browser execution for Pi using Jev classification and Chrome DevTools CLI.

The first offline CLICK/WAIT fast-loop slice is experimental. Start with the
[v0.1 plan](docs/RLCD-BRWSR.md), use the terms in [CONTEXT.md](CONTEXT.md), and
preserve the decisions under [docs/adr/](docs/adr/). The extension is loaded
explicitly with `-e`; it is not installed globally or included in the baseline.

The retained normal-Pi TypeSafe research baseline is under
[`experiments/typesafe-research-baseline/`](experiments/typesafe-research-baseline/).
The two-page fake-classifier fixture and host-check record are under
[`experiments/research-fast-loop/`](experiments/research-fast-loop/).
