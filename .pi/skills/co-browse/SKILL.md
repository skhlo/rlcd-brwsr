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
authorization to use unrelated tabs.

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

## 3. Work in short batches

Briefly state the next visible goal. Use direct control for one obvious action
or read; delegate short multi-step UI work to `rlcd_brwsr_run` with a concrete
visible stopping condition.

Continue with `targetId`. Add `url` only for intended navigation; it is required
for an `about:blank` target. Omit `retainTab` in this borrowed-tab mode.

Check the intended tab is still visible before each batch and after a target
change. Take turns with the user: on takeover, stop issuing further actions,
request cancellation if available, and re-observe before resuming. Cancellation
is not an instantaneous-stop or rollback guarantee. Pause rather than compete
for focus or quietly continue in the background.

## 4. Verify and hand back

Independently inspect the exact target for the requested visible result; Jev's
completion claim alone is insufficient. After interruption or uncertain effects,
inspect before retrying.

Leave the working tab visible and open unless the user asks otherwise. Briefly
report the result and anything unfinished. Preserve unrelated tabs and the
shared browser daemon.
