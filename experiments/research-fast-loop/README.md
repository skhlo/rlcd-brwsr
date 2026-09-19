# Research fast-loop fixtures

These fixtures demonstrate issues #3 and #4 without a TypeSafe API key or paid inference.

1. Start `node experiments/research-fast-loop/serve-fixture.mjs`.
2. Open and select either loopback fixture with Chrome DevTools CLI:
   - `index.html` for the two-page link and retained-evidence journey;
   - `journey.html` for exact text, a native select, PageDown, PageUp, WAIT and a tab;
   - `ambiguous-select.html` for duplicate option labels backed by distinct source values; and
   - `adversarial.html` for untrusted instructions alongside relevant documentation and unrelated
     Login and Donate controls.
3. Explicitly load `experiments/research-fast-loop/fake-jev-extension.ts` with Pi's `-e` flag.
4. Call `rlcd_brwsr_run`. For `journey.html`, include the exact quoted value
   `"Jev fast — café docs"` and use at least seven steps.

The injected responder is Jev-shaped but deterministic. It answers all non-empty speculative target
heads while the runner consumes only the head for the selected operation. It makes no network or
model requests. The main extension remains at `config/pi/extensions/rlcd-brwsr.ts`; this file is only
the offline host-check adapter and is not installed globally.

Chrome DevTools CLI 1.7.0 replaces each native option's AX `value` with its displayed name in the
snapshot. Its `fill` implementation resolves that name to the first matching option before reading the
underlying DOM value. RLCD-brwsr therefore uses a unique observed option name as the executable value
and returns `ambiguous_select_option` without classification when one field exposes duplicate names.
It does not interpret an option UID or the rewritten AX `value` as a distinct fill value. A UID is
rechecked against the decision snapshot and the CLI can reject a missing or detached target, but a
surviving UID does not prove that the element still has the same meaning.

The adversarial fixture's fake responder deliberately returns an excluded, unoffered target choice.
The fixture verifies ordinary-code response validation and the absence of a dispatched mutation; it
does not use real Jev and does not establish prompt-injection immunity for Jev or unseen pages.

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
