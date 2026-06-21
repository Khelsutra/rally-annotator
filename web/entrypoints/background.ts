import { browser } from "wxt/browser";
import type { RuntimeMessage } from "../src/messages";

// Background service worker: performs the CSV download (chrome.downloads is unavailable
// to content scripts) and routes the toolbar-icon click into a panel toggle.
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: RuntimeMessage) => {
    if (msg && msg.type === "rally-download") {
      const url = "data:text/csv;charset=utf-8," + encodeURIComponent(msg.csv);
      void browser.downloads
        .download({ url, filename: msg.filename, saveAs: false, conflictAction: "overwrite" })
        .catch((e) => console.error("[rally] download failed:", e));
    }
  });

  // No default_popup is set, so the icon click fires onClicked -> toggle the panel.
  browser.action.onClicked.addListener((tab) => {
    if (tab.id != null) {
      void browser.tabs
        .sendMessage(tab.id, { type: "toggle-panel" } as RuntimeMessage)
        .catch(() => {
          /* tab has no content script (e.g. chrome:// page) */
        });
    }
  });
});
