#!/usr/bin/env python3
"""Explicitly provision one daemon for the operator-selected loopback Chrome."""

import os

from runtime_support import (
    configure_selected_browser_environment,
    require_selected_browser_binding,
)


def main() -> int:
    daemon = os.environ.get("RLCD_BRWSR_DAEMON", "").strip()
    if not daemon:
        raise RuntimeError("RLCD_BRWSR_DAEMON must name the daemon to provision")
    endpoint = configure_selected_browser_environment()

    from browser_harness import admin

    admin.ensure_daemon(name=daemon, env={"BU_CDP_URL": endpoint})
    require_selected_browser_binding(daemon, endpoint)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
