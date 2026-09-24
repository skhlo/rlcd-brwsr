# RLCD-brwsr

RLCD-brwsr delegates a bounded browser task to the pinned Jev Ultrafast Agent while the outer agent retains permissions, planning, recovery and independent outcome verification.

## Language

**Outer agent**:
The task owner that supplies the goal and remains responsible for permissions, verification and difficult recovery.
_Avoid_: Browser agent, controller

**Fast loop**:
The bounded upstream sequence of observations, Jev decisions and Browser Harness actions performed without returning to the outer agent after every action.
_Avoid_: Autonomous agent, reasoning loop

**Action candidate**:
A complete, upstream-code-owned browser operation and compatible target or value that Jev may select. A candidate is data, never executable model output.
_Avoid_: Model command, generated action

**Completion claim**:
The classifier's judgment that the visible page satisfies the goal. It is supporting evidence that requires independent verification by the outer agent.
_Avoid_: Success, proof

**Consequential action**:
A browser action whose external effect, sensitivity or irreversibility requires the fast loop to stop and return control to the outer agent.
_Avoid_: Unsupported action, dangerous action

**Created tab**:
A page opened for one fast-loop run whose lifetime belongs to that run.
_Avoid_: Borrowed tab, existing tab

**Borrowed tab**:
An eligible pre-existing page selected by exact target identity for a fast-loop run. Selection can permit navigation or input without transferring the page's lifetime to the run.
_Avoid_: Created tab, owned tab

**Tab discovery**:
A bounded read-only view of technically eligible page targets. Discovery identifies candidates but does not authorize using them.
_Avoid_: Tab selection, permission
