"""Exact-session lifetime owner for one borrowed browser tab."""

from __future__ import annotations

import contextlib
import json
import time
from collections.abc import Iterator
from typing import Any
from urllib.parse import urlsplit


class StopRequested(Exception):
    """Raised on SIGTERM so synchronous browser work can unwind."""


class BorrowedTargetError(RuntimeError):
    """The requested target cannot safely enter borrowed mode."""


def _is_http_url(value: str) -> bool:
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.hostname)


def _is_eligible_current_url(value: str, *, explicit_url: bool) -> bool:
    return _is_http_url(value) or (explicit_url and value == "about:blank")


class _OneUseBrowserFactory:
    def __init__(self, browser: Any) -> None:
        self._browser = browser
        self.calls = 0

    def __call__(self, _url: str) -> Any:
        self.calls += 1
        if self.calls != 1:
            raise RuntimeError("borrowed Browser factory may be used only once")
        return self._browser


class BorrowedTab:
    """Acquire, configure, navigate, bind, and release one exact target session."""

    def __init__(
        self,
        target_id: str,
        requested_url: str | None,
        *,
        browser_module: Any,
        agent_module: Any,
    ) -> None:
        self.requested_target_id = target_id
        self.requested_url = requested_url
        self.browser_module = browser_module
        self.agent_module = agent_module
        self.browser: Any | None = None
        self.session_id: str | None = None
        self.confirmed_target_id: str | None = None
        self.attach_dispatched = False
        self.detach_acknowledged = False
        self.focus_enable_dispatched = False
        self.focus_disable_acknowledged = False
        self.requested_effect_started = False
        self.release_errors: list[Exception] = []

    @contextlib.contextmanager
    def lifetime(self) -> Iterator[BorrowedTab]:
        try:
            self._acquire()
            yield self
        finally:
            self.release()

    def _target_info(self) -> dict[str, Any]:
        response = self.browser_module.cdp("Target.getTargets")
        targets = response.get("targetInfos") if isinstance(response, dict) else None
        if not isinstance(targets, list):
            raise BorrowedTargetError("target discovery returned an invalid response")
        selected = next(
            (
                item
                for item in targets
                if isinstance(item, dict)
                and item.get("targetId") == self.requested_target_id
            ),
            None,
        )
        if selected is None:
            raise BorrowedTargetError("the exact selected target is unavailable")
        if selected.get("type") != "page":
            raise BorrowedTargetError("the exact selected target is not a page")
        current_url = selected.get("url")
        if not isinstance(current_url, str) or not _is_eligible_current_url(
            current_url, explicit_url=self.requested_url is not None
        ):
            raise BorrowedTargetError(
                "the exact selected target does not have an eligible current URL"
            )
        return selected

    def _session_observation(self) -> dict[str, Any]:
        if self.browser is None:
            raise RuntimeError("borrowed browser is unavailable")
        encoded = self.browser.evaluate(
            "JSON.stringify({url:location.href,topLevel:self===top})"
        )
        if not isinstance(encoded, str):
            raise BorrowedTargetError("the selected session returned no page observation")
        try:
            observed = json.loads(encoded)
        except json.JSONDecodeError as error:
            raise BorrowedTargetError(
                "the selected session returned an invalid page observation"
            ) from error
        if not isinstance(observed, dict) or observed.get("topLevel") is not True:
            raise BorrowedTargetError("the selected session is not a top-level page")
        current_url = observed.get("url")
        if not isinstance(current_url, str):
            raise BorrowedTargetError("the selected session returned no current URL")
        return observed

    def _require_session_eligibility(self) -> str:
        observed = self._session_observation()
        self.confirmed_target_id = self.requested_target_id
        current_url = observed["url"]
        if not _is_eligible_current_url(
            current_url, explicit_url=self.requested_url is not None
        ):
            raise BorrowedTargetError(
                "the selected session no longer has an eligible current URL"
            )
        return current_url

    def _acquire(self) -> None:
        self._target_info()
        self.attach_dispatched = True
        response = self.browser_module.cdp(
            "Target.attachToTarget",
            targetId=self.requested_target_id,
            flatten=True,
        )
        session_id = response.get("sessionId") if isinstance(response, dict) else None
        if not isinstance(session_id, str) or not session_id:
            raise BorrowedTargetError("the exact selected target did not return a session")
        self.session_id = session_id

        owner = self

        class BorrowedBrowser(self.browser_module.Browser):
            def close(self) -> None:
                owner.release()

        browser = object.__new__(BorrowedBrowser)
        browser.target = self.requested_target_id
        browser.session = session_id
        browser.after_input = None
        self.browser = browser

        self._require_session_eligibility()
        self.focus_enable_dispatched = True
        browser.call("Emulation.setFocusEmulationEnabled", enabled=True)

        if self.requested_url is not None:
            self.requested_effect_started = True
            browser.call("Page.navigate", url=self.requested_url)
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                if browser.evaluate("document.readyState") == "complete":
                    break
                time.sleep(0.02)
            else:
                raise TimeoutError("borrowed explicit navigation did not become ready")
            observed = self._session_observation()
            if not _is_http_url(observed["url"]):
                raise BorrowedTargetError(
                    "the explicitly navigated session did not reach an HTTP(S) page"
                )

    def construct_agent(self, agent_class: Any, goal: str) -> Any:
        if self.browser is None:
            raise RuntimeError("borrowed browser is unavailable")
        factory = _OneUseBrowserFactory(self.browser)
        original_factory = self.agent_module.Browser
        self.agent_module.Browser = factory
        try:
            agent_url = self.requested_url
            if agent_url is None:
                agent_url = self._require_session_eligibility()
            agent = agent_class(agent_url, goal)
            if factory.calls != 1:
                raise RuntimeError("borrowed Browser factory was not consumed exactly once")
            return agent
        finally:
            self.agent_module.Browser = original_factory

    def begin_agent_run(self) -> None:
        # Agent.run dispatches provider work before it can yield its first snapshot.
        self.requested_effect_started = True

    def release(self) -> None:
        session_id = self.session_id
        if not isinstance(session_id, str) or not session_id:
            return

        if self.focus_enable_dispatched and not self.focus_disable_acknowledged:
            try:
                self.browser_module.cdp(
                    "Emulation.setFocusEmulationEnabled",
                    session_id=session_id,
                    enabled=False,
                )
                self.focus_disable_acknowledged = True
            except Exception as error:
                self.release_errors.append(error)

        if not self.detach_acknowledged:
            try:
                self.browser_module.cdp(
                    "Target.detachFromTarget", sessionId=session_id
                )
                self.detach_acknowledged = True
                self.session_id = None
                if self.browser is not None:
                    self.browser.session = None
            except Exception as error:
                self.release_errors.append(error)

    @property
    def focus_cleanup(self) -> str:
        if not self.focus_enable_dispatched:
            return "not_applied"
        if self.focus_disable_acknowledged:
            return "disable_acknowledged"
        return "unconfirmed"

    @property
    def attachment_cleanup(self) -> str:
        if not self.attach_dispatched:
            return "not_acquired"
        if self.detach_acknowledged:
            return "detach_acknowledged"
        return "unconfirmed"
