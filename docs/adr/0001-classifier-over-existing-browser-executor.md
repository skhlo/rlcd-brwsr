# Use Jev as a classifier over the existing browser executor

Status: superseded first by
[ADR-0002](0002-wrap-pinned-jev-ultrafast-agent.md), then by the current
[ADR-0003](0003-python-owned-run.md).

RLCD-brwsr will use Jev only to select among code-owned browser operations and compatible targets, while the existing Chrome DevTools CLI observes pages and executes actions deterministically. The `browser-use/jev-ultrafast` project is a control-flow reference, not a runtime dependency: adopting its Python and Browser Harness stack would add a second browser runtime and provisioning path before the simpler classifier-plus-executor design has been tested.
