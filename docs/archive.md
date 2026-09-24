# Historical work and evidence archive

This page is public wayfinding for earlier RLCD-brwsr work. Read each document
as describing the repository revision in which it appears; its presence here
does not mean that every later feature is on the default branch.

## Current entry points

- [RLCD-brwsr contract](RLCD-BRWSR.md) - current interface, ownership, bounds,
  and safety envelope.
- [ADR-0003](adr/0003-python-owned-run.md) - current Python-owned architecture.
- [Python-owned runner verification](thin-python-evidence.md#compact-handoff) -
  current evidence classes, recorded revisions, and limits.
- [Issue #17](https://github.com/skhlo/rlcd-brwsr/issues/17) - current known
  action-cap cycling report. It is an open investigation, not a verified fix.

## Published history

The initial Python-owned implementation merged through
[PR #16](https://github.com/skhlo/rlcd-brwsr/pull/16) at
[`4f4d42aa98c68aa10007ef831a163a7dd867990c`](https://github.com/skhlo/rlcd-brwsr/commit/4f4d42aa98c68aa10007ef831a163a7dd867990c).
Later tracked documents and code should still be read at their own revision.

The earlier custom TypeScript/Chrome-CLI research summary and source are public
at
[`5dafb11448e54d0a6fa23213dde550da367ee784`](https://github.com/skhlo/rlcd-brwsr/commit/5dafb11448e54d0a6fa23213dde550da367ee784)
in still-open [PR #8](https://github.com/skhlo/rlcd-brwsr/pull/8). Later Maps
probes and backup bundles remain operator-local, not part of that published
research history. The research PR is historical context, not a prerequisite to
merge for the current implementation.

Issues [#9](https://github.com/skhlo/rlcd-brwsr/issues/9),
[#10](https://github.com/skhlo/rlcd-brwsr/issues/10),
[#11](https://github.com/skhlo/rlcd-brwsr/issues/11),
[#12](https://github.com/skhlo/rlcd-brwsr/issues/12), and
[#13](https://github.com/skhlo/rlcd-brwsr/issues/13) describe superseded
implementation stages. Their acceptance criteria are historical and are not
marked as passed. The retained summaries for three of those stages are
[issue #10 evidence](issue-10-evidence.md),
[issue #11 evidence](issue-11-evidence.md), and
[issue #12 evidence](issue-12-evidence.md).

## Evidence availability

Tracked documents provide the public source, summaries, and stated limits.
Detailed raw receipts under `artifacts/` are gitignored operator-local evidence,
not files or links distributed with the public repository. A local artifact path
in a historical record is therefore only a locator for an operator who already
has that retained evidence.

Retained worktrees, browser profiles, bundles, and other raw resources remain
operator-managed. This public index intentionally omits host paths and resource
operation instructions. Archived trial records are not current setup guidance
or authorization to repeat live work.
