#!/usr/bin/env python3
"""Read-only compatibility and existing-daemon preflight for RLCD-brwsr."""

import importlib.metadata
import json
import os
import sys

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


def main() -> int:
    checks: dict[str, object] = {
        "python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "jevCommit": JEV_COMMIT,
        "browserHarnessVersion": BROWSER_HARNESS_VERSION,
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
        from jev_ultrafast import browser as upstream_browser

        for owner, attribute in (
            (Agent, "run"),
            (upstream_agent, "Browser"),
            (upstream_browser, "cdp"),
        ):
            if not hasattr(owner, attribute):
                owner_name = getattr(owner, "__name__", type(owner).__name__)
                raise RuntimeError(
                    f"pinned upstream compatibility seam is missing {owner_name}.{attribute}"
                )
        checks["browserMode"] = require_existing_local_daemon(daemon_name)
    except Exception as error:
        print(json.dumps({"ok": False, "checks": checks, "error": str(error)}))
        return 1

    print(json.dumps({"ok": True, "checks": checks}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
