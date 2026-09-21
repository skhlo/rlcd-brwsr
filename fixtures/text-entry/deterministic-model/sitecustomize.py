"""Deterministic external replies for the real-browser #11 acceptance run.

This replaces only paid Jev and text-helper HTTP responses. The pinned upstream
Agent, its field-context construction and value validation, Browser Harness,
and Chrome remain real.
"""

import json
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


def _record_helper_summary(url, body, context):
    path = os.environ.get("RLCD_ACCEPTANCE_HELPER_MARKER")
    if not path:
        return
    Path(path).write_text(
        json.dumps(
            {
                "externalReply": "synthetic deterministic text helper",
                "endpoint": url,
                "configuredModel": body.get("model"),
                "field": context.get("field", {}).get("label"),
                "goal": context.get("goal"),
                "returnedValue": "Busan",
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def _deterministic_post_json(url, _key, body):
    if "messages" in body:
        context = json.loads(body["messages"][1]["content"])
        field = context.get("field", {}).get("label", "")
        goal = context.get("goal", "")
        page_text = context.get("page", {}).get("text", "")
        if (
            not field.startswith("Destination city")
            or "second-largest city" not in goal
            or "Waiting for a valid destination" not in page_text
        ):
            raise RuntimeError("upstream field context was not preserved")
        _record_helper_summary(url, body, context)
        return {
            "model": "synthetic-helper-provider-reported-id",
            "choices": [
                {"message": {"content": json.dumps({"text": "Busan"})}}
            ],
            "usage": {"prompt_tokens": 23, "completion_tokens": 4},
        }

    questions = body["questions"]
    operations = questions["operation"]["criteria"]
    page = body["state"]["page"]
    complete = "Acceptance marker: FIELD-41" in page["text"]
    operation = "DONE" if complete else "TYPE_TEXT"
    if complete:
        # Keep the owned task target present long enough for a separate observer
        # to inspect its field and visible marker before default cleanup closes it.
        time.sleep(4)
    answers = {"operation": _choice(operations, operation)}
    if operation == "TYPE_TEXT":
        candidates = questions["type_text_target"]["criteria"]
        selected = next(
            key
            for key, candidate in candidates.items()
            if "Destination city" in candidate["element"]
        )
        answers["type_text_target"] = _choice(candidates, selected)
    return {
        "model": "synthetic-jev-provider-reported-id",
        "answers": answers,
        "usage": {"input_tokens": 31, "output_tokens": 5},
    }


model.post_json = _deterministic_post_json
