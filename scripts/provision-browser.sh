#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
daemon_name="${RLCD_BRWSR_DAEMON:-rlcd-brwsr}"
export RLCD_BRWSR_DAEMON="$daemon_name"
export BU_NAME="$daemon_name"

printf 'Provisioning Browser Harness daemon %q against the currently selected local Chrome.\n' "$daemon_name"
printf '%s\n' 'If Chrome requests remote-debugging permission, approve it yourself, then rerun this command.'
uv run --frozen python -c 'import os; from browser_harness.admin import ensure_daemon; ensure_daemon(name=os.environ["RLCD_BRWSR_DAEMON"])'
printf 'Daemon %q is connected. Runtime calls will require this exact existing daemon.\n' "$daemon_name"
