#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
daemon_name="${RLCD_BRWSR_DAEMON:-rlcd-brwsr}"
selected_cdp_url="${RLCD_BRWSR_CDP_URL:-}"
if [[ -z "$selected_cdp_url" ]]; then
  printf '%s\n' 'RLCD_BRWSR_CDP_URL must select the approved loopback HTTP CDP endpoint.' >&2
  exit 1
fi
python_executable=.venv/bin/python
if [[ ! -x "$python_executable" ]]; then
  printf '%s\n' 'Project runtime is missing. Run scripts/setup-runtime.sh before browser provisioning.' >&2
  exit 1
fi
export RLCD_BRWSR_DAEMON="$daemon_name"
export BU_NAME="$daemon_name"
unset BU_BROWSER_ID BU_CDP_WS
export BU_CDP_URL="$selected_cdp_url"

printf 'Provisioning Browser Harness daemon %q against explicit endpoint %q.\n' "$daemon_name" "$selected_cdp_url"
"$python_executable" bridge/provision_browser.py
printf 'Daemon %q is connected to the selected local endpoint. Runtime calls will verify both identities.\n' "$daemon_name"
