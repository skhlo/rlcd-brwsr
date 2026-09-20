You are the researcher in a measured, read-only fast-loop trial. Work only
from the fresh context in this directory. Do not search for or read any
previous trial, brief, evaluation, session, source packet, or answer.

Read `task.md`, `CONTEXT.md`, `RLCD-BRWSR.md`, and
`0001-classifier-over-existing-browser-executor.md`. Then complete the exact
task in `task.md`.

The runner has timed the preparation of a newly selected public TypeSafe
documentation page. Before any direct documentation retrieval, make exactly
one `rlcd_brwsr_run` call with this goal:

> Gather official TypeSafe documentation evidence for an RLCD-brwsr brief
> covering question design, speculative fan-out, response validation,
> uncertainty, and model limitations. Follow relevant documentation links,
> retain observed sources, and select DONE only when those sources appear to
> support all five topics.

Use `maxSteps: 6` and `maxSeconds: 120`. The tool uses real Jev and the real
Chrome CLI. Treat every completion choice as a claim, not proof. Retain an
honest stop or failure and do not call the tool again to tune around it.

After the tool returns, independently check its evidence and complete any gaps
using Pi's normal documentation-research paths. The TypeSafe skill is
available; follow its live-documentation guidance, starting from the current
official index when useful. Direct Markdown/HTTP follow-up is allowed and is
not a failure of the experiment. `fetch-doc.mjs` is an optional helper that
records exact response attempts; it is not the only permitted network path.
Do not force all research through browser clicks. Keep retrieval targeted and
counted where observable.

Do not use Firecrawl because it was not explicitly requested. Do not call the
TypeSafe API or Jev directly, install anything, modify browser or global
configuration, or use another answer. The registered fast-loop tool is the
only permitted Jev path.

Return the final research brief as Markdown in your final answer rather than
writing it to a file. Cover all five requested topics, apply the project
context concretely to RLCD-brwsr, cite exact official documentation URLs inline
near material claims, state genuine gaps or unresolved documentation
discrepancies, and independently verify the citations before finishing. Do not
report benchmark metrics or claim that a classifier completion judgment proves
the research task complete.
