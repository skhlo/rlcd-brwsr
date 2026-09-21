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
    resolved_text_helper_configuration,
)

PROTOCOL_VERSION = 1
MAX_REQUEST_BYTES = 8_192
MAX_PROTOCOL_LINE_CHARS = 32_000
MAX_EVIDENCE_CHARS = 4_000
MAX_PROGRESS_EVIDENCE_CHARS = 1_200
MAX_TRACE_ENTRIES = 24
MAX_DIAGNOSTIC_CHARS = 600
MAX_USAGE_CHARS = 600


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
        os.environ.get("TEXT_MODEL_API_KEY", ""),
    )
    _known_credentials = tuple(dict.fromkeys(value for value in values if value))


def _redact_text(value: str) -> str:
    redacted = value
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
    global _cancel_reason
    _cancel_reason = _cancel_reason or "cancelled"
    raise RunCancelled(_cancel_reason)


def _bounded_text(value: object, maximum: int) -> str:
    text = str(value)
    return text if len(text) <= maximum else text[:maximum]


def _emit(record: dict[str, Any]) -> None:
    line = json.dumps(
        _redacted_json(record), ensure_ascii=False, separators=(",", ":")
    )
    if len(line) > MAX_PROTOCOL_LINE_CHARS:
        raise RuntimeError("bridge protocol record exceeded its fixed line bound")
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def _read_request() -> dict[str, Any]:
    raw = sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1)
    if len(raw) > MAX_REQUEST_BYTES:
        raise InputError(f"request exceeds {MAX_REQUEST_BYTES} bytes")
    if sys.stdin.buffer.read(1):
        raise InputError("bridge accepts exactly one request line")
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise InputError("request is not valid JSON") from error
    if not isinstance(value, dict):
        raise InputError("request must be a JSON object")

    url = value.get("url")
    goal = value.get("goal")
    if value.get("requestType") == "cleanup_target":
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
    retain_tab = value.get("retainTab", False)
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
    if not isinstance(retain_tab, bool):
        raise InputError("retainTab must be a boolean")
    return {
        "url": url,
        "goal": goal.strip(),
        "maxActions": max_actions,
        "maxSeconds": max_seconds,
        "retainTab": retain_tab,
    }


def _observation(page: object, maximum: int = MAX_EVIDENCE_CHARS) -> dict[str, Any] | None:
    if not isinstance(page, dict):
        return None
    url = page.get("url")
    title = page.get("title")
    text = page.get("text")
    if not isinstance(url, str) or not isinstance(title, str) or not isinstance(text, str):
        return None
    evidence = _bounded_text(text, maximum)
    return {
        "url": _bounded_text(url, 2_048),
        "title": _bounded_text(title, 300),
        "evidence": evidence,
        "evidenceTruncated": len(evidence) < len(text),
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


def _bounded_usage(value: object) -> object:
    if not isinstance(value, dict) or not value:
        return "unavailable"
    serialized = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if len(serialized) <= MAX_USAGE_CHARS:
        return value
    return {
        "truncated": True,
        "preview": serialized[: MAX_USAGE_CHARS - 40],
    }


def _usage_record(decision: dict[str, Any]) -> dict[str, Any]:
    return {
        "reportedModel": _bounded_text(
            decision.get("model", "unavailable"), 160
        ),
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
            result["diagnostic"] = diagnostic[: max(0, len(diagnostic) - overage - 128)]

    if _protocol_length(wrapped) > MAX_PROTOCOL_LINE_CHARS:
        raise RuntimeError("terminal result could not fit its fixed protocol bound")


def _terminal(
    *,
    status: str,
    stop_reason: str,
    started_at: float,
    max_seconds: int,
    text_helper_configured: bool,
    text_helper_configured_model: str | None,
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
    text_usage = [
        {
            "reportedModel": "unavailable",
            "field": _bounded_text(call.get("field", "unavailable"), 300),
            "latencyMs": call.get("latency_ms", "unavailable"),
            "usage": _bounded_usage(call.get("usage")),
        }
        for call in text_calls
        if isinstance(call, dict)
    ]
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
                "configured": text_helper_configured,
                "configuredModel": text_helper_configured_model,
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
            "targetId": _bounded_text(target_id, 300) if target_id else None,
            "bridgePid": os.getpid(),
            "daemon": _bounded_text(daemon_name, 200) if daemon_name else None,
        },
        "mutationOutcome": mutation_outcome,
        "diagnostic": _bounded_text(diagnostic, MAX_DIAGNOSTIC_CHARS)
        if diagnostic
        else None,
    }
    return result


def _run(request: dict[str, Any], started_at: float) -> tuple[dict[str, Any], object | None]:
    daemon_name: str | None = None
    text_helper_configured = False
    text_helper_configured_model: str | None = None
    text_helper_configuration_error: str | None = None
    text_helper_configuration_status = "absent"
    trace: list[dict[str, Any]] = []
    decisions: list[dict[str, Any]] = []
    agent: object | None = None
    target_id: str | None = None
    fill_was_selected = False
    fill_may_reuse_cached_text = False
    helper_calls_before = 0
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
            text_helper_configured=text_helper_configured,
            text_helper_configured_model=text_helper_configured_model,
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
        text_helper_configuration = resolved_text_helper_configuration()
        text_helper_configured = text_helper_configuration.configured
        text_helper_configured_model = text_helper_configuration.model
        text_helper_configuration_error = text_helper_configuration.error
        text_helper_configuration_status = text_helper_configuration.status
        if not os.environ.get("TYPESAFE_API_KEY", "").strip():
            return finish(
                "error",
                "setup_error",
                "TYPESAFE_API_KEY is not configured; no browser or model work started",
            ), agent

        os.environ["TYPESAFE_MODEL"] = JEV_MODEL

        import jev_ultrafast.browser as upstream_browser
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
                    "textHelperConfigured": text_helper_configured,
                    "textHelperConfiguration": text_helper_configuration_status,
                    "textHelperConfiguredModel": text_helper_configured_model,
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

        deadline = started_at + request["maxSeconds"]
        while True:
            if time.perf_counter() >= deadline:
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
                operation = _bounded_text(decision.get("operation", "unavailable"), 80)
                selected = _bounded_text(decision.get("choice", "unavailable"), 200)
                action_label = (
                    _bounded_text(action.get("label", selected), 300)
                    if action is not None
                    else selected
                )
                entry = {
                    "step": len(trace) + 1,
                    "operation": operation,
                    "action": action_label,
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

                if (
                    action is not None
                    and action.get("kind") == "fill"
                    and not text_helper_configured
                ):
                    entry["outcome"] = "needs_text"
                    return finish(
                        "stopped",
                        "needs_text",
                        text_helper_configuration_error
                        or "TYPE_TEXT needs explicit TEXT_MODEL_API_KEY, "
                        "TEXT_MODEL_BASE_URL, and TEXT_MODEL; no helper request "
                        "or field mutation was made",
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
                state["decision"] = None
                state["status"] = "ready"
                state["page"] = state["browser"].observe(screenshot=False)
                if trace:
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

            history = state.get("history", [])
            if len(history) > history_before and trace:
                latest = history[-1]
                trace[-1]["outcome"] = "executed"
                if isinstance(latest, dict):
                    trace[-1]["url"] = _bounded_text(latest.get("url", ""), 2_048)
                executed_actions = sum(
                    1
                    for item in history
                    if isinstance(item, dict) and item.get("kind") != "wait"
                )
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
        return finish(
            "stopped",
            _cancel_reason or "cancelled",
            mutation_outcome="unknown" if phase == "mutation" else "not_in_flight",
        ), agent
    except Exception as error:
        current_text_calls = state.get("text_calls", []) if agent is not None else []
        failed_before_mutation = (
            phase == "mutation"
            and fill_was_selected
            and not fill_may_reuse_cached_text
            and isinstance(current_text_calls, list)
            and len(current_text_calls) == helper_calls_before
        )
        stop_reason = "setup_error" if phase == "preflight" else "upstream_error"
        if trace:
            trace[-1]["outcome"] = stop_reason
        return finish(
            "error",
            stop_reason,
            _bounded_text(error, MAX_DIAGNOSTIC_CHARS),
            mutation_outcome=(
                "not_in_flight"
                if failed_before_mutation or phase != "mutation"
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
        diagnostic = _bounded_text(error, MAX_DIAGNOSTIC_CHARS)

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
            text_helper_configured=False,
            text_helper_configured_model=None,
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
            text_helper_configured=False,
            text_helper_configured_model=None,
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
            text_helper_configured=False,
            text_helper_configured_model=None,
            daemon_name=None,
            agent=agent,
            target_id=None,
            trace=[],
            decisions=[],
            diagnostic=_bounded_text(error, MAX_DIAGNOSTIC_CHARS),
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
                agent.close()
                cleanup["taskTab"] = "closed"
            except Exception as error:
                cleanup["taskTab"] = "unconfirmed"
                existing = result.get("diagnostic")
                cleanup_error = f"task-tab cleanup failed: {_bounded_text(error, 240)}"
                result["diagnostic"] = _bounded_text(
                    f"{existing}; {cleanup_error}" if existing else cleanup_error,
                    MAX_DIAGNOSTIC_CHARS,
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
