#!/usr/bin/env python3
"""One-request Python owner for the pinned Jev Ultrafast Agent.run loop."""

from __future__ import annotations

import json
import math
import os
import re
import signal
import sys
from typing import Any
from urllib.parse import urlsplit

from borrowed_tab import BorrowedTab, StopRequested
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

_HISTORY_LIMIT = 24
_USAGE_RECORD_LIMIT = 24
_USAGE_VALUE_MAX_BYTES = 2_048
_PAGE_TEXT_MAX_BYTES = 4_096
_URL_MAX_BYTES = 2_048
_TITLE_MAX_BYTES = 512
_DIAGNOSTIC_MAX_BYTES = 1_024
_TARGET_MAX_BYTES = 512
_MAX_SAFE_INTEGER = (1 << 53) - 1
_GOAL_WHITESPACE = (
    "\u0009\u000a\u000b\u000c\u000d\u001c\u001d\u001e\u001f\u0020"
    "\u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006"
    "\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
)
_ALLOWED_REQUEST_KEYS = {"url", "targetId", "goal", "retainTab"}


def _handle_stop(_signum: int, _frame: object) -> None:
    raise StopRequested("process stop requested")


def _credential_values() -> tuple[str, ...]:
    values = (
        os.environ.get("TYPESAFE_API_KEY", ""),
        os.environ.get("TEXT_MODEL_API_KEY", ""),
    )
    return tuple(sorted({value for value in values if value}, key=len, reverse=True))


def _normalize_text(value: str) -> str:
    return value.encode("utf-8", errors="replace").decode("utf-8")


def _redact_text(value: str, credentials: tuple[str, ...]) -> str:
    redacted = _normalize_text(value)
    for credential in credentials:
        redacted = redacted.replace(credential, "[REDACTED]")
    redacted = re.sub(
        r"\b(?:Bearer|Authorization:)\s+[A-Za-z0-9._~+\-/=]{8,}",
        "[REDACTED]",
        redacted,
        flags=re.IGNORECASE,
    )
    return redacted


def _sanitize(value: Any, credentials: tuple[str, ...]) -> Any:
    """Redact and normalize complete values before any clipping occurs."""
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value if abs(value) <= _MAX_SAFE_INTEGER else None
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        if value.is_integer() and abs(value) > _MAX_SAFE_INTEGER:
            return None
        return value
    if isinstance(value, str):
        return _redact_text(value, credentials)
    if isinstance(value, (list, tuple)):
        return [_sanitize(item, credentials) for item in value]
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, item in value.items():
            base_key = _redact_text(str(key), credentials)
            safe_key = base_key
            suffix = 2
            while safe_key in sanitized:
                safe_key = f"{base_key}#{suffix}"
                suffix += 1
            sanitized[safe_key] = _sanitize(item, credentials)
        return sanitized
    return _redact_text(str(value), credentials)


def _json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    ).encode("utf-8")


def _clip_utf8(value: str, maximum: int) -> tuple[str, bool]:
    encoded = value.encode("utf-8")
    if len(encoded) <= maximum:
        return value, False
    return encoded[:maximum].decode("utf-8", errors="ignore"), True


def _append_omission(omissions: list[str], label: str) -> None:
    if label not in omissions and len(omissions) < 32:
        omissions.append(label)


def _clip_field(
    owner: dict[str, Any],
    key: str,
    maximum: int,
    label: str,
    omissions: list[str],
) -> None:
    value = owner.get(key)
    if not isinstance(value, str):
        return
    clipped, changed = _clip_utf8(value, maximum)
    owner[key] = clipped
    if changed:
        _append_omission(omissions, label)


def _normalize_goal(value: str) -> str:
    return value.strip(_GOAL_WHITESPACE)


def _validate_http_url(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("url must be a string")
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError("url must be an absolute HTTP(S) URL without credentials")
    return value


def _validate_target_id(value: Any) -> str:
    if not isinstance(value, str):
        raise TypeError("targetId must be a string")
    try:
        encoded = value.encode("utf-8")
    except UnicodeEncodeError as error:
        raise ValueError("targetId must be valid UTF-8") from error
    if not _normalize_goal(value):
        raise ValueError("targetId must be nonblank")
    if len(encoded) > _TARGET_MAX_BYTES:
        raise ValueError(f"targetId must be at most {_TARGET_MAX_BYTES} UTF-8 bytes")
    return value


def _validate_request(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("request must be a JSON object")
    if value == {"operation": "list_tabs"}:
        return {"operation": "list_tabs"}

    unknown = set(value) - _ALLOWED_REQUEST_KEYS
    if unknown:
        raise ValueError("request contains unsupported fields")

    has_url = "url" in value
    has_target = "targetId" in value
    if not has_url and not has_target:
        raise ValueError("at least one of url or targetId is required")
    url = _validate_http_url(value.get("url")) if has_url else None
    target_id = _validate_target_id(value.get("targetId")) if has_target else None

    goal = value.get("goal")
    if not isinstance(goal, str):
        raise ValueError("goal must be a string")
    normalized_goal = _normalize_goal(goal)
    if not normalized_goal:
        raise ValueError("goal must be a nonempty string")

    if has_target:
        if "retainTab" in value:
            raise ValueError("retainTab is invalid when targetId is supplied")
        return {
            "targetId": target_id,
            **({"url": url} if url is not None else {}),
            "goal": normalized_goal,
        }

    retain_tab = value.get("retainTab")
    if type(retain_tab) is not bool:
        raise ValueError("retainTab must be a boolean")
    return {
        "url": url,
        "goal": normalized_goal,
        "retainTab": retain_tab,
    }


def _read_request() -> dict[str, Any]:
    raw = sys.stdin.buffer.read(REQUEST_MAX_UTF8_BYTES + 1)
    if len(raw) > REQUEST_MAX_UTF8_BYTES:
        raise ValueError(
            f"serialized request exceeds {REQUEST_MAX_UTF8_BYTES} UTF-8 bytes"
        )
    if not raw:
        raise ValueError("request was empty")
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("request was not valid UTF-8 JSON") from error
    return _validate_request(value)


def _state_from(agent: Any | None) -> dict[str, Any] | None:
    state = getattr(agent, "state", None) if agent is not None else None
    return state if isinstance(state, dict) else None


def _raw_projection(
    *,
    status: str,
    stop_reason: str,
    execution: str,
    cleanup: str,
    target_id: Any,
    state: dict[str, Any] | None,
    diagnostic: dict[str, Any] | None,
    focus_emulation: str | None = None,
    attachment: str | None = None,
) -> dict[str, Any]:
    page = state.get("page") if state else None
    last_observation = None
    if isinstance(page, dict):
        last_observation = {
            "url": page.get("url", ""),
            "title": page.get("title", ""),
            "text": page.get("text", ""),
        }

    history: list[dict[str, Any]] = []
    for entry in state.get("history", []) if state else []:
        if not isinstance(entry, dict):
            continue
        history.append(
            {
                "step": entry.get("step"),
                "kind": entry.get("kind"),
                "action": entry.get("action"),
                "operation": entry.get("operation"),
                "pageChanged": entry.get("page_changed"),
                "url": entry.get("url"),
                "elapsedMs": entry.get("elapsed_ms"),
            }
        )

    usage_records: list[dict[str, Any]] = []
    for decision in state.get("decisions", []) if state else []:
        if isinstance(decision, dict):
            usage_records.append(
                {
                    "source": "jev_decision",
                    "model": decision.get("model", JEV_MODEL),
                    "usage": decision.get("usage", {}),
                }
            )
    for text_call in state.get("text_calls", []) if state else []:
        if isinstance(text_call, dict):
            usage_records.append(
                {
                    "source": "text_helper",
                    "model": text_call.get("model", TEXT_MODEL),
                    "usage": text_call.get("usage", {}),
                }
            )

    return {
        "status": status,
        "stopReason": stop_reason,
        "completionClaim": {
            "claimed": status == "completion_claim",
            "requiresIndependentVerification": True,
        },
        "execution": execution,
        "lastObservation": last_observation,
        "history": history,
        "models": {
            "jev": {"configuredModel": JEV_MODEL},
            "textHelper": {
                "configuredModel": TEXT_MODEL,
                "baseUrl": TEXT_MODEL_BASE_URL,
                "reasoning": TEXT_MODEL_REASONING,
            },
        },
        "usage": {
            "records": usage_records,
            "limitations": {
                "source": "upstream_recorded_only",
                "providerAttempts": "unknown",
                "providerRetries": "unknown",
                "failedCallUsage": "unknown",
                "piTopLevelUsage": "omitted",
            },
        },
        "targetId": target_id,
        "cleanup": {
            "taskTab": cleanup,
            **(
                {
                    "focusEmulation": focus_emulation,
                    "attachment": attachment,
                }
                if focus_emulation is not None and attachment is not None
                else {}
            ),
            "sharedDaemon": "retained",
        },
        "diagnostic": diagnostic,
        "output": {
            "byteLimit": TERMINAL_MAX_UTF8_BYTES,
            "clipped": False,
            "omissions": [],
        },
    }


def _bound_projection(result: dict[str, Any]) -> dict[str, Any]:
    output = result["output"]
    omissions: list[str] = output["omissions"]
    observation = result.get("lastObservation")
    if isinstance(observation, dict):
        _clip_field(observation, "url", _URL_MAX_BYTES, "lastObservation.url", omissions)
        _clip_field(
            observation, "title", _TITLE_MAX_BYTES, "lastObservation.title", omissions
        )
        _clip_field(
            observation, "text", _PAGE_TEXT_MAX_BYTES, "lastObservation.text", omissions
        )

    target_id = result.get("targetId")
    if isinstance(target_id, str) and len(target_id.encode("utf-8")) > _TARGET_MAX_BYTES:
        result["targetId"] = None
        _append_omission(omissions, "targetId")

    diagnostic = result.get("diagnostic")
    if isinstance(diagnostic, dict):
        _clip_field(
            diagnostic,
            "message",
            _DIAGNOSTIC_MAX_BYTES,
            "diagnostic.message",
            omissions,
        )

    history = result.get("history")
    if isinstance(history, list):
        if len(history) > _HISTORY_LIMIT:
            del history[: len(history) - _HISTORY_LIMIT]
            _append_omission(omissions, "history prefix")
        for entry in history:
            if not isinstance(entry, dict):
                continue
            _clip_field(entry, "action", 512, "history action fields", omissions)
            _clip_field(
                entry, "operation", 128, "history operation fields", omissions
            )
            _clip_field(entry, "url", 1_024, "history URL fields", omissions)

    records = result.get("usage", {}).get("records", [])
    if isinstance(records, list):
        if len(records) > _USAGE_RECORD_LIMIT:
            del records[: len(records) - _USAGE_RECORD_LIMIT]
            _append_omission(omissions, "usage record prefix")
        for record in records:
            if not isinstance(record, dict):
                continue
            _clip_field(record, "model", 512, "usage record model fields", omissions)
            usage = record.get("usage")
            if len(_json_bytes(usage)) > _USAGE_VALUE_MAX_BYTES:
                record["usage"] = {"omitted": "record exceeded its byte allowance"}
                _append_omission(omissions, "usage record values")

    if omissions:
        output["clipped"] = True

    # Fit valid JSON rather than truncating serialized bytes. The trailing newline
    # is included in the one configured terminal byte cap.
    while len(_json_bytes(result)) + 1 > TERMINAL_MAX_UTF8_BYTES:
        if isinstance(observation, dict) and observation.get("text"):
            observation["text"] = ""
            _append_omission(omissions, "lastObservation.text")
        elif isinstance(history, list) and history:
            history.pop(0)
            _append_omission(omissions, "history records")
        elif isinstance(records, list) and records:
            records.pop(0)
            _append_omission(omissions, "usage records")
        elif isinstance(diagnostic, dict) and diagnostic.get("message"):
            diagnostic["message"] = "diagnostic omitted to fit terminal result"
            _append_omission(omissions, "diagnostic detail")
        else:
            result["lastObservation"] = None
            result["history"] = []
            result["usage"]["records"] = []
            result["targetId"] = None
            result["diagnostic"] = {
                "type": "OutputLimit",
                "message": "result fields were omitted to fit the terminal byte limit",
            }
            _append_omission(omissions, "remaining variable fields")
            if len(_json_bytes(result)) + 1 > TERMINAL_MAX_UTF8_BYTES:
                omissions[:] = ["variable fields omitted"]
            break
        output["clipped"] = True

    if len(_json_bytes(result)) + 1 > TERMINAL_MAX_UTF8_BYTES:
        raise RuntimeError("minimal terminal result exceeds configured byte limit")
    return result


def _finalize(
    raw_result: dict[str, Any], *, credentials: tuple[str, ...] | None = None
) -> bytes:
    original_target_id = raw_result.get("targetId")
    safe = _sanitize(
        raw_result, _credential_values() if credentials is None else credentials
    )
    if (
        isinstance(original_target_id, str)
        and safe.get("targetId") != original_target_id
    ):
        safe["targetId"] = None
        output = safe.get("output")
        if isinstance(output, dict) and isinstance(output.get("omissions"), list):
            _append_omission(output["omissions"], "targetId")
            output["clipped"] = True
    bounded = _bound_projection(safe)
    return _json_bytes(bounded) + b"\n"


def _eligible_discovery_url(value: Any) -> bool:
    if value == "about:blank":
        return True
    if not isinstance(value, str):
        return False
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.hostname)


def _tab_listing_output(*, omitted_tabs: int | None) -> dict[str, Any]:
    return {
        "byteLimit": TERMINAL_MAX_UTF8_BYTES,
        "clipped": False,
        "omissions": [],
        "omittedTabs": omitted_tabs,
    }


def _finalize_tab_listing(result: dict[str, Any]) -> bytes:
    output = result["output"]
    omissions: list[str] = output["omissions"]
    diagnostic = result.get("diagnostic")
    if isinstance(diagnostic, dict):
        _clip_field(diagnostic, "type", 128, "diagnostic.type", omissions)
        _clip_field(
            diagnostic,
            "message",
            _DIAGNOSTIC_MAX_BYTES,
            "diagnostic.message",
            omissions,
        )
    tabs = result.get("tabs")
    if isinstance(tabs, list):
        while len(_json_bytes(result)) + 1 > TERMINAL_MAX_UTF8_BYTES and tabs:
            tabs.pop()
            output["omittedTabs"] += 1
            _append_omission(omissions, "tab records")
    if omissions or (isinstance(output.get("omittedTabs"), int) and output["omittedTabs"] > 0):
        output["clipped"] = True
    if len(_json_bytes(result)) + 1 > TERMINAL_MAX_UTF8_BYTES:
        raise RuntimeError("minimal tab-listing result exceeds configured byte limit")
    return _json_bytes(result) + b"\n"


def _list_tabs() -> dict[str, Any]:
    credentials = _credential_values()
    output = _tab_listing_output(omitted_tabs=0)
    try:
        daemon_name = resolve_native_environment()
        require_existing_local_daemon(daemon_name)
        from browser_harness.helpers import cdp

        response = cdp("Target.getTargets")
        target_infos = response.get("targetInfos") if isinstance(response, dict) else None
        if not isinstance(target_infos, list):
            raise TypeError("Target.getTargets returned an invalid response")

        eligible = [
            item
            for item in target_infos
            if isinstance(item, dict)
            and item.get("type") == "page"
            and _eligible_discovery_url(item.get("url"))
        ]
        invalid_ids = sum(not isinstance(item.get("targetId"), str) for item in eligible)
        candidates = sorted(
            (item for item in eligible if isinstance(item.get("targetId"), str)),
            key=lambda item: item["targetId"],
        )
        tabs: list[dict[str, Any]] = []
        omitted_tabs = invalid_ids
        for item in candidates:
            target_id = item["targetId"]
            safe_target_id = _redact_text(target_id, credentials)
            try:
                target_bytes = len(target_id.encode("utf-8"))
            except UnicodeEncodeError:
                target_bytes = _TARGET_MAX_BYTES + 1
            if (
                not target_id
                or safe_target_id != target_id
                or target_bytes > _TARGET_MAX_BYTES
            ):
                omitted_tabs += 1
                continue

            title = _redact_text(str(item.get("title", "")), credentials)
            url = _redact_text(str(item.get("url", "")), credentials)
            title, title_clipped = _clip_utf8(title, _TITLE_MAX_BYTES)
            url, url_clipped = _clip_utf8(url, _URL_MAX_BYTES)
            clipped_fields = [
                name
                for name, clipped in (("title", title_clipped), ("url", url_clipped))
                if clipped
            ]
            if title_clipped:
                _append_omission(output["omissions"], "tab title fields")
            if url_clipped:
                _append_omission(output["omissions"], "tab URL fields")
            tabs.append(
                {
                    "targetId": target_id,
                    "title": title,
                    "url": url,
                    "clippedFields": clipped_fields,
                }
            )

        output["omittedTabs"] = omitted_tabs
        if omitted_tabs:
            _append_omission(output["omissions"], "tab records")
        return {
            "status": "ok",
            "tabs": tabs,
            "diagnostic": None,
            "output": output,
        }
    except (
        StopRequested,
        ImportError,
        KeyError,
        OSError,
        RuntimeError,
        TimeoutError,
        TypeError,
        ValueError,
    ) as error:
        safe_type = _redact_text(type(error).__name__, credentials)
        safe_message = _redact_text(str(error), credentials)
        return {
            "status": "error",
            "tabs": None,
            "diagnostic": {"type": safe_type, "message": safe_message},
            "output": _tab_listing_output(omitted_tabs=None),
        }


def _run(request: dict[str, Any]) -> dict[str, Any]:
    borrowed_mode = "targetId" in request
    agent: Any | None = None
    borrowed: BorrowedTab | None = None
    target_id: Any = None
    state: dict[str, Any] | None = None
    status = "error"
    stop_reason = "error"
    execution = "not_started"
    cleanup = "not_owned" if borrowed_mode else "not_created"
    focus_emulation = "not_applied" if borrowed_mode else None
    attachment = "not_acquired" if borrowed_mode else None
    diagnostic: dict[str, Any] | None = None
    constructing = False

    try:
        daemon_name = resolve_native_environment()
        require_existing_local_daemon(daemon_name)

        import jev_ultrafast
        from browser_harness import admin
        from jev_ultrafast import agent as agent_module
        from jev_ultrafast import browser as upstream_browser

        # Agent's Browser imported this symbol directly. Rebind that exact pinned
        # seam so a tool run can only use the already-running native daemon.
        upstream_browser.ensure_daemon = admin.require_existing_daemon

        if borrowed_mode:
            borrowed = BorrowedTab(
                request["targetId"],
                request.get("url"),
                browser_module=upstream_browser,
                agent_module=agent_module,
            )
            with borrowed.lifetime():
                target_id = borrowed.confirmed_target_id
                agent = borrowed.construct_agent(jev_ultrafast.Agent, request["goal"])
                target_id = borrowed.confirmed_target_id
                borrowed.begin_agent_run()
                for _snapshot in agent.run():
                    pass
        else:
            constructing = True
            agent = jev_ultrafast.Agent(request["url"], request["goal"])
            constructing = False
            target_id = getattr(getattr(agent, "browser", None), "target", None)
            cleanup = "unknown"
            for _snapshot in agent.run():
                pass

        state = _state_from(agent)
        native_status = state.get("status") if state else None
        if native_status == "done":
            status = "completion_claim"
            stop_reason = "done"
            execution = "completed"
        elif native_status == "blocked":
            status = "blocked"
            stop_reason = "blocked"
            execution = "completed"
        else:
            raise RuntimeError("Agent.run ended without a terminal native status")
    except StopRequested as error:
        state = _state_from(agent)
        status = "stopped"
        stop_reason = "cancelled"
        if borrowed_mode:
            execution = (
                "unknown"
                if borrowed is not None and borrowed.requested_effect_started
                else "not_started"
            )
        else:
            execution = "unknown" if constructing or agent is not None else "not_started"
            cleanup = "unknown" if constructing else cleanup
        diagnostic = {"type": type(error).__name__, "message": str(error)}
    except Exception as error:
        state = _state_from(agent)
        status = "error"
        stop_reason = "error"
        if borrowed_mode:
            execution = (
                "unknown"
                if borrowed is not None and borrowed.requested_effect_started
                else "not_started"
            )
        else:
            execution = "unknown" if constructing or agent is not None else "not_started"
            cleanup = "unknown" if constructing else cleanup
        diagnostic = {"type": type(error).__name__, "message": str(error)}
    finally:
        if borrowed_mode:
            cleanup = "not_owned"
            if borrowed is not None:
                borrowed.release()
                target_id = borrowed.confirmed_target_id
                focus_emulation = borrowed.focus_cleanup
                attachment = borrowed.attachment_cleanup
                if (
                    diagnostic is None
                    and (focus_emulation == "unconfirmed" or attachment == "unconfirmed")
                ):
                    diagnostic = {
                        "type": "CleanupUnconfirmed",
                        "message": "borrowed focus release or exact-session detach was not acknowledged",
                    }
        elif agent is not None:
            state = _state_from(agent)
            if target_id is None:
                try:
                    target_id = getattr(getattr(agent, "browser", None), "target", None)
                except Exception:
                    pass
            normal_retention = (
                status == "completion_claim"
                and request["retainTab"]
                and isinstance(target_id, str)
                and bool(target_id)
            )
            if normal_retention:
                cleanup = "retained"
            elif isinstance(target_id, str) and target_id:
                try:
                    from jev_ultrafast import browser as upstream_browser

                    response = upstream_browser.cdp(
                        "Target.closeTarget", targetId=target_id
                    )
                    cleanup = (
                        "closed"
                        if isinstance(response, dict)
                        and response.get("success") is True
                        else "unconfirmed"
                    )
                    if cleanup == "unconfirmed" and diagnostic is None:
                        diagnostic = {
                            "type": "CleanupUnconfirmed",
                            "message": "Target.closeTarget did not confirm success",
                        }
                except Exception as error:
                    cleanup = "unconfirmed"
                    if diagnostic is None:
                        diagnostic = {
                            "type": type(error).__name__,
                            "message": str(error),
                        }
            else:
                cleanup = "unknown"

    return _raw_projection(
        status=status,
        stop_reason=stop_reason,
        execution=execution,
        cleanup=cleanup,
        target_id=target_id,
        state=state,
        diagnostic=diagnostic,
        focus_emulation=focus_emulation,
        attachment=attachment,
    )


def _early_result(
    status: str, stop_reason: str, diagnostic_type: str, message: str
) -> dict[str, Any]:
    return _raw_projection(
        status=status,
        stop_reason=stop_reason,
        execution="not_started",
        cleanup="not_created",
        target_id=None,
        state=None,
        diagnostic={"type": diagnostic_type, "message": message},
    )


def _postdispatch_result(
    status: str, stop_reason: str, error: BaseException
) -> dict[str, Any]:
    return _raw_projection(
        status=status,
        stop_reason=stop_reason,
        execution="unknown",
        cleanup="unknown",
        target_id=None,
        state=None,
        diagnostic={"type": type(error).__name__, "message": str(error)},
    )


def main() -> int:
    signal.signal(signal.SIGTERM, _handle_stop)
    listing = False
    try:
        request = _read_request()
        listing = request.get("operation") == "list_tabs"
    except StopRequested as error:
        result = _early_result(
            "stopped", "cancelled", type(error).__name__, str(error)
        )
    except Exception as error:
        result = _early_result("error", "invalid_input", "InputError", str(error))
    else:
        try:
            result = _list_tabs() if listing else _run(request)
        except StopRequested as error:
            result = _postdispatch_result("stopped", "cancelled", error)
        except Exception as error:
            result = _postdispatch_result("error", "error", error)

    terminal = _finalize_tab_listing(result) if listing else _finalize(result)
    if len(terminal) > TERMINAL_MAX_UTF8_BYTES:
        raise RuntimeError("terminal result exceeded configured byte limit")
    sys.stdout.buffer.write(terminal)
    sys.stdout.buffer.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
