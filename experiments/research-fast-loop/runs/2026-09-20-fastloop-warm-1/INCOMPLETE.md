# Incomplete warm launch

This directory was created by the first warm command immediately after the
cold trial. The command stopped on its initial `list_pages` check because Chrome
CLI 1.7.0 still considered the just-closed cold task page selected and returned
a text error form instead of a page list.

No new page was prepared, no Pi research or evaluation context started, and no
Jev request or ledger reservation occurred. This is not a measured warm
observation. Its launch, cleanup attempt, and manual recovery timestamps and
command log were not retained, so their duration and command cost are unknown,
not zero. It is retained rather than deleted or presented as a trial.

After the original `about:blank` page was explicitly selected and the cleanup
regression was fixed in `010cb3c39de775a5b16747fbea52b14631a66434`, the first
completed warm observation was retained in
`../2026-09-20-fastloop-warm-1-retry/`. The correction changed only cleanup
after the retry's recorded timing boundary; it did not tune the research policy.
The retry subtotal does not include this failed launch or recovery.
