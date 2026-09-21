#!/usr/bin/env python3
"""Read-only compatibility and exact-daemon preflight for RLCD-brwsr."""

import importlib.metadata
import json
import os
import sys

from runtime_support import (
    JEV_MODEL,
    configure_selected_browser_environment,
    require_selected_browser_binding,
)

JEV_COMMIT = "1231850a0bf1a0c0341fe408ef1668dbbfdfac46"
BROWSER_HARNESS_VERSION = "0.1.13"


def main() -> int:
    daemon = os.environ.get("RLCD_BRWSR_DAEMON", "").strip()
    selected_endpoint: str | None = None
    checks: dict[str, object] = {
        "python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "jevCommit": JEV_COMMIT,
        "browserHarnessVersion": BROWSER_HARNESS_VERSION,
        "jevModel": JEV_MODEL,
        "daemon": daemon or None,
        "selectedCdpUrl": None,
        "typesafeConfigured": bool(os.environ.get("TYPESAFE_API_KEY", "").strip()),
        "textHelperConfigured": bool(os.environ.get("TEXT_MODEL_API_KEY", "").strip()),
    }
    try:
        if sys.version_info[:2] != (3, 12):
            raise RuntimeError("the project runtime must use Python 3.12")
        if not daemon:
            raise RuntimeError(
                "RLCD_BRWSR_DAEMON must name the explicitly provisioned Browser Harness daemon"
            )
        selected_endpoint = configure_selected_browser_environment()
        checks["selectedCdpUrl"] = selected_endpoint
        if not checks["typesafeConfigured"]:
            raise RuntimeError("TYPESAFE_API_KEY is not configured")

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

        os.environ["BU_NAME"] = daemon
        from jev_ultrafast import Agent, Browser

        for owner, attribute in (
            (Agent, "command"),
            (Agent, "run"),
            (Browser, "close"),
        ):
            if not hasattr(owner, attribute):
                raise RuntimeError(
                    f"pinned upstream compatibility seam is missing {owner.__name__}.{attribute}"
                )
        require_selected_browser_binding(daemon, selected_endpoint)
    except Exception as error:
        print(json.dumps({"ok": False, "checks": checks, "error": str(error)}))
        return 1

    print(json.dumps({"ok": True, "checks": checks}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
