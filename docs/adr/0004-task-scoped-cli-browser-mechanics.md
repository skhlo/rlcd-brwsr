# Put CLI browser mechanics behind the Python-owned run

Status: selected for local implementation; remaining native acceptance paused by the owner.

ADR-0003 keeps the pinned Python `Agent.run()` as the only owner of decisions,
history, field-text generation, projection and reporting. Its old Browser
implementation uses a top-level DOM walk and direct Harness input. Design A
replaces **that browser implementation only** with one task-scoped Node helper
using `chrome-devtools-mcp@1.7.0`'s CLI implementation code: `TextSnapshot`,
`SnapshotFormatter`, `WaitForHelper`, Puppeteer locators and the connected-browser
path. It starts no CLI daemon or MCP server. The Pi tools and co-browse skill
keep their existing interfaces.

The named Harness daemon still owns configuration, discovery and exact target
creation/attachment/closure. Its native WebSocket resolver supplies only a
candidate endpoint. Before any page action, the helper must find the exact CDP
target ID obtained from that daemon in its own Puppeteer connection. A mismatch
fails admission, including for a newly created task target. This avoids
trusting changed environment settings, URL/title matching or a CLI-local page
number. The helper owns only browser mechanics and its connection lifetime;
Python owns the helper process and conservatively reports stop/cleanup.

This supersedes ADR-0003's clauses that assigned observation/freshness/input
to the upstream Browser/Harness and counted only three private integrations.
It retains ADR-0003's Python run, native providers, reporting, Pi supervision,
and ownership of created versus borrowed tabs. The new private imports and
Puppeteer target ID/session hooks are pinned and must be retested on upgrades.
Partial fixture evidence and remaining checks are owned by
[the verification record](../thin-python-evidence.md#design-a-local-candidate-2026-09-25),
not inferred from the earlier standalone CLI probe.

The owner accepted a short-lived-helper limitation: a dialog already open before
subscription stays untouched, but can produce a bounded stop/error without
typed dialog metadata. A persistent observer is not part of A. Events observed
after subscription still take the explicit dialog-handoff path; no dialog is
automatically accepted or dismissed. The owner stopped further verification and
left the local candidate unactivated.
