# Cleanup observation correction

The cold trial's measured research and evaluation completed at
`2026-09-20T00:42:06.348Z`. Its benchmark wall time ended before cleanup.

After the runner closed task page 9, Chrome CLI 1.7.0 returned its documented
text error form on the first `list_pages` call because the selected page had
just been closed. The original metrics therefore record
`preExistingPagesPreserved: false`, an empty page list, and the parse error. The
pre-existing page had not been deleted. Before another measured trial, a direct
`select_page 1` followed by `list_pages` observed the original `about:blank`
page selected and no task page.

Commit `010cb3c39de775a5b16747fbea52b14631a66434` added a regression test and
changed only post-measurement cleanup: after closing the task page, the runner
explicitly reselects the page that was selected before preparation and then
lists pages. It did not alter the frozen prompt, starting URL, tool,
uncertainty policy, research/evaluation paths, or the cold trial's retained
brief, evaluation, metrics, or outcome.
