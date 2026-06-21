// Messages exchanged between the content script (page) and the background service
// worker. chrome.downloads is only available in the background context, so the CSV
// export is performed there; the toolbar-icon click is routed back to toggle the panel.
export type RuntimeMessage =
  | { type: "rally-download"; filename: string; csv: string }
  | { type: "toggle-panel" };
