#!/usr/bin/env python3
"""Direct contract checks for bounded run-result projection."""

from __future__ import annotations

import copy
import json
import os
from typing import Any

import handoff_report
import rlcd_brwsr_bridge as bridge


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
            "configuredModel": "deepseek-flash",
            "baseUrl": "https://api.deepseek.com/v1",
            "reasoning": "disabled",
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


def assert_candidate_bounds_do_not_split_oversized_tokens() -> None:
    oversized_identifier = "IDENTIFIER" * 80
    text = f"Prefix fact. {oversized_identifier} Suffix fact."
    candidates, omitted = handoff_report._page_candidates(text)
    assert omitted is True
    assert candidates
    assert all(
        len(candidate["exact"].encode("utf-8"))
        <= handoff_report.REPORT_CANDIDATE_MAX_UTF8_BYTES
        for candidate in candidates
    )
    assert all(oversized_identifier not in candidate["exact"] for candidate in candidates)
    assert all("IDENTIFIER" not in candidate["exact"] for candidate in candidates)

    larger_unsplittable_token = "界" * 100
    token_candidates, token_omitted = handoff_report._page_candidates(
        f"Prefix words {larger_unsplittable_token} suffix words"
    )
    assert token_omitted is False
    assert any(
        candidate["exact"] == larger_unsplittable_token
        for candidate in token_candidates
    )
    assert all(
        larger_unsplittable_token not in candidate["exact"]
        or candidate["exact"] == larger_unsplittable_token
        for candidate in token_candidates
    )

    pinned_length_text = "word " * 1200
    assert len(pinned_length_text) == 6000
    bounded_candidates, upstream_omitted = handoff_report._page_candidates(
        pinned_length_text
    )
    assert bounded_candidates
    assert upstream_omitted is True


def assert_candidate_and_request_pressure_preserve_coverage_or_disclose_omission() -> None:
    pressure_text = "\n".join(
        f"Field {index:03d}: value {index:03d}." for index in range(180)
    )
    candidates, source_omitted = handoff_report._page_candidates(pressure_text)
    assert source_omitted is False
    assert len(candidates) <= handoff_report.REPORT_CANDIDATE_LIMIT
    assert "Field 179: value 179." in candidates[-1]["exact"]
    cursor = 0
    for candidate in candidates:
        exact = candidate["exact"]
        start = pressure_text.index(exact, cursor)
        assert pressure_text[cursor:start].strip() == ""
        cursor = start + len(exact)
    assert pressure_text[cursor:].strip() == ""

    request_pressure_text = "\n".join(
        f"Line {index:03d}: " + "x" * 34 for index in range(120)
    )
    captured: dict[str, Any] = {}
    previous = os.environ.get("TYPESAFE_API_KEY")
    os.environ["TYPESAFE_API_KEY"] = "synthetic-projection-report-key"
    try:
        def reject_all(
            _url: str, _key: str, body: dict[str, Any]
        ) -> dict[str, Any]:
            captured.update(body)
            return {
                "model": "synthetic-report-model",
                "answers": {
                    question_id: {"type": "noul", "noul": 0.0}
                    for question_id in body["questions"]
                },
                "usage": {"input_tokens": 0, "output_tokens": 0},
            }

        result, _ = handoff_report.select_handoff(
            goal="Return the requested fact " + "g" * 30_000,
            page_text=request_pressure_text,
            history=[],
            model="jev-1.13.0",
            post_json=reject_all,
        )
    finally:
        if previous is None:
            os.environ.pop("TYPESAFE_API_KEY", None)
        else:
            os.environ["TYPESAFE_API_KEY"] = previous

    state = captured["state"]
    offered = state["candidates"]
    assert state["judgmentContext"] == request_pressure_text
    assert len(offered) < 120
    assert all("Line 119:" not in str(candidate.get("exact", "")) for candidate in offered)
    assert "Line 119:" in state["judgmentContext"]
    assert handoff_report._serialized_size(captured) <= 98_304
    assert result["sourceCoverage"] == "partial"
    assert result["sourceOmitted"] is True
    assert result["candidateCount"] == len(offered)


def assert_source_omissions_cover_rejected_actions_and_empty_candidates() -> None:
    previous = os.environ.get("TYPESAFE_API_KEY")
    os.environ["TYPESAFE_API_KEY"] = "synthetic-projection-report-key"
    try:
        def selected(_url: str, _key: str, body: dict[str, Any]) -> dict[str, Any]:
            return {
                "model": "synthetic-report-model",
                "answers": {
                    question_id: {"type": "noul", "noul": 0.9}
                    for question_id in body["questions"]
                },
                "usage": {"input_tokens": 0, "output_tokens": 0},
            }

        rejected, _ = handoff_report.select_handoff(
            goal="Retain source evidence",
            page_text="Valid page fact.",
            history=[
                {
                    "step": 1,
                    "operation": "O" * 129,
                    "action": "Valid label",
                    "page_changed": True,
                },
                {
                    "step": 2,
                    "operation": "CLICK",
                    "action": "A" * 513,
                    "page_changed": True,
                },
            ],
            model="jev-1.13.0",
            post_json=selected,
        )
        assert rejected["sourceCoverage"] == "partial"
        assert rejected["sourceOmitted"] is True
        assert rejected["candidateCount"] == 1

        provider_calls = 0

        def unexpected(
            _url: str, _key: str, body: dict[str, Any]
        ) -> dict[str, Any]:
            nonlocal provider_calls
            provider_calls += 1
            return selected(_url, _key, body)

        empty, _ = handoff_report.select_handoff(
            goal="Retain the oversized identifier",
            page_text="X" * 513,
            history=[],
            model="jev-1.13.0",
            post_json=unexpected,
        )
        assert provider_calls == 0
        assert empty["status"] == "missing"
        assert empty["sourceCoverage"] == "partial"
        assert empty["sourceOmitted"] is True
        assert empty["candidateCount"] == 0
    finally:
        if previous is None:
            os.environ.pop("TYPESAFE_API_KEY", None)
        else:
            os.environ["TYPESAFE_API_KEY"] = previous


def assert_action_identity_keeps_distinct_steps() -> None:
    previous = os.environ.get("TYPESAFE_API_KEY")
    os.environ["TYPESAFE_API_KEY"] = "synthetic-projection-report-key"
    try:
        def select_all(
            _url: str, _key: str, body: dict[str, Any]
        ) -> dict[str, Any]:
            return {
                "model": "synthetic-report-model",
                "answers": {
                    question_id: {"type": "noul", "noul": 0.9}
                    for question_id in body["questions"]
                },
                "usage": {"input_tokens": 0, "output_tokens": 0},
            }

        selected, _ = handoff_report.select_handoff(
            goal="Retain the action steps",
            page_text="",
            history=[
                {
                    "step": 3,
                    "operation": "CLICK",
                    "action": "Open details",
                    "page_changed": True,
                },
                {
                    "step": 3,
                    "operation": "CLICK",
                    "action": "Open details",
                    "page_changed": True,
                },
                {
                    "step": 4,
                    "operation": "CLICK",
                    "action": "Open details",
                    "page_changed": True,
                },
            ],
            model="jev-1.13.0",
            post_json=select_all,
        )
        assert selected["selectedCount"] == 2
        assert selected["deduplicatedCandidateCount"] == 1
        assert [item["step"] for item in selected["evidence"]] == [3, 4]
    finally:
        if previous is None:
            os.environ.pop("TYPESAFE_API_KEY", None)
        else:
            os.environ["TYPESAFE_API_KEY"] = previous


def assert_short_groups_support_two_goals_without_filler() -> None:
    page_text = (
        "Requested identifier: ITEM-482.\n\n"
        + "General explanatory material. " * 24
        + "\n\nEstimated total: 120 credits per month.\n\n"
        + "More generic filler. " * 24
        + "\n\nEstimate excludes service charges."
    )
    expected_by_goal = {
        "Return the requested identifier": ["Requested identifier: ITEM-482."],
        "Report the estimated total, period, and exclusions": [
            "Estimated total: 120 credits per month.",
            "Estimate excludes service charges.",
        ],
    }
    previous = os.environ.get("TYPESAFE_API_KEY")
    os.environ["TYPESAFE_API_KEY"] = "synthetic-projection-report-key"
    try:
        for goal, expected in expected_by_goal.items():
            def select_expected(
                _url: str, _key: str, body: dict[str, Any]
            ) -> dict[str, Any]:
                answers = {}
                for index, question_id in enumerate(body["questions"]):
                    exact = str(body["state"]["candidates"][index].get("exact", ""))
                    relevant = any(fragment in exact for fragment in expected)
                    answers[question_id] = {
                        "type": "noul",
                        "noul": 0.95 if relevant else 0.05,
                    }
                return {
                    "model": "synthetic-report-model",
                    "answers": answers,
                    "usage": {"input_tokens": 0, "output_tokens": 0},
                }

            report, _ = handoff_report.select_handoff(
                goal=goal,
                page_text=page_text,
                history=[],
                model="jev-1.13.0",
                post_json=select_expected,
            )
            exact_values = [item["exact"] for item in report["evidence"]]
            assert report["selectionOmitted"] is False
            assert all(
                any(fragment in value for value in exact_values)
                for fragment in expected
            )
            assert all("filler" not in value.lower() for value in exact_values)
            assert all(
                "General explanatory material" not in value
                for value in exact_values
            )
    finally:
        if previous is None:
            os.environ.pop("TYPESAFE_API_KEY", None)
        else:
            os.environ["TYPESAFE_API_KEY"] = previous


def _completion_raw(state: dict[str, Any]) -> dict[str, Any]:
    return bridge._raw_projection(
        status="completion_claim",
        stop_reason="done",
        execution="completed",
        cleanup="closed",
        target_id="rlcd-owned-target",
        state=copy.deepcopy(state),
        diagnostic={"type": "FixtureDiagnostic", "message": "primary diagnostic"},
    )


def assert_reporting_pressure_preserves_legacy_diagnostics() -> None:
    observed_text = "Preserved source text under reporting pressure."
    history = [
        {
            "step": 1,
            "kind": "click",
            "action": "Recorded synthetic action",
            "operation": "CLICK",
            "page_changed": True,
            "url": "https://example.test/result",
            "elapsed_ms": 1,
        }
    ]

    def state_for(paddings: list[int]) -> dict[str, Any]:
        return {
            "page": {
                "url": "https://example.test/result",
                "title": "Synthetic pressure",
                "text": observed_text,
            },
            "history": copy.deepcopy(history),
            "decisions": [
                {
                    "model": f"synthetic-native-{index}",
                    "usage": {"record": index, "padding": "U" * padding},
                }
                for index, padding in enumerate(paddings)
            ],
            "text_calls": [],
        }

    target = bridge.TERMINAL_MAX_UTF8_BYTES - 1
    paddings: list[int] = []
    while True:
        trial = paddings + [1_900]
        raw = _completion_raw(state_for(trial))
        raw.pop("reporting")
        if len(bridge._json_bytes(raw)) + 1 > target:
            break
        paddings = trial
    raw_with_empty = _completion_raw(state_for(paddings + [0]))
    raw_with_empty.pop("reporting")
    empty_size = len(bridge._json_bytes(raw_with_empty)) + 1
    if empty_size <= target:
        paddings.append(min(1_900, target - empty_size))

    baseline_raw = _completion_raw(state_for(paddings))
    baseline_raw.pop("reporting")
    baseline = json.loads(bridge._finalize(baseline_raw, credentials=()))
    assert baseline["lastObservation"]["text"] == observed_text
    assert len(baseline["history"]) == 1
    assert len(baseline["usage"]["records"]) == len(paddings)

    candidate_raw = _completion_raw(state_for(paddings))
    candidate_raw["reporting"] = {
        "status": "selected",
        "sourceCoverage": "complete",
        "sourceOmitted": False,
        "selectionOmitted": False,
        "candidateCount": 1,
        "qualifyingCandidateCount": 1,
        "selectedCount": 1,
        "deduplicatedCandidateCount": 0,
        "omittedQualifyingCandidateCount": 0,
        "evidence": [
            {
                "kind": "page",
                "source": "lastObservation.text",
                "exact": observed_text,
                "cutBefore": False,
                "cutAfter": False,
                "relevance": 0.95,
            }
        ],
        "diagnostic": None,
    }
    candidate_raw["usage"]["records"].append(
        {
            "source": "jev_handoff",
            "model": "synthetic-report-model",
            "usage": {"input_tokens": 1, "output_tokens": 1},
        }
    )
    candidate_terminal = bridge._finalize(candidate_raw, credentials=())
    candidate = json.loads(candidate_terminal)
    assert len(candidate_terminal) <= bridge.TERMINAL_MAX_UTF8_BYTES
    assert candidate["lastObservation"] == baseline["lastObservation"]
    assert candidate["history"] == baseline["history"]
    assert candidate["diagnostic"] == baseline["diagnostic"]
    assert candidate["cleanup"] == baseline["cleanup"]
    candidate_native_usage = [
        record
        for record in candidate["usage"]["records"]
        if record["source"] != "jev_handoff"
    ]
    assert candidate_native_usage == baseline["usage"]["records"]
    assert "reporting" not in candidate


def main() -> int:
    assert_owned_producers_omit_availability()
    assert_oversized_state_is_bounded_without_agent_mutation()
    assert_candidate_bounds_do_not_split_oversized_tokens()
    assert_candidate_and_request_pressure_preserve_coverage_or_disclose_omission()
    assert_source_omissions_cover_rejected_actions_and_empty_candidates()
    assert_action_identity_keeps_distinct_steps()
    assert_short_groups_support_two_goals_without_filler()
    assert_reporting_pressure_preserves_legacy_diagnostics()
    print("projection contract: 8 checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
