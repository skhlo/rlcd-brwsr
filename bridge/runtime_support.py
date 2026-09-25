"""Shared runtime signals, configuration, and Browser Harness scope checks."""

from __future__ import annotations

import ipaddress
import json
import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_CONFIG_PATH = _PROJECT_ROOT / "config" / "runtime.json"
_DAEMON_NAME = re.compile(r"[A-Za-z0-9_-]{1,64}")


class StopRequested(Exception):
    """Raised on SIGTERM so synchronous browser work can unwind."""


def _load_runtime_config() -> dict[str, Any]:
    try:
        value = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"could not read runtime configuration: {error}") from error
    if not isinstance(value, dict):
        raise RuntimeError("runtime configuration must be a JSON object")
    return value


def _required_string(config: dict[str, Any], name: str) -> str:
    value = config.get(name)
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError(f"runtime configuration must define a non-empty {name}")
    return value


def _required_positive_integer(config: dict[str, Any], name: str) -> int:
    value = config.get(name)
    if type(value) is not int or value <= 0:
        raise RuntimeError(f"runtime configuration must define a positive integer {name}")
    return value


_RUNTIME_CONFIG = _load_runtime_config()
JEV_MODEL = _required_string(_RUNTIME_CONFIG, "jevModel")
TEXT_MODEL_BASE_URL = _required_string(_RUNTIME_CONFIG, "textModelBaseUrl")
TEXT_MODEL = _required_string(_RUNTIME_CONFIG, "textModel")
TEXT_MODEL_REASONING = _required_string(_RUNTIME_CONFIG, "textModelReasoning")
REQUEST_MAX_UTF8_BYTES = _required_positive_integer(
    _RUNTIME_CONFIG, "requestMaxUtf8Bytes"
)
TERMINAL_MAX_UTF8_BYTES = _required_positive_integer(
    _RUNTIME_CONFIG, "terminalMaxUtf8Bytes"
)


def _configure_native_models() -> None:
    """Pin Jev and the selected native helper configuration in this child only."""
    os.environ["TYPESAFE_MODEL"] = JEV_MODEL
    selected = {
        "TEXT_MODEL_BASE_URL": TEXT_MODEL_BASE_URL,
        "TEXT_MODEL": TEXT_MODEL,
        "TEXT_MODEL_REASONING": TEXT_MODEL_REASONING,
    }
    for name, expected in selected.items():
        configured = os.environ.get(name)
        if configured not in {None, "", expected}:
            raise RuntimeError(
                f"{name} must match the selected RLCD-brwsr helper configuration"
            )
        os.environ[name] = expected


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


def resolve_native_environment() -> str:
    """Load Harness's native environment before applying selected model settings."""
    daemon_name = resolved_local_daemon_name()
    _configure_native_models()
    return daemon_name


def require_existing_local_daemon(daemon_name: str) -> str:
    """Require the configured named daemon and reject unsupported reported modes."""
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
