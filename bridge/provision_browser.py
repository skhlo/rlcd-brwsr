#!/usr/bin/env python3
"""Explicitly provision the Browser Harness daemon from its native settings."""

import sys

from runtime_support import require_existing_local_daemon, resolved_local_daemon_name


def main() -> int:
    daemon_name = resolved_local_daemon_name()

    from browser_harness import admin

    if admin.daemon_alive():
        kind = admin.daemon_browser_kind()
        if kind not in {"local", "cdp"}:
            label = kind if kind is not None else "unknown"
            raise RuntimeError(
                f"existing daemon {daemon_name!r} uses unsupported "
                f"{label!r} browser mode; stop it before provisioning local configuration"
            )
        print(
            "An existing same-named daemon is already running; provisioning cannot "
            "attest its endpoint or profile. Stop it first if browser settings changed.",
            file=sys.stderr,
        )
    admin.ensure_daemon()
    kind = require_existing_local_daemon(daemon_name)
    print(
        f"Browser Harness daemon {daemon_name!r} is healthy; Harness reports "
        f"{kind!r} mode, which does not attest endpoint or profile identity."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
