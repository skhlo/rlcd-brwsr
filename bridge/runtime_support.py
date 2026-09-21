"""Small shared runtime contract for model pinning and local Harness use."""

from __future__ import annotations

import ipaddress
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_CONFIG_PATH = _PROJECT_ROOT / "config" / "runtime.json"
_DAEMON_NAME = re.compile(r"[A-Za-z0-9_-]{1,64}")


def _load_jev_model() -> str:
    try:
        value = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"could not read runtime configuration: {error}") from error
    model = value.get("jevModel") if isinstance(value, dict) else None
    if not isinstance(model, str) or not model.strip():
        raise RuntimeError("runtime configuration must define a non-empty jevModel")
    return model


JEV_MODEL = _load_jev_model()


def _validate_loopback_cdp_url(raw: str) -> None:
    try:
        parsed = urlsplit(raw)
        address = ipaddress.ip_address(parsed.hostname or "")
        port = parsed.port
    except ValueError as error:
        raise RuntimeError(
            "BU_CDP_URL must be a loopback HTTP endpoint for local browser configuration"
        ) from error
    if (
        parsed.scheme != "http"
        or not address.is_loopback
        or port is None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise RuntimeError(
            "BU_CDP_URL must be a loopback HTTP endpoint for local browser configuration"
        )


def resolved_local_daemon_name() -> str:
    """Load Browser Harness's native settings, then enforce this tool's local scope."""
    from browser_harness import admin

    daemon_name = admin.NAME
    if not os.environ.get("BU_NAME", "").strip():
        raise RuntimeError(
            "BU_NAME must name the Browser Harness daemon in its native configuration"
        )
    if not isinstance(daemon_name, str) or not _DAEMON_NAME.fullmatch(daemon_name):
        raise RuntimeError(
            "BU_NAME must match [A-Za-z0-9_-]{1,64} in Browser Harness configuration"
        )

    unsupported = [
        name
        for name in ("BU_BROWSER_ID", "BU_CDP_WS", "BU_AUTOSPAWN")
        if os.environ.get(name)
    ]
    if unsupported:
        raise RuntimeError(
            "remote/cloud settings are unsupported for local browser configuration: "
            f"{', '.join(unsupported)}"
        )

    cdp_url = os.environ.get("BU_CDP_URL", "").strip()
    if cdp_url:
        _validate_loopback_cdp_url(cdp_url)
    return daemon_name


def require_existing_local_daemon(daemon_name: str) -> str:
    """Require the natively selected existing daemon and reject cloud mode."""
    from browser_harness import admin

    admin.require_existing_daemon()
    kind = admin.daemon_browser_kind()
    if kind not in {"local", "cdp"}:
        label = kind if kind is not None else "unknown"
        raise RuntimeError(
            f"required daemon {daemon_name!r} uses unsupported "
            f"{label!r} browser mode; RLCD-brwsr supports local browsers only"
        )
    return kind
