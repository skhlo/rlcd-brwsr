#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
uv sync --frozen
printf '%s\n' \
  'Project-local Python runtime is synchronized.' \
  'Next: configure BU_NAME and the local connection in Browser Harness native settings.' \
  'The default workspace configuration is ~/.config/browser-harness/agent-workspace/.env.' \
  'Configure TYPESAFE_API_KEY on this host, then run scripts/provision-browser.sh.'
