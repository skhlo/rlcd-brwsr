# Two-page fast-loop fixture

This fixture demonstrates issue #3 without a TypeSafe API key or paid inference.

1. Start `node experiments/research-fast-loop/serve-fixture.mjs`.
2. Open its loopback `index.html` in the Chrome DevTools CLI browser and select that page.
3. Explicitly load `experiments/research-fast-loop/fake-jev-extension.ts` with Pi's `-e` flag.
4. Call `rlcd_brwsr_run` with a goal that asks for both fixture sources.

The injected responder is Jev-shaped but deterministic. It selects the offered link whose label is
`Continue to uncertainty evidence`, then returns `DONE` on the destination page. It makes no network
or model requests. The main extension remains at `config/pi/extensions/rlcd-brwsr.ts`; this file is
only the offline host-check adapter and is not installed globally.

Pi schedules this tool sequentially, but that is not a page lock. Another Chrome client or a person
can still change the selected page during a run.

For the lifecycle check, select `lifecycle.html` and invoke the same registered tool. The fake
classifier selects `Open slow documentation`; `/slow` delays its response for 60 seconds. Use a
one-second tool budget for timeout, or a longer budget and cancel the active tool in Pi for
cancellation. This path uses the production `createChromeCliExecutor(pi.exec)` adapter inside the
real runner. Compare `pgrep -lf chrome-devtools` before dispatch, while the tool runs, and after its
result to identify the task-created CLI client without stopping the pre-existing executor daemon.
List pages before and after, close only the task-created fixture page, and preserve unrelated pages.
The removed `check-cli-lifecycle.mjs` spawn surrogate is not valid evidence for runner cleanup.
