"""Deterministic Jev provider reply for the real-browser #10 acceptance run.

This replaces only the paid HTTP response. The pinned upstream Agent, its DOM
observation and policy wiring, Browser Harness, and Chrome remain real.
"""

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
