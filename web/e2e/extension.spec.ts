import { test, expect, chromium, type Worker, type Page } from "@playwright/test";
import path from "node:path";
import { readFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Proof-and-validation E2E: load the ACTUAL built extension into a real Chromium and, for
// EACH supported locale, switch the panel's language, prove the UI renders in that language,
// then mark a rally on a real seekable <video>, reload the page, and verify it persists
// with CANONICAL (English) reason/sport values. Each locale's session is screen-recorded to
// e2e-results/screencasts/<locale>.webm — the downloadable per-language proof.
// Extensions load only in Chromium and require a headed context (xvfb in CI).
//
// The expected localized strings are read straight from the catalog JSON the extension
// bundles (via fs, to avoid Node's JSON import-attribute requirement) — same source of truth.

const here = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(here, "..", ".output", "chrome-mv3");
const VIDEO_DIR = path.resolve(here, "..", "e2e-results", "videos");
const SCREENCAST_DIR = path.resolve(here, "..", "e2e-results", "screencasts");
const LOCALES_DIR = path.resolve(here, "..", "src", "i18n", "locales");

const SUPPORTED_LOCALES = ["en", "kn", "hi", "es", "da", "id", "te"] as const;
const LOCALE_LABELS: Record<string, string> = {
  en: "English", kn: "ಕನ್ನಡ", hi: "हिन्दी", es: "Español", da: "Dansk", id: "Bahasa Indonesia", te: "తెలుగు",
};

const CATS: Record<string, Record<string, string>> = {};
for (const l of SUPPORTED_LOCALES) {
  CATS[l] = JSON.parse(readFileSync(path.join(LOCALES_DIR, l, "common.json"), "utf8"));
}
// Mirror of the runtime t(): locale -> en -> raw key, with {var} interpolation.
function tt(locale: string, key: string, vars?: Record<string, string | number>): string {
  const tpl = CATS[locale]?.[key] ?? CATS.en[key] ?? key;
  return vars ? tpl.replace(/\{(\w+)\}/g, (_m, k: string) => (k in vars ? String(vars[k]) : `{${k}}`)) : tpl;
}

async function seekTo(page: Page, target: number) {
  await page.evaluate(
    (t) =>
      new Promise<void>((resolve) => {
        const v = document.getElementById("vid") as HTMLVideoElement;
        v.onseeked = () => resolve();
        v.currentTime = t;
      }),
    target
  );
}

// Clip metadata + window track, driven through the REAL extension in Chromium. Run once (in
// en) rather than per-locale: the per-locale proof above already covers rendering, and this
// case is about the two new artifacts reaching chrome.storage.local intact.
test("records clip screening metadata and a labelled window", async () => {
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run"],
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  try {
    let sw: Worker = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent("serviceworker");
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__videoReady === true, { timeout: 20_000 });
    await sw.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const id = tabs[0]?.id;
      if (id != null) await chrome.tabs.sendMessage(id, { type: "toggle-panel" });
    });
    await expect(page.locator(".hdr .t")).toContainText("Rally Annotator");

    // GX010150: two courts in frame, only one of them in play.
    await page.getByRole("button", { name: tt("en", "btn.clipInfo") }).click();
    await page.locator("input[name=clip-venue]").fill("bxh_indiranagar");
    await page.locator("input[name=clip-courtsVisible]").fill("2");
    await page.locator("input[name=clip-courtsActive]").fill("1");
    await page.locator("input[name=clip-targetCourt]").fill("c1");
    await page.getByRole("button", { name: tt("en", "btn.saveClip") }).click();

    const clip = await sw.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      const key = Object.keys(all).find((k) => k.startsWith("clip:"));
      return key ? (all as Record<string, unknown>)[key] : null;
    });
    expect(clip).toMatchObject({ court_count: 2, active_court_count: 1, target_court_id: "c1" });
    // The two counts must stay distinct, and an unset field must stay null, not 0.
    expect((clip as Record<string, unknown>).match_format).toBeNull();
    expect((clip as Record<string, unknown>).partially_visible_court_count).toBeNull();

    // Then a labelled window on the same clip, marked off the real <video>.
    await page.getByRole("button", { name: tt("en", "btn.windows") }).click();
    await seekTo(page, 2.0);
    await page.locator("input[name=win-start]").fill("12.500");
    await page.locator("input[name=win-end]").fill("18.250");
    await page.locator("select[name=win-label]").selectOption("adjacent_court_rally");
    await page.getByRole("button", { name: tt("en", "btn.saveWindowN", { n: 1 }) }).click();

    const wins = await sw.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      const key = Object.keys(all).find((k) => k.startsWith("win:"));
      return key ? (all as Record<string, unknown>)[key] : null;
    });
    expect(Array.isArray(wins)).toBe(true);
    expect(wins as unknown[]).toHaveLength(1);
    // The §4.4 label is DATA: canonical english regardless of the interface language.
    expect((wins as Array<Record<string, unknown>>)[0]).toMatchObject({
      n: 1, label: "adjacent_court_rally", court: "c1",
    });

    // The rally track is untouched by any of this.
    const rallies = await sw.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      return Object.keys(all).some((k) => k.startsWith("rally:"));
    });
    expect(rallies).toBe(false);
  } finally {
    await context.close();
  }
});

for (const locale of SUPPORTED_LOCALES) {
  test(`panel works and renders in ${locale} (${LOCALE_LABELS[locale]})`, async () => {
    const T = (key: string, vars?: Record<string, string | number>) => tt(locale, key, vars);

    // Fresh per-locale recording dir so a single recording is unambiguous (robust across reruns).
    const ldir = path.join(VIDEO_DIR, locale);
    rmSync(ldir, { recursive: true, force: true });

    const context = await chromium.launchPersistentContext("", {
      headless: false, // MV3 extensions require a headed context (run under xvfb in CI)
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run"],
      recordVideo: { dir: ldir, size: { width: 1280, height: 800 } },
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();
    try {
      let sw: Worker = context.serviceWorkers()[0];
      if (!sw) sw = await context.waitForEvent("serviceworker");

      await page.goto("/");
      await page.waitForFunction(() => (window as any).__videoReady === true, { timeout: 20_000 });

      await sw.evaluate(async () => {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const id = tabs[0]?.id;
        if (id != null) await chrome.tabs.sendMessage(id, { type: "toggle-panel" });
      });

      await expect(page.locator(".hdr .t")).toContainText("Rally Annotator"); // brand constant

      // Switch to this locale and PROVE the UI renders in that language.
      await page.locator("select[name=language]").selectOption(locale);
      await expect(page.getByRole("button", { name: T("btn.markStart") })).toBeVisible();

      // Mark a rally using the LOCALIZED controls.
      await seekTo(page, 1.0);
      await page.getByRole("button", { name: T("btn.markStart") }).click();
      await seekTo(page, 3.5);
      await page.getByRole("button", { name: T("btn.markEnd") }).click();

      await expect(page.getByPlaceholder(T("ph.start"))).toHaveValue("1.000");
      await expect(page.getByPlaceholder(T("ph.end"))).toHaveValue("3.500");

      await page.locator("select[name=reason]").selectOption("winner"); // canonical value
      await page.getByPlaceholder(T("ph.shots")).fill("12");
      await page.getByRole("button", { name: T("btn.saveRallyN", { n: 1 }) }).click();

      await expect(page.locator(".item")).toHaveCount(1);
      await expect(page.locator(".item").first()).toContainText("#1");
      await expect(page.locator(".item").first()).toContainText(T("reason.winner"));

      // Authoritative proof: persisted with CANONICAL english reason/sport regardless of UI language.
      const rows = await sw.evaluate(async () => {
        const all = await chrome.storage.local.get(null);
        const key = Object.keys(all).find((k) => k.startsWith("rally:"));
        return key ? (all as Record<string, unknown>)[key] : null;
      });
      expect(Array.isArray(rows)).toBe(true);
      const list = rows as Array<Record<string, unknown>>;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ n: 1, reason: "winner", sport: "badminton", shots: "12" });
      expect(Number(list[0].e)).toBeGreaterThan(Number(list[0].s));

      // Reload persistence proof: content script should rehydrate chrome.storage.local rows,
      // keep the locale choice, and resume numbering from the saved rally.
      await page.reload();
      await page.waitForFunction(() => (window as any).__videoReady === true, { timeout: 20_000 });
      await sw.evaluate(async () => {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const id = tabs[0]?.id;
        if (id != null) await chrome.tabs.sendMessage(id, { type: "toggle-panel" });
      });
      await expect(page.getByRole("button", { name: T("btn.markStart") })).toBeVisible();
      await expect(page.locator("select[name=language]")).toHaveValue(locale);
      await expect(page.locator(".item")).toHaveCount(1);
      await expect(page.locator(".item").first()).toContainText("#1");
      await expect(page.locator("input[name=next]")).toHaveValue("2");
    } finally {
      const video = page.video();
      await context.close(); // finalizes the recording
      // Copy the finalized recording to a named screencast. video.path() resolves only AFTER
      // the file is fully written (avoids copying a half-flushed file). Best-effort; an artifact, not an assertion.
      try {
        if (video) {
          const src = await video.path();
          mkdirSync(SCREENCAST_DIR, { recursive: true });
          copyFileSync(src, path.join(SCREENCAST_DIR, `${locale}.webm`));
        }
      } catch {
        /* screencast is an artifact, not an assertion */
      }
    }
  });
}
