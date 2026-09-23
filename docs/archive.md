# Active checkout and research archive

Use **`~/Repositories/rlcd-brwsr/`** for development and running the current
extension. Its branch is `feat/jev-ultrafast-pi`; Paseo labels the workspace
**Active extension**. There is no active `experiments/` directory.

## Old research - preserved, not maintained

The earlier custom TypeScript/Chrome-CLI loop, research comparisons, Maps probes,
fixtures, ledgers and reports remain in Git, outside the current working tree.
The archive contains the entire historical repository layout, so references
inside those old reports have not been rewritten.

| Historical work                              | Preserved branch                                             | Commit                                     |
| -------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| Latest experimental checkout and Maps probes | `feat/bounded-observation-test`, `chore/maps-snapshot-probe` | `6df4b4b0f8b17420f9c9bc0a8176072312ec6de3` |
| Research fast-loop comparison                | `feat/research-fast-loop`                                    | `5dafb11448e54d0a6fa23213dde550da367ee784` |

For example, inspect a report without switching the active checkout:

```bash
git show 6df4b4b:experiments/research-fast-loop/RESEARCH-COMPARISON.md
```

An independent local backup is retained at:

```text
~/Archives/rlcd-brwsr/research-6df4b4b.bundle
```

Its SHA-256 is
`5bac1275f488eed658e0d7c13f8a81266c58dbbd10e2461f4bdd0e54bf76498f`.
The bundle contains complete history for all three branch references. Verification
included a bare restore, `git fsck --full`, exact branch-head checks and all 71
tracked experiment files. The bare restore is also retained at
`~/Archives/rlcd-brwsr/verified-restore.git`; the archive README explains restoration.
No historical branch, commit, ledger or report was deleted, and no remote or PR
was changed. Archived trial instructions are not the current extension's setup
or permission to resume paid experiments.

## Retained verification checkout - not a second development root

`~/Repositories/rlcd-brwsr-jev-ultrafast/` remains detached at `938abe5` and locked
against accidental worktree removal/pruning. Paseo labels it **Retained
verification - do not develop** under **RLCD retained test resources**.

It is retained because it contains the existing isolated Chrome profile, the
Harness runtime used by the running test daemon, and prior verification
artifacts. Those paths were not moved, and Chrome/Harness were not restarted.
Do not delete this checkout while those resources still use it. Retiring it is a
separate resource migration/cleanup task.

Historical references to `artifacts/thin-python-plan/`, `artifacts/thin-python-build/`
and `artifacts/thin-python-live/` resolve under that retained checkout. New
consolidation evidence is under the canonical checkout's `artifacts/consolidation/`.

The canonical checkout has its own pinned `.venv` and Node dependencies,
materialized from local caches with frozen locks. It does not use a symlink to
the retained checkout's Python environment. Browser Harness still owns browser
selection; its existing named daemon remains the shared test resource.

This organization does not install or auto-load the Pi extension. Loading and
credential setup remain as documented in the [README](../README.md).
