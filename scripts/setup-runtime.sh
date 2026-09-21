#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
uv sync --frozen
printf '%s\n' \
  'Project-local Python runtime is synchronized.' \
  'Next: export RLCD_BRWSR_DAEMON, RLCD_BRWSR_CDP_URL, and TYPESAFE_API_KEY on this host.' \
  'RLCD_BRWSR_CDP_URL must be the approved loopback HTTP endpoint of the selected Chrome.' \
  'Then explicitly provision that Chrome with scripts/provision-browser.sh.'
