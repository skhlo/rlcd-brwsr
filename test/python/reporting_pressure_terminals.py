#!/usr/bin/env python3
"""Emit production-projected terminals at the parent usage-record boundary."""

from __future__ import annotations

import json
from typing import Any

import rlcd_brwsr_bridge as bridge


def _terminal(native_count: int) -> dict[str, Any]:
    state = {
        "page": {
            "url": "https://example.test/result",
            "title": "Synthetic usage pressure",
            "text": "Preserved browser result.",
        },
        "history": [],
        "decisions": [
            {
                "model": f"synthetic-native-{index}",
                "usage": {"record": index},
            }
            for index in range(native_count)
        ],
        "text_calls": [],
    }
    raw = bridge._raw_projection(
        status="completion_claim",
        stop_reason="done",
        execution="completed",
        cleanup="closed",
        target_id="rlcd-owned-target",
        state=state,
        diagnostic=None,
    )
    raw["reporting"] = {
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
                "exact": "Preserved browser result.",
                "cutBefore": False,
                "cutAfter": False,
                "relevance": 0.95,
            }
        ],
        "diagnostic": None,
    }
    usage = raw["usage"]
    assert isinstance(usage, dict)
    records = usage["records"]
    assert isinstance(records, list)
    records.append(
        {
            "source": "jev_handoff",
            "model": "synthetic-report-model",
            "usage": {"input_tokens": 1, "output_tokens": 1},
        }
    )
    return json.loads(bridge._finalize(raw, credentials=()))


def main() -> int:
    print(
        json.dumps(
            {
                "oneRemainingSlot": _terminal(23),
                "noRemainingSlots": _terminal(24),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
