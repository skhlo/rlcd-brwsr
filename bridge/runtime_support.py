"""Small shared runtime contract for model and selected-browser binding."""

from __future__ import annotations

import ipaddress
import json
import os
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_CONFIG_PATH = _PROJECT_ROOT / "config" / "runtime.json"


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


def selected_cdp_url() -> str:
    raw = os.environ.get("RLCD_BRWSR_CDP_URL", "").strip()
    try:
        parsed = urlsplit(raw)
        address = ipaddress.ip_address(parsed.hostname or "")
        port = parsed.port
    except ValueError as error:
        raise RuntimeError(
            "RLCD_BRWSR_CDP_URL must be the explicitly selected loopback HTTP CDP endpoint"
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
            "RLCD_BRWSR_CDP_URL must be the explicitly selected loopback HTTP CDP endpoint"
        )
    return raw.rstrip("/")


def configure_selected_browser_environment() -> str:
    endpoint = selected_cdp_url()
    os.environ.pop("BU_BROWSER_ID", None)
    os.environ.pop("BU_CDP_WS", None)
    os.environ["BU_CDP_URL"] = endpoint
    return endpoint


def _target_ids(value: object, *, key: str) -> set[str]:
    if not isinstance(value, list):
        return set()
    identifiers: set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            continue
        identifier = item.get(key)
        if isinstance(identifier, str) and identifier:
            identifiers.add(identifier)
    return identifiers


def require_selected_browser_binding(daemon_name: str, endpoint: str) -> None:
    """Require the named daemon to report and share targets with the selected CDP."""
    from browser_harness import admin, helpers

    admin.require_existing_daemon(daemon_name)
    kind = admin.daemon_browser_kind(daemon_name)
    if kind != "cdp":
        label = kind if kind is not None else "unknown"
        raise RuntimeError(
            f"required daemon {daemon_name!r} uses {label!r} browser mode; "
            "expected the explicitly selected loopback CDP endpoint"
        )

    try:
        with urllib.request.urlopen(f"{endpoint}/json/list", timeout=3) as response:
            selected_targets: object = json.loads(response.read())
    except Exception as error:
        raise RuntimeError(
            "the explicitly selected loopback CDP endpoint is not reachable"
        ) from error
    selected_ids = _target_ids(selected_targets, key="id")

    try:
        daemon_targets = helpers.cdp("Target.getTargets").get("targetInfos")
    except Exception as error:
        raise RuntimeError(
            f"required daemon {daemon_name!r} could not report its browser targets"
        ) from error
    daemon_ids = _target_ids(daemon_targets, key="targetId")

    if not selected_ids or not daemon_ids:
        raise RuntimeError(
            "selected-browser identity could not be established because target metadata was empty"
        )
    if selected_ids.isdisjoint(daemon_ids):
        raise RuntimeError(
            f"required daemon {daemon_name!r} browser binding mismatch: "
            "it is not attached to RLCD_BRWSR_CDP_URL"
        )
