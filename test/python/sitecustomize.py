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

from browser_harness import admin, helpers as harness_helpers
from jev_ultrafast import browser, model

_SCENARIO = os.environ.get("RLCD_TEST_SCENARIO", "click_done")
_STATE = {
    "url": "about:blank",
    "destination": False,
    "clicks": 0,
    "typed_text": "",
    "fresh_checks": 0,
    "stale_click_checks": 0,
}


def _mark_external_work(environment_key, value="called"):
    marker = os.environ.get(environment_key)
    if marker:
        with Path(marker).open("a", encoding="utf-8") as marker_file:
            marker_file.write(f"{value}\n")


_argv_marker = os.environ.get("RLCD_TEST_ARGV_MARKER")
if _argv_marker:
    Path(_argv_marker).write_text(json.dumps(sys.argv), encoding="utf-8")

if _SCENARIO in {"terminal_abnormal", "retained_terminal_hang"}:
    _terminal_output = sys.stdout

    class _TerminalExitBehavior:
        def write(self, value):
            written = _terminal_output.write(value)
            _terminal_output.flush()
            if '\"type\":\"result\"' in value:
                if _SCENARIO == "terminal_abnormal":
                    os._exit(25)
                time.sleep(30)
            return written

        def flush(self):
            return _terminal_output.flush()

        def __getattr__(self, name):
            return getattr(_terminal_output, name)

    sys.stdout = _TerminalExitBehavior()

_protocol_marker = os.environ.get("RLCD_TEST_PROTOCOL_MARKER")
if _protocol_marker:
    _protocol_output = sys.stdout
    _protocol_capture = Path(_protocol_marker).open("w", encoding="utf-8")

    class _ProtocolTee:
        def write(self, value):
            _protocol_capture.write(value)
            _protocol_capture.flush()
            return _protocol_output.write(value)

        def flush(self):
            _protocol_capture.flush()
            return _protocol_output.flush()

        def __getattr__(self, name):
            return getattr(_protocol_output, name)

    sys.stdout = _ProtocolTee()


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
        _mark_external_work("RLCD_TEST_TARGET_EVENTS_MARKER", "created:rlcd-owned-target")
        return {"targetId": "rlcd-owned-target"}
    if method == "Target.attachToTarget":
        return {"sessionId": "rlcd-owned-session"}
    if method == "Target.closeTarget":
        target_id = params.get("targetId")
        _mark_external_work("RLCD_TEST_TARGET_EVENTS_MARKER", f"close:{target_id}")
        if target_id != "rlcd-owned-target":
            raise RuntimeError(f"attempted to close unrelated target {target_id!r}")
        if _SCENARIO == "bridge_death_cleanup_unconfirmed":
            secret = os.environ.get("TEXT_MODEL_API_KEY", "")
            raise RuntimeError(
                f"targeted cleanup transport unavailable for credential {secret}"
            )
        if _SCENARIO == "slow_primary_cleanup":
            marker = os.environ.get("RLCD_TEST_TARGET_EVENTS_MARKER")
            close_count = (
                Path(marker).read_text(encoding="utf-8").count("close:")
                if marker
                else 0
            )
            if close_count == 1:
                time.sleep(30)
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
            if _SCENARIO == "cancel_dispatched_input":
                _mark_external_work("RLCD_TEST_PHASE_MARKER", "input-dispatched")
                time.sleep(30)
        return {}
    if method == "Input.insertText":
        _mark_external_work("RLCD_TEST_INPUT_DISPATCH_MARKER")
        if _SCENARIO == "text_cached_fill_failure":
            raise RuntimeError("cached fill failed after dispatched browser input")
        _STATE["typed_text"] = params["text"]
        _mark_external_work("RLCD_TEST_FIELD_MUTATION_MARKER")
        return {}
    if method == "Input.dispatchKeyEvent":
        return {}
    if method == "Runtime.evaluate":
        expression = params.get("expression", "")
        if "return state?.marker ?? null" in expression:
            _STATE["fresh_checks"] += 1
            if (
                _SCENARIO == "text_freshness_failure"
                and _STATE["fresh_checks"] == 2
            ):
                raise RuntimeError(
                    "Browser Harness transport failed during the pre-helper freshness check"
                )
            if (
                _SCENARIO == "text_cached_fill_failure"
                and _STATE["fresh_checks"] == 3
            ):
                value = "stale-before-first-fill"
        if expression == "document.readyState":
            value = "complete"
        elif "if (!document.body) return null" in expression and "const state=" not in expression:
            if _SCENARIO == "initial_observation_failure":
                raise RuntimeError("initial observation failed before ownership")
            if _SCENARIO == "cancel_observation" and _STATE["destination"]:
                _mark_external_work("RLCD_TEST_PHASE_MARKER", "observation-started")
                time.sleep(30)
            value = _page()
        elif "return state?.marker ?? null" in expression:
            if not (
                _SCENARIO == "text_cached_fill_failure"
                and _STATE["fresh_checks"] == 3
            ):
                value = _page()["marker"]
        elif "return c ? [c.pageKey()" in expression:
            match = re.search(r"nodes\.get\((\d+)\)", expression)
            node = match.group(1) if match else ""
            current = _page()
            _STATE["stale_click_checks"] += 1
            value = [current["page_key"], current["guards"].get(node)]
            if (
                _SCENARIO == "stale_click_once"
                and _STATE["stale_click_checks"] == 1
            ):
                value = ["stale-page", "stale-guard"]
        elif "return {x,y}" in expression:
            value = {"x": 100, "y": 100}
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


def _post_json(url, key, body):
    _mark_external_work("RLCD_TEST_MODEL_WORK_MARKER")
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
            print(f"external helper diagnostic echoed {key}", file=sys.stderr)
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
    if _SCENARIO in {
        "bridge_death_cleanup_confirmed",
        "bridge_death_cleanup_unconfirmed",
    }:
        os._exit(23)
    if _SCENARIO == "large_progress_malformed":
        progress = {
            "type": "progress",
            "phase": "observation",
            "observation": {
                "url": "u" * 14_000,
                "title": "synthetic" * 1_000 + "t" * 4_000 + '"' * 1_000,
                "evidence": "bounded partial evidence",
                "evidenceTruncated": False,
            },
            "executedActions": 0,
        }
        sys.stdout.write(json.dumps(progress, separators=(",", ":")) + "\n")
        sys.stdout.write("not-json-from-bridge\n")
        sys.stdout.flush()
        time.sleep(30)
    if _SCENARIO == "malformed_protocol":
        sys.stdout.write("not-json-from-bridge\n")
        sys.stdout.flush()
        time.sleep(30)
    if _SCENARIO == "truncated_protocol":
        sys.stdout.write('{"type":"progress"')
        sys.stdout.flush()
        os._exit(24)
    if _SCENARIO == "oversized_protocol":
        sys.stdout.write("X" * 32_001 + "\n")
        sys.stdout.flush()
        time.sleep(30)
    if _SCENARIO == "provider_secret_error":
        raise RuntimeError(f"provider rejected synthetic credential {key}")
    if _SCENARIO in {"slow_model", "cancel_model", "slow_primary_cleanup"}:
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
