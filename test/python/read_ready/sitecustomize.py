"""Test-owned synchronization at entry to the bridge's protected stdin read."""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Any

_marker = os.environ.get("RLCD_TEST_READ_READY_MARKER")
_suppress_marker = os.environ.get("RLCD_TEST_SUPPRESS_READ_READY") == "1"
_delay_ms = int(os.environ.get("RLCD_TEST_STARTUP_DELAY_MS", "0"))
_original_stdin = sys.stdin
_original_buffer = sys.stdin.buffer

if _delay_ms > 0:
    time.sleep(_delay_ms / 1_000)


class _ReadReadyBuffer:
    def read(self, size: int = -1) -> bytes:
        if _marker and not _suppress_marker:
            Path(_marker).write_text(str(os.getpid()), encoding="utf-8")
        return _original_buffer.read(size)

    def __getattr__(self, name: str) -> Any:
        return getattr(_original_buffer, name)


class _ReadReadyInput:
    buffer = _ReadReadyBuffer()

    def __getattr__(self, name: str) -> Any:
        return getattr(_original_stdin, name)


sys.stdin = _ReadReadyInput()
