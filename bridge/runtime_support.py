"""Small shared runtime contract for model pinning and local Harness use."""

from __future__ import annotations

import ipaddress
import json
import os
import re
from dataclasses import dataclass
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


@dataclass(frozen=True)
class TextHelperConfiguration:
    configured: bool
    status: str
    model: str | None
    error: str | None


def resolved_text_helper_configuration() -> TextHelperConfiguration:
    """Classify native upstream TEXT_MODEL_* settings without exposing values."""
    names = ("TEXT_MODEL_API_KEY", "TEXT_MODEL_BASE_URL", "TEXT_MODEL")
    raw = {name: os.environ.get(name, "") for name in names}
    present = {name: bool(value.strip()) for name, value in raw.items()}
    if not any(present.values()):
        return TextHelperConfiguration(False, "absent", None, None)

    missing = [name for name in names if not present[name]]
    if missing:
        return TextHelperConfiguration(
            False,
            "incomplete",
            None,
            "TYPE_TEXT needs explicit TEXT_MODEL_API_KEY, TEXT_MODEL_BASE_URL, "
            f"and TEXT_MODEL; missing {', '.join(missing)}; no helper request or "
            "field mutation was made",
        )

    if any(raw[name] != raw[name].strip() for name in names):
        return TextHelperConfiguration(
            False,
            "invalid",
            None,
            "TEXT_MODEL_* values must not have leading or trailing whitespace; "
            "no helper request or field mutation was made",
        )

    try:
        parsed = urlsplit(raw["TEXT_MODEL_BASE_URL"])
        host = parsed.hostname or ""
        parsed.port
        local_http = parsed.scheme == "http" and (
            host == "localhost" or ipaddress.ip_address(host).is_loopback
        )
    except ValueError:
        local_http = False
        parsed = urlsplit("")
    if (
        not parsed.hostname
        or parsed.scheme not in {"http", "https"}
        or (parsed.scheme == "http" and not local_http)
        or parsed.username is not None
        or parsed.password is not None
        or bool(parsed.query)
        or bool(parsed.fragment)
    ):
        return TextHelperConfiguration(
            False,
            "invalid",
            None,
            "TEXT_MODEL_BASE_URL must be an absolute HTTPS endpoint or loopback "
            "HTTP endpoint without embedded credentials, query, or fragment; no "
            "helper request or field mutation was made",
        )

    return TextHelperConfiguration(True, "configured", raw["TEXT_MODEL"], None)


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
