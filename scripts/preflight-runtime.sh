#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
python_executable=.venv/bin/python
if [[ ! -x "$python_executable" ]]; then
  printf '%s\n' 'Project runtime is missing. Run scripts/setup-runtime.sh before preflight.' >&2
  exit 1
fi
exec "$python_executable" bridge/preflight.py
