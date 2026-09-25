#!/usr/bin/env python3
"""Read-only compatibility and existing-daemon preflight for RLCD-brwsr."""

import importlib.metadata
import json
import os
import subprocess
import sys
from pathlib import Path

from runtime_support import (
    JEV_MODEL,
    REQUEST_MAX_UTF8_BYTES,
    TERMINAL_MAX_UTF8_BYTES,
    TEXT_MODEL,
    TEXT_MODEL_BASE_URL,
    TEXT_MODEL_REASONING,
    require_existing_local_daemon,
    resolve_native_environment,
)

JEV_COMMIT = "1231850a0bf1a0c0341fe408ef1668dbbfdfac46"
BROWSER_HARNESS_VERSION = "0.1.13"
CLI_PACKAGE_VERSION = "1.7.0"
PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _check_cli_package() -> str:
    script = """
import {readFileSync} from 'node:fs';
import {TextSnapshot} from 'chrome-devtools-mcp/build/src/TextSnapshot.js';
import {SnapshotFormatter} from 'chrome-devtools-mcp/build/src/formatters/SnapshotFormatter.js';
import {WaitForHelper} from 'chrome-devtools-mcp/build/src/WaitForHelper.js';
import {ensureBrowserConnected, closeBrowser} from 'chrome-devtools-mcp/build/src/browser.js';
const pkg=JSON.parse(readFileSync('node_modules/chrome-devtools-mcp/package.json','utf8'));
if (![TextSnapshot,SnapshotFormatter,WaitForHelper,ensureBrowserConnected,closeBrowser]
    .every(value=>typeof value==='function')) throw new Error('CLI mechanics seam is missing');
process.stdout.write(pkg.version);
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=PROJECT_ROOT,
        env={key: value for key, value in os.environ.items() if key in {"PATH", "HOME", "TMPDIR"}},
        capture_output=True,
        text=True,
        timeout=5,
        check=True,
    )
    return result.stdout


def main() -> int:
    checks: dict[str, object] = {
        "python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "jevCommit": JEV_COMMIT,
        "browserHarnessVersion": BROWSER_HARNESS_VERSION,
        "cliPackageVersion": CLI_PACKAGE_VERSION,
        "jevModel": JEV_MODEL,
        "daemon": None,
        "browserMode": None,
        "typesafeConfigured": False,
        "textHelperAvailability": "missing_key",
        "textHelperBaseUrl": TEXT_MODEL_BASE_URL,
        "textHelperModel": TEXT_MODEL,
        "textHelperReasoning": TEXT_MODEL_REASONING,
        "requestMaxUtf8Bytes": REQUEST_MAX_UTF8_BYTES,
        "terminalMaxUtf8Bytes": TERMINAL_MAX_UTF8_BYTES,
    }
    try:
        if sys.version_info[:2] != (3, 12):
            raise RuntimeError("the project runtime must use Python 3.12")

        daemon_name = resolve_native_environment()
        checks["daemon"] = daemon_name
        checks["typesafeConfigured"] = bool(
            os.environ.get("TYPESAFE_API_KEY", "").strip()
        )
        if not checks["typesafeConfigured"]:
            raise RuntimeError("TYPESAFE_API_KEY is not configured")
        if os.environ.get("TEXT_MODEL_API_KEY", "").strip():
            checks["textHelperAvailability"] = "available"

        distribution = importlib.metadata.distribution("jev-ultrafast")
        direct_url = json.loads(distribution.read_text("direct_url.json") or "{}")
        installed_commit = direct_url.get("vcs_info", {}).get("commit_id")
        if installed_commit != JEV_COMMIT:
            raise RuntimeError(
                f"jev-ultrafast pin mismatch: expected {JEV_COMMIT}, got {installed_commit!r}"
            )
        installed_harness = importlib.metadata.version("browser-harness")
        if installed_harness != BROWSER_HARNESS_VERSION:
            raise RuntimeError(
                "browser-harness pin mismatch: "
                f"expected {BROWSER_HARNESS_VERSION}, got {installed_harness}"
            )

        from jev_ultrafast import Agent
        from jev_ultrafast import agent as upstream_agent
        for owner, attribute in (
            (Agent, "run"),
            (upstream_agent, "Browser"),
        ):
            if not hasattr(owner, attribute):
                owner_name = getattr(owner, "__name__", type(owner).__name__)
                raise RuntimeError(
                    f"pinned upstream compatibility seam is missing {owner_name}.{attribute}"
                )
        cli_version = _check_cli_package()
        if cli_version != CLI_PACKAGE_VERSION:
            raise RuntimeError(
                f"CLI package pin mismatch: expected {CLI_PACKAGE_VERSION}, got {cli_version!r}"
            )
        checks["browserMode"] = require_existing_local_daemon(daemon_name)
    except Exception as error:
        print(json.dumps({"ok": False, "checks": checks, "error": str(error)}))
        return 1

    print(json.dumps({"ok": True, "checks": checks}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
