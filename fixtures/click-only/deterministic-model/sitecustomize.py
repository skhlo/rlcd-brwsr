"""Deterministic Jev provider reply for real-browser acceptance runs.

This replaces only the paid HTTP response. The pinned upstream Agent, its DOM
observation and policy wiring, Browser Harness, and Chrome remain real.
"""

import os
import time
from pathlib import Path

from jev_ultrafast import model


def _choice(criteria, selected):
    return {
        "choice": selected,
        "confidence": 1.0,
        "probabilities": {key: float(key == selected) for key in criteria},
    }


def _deterministic_post_json(_url, _key, body):
    delay_seconds = float(os.environ.get("RLCD_ACCEPTANCE_MODEL_DELAY_SECONDS", "0"))
    marker = os.environ.get("RLCD_ACCEPTANCE_MODEL_MARKER")
    if marker:
        Path(marker).write_text(
            f"provider entered by bridge pid {os.getpid()}\n", encoding="utf-8"
        )
    if delay_seconds > 0:
        time.sleep(delay_seconds)

    questions = body["questions"]
    operations = questions["operation"]["criteria"]
    page = body["state"]["page"]
    destination_visible = "Acceptance marker: ORBIT-27" in page["text"]
    operation = "DONE" if destination_visible else "CLICK"
    answers = {"operation": _choice(operations, operation)}
    if operation == "CLICK":
        candidates = questions["click_target"]["criteria"]
        selected = next(
            key
            for key, candidate in candidates.items()
            if "Continue to the verified destination" in candidate["element"]
        )
        answers["click_target"] = _choice(candidates, selected)
    return {
        "model": "deterministic-fixture-responder-not-paid-jev",
        "answers": answers,
        "usage": {"input_tokens": 0, "output_tokens": 0},
    }


model.post_json = _deterministic_post_json
