# Fixed research task

Research how to use TypeSafe for RLCD-brwsr. Cover question design,
speculative fan-out, response validation, uncertainty, and model limitations.
Cite the relevant docs.

## Shared starting context

Every trial starts from a fresh Pi context with identical copies of these files
from repository commit `6d7aa3f294e8da64aaa2b2ae5958c846e18472e3`:

- `CONTEXT.md`
- `docs/RLCD-BRWSR.md`
- `docs/adr/0001-classifier-over-existing-browser-executor.md`

The researcher may use TypeSafe's documentation index, `llms.txt`, and directly
fetched Markdown pages. It is not given an earlier brief, another trial's
retrieved pages, or the evaluation result. It must not call Jev.

The comparison outcome is the independently evaluated brief, not a count of
visited pages or a classifier completion claim.
