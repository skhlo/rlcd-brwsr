"""Registered-tool fixture for external boundaries and one Agent lifecycle seam.

Ordinary scenarios use the production runner and pinned Agent while replacing
Browser Harness transport and provider responses. The post-construction interrupt
scenario wraps that real Agent to signal while its known target is recovered.
"""

from __future__ import annotations

import atexit
import json
import math
import os
import re
import signal
import subprocess
import sys
import time
from pathlib import Path

_SCENARIO = os.environ.get("RLCD_TEST_SCENARIO", "click")
_RUNTIME_CONFIG = json.loads(
    (Path(__file__).resolve().parents[2] / "config" / "runtime.json").read_text(
        encoding="utf-8"
    )
)
_TERMINAL_LIMIT = _RUNTIME_CONFIG.get("terminalMaxUtf8Bytes")
if type(_TERMINAL_LIMIT) is not int or _TERMINAL_LIMIT <= 0:
    raise RuntimeError("runtime configuration must define terminalMaxUtf8Bytes")


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
                "configuredModel": "deepseek-flash",
                "baseUrl": "https://api.deepseek.com/v1",
                "reasoning": "disabled",
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


if _SCENARIO == "synthetic_terminal":
    sys.stdout.write(json.dumps(_terminal_envelope(""), separators=(",", ":")))
    sys.stdout.flush()
    os._exit(0)

if _SCENARIO == "invalid_terminal_envelope":
    sys.stdout.write("{}")
    sys.stdout.flush()
    os._exit(0)

if _SCENARIO == "invalid_retained_terminal":
    result = _terminal_envelope("")
    result["targetId"] = "rlcd-owned-target"
    cleanup = result["cleanup"]
    if not isinstance(cleanup, dict):
        raise AssertionError("terminal fixture cleanup must be an object")
    cleanup["taskTab"] = "retained"
    sys.stdout.write(json.dumps(result, separators=(",", ":")))
    sys.stdout.flush()
    os._exit(0)

if _SCENARIO == "unsafe_terminal_number":
    result = _terminal_envelope("")
    usage = result["usage"]
    if not isinstance(usage, dict):
        raise AssertionError("terminal fixture usage must be an object")
    usage["records"] = [
        {
            "source": "jev_decision",
            "model": "jev-1.13.0",
            "usage": {"unsafe_integer": 10**400},
        }
    ]
    sys.stdout.write(json.dumps(result, separators=(",", ":")))
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
from browser_harness import admin
from browser_harness import helpers as harness_helpers
from jev_ultrafast import browser, model

_SHARED_STATE_PATH = os.environ.get("RLCD_TEST_SHARED_STATE_MARKER")
_STATE = {
    "url": (
        "about:blank"
        if _SCENARIO == "borrowed_about_blank"
        else "https://example.test/existing"
    ),
    "destination": False,
    "typed": "",
}
if _SHARED_STATE_PATH and Path(_SHARED_STATE_PATH).exists():
    loaded_state = json.loads(Path(_SHARED_STATE_PATH).read_text(encoding="utf-8"))
    if isinstance(loaded_state, dict):
        _STATE.update(loaded_state)


def _persist_state() -> None:
    if _SHARED_STATE_PATH:
        Path(_SHARED_STATE_PATH).write_text(
            json.dumps(_STATE, sort_keys=True), encoding="utf-8"
        )


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
    acknowledgement_marker = os.environ.get("RLCD_TEST_TERM_ACK_MARKER")

    def _acknowledge_term(_signum: int, _frame: object) -> None:
        if acknowledgement_marker:
            Path(acknowledgement_marker).write_text(
                f"term-acknowledged:{os.getpid()}", encoding="utf-8"
            )

    signal.signal(signal.SIGTERM, _acknowledge_term)
    marker = os.environ.get("RLCD_TEST_PID_MARKER")
    if marker:
        Path(marker).write_text(str(os.getpid()), encoding="utf-8")
    secret = os.environ.get("TYPESAFE_API_KEY", "")
    sys.stdout.write(f"raw-child-secret {secret} " + "X" * 100_000)
    sys.stdout.flush()
    time.sleep(30)

if _SCENARIO in {"exit_before_stdio_close", "exit_before_stdio_overflow"}:
    descendant_program = "import time; time.sleep(1.4)"
    if _SCENARIO == "exit_before_stdio_overflow":
        descendant_program += "; import os; os.write(1, b'X' * 20000)"
    descendant = subprocess.Popen(
        [sys.executable, "-S", "-c", descendant_program],
        stdin=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    marker = os.environ.get("RLCD_TEST_PID_MARKER")
    if marker:
        Path(marker).write_text(str(descendant.pid), encoding="utf-8")

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


def _target_infos():
    if _SCENARIO == "list_error":
        raise RuntimeError("synthetic tab discovery failed")
    if _SCENARIO == "list_empty":
        return [
            {
                "targetId": "INTERNAL",
                "type": "page",
                "title": "Settings",
                "url": "chrome://settings/",
            },
            {
                "targetId": "WORKER",
                "type": "service_worker",
                "title": "Worker",
                "url": "https://example.test/worker.js",
            },
        ]
    if _SCENARIO == "list_tabs":
        return [
            {
                "targetId": "TAB-Z",
                "type": "page",
                "title": "Second duplicate",
                "url": "https://example.test/same",
            },
            {
                "targetId": "TAB-A",
                "type": "page",
                "title": "First duplicate",
                "url": "https://example.test/same",
            },
            {
                "targetId": "TAB-BLANK",
                "type": "page",
                "title": "",
                "url": "about:blank",
            },
            {
                "targetId": "INTERNAL",
                "type": "page",
                "title": "Settings",
                "url": "chrome://settings/",
            },
        ]
    if _SCENARIO == "list_omission":
        items = [
            {
                "targetId": f"TAB-{index:03d}",
                "type": "page",
                "title": "T" * 700,
                "url": "https://example.test/" + "U" * 2_500,
            }
            for index in range(40)
        ]
        items[0]["title"] = os.environ.get("TYPESAFE_API_KEY", "") + "T" * 700
        items[0]["url"] = (
            "https://example.test/?value="
            + os.environ.get("TEXT_MODEL_API_KEY", "")
            + "U" * 2_500
        )
        items.extend(
            [
                {
                    "targetId": "X" * 600,
                    "type": "page",
                    "title": "overlong id",
                    "url": "https://example.test/overlong-id",
                },
                {
                    "targetId": os.environ.get("TYPESAFE_API_KEY", ""),
                    "type": "page",
                    "title": "credential-shaped id",
                    "url": "https://example.test/credential-id",
                },
            ]
        )
        return list(reversed(items))
    if _SCENARIO in {"borrowed_missing", "borrowed_closed"}:
        return []
    if _SCENARIO == "borrowed_unsuitable":
        return [
            {
                "targetId": "rlcd-borrowed-target",
                "type": "page",
                "title": "Internal",
                "url": "chrome://settings/",
            }
        ]
    return [
        {
            "targetId": "rlcd-borrowed-target",
            "type": "page",
            "title": "Borrowed fixture",
            "url": _STATE["url"],
        }
    ]


def _cdp(method, session_id=None, **params):
    if method == "Target.getTargets":
        _append("RLCD_TEST_BROWSER_MARKER", "get-targets")
        return {"targetInfos": _target_infos()}
    if method == "Target.createTarget":
        _append("RLCD_TEST_BROWSER_MARKER", "created:rlcd-owned-target")
        return {"targetId": "rlcd-owned-target"}
    if method == "Target.attachToTarget":
        target_id = params.get("targetId")
        _append("RLCD_TEST_BROWSER_MARKER", f"attach:{target_id}")
        if _SCENARIO == "constructor_interrupt":
            os.kill(os.getpid(), signal.SIGTERM)
        if target_id == "rlcd-borrowed-target":
            return {"sessionId": "rlcd-borrowed-session"}
        return {"sessionId": "rlcd-owned-session"}
    if method == "Target.detachFromTarget":
        detached = params.get("sessionId")
        _append("RLCD_TEST_BROWSER_MARKER", f"detach:{detached}")
        if _SCENARIO == "borrowed_detach_failure":
            raise RuntimeError("synthetic detach failure")
        return {}
    if method == "Target.closeTarget":
        target_id = params.get("targetId")
        _append("RLCD_TEST_BROWSER_MARKER", f"close:{target_id}")
        if target_id != "rlcd-owned-target":
            raise RuntimeError("attempted to close an unrelated target")
        return {"success": _SCENARIO not in {"close_false", "slow_close_false"}}
    if method == "Page.navigate":
        _STATE["url"] = params["url"]
        _STATE["destination"] = False
        _persist_state()
        _append(
            "RLCD_TEST_BROWSER_MARKER",
            f"navigate:{session_id}:{params['url']}",
        )
        return {"frameId": "fixture-frame"}
    if method == "Emulation.setFocusEmulationEnabled":
        enabled = params.get("enabled")
        _append(
            "RLCD_TEST_BROWSER_MARKER", f"focus:{session_id}:{str(enabled).lower()}"
        )
        if not enabled and _SCENARIO == "borrowed_focus_release_failure":
            raise RuntimeError("synthetic focus release failure")
        return {}
    if method.startswith("Emulation."):
        return {}
    if method == "Input.dispatchMouseEvent":
        if params.get("type") == "mouseReleased":
            _STATE["destination"] = True
            _persist_state()
            _append("RLCD_TEST_BROWSER_MARKER", "click:continue")
        return {}
    if method == "Input.dispatchKeyEvent":
        return {}
    if method == "Input.insertText":
        value = params["text"]
        _STATE["typed"] = value
        _persist_state()
        _append("RLCD_TEST_FIELD_MARKER", f"value:{value}")
        return {}
    if method == "Runtime.evaluate":
        expression = params.get("expression", "")
        if expression == "document.readyState":
            value = "complete"
        elif expression == "JSON.stringify({url:location.href,topLevel:self===top})":
            value = json.dumps({"url": _STATE["url"], "topLevel": True})
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
            if _SCENARIO == "borrowed_constructor_error":
                raise RuntimeError("synthetic borrowed initial observation failure")
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
    if body.get("model") != "deepseek-flash":
        raise RuntimeError("native helper request did not forward deepseek-flash")
    if body.get("thinking") != {"type": "disabled"}:
        raise RuntimeError("native helper request did not disable thinking natively")
    if "reasoning" in body:
        raise RuntimeError(
            "native helper request retained the OpenRouter reasoning field"
        )
    if body.get("response_format") != {"type": "json_object"}:
        raise RuntimeError("native helper request did not retain JSON-object output")
    if body.get("max_tokens") != 1024:
        raise RuntimeError("native helper request did not retain the output token cap")
    if os.environ.get("TEXT_MODEL_BASE_URL") != "https://api.deepseek.com/v1":
        raise RuntimeError("runner did not select the direct DeepSeek helper base URL")
    if os.environ.get("TEXT_MODEL") != "deepseek-flash":
        raise RuntimeError("runner did not select deepseek-flash")
    if os.environ.get("TEXT_MODEL_REASONING") != "disabled":
        raise RuntimeError("runner did not preserve native thinking disablement")
    if key != os.environ.get("TEXT_MODEL_API_KEY"):
        raise RuntimeError("native helper did not receive its child environment key")

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
        if url != "https://api.deepseek.com/v1/chat/completions":
            raise RuntimeError(
                "native helper request did not use the direct DeepSeek URL"
            )
        return _helper_response(key, body)

    if os.environ.get("TYPESAFE_MODEL") != "jev-1.13.0":
        raise RuntimeError("runner did not select the pinned Jev model")
    if key != os.environ.get("TYPESAFE_API_KEY"):
        raise RuntimeError("native Jev call did not receive its child environment key")
    if _SCENARIO == "model_error":
        raise RuntimeError("provider failed before a decision")
    if _SCENARIO in {"slow_model", "slow_close_false"}:
        time.sleep(30)
    if _SCENARIO == "stdout_eof_while_alive":
        _append("RLCD_TEST_BROWSER_MARKER", "stdout:eof")
        os.close(sys.stdout.fileno())
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
            os.environ.get("TYPESAFE_API_KEY", "missing"): 11,
            os.environ.get("TEXT_MODEL_API_KEY", "missing"): 22,
            "unsafe_integer": 10**400,
            "fractional_cost": 0.125,
            "not_finite": math.inf,
        }
    if _SCENARIO == "terminal_overflow":
        usage = {f"large-key-{index}": "V" * 5_000 for index in range(40)}

    return {
        "model": reported_model,
        "answers": answers,
        "usage": usage,
    }


model.post_json = _post_json


if _SCENARIO == "post_constructor_interrupt":
    _OriginalAgent = jev_ultrafast.Agent

    class _PostConstructionInterruptAgent:
        def __init__(self, *args, **kwargs):
            self._agent = _OriginalAgent(*args, **kwargs)
            self._interrupted = False

        @property
        def browser(self):
            if not self._interrupted:
                self._interrupted = True
                os.kill(os.getpid(), signal.SIGTERM)
            return self._agent.browser

        @property
        def state(self):
            return self._agent.state

        def run(self):
            yield from self._agent.run()

    jev_ultrafast.Agent = _PostConstructionInterruptAgent
