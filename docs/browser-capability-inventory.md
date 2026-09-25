# Browser capability inventory

Source inventory, 2026-09-24. The question is **which existing code and ideas
from Browser Harness and the Chrome DevTools CLI should enable RLCD-brwsr**.
This is not a selection of a new backend, an implementation plan, or a claim
that adding coordinates fixes [#17](https://github.com/skhlo/rlcd-brwsr/issues/17).

## Sources and current wiring

- **Browser Harness 0.1.13**, commit `c24e5072ee66f8499bacd663f4f4bcb089bc4492`.
  Its helpers and interaction guides are separate: a documented recipe is not
  necessarily an implemented helper. [H-helper] [H-guide]
- **Chrome DevTools CLI 1.7.0**, the `chrome-devtools` executable distributed in
  `chrome-devtools-mcp`, commit `774d78f5eef5e610407a0c92fa6ec5ed74b027e8`.
  This inventory examines the CLI and its underlying tool implementations,
  **not just Chrome DevTools Protocol documentation**. The installed package
  version and public npm release identify this revision. [C-release] [C-cli]
- **Jev Ultrafast**, pinned at `1231850a0bf1a0c0341fe408ef1668dbbfdfac46`.
  Its `Agent.run()` owns observation, candidate construction, model decisions,
  freshness, input and run state. [J-agent] [J-browser] [J-model]

The current Jev browser imports Harness's low-level `cdp` and daemon startup
hook, not its high-level interaction helpers. RLCD replaces that hook with an
existing-daemon check, admits exact borrowed targets and owns the attached
session and its cleanup; the borrowed tab's lifetime stays unowned. Merely
finding a Harness helper does **not** make it available to Jev. The current contract and
ownership decision remain [RLCD-BRWSR.md](RLCD-BRWSR.md) and
[ADR-0003](adr/0003-python-owned-run.md).

The CLI instead has a persistent Node/Puppeteer executor, selected-page state
and daemon of its own. Its implementations are useful prior art. Invoking it
inside the fast loop would be a separate backend/ownership decision, not an
already-approved fallback.

## Inventory

**Keep** means already useful in the current integration. **Compare/adapt**
means a concrete source implementation or pattern worth evaluating, not an
approved change. **Recovery/reference** means useful outside the ordinary
fast-loop path or requiring a broader scope decision.

| Need                                             | Useful prior code or idea                                                                                                                                                                                             | Current Jev/RLCD position                                                                                                                                                        | Reuse assessment                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand content and controls                  | Harness recommends AX roles/names/backend node IDs. CLI `take_snapshot`, `TextSnapshot` and `SnapshotFormatter` provide compact semantic trees with a verbose fallback and iframe inclusion. [H-guide] [C-snapshot]   | Jev derives roles/names from top-level light DOM and collects viewport-intersecting text. It does not consume an AX tree. [J-snapshot]                                           | **Compare/adapt.** Semantic structure may distinguish a heading from a contents link or expose controls the current walk misses. Do not substitute a full AX dump without bounding it.                                                                                      |
| Resolve the intended target                      | CLI `TextSnapshot` associates UIDs with loader/backend-node identity; `McpPage.getElementByUid` resolves a fresh handle or fails explicitly. [C-snapshot] [C-page]                                                    | Jev already keeps code-owned DOM identities, checks freshness, re-measures and hit-tests before input. [J-browser]                                                               | **Keep** those guarantees; **borrow the stale-target failure pattern**, not the CLI's IDs. A UID can survive snapshots and is not a hard per-action freshness guarantee.                                                                                                    |
| Reach and interact with a known element          | CLI click/fill/hover use Puppeteer locators, with target-scoped actionability, viewport entry and stable-box checks. Harness exposes wheel input at caller-chosen coordinates. [C-input] [C-locator] [H-helper]       | Jev rejects off-viewport click targets and scrolls at a fixed point in fixed increments. It does not identify a nested scroll consumer. [J-browser]                              | **Compare/adapt.** Target-aware interaction and container-aware wheel placement are useful ideas. CLI auto-scroll is a precondition for a known target, not a search policy or standalone scroll command. Observation and execution must agree on which targets are usable. |
| Navigate to or within a task                     | Harness `goto_url`, `new_tab` and `wait_for_load`; CLI `new_page` and `navigate_page` support URL, back, forward and reload navigation. [H-helper] [C-pages]                                                          | RLCD admits startup URL navigation on a created or exact borrowed target. Jev navigates within the loop through observed links; history/reload are not selectable operations.    | **Keep** current startup ownership and link actions; use these implementations as **reference** for navigation/readiness behavior. Adding in-loop URL/history operations needs an explicit action/authorization design, not a second tab owner or silent dialog acceptance. |
| Wait for an action's effects                     | CLI `WaitForHelper` watches for navigation, then bounded DOM quiet. Harness has `wait_for_load`, `wait_for_element` and `wait_for_network_idle`. [C-wait] [H-helper]                                                  | Jev uses short post-input settling, special combobox handling, ready-state polling for navigation and a fixed 100 ms wait action. [J-browser]                                    | **Compare/adapt.** Reuse bounded, action-specific settling rather than arbitrary longer sleeps. DOM quiet/network idle are not proof of task completion. Harness network-idle polling drains shared events; it is not safe to transplant without an event owner.            |
| Fill fields and structured controls              | CLI `fillFormElement` dispatches by control type, maps visible select-option names to values, and handles boolean toggles. Harness `fill_input` and `press_key` contain keyboard/event handling. [C-input] [H-helper] | Jev has generated text, native select candidates and generic click/fill. It cannot select Enter, Tab, Escape or arrow-key operations. [J-model] [J-browser]                      | **Compare/adapt.** Control-aware execution and a small observed-context keyboard vocabulary are candidates. Preserve the existing field-text helper, explicit values and freshness. Do not expose arbitrary selectors or scripts as model actions.                          |
| Keep the correct tab and make it visible         | Harness separates `switch_tab` from `activate_tab`; CLI separates `select_page` from `--bringToFront`. [H-helper] [C-pages]                                                                                           | RLCD provides bounded discovery, exact target admission and session cleanup while leaving borrowed tabs unowned. The outer co-browse workflow establishes foreground visibility. | **Keep.** Borrow the selection-versus-visibility distinction. Harness helpers can change shared attached-session state; CLI page IDs are daemon-local, not CDP target IDs. Neither should silently replace RLCD ownership.                                                  |
| Return useful post-action state                  | CLI actions offer `--includeSnapshot`; `McpResponse` combines action messages, changed URL, dialog information and optional fresh snapshots. [C-input] [C-response]                                                   | Jev already observes after actions. RLCD separately preserves bounded diagnostics and a compact handoff.                                                                         | **Keep**, with **reference** value in making changed location and blockers explicit. Avoid adding another observer or reopening handoff-size tuning merely because another format exists.                                                                                   |
| Detect blockers and hand control back            | Harness `page_info` checks pending dialogs before page evaluation; CLI surfaces open dialogs and blocks many actions until handled. [H-helper] [C-page] [C-response]                                                  | Jev has `DONE`/`BLOCKED`, exceptions and budgets, but no selectable dialog operation.                                                                                            | **Compare/adapt detection and handoff**, not automatic acceptance. CLI navigation can report failure in message text, and some CLI paths default to accepting dialogs; those are not RLCD's permission policy.                                                              |
| Inspect layout when semantics are insufficient   | Harness `capture_screenshot`; CLI `take_screenshot` supports a viewport, full page or UID-selected element. Both have targeted DOM-inspection facilities. [H-helper] [C-screenshot] [C-script]                        | Current RLCD runs do not send images to Jev. The earlier geometry probe established an information path, not a practical need for pixel-perfect placement.                       | **Recovery/reference.** Use screenshots or targeted bounds when a real task needs them. Coordinates for every text fragment are not a selected default.                                                                                                                     |
| Handle frames, shadow roots and advanced widgets | Harness interaction guides cover frames, shadow DOM, dropdowns and drag/drop. CLI has frame-aware UID resolution/evaluation plus hover, drag, keys and uploads. [H-interactions] [C-page] [C-script] [C-input]        | Jev's current DOM walk does not traverse iframe or shadow-root descendants. Backend support alone supplies no selectable candidate.                                              | **Recovery/reference.** Adding support requires observation, target identity, freshness, execution and cleanup together. Arbitrary script, upload or dialog operations do not inherit authorization from this inventory.                                                    |

## CLI details that matter when borrowing ideas

The generated CLI surface is narrower than the MCP tool surface. In 1.7.0:

- `wait_for`, `fill_form` and internal `get_tab_id` are explicitly excluded from
  CLI generation. Their underlying code is prior art, not a callable CLI
  capability. There is no dedicated CLI `scroll` command. [C-generate]
- `navigate_page` takes `--url`, rather than the positional URL shown in one
  CLI-guide example. Generated options own the actual signature. [C-options]
- Ordinary commands can implicitly start the CLI daemon. That differs from
  RLCD's existing-daemon-only contract. Selected-page state also differs from
  RLCD's exact-target admission: during the evaluation, `list_pages` did not
  recover after the selected fixture was disposed. The driver needed to select
  a live owned sentinel before cleanup. [C-cli] [C-context]
- The CLI's client timeout is not a per-task cancellation/cleanup protocol;
  daemon `stop` manages the shared executor. It should not replace RLCD's
  bounded Python supervision. [C-client] [C-daemon]

## Proposed comparison order

The [evaluation run plan](browser-capability-run-plan.md) maps every inventory
item to a controlled case, comparison lanes and approval/budget gates. The
[combined evaluation results](browser-capability-run-results.md) record the
initial run, authorized corrections, practical differences and untested
subchecks. They do not constitute live-Jev or full-scope acceptance.

This is a shortlist for choosing capabilities, **not implementation approval**:

1. **Semantic observation and target identity:** compare the compact AX pattern
   with the current DOM candidates on ordinary find/read tasks.
2. **Target-aware actionability and scrolling:** compare known-target viewport
   entry and wheel-consumer selection with current fixed-point scrolling.
3. **Post-action settling:** compare explicit navigation/DOM conditions with
   Jev's current observation timing.
4. **Small interaction gaps:** assess keyboard and control-type handling only
   where existing click/fill/select cannot complete an ordinary task.

Keep exact-session ownership, bounded runs, native field-text generation and
outer-agent verification. Retain screenshots, geometry and diagnostics as
selective capabilities rather than mandatory work on every action. Do not
relax stop guards or adopt a second executor solely on the strength of an
inventory.

Neither Harness nor the DevTools CLI decides that an arbitrary user goal is
complete or safe on our behalf. They supply observations and interaction
mechanics; Jev still needs a suitable offered action/state interface, and the
outer agent retains authorization and verification.

## Evidence and remaining decisions

The inventory's source-review phase used static installed-source inspection and
public, versioned primary sources, without browser operations or application
inference. The later [mechanics evaluation](browser-capability-run-results.md)
and [live Jev–CLI probe](jev-cli-live-probe.md) supply separate, bounded evidence.
Neither establishes general live-site reliability or the cause of #17.

The [geometry research and fixture probe](browser-geometry-research.md) remain
one narrow supporting experiment, not the basis for selecting the entire
observation interface. Detailed source maps are retained locally under
`artifacts/browser-capability-inventory/`; they are not distributed links.

Before adopting a candidate, decide which behavior remains upstream-owned,
which missing capability has a practical task case, and whether the change
fits the current pinned integration or needs a new architectural decision.
Source adaptation also needs its license/dependency obligations checked;
this research does not vendor either project.

[H-helper]: https://github.com/browser-use/browser-harness/blob/c24e5072ee66f8499bacd663f4f4bcb089bc4492/src/browser_harness/helpers.py
[H-guide]: https://github.com/browser-use/browser-harness/blob/c24e5072ee66f8499bacd663f4f4bcb089bc4492/SKILL.md#page-workflow
[H-interactions]: https://github.com/browser-use/browser-harness/tree/c24e5072ee66f8499bacd663f4f4bcb089bc4492/interaction-skills
[J-agent]: https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/agent.py
[J-browser]: https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/browser.py
[J-model]: https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/model.py
[J-snapshot]: https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/snapshot.js
[C-release]: https://registry.npmjs.org/chrome-devtools-mcp/1.7.0
[C-cli]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/774d78f5eef5e610407a0c92fa6ec5ed74b027e8/docs/cli.md
[C-snapshot]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/774d78f5eef5e610407a0c92fa6ec5ed74b027e8/src/TextSnapshot.ts
[C-page]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/774d78f5eef5e610407a0c92fa6ec5ed74b027e8/src/McpPage.ts
[C-input]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/774d78f5eef5e610407a0c92fa6ec5ed74b027e8/src/tools/input.ts
[C-locator]: https://github.com/puppeteer/puppeteer/blob/f8d63c73c3d7c21a8b0f421411e7df8386195436/packages/puppeteer-core/src/api/locators/locators.ts
[C-wait]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/774d78f5eef5e610407a0c92fa6ec5ed74b027e8/src/WaitForHelper.ts
[C-pages]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/774d78f5eef5e610407a0c92fa6ec5ed74b027e8/src/tools/pages.ts
[C-response]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/774d78f5eef5e610407a0c92fa6ec5ed74b027e8/src/McpResponse.ts
[C-screenshot]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/774d78f5eef5e610407a0c92fa6ec5ed74b027e8/src/tools/screenshot.ts
[C-script]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/774d78f5eef5e610407a0c92fa6ec5ed74b027e8/src/tools/script.ts
[C-generate]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/774d78f5eef5e610407a0c92fa6ec5ed74b027e8/scripts/generate-cli.ts
[C-options]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/774d78f5eef5e610407a0c92fa6ec5ed74b027e8/src/bin/chrome-devtools-cli-options.ts
[C-context]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/774d78f5eef5e610407a0c92fa6ec5ed74b027e8/src/McpContext.ts
[C-client]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/774d78f5eef5e610407a0c92fa6ec5ed74b027e8/src/daemon/client.ts
[C-daemon]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/774d78f5eef5e610407a0c92fa6ec5ed74b027e8/src/daemon/daemon.ts
