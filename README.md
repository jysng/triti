# Triti 🌅

A private, beautiful daily journal that lives entirely in your browser. It is encrypted, works offline, and is hosted free on GitHub Pages.

- **Private by design.** Entries are encrypted with AES-256-GCM using a key derived from your passphrase (PBKDF2-SHA256, 600k iterations). Your entries are never uploaded, and there are no accounts or cookies. Optional anonymous visit counting is available.
- **One page per day.** It has a Markdown editor with autosave, focus mode, a formatting toolbar, voice dictation and a preview.
- **Mood tracking.** A five-point mood picker sets a glow on the page and colours the year heatmap.
- **Hashtags and instant search.** Search with `#tag`, `mood:4`, and prefix matching across all entries.
- **Year heatmap and streaks.** Colour the heatmap by mood or by word count; see your current and longest streaks.
- **Daily prompts.** Pick from 60 thoughtful prompts, plus **On this day** memories from previous years.
- **Insights.** Week, month and year charts: mood over time, words written, mood by weekday, when you write, top tags and highlights.
- **Themes.** Choose auto, light, dark, sepia or midnight, plus a custom accent colour, fonts, text size and line width.
- **Installable and offline (PWA).** It works with no network.
- **Your data stays portable.** You can create an encrypted backup and restore or merge it, export a Markdown `.zip`, or print / save as PDF.
- **Auto-lock** after inactivity, plus keyboard shortcuts.

> ⚠️ There is no passphrase recovery. If you forget it, your entries cannot be decrypted, so download encrypted backups regularly.

## Tech: no Node, no build

Triti is plain HTML, CSS and JavaScript ES modules (JSDoc-typed, `// @ts-check`), with **zero runtime dependencies**. The repository root *is* the website. All tooling is Python 3.

```bash
python3 scripts/serve.py          # app → http://localhost:8000   unit tests → /tests/
python3 scripts/check.py          # static guard-rails (imports, CSP, service-worker list, …)

# Full browser test suite (unit + end-to-end + offline + accessibility)
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m playwright install chromium
pytest -q
```

The service worker is disabled on localhost so you don't get stale caches. Add `?sw` to the URL to test offline mode.

## Deploy to GitHub Pages (free account)

1. Create a **public** repository, for example `triti`, and push this folder to `main`:
   ```bash
   git remote add origin https://github.com/<you>/triti.git
   git push -u origin main
   ```
   If you use drag-and-drop upload instead, make sure the hidden `.github/` folder and the `.nojekyll` file are included. In Finder, press ⌘⇧. to show hidden files. Pushing with git is easier.
2. Go to **Settings → Pages → Source** and select **GitHub Actions**.
3. Go to **Settings → Actions → General → Workflow permissions** and enable **Allow GitHub Actions to create and approve pull requests**. Release automation needs this.
4. Every push to `main` runs the tests and deploys to `https://<you>.github.io/triti/`.

The deploy step fills in the canonical URL, Open Graph/social image URL, `robots.txt` and
`sitemap.xml` from the GitHub repository name. For a custom domain, add a repository Actions
variable named `SITE_URL` with the public HTTPS URL (for example `https://journal.example.com/`).

### Visitor counting (optional)

Triti can count visits with [GoatCounter](https://www.goatcounter.com/), which is free, open source and cookieless.

1. Sign up at goatcounter.com and choose a site code (for example `triti` gives `triti.goatcounter.com`).
2. In the GitHub repo, go to **Settings → Secrets and variables → Actions → Variables** and add `GOATCOUNTER_CODE` with that code.
3. Re-run the **Deploy** workflow, or push to `main`.

Only the page path, screen width and a random cache-buster are sent. The app never sends the `#/…`
route (which contains dates and searches), query strings, referrers or journal content. No visit is
counted on localhost, when Do Not Track or Global Privacy Control is on, or when a user turns it off in
**Settings → Privacy & security**. The CSP only allows your GoatCounter domain, and only for images.
If the variable is not set, Triti makes no third-party requests at all.

## Automation

| Workflow | When | What |
|---|---|---|
| `ci.yml` | Pull requests | Runs `check.py` and pytest-playwright (unit, end-to-end, offline, axe). |
| `deploy.yml` | Push to `main` | Runs CI, packages the site (stamping the service-worker cache version) and publishes it to Pages. |
| `release.yml` | Push to `main` | release-please opens a release PR from Conventional Commits. Merging it bumps `version.txt`, updates `CHANGELOG.md` and creates a tag and release. |
| `maintenance.yml` | Weekly | Runs tests on the latest Chromium, checks vendored libraries and checks that the live site is up. If anything fails, it opens an issue. |
| Dependabot | Weekly / monthly | Opens PRs to update GitHub Actions and the pip test tools. |

## Copilot agents, skills and prompts

The `.github/` folder contains everything Copilot needs to build and maintain the app for you. This works in VS Code Copilot Chat and with the Copilot coding agent on GitHub.

- **`copilot-instructions.md`** holds project-wide hard rules: no Node, privacy, CSP, relative URLs.
- **`instructions/`** holds rules scoped to particular paths: UI, security-critical files and tests.
- **`agents/`** defines eight roles:
  - `orchestrator` plans the work and routes it to the other roles.
  - `architect` writes designs.
  - `builder` writes the code.
  - `designer` handles UI and accessibility.
  - `qa` writes and runs tests.
  - `security-reviewer` reviews changes for privacy and security risks.
  - `release-manager` handles versions and deployment.
  - `maintainer` runs weekly upkeep.
- **`skills/`** contains ten playbooks:
  - `scaffold-journal-app`
  - `add-journal-feature`
  - `journal-data-layer`
  - `client-encryption`
  - `ui-design-system`
  - `pwa-offline`
  - `testing-journal`
  - `github-pages-deploy`
  - `release-changelog`
  - `vendor-deps`
- **`prompts/`** contains `/new-feature`, `/fix-bug`, `/design-review`, `/release` and `/weekly-maintenance`.

Typical use: in Copilot Chat run `/new-feature` (for example "entry templates"), or pick the **orchestrator** agent and describe what you want. On GitHub, you can assign an issue to Copilot.

## Project layout

```
index.html  manifest.webmanifest  sw.js  version.txt
css/app.css                 design tokens, five themes, components
js/main.js                  boot, hash router, lock/idle, service worker
js/crypto.js  js/vault.js   key derivation, AES-GCM, passphrase lifecycle
js/db.js  js/journal.js     IndexedDB and the decrypted in-memory journal and search
js/views/*.js               day, calendar, search, insights, settings, print, lock
js/ui/*.js                  DOM helpers, dialogs, toasts, SVG charts
tests/                      in-browser unit tests and pytest-playwright tests
scripts/                    serve, check, package_site, vendor, make_icons (Python)
```

## Privacy model
 
- Only each entry's date and last-modified time are stored unencrypted.
- The text, mood and prompt are encrypted, using the date as authenticated data.
- The key is non-extractable and kept in memory only, and it is discarded when the journal locks.
- A strict Content-Security-Policy blocks inline and remote code.
- Optional visit counting sends no entry data, dates or searches, and respects Do Not Track.
- Encrypted backups can only be read with your passphrase. The Markdown export is plaintext and asks you to confirm before it runs.

Licence: MIT.
