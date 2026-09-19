# RLCD-brwsr

RLCD-brwsr delegates bounded browser decisions to a classifier while ordinary code retains execution and the outer agent retains responsibility for the task.

## Language

**Outer agent**:
The task owner that supplies the goal and remains responsible for permissions, verification and difficult recovery.
_Avoid_: Browser agent, controller

**Fast loop**:
A bounded sequence of observations, classifier decisions and deterministic browser actions performed without returning to the outer agent after every action.
_Avoid_: Autonomous agent, reasoning loop

**Action candidate**:
A complete, code-owned browser operation and compatible target or value that the classifier may select. A candidate is data, never executable model output.
_Avoid_: Model command, generated action

**Completion claim**:
The classifier's judgment that the visible page satisfies the goal. It is supporting evidence that requires independent verification by the outer agent.
_Avoid_: Success, proof

**Consequential action**:
A browser action whose external effect, sensitivity or irreversibility requires the fast loop to stop and return control to the outer agent.
_Avoid_: Unsupported action, dangerous action
