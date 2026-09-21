#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
uv sync --frozen
printf '%s\n' \
  'Project-local Python runtime is synchronized.' \
  'Next: export RLCD_BRWSR_DAEMON=rlcd-brwsr and TYPESAFE_API_KEY on this host.' \
  'Then explicitly provision the selected local Chrome with scripts/provision-browser.sh.'
