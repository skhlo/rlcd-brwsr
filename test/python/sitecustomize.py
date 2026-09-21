"""Deterministic external browser/model adapters for registered-tool tests.

The production bridge and pinned Jev Agent stay real. Tests replace only the
Browser Harness CDP transport, exact-daemon check, and model provider response.
"""

import json
import os
import re
import time
import urllib.request

from browser_harness import admin, helpers
from jev_ultrafast import browser, model

_SCENARIO = os.environ.get("RLCD_TEST_SCENARIO", "click_done")
_STATE = {
    "url": "about:blank",
    "destination": False,
    "clicks": 0,
}


def _require_existing_daemon(name=None):
    expected = os.environ.get("RLCD_TEST_EXPECTED_DAEMON", "rlcd-brwsr-test")
    if _SCENARIO == "missing_daemon":
        raise RuntimeError(f"required daemon {name!r} is not running")
    if name != expected:
        raise RuntimeError(f"unexpected daemon {name!r}; expected {expected!r}")


def _daemon_browser_kind(name=None):
    _require_existing_daemon(name)
    return "cloud" if _SCENARIO == "remote_daemon" else "cdp"


def _ensure_daemon(wait=None, name=None, env=None):
    del wait, env
    _require_existing_daemon(name)


admin.ensure_daemon = _ensure_daemon
admin.require_existing_daemon = _require_existing_daemon
admin.daemon_browser_kind = _daemon_browser_kind


class _FakeHttpResponse:
    def __init__(self, value):
        self._body = json.dumps(value).encode()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self._body


def _urlopen(url, timeout=None):
    del timeout
    if not str(url).endswith("/json/list"):
        raise AssertionError(f"unexpected fake endpoint request: {url}")
    target_id = (
        "other-browser-target"
        if _SCENARIO == "mismatched_daemon"
        else "selected-browser-target"
    )
    return _FakeHttpResponse([{"id": target_id, "type": "page"}])


urllib.request.urlopen = _urlopen


def _page():
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
    if method in {"Input.dispatchKeyEvent", "Input.insertText"}:
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


def _daemon_cdp(method, session_id=None, **params):
    del session_id, params
    if method != "Target.getTargets":
        raise AssertionError(f"unexpected daemon identity CDP method: {method}")
    target_id = (
        "daemon-browser-target"
        if _SCENARIO == "mismatched_daemon"
        else "selected-browser-target"
    )
    return {"targetInfos": [{"targetId": target_id, "type": "page"}]}


helpers.cdp = _daemon_cdp


def _choice(criteria, selected):
    return {
        "choice": selected,
        "confidence": 1.0,
        "probabilities": {key: float(key == selected) for key in criteria},
    }


def _post_json(_url, key, body):
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
