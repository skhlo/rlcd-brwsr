#!/usr/bin/env python3
"""Bounded JSONL bridge from Pi to the pinned Jev Ultrafast Agent."""

from __future__ import annotations

import json
import os
import re
import signal
import sys
import time
from typing import Any
from urllib.parse import urlsplit

from runtime_support import (
    JEV_MODEL,
    require_existing_local_daemon,
    resolved_local_daemon_name,
)

PROTOCOL_VERSION = 2
MAX_REQUEST_BYTES = 20_000
MAX_HELPER_REPLY_BYTES = 128_000
MAX_PROTOCOL_LINE_CHARS = 32_000
MAX_HELPER_REQUEST_LINE_CHARS = 384_000
MAX_EVIDENCE_CHARS = 4_000
MAX_PROGRESS_EVIDENCE_CHARS = 1_200
MAX_TRACE_ENTRIES = 24
MAX_DIAGNOSTIC_CHARS = 600
MAX_USAGE_CHARS = 600
_INTERNAL_HELPER_KEY = "rlcd-pi-native-helper"
_INTERNAL_HELPER_BASE_URL = "rlcd-pi-helper://bridge"
_INTERNAL_HELPER_MODEL = "pi-native-text-helper"
_helper_request_id = 0
_helper_waiting = False
_helper_wait_interrupted = False
_helper_usage_request_ids: dict[int, int] = {}


class RunCancelled(Exception):
    """Raised by the process signal handler to unwind synchronous upstream work."""


class InputError(ValueError):
    """The structured request was invalid."""


_cancel_reason: str | None = None
_known_credentials: tuple[str, ...] = ()


def _refresh_known_credentials() -> None:
    global _known_credentials
    values = (
        *_known_credentials,
        os.environ.get("TYPESAFE_API_KEY", ""),
    )
    _known_credentials = tuple(dict.fromkeys(value for value in values if value))


def _normalize_unicode(value: str) -> str:
    output: list[str] = []
    index = 0
    while index < len(value):
        codepoint = ord(value[index])
        if 0xD800 <= codepoint <= 0xDBFF:
            if index + 1 < len(value):
                trailing = ord(value[index + 1])
                if 0xDC00 <= trailing <= 0xDFFF:
                    output.append(
                        chr(
                            0x10000
                            + ((codepoint - 0xD800) << 10)
                            + trailing
                            - 0xDC00
                        )
                    )
                    index += 2
                    continue
            output.append("\uFFFD")
        elif 0xDC00 <= codepoint <= 0xDFFF:
            output.append("\uFFFD")
        else:
            output.append(value[index])
        index += 1
    return "".join(output)


def _redact_text(value: str) -> str:
    redacted = _normalize_unicode(value)
    for credential in _known_credentials:
        redacted = redacted.replace(credential, "[REDACTED]")
    return re.sub(
        r"\b(?:Bearer|Authorization:)\s+[A-Za-z0-9._~+\-/=]{8,}",
        "[REDACTED]",
        redacted,
        flags=re.IGNORECASE,
    )


def _redacted_json(value: Any) -> Any:
    if isinstance(value, str):
        return _redact_text(value)
    if isinstance(value, list):
        return [_redacted_json(item) for item in value]
    if isinstance(value, dict):
        return {
            _redact_text(str(key)): _redacted_json(item)
            for key, item in value.items()
        }
    return value


class _RedactingDiagnosticStream:
    def __init__(self, stream: Any) -> None:
        self._stream = stream

    def write(self, value: str) -> int:
        return self._stream.write(_redact_text(value))

    def flush(self) -> None:
        self._stream.flush()

    def __getattr__(self, name: str) -> Any:
        return getattr(self._stream, name)


def _handle_stop(_signum: int, _frame: object) -> None:
    global _cancel_reason, _helper_wait_interrupted
    _cancel_reason = _cancel_reason or "cancelled"
    _helper_wait_interrupted = _helper_waiting
    raise RunCancelled(_cancel_reason)


def _bounded_text(value: object, maximum: int) -> str:
    text = str(value)
    return text if len(text) <= maximum else text[:maximum]


def _bounded_metadata(value: object, maximum: int) -> tuple[str, bool]:
    text = _redact_text(str(value))
    return _bounded_text(text, maximum), len(text) > maximum


def _bounded_diagnostic(value: object, maximum: int = MAX_DIAGNOSTIC_CHARS) -> str:
    text = _redact_text(str(value))
    if len(text) <= maximum:
        return text
    suffix = f" [diagnostic truncated from {len(text)} characters]"
    if len(suffix) >= maximum:
        return "[diagnostic truncated]"[:maximum]
    return f"{text[: maximum - len(suffix)]}{suffix}"


def _emit(record: dict[str, Any]) -> None:
    line = json.dumps(
        _redacted_json(record), ensure_ascii=False, separators=(",", ":")
    )
    maximum = (
        MAX_HELPER_REQUEST_LINE_CHARS
        if record.get("type") == "text_helper_request"
        else MAX_PROTOCOL_LINE_CHARS
    )
    if len(line) > maximum:
        raise RuntimeError("bridge protocol record exceeded its fixed line bound")
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def _read_helper_reply(request_id: int) -> dict[str, Any]:
    raw = sys.stdin.buffer.readline(MAX_HELPER_REPLY_BYTES + 1)
    if not raw:
        raise RuntimeError("Pi text helper reply stream closed before a response")
    if len(raw) > MAX_HELPER_REPLY_BYTES:
        raise RuntimeError(
            f"Pi text helper reply exceeded {MAX_HELPER_REPLY_BYTES} bytes"
        )
    try:
        reply = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("Pi text helper reply was not valid JSON") from error
    if not isinstance(reply, dict):
        raise RuntimeError("Pi text helper reply must be a JSON object")
    if reply.get("type") != "text_helper_response":
        raise RuntimeError("Pi text helper reply had an unexpected type")
    if reply.get("requestId") != request_id:
        raise RuntimeError("Pi text helper reply did not match the active request")
    error = reply.get("error")
    if error is not None:
        if not isinstance(error, str) or not error.strip():
            raise RuntimeError("Pi text helper returned an invalid error")
        raise RuntimeError(_bounded_diagnostic(error))
    response = reply.get("response")
    usage = reply.get("usage")
    if not isinstance(response, str):
        raise RuntimeError("Pi text helper returned no response text")
    if not isinstance(usage, dict):
        usage = {}
    return {
        "response": response,
        "usage": usage,
    }


def _install_pi_text_helper(upstream_model: Any) -> None:
    """Route only upstream's helper-shaped call over the existing bridge."""
    original_post_json = upstream_model.post_json

    def post_json(url: object, key: object, body: object) -> Any:
        if key != _INTERNAL_HELPER_KEY:
            return original_post_json(url, key, body)
        if url != f"{_INTERNAL_HELPER_BASE_URL}/chat/completions":
            raise RuntimeError("internal Pi text helper endpoint mismatch")
        if not isinstance(body, dict):
            raise RuntimeError("upstream text helper request was not an object")
        messages = body.get("messages")
        if (
            not isinstance(messages, list)
            or len(messages) != 2
            or not all(isinstance(message, dict) for message in messages)
        ):
            raise RuntimeError("upstream text helper prompt had an unexpected shape")
        system_prompt = messages[0].get("content")
        user_prompt = messages[1].get("content")
        if not isinstance(system_prompt, str) or not isinstance(user_prompt, str):
            raise RuntimeError("upstream text helper prompt was not textual")

        global _helper_request_id, _helper_waiting
        _helper_request_id += 1
        request_id = _helper_request_id
        _emit(
            {
                "type": "text_helper_request",
                "requestId": request_id,
                "prompt": {
                    "system": system_prompt,
                    "user": user_prompt,
                },
            }
        )
        _helper_waiting = True
        try:
            reply = _read_helper_reply(request_id)
        finally:
            _helper_waiting = False
        _helper_usage_request_ids[id(reply["usage"])] = request_id
        return {
            "choices": [{"message": {"content": reply["response"]}}],
            "usage": reply["usage"],
        }

    upstream_model.post_json = post_json


def _read_request() -> dict[str, Any]:
    raw = sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1)
    if len(raw) > MAX_REQUEST_BYTES:
        raise InputError(f"request exceeds {MAX_REQUEST_BYTES} bytes")
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise InputError("request is not valid JSON") from error
    if not isinstance(value, dict):
        raise InputError("request must be a JSON object")

    url = value.get("url")
    goal = value.get("goal")
    if value.get("requestType") == "cleanup_target":
        if sys.stdin.buffer.read(1):
            raise InputError("cleanup bridge accepts exactly one request line")
        target_id = value.get("targetId")
        if (
            not isinstance(target_id, str)
            or not target_id.strip()
            or len(target_id) > 300
        ):
            raise InputError(
                "cleanup targetId must be a non-empty string of at most 300 characters"
            )
        return {"requestType": "cleanup_target", "targetId": target_id}
    if value.get("requestType") is not None:
        raise InputError("requestType is not supported")

    max_actions = value.get("maxActions")
    max_seconds = value.get("maxSeconds")
    deadline_epoch_ms = value.get("deadlineEpochMs")
    retain_tab = value.get("retainTab", False)
    text_helper_available = value.get("textHelperAvailable")
    text_helper_unavailable_reason = value.get("textHelperUnavailableReason")
    if not isinstance(url, str) or not url.strip() or len(url) > 2_048:
        raise InputError("url must be a non-empty string of at most 2048 characters")
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise InputError("url must be an absolute HTTP(S) URL")
    if parsed.username is not None or parsed.password is not None:
        raise InputError("url must not contain credentials")
    if not isinstance(goal, str) or not goal.strip() or len(goal) > 1_200:
        raise InputError("goal must be a non-empty string of at most 1200 characters")
    if (
        not isinstance(max_actions, int)
        or isinstance(max_actions, bool)
        or not 1 <= max_actions <= 20
    ):
        raise InputError("maxActions must be an integer from 1 through 20")
    if (
        not isinstance(max_seconds, int)
        or isinstance(max_seconds, bool)
        or not 1 <= max_seconds <= 120
    ):
        raise InputError("maxSeconds must be an integer from 1 through 120")
    if (
        not isinstance(deadline_epoch_ms, int)
        or isinstance(deadline_epoch_ms, bool)
        or deadline_epoch_ms <= 0
    ):
        raise InputError("deadlineEpochMs must be a positive integer")
    if not isinstance(retain_tab, bool):
        raise InputError("retainTab must be a boolean")
    if not isinstance(text_helper_available, bool):
        raise InputError("textHelperAvailable must be a boolean")
    if (
        text_helper_unavailable_reason is not None
        and (
            not isinstance(text_helper_unavailable_reason, str)
            or not text_helper_unavailable_reason.strip()
            or len(text_helper_unavailable_reason) > MAX_DIAGNOSTIC_CHARS
        )
    ):
        raise InputError(
            "textHelperUnavailableReason must be null or a non-empty bounded string"
        )
    if text_helper_available and text_helper_unavailable_reason is not None:
        raise InputError(
            "available text helper must not include an unavailable reason"
        )
    if not text_helper_available and text_helper_unavailable_reason is None:
        raise InputError("unavailable text helper must include a reason")
    return {
        "url": url,
        "goal": goal.strip(),
        "maxActions": max_actions,
        "maxSeconds": max_seconds,
        "deadlineEpochMs": deadline_epoch_ms,
        "retainTab": retain_tab,
        "textHelperAvailable": text_helper_available,
        "textHelperUnavailableReason": text_helper_unavailable_reason,
    }


def _observation(page: object, maximum: int = MAX_EVIDENCE_CHARS) -> dict[str, Any] | None:
    if not isinstance(page, dict):
        return None
    url = page.get("url")
    title = page.get("title")
    text = page.get("text")
    if not isinstance(url, str) or not isinstance(title, str) or not isinstance(text, str):
        return None
    bounded_url, url_truncated = _bounded_metadata(url, 2_048)
    bounded_title, title_truncated = _bounded_metadata(title, 300)
    evidence, evidence_truncated = _bounded_metadata(text, maximum)
    return {
        "url": bounded_url,
        "urlTruncated": url_truncated,
        "title": bounded_title,
        "titleTruncated": title_truncated,
        "evidence": evidence,
        "evidenceTruncated": evidence_truncated,
    }


def _selected_action(state: dict[str, Any]) -> dict[str, Any] | None:
    decision = state.get("decision")
    page = state.get("page")
    if not isinstance(decision, dict) or not isinstance(page, dict):
        return None
    selected = decision.get("choice")
    actions = page.get("actions")
    if not isinstance(actions, list):
        return None
    return next(
        (
            action
            for action in actions
            if isinstance(action, dict) and action.get("id") == selected
        ),
        None,
    )


def _reconcile_executed_action(
    state: dict[str, Any], trace: list[dict[str, Any]], history_before: int
) -> tuple[bool, int]:
    history = state.get("history", [])
    if not isinstance(history, list):
        return False, 0
    executed_actions = sum(
        1
        for item in history
        if isinstance(item, dict) and item.get("kind") != "wait"
    )
    if len(history) <= history_before or not trace:
        return False, executed_actions
    latest = history[-1]
    trace[-1]["outcome"] = "executed"
    if isinstance(latest, dict):
        bounded_url, url_truncated = _bounded_metadata(
            latest.get("url", ""), 2_048
        )
        trace[-1]["url"] = bounded_url
        trace[-1]["urlTruncated"] = url_truncated
    return True, executed_actions


def _bounded_usage(value: object) -> object:
    if not isinstance(value, dict) or not value:
        return "unavailable"
    safe_value = _redacted_json(value)
    serialized = json.dumps(safe_value, ensure_ascii=False, separators=(",", ":"))
    if len(serialized) <= MAX_USAGE_CHARS:
        return safe_value
    return {
        "truncated": True,
        "preview": serialized[: MAX_USAGE_CHARS - 40],
    }


def _usage_record(decision: dict[str, Any]) -> dict[str, Any]:
    reported_model, reported_model_truncated = _bounded_metadata(
        decision.get("model", "unavailable"), 160
    )
    return {
        "reportedModel": reported_model,
        "reportedModelTruncated": reported_model_truncated,
        "latencyMs": decision.get("latency_ms")
        if isinstance(decision.get("latency_ms"), int)
        else "unavailable",
        "usage": _bounded_usage(decision.get("usage")),
    }


def _protocol_length(record: dict[str, Any]) -> int:
    return len(json.dumps(record, ensure_ascii=False, separators=(",", ":")))


def _fit_terminal_result(result: dict[str, Any]) -> None:
    """Keep a terminal record inside the same hard bound enforced by _emit."""
    wrapped = {"type": "result", "result": result}
    usage = result["usage"]
    jev_usage = usage["jev"]
    text_usage = usage["textHelper"]
    lists = (
        (result["trace"], result, "traceTruncated"),
        (jev_usage["decisions"], jev_usage, "decisionsTruncated"),
        (text_usage["calls"], text_usage, "callsTruncated"),
    )
    while _protocol_length(wrapped) > MAX_PROTOCOL_LINE_CHARS:
        populated = [entry for entry in lists if entry[0]]
        if not populated:
            break
        values, owner, flag = max(populated, key=lambda entry: _protocol_length(entry[0]))
        values.pop(0)
        owner[flag] = True

    if _protocol_length(wrapped) > MAX_PROTOCOL_LINE_CHARS:
        observation = result.get("lastObservation")
        if isinstance(observation, dict):
            evidence = observation.get("evidence")
            if isinstance(evidence, str):
                overage = _protocol_length(wrapped) - MAX_PROTOCOL_LINE_CHARS
                observation["evidence"] = evidence[: max(0, len(evidence) - overage - 128)]
                observation["evidenceTruncated"] = True

    if _protocol_length(wrapped) > MAX_PROTOCOL_LINE_CHARS:
        diagnostic = result.get("diagnostic")
        if isinstance(diagnostic, str):
            overage = _protocol_length(wrapped) - MAX_PROTOCOL_LINE_CHARS
            result["diagnostic"] = _bounded_diagnostic(
                diagnostic, max(64, len(diagnostic) - overage - 128)
            )

    if _protocol_length(wrapped) > MAX_PROTOCOL_LINE_CHARS:
        raise RuntimeError("terminal result could not fit its fixed protocol bound")


def _terminal(
    *,
    status: str,
    stop_reason: str,
    started_at: float,
    max_seconds: int,
    text_helper_available: bool,
    daemon_name: str | None,
    agent: object | None,
    target_id: str | None,
    trace: list[dict[str, Any]],
    decisions: list[dict[str, Any]],
    diagnostic: str | None = None,
    mutation_outcome: str = "not_in_flight",
) -> dict[str, Any]:
    state = getattr(agent, "state", {}) if agent is not None else {}
    if not isinstance(state, dict):
        state = {}
    text_calls = state.get("text_calls")
    if not isinstance(text_calls, list):
        text_calls = []
    text_usage = []
    for call in text_calls:
        if not isinstance(call, dict):
            continue
        raw_usage = call.get("usage")
        request_id = _helper_usage_request_ids.get(id(raw_usage))
        field, field_truncated = _bounded_metadata(
            call.get("field", "unavailable"), 300
        )
        text_usage.append(
            {
                "reportedModel": "unavailable",
                "reportedModelTruncated": False,
                "field": field,
                "fieldTruncated": field_truncated,
                "latencyMs": call.get("latency_ms", "unavailable"),
                "usage": _bounded_usage(raw_usage),
                **(
                    {"helperRequestId": request_id}
                    if request_id is not None
                    else {}
                ),
            }
        )
    bounded_target_id, target_id_truncated = (
        _bounded_metadata(target_id, 300) if target_id else (None, False)
    )
    bounded_daemon_name, daemon_name_truncated = (
        _bounded_metadata(daemon_name, 200) if daemon_name else (None, False)
    )
    result: dict[str, Any] = {
        "status": status,
        "stopReason": stop_reason,
        "completionClaim": {
            "claimed": status == "completion_claim",
            "requiresIndependentVerification": True,
        },
        "lastObservation": _observation(state.get("page")),
        "trace": trace[-MAX_TRACE_ENTRIES:],
        "traceTruncated": len(trace) > MAX_TRACE_ENTRIES,
        "usage": {
            "jev": {
                "configuredModel": JEV_MODEL,
                "decisions": decisions[-MAX_TRACE_ENTRIES:],
                "decisionsTruncated": len(decisions) > MAX_TRACE_ENTRIES,
                "providerHttpAttempts": "unavailable",
                "providerRetries": "unavailable",
                "providerCost": "unavailable",
            },
            "textHelper": {
                "availability": "available" if text_helper_available else "unavailable",
                "model": None,
                "calls": text_usage[-MAX_TRACE_ENTRIES:],
                **(
                    {"callsTruncated": True}
                    if len(text_usage) > MAX_TRACE_ENTRIES
                    else {}
                ),
                "providerHttpAttempts": "unavailable",
                "providerRetries": "unavailable",
                "providerCost": "unavailable",
            },
        },
        "timing": {
            "elapsedMs": round((time.perf_counter() - started_at) * 1_000),
            "wallBudgetMs": max_seconds * 1_000,
            "cleanupElapsedMs": "unavailable",
            "cleanupOverrunMs": 0,
        },
        "ownership": {
            "targetId": bounded_target_id,
            "targetIdTruncated": target_id_truncated,
            "bridgePid": os.getpid(),
            "daemon": bounded_daemon_name,
            "daemonTruncated": daemon_name_truncated,
        },
        "mutationOutcome": mutation_outcome,
        "diagnostic": _bounded_diagnostic(diagnostic) if diagnostic else None,
    }
    return result


def _run(request: dict[str, Any], started_at: float) -> tuple[dict[str, Any], object | None]:
    daemon_name: str | None = None
    text_helper_available = request["textHelperAvailable"]
    text_helper_unavailable_reason = request["textHelperUnavailableReason"]
    trace: list[dict[str, Any]] = []
    decisions: list[dict[str, Any]] = []
    state: dict[str, Any] = {}
    agent: object | None = None
    target_id: str | None = None
    fill_was_selected = False
    fill_may_reuse_cached_text = False
    helper_calls_before = 0
    history_before = 0
    phase = "preflight"

    initialization_started = False

    def finish(
        status: str,
        stop_reason: str,
        diagnostic: str | None = None,
        mutation_outcome: str = "not_in_flight",
    ) -> dict[str, Any]:
        result = _terminal(
            status=status,
            stop_reason=stop_reason,
            started_at=started_at,
            max_seconds=request["maxSeconds"],
            text_helper_available=text_helper_available,
            daemon_name=daemon_name,
            agent=agent,
            target_id=target_id,
            trace=trace,
            decisions=decisions,
            diagnostic=diagnostic,
            mutation_outcome=mutation_outcome,
        )
        result["_initializationStarted"] = initialization_started
        return result

    try:
        # Importing Harness resolves its native workspace .env. Refresh the
        # child-owned redactor immediately afterward, before any diagnostics or
        # protocol records can contain those resolved credentials.
        from browser_harness import admin

        _refresh_known_credentials()
        daemon_name = resolved_local_daemon_name()
        if not os.environ.get("TYPESAFE_API_KEY", "").strip():
            return finish(
                "error",
                "setup_error",
                "TYPESAFE_API_KEY is not configured; no browser or model work started",
            ), agent

        os.environ["TYPESAFE_MODEL"] = JEV_MODEL

        os.environ["TEXT_MODEL_API_KEY"] = _INTERNAL_HELPER_KEY
        os.environ["TEXT_MODEL_BASE_URL"] = _INTERNAL_HELPER_BASE_URL
        os.environ["TEXT_MODEL"] = _INTERNAL_HELPER_MODEL

        import jev_ultrafast.browser as upstream_browser
        import jev_ultrafast.model as upstream_model

        _install_pi_text_helper(upstream_model)

        from jev_ultrafast import Agent
        from jev_ultrafast.browser import StalePage

        require_existing_local_daemon(daemon_name)
        upstream_browser.ensure_daemon = admin.require_existing_daemon
        _emit(
            {
                "type": "ready",
                "protocolVersion": PROTOCOL_VERSION,
                "daemon": daemon_name,
                "capabilities": {
                    "textHelperAvailability": (
                        "available" if text_helper_available else "unavailable"
                    ),
                },
            }
        )

        phase = "initial_observation"
        initialization_started = True
        agent = Agent(request["url"], request["goal"], screenshots=False)
        browser_instance = getattr(agent, "browser", None)
        raw_target = getattr(browser_instance, "target", None)
        target_id = raw_target if isinstance(raw_target, str) else None
        _emit({"type": "ownership", "targetId": target_id})
        state = getattr(agent, "state")
        _emit(
            {
                "type": "progress",
                "phase": "observation",
                "observation": _observation(
                    state.get("page"), MAX_PROGRESS_EVIDENCE_CHARS
                ),
                "executedActions": 0,
            }
        )

        deadline_epoch_ms = request["deadlineEpochMs"]
        while True:
            if time.time() * 1_000 >= deadline_epoch_ms:
                return finish("stopped", "time_budget"), agent
            executed_actions = sum(
                1
                for history in state.get("history", [])
                if isinstance(history, dict) and history.get("kind") != "wait"
            )
            if executed_actions >= request["maxActions"]:
                return finish("stopped", "action_budget"), agent

            phase = "prediction"
            history_before = len(state.get("history", []))
            try:
                agent.command("predict", {})
                decision = state.get("decision")
                if not isinstance(decision, dict):
                    return finish(
                        "error", "upstream_error", "upstream returned no decision"
                    ), agent
                action = _selected_action(state)
                operation, operation_truncated = _bounded_metadata(
                    decision.get("operation", "unavailable"), 80
                )
                selected, selected_truncated = _bounded_metadata(
                    decision.get("choice", "unavailable"), 200
                )
                action_label, action_truncated = _bounded_metadata(
                    action.get("label", selected) if action is not None else selected,
                    300,
                )
                entry = {
                    "step": len(trace) + 1,
                    "operation": operation,
                    "operationTruncated": operation_truncated,
                    "action": action_label,
                    "actionTruncated": (
                        action_truncated if action is not None else selected_truncated
                    ),
                    "outcome": "predicted",
                    "elapsedMs": round((time.perf_counter() - started_at) * 1_000),
                }
                trace.append(entry)
                decisions.append(_usage_record(decision))
                _emit(
                    {
                        "type": "progress",
                        "phase": "prediction",
                        "decision": entry,
                        "measurement": decisions[-1],
                        "executedActions": executed_actions,
                    }
                )

                if time.time() * 1_000 >= deadline_epoch_ms:
                    entry["outcome"] = "time_budget"
                    return finish("stopped", "time_budget"), agent

                if (
                    action is not None
                    and action.get("kind") == "fill"
                    and not text_helper_available
                ):
                    entry["outcome"] = "needs_text"
                    return finish(
                        "stopped",
                        "needs_text",
                        text_helper_unavailable_reason
                        or "Pi text helper is unavailable; no helper request or "
                        "field mutation was made",
                    ), agent

                fill_was_selected = (
                    action is not None and action.get("kind") == "fill"
                )
                current_text_calls = state.get("text_calls", [])
                helper_calls_before = (
                    len(current_text_calls)
                    if isinstance(current_text_calls, list)
                    else 0
                )
                fill_may_reuse_cached_text = bool(
                    fill_was_selected and getattr(agent, "pending_text", None)
                )
                phase = (
                    "mutation"
                    if action is not None and action.get("kind") != "wait"
                    else "action"
                )
                if phase == "mutation":
                    entry["outcome"] = "dispatched"
                    _emit(
                        {
                            "type": "progress",
                            "phase": "dispatch",
                            "action": entry,
                            "executedActions": executed_actions,
                        }
                    )
                agent.command(
                    "act", {"fingerprint": state.get("page", {}).get("fingerprint")}
                )
                phase = "observation"
            except StalePage:
                reconciled, executed_actions = _reconcile_executed_action(
                    state, trace, history_before
                )
                if reconciled:
                    _emit(
                        {
                            "type": "progress",
                            "phase": "action",
                            "action": trace[-1],
                            "executedActions": executed_actions,
                        }
                    )
                state["decision"] = None
                state["status"] = "ready"
                state["page"] = state["browser"].observe(screenshot=False)
                if trace and not reconciled:
                    trace[-1]["outcome"] = "stale_reobserved"
                _emit(
                    {
                        "type": "progress",
                        "phase": "observation",
                        "observation": _observation(
                            state.get("page"), MAX_PROGRESS_EVIDENCE_CHARS
                        ),
                        "executedActions": executed_actions,
                    }
                )
                continue

            reconciled, executed_actions = _reconcile_executed_action(
                state, trace, history_before
            )
            if reconciled:
                _emit(
                    {
                        "type": "progress",
                        "phase": "action",
                        "action": trace[-1],
                        "executedActions": executed_actions,
                    }
                )
            elif trace:
                trace[-1]["outcome"] = state.get("status", "observed")

            _emit(
                {
                    "type": "progress",
                    "phase": "observation",
                    "observation": _observation(
                        state.get("page"), MAX_PROGRESS_EVIDENCE_CHARS
                    ),
                    "executedActions": executed_actions,
                }
            )
            if state.get("status") == "done":
                if trace:
                    trace[-1]["outcome"] = "completion_claim"
                return finish("completion_claim", "done_claim"), agent
            if state.get("status") == "blocked":
                if trace:
                    trace[-1]["outcome"] = "blocked"
                return finish("stopped", "blocked"), agent
    except RunCancelled:
        reconciled = False
        if agent is not None:
            reconciled, _ = _reconcile_executed_action(
                state, trace, history_before
            )
        return finish(
            "stopped",
            _cancel_reason or "cancelled",
            mutation_outcome=(
                "unknown"
                if phase == "mutation"
                and not _helper_wait_interrupted
                and not reconciled
                else "not_in_flight"
            ),
        ), agent
    except Exception as error:
        reconciled = False
        if agent is not None:
            reconciled, _ = _reconcile_executed_action(
                state, trace, history_before
            )
        current_text_calls = state.get("text_calls", []) if agent is not None else []
        failed_before_mutation = (
            phase == "mutation"
            and fill_was_selected
            and not fill_may_reuse_cached_text
            and isinstance(current_text_calls, list)
            and len(current_text_calls) == helper_calls_before
        )
        stop_reason = "setup_error" if phase == "preflight" else "upstream_error"
        if trace and not reconciled:
            trace[-1]["outcome"] = stop_reason
        return finish(
            "error",
            stop_reason,
            _bounded_diagnostic(error),
            mutation_outcome=(
                "not_in_flight"
                if reconciled or failed_before_mutation or phase != "mutation"
                else "unknown"
            ),
        ), agent


def _run_target_cleanup(request: dict[str, Any], started_at: float) -> int:
    daemon_name: str | None = None
    closed = False
    diagnostic: str | None = None
    try:
        # This process resolves the same native Harness configuration as a run.
        # It never discovers a target or daemon: the parent supplies only the
        # incrementally reported target identifier and existing-daemon use is
        # required before issuing the one targeted close command.
        from browser_harness import admin
        from browser_harness.helpers import cdp

        _refresh_known_credentials()
        daemon_name = resolved_local_daemon_name()
        require_existing_local_daemon(daemon_name)
        response = cdp("Target.closeTarget", targetId=request["targetId"])
        closed = isinstance(response, dict) and response.get("success") is True
        if not closed:
            diagnostic = "targeted task-tab cleanup was not confirmed"
    except Exception as error:
        diagnostic = _bounded_diagnostic(error)

    _emit(
        {
            "type": "cleanup",
            "targetId": request["targetId"],
            "daemon": daemon_name,
            "closed": closed,
            "elapsedMs": round((time.perf_counter() - started_at) * 1_000),
            "diagnostic": diagnostic,
        }
    )
    return 0 if closed else 1


def main() -> int:
    started_at = time.perf_counter()
    _refresh_known_credentials()
    sys.stderr = _RedactingDiagnosticStream(sys.stderr)
    signal.signal(signal.SIGTERM, _handle_stop)
    signal.signal(signal.SIGINT, _handle_stop)
    agent: object | None = None
    request: dict[str, Any] | None = None
    initialization_started = False
    cleanup = {
        "taskTab": "not_created",
        "sharedDaemon": "retained",
    }
    try:
        request = _read_request()
        if request.get("requestType") == "cleanup_target":
            return _run_target_cleanup(request, started_at)
        result, agent = _run(request, started_at)
        initialization_started = bool(result.pop("_initializationStarted", False))
    except RunCancelled:
        result = _terminal(
            status="stopped",
            stop_reason=_cancel_reason or "cancelled",
            started_at=started_at,
            max_seconds=1,
            text_helper_available=False,
            daemon_name=None,
            agent=agent,
            target_id=None,
            trace=[],
            decisions=[],
        )
    except InputError as error:
        result = _terminal(
            status="error",
            stop_reason="invalid_input",
            started_at=started_at,
            max_seconds=1,
            text_helper_available=False,
            daemon_name=None,
            agent=None,
            target_id=None,
            trace=[],
            decisions=[],
            diagnostic=str(error),
        )
    except Exception as error:
        result = _terminal(
            status="error",
            stop_reason="bridge_error",
            started_at=started_at,
            max_seconds=1,
            text_helper_available=False,
            daemon_name=None,
            agent=agent,
            target_id=None,
            trace=[],
            decisions=[],
            diagnostic=_bounded_diagnostic(error),
        )

    cleanup_started_at = time.perf_counter()
    if agent is not None:
        retain_completed_tab = bool(
            request
            and request.get("retainTab") is True
            and result.get("status") == "completion_claim"
        )
        if retain_completed_tab:
            cleanup["taskTab"] = "retained"
        else:
            try:
                from browser_harness.helpers import cdp

                browser_instance = getattr(agent, "browser", None)
                owned_target = getattr(browser_instance, "target", None)
                response = (
                    cdp("Target.closeTarget", targetId=owned_target)
                    if isinstance(owned_target, str) and owned_target
                    else None
                )
                confirmed = (
                    isinstance(response, dict) and response.get("success") is True
                )
                cleanup["taskTab"] = "closed" if confirmed else "unconfirmed"
                if confirmed:
                    browser_instance.target = None
                else:
                    existing = result.get("diagnostic")
                    cleanup_error = "primary task-tab cleanup was not confirmed"
                    result["diagnostic"] = _bounded_diagnostic(
                        f"{existing}; {cleanup_error}" if existing else cleanup_error
                    )
            except Exception as error:
                cleanup["taskTab"] = "unconfirmed"
                existing = result.get("diagnostic")
                cleanup_error = (
                    "primary task-tab cleanup failed: "
                    f"{_bounded_diagnostic(error, 240)}"
                )
                result["diagnostic"] = _bounded_diagnostic(
                    f"{existing}; {cleanup_error}" if existing else cleanup_error
                )
    elif initialization_started:
        # Agent construction can create a target before its initial observation
        # fails. Without an emitted ownership record its identity is unknown.
        cleanup["taskTab"] = "unconfirmed"

    elapsed_ms = round((time.perf_counter() - started_at) * 1_000)
    cleanup_elapsed_ms = round(
        (time.perf_counter() - cleanup_started_at) * 1_000
    )
    wall_budget_ms = result["timing"]["wallBudgetMs"]
    result["timing"].update(
        elapsedMs=elapsed_ms,
        cleanupElapsedMs=cleanup_elapsed_ms,
        cleanupOverrunMs=max(0, elapsed_ms - wall_budget_ms),
    )
    result["cleanup"] = cleanup
    result = _redacted_json(result)
    _fit_terminal_result(result)
    _emit({"type": "result", "result": result})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
