#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
uv sync --frozen
printf '%s\n' \
  'Project-local Python runtime is synchronized.' \
  'Next: configure BU_NAME and the local connection in Browser Harness native settings.' \
  'The default workspace configuration is ~/.config/browser-harness/agent-workspace/.env.' \
  'Configure TYPESAFE_API_KEY on this host.' \
  'For text entry, set TEXT_MODEL_API_KEY, TEXT_MODEL_BASE_URL, and TEXT_MODEL together.' \
  'Then run scripts/provision-browser.sh.'
