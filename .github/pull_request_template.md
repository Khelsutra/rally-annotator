<!-- Part of Khelsutra (https://khelsutra.guru). See CONTRIBUTING.md for the full merge bar. -->

## What & why
<!-- What does this change do, and why? Link any issue. -->

## How it was verified
<!-- Paste the relevant green output or describe the manual check. -->

## Checklist
- [ ] Tests added/updated for the change (and they fail before, pass after)
- [ ] **Web** (if `web/` touched): `npm run typecheck`, `npm run coverage` (thresholds hold), `npm run build`, `npm run e2e` all pass
- [ ] **VLC** (if `vlc/` touched): `luac5.1 -p` clean and `lua5.1 test/dialog_test.lua` green (layout snapshot regenerated if widgets moved)
- [ ] A new **user flow / UI change** is covered by the Playwright E2E (`web/e2e/`), not unit tests alone
- [ ] CSV schema unchanged, or changes round-trip and keep the byte-compatibility test green
- [ ] Docs updated if behavior changed (`README.md`, `web/README.md`); a **decision entry added to `web/DESIGN.md`** if architectural
