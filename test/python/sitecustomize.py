"""Deterministic external browser/model adapters for registered-tool tests.

The production bridge and pinned Jev Agent stay real. Tests replace only the
Browser Harness CDP transport, exact-daemon check, and model provider response.
"""

import json
import os
import re
import sys
import time
from pathlib import Path

from browser_harness import admin
from jev_ultrafast import browser, model

_SCENARIO = os.environ.get("RLCD_TEST_SCENARIO", "click_done")
_STATE = {
    "url": "about:blank",
    "destination": False,
    "clicks": 0,
    "typed_text": "",
}


def _mark_external_work(environment_key):
    marker = os.environ.get(environment_key)
    if marker:
        Path(marker).write_text("called", encoding="utf-8")


_argv_marker = os.environ.get("RLCD_TEST_ARGV_MARKER")
if _argv_marker:
    Path(_argv_marker).write_text(json.dumps(sys.argv), encoding="utf-8")


def _resolved_daemon_name(name):
    return name or admin.NAME


def _require_existing_daemon(name=None):
    resolved_name = _resolved_daemon_name(name)
    expected = os.environ.get("RLCD_TEST_EXPECTED_DAEMON", "rlcd-brwsr-test")
    if _SCENARIO == "missing_daemon":
        raise RuntimeError(f"required daemon {resolved_name!r} is not running")
    if resolved_name != expected:
        raise RuntimeError(
            f"unexpected daemon {resolved_name!r}; expected {expected!r}"
        )


def _daemon_browser_kind(name=None):
    _require_existing_daemon(name)
    return "cloud" if _SCENARIO == "remote_daemon" else "cdp"


def _ensure_daemon(wait=None, name=None, env=None):
    del wait, env
    _mark_external_work("RLCD_TEST_DAEMON_START_MARKER")
    _require_existing_daemon(name)


admin.ensure_daemon = _ensure_daemon
admin.require_existing_daemon = _require_existing_daemon
admin.daemon_browser_kind = _daemon_browser_kind


def _page():
    if _SCENARIO.startswith("text_"):
        helper_secret = (
            os.environ.get("TEXT_MODEL_API_KEY", "")
            if _SCENARIO == "text_secret_error"
            else ""
        )
        if _STATE["typed_text"]:
            return {
                "url": _STATE["url"],
                "title": "Generated field fixture complete",
                "text": (
                    "Accepted generated destination: "
                    f"{_STATE['typed_text']}. Marker: FIELD-41"
                ),
                "scroll": {"y": 0},
                "actions": [{"id": "wait", "kind": "wait", "label": "Wait"}],
                "marker": "text-complete",
                "page_key": "text-complete",
                "guards": {},
            }
        return {
            "url": _STATE["url"],
            "title": "Generated field fixture",
            "text": (
                "Enter the destination city requested by the goal. "
                f"A valid value reveals marker FIELD-41. {helper_secret}"
            ),
            "scroll": {"y": 0},
            "actions": [
                {
                    "id": "destination-city",
                    "kind": "fill",
                    "label": f"Destination city {helper_secret}".strip(),
                    "role": "textbox",
                    "value": "",
                    "node": 21,
                },
                {"id": "wait", "kind": "wait", "label": "Wait"},
            ],
            "marker": "text-start",
            "page_key": "text-start",
            "guards": {"21": "guard-21"},
        }
    if _STATE["destination"]:
        suffix = "X" * 20_000 if _SCENARIO == "large_evidence" else ""
        destination_url = "http://127.0.0.1:43113/destination.html"
        if _SCENARIO == "large_trace":
            destination_url += f"?state={_STATE['clicks']}-" + "u" * 1_900
        return {
            "url": destination_url,
            "title": "Fixture destination",
            "text": "Verified fixture destination marker: ORBIT-27 " + suffix,
            "scroll": {"y": 0},
            "actions": [
                {
                    "id": "again",
                    "kind": "click",
                    "label": "Advance again",
                    "role": "button",
                    "value": "",
                    "node": 11,
                },
                {"id": "wait", "kind": "wait", "label": "Wait"},
            ],
            "marker": f"destination-{_STATE['clicks']}",
            "page_key": f"destination-{_STATE['clicks']}",
            "guards": {"11": "guard-11"},
        }
    return {
        "url": _STATE["url"],
        "title": "Fixture start",
        "text": "Click Continue to reach the independently verifiable marker.",
        "scroll": {"y": 0},
        "actions": [
            {
                "id": "continue",
                "kind": "click",
                "label": "Continue to fixture destination",
                "role": "link",
                "value": "",
                "node": 10,
            },
            {
                "id": "search",
                "kind": "fill",
                "label": "Optional search",
                "role": "textbox",
                "value": "",
                "node": 12,
            },
            {"id": "wait", "kind": "wait", "label": "Wait"},
        ],
        "marker": "start",
        "page_key": "start",
        "guards": {"10": "guard-10", "12": "guard-12"},
    }


def _cdp(method, session_id=None, **params):
    del session_id
    _mark_external_work("RLCD_TEST_BROWSER_WORK_MARKER")
    if method == "Target.createTarget":
        return {"targetId": "rlcd-owned-target"}
    if method == "Target.attachToTarget":
        return {"sessionId": "rlcd-owned-session"}
    if method == "Target.closeTarget":
        return {"success": True}
    if method == "Page.navigate":
        _STATE["url"] = params["url"]
        return {"frameId": "fixture-frame"}
    if method.startswith("Emulation."):
        return {}
    if method == "Input.dispatchMouseEvent":
        if params.get("type") == "mouseReleased":
            _STATE["clicks"] += 1
            _STATE["destination"] = True
        return {}
    if method == "Input.insertText":
        _STATE["typed_text"] = params["text"]
        _mark_external_work("RLCD_TEST_FIELD_MUTATION_MARKER")
        return {}
    if method == "Input.dispatchKeyEvent":
        return {}
    if method == "Runtime.evaluate":
        expression = params.get("expression", "")
        if expression == "document.readyState":
            value = "complete"
        elif "if (!document.body) return null" in expression and "const state=" not in expression:
            value = _page()
        elif "return state?.marker ?? null" in expression:
            value = _page()["marker"]
        elif "return c ? [c.pageKey()" in expression:
            match = re.search(r"nodes\.get\((\d+)\)", expression)
            node = match.group(1) if match else ""
            current = _page()
            value = [current["page_key"], current["guards"].get(node)]
        elif "return {x,y}" in expression:
            value = {"x": 100, "y": 100}
        else:
            value = None
        return {"result": {"value": value}}
    raise AssertionError(f"unexpected fake CDP method: {method}")


browser.cdp = _cdp


def _choice(criteria, selected):
    return {
        "choice": selected,
        "confidence": 1.0,
        "probabilities": {key: float(key == selected) for key in criteria},
    }


def _post_json(url, key, body):
    if "messages" in body:
        _mark_external_work("RLCD_TEST_HELPER_REQUEST_MARKER")
        if url != "http://127.0.0.1:43115/v1/chat/completions":
            raise RuntimeError("text helper used an unexpected endpoint")
        if (
            _SCENARIO != "text_secret_error"
            and key != "synthetic-text-helper-key"
        ):
            raise RuntimeError("text helper used an unexpected credential")
        if body.get("model") != "synthetic-text-helper-v1":
            raise RuntimeError("text helper used an unexpected model")
        context = json.loads(body["messages"][1]["content"])
        if (
            not context.get("field", {}).get("label", "").startswith(
                "Destination city"
            )
            or "second-largest city" not in context.get("goal", "")
            or "FIELD-41" not in context.get("page", {}).get("text", "")
        ):
            raise RuntimeError("upstream field context was not preserved")
        if _SCENARIO == "text_malformed":
            content = "not-json"
        elif _SCENARIO == "text_empty":
            content = json.dumps({"text": " "})
        elif _SCENARIO == "text_provider_failure":
            raise RuntimeError("Model connection failed; no action executed.")
        elif _SCENARIO == "text_status_failure":
            raise RuntimeError("Model provider returned HTTP 503; no action executed.")
        elif _SCENARIO == "text_secret_error":
            raise RuntimeError(
                f"Model provider rejected Authorization: Bearer {key}; "
                f"status detail {key}; no action executed."
            )
        else:
            content = json.dumps({"text": "Busan"})
        return {
            "model": "reported-text-helper-external-fake",
            "choices": [{"message": {"content": content}}],
            "usage": {"prompt_tokens": 19, "completion_tokens": 4},
        }

    if os.environ.get("TYPESAFE_MODEL") != "jev-1.13.0":
        raise RuntimeError("the wrapper did not select the pinned Jev model")
    if _SCENARIO == "provider_secret_error":
        raise RuntimeError(f"provider rejected synthetic credential {key}")
    if _SCENARIO in {"slow_model", "cancel_model"}:
        time.sleep(30)

    questions = body["questions"]
    operations = questions["operation"]["criteria"]
    if _SCENARIO == "needs_text":
        operation = "TYPE_TEXT"
    elif _SCENARIO.startswith("text_"):
        operation = "DONE" if _STATE["typed_text"] else "TYPE_TEXT"
    elif _SCENARIO == "blocked":
        operation = "BLOCKED"
    elif _SCENARIO in {"always_click", "large_trace"}:
        operation = "CLICK"
    elif _SCENARIO == "wait_heavy":
        operation = "WAIT"
    else:
        operation = "DONE" if _STATE["destination"] else "CLICK"

    answers = {"operation": _choice(operations, operation)}
    target_name = operation.lower() + "_target"
    if operation in {"CLICK", "TYPE_TEXT", "SELECT"}:
        candidates = questions[target_name]["criteria"]
        selected = next(iter(candidates))
        answers[target_name] = _choice(candidates, selected)
    return {
        "model": "deterministic-jev-external-fake",
        "answers": answers,
        "usage": {"input_tokens": 17, "output_tokens": 3},
    }


model.post_json = _post_json
