# Research fast-loop fixtures

These fixtures demonstrate issues #3 and #4 without a TypeSafe API key or paid inference.

1. Start `node experiments/research-fast-loop/serve-fixture.mjs`.
2. Open and select either loopback fixture with Chrome DevTools CLI:
   - `index.html` for the two-page link and retained-evidence journey;
   - `journey.html` for exact text, a native select, PageDown, PageUp, WAIT and a tab.
3. Explicitly load `experiments/research-fast-loop/fake-jev-extension.ts` with Pi's `-e` flag.
4. Call `rlcd_brwsr_run`. For `journey.html`, include the exact quoted value
   `"Jev fast — café docs"` and use at least seven steps.

The injected responder is Jev-shaped but deterministic. It answers all non-empty speculative target
heads while the runner consumes only the head for the selected operation. It makes no network or
model requests. The main extension remains at `config/pi/extensions/rlcd-brwsr.ts`; this file is only
the offline host-check adapter and is not installed globally.

Native selection uses the option text in the real accessibility snapshot because Chrome DevTools CLI
1.7.0 resolves a `<select>` option by its AX child name before filling the underlying DOM value. A
UID is rechecked against the decision snapshot and the CLI can reject a missing or detached target,
but a surviving UID does not prove that the element still has the same meaning.

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
