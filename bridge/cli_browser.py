"""One exact-target CLI-backed Browser adapter for the pinned native Agent."""

from __future__ import annotations

import json
import os
import select
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit



def _cdp(method: str, **params: Any) -> dict[str, Any]:
    from browser_harness.helpers import cdp

    return cdp(method, **params)


class AdmissionError(RuntimeError):
    """The exact selected target cannot be safely admitted."""


class DialogPending(RuntimeError):
    """A browser dialog needs an outer-agent handoff."""


def _http_url(value: str) -> bool:
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.hostname)


def _target_info(target_id: str, *, explicit_url: bool) -> dict[str, Any]:
    response = _cdp("Target.getTargets")
    targets = response.get("targetInfos") if isinstance(response, dict) else None
    if not isinstance(targets, list):
        raise AdmissionError("the named Harness daemon returned no target listing")
    info = next(
        (item for item in targets if isinstance(item, dict) and item.get("targetId") == target_id),
        None,
    )
    if info is None:
        raise AdmissionError("the exact selected target is unavailable")
    if info.get("type") != "page":
        raise AdmissionError("the exact selected target is not a page")
    url = info.get("url")
    if not isinstance(url, str) or not (_http_url(url) or (explicit_url and url == "about:blank")):
        raise AdmissionError("the exact selected target has no eligible current URL")
    return info


class _Worker:
    def __init__(self, endpoint: str, target_id: str) -> None:
        script = Path(__file__).with_name("cli_browser_worker.mjs")
        environment = {
            key: value for key, value in os.environ.items()
            if key in {"PATH", "HOME", "TMPDIR", "TMP", "TEMP", "NODE_OPTIONS", "LANG", "LC_ALL"}
        }
        # Provider credentials and Browser Harness workspace settings stay in Python.
        environment.pop("NODE_OPTIONS", None)
        self.process = subprocess.Popen(
            ["node", str(script)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, env=environment, bufsize=0,
        )
        self._sequence = 0
        self._buffer = bytearray()
        self._stderr = bytearray()
        self._stderr_thread = threading.Thread(target=self._drain_stderr, daemon=True)
        self._stderr_thread.start()
        self.terminated = False
        try:
            result = self.call("init", wsEndpoint=endpoint, targetId=target_id)
            if result.get("targetId") != target_id:
                raise AdmissionError("CLI helper did not attest the exact target")
        except BaseException:
            self.close()
            raise

    def _drain_stderr(self) -> None:
        if self.process.stderr is None:
            return
        while True:
            chunk = self.process.stderr.read(4096)
            if not chunk:
                break
            if len(self._stderr) < 16_384:
                self._stderr.extend(chunk[: 16_384 - len(self._stderr)])

    def _readline(self, timeout: float) -> bytes:
        if self.process.stdout is None:
            raise RuntimeError("CLI helper stdout is unavailable")
        deadline = time.monotonic() + timeout
        while True:
            newline = self._buffer.find(b"\n")
            if newline >= 0:
                if newline + 1 > 262_144:
                    raise RuntimeError("CLI helper response exceeded its byte bound")
                line = bytes(self._buffer[:newline])
                del self._buffer[: newline + 1]
                return line
            if len(self._buffer) >= 262_144:
                raise RuntimeError("CLI helper response exceeded its byte bound")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("CLI helper response timed out; browser effect is unknown")
            ready, _, _ = select.select([self.process.stdout], [], [], remaining)
            if not ready:
                raise TimeoutError("CLI helper response timed out; browser effect is unknown")
            chunk = os.read(self.process.stdout.fileno(), 65536)
            if not chunk:
                raise RuntimeError("CLI helper exited before replying; browser effect is unknown")
            self._buffer.extend(chunk)

    def call(self, operation: str, *, _timeout: float | None = None, **data: Any) -> Any:
        if self.process.poll() is not None or self.process.stdin is None:
            raise RuntimeError("CLI helper is not running; browser effect is unknown")
        self._sequence += 1
        request = {"id": self._sequence, "operation": operation, **data}
        encoded = json.dumps(request, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n"
        if len(encoded) > 128 * 1024:
            raise ValueError("CLI helper request exceeded its byte bound")
        self.process.stdin.write(encoded)
        self.process.stdin.flush()
        timeout = _timeout if _timeout is not None else (15 if operation in {"init", "observe", "act"} else 5)
        response = json.loads(self._readline(timeout))
        if not isinstance(response, dict) or response.get("id") != self._sequence:
            raise RuntimeError("CLI helper returned an invalid response")
        if response.get("ok") is not True:
            error = response.get("error") or {}
            kind = error.get("type")
            message = str(error.get("message", "CLI browser operation failed"))[:512]
            if kind == "StalePage":
                from jev_ultrafast.browser import StalePage

                raise StalePage(message)
            if kind == "DialogPending":
                raise DialogPending(message)
            if kind == "AdmissionError":
                raise AdmissionError(message)
            raise RuntimeError(message)
        result = response.get("result")
        if not isinstance(result, dict) and operation != "fresh":
            raise RuntimeError("CLI helper returned an invalid result")
        return result

    def close(self) -> bool:
        process = self.process
        acknowledged = False
        if process.poll() is None:
            try:
                acknowledged = self.call("release", _timeout=0.4).get("disconnected") is True
            except Exception:
                pass
        if process.stdin is not None and not process.stdin.closed:
            process.stdin.close()
        try:
            process.wait(timeout=0.5)
        except subprocess.TimeoutExpired:
            process.terminate()
            try:
                process.wait(timeout=0.4)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=0.3)
        self.terminated = process.poll() is not None
        self._stderr_thread.join(timeout=0.1)
        return acknowledged and self.terminated and process.returncode == 0


class CliBrowser:
    """Exact target and helper lifetime behind Agent's Browser interface."""

    def __init__(self, target_id: str | None, requested_url: str | None) -> None:
        self.borrowed = target_id is not None
        self.target: str | None = target_id
        self.session: str | None = None
        self.worker: _Worker | None = None
        self.confirmed_target_id: str | None = None
        self.focus_enable_dispatched = False
        self.focus_disable_acknowledged = False
        self.attach_dispatched = False
        self.detach_acknowledged = False
        self.requested_effect_started = False
        self.cleanup = "not_owned" if self.borrowed else "not_created"
        self.worker_reaped = False
        self._released = False
        try:
            if self.borrowed:
                assert target_id is not None
                _target_info(target_id, explicit_url=requested_url is not None)
            else:
                response = _cdp("Target.createTarget", url="about:blank", background=True)
                created = response.get("targetId") if isinstance(response, dict) else None
                if not isinstance(created, str) or not created:
                    raise AdmissionError("created task target returned no exact identity")
                self.target = created
                self.cleanup = "unknown"
            assert self.target is not None
            from browser_harness import daemon as harness_daemon

            endpoint = harness_daemon.get_ws_url()
            self.worker = _Worker(endpoint, self.target)
            self.attach_dispatched = True
            response = _cdp("Target.attachToTarget", targetId=self.target, flatten=True)
            session = response.get("sessionId") if isinstance(response, dict) else None
            if not isinstance(session, str) or not session:
                raise AdmissionError("exact task target did not return a session")
            self.session = session
            observed = self._session_observation()
            current = observed["url"]
            if self.borrowed and not (_http_url(current) or (requested_url is not None and current == "about:blank")):
                raise AdmissionError("selected session lost its eligible URL")
            self.confirmed_target_id = self.target
            if not self.borrowed:
                _cdp("Emulation.setDeviceMetricsOverride", session_id=session,
                    width=1120, height=780, deviceScaleFactor=1, mobile=False)
            self.focus_enable_dispatched = True
            _cdp("Emulation.setFocusEmulationEnabled", session_id=session, enabled=True)
            if requested_url is not None:
                self.requested_effect_started = True
                _cdp("Page.navigate", session_id=session, url=requested_url)
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    ready = _cdp("Runtime.evaluate", session_id=session,
                        expression="document.readyState", returnByValue=True)
                    if ready.get("result", {}).get("value") == "complete":
                        break
                    time.sleep(0.02)
                observed = self._session_observation()
                if not _http_url(observed["url"]):
                    raise AdmissionError("explicit navigation did not reach an HTTP(S) page")
        except BaseException:
            self.release(retain=False)
            raise

    def _session_observation(self) -> dict[str, Any]:
        if not self.session:
            raise AdmissionError("exact target session is unavailable")
        response = _cdp("Runtime.evaluate", session_id=self.session,
            expression="JSON.stringify({url:location.href,topLevel:self===top})", returnByValue=True)
        encoded = response.get("result", {}).get("value") if isinstance(response, dict) else None
        try:
            observed = json.loads(encoded)
        except (TypeError, json.JSONDecodeError) as error:
            raise AdmissionError("exact session returned no page observation") from error
        if not isinstance(observed, dict) or observed.get("topLevel") is not True or not isinstance(observed.get("url"), str):
            raise AdmissionError("exact session is not an observed top-level page")
        return observed

    def observe(self, screenshot: bool = False) -> dict[str, Any]:
        if screenshot:
            raise ValueError("CLI adapter does not offer screenshots to the native loop")
        if self.worker is None:
            raise RuntimeError("CLI browser helper is unavailable")
        result = self.worker.call("observe")
        if not isinstance(result.get("actions"), list) or not isinstance(result.get("fingerprint"), str):
            raise RuntimeError("CLI helper returned an invalid observation")
        return result

    def fresh(self, page: dict[str, Any], action: dict[str, Any] | None = None) -> bool:
        if self.worker is None:
            return False
        return self.worker.call("fresh", marker=page["marker"],
            actionId=action["id"] if action is not None else None) is True

    def act(self, action: dict[str, Any], page: dict[str, Any], text: str | None = None) -> dict[str, Any]:
        if self.worker is None:
            raise RuntimeError("CLI browser helper is unavailable")
        if not self.fresh(page, action):
            from jev_ultrafast.browser import StalePage

            raise StalePage("Page or observed target changed before input")
        self.requested_effect_started = True
        return self.worker.call("act", marker=page["marker"], action=action, text=text)

    def close(self) -> None:
        self.release(retain=False)

    def release(self, *, retain: bool = False) -> None:
        if self._released:
            return
        self._released = True
        if self.worker is not None:
            try:
                self.worker_reaped = self.worker.close()
            except Exception:
                self.worker_reaped = False
            self.worker = None
        session = self.session
        if session and self.focus_enable_dispatched and not self.focus_disable_acknowledged:
            try:
                _cdp("Emulation.setFocusEmulationEnabled", session_id=session, enabled=False)
                self.focus_disable_acknowledged = True
            except Exception:
                pass
        if session and not self.detach_acknowledged:
            try:
                _cdp("Target.detachFromTarget", sessionId=session)
                self.detach_acknowledged = True
                self.session = None
            except Exception:
                pass
        if not self.borrowed and self.target:
            if retain and self.worker_reaped:
                self.cleanup = "retained"
            elif self.cleanup != "closed":
                try:
                    response = _cdp("Target.closeTarget", targetId=self.target)
                    self.cleanup = "closed" if response.get("success") is True else "unconfirmed"
                except Exception:
                    self.cleanup = "unconfirmed"

    @property
    def focus_cleanup(self) -> str:
        if not self.focus_enable_dispatched:
            return "not_applied"
        return "disable_acknowledged" if self.focus_disable_acknowledged else "unconfirmed"

    @property
    def attachment_cleanup(self) -> str:
        if not self.attach_dispatched:
            return "not_acquired"
        return "detach_acknowledged" if self.detach_acknowledged else "unconfirmed"
