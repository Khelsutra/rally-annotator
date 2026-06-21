import { test, expect, chromium, type Worker } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Proof-and-validation E2E: load the ACTUAL built extension into a real Chromium, drive
// the panel on a real seekable <video>, and verify the rally is marked, persisted to
// chrome.storage.local, and shown in the recent list. The whole run is screen-recorded
// (see playwright.config use / the recordVideo dir below) as the Chromium "it works"
// artifact. Extensions load only in Chromium and require a headed context (xvfb in CI).

const here = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(here, "..", ".output", "chrome-mv3");
const VIDEO_DIR = path.resolve(here, "..", "e2e-results", "videos");

async function seekTo(page: import("@playwright/test").Page, t: number) {
  await page.evaluate(
    (target) =>
      new Promise<void>((resolve) => {
        const v = document.getElementById("vid") as HTMLVideoElement;
        v.onseeked = () => resolve();
        v.currentTime = target;
      }),
    t
  );
}

test("extension marks, saves, persists and lists a rally on a real video", async () => {
  const context = await chromium.launchPersistentContext("", {
    headless: false, // MV3 extensions require a headed context (run under xvfb in CI)
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run"],
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });

  try {
    // The MV3 background service worker is the extension's identity + control surface.
    let sw: Worker = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent("serviceworker");

    const page = await context.newPage();
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__videoReady === true, { timeout: 20_000 });

    // Reveal the panel through the real plumbing (same message the toolbar icon sends).
    await sw.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const id = tabs[0]?.id;
      if (id != null) await chrome.tabs.sendMessage(id, { type: "toggle-panel" });
    });

    // Panel lives in an OPEN shadow root, so Playwright pierces it.
    await expect(page.locator(".hdr .t")).toContainText("Rally Annotator");
    await expect(page.getByRole("button", { name: "Mark START" })).toBeVisible();

    // Mark a rally at known timestamps on the real video.
    await seekTo(page, 1.0);
    await page.getByRole("button", { name: "Mark START" }).click();
    await seekTo(page, 3.5);
    await page.getByRole("button", { name: "Mark END" }).click();

    // Both marks captured distinct times off the real (seekable) video.
    await expect(page.getByPlaceholder("start s")).toHaveValue("1.000");
    await expect(page.getByPlaceholder("end s")).toHaveValue("3.500");

    await page.locator("select[name=reason]").selectOption("winner");
    await page.getByPlaceholder("shots").fill("12");
    await page.getByRole("button", { name: /^Save Rally/ }).click();

    // The recent-rallies list shows exactly one row, for rally #1.
    await expect(page.locator(".item")).toHaveCount(1);
    await expect(page.locator(".item").first()).toContainText("#1");
    await expect(page.locator(".item").first()).toContainText("winner");
    await expect(page.locator(".item").first()).toContainText("12 shots");

    // Authoritative proof: the row is persisted in the extension's storage.
    const rows = await sw.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      const key = Object.keys(all).find((k) => k.startsWith("rally:"));
      return key ? (all as Record<string, unknown>)[key] : null;
    });
    expect(Array.isArray(rows)).toBe(true);
    const list = rows as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ n: 1, reason: "winner", sport: "badminton", shots: "12" });
    expect(Number(list[0].s)).toBeGreaterThanOrEqual(0.5);
    expect(Number(list[0].s)).toBeLessThan(2.0);
    expect(Number(list[0].e)).toBeGreaterThan(Number(list[0].s));
  } finally {
    await context.close(); // flushes the screencast video
  }
});
