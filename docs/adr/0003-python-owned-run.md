# Let upstream Python own the run

Status: accepted direction; not implemented. Supersedes ADR-0002's command-level
orchestration, Pi-native helper relay and parent shadow-state design for the next
implementation, not its dependency pins or native Browser Harness ownership.

Use the pinned `Agent.run()` generator and native API-key text helper behind a
small Pi process launcher. The user chose an additional native helper-provider
key over maintaining the Pi OAuth relay and duplicated run state, then selected
OpenRouter `inclusionai/ling-3.0-flash` and confirmed dropping `maxActions`.
Actual provider behavior and per-run cost remain unmeasured. The trade-off is a
narrower, explicitly best-effort interruption/recovery contract rather than
more adapters. Keep the recovered implementation and evidence as history, and do
not describe source inspection or synthetic-provider fixtures as proof of a
replacement wrapper or live model behavior.

The [owning plan](../RLCD-BRWSR.md) records the proposed interface reductions,
remaining decisions and verification sequence. The
[feasibility record](../thin-python-feasibility.md) separates source facts from
mechanical observations. A TypeScript port, provider selector, new daemon and
state-reconstruction framework are not part of this direction.
