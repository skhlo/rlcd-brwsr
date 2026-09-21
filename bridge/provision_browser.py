#!/usr/bin/env python3
"""Explicitly provision the Browser Harness daemon from its native settings."""

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
    admin.ensure_daemon()
    kind = require_existing_local_daemon(daemon_name)
    print(f"Browser Harness daemon {daemon_name!r} is ready in {kind!r} mode.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
