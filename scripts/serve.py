#!/usr/bin/env python3
"""Local dev server (no Node needed).

    python3 scripts/serve.py            # http://localhost:8000
    python3 scripts/serve.py 9000

Serves the repo root with correct MIME types and caching disabled. The service
worker is skipped on localhost; add ?sw to the URL to test offline mode.
"""
from __future__ import annotations

import functools
import http.server
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
        ".txt": "text/plain; charset=utf-8",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:  # quieter logs
        if "--verbose" in sys.argv:
            super().log_message(fmt, *args)


def make_server(port: int = 8000, host: str = "127.0.0.1") -> http.server.ThreadingHTTPServer:
    handler = functools.partial(Handler, directory=str(ROOT))
    return http.server.ThreadingHTTPServer((host, port), handler)


def main() -> None:
    ports = [a for a in sys.argv[1:] if a.isdigit()]
    port = int(ports[0]) if ports else 8000
    server = make_server(port)
    print(f"Triti running at http://localhost:{port}/  (tests: http://localhost:{port}/tests/)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
