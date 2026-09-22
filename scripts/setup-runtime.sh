#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
uv sync --frozen
printf '%s\n' \
  'Project-local Python runtime is synchronized.' \
  'Next: configure BU_NAME and the local connection in Browser Harness native settings.' \
  'The default workspace configuration is ~/.config/browser-harness/agent-workspace/.env.' \
  'Configure TYPESAFE_API_KEY on this host.' \
  'For text entry, configure a host-local OpenRouter key as TEXT_MODEL_API_KEY.' \
  'The runner pins TEXT_MODEL_BASE_URL=https://openrouter.ai/api/v1,' \
  'TEXT_MODEL=inclusionai/ling-3.0-flash, and TEXT_MODEL_REASONING=none.' \
  'Then run scripts/provision-browser.sh.'
