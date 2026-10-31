"""Pytest fixtures: serve the repo over HTTP for Playwright (no Node needed)."""
from __future__ import annotations

import sys
import threading
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from serve import make_server  # noqa: E402


@pytest.fixture(scope="session")
def base_url() -> str:  # overrides pytest-base-url so page.goto("/...") works too
    server = make_server(port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://localhost:{server.server_address[1]}"
    server.shutdown()


@pytest.fixture
def console_errors(page):
    """Collect console errors and uncaught exceptions; tests assert it stays empty."""
    errors: list[str] = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    return errors
