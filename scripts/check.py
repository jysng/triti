#!/usr/bin/env python3
"""Static guard-rails for Triti. Fast, stdlib-only; runs in CI and locally.

    python3 scripts/check.py

Checks: @ts-check headers, relative imports resolve, the service-worker
precache list matches the files on disk, no remote code, CSP present,
innerHTML only fed by the Markdown sanitiser, localStorage only used for
settings, manifest/icons valid, version.txt is semver.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
errors: list[str] = []


def fail(msg: str) -> None:
    errors.append(msg)


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


js_files = sorted((ROOT / "js").rglob("*.js"))
vendor_files = sorted(p for p in (ROOT / "vendor").rglob("*") if p.is_file() and p.name not in {"manifest.json", "README.md"})

# 1. Type-checking header
for f in js_files:
    if not f.read_text(encoding="utf-8").startswith("// @ts-check"):
        fail(f"{rel(f)}: first line must be '// @ts-check'")

# 2. Relative imports resolve; no remote imports
IMPORT_RE = re.compile(r"""(?:^\s*(?:import|export)\b[^'";()=]*?\bfrom\s*|^\s*import\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]""", re.M)
for f in js_files + sorted((ROOT / "tests").glob("*.js")):
    for spec in IMPORT_RE.findall(f.read_text(encoding="utf-8")):
        if re.match(r"^(https?:)?//", spec):
            fail(f"{rel(f)}: remote import '{spec}' — vendor it instead (see vendor-deps skill)")
        elif spec.startswith("."):
            if not (f.parent / spec).resolve().is_file():
                fail(f"{rel(f)}: import '{spec}' does not resolve")
        else:
            fail(f"{rel(f)}: bare import '{spec}' — use a relative path to vendor/")

# 3. Service worker precache list == shipped files
sw = (ROOT / "sw.js").read_text(encoding="utf-8")
m = re.search(r"const ASSETS = \[(.*?)\];", sw, re.S)
if not m:
    fail("sw.js: ASSETS list not found")
else:
    listed = set(re.findall(r"'([^']+)'", m.group(1)))
    expected = {"./", "./index.html", "./manifest.webmanifest", "./version.txt"}
    for p in [*js_files, *vendor_files, *(ROOT / "css").glob("*.css"), *(p for p in (ROOT / "icons").iterdir() if p.is_file())]:
        expected.add("./" + rel(p))
    for missing in sorted(expected - listed):
        fail(f"sw.js: add '{missing}' to ASSETS")
    for extra in sorted(listed - expected):
        fail(f"sw.js: '{extra}' is in ASSETS but not shipped")
if "__BUILD__" not in sw:
    fail("sw.js: VERSION must stay '__BUILD__' (stamped at deploy)")

# 4. index.html: CSP + no remote code
html = (ROOT / "index.html").read_text(encoding="utf-8")
if 'http-equiv="Content-Security-Policy"' not in html:
    fail("index.html: Content-Security-Policy meta tag missing")
if re.search(r"""<(script|link)[^>]+(src|href)=["']https?:""", html):
    fail("index.html: remote scripts/styles are not allowed")
if re.search(r"<script(?![^>]*\bsrc=)[^>]*>\s*\S", html):
    fail("index.html: inline <script> blocks violate the CSP")
for meta in [
    'name="description"',
    'name="robots"',
    'property="og:title"',
    'property="og:description"',
    'name="twitter:card"',
]:
    if meta not in html:
        fail(f"index.html: SEO metadata missing {meta}")
if '<meta name="triti-analytics" content="">' not in html:
    fail('index.html: analytics must stay disabled in source (<meta name="triti-analytics" content="">); it is enabled at deploy')
if html.count("SEO:DEPLOY-URL:START") != 1 or html.count("SEO:DEPLOY-URL:END") != 1:
    fail("index.html: deployment SEO URL markers missing or duplicated")

# 5. innerHTML only from the sanitiser; localStorage only for settings; no console.log
for f in js_files:
    text = f.read_text(encoding="utf-8")
    for i, line in enumerate(text.splitlines(), 1):
        if re.search(r"\.innerHTML\s*=", line) and "renderMarkdown(" not in line and not re.search(r"""innerHTML\s*=\s*(['"`])[^${}]*\1\s*;?$""", line.strip()) and "? renderMarkdown(" not in line:
            fail(f"{rel(f)}:{i}: innerHTML must only receive renderMarkdown() output or a constant string")
        if "localStorage" in line and f.name != "settings.js":
            fail(f"{rel(f)}:{i}: localStorage is reserved for non-sensitive settings (js/settings.js)")
        if re.search(r"\bconsole\.log\(", line):
            fail(f"{rel(f)}:{i}: remove console.log")

# 6. Manifest + icons
try:
    manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
    for icon in manifest.get("icons", []):
        if not (ROOT / icon["src"]).is_file():
            fail(f"manifest.webmanifest: icon {icon['src']} missing")
    sizes = {i.get("sizes") for i in manifest.get("icons", [])}
    if not {"192x192", "512x512"} <= sizes:
        fail("manifest.webmanifest: needs 192x192 and 512x512 icons")
except (OSError, json.JSONDecodeError) as exc:
    fail(f"manifest.webmanifest: {exc}")

# 7. Version
version = (ROOT / "version.txt").read_text(encoding="utf-8").strip()
if not re.fullmatch(r"\d+\.\d+\.\d+(-[\w.]+)?", version):
    fail(f"version.txt: '{version}' is not semver")

# 8. Vendored files match their pinned hashes
vendor_manifest = ROOT / "vendor" / "manifest.json"
if vendor_manifest.is_file():
    sys.path.insert(0, str(ROOT / "scripts"))
    from vendor import verify  # noqa: E402

    errors.extend(verify())

if errors:
    print(f"✗ {len(errors)} problem(s):")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
print(f"✓ checks passed ({len(js_files)} modules, version {version})")
