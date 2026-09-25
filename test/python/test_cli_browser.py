"""Exact target admission never degrades to URL or listing order."""

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "bridge"))

from cli_browser import AdmissionError, CliBrowser, _target_info


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


if __name__ == "__main__":
    unittest.main()
