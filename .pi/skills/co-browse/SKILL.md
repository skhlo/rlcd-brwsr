---
name: co-browse
description: Work in a visible Chrome tab so the user can watch browser actions.
disable-model-invocation: true
---

# Co-browse

Use Chrome as a shared, visible workspace. The user should see the tab you are
working in, not merely a browser window somewhere on the machine.

## 1. Choose the session

Use the existing, authorized Chrome daemon and browser controls. Discover tabs
with `rlcd_brwsr_list_tabs`; identify the intended page by its exact returned ID.
If the session, tab, or task is ambiguous, ask before acting. Discovery is not
authorization to use unrelated tabs. Reuse the established session and exact tab;
rediscover when the target changes or becomes uncertain.

If setup is unavailable, explain what is missing and ask before starting or
reconfiguring browser services. Keep work within the selected tools' scope;
RLCD currently supports benign, unauthenticated, non-booking tasks.

## 2. Make it visible

Bring the chosen Chrome window into view and select the task tab using available
browser/window controls, or ask the user to do so. Before delegating, confirm
that Chrome is on the user's visible desktop and the task tab is active, using
window-state inspection or user confirmation.

RLCD does not itself foreground a borrowed tab. Focus emulation or
`document.hasFocus()` is not proof that the user can see it.

If a new tab is needed, create and show it through the available controller or
with the user's help, then rediscover its exact ID. Do not substitute a hidden
or headless session when visibility cannot be established.

## 3. Delegate the interaction

Briefly state the desired result and visible stopping condition, then delegate
in-tab work to `rlcd_brwsr_run` by default. Let Jev choose the controls, action
types, typing targets, clicks and scrolling. Give outcome goals rather than
scripts for individual actions; include final positioning in the goal when it
matters for readability.

Keep related steps in one bounded call instead of returning to the outer agent
after every action. Reserve direct browser control for session/visibility setup,
result inspection, or unsupported recovery—not routine in-tab steering.

Continue with `targetId`. Add `url` only for intended navigation; it is required
for an `about:blank` target. Omit `retainTab` in this borrowed-tab mode.

Keep the chosen tab visible. Re-establish visibility after a target change, user
takeover, or uncertainty rather than repeating setup checks between actions.
On takeover, stop issuing further actions, request cancellation if available,
and re-observe before resuming. Cancellation is not an instantaneous-stop or
rollback guarantee. Pause rather than compete for focus.

## 4. Confirm the result and hand back

For a completion claim, use one independent, task-specific read of the exact tab
or the user's explicit confirmation. Reuse that observation to answer the user;
Jev's claim alone is insufficient. Inspect uncertain effects before retrying.

Routine use is not a validation campaign: do not rerun code tests, capture
benchmarks, audit each action, or call extra model judges to reconfirm working
code. Investigate only an actual task failure or unexpected result.

Leave the working tab visible and open unless the user asks otherwise. Briefly
report the result and anything unfinished. Preserve unrelated tabs and the
shared browser daemon.
