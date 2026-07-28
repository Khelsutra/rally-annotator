import { browser } from "wxt/browser";
import { Annotator } from "../src/state/annotator";
import { DirectVideoHandler } from "../src/video/directVideo";
import {
  deriveIdentity, loadRows, saveRows, csvFilename,
  loadClip, saveClip, loadReviews, saveReviews, hasLegacyWindows,
} from "../src/persist/store";
import { clipmetaFilename } from "../src/state/clipmeta";
import { reviewFilename } from "../src/state/targetReview";
import { mountPanel } from "../src/ui/panel";
import { getLocale, setLocale, negotiateLocale, type Locale } from "../src/i18n";
import type { RuntimeMessage } from "../src/messages";

// Top-frame content script: derives the per-video identity, loads any saved rallies,
// wires the pure Annotator to the page's video + storage + CSV download, and mounts the
// panel (hidden until the toolbar icon is clicked). Cross-origin EMBEDDED players
// (youtube.com/embed inside a third-party page) are a later, separate handler.
export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  async main() {
    if (window.top !== window) return; // v1: top frame only

    const identity = deriveIdentity();
    const video = new DirectVideoHandler();
    const rows = await loadRows(identity.key);
    // The clip sidecar and window track resume from the same per-video identity as the
    // rallies, so re-opening a video restores what was screened rather than re-asking.
    const clip = await loadClip(identity.key);
    const reviews = await loadReviews(identity.key);
    const legacyWindowsPresent = await hasLegacyWindows(identity.key);

    // LD-i8: seed the locale from the stored preference, falling back to the browser language.
    const stored = await browser.storage.local.get("lang");
    setLocale(negotiateLocale(stored.lang, navigator.languages));

    const annotator = new Annotator({
      rows,
      // chrome.storage.local is the source of truth (extension-scoped). Async mirror;
      // the in-memory annotator.rows is authoritative for the live session.
      persist: (rs) => {
        void saveRows(identity.key, rs);
        return { ok: true };
      },
    });

    const send = (filename: string, body: string, mime?: string) =>
      void browser.runtime.sendMessage({
        type: "rally-download",
        filename,
        csv: body,
        mime,
      } as RuntimeMessage);

    const panel = mountPanel({
      annotator,
      video,
      identity,
      clip: clip ?? undefined,
      reviews,
      legacyWindowsPresent,
      download: (csv) => send(csvFilename(identity.title), csv),
      downloadClipMeta: (json) =>
        send(clipmetaFilename(identity.title), json, "application/json"),
      downloadReviews: (csv) => send(reviewFilename(identity.title), csv),
      persistClip: (c) => void saveClip(identity.key, c),
      persistReviews: (r) => void saveReviews(identity.key, r),
      onLocaleChange: (locale: Locale) => {
        void browser.storage.local.set({ lang: locale });
      },
    });

    panel.toggle(); // start hidden; the toolbar icon reveals it on pages you want to annotate

    browser.runtime.onMessage.addListener((msg: RuntimeMessage) => {
      if (msg && msg.type === "toggle-panel") panel.toggle();
    });
  },
});
