#!/usr/bin/env python3
"""Copy the shippable files into _site/ for GitHub Pages. Not a build: files are
copied unchanged except sw.js, whose cache VERSION is stamped so every deploy
invalidates the offline cache, and the published URL is inserted into SEO tags.

    python3 scripts/package_site.py [version-stamp]

Set SITE_URL for a custom domain. Otherwise GITHUB_REPOSITORY is used.
Set GOATCOUNTER_CODE (e.g. "triti" for triti.goatcounter.com) to enable
anonymous, cookieless visitor counting.
"""
from __future__ import annotations

import os
import re
import shutil
import sys
import time
from html import escape as html_escape
from pathlib import Path
from urllib.parse import urlsplit
from xml.sax.saxutils import escape as xml_escape

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_site"
INCLUDE = ["index.html", "manifest.webmanifest", "sw.js", "version.txt", ".nojekyll", "css", "js", "icons", "vendor"]
SEO_START = "  <!-- SEO:DEPLOY-URL:START -->"
SEO_END = "  <!-- SEO:DEPLOY-URL:END -->"


def published_url() -> str | None:
    value = os.environ.get("SITE_URL", "").strip()
    if value:
        result = value.rstrip("/") + "/"
    else:
        repository = os.environ.get("GITHUB_REPOSITORY", "").strip()
        if "/" not in repository:
            return None
        owner, name = repository.split("/", 1)
        if name.lower() == f"{owner}.github.io".lower():
            result = f"https://{owner}.github.io/"
        else:
            result = f"https://{owner}.github.io/{name}/"
    parts = urlsplit(result)
    if parts.scheme != "https" or not parts.netloc or parts.username or parts.password or parts.query or parts.fragment:
        raise SystemExit("SITE_URL must be an https URL without credentials, query, or fragment.")
    return result


def add_search_metadata(site_url: str | None) -> None:
    index = OUT / "index.html"
    html = index.read_text(encoding="utf-8")
    start = html.index(SEO_START)
    end = html.index(SEO_END, start) + len(SEO_END)
    tags = ""
    if site_url:
        image_url = site_url + "icons/icon-512.png"
        tags = "\n".join([
            SEO_START,
            f'  <link rel="canonical" href="{html_escape(site_url, quote=True)}">',
            f'  <meta property="og:url" content="{html_escape(site_url, quote=True)}">',
            f'  <meta property="og:image" content="{html_escape(image_url, quote=True)}">',
            f'  <meta name="twitter:image" content="{html_escape(image_url, quote=True)}">',
            SEO_END,
        ])
        (OUT / "robots.txt").write_text(
            f"User-agent: *\nAllow: /\nSitemap: {site_url}sitemap.xml\n",
            encoding="utf-8",
        )
        (OUT / "sitemap.xml").write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"  <url><loc>{xml_escape(site_url)}</loc></url>\n"
            "</urlset>\n",
            encoding="utf-8",
        )
    else:
        print("warning: set SITE_URL or GITHUB_REPOSITORY to generate canonical, social image, robots.txt and sitemap.xml")
    html = html[:start] + tags + html[end:]
    index.write_text(html, encoding="utf-8")


def add_analytics(code: str) -> None:
    code = code.strip().lower()
    if not code:
        return
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,62}", code):
        raise SystemExit("GOATCOUNTER_CODE must be the GoatCounter site code, e.g. 'triti'.")
    origin = f"https://{code}.goatcounter.com"
    index = OUT / "index.html"
    html = index.read_text(encoding="utf-8")
    marker = '<meta name="triti-analytics" content="">'
    if marker not in html or "img-src 'self' data: blob:;" not in html:
        raise SystemExit("index.html: analytics placeholder or CSP img-src not found")
    html = html.replace(marker, f'<meta name="triti-analytics" content="{origin}/count">')
    html = html.replace("img-src 'self' data: blob:;", f"img-src 'self' data: blob: {origin};")
    index.write_text(html, encoding="utf-8")
    print(f"analytics enabled: {origin}")


def main() -> None:
    stamp = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("GITHUB_SHA", ""))[:12] or time.strftime("%Y%m%d%H%M%S")
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    for name in INCLUDE:
        src = ROOT / name
        if src.is_dir():
            shutil.copytree(src, OUT / name)
        elif src.is_file():
            shutil.copy2(src, OUT / name)
    sw = OUT / "sw.js"
    sw.write_text(sw.read_text(encoding="utf-8").replace("__BUILD__", stamp), encoding="utf-8")
    add_search_metadata(published_url())
    add_analytics(os.environ.get("GOATCOUNTER_CODE", ""))
    files = sum(1 for p in OUT.rglob("*") if p.is_file())
    print(f"packaged {files} files into _site/ (cache version {stamp})")


if __name__ == "__main__":
    main()
