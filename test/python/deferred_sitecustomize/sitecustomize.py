"""Install external fakes only after Browser Harness loads its native .env."""

from __future__ import annotations

import builtins
import json
import os
import runpy
import sys
from pathlib import Path
from typing import Any

argv_marker = os.environ.get("RLCD_TEST_ARGV_MARKER")
if argv_marker:
    Path(argv_marker).write_text(json.dumps(sys.argv), encoding="utf-8")

stdin_marker = os.environ.get("RLCD_TEST_STDIN_MARKER")
if stdin_marker:
    original_stdin = sys.stdin.buffer

    class _CapturedBuffer:
        def read(self, size: int = -1) -> bytes:
            value = original_stdin.read(size)
            with Path(stdin_marker).open("ab") as capture:
                capture.write(value)
            return value

        def __getattr__(self, name: str) -> Any:
            return getattr(original_stdin, name)

    class _CapturedInput:
        buffer = _CapturedBuffer()

        def __getattr__(self, name: str) -> Any:
            return getattr(sys.__stdin__, name)

    sys.stdin = _CapturedInput()

_original_import = builtins.__import__
_installed = False


def _import_after_native_env(
    name: str,
    globals: dict[str, Any] | None = None,
    locals: dict[str, Any] | None = None,
    fromlist: tuple[str, ...] = (),
    level: int = 0,
) -> Any:
    global _installed
    module = _original_import(name, globals, locals, fromlist, level)
    if not _installed and name == "browser_harness" and "admin" in fromlist:
        _installed = True
        builtins.__import__ = _original_import
        runpy.run_path(os.environ["RLCD_BASE_FAKE"])
        if os.environ.get("RLCD_TEST_SCENARIO") == "list_native_resolution_error":
            raise RuntimeError(
                "native load failed for "
                f"{os.environ.get('TYPESAFE_API_KEY', '')} and "
                f"{os.environ.get('TEXT_MODEL_API_KEY', '')}"
            )
    return module


builtins.__import__ = _import_after_native_env
