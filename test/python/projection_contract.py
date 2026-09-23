#!/usr/bin/env python3
"""Direct contract checks for bounded run-result projection."""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "bridge"))

import rlcd_brwsr_bridge as bridge  # noqa: E402


def _text_helper(result: dict[str, object]) -> dict[str, object]:
    models = result["models"]
    assert isinstance(models, dict)
    helper = models["textHelper"]
    assert isinstance(helper, dict)
    return helper


def _raw(state: dict[str, object] | None = None) -> dict[str, object]:
    return bridge._raw_projection(
        status="error",
        stop_reason="error",
        execution="unknown",
        cleanup="unknown",
        target_id="rlcd-owned-target",
        state=state,
        diagnostic={"type": "FixtureError", "message": "fixture diagnostic"},
    )


def assert_owned_producers_omit_availability() -> None:
    results = [
        _raw(),
        bridge._early_result("stopped", "cancelled", "StopRequested", "stop"),
        bridge._postdispatch_result("error", "error", RuntimeError("failure")),
    ]
    for result in results:
        helper = _text_helper(result)
        assert "availability" not in helper
        assert helper == {
            "configuredModel": "inclusionai/ling-3.0-flash",
            "baseUrl": "https://openrouter.ai/api/v1",
            "reasoning": "none",
        }


def assert_oversized_state_is_bounded_without_agent_mutation() -> None:
    typesafe_key = "synthetic-projection-typesafe-key"
    helper_key = "synthetic-projection-helper-key"
    state: dict[str, object] = {
        "page": {
            "url": "https://example.test/" + "U" * 1_100,
            "title": "Fixture",
            "text": "page " + typesafe_key,
        },
        "history": [
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
        ],
        "decisions": [
            {
                "model": "fixture-model",
                "usage": {
                    typesafe_key: 11,
                    helper_key: 22,
                    "fractional_cost": 0.125,
                },
            }
        ],
    }
    raw = _raw(state)
    raw["diagnostic"] = {
        "type": "FixtureError",
        "message": f"keys={typesafe_key},{helper_key}",
    }
    terminal = bridge._finalize(raw, credentials=(typesafe_key, helper_key))
    assert len(terminal) <= bridge.TERMINAL_MAX_UTF8_BYTES
    text = terminal.decode("utf-8")
    assert typesafe_key not in text
    assert helper_key not in text
    assert "[REDACTED]" in text

    result = json.loads(terminal)
    assert "availability" not in _text_helper(result)
    history = result["history"]
    assert isinstance(history, list)
    assert len(history) < 16
    output = result["output"]
    assert isinstance(output, dict)
    omissions = output["omissions"]
    assert isinstance(omissions, list)
    assert "history action fields" in omissions
    assert "history URL fields" in omissions
    assert "history records" in omissions


def main() -> int:
    assert_owned_producers_omit_availability()
    assert_oversized_state_is_bounded_without_agent_mutation()
    print("projection contract: 2 checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
