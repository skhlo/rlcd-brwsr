You are the researcher in a measured, read-only normal-Pi trial. Work only from
the fresh context in this directory. Do not search for or read any previous
trial, brief, evaluation, session or answer.

Read `task.md`, `CONTEXT.md`, `RLCD-BRWSR.md`, and
`0001-classifier-over-existing-browser-executor.md`. Then complete the exact task
in `task.md`.

Use a normal documentation-research approach. Start with the live TypeSafe index
by running:

    node fetch-doc.mjs https://docs.typesafe.ai/llms.txt

Discover and fetch only the targeted official Markdown pages needed for the
brief. Fetch documentation only with `node fetch-doc.mjs <url>` so retrievals
are measured. Do not use curl, wget, a browser, Firecrawl, another network tool,
or cached page text. Do not call the TypeSafe API or Jev. Do not install anything
or write files.

Return the final research brief as Markdown in your final answer. Cover all five
requested topics, apply the project context concretely to RLCD-brwsr, cite exact
official documentation URLs inline near material claims, and state genuine gaps
or unresolved documentation discrepancies. Do not report benchmark metrics or
claim that a classifier completion judgment proves the research task complete.
