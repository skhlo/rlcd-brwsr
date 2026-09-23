# Thin Python wrapper feasibility

> **Historical evidence, not implementation acceptance.** The source-scout sections below were produced without runtime tests, browser/model calls, or secret/configuration reads. Their local repository line references describe recovered commit `dde01a46dba112dbf9d002aeb2ebe2626363c034`; installed-source references identify the pinned dependencies. Later mechanical results are separately labelled at the end. The replacement wrapper was implemented afterward; its current status is owned by `RLCD-BRWSR.md`, not established by this note.

## Bottom line

The pinned `Agent.run()` can own the complete browser loop and the pinned native OpenAI-compatible helper can own generated field text. A substantially smaller wrapper is feasible if its contract becomes less ambitious:

- Python is the only owner of the `Agent`, browser state, upstream snapshots, history, model/helper evidence, and normal cleanup decision.
- Pi validates input, starts one fixed Python subprocess, requests cancellation or timeout, enforces a hard process bound, and displays one bounded Python result.
- The wrapper does **not** promise strict “no dispatch after deadline,” mutation certainty after interruption, partial progress after a hard kill, target ownership during incomplete construction, or confirmed closure merely because `Agent.close()` returned.
- `maxActions` cannot honestly retain its current “mutations only; waits separate” meaning when implemented over `Agent.run()`. The smallest source-aligned budget is an upstream **step** budget based on `len(state["history"])`; it includes `wait`, scroll, click, select, and fill.

At the time of this scout, the branch still contained the larger command-level Python/TypeScript protocol and Pi-native Luna callback described by the historical ADR-0002. The later rewrite replaced it; this note remains the pre-implementation evidence record.

## What upstream can own

### Construction, observation, decisions, execution, and state

`Agent(url, goals, *, record_dir=None, screenshots=False)` strips a string goal (or joins an iterable), rejects an empty task, constructs its own `Browser`, performs the initial observation, and only then creates `state`. Its state contains the current page, status, full action history, decisions, text-helper calls, and timing. `snapshot()` returns that state without the browser object and adds the current indexed elements. [Pinned `agent.py` L12-L50](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/agent.py#L12-L50) (local: `.venv/lib/python3.12/site-packages/jev_ultrafast/agent.py:12-50`).

`run()` is a synchronous generator with no parameters and no terminal return object. It repeatedly yields `command("tick")` snapshots until status is `done` or `blocked`. A tick performs prediction and action as one call; it catches `StalePage`, re-observes, and yields the refreshed snapshot. A `DONE` or `BLOCKED` decision is freshness-checked and appears in the yielded terminal snapshot. [Pinned `agent.py` L52-L100, L163-L174](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/agent.py#L52-L100) (local: `agent.py:52-100,163-174`).

For a normal action, upstream:

1. resolves the selected action from the observed candidates;
2. performs pre-helper freshness checking for fills;
3. builds field context and calls the native helper only for fills;
4. performs another freshness check immediately before browser input;
5. executes through Browser Harness;
6. appends history after `Browser.act()` returns but before post-action observation; and
7. blocks after three unchanged, non-wait actions.

These behaviors are in [pinned `agent.py` L101-L158](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/agent.py#L101-L158) (local: `agent.py:101-158`). Candidate construction and TypeSafe response validation also stay upstream: model output must select an offered operation/target, with complete finite probability maps, before an observed action ID is resolved. [Pinned `model.py` L30-L78, L81-L148](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/model.py#L30-L148) (local: `model.py:30-148`).

Browser execution remains code-owned. Click/select targets must be observed integer node IDs; freshness, connected/visible/enabled/read-only, viewport, and hit-test checks happen before input. Fill uses select-all followed by `Input.insertText`. [Pinned `browser.py` L88-L107, L120-L186](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/browser.py#L88-L186) (local: `browser.py:88-186`). This inspection does not retest the private extractor.

### Native limits and waits

The only native run limits are constants and state checks, not `Agent.run()` arguments:

- `MAX_STEPS = 60`; `history` is capped at 60 entries.
- prediction is capped at `MAX_STEPS * 2`, or 120 model calls;
- the 60-action check occurs **after** the next prediction and before its action;
- there is no native wall deadline or cancellation token.

Sources: [pinned `questions.py` L21-L26](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/questions.py#L21-L26) and [pinned `agent.py` L65-L104](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/agent.py#L65-L104) (local: `questions.py:21-26`; `agent.py:65-104`).

Every observation adds a `wait` candidate. A wait sleeps for 0.1 seconds, calls the normal browser-operation path, and is appended to `history`. It is exempt only from the three-unchanged-actions blocker. Scrolls are also ordinary history entries. [Pinned `snapshot.js` L92-L106](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/snapshot.js#L92-L106), [pinned `browser.py` L100-L107](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/browser.py#L100-L107), and [pinned `agent.py` L120-L158](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/agent.py#L120-L158) (local: `snapshot.js:92-106`; `browser.py:100-107`; `agent.py:120-158`). Therefore the current plan statement that action budget counts mutations while waits are separate (`docs/RLCD-BRWSR.md:210-217`) does not map directly to `Agent.run()`.

A wrapper can stop requesting the next generator item once `len(history)` reaches a lower configured limit. That enforces a lower **successful upstream-step** ceiling without splitting predict from act, but the ceiling includes waits and scrolls. Stale retries that yield without a history append do not consume it; they still consume model-call budget.

### Native OpenAI-compatible text helper

No callback or Pi OAuth integration is needed. `field_text()` directly owns provider configuration, prompt transport, response parsing, value validation, latency, and provider-reported usage:

- required: `TEXT_MODEL_API_KEY` (checked only when a fill is selected);
- defaults: `TEXT_MODEL_BASE_URL=https://api.deepseek.com/v1` and `TEXT_MODEL=deepseek-chat`;
- request: `POST {base}/chat/completions`, Bearer key, `max_tokens: 1024`, JSON-object response format, exact upstream system prompt, and JSON-serialized field context;
- reasoning: DeepSeek base gets `thinking: disabled`; other bases get `reasoning.effort: low`; `TEXT_MODEL_REASONING=none` instead emits `reasoning.enabled: false`;
- context: original goal, field label/role/value, page title, first 6,000 page-text characters, and last six action/text pairs;
- accepted value: parsed JSON with exactly one `text` key whose value is a nonblank string of at most 2,000 Python characters;
- returned evidence: configured model name, measured latency, and response `usage` or `{}`.

Sources: [pinned `model.py` L151-L198](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/model.py#L151-L198) and [pinned helper prompt, `questions.py` L21-L24](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/questions.py#L21-L24) (local: `model.py:151-198`; `questions.py:21-24`).

The shared `httpx.Client` has a 25-second timeout. `post_json()` retries HTTP 429, 529, and 503 up to two times after 0.5- and 1-second sleeps. Other HTTP errors become fixed `RuntimeError`s. Response JSON decoding and unexpected response shapes can propagate their native exceptions. [Pinned `model.py` L12-L27](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/model.py#L12-L27) (local: `model.py:12-27`). The helper does not expose attempt count, retry count, cost, or provider response-model identity. Its recorded `model` is the configured request model. Usage is opaque provider data, not a normalized or independently verified accounting record.

Only supplying the future key selects the DeepSeek defaults. A different OpenAI-compatible provider requires the base URL and model too. The reasoning fields are implementation-specific payload additions; compatibility with a future provider is an **untested hypothesis**, not established by “OpenAI-compatible.”

## Errors and partial state

Source inspection supports only these claims:

- If the initial `observe()` fails after `Browser` construction completed, `Agent.__init__` calls `browser.close()` and re-raises. [Pinned `agent.py` L19-L26](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/agent.py#L19-L26).
- If `Browser.__init__` fails after `Target.createTarget` but before returning, the caller has no `Agent` or `Browser` handle. The constructor has no injected browser/factory/ownership callback and no enclosing cleanup. [Pinned `browser.py` L20-L33](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/browser.py#L20-L33). Cleanup must be reported `unknown` for that interval unless a new pinned hook is added.
- A successful helper result is cached before `Browser.act()`. If the subsequent freshness check raises `StalePage`, the next identical context can reuse the cached value without another helper call. [Pinned `agent.py` L106-L118](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/agent.py#L106-L118).
- `Browser.act()` can issue more than one CDP input call before returning. An exception does not prove that no mutation began. History is appended only after `Browser.act()` returns. Conversely, once it returns, history is appended before post-action observation, so a later observation failure can leave a known executed history entry with `page_changed: None`. [Pinned `browser.py` L135-L186](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/browser.py#L135-L186), [pinned `agent.py` L116-L148](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/agent.py#L116-L148).
- `run()` does not catch general exceptions. If construction completed, Python can conservatively project the then-current `agent.state` in its exception handler. If the process is hard-killed, no final projection or cleanup report is available.

These facts support a single conservative `error` result with available last state and an `execution: unknown` marker where input may have begun. They do not support detailed phase certainty after abrupt interruption.

## Browser Harness setup and hidden startup behavior

The lock is reproducible: Python is exactly 3.12, Jev is the Git commit in `pyproject.toml:1-9` / `uv.lock:147-182`, and Browser Harness is `0.1.13` in `uv.lock:18-32`. The installed Browser Harness files inspected here hash-identically to tag `v0.1.13`, commit `c24e5072ee66f8499bacd663f4f4bcb089bc4492`.

Browser Harness loads two possible `.env` files at import: a package-relative location and its agent workspace. Values use `os.environ.setdefault`, so existing process environment wins and the first loaded file wins over the second. The default workspace is `~/.config/browser-harness/agent-workspace`, created if absent; `BH_AGENT_WORKSPACE` overrides it. `BU_NAME` is captured into module constants at import, defaulting to `default`. [Harness `admin.py` L108-L126](https://github.com/browser-use/browser-harness/blob/c24e5072ee66f8499bacd663f4f4bcb089bc4492/src/browser_harness/admin.py#L108-L126), [Harness `helpers.py` L14-L39](https://github.com/browser-use/browser-harness/blob/c24e5072ee66f8499bacd663f4f4bcb089bc4492/src/browser_harness/helpers.py#L14-L39), and [Harness `paths.py` L9-L49](https://github.com/browser-use/browser-harness/blob/c24e5072ee66f8499bacd663f4f4bcb089bc4492/src/browser_harness/paths.py#L9-L49) (local: corresponding `.venv/.../browser_harness/` files and lines). Configuration must therefore be present before importing Jev/Browser Harness. The current one-workspace-`.env` direction is feasible at this pin, but its use by Jev is an import-order side effect rather than a Jev dotenv API.

Direct `Agent` use has hidden startup behavior: `Browser.__init__` calls the `ensure_daemon` symbol imported into `jev_ultrafast.browser`. Native `ensure_daemon()` can health-check and replace a stale daemon, spawn a daemon, wait indefinitely for a local Chrome approval popup under default settings, launch Chrome, and open `chrome://inspect`. [Pinned `browser.py` L9-L23](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/browser.py#L9-L23); [Harness `admin.py` L525-L610](https://github.com/browser-use/browser-harness/blob/c24e5072ee66f8499bacd663f4f4bcb089bc4492/src/browser_harness/admin.py#L525-L610), [L650-L705](https://github.com/browser-use/browser-harness/blob/c24e5072ee66f8499bacd663f4f4bcb089bc4492/src/browser_harness/admin.py#L650-L705) (local: `admin.py:525-705`).

`BH_REQUIRE_EXISTING_DAEMON=1` is checked by the Browser Harness **CLI runner**, not by direct `Agent` construction. [Harness `run.py` L374-L406](https://github.com/browser-use/browser-harness/blob/c24e5072ee66f8499bacd663f4f4bcb089bc4492/src/browser_harness/run.py#L374-L406) (local: `run.py:374-406`). Therefore one narrow revision-pinned adapter remains indispensable for existing-daemon-only runs: before constructing the agent, bind `jev_ultrafast.browser.ensure_daemon` to `browser_harness.admin.require_existing_daemon`. `require_existing_daemon()` only checks that the selected named daemon answers and that `Target.getTargets` succeeds; it does not spawn or reconnect. [Harness `admin.py` L711-L730](https://github.com/browser-use/browser-harness/blob/c24e5072ee66f8499bacd663f4f4bcb089bc4492/src/browser_harness/admin.py#L711-L730) (local: `admin.py:711-730`).

Existing-daemon health is not the same as local-only policy. Preserving the approved local scope still requires the small mode/config check currently represented by `bridge/runtime_support.py:31-98`: reject cloud mode, `BU_BROWSER_ID`, `BU_CDP_WS`, `BU_AUTOSPAWN`, and non-loopback/non-HTTP `BU_CDP_URL`. Browser Harness itself supports those modes. Also, a named non-cloud daemon creates and owns a dedicated background tab when it starts; each `Agent` then creates a separate task tab. [Harness `daemon.py` L442-L482](https://github.com/browser-use/browser-harness/blob/c24e5072ee66f8499bacd663f4f4bcb089bc4492/src/browser_harness/daemon.py#L442-L482) (local: `daemon.py:442-482`). Provisioning and run-owned cleanup must not confuse those targets.

## Deadlines, cancellation, closure, and retained tabs

`Agent.run()` cannot receive a wall deadline or cancellation token, and predict plus act are inside one tick. A parent deadline can stop or kill the Python process, but it cannot prove that an action was not dispatched at the boundary. A small Python signal handler can raise a wrapper exception so a `finally` block attempts close; this remains cooperative and can fail during blocking provider/CDP work. A fixed grace followed by hard kill bounds process lifetime, not rollback or cleanup. Incomplete construction and hard kill remain `cleanup: unknown` and `execution: unknown` where applicable.

`Agent.close()` returns `None`. `Browser.close()` sends `Target.closeTarget`, ignores its result, and then clears `self.target`; a returned `{success: false}` is therefore not acknowledged as failure. [Pinned `agent.py` L167-L174](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/agent.py#L167-L174), [pinned `browser.py` L109-L112](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/browser.py#L109-L112). The minimum honest status is `close_attempted_unconfirmed`, not `closed`. If confirmed closure is required, one direct pinned adapter must retain the target ID, call `cdp("Target.closeTarget", targetId=...)`, and require `response["success"] is True`; that adapter is optional only if the product drops the confirmation promise.

Normal completion-only retention is source-feasible: after `run()` yields `status == "done"`, Python can deliberately skip `close()` and exit, leaving the Browser Harness daemon and target alive. Returning its identifier requires reading the implementation attribute `agent.browser.target`; there is no public ownership accessor. This feasibility was **not run-tested here**. Retention cannot be guaranteed when initialization, interruption, or hard kill prevents the normal decision point.

## Source-aligned interface option

This was the source scout's option before synthesis, not the selected proposal.
The user subsequently confirmed dropping `maxActions`; the
[owning plan](RLCD-BRWSR.md) omits a per-call step knob. The sketch below only shows how an optional
step budget could match upstream semantics; it is not another authoritative
interface or a claim that it has been tested.

One possible source-aligned interface would be:

```text
run(url, goal, maxSteps?, maxSeconds?, retainTab?)
```

- `url`, `goal`: bounded and validated before spawn; initial scope remains benign, unauthenticated, and non-booking.
- `maxSteps`: lower than the native 60-step ceiling; counts successful upstream history entries, including WAIT and scroll. If the public name must remain `maxActions`, document this exact meaning rather than the current mutations-only meaning.
- `maxSeconds`: the time at which Pi requests stop, measured from before spawn. A separate fixed shutdown grace bounds eventual process lifetime. It is not a guarantee that no boundary action started.
- `retainTab`: honored only after an upstream `done` claim; otherwise Python attempts normal close.

One bounded terminal result is sufficient:

```text
status: done_claim | blocked | step_budget | time_budget | cancelled | error
completionClaim: boolean
lastObservation: bounded {url, title, text} | null
history: bounded suffix of upstream executed history
models: configured Jev/helper IDs plus bounded provider-reported usage when present
execution: unknown on interrupted/failed runs; no extra certainty claim
cleanup: retained | close_attempted_unconfirmed | unknown
targetId: bounded string | null
elapsedMs: parent-observed number
error: bounded sanitized {type, message} | null
```

`DONE` remains a claim requiring independent outer verification. Do not expose full snapshots: decisions include raw answers and request bodies, while page/history/helper data can be large. Python should project and bound the result before stdout; Pi should impose one outer output-size bound without reconstructing browser phases.

The minimum Pi side is input validation, fixed-path spawn, absolute timeout/cancel handling, bounded stdout/stderr collection, process reap, and display. On requested stop with no valid terminal record, Pi should preserve its own first stop (`cancelled` or `time_budget`) and return unknown execution/cleanup rather than inventing a protocol error or Python state.

## Reuse/remove inventory

### Reuse or reduce

- `pyproject.toml`, `uv.lock`: retain exact Python/Jev/Harness pins.
- `config/runtime.json`: retain as the single Jev model pin (`jev-1.13.0`), consumed by Python; ensure Python sets/checks `TYPESAFE_MODEL` before use because upstream otherwise defaults to moving `jev-latest` ([`model.py` L107-L120](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/model.py#L107-L120)).
- `bridge/runtime_support.py`: retain only native config loading, local-mode rejection, pin loading, and existing-daemon health; it can be merged into the thin runner if that produces one clearer owner.
- `bridge/preflight.py`, `bridge/provision_browser.py`, and the three shell entry points: retain explicit setup/preflight behavior, but revise helper reporting for native `TEXT_MODEL_*` configuration. Provisioning may call `ensure_daemon`; runs may not.
- `config/pi/extensions/rlcd-brwsr.ts`: retain registration, input validation, subprocess lifecycle, one output bound, and rendering; rewrite rather than patch the current protocol engine.
- Browser fixtures and external verification helpers: the click and field pages remain useful. Deterministic Jev/native-helper seams can be adapted while keeping the real pinned `Agent` and Harness in acceptance.
- `test/production-load.test.ts`: retain inert-load coverage. Replace the broad protocol suite with contract tests for the thin subprocess boundary, native step semantics, terminal bounding, stop precedence, and unknown-on-kill outcomes.

### Remove with the larger design

- `bridge/rlcd_brwsr_bridge.py` command-level `predict`/`act` loop, Pi helper interception, helper request/reply protocol, phase records, dispatch reconciliation, protocol fitting, and targeted cleanup mode.
- TypeScript model-registry/Luna/OAuth helper completion, helper reply races, JSONL phase/cardinality validator, TypeScript shadow run state, trace reconciliation, and helper usage merge.
- `fixtures/text-entry/deterministic-helper.ts` and tests specific to Pi-native helper/OAuth relay behavior.
- Tests whose sole contract is the removed progress protocol, fallback-cleanup protocol, or cross-language phase reconstruction. Historical evidence files should remain history, not be described as proof of the new wrapper.

### Indispensable adapters

1. Existing-daemon rebinding of the imported upstream `ensure_daemon` symbol.
2. Local-only mode/config validation after native Browser Harness resolution.
3. Python signal/finally handling for best-effort cooperative close, with unknown results on incomplete construction or hard kill.
4. Bounded Python projection of upstream state/errors and exact Jev model pinning.
5. Private `agent.browser.target` access only if retained-target identity is part of the interface.
6. Direct `Target.closeTarget` response validation only if `closed` confirmation remains a requirement.

Everything else can be upstream-owned or removed.

## R23-R26 implications

The latest gate was cancelled, not passed, and R23-R26 remain open (`artifacts/thin-python-plan/gate-review-log.txt:59-64`; `gate-before-recovery.txt`). They are evidence about the larger current implementation, not instructions to patch it:

- **R23 (late helper reply):** removed with the Pi helper callback. Native helper execution has no cross-process reply race. The replacement must still avoid claiming strict no-dispatch-after-deadline.
- **R24 (shutdown/protocol precedence):** greatly reduced by one input and one terminal result. Pi should own first-stop precedence when the child is stopped before producing a terminal result.
- **R25 (ownership/cleanup disagreement):** removed if there is no trusted terminal-vs-progress cleanup protocol or targeted fallback. Missing terminal means cleanup unknown.
- **R26 (phase transition reconstruction):** removed with TypeScript shadow state. Python reports bounded upstream state on normal/handled exits; abrupt exits remain unknown rather than inferred.

## Source-scout open questions before mechanical probes

This is the historical scout checklist, not the current decision list. The user
has since dropped `maxActions` and selected OpenRouter Ling 3.0 Flash. The
[owning plan](RLCD-BRWSR.md) and [provider note](openrouter-ling-3.0-flash.md) record
those decisions. Live provider behavior was untested at this scout stage; the
[subsequent verification record](thin-python-evidence.md) owns later results.

1. Choose the native helper provider/model; cost is not yet measured. A key alone means native DeepSeek defaults; another provider needs explicit `TEXT_MODEL_BASE_URL` and `TEXT_MODEL`, and its acceptance of upstream reasoning fields must be tested later.
2. Decide whether the public budget can be renamed/redefined as `maxSteps`. Keeping “mutations only, waits separate” requires returning to command-level control and is not the thin `Agent.run()` direction.
3. Decide whether `close_attempted_unconfirmed` is acceptable. Confirmed closure adds the one direct CDP adapter; fallback cleanup after process death adds substantially more machinery.
4. Decide whether partial progress during hard kill is required. The minimum contract returns none and says unknown. Streaming/recovery would reintroduce retained parent state and protocol ordering concerns.
5. Decide whether retained target identity is necessary. Retention itself is source-feasible; exposing the target depends on a private pinned attribute.
6. The native helper, retention path, signal behavior, and proposed reduced interface were not run-tested in this scout. Source evidence supports feasibility, not operational proof.

## Subsequent mechanical evidence

These probes exercised the installed pinned dependency, not a rewritten Pi tool.
Raw scripts, results and censuses are retained locally under
`artifacts/thin-python-plan/`; they are not a committed regression suite.

### Offline: 11 expected-outcome assertions

Four standalone probe scripts exercised the real `Agent.run()`, native choice
and field-value validation, with only the external Browser and HTTP responses
substituted. Synthetic keys and isolated configuration were used; network,
daemon and CDP tripwires did not fire.

- Direct click and valid text entry reached upstream `done`.
- Empty and extra-key helper responses raised the native validation error;
  there was no fake field mutation. Provider usage from those rejected helper
  responses was not retained in `state.text_calls`.
- Native `BLOCKED` returned without a fake action.
- The actual constants, not patched limits, stopped 60 waits or 60 changing
  clicks at the next action attempt, after 61 decisions. Waits therefore consume
  the same native history limit as clicks. The separate stale-case probe reached
  120 decisions with no successful history entry and then raised the native
  model-budget error.
- A SIGTERM handler plus `finally` could call fake close after construction
  completed. SIGTERM during construction left the caller without an Agent
  handle; hard termination skipped final cleanup. The fake target remained
  open in those last two cases. Their assertions passed because they demonstrated
  the limitation, not successful cleanup.

This proves those controlled outcomes with external fakes, not real provider
cancellation or real Chrome cleanup. Script-local durations have different
measurement boundaries and support no performance comparison.

Evidence: `artifacts/thin-python-plan/offline/REPORT.md`, `results.json` and the
four named `*.probe.py` files.

### Real Chrome: two direct-runtime fixture journeys

The click and text-entry probes consumed the unchanged `Agent.run()` generator
using the real Agent, native helper prompt/validation, Browser Harness and the
already-provisioned isolated Chrome. Only Jev/native-helper HTTP replies were
replaced with deterministic fixture data; the accepted existing-daemon startup
hook was rebound. No TypeScript runner, current Python bridge or Pi-Luna relay
was used.

Both fixtures reached upstream `done`. A separate CDP session inspected each
exact task target: the click destination contained `ORBIT-27`, and the text
field contained `Busan` with `FIELD-41` visible. Each exact close returned
`success: true`; that target was subsequently absent and the four-target
baseline was restored. The generator's final `StopIteration.value` was `None`;
this must not be confused with the generator returned by calling `run()`.

These are two fixture observations with synthetic model replies. They do not
establish a replacement Pi tool, real helper compatibility, model quality,
public-site reliability, cancellation guarantees or end-to-end speed. The
reported synthetic usage and measured local durations are not provider billing
or inference-latency measurements. The setup Chrome/Harness were retained; the
probe-owned fixture server exited. A Chrome-managed renderer remained and was
not treated as an independently owned probe process.

Evidence: `artifacts/thin-python-plan/browser/REPORT.md`, the direct Agent probe,
`click.result.json`, `text.result.json`, independent verification and censuses.

### Real Chrome: normal retention after Python exit

A follow-up click-only probe exhausted the same native generator to `done`,
saved the known target and deliberately skipped close. Its Python child then
exited normally and was reaped. Only afterward did a separate parent CDP
session verify the exact target still existed with the destination URL, title
and `ORBIT-27`. Targeted close returned success, the target became absent and
the baseline was restored. The event order and supervisor code establish
exit-before-inspection; wall timestamps tied at millisecond precision and do
not independently establish a finer timing interval.

One earlier probe-harness attempt failed before the Agent child started because
of an incorrect repository-root path. It is retained with an interpretation
note; its generated report's boilerplate and default false values are not
browser observations. The corrected harness produced the one actual retention
journey. This supports normal native-target retention at this pin, not
interrupted retention, new Pi-wrapper behavior or general reliability.

Evidence: `artifacts/thin-python-plan/browser/retention/` contains the successful
report/results, child ownership/exit record, probe script, and the preserved
failed-attempt files plus `attempt-1-interpretation.md`. Provider replies were
synthetic; no live model inference or cost was measured.

### Pi launcher/accounting source check

A follow-up inspection of installed Pi 0.85.1 found that `pi.exec` has no stdin
input option and retains stdout/stderr without a byte cap. Its stop escalation
tests `proc.killed`, which Node defines as signal delivery, not process exit.
That is a source-inspected reason to use a small built-in `spawn` launcher for
this contract; the SDK behavior was not runtime-probed here. See installed
`dist/core/exec.{d.ts,js}`, `dist/utils/child-process.js`, and
[Node's `subprocess.killed` contract](https://nodejs.org/api/child_process.html#subprocesskilled).

Pi's optional tool-level `usage` requires numeric token/cache/cost fields when
present. Upstream-retained raw usage does not necessarily supply those fields.
Pi itself uses model-catalog cost estimates, so estimates are possible; unknown
price/cache data must not be represented as fabricated zeroes. For the initial
proposal, keep available native records in tool details and explicitly disclose
that Pi footer/session totals exclude them unless a justified mapping is added.
Provider selection and whether estimated footer accounting is wanted remain
open; complete billing and failed-call usage are not promised. Sources: installed
Pi 0.85.1 `docs/extensions.md` (nested model usage), `pi-agent-core/dist/types.d.ts`,
`pi-ai/dist/types.d.ts`, `pi-ai/dist/models.js`, and `dist/core/usage-totals.js`.

Detailed source references are retained in
`artifacts/thin-python-plan/pi-launcher-accounting-scout.md`.

## Plan handoff

The implementation and remaining acceptance plan are owned by
[RLCD-BRWSR.md](RLCD-BRWSR.md), not by this evidence note. The direction was
feasible at the tested pin and the thin wrapper was implemented afterward with
local registered-tool tests. Later synthetic TUI/Chrome checks and the bounded
live helper/normal-Pi local fixture are recorded separately in
[thin rewrite verification](thin-python-evidence.md); public-site acceptance
remains pending.
The recovered larger branch has four unresolved static gate findings; recovery
preserved work but did not turn the cancelled gate into a pass.
