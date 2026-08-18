# English-only message catalog

Rally Annotator is intentionally English-only as of v2.3.1. This decision applies to both the VLC
extension and the browser extension.

## Current contract

- There is one reviewed English catalog per frontend: `STRINGS.en` in the self-contained VLC Lua
  extension and `web/src/i18n/locales/en/common.json` for the browser extension.
- Neither frontend exposes a language selector, negotiates the browser language, stores a locale
  preference, bundles translated catalogs, or requires script-specific fonts.
- UI code still emits message keys plus interpolation parameters. This prevents duplicated prose and
  lets tests prove that every emitted key has English text.
- The CSV header and canonical reason/sport values are data identifiers. They remain unchanged.

## Verification

- The Lua suite asserts that `STRINGS` contains exactly one catalog and that the old language-change
  callback/control is absent.
- The web suite asserts that `web/src/i18n/locales/` contains exactly the `en` directory, checks every
  emitted message key, and keeps the no-bare-strings guard.
- The Chromium E2E confirms there is no language selector and records one English UI screencast.

This supersedes the repository's earlier multilingual design. Historical changelog entries remain as
history; they do not describe the current runtime surface.
