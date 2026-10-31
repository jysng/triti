"""Browser tests for Triti (pytest + Playwright, Chromium)."""
from __future__ import annotations

import io
import json
import re
import zipfile

import pytest
from playwright.sync_api import Page, expect

PASS = "correct horse battery staple"


def test_unit_suite(page: Page, base_url: str, console_errors: list[str]) -> None:
    page.goto(f"{base_url}/tests/")
    page.wait_for_function("() => window.__TEST_RESULTS__", timeout=60_000)
    results = page.evaluate("() => window.__TEST_RESULTS__")
    failures = "\n".join(f"{f['name']}: {f['message']}" for f in results["failures"])
    assert results["failed"] == 0, failures
    assert results["passed"] > 40
    assert console_errors == []


def onboard(page: Page, url: str) -> None:
    page.goto(url)
    page.get_by_label("Create a passphrase").fill(PASS)
    page.get_by_label("Confirm passphrase").fill(PASS)
    page.get_by_role("checkbox").check()
    page.get_by_role("button", name="Create my journal").click()
    expect(page.locator("#entry-editor")).to_be_visible(timeout=20_000)


def test_journal_flow(page: Page, base_url: str, console_errors: list[str]) -> None:
    onboard(page, f"{base_url}/")

    # Write today's entry with a tag and a mood; autosave kicks in.
    page.locator("#entry-editor").fill("Grateful for a quiet morning walk #gratitude")
    page.locator("label.mood-option", has_text="Great").click()
    expect(page.get_by_role("radio", name=re.compile("Great"))).to_be_checked()
    expect(page.locator(".save-status")).to_contain_text("Saved", timeout=5_000)

    # Data at rest is encrypted.
    raw = page.evaluate(
        """() => new Promise((resolve) => {
            const req = indexedDB.open('triti');
            req.onsuccess = () => {
              const all = req.result.transaction('entries').objectStore('entries').getAll();
              all.onsuccess = () => resolve(JSON.stringify(all.result));
            };
        })"""
    )
    assert "Grateful" not in raw and "gratitude" not in raw

    # Lock, wrong passphrase, unlock.
    page.locator("#lock-btn").click()
    unlock = page.locator("#unlock-pass")
    expect(unlock).to_be_visible()
    unlock.fill("definitely wrong")
    page.get_by_role("button", name="Unlock").click()
    expect(page.get_by_role("alert")).to_contain_text(re.compile("not correct", re.I), timeout=20_000)
    unlock.fill(PASS)
    page.get_by_role("button", name="Unlock").click()
    expect(page.locator("#entry-editor")).to_have_value(re.compile("quiet morning"), timeout=20_000)

    # Search by tag.
    page.goto(f"{base_url}/#/search?q=%23gratitude")
    expect(page.locator("main")).to_contain_text("quiet morning")

    # Calendar and insights render.
    page.goto(f"{base_url}/#/calendar")
    expect(page.locator("main a[href^='#/day/']").first).to_be_visible()
    page.goto(f"{base_url}/#/insights")
    expect(page.locator("main svg").first).to_be_visible()

    # Encrypted backup download.
    page.goto(f"{base_url}/#/settings")
    with page.expect_download() as dl:
        page.get_by_role("button", name="Download encrypted backup").click()
    backup = json.loads(dl.value.path().read_text(encoding="utf-8"))
    assert backup["format"] == "triti-backup" and len(backup["entries"]) == 1
    assert "Grateful" not in json.dumps(backup)

    # Markdown export (after a warning dialog) is a valid zip.
    page.get_by_role("button", name="Export Markdown (.zip)").click()
    with page.expect_download() as dl:
        page.get_by_role("dialog").get_by_role("button", name="Export").click()
    with zipfile.ZipFile(io.BytesIO(dl.value.path().read_bytes())) as zf:
        assert zf.testzip() is None
        (name,) = zf.namelist()
        body = zf.read(name).decode("utf-8")
    assert name.startswith("triti/") and name.endswith(".md")
    assert "mood: 5" in body and "tags: [gratitude]" in body

    # Theme switch applies immediately.
    page.locator("label.theme-swatch", has_text="Midnight").click()
    expect(page.locator("html")).to_have_attribute("data-theme", "midnight")

    assert console_errors == []


def test_markdown_preview_is_safe(page: Page, base_url: str, console_errors: list[str]) -> None:
    onboard(page, f"{base_url}/")
    page.locator("#entry-editor").fill('<img src=x onerror="window.__pwned=1"> **bold**')
    page.get_by_role("button", name="Preview").click()
    expect(page.locator("strong", has_text="bold")).to_be_visible()
    assert page.evaluate("() => window.__pwned ?? null") is None
    assert console_errors == []


def test_accessibility(page: Page, base_url: str, browser) -> None:
    axe_mod = pytest.importorskip("axe_playwright_python.sync_playwright")
    # axe injects a script, which our strict CSP would block, so bypass it for this audit only.
    context = browser.new_context(bypass_csp=True)
    p = context.new_page()
    try:
        onboard_page = p
        onboard_page.goto(f"{base_url}/")
        violations = axe_mod.Axe().run(onboard_page).response["violations"]
        onboard(onboard_page, f"{base_url}/")
        for route in ["", "#/calendar", "#/search", "#/insights", "#/settings"]:
            onboard_page.goto(f"{base_url}/{route}")
            onboard_page.wait_for_timeout(300)
            violations += axe_mod.Axe().run(onboard_page).response["violations"]
        serious = [f"{v['id']}: {v['help']}" for v in violations if v.get("impact") in {"serious", "critical"}]
        assert serious == [], "\n".join(sorted(set(serious)))
    finally:
        context.close()


def test_works_offline(page: Page, base_url: str, context, console_errors: list[str]) -> None:
    # The service worker is opt-in on localhost via ?sw.
    page.goto(f"{base_url}/?sw")
    page.evaluate("() => navigator.serviceWorker.ready.then(() => true)")
    page.reload()  # now controlled by the service worker
    page.wait_for_function("() => Boolean(navigator.serviceWorker.controller)")
    context.set_offline(True)
    try:
        page.reload()
        expect(page.get_by_role("button", name="Create my journal")).to_be_visible()
        onboard(page, f"{base_url}/?sw")
    finally:
        context.set_offline(False)
    assert [e for e in console_errors if "net::ERR_INTERNET_DISCONNECTED" not in e] == []
