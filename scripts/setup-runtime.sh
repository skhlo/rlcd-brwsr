#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
uv sync --frozen
printf '%s\n' \
  'Project-local Python runtime is synchronized.' \
  'Next: configure BU_NAME and the local connection in Browser Harness native settings.' \
  'The default workspace configuration is ~/.config/browser-harness/agent-workspace/.env.' \
  'After changing browser selectors, endpoints, or profiles, stop the same-named daemon before reprovisioning.' \
  'A reported cdp mode does not attest that an already-running daemon uses the current browser settings.' \
  'Configure TYPESAFE_API_KEY for Jev decisions on this host.' \
  'For text entry, configure a host-local DeepSeek-issued key as TEXT_MODEL_API_KEY.' \
  'The runner pins TEXT_MODEL_BASE_URL=https://api.deepseek.com/v1,' \
  'TEXT_MODEL=deepseek-flash, and TEXT_MODEL_REASONING=disabled.' \
  'The parent-owned four-stage human-run wizard will supply these values in the native .env; this script does not write credentials.' \
  'Do not use the retained pi-rlcd launcher: it injects an OpenRouter key. The parent task will make that launcher fail closed without deleting it.' \
  'Then run scripts/provision-browser.sh.'
