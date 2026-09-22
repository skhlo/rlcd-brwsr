"""Deterministic Jev replies for the real-browser text-entry acceptance run.

A separate test-only Pi extension replaces external Luna completion. The pinned
Agent, its field-context construction and value validation, Browser Harness,
and Chrome remain real.
"""

import time

from jev_ultrafast import model


def _choice(criteria, selected):
    return {
        "choice": selected,
        "confidence": 1.0,
        "probabilities": {key: float(key == selected) for key in criteria},
    }


def _deterministic_post_json(_url, _key, body):
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
