// Live store + per-video identity. chrome.storage.local is the source of truth (it is
// extension-scoped — unlike a content script's IndexedDB, which would live in the
// VISITED site's origin — and is plenty for per-video rally data). Resume numbering is
// derived from the loaded rows by the Annotator, exactly like VLC's next_rally_number().

import { browser } from "wxt/browser";
import type { RallyRow } from "../state/csv";

const PREFIX = "rally:";

export interface VideoIdentity {
  key: string; // storage discriminator (stable per video)
  title: string; // human label, used as the CSV filename base
}

// Structural subset of Location so this is unit-testable with a plain URL.
export interface LocationLike {
  hostname: string;
  search: string;
  pathname: string;
  origin: string;
}

// Derive a stable key for the current page's video. YouTube watch/shorts/youtu.be get
// the video id; everything else uses origin+pathname (volatile query/hash dropped).
// location/title are injectable so this is testable without a DOM.
export function deriveIdentity(loc: LocationLike = location, docTitle?: string): VideoIdentity {
  const host = loc.hostname.replace(/^www\./, "");
  const fallbackTitle = typeof document !== "undefined" ? document.title : "";
  const title = ((docTitle ?? fallbackTitle) || host || "rallies").trim();

  if (/(^|\.)youtube\.com$/.test(host)) {
    const v = new URLSearchParams(loc.search).get("v");
    const shorts = loc.pathname.match(/^\/shorts\/([^/]+)/);
    const id = v ?? (shorts ? shorts[1] : null);
    if (id) return { key: `yt:${id}`, title };
  }
  if (host === "youtu.be") {
    const id = loc.pathname.slice(1).split("/")[0];
    if (id) return { key: `yt:${id}`, title };
  }
  return { key: `url:${loc.origin}${loc.pathname}`, title };
}

export async function loadRows(key: string): Promise<RallyRow[]> {
  const r = await browser.storage.local.get(PREFIX + key);
  const v = (r as Record<string, unknown>)[PREFIX + key];
  return Array.isArray(v) ? (v as RallyRow[]) : [];
}

export async function saveRows(key: string, rows: RallyRow[]): Promise<void> {
  await browser.storage.local.set({ [PREFIX + key]: rows });
}

// Sanitize a title into a safe "<name>.rallies.csv" filename (mirrors the VLC output
// naming of <video-stem>.rallies.csv, as close as a sandboxed download allows).
export function csvFilename(title: string): string {
  const base = title
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return base ? `${base}.rallies.csv` : "rallies.csv";
}
