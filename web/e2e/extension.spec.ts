import { test, expect, chromium, type Worker, type Page } from "@playwright/test";
import path from "node:path";
import { readFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Proof-and-validation E2E: load the actual built extension in Chromium, declare one video sport
// in Clip info, mark a rally on a real seekable <video>, reload, and verify persistence. The UI is
// intentionally English-only; canonical reason/sport values remain stable data identifiers.

const here = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(here, "..", ".output", "chrome-mv3");
const VIDEO_DIR = path.resolve(here, "..", "e2e-results", "videos", "en");
const SCREENCAST_DIR = path.resolve(here, "..", "e2e-results", "screencasts");
const CATALOG = JSON.parse(
  readFileSync(path.resolve(here, "..", "src", "i18n", "locales", "en", "common.json"), "utf8")
) as Record<string, string>;

function text(key: string, vars?: Record<string, string | number>): string {
  const template = CATALOG[key] ?? key;
  return vars
    ? template.replace(/\{(\w+)\}/g, (_match, name: string) =>
        name in vars ? String(vars[name]) : `{${name}}`
      )
    : template;
}

async function openPanel(page: Page, worker: Worker) {
  await page.goto("/");
  await page.waitForFunction(() => (window as any).__videoReady === true, { timeout: 20_000 });
  await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const id = tabs[0]?.id;
    if (id != null) await chrome.tabs.sendMessage(id, { type: "toggle-panel" });
  });
  await expect(page.locator(".hdr .t")).toContainText("Rally Annotator");
}

async function seekTo(page: Page, target: number) {
  await page.evaluate(
    (time) =>
      new Promise<void>((resolve) => {
        const video = document.getElementById("vid") as HTMLVideoElement;
        video.onseeked = () => resolve();
        video.currentTime = time;
      }),
    target
  );
}

test("records one per-video sport with optional clip metadata", async () => {
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run"],
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  try {
    let worker: Worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker");
    await openPanel(page, worker);

    await expect(page.locator("select[name=language]")).toHaveCount(0);
    await expect(page.locator("input[name=clip-venue]")).toBeVisible();
    await page.locator("select[name=clip-sport]").selectOption("table_tennis");
    await page.locator("input[name=clip-venue]").fill("bxh_indiranagar");
    await page.locator("input[name=clip-targetCourt]").fill("3");
    await page.locator("input[name=clip-cameraSetup]").fill("court-left-corner");
    await page.locator("input[name=clip-courtsVisible]").fill("2");
    await page.locator("input[name=clip-courtsActive]").fill("1");
    await page.getByRole("button", { name: text("btn.saveClip") }).click();

    const clip = await worker.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      const key = Object.keys(all).find((name) => name.startsWith("clip:"));
      return key ? (all as Record<string, unknown>)[key] : null;
    });
    expect(clip).toMatchObject({
      sport: "table_tennis",
      court_count: 2,
      active_court_count: 1,
      target_court_id: "3",
      camera_setup_id: "court-left-corner",
    });
    expect((clip as Record<string, unknown>).match_format).toBeNull();
    expect((clip as Record<string, unknown>).partially_visible_court_count).toBeNull();

    await expect(page.getByRole("button", { name: text("btn.target"), exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: text("btn.review"), exact: true })).toHaveCount(0);
    await expect(page.locator("[name^=target-]")).toHaveCount(0);
    await expect(page.locator("[name^=review-]")).toHaveCount(0);
    expect((clip as Record<string, unknown>).target_profiles).toEqual([]);
  } finally {
    await context.close();
  }
});

test("marks a rally in English and resumes the video sport after reload", async () => {
  rmSync(VIDEO_DIR, { recursive: true, force: true });
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run"],
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  try {
    let worker: Worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker");
    await openPanel(page, worker);

    await page.locator("select[name=clip-sport]").selectOption("pickleball");
    await page.getByRole("button", { name: text("btn.saveClip") }).click();
    await expect(page.locator("[data-video-sport]")).toHaveText(text("sport.pickleball"));

    await seekTo(page, 1.0);
    await page.getByRole("button", { name: text("btn.markStart") }).click();
    await seekTo(page, 3.5);
    await page.getByRole("button", { name: text("btn.markEnd") }).click();
    await expect(page.getByPlaceholder(text("ph.start"))).toHaveValue("1.000");
    await expect(page.getByPlaceholder(text("ph.end"))).toHaveValue("3.500");

    await page.locator("select[name=reason]").selectOption("winner");
    await page.getByPlaceholder(text("ph.shots")).fill("12");
    await page.getByRole("button", { name: text("btn.saveRallyN", { n: 1 }) }).click();
    await expect(page.locator(".item")).toHaveCount(1);

    const rows = await worker.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      const key = Object.keys(all).find((name) => name.startsWith("rally:"));
      return key ? (all as Record<string, unknown>)[key] : null;
    });
    expect(Array.isArray(rows)).toBe(true);
    expect(rows as Array<Record<string, unknown>>).toHaveLength(1);
    expect((rows as Array<Record<string, unknown>>)[0]).toMatchObject({
      n: 1,
      reason: "winner",
      sport: "pickleball",
      shots: "12",
    });

    await page.reload();
    await page.waitForFunction(() => (window as any).__videoReady === true, { timeout: 20_000 });
    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const id = tabs[0]?.id;
      if (id != null) await chrome.tabs.sendMessage(id, { type: "toggle-panel" });
    });
    await expect(page.locator("select[name=language]")).toHaveCount(0);
    await expect(page.locator("[data-video-sport]")).toHaveText(text("sport.pickleball"));
    await expect(page.locator(".item")).toHaveCount(1);
    await expect(page.locator("input[name=next]")).toHaveValue("2");
  } finally {
    const video = page.video();
    await context.close();
    try {
      if (video) {
        const source = await video.path();
        mkdirSync(SCREENCAST_DIR, { recursive: true });
        copyFileSync(source, path.join(SCREENCAST_DIR, "english.webm"));
      }
    } catch {
      // Screencast is an artifact, not an assertion.
    }
  }
});
