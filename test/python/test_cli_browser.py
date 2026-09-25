"""Exact target admission never degrades to URL or listing order."""

import io
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "bridge"))

from cli_browser import AdmissionError, CliBrowser, _Worker, _target_info


class ExactTargetTests(unittest.TestCase):
    def test_duplicate_url_does_not_admit_wrong_id(self):
        response = {
            "targetInfos": [
                {"targetId": "first", "type": "page", "url": "https://fixture.test/same"},
                {"targetId": "second", "type": "page", "url": "https://fixture.test/same"},
            ]
        }
        with patch("cli_browser._cdp", return_value=response):
            self.assertEqual(_target_info("second", explicit_url=False)["targetId"], "second")
            with self.assertRaises(AdmissionError):
                _target_info("missing", explicit_url=False)

    def test_blank_requires_explicit_navigation(self):
        response = {"targetInfos": [{"targetId": "blank", "type": "page", "url": "about:blank"}]}
        with patch("cli_browser._cdp", return_value=response):
            with self.assertRaises(AdmissionError):
                _target_info("blank", explicit_url=False)
            self.assertEqual(_target_info("blank", explicit_url=True)["targetId"], "blank")

    def test_unobserved_helper_exit_cannot_retain_created_target(self):
        class LostWorker:
            def close(self):
                return False

        browser = object.__new__(CliBrowser)
        browser._released = False
        browser.borrowed = False
        browser.target = "created-exact"
        browser.session = None
        browser.worker = LostWorker()
        browser.worker_reaped = False
        browser.focus_enable_dispatched = False
        browser.focus_disable_acknowledged = False
        browser.attach_dispatched = False
        browser.detach_acknowledged = False
        browser.cleanup = "unknown"
        with patch("cli_browser._cdp", return_value={"success": True}) as cdp:
            browser.release(retain=True)
        cdp.assert_called_once_with("Target.closeTarget", targetId="created-exact")
        self.assertEqual(browser.cleanup, "closed")
        self.assertFalse(browser.worker_reaped)


class WorkerResponseBoundTests(unittest.TestCase):
    def _observe_with_line_size(self, size):
        base = {"id": 1, "ok": True, "result": {"actions": [], "fingerprint": "fp", "text": ""}}
        overhead = len(json.dumps(base, separators=(",", ":")).encode()) + 1
        base["result"]["text"] = "x" * (size - overhead)
        encoded = json.dumps(base, separators=(",", ":")).encode() + b"\n"
        self.assertEqual(len(encoded), size)

        worker = object.__new__(_Worker)
        worker.process = SimpleNamespace(
            poll=lambda: None,
            stdin=io.BytesIO(),
            stdout=SimpleNamespace(fileno=lambda: 7),
        )
        worker._sequence = 0
        worker._buffer = bytearray()
        browser = object.__new__(CliBrowser)
        browser.worker = worker
        with (
            patch("cli_browser.select.select", return_value=([worker.process.stdout], [], [])),
            patch("cli_browser.os.read", return_value=encoded),
        ):
            return browser.observe()

    def test_exact_limit_valid_json_is_accepted(self):
        result = self._observe_with_line_size(262_144)
        self.assertEqual(result["fingerprint"], "fp")

    def test_one_byte_over_valid_json_is_refused(self):
        with self.assertRaisesRegex(RuntimeError, "response exceeded its byte bound"):
            self._observe_with_line_size(262_145)


if __name__ == "__main__":
    unittest.main()
