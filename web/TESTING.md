# Testing strategy — proof & validation driven

The goal is to **prove the extension actually works**, not assert it. Every layer produces
evidence; nothing is claimed without a green run or a recorded artifact.

## Layers

| Layer | Tool | What it proves | Where it runs |
|---|---|---|---|
| Unit — pure logic | Vitest (node) | CSV serialize/parse is **byte-compatible** with the VLC tool; the full state machine (numbering, two-step save, non-sticky reason, 3-way undo, unsaved-rally guard, edit relabels, write-failure rollback) | local + CI |
| Unit — DOM glue | Vitest (jsdom) | the panel mounts every control in its (open) shadow root and the controls drive the state machine + download; the video handler reads/seeks/toggles | local + CI |
| Coverage gate | Vitest v8 | enforced floors (statements/lines ≥ 95, functions ≥ 95, branches ≥ 82); build fails below | local + CI |
| Typecheck | `tsc --noEmit` | the source is type-sound | local + CI |
| Build | WXT | the MV3 bundle compiles to `.output/chrome-mv3` | local + CI |
| **E2E — real browser** | Playwright (Chromium) | the **actual built extension** loads, the panel marks a rally on a **real seekable `<video>`**, and the rally is persisted to `chrome.storage.local` and listed — the whole run is **screen-recorded** | local + CI |

Current unit coverage: ~98% statements/lines/functions, ~86% branches (the uncovered branches
are defensive fallbacks; the real browser behavior is covered by the E2E).

## Run it

```bash
npm test          # unit (fast)
npm run coverage  # unit + enforced coverage thresholds
npm run typecheck
npm run build
npm run e2e       # Playwright Chromium E2E (auto-starts the fixture server; records video)
```

The E2E screencast is written to `web/e2e-results/videos/*.webm`; the HTML report to
`web/e2e-report/`. In CI both are uploaded as artifacts (`chromium-e2e-screencast`, `coverage`)
on every run — open the workflow run and download them to watch the extension work.

## E2E design

- The extension is loaded into a **persistent Chromium context** with `--load-extension`
  (Playwright can only load extensions in Chromium). The MV3 service worker is the control
  surface; the panel reveals via the same `toggle-panel` message the toolbar icon sends.
- The fixture (`e2e/fixtures/`) is a small **VP9 WebM** (open codec — Chromium-for-testing has
  no proprietary codecs) served with **HTTP Range** support (`e2e/serve.mjs`) so the `<video>`
  is seekable. The test seeks to known times, marks START/END, saves, and asserts the row in
  `chrome.storage.local` + the recent list.
- Extensions require a **headed** context, so CI runs it under `xvfb`.

## Per-browser proof matrix

| Browser | Status | Notes |
|---|---|---|
| **Chromium** (Chrome/Edge) | ✅ proven, recorded in CI | the path above |
| **Firefox** | ⏳ harness-ready, not yet wired | Playwright can't load extensions in Firefox; use `web-ext run` + Selenium/geckodriver on a Linux CI runner once the `wxt build -b firefox` leg is added. Record via xvfb + ffmpeg. |
| **Safari** | 🚫 macOS-only | needs a Mac + the `xcrun safari-web-extension-converter` app wrapper; cannot run on Windows or GitHub's default runners. Validate on a `macos` runner once the Safari leg + app exist. |

This matrix is deliberately honest: we record real evidence for the browser the extension ships
on first (Chromium), and document the exact path to extend the same rigor to Firefox and Safari
when those build legs land.
