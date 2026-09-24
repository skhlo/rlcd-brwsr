"""Deterministic external replies for real-browser text-entry acceptance.

The pinned Agent, native field-context/value validation, Browser Harness, Chrome,
and production runner remain real. This replaces only Jev and helper provider
HTTP replies; no live model call is made.
"""

import json
import time

from jev_ultrafast import model


def _choice(criteria, selected):
    return {
        "choice": selected,
        "confidence": 1.0,
        "probabilities": {key: float(key == selected) for key in criteria},
    }


def _deterministic_post_json(url, _key, body):
    if "questions" not in body:
        if url != "https://api.deepseek.com/v1/chat/completions":
            raise RuntimeError("production runner did not use the direct DeepSeek URL")
        if body.get("model") != "deepseek-flash":
            raise RuntimeError("production runner did not forward deepseek-flash")
        if body.get("thinking") != {"type": "disabled"}:
            raise RuntimeError("production runner did not disable thinking natively")
        if "reasoning" in body:
            raise RuntimeError(
                "production runner retained the OpenRouter reasoning field"
            )
        if body.get("response_format") != {"type": "json_object"}:
            raise RuntimeError("production runner did not retain JSON-object output")
        if body.get("max_tokens") != 1024:
            raise RuntimeError("production runner did not retain the output token cap")
        return {
            "choices": [{"message": {"content": json.dumps({"text": "Busan"})}}],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0},
        }

    questions = body["questions"]
    operations = questions["operation"]["criteria"]
    page = body["state"]["page"]
    complete = "Acceptance marker: FIELD-41" in page["text"]
    operation = "DONE" if complete else "TYPE_TEXT"
    if complete:
        # Keep the exact task target present long enough for an independent CDP
        # observer to inspect its field and marker before default cleanup.
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
