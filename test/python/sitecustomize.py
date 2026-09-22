"""External Browser/model/provider substitutes for registered-tool tests.

The production runner and pinned Agent stay real. This module replaces only the
Browser Harness transport and the two external provider responses.
"""

from __future__ import annotations

import atexit
import json
import math
import os
import re
import signal
import sys
import time
from pathlib import Path

_SCENARIO = os.environ.get("RLCD_TEST_SCENARIO", "click")
_TERMINAL_LIMIT = 16 * 1024


def _terminal_envelope(text: str) -> dict[str, object]:
    return {
        "status": "stopped",
        "stopReason": "cancelled",
        "completionClaim": {
            "claimed": False,
            "requiresIndependentVerification": True,
        },
        "execution": "unknown",
        "lastObservation": {"url": "", "title": "", "text": text},
        "history": [],
        "models": {
            "jev": {"configuredModel": "jev-1.13.0"},
            "textHelper": {
                "configuredModel": "inclusionai/ling-3.0-flash",
                "baseUrl": "https://openrouter.ai/api/v1",
                "reasoning": "none",
                "availability": "unknown",
            },
        },
        "usage": {
            "records": [],
            "limitations": {
                "source": "upstream_recorded_only",
                "providerAttempts": "unknown",
                "providerRetries": "unknown",
                "failedCallUsage": "unknown",
                "piTopLevelUsage": "omitted",
            },
        },
        "targetId": None,
        "cleanup": {"taskTab": "unknown", "sharedDaemon": "retained"},
        "diagnostic": None,
        "output": {
            "byteLimit": _TERMINAL_LIMIT,
            "clipped": True,
            "omissions": ["test padding"],
        },
    }


if _SCENARIO == "invalid_terminal_envelope":
    sys.stdout.write("{}")
    sys.stdout.flush()
    os._exit(0)

if _SCENARIO == "near_limit_terminal_after_stop":
    marker = os.environ.get("RLCD_TEST_PID_MARKER")
    if marker:
        Path(marker).write_text(str(os.getpid()), encoding="utf-8")

    def _emit_near_limit_terminal(_signum: int, _frame: object) -> None:
        result = _terminal_envelope("")
        encoded = json.dumps(
            result, ensure_ascii=False, separators=(",", ":")
        ).encode("utf-8")
        padding = _TERMINAL_LIMIT - 1 - len(encoded)
        if padding <= 0:
            raise AssertionError("terminal fixture envelope exceeded its allowance")
        observation = result["lastObservation"]
        if not isinstance(observation, dict):
            raise AssertionError("terminal fixture observation must be an object")
        observation["text"] = "P" * padding
        terminal = (
            json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode(
                "utf-8"
            )
            + b"\n"
        )
        if len(terminal) != _TERMINAL_LIMIT:
            raise AssertionError("terminal fixture did not reach the byte boundary")
        sys.stdout.buffer.write(terminal)
        sys.stdout.buffer.flush()
        os._exit(0)

    signal.signal(signal.SIGTERM, _emit_near_limit_terminal)
    time.sleep(30)
    os._exit(32)

import jev_ultrafast
from browser_harness import admin, helpers as harness_helpers
from jev_ultrafast import browser, model

_STATE = {
    "url": "about:blank",
    "destination": False,
    "typed": "",
}


def _append(environment_name: str, value: str) -> None:
    path = os.environ.get(environment_name)
    if path:
        with Path(path).open("a", encoding="utf-8", errors="replace") as output:
            output.write(value + "\n")


argv_marker = os.environ.get("RLCD_TEST_ARGV_MARKER")
if argv_marker:
    Path(argv_marker).write_text(json.dumps(sys.argv), encoding="utf-8")

stdin_marker = os.environ.get("RLCD_TEST_STDIN_MARKER")
if stdin_marker:
    original_stdin = sys.stdin.buffer

    class _CapturedBuffer:
        def read(self, size: int = -1) -> bytes:
            value = original_stdin.read(size)
            with Path(stdin_marker).open("ab") as capture:
                capture.write(value)
            return value

        def __getattr__(self, name: str):
            return getattr(original_stdin, name)

    class _CapturedInput:
        buffer = _CapturedBuffer()

        def __getattr__(self, name: str):
            return getattr(sys.__stdin__, name)

    sys.stdin = _CapturedInput()

if _SCENARIO == "raw_stderr_exit":
    secret = os.environ.get("TYPESAFE_API_KEY", "")
    sys.stderr.write((f"raw-child-secret {secret} " + "X" * 100_000) + "\n")
    sys.stderr.flush()
    os._exit(31)

if _SCENARIO == "raw_stdout_overflow":
    secret = os.environ.get("TYPESAFE_API_KEY", "")
    sys.stdout.write(f"raw-child-secret {secret} " + "X" * 100_000)
    sys.stdout.flush()
    time.sleep(30)

if _SCENARIO == "terminal_then_nonzero":

    def _exit_nonzero_after_terminal() -> None:
        os._exit(31)

    atexit.register(_exit_nonzero_after_terminal)

if _SCENARIO == "terminal_then_ignore_term":

    def _hang_after_terminal() -> None:
        marker = os.environ.get("RLCD_TEST_PID_MARKER")
        if marker:
            Path(marker).write_text(str(os.getpid()), encoding="utf-8")
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        time.sleep(30)

    atexit.register(_hang_after_terminal)


def _require_existing_daemon(name=None):
    daemon_name = name or admin.NAME
    if _SCENARIO == "missing_daemon":
        raise RuntimeError(f"required daemon {daemon_name!r} is not running")
    if daemon_name != "rlcd-brwsr-test":
        raise RuntimeError(f"unexpected daemon {daemon_name!r}")


def _daemon_browser_kind(name=None):
    _require_existing_daemon(name)
    return "cdp"


admin.require_existing_daemon = _require_existing_daemon
admin.daemon_browser_kind = _daemon_browser_kind


class _ProjectionInterruptPage(dict):
    def get(self, key, default=None):
        if key == "title":
            os.kill(os.getpid(), signal.SIGTERM)
        return super().get(key, default)


def _page():
    if _SCENARIO in {
        "fill",
        "helper_invalid_empty",
        "helper_invalid_extra",
        "secret_error",
    }:
        if _STATE["typed"]:
            return {
                "url": _STATE["url"],
                "title": "Generated field complete",
                "text": f"Accepted {_STATE['typed']}. Marker FIELD-41",
                "scroll": {"y": 0},
                "actions": [{"id": "wait", "kind": "wait", "label": "Wait"}],
                "marker": "field-complete",
                "page_key": "field-complete",
                "guards": {},
            }
        return {
            "url": _STATE["url"],
            "title": "Generated field fixture",
            "text": "Enter the city requested by the goal.",
            "scroll": {"y": 0},
            "actions": [
                {
                    "id": "destination-city",
                    "kind": "fill",
                    "label": "Destination city",
                    "role": "textbox",
                    "value": "",
                    "node": 21,
                },
                {"id": "wait", "kind": "wait", "label": "Wait"},
            ],
            "marker": "field-start",
            "page_key": "field-start",
            "guards": {"21": "guard-21"},
        }

    if _STATE["destination"]:
        title = (
            "Fixture \ud800 destination"
            if _SCENARIO == "surrogate_usage"
            else "Fixture destination"
        )
        text = (
            "Verified ORBIT-27 \udfff"
            if _SCENARIO == "surrogate_usage"
            else "Verified fixture destination marker ORBIT-27"
        )
        if _SCENARIO == "terminal_overflow":
            text += "界" * 100_000
        page_type = _ProjectionInterruptPage if _SCENARIO == "projection_interrupt" else dict
        return page_type(
            {
                "url": "https://example.test/destination",
                "title": title,
                "text": text,
                "scroll": {"y": 0},
                "actions": [{"id": "wait", "kind": "wait", "label": "Wait"}],
                "marker": "destination",
                "page_key": "destination",
                "guards": {},
            }
        )

    return {
        "url": _STATE["url"],
        "title": "Fixture start",
        "text": "Click Continue to reveal marker ORBIT-27.",
        "scroll": {"y": 0},
        "actions": [
            {
                "id": "continue",
                "kind": "click",
                "label": "Continue to fixture destination",
                "role": "button",
                "value": "",
                "node": 10,
            },
            {"id": "wait", "kind": "wait", "label": "Wait"},
        ],
        "marker": "start",
        "page_key": "start",
        "guards": {"10": "guard-10"},
    }


def _cdp(method, session_id=None, **params):
    del session_id
    if method == "Target.createTarget":
        _append("RLCD_TEST_BROWSER_MARKER", "created:rlcd-owned-target")
        return {"targetId": "rlcd-owned-target"}
    if method == "Target.attachToTarget":
        if _SCENARIO == "constructor_interrupt":
            os.kill(os.getpid(), signal.SIGTERM)
        return {"sessionId": "rlcd-owned-session"}
    if method == "Target.closeTarget":
        target_id = params.get("targetId")
        _append("RLCD_TEST_BROWSER_MARKER", f"close:{target_id}")
        if target_id != "rlcd-owned-target":
            raise RuntimeError("attempted to close an unrelated target")
        return {"success": _SCENARIO not in {"close_false", "slow_close_false"}}
    if method == "Target.getTargets":
        return {"targetInfos": []}
    if method == "Page.navigate":
        _STATE["url"] = params["url"]
        return {"frameId": "fixture-frame"}
    if method.startswith("Emulation."):
        return {}
    if method == "Input.dispatchMouseEvent":
        if params.get("type") == "mouseReleased":
            _STATE["destination"] = True
            _append("RLCD_TEST_BROWSER_MARKER", "click:continue")
        return {}
    if method == "Input.dispatchKeyEvent":
        return {}
    if method == "Input.insertText":
        value = params["text"]
        _STATE["typed"] = value
        _append("RLCD_TEST_FIELD_MARKER", f"value:{value}")
        return {}
    if method == "Runtime.evaluate":
        expression = params.get("expression", "")
        if expression == "document.readyState":
            value = "complete"
        elif "return state?.marker ?? null" in expression:
            value = _page()["marker"]
        elif "return c ? [c.pageKey()" in expression:
            match = re.search(r"nodes\.get\((\d+)\)", expression)
            node = match.group(1) if match else ""
            page = _page()
            value = [page["page_key"], page["guards"].get(node)]
        elif "return {x,y}" in expression:
            value = {"x": 100, "y": 100}
        elif "if (!document.body) return null" in expression:
            value = _page()
        else:
            value = None
        return {"result": {"value": value}}
    raise AssertionError(f"unexpected fake CDP method: {method}")


browser.cdp = _cdp
harness_helpers.cdp = _cdp


def _choice(criteria, selected):
    return {
        "choice": selected,
        "confidence": 1.0,
        "probabilities": {key: float(key == selected) for key in criteria},
    }


def _helper_response(key, body):
    if os.environ.get("TEXT_MODEL_BASE_URL") != "https://openrouter.ai/api/v1":
        raise RuntimeError("runner did not select the OpenRouter helper base URL")
    if os.environ.get("TEXT_MODEL") != "inclusionai/ling-3.0-flash":
        raise RuntimeError("runner did not select Ling 3.0 Flash")
    if os.environ.get("TEXT_MODEL_REASONING") != "none":
        raise RuntimeError("runner did not disable helper reasoning")
    if key != os.environ.get("TEXT_MODEL_API_KEY"):
        raise RuntimeError("native helper did not receive its child environment key")
    if body.get("reasoning") != {"enabled": False}:
        raise RuntimeError("native helper request did not disable reasoning")

    if _SCENARIO == "helper_invalid_empty":
        content = json.dumps({"text": " "})
    elif _SCENARIO == "helper_invalid_extra":
        content = json.dumps({"text": "Busan", "extra": True})
    elif _SCENARIO == "secret_error":
        typesafe_key = os.environ.get("TYPESAFE_API_KEY", "")
        helper_key = os.environ.get("TEXT_MODEL_API_KEY", "")
        raise RuntimeError(
            f"helper failed Authorization: Bearer {helper_key}; jev={typesafe_key}"
        )
    else:
        content = json.dumps({"text": "Busan"})
    return {
        "choices": [{"message": {"content": content}}],
        "usage": {"prompt_tokens": 11, "completion_tokens": 2},
    }


def _post_json(url, key, body):
    _append("RLCD_TEST_MODEL_MARKER", f"request:{url}")
    if "questions" not in body:
        return _helper_response(key, body)

    if os.environ.get("TYPESAFE_MODEL") != "jev-1.13.0":
        raise RuntimeError("runner did not select the pinned Jev model")
    if key != os.environ.get("TYPESAFE_API_KEY"):
        raise RuntimeError("native Jev call did not receive its child environment key")
    if _SCENARIO == "model_error":
        raise RuntimeError("provider failed before a decision")
    if _SCENARIO in {"slow_model", "slow_close_false"}:
        time.sleep(30)
    if _SCENARIO == "ignore_term":
        Path(os.environ["RLCD_TEST_PID_MARKER"]).write_text(
            str(os.getpid()), encoding="utf-8"
        )
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        time.sleep(30)
    if _SCENARIO == "missing_terminal":
        os._exit(29)

    questions = body["questions"]
    operations = questions["operation"]["criteria"]
    if _SCENARIO in {
        "fill",
        "helper_invalid_empty",
        "helper_invalid_extra",
        "secret_error",
    }:
        operation = "DONE" if _STATE["typed"] else "TYPE_TEXT"
    elif _SCENARIO == "done" or _STATE["destination"]:
        operation = "DONE"
    elif _SCENARIO == "blocked":
        operation = "BLOCKED"
    else:
        operation = "CLICK"

    answers = {"operation": _choice(operations, operation)}
    if operation in {"CLICK", "TYPE_TEXT", "SELECT"}:
        target_name = operation.lower() + "_target"
        candidates = questions[target_name]["criteria"]
        answers[target_name] = _choice(candidates, next(iter(candidates)))

    usage = {"input_tokens": 17, "output_tokens": 3}
    reported_model = "deterministic-jev-external-fake"
    if _SCENARIO == "surrogate_usage":
        reported_model = "deterministic-\ud800-model"
        usage = {
            os.environ.get("TYPESAFE_API_KEY", "missing"): math.nan,
            os.environ.get("TEXT_MODEL_API_KEY", "missing"): math.inf,
        }
    if _SCENARIO == "terminal_overflow":
        usage = {f"large-key-{index}": "V" * 5_000 for index in range(40)}

    return {
        "model": reported_model,
        "answers": answers,
        "usage": usage,
    }


model.post_json = _post_json


if _SCENARIO in {"post_constructor_interrupt", "omission_overflow"}:
    _OriginalAgent = jev_ultrafast.Agent

    class _ScenarioAgent:
        def __init__(self, *args, **kwargs):
            self._agent = _OriginalAgent(*args, **kwargs)
            self._interrupted = False

        @property
        def browser(self):
            if _SCENARIO == "post_constructor_interrupt" and not self._interrupted:
                self._interrupted = True
                os.kill(os.getpid(), signal.SIGTERM)
            return self._agent.browser

        @property
        def state(self):
            return self._agent.state

        def run(self):
            yield from self._agent.run()
            if _SCENARIO == "omission_overflow":
                self._agent.state["history"] = [
                    {
                        "step": index,
                        "kind": "click",
                        "action": "A" * 600,
                        "operation": "CLICK",
                        "page_changed": False,
                        "url": "https://example.test/" + "U" * 1_100,
                        "elapsed_ms": index,
                    }
                    for index in range(16)
                ]

    jev_ultrafast.Agent = _ScenarioAgent
