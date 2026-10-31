#!/usr/bin/env python3
"""Manage third-party browser libraries without npm.

Triti ships with zero dependencies. If a feature ever needs a library, vendor
a single pre-built ES module file, pinned by version and SHA-384:

    python3 scripts/vendor.py add <name> <version> <url> <file>
        e.g. add dexie 4.0.8 https://cdn.jsdelivr.net/npm/dexie@4.0.8/dist/dexie.mjs dexie.mjs
    python3 scripts/vendor.py verify       # hashes still match (also run by check.py)
    python3 scripts/vendor.py outdated     # newer versions on the npm registry

Files live in vendor/, are imported with relative paths, and must be added to
sw.js ASSETS. Nothing is fetched from a CDN at runtime.
"""
from __future__ import annotations

import base64
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "vendor"
MANIFEST = VENDOR / "manifest.json"


def load() -> dict:
    if not MANIFEST.is_file():
        return {"packages": []}
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def save(data: dict) -> None:
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def sri(content: bytes) -> str:
    return "sha384-" + base64.b64encode(hashlib.sha384(content).digest()).decode()


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "triti-vendor"})
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 - URLs come from the maintainer
        return resp.read()


def add(name: str, version: str, url: str, file: str) -> None:
    if not url.startswith("https://"):
        raise SystemExit("Only https:// URLs are allowed.")
    content = fetch(url)
    (VENDOR / file).write_bytes(content)
    data = load()
    data["packages"] = [p for p in data["packages"] if p["name"] != name]
    data["packages"].append({"name": name, "version": version, "url": url, "file": file, "integrity": sri(content)})
    data["packages"].sort(key=lambda p: p["name"])
    save(data)
    print(f"vendored {name}@{version} -> vendor/{file}\nRemember: add './vendor/{file}' to sw.js ASSETS.")


def verify() -> list[str]:
    problems = []
    for p in load()["packages"]:
        path = VENDOR / p["file"]
        if not path.is_file():
            problems.append(f"vendor/{p['file']}: missing (pinned {p['name']}@{p['version']})")
        elif sri(path.read_bytes()) != p["integrity"]:
            problems.append(f"vendor/{p['file']}: hash mismatch — re-run 'vendor.py add' or restore the file")
    return problems


def outdated() -> int:
    stale = 0
    for p in load()["packages"]:
        try:
            latest = json.loads(fetch(f"https://registry.npmjs.org/{p['name']}/latest"))["version"]
        except Exception as exc:  # noqa: BLE001
            print(f"? {p['name']}: could not check ({exc})")
            continue
        if latest != p["version"]:
            stale += 1
            print(f"↑ {p['name']}: {p['version']} -> {latest}")
    if not stale:
        print("All vendored packages are current." if load()["packages"] else "No vendored packages.")
    return stale


def main() -> None:
    args = sys.argv[1:]
    if args[:1] == ["add"] and len(args) == 5:
        add(*args[1:])
    elif args == ["verify"]:
        problems = verify()
        print("\n".join(problems) or "Vendored files OK.")
        sys.exit(1 if problems else 0)
    elif args == ["outdated"]:
        outdated()
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main()
