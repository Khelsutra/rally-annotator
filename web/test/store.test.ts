import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the WXT browser API so the store's chrome.storage.local wrappers are testable.
const h = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock("wxt/browser", () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (k: string) => (k in h.store ? { [k]: h.store[k] } : {})),
        set: vi.fn(async (o: Record<string, unknown>) => {
          Object.assign(h.store, o);
        }),
      },
    },
  },
}));

import { deriveIdentity, csvFilename, loadRows, saveRows } from "../src/persist/store";
import type { RallyRow } from "../src/state/csv";

describe("deriveIdentity", () => {
  it("uses the YouTube video id on a watch URL", () => {
    const id = deriveIdentity(new URL("https://www.youtube.com/watch?v=abc123&t=42s"), "Match A");
    expect(id).toEqual({ key: "yt:abc123", title: "Match A" });
  });

  it("handles youtu.be and /shorts/ forms", () => {
    expect(deriveIdentity(new URL("https://youtu.be/XYZ987"), "t").key).toBe("yt:XYZ987");
    expect(deriveIdentity(new URL("https://www.youtube.com/shorts/SH0RT"), "t").key).toBe("yt:SH0RT");
  });

  it("falls back to origin+pathname (dropping query/hash) for generic pages", () => {
    expect(deriveIdentity(new URL("https://site.example/clips/m.html?x=1#z"), "t").key).toBe(
      "url:https://site.example/clips/m.html"
    );
  });

  it("uses host as the title when no document title is available", () => {
    expect(deriveIdentity(new URL("https://site.example/a"), "").title).toBe("site.example");
  });
});

describe("csvFilename", () => {
  it("sanitizes illegal filename characters and appends .rallies.csv", () => {
    expect(csvFilename("a/b")).toBe("a_b.rallies.csv");
    expect(csvFilename('x:y*z?"<>|')).toBe("x_y_z_.rallies.csv");
  });
  it("falls back to 'rallies' when empty", () => {
    expect(csvFilename("   ")).toBe("rallies.csv");
  });
});

describe("loadRows / saveRows", () => {
  beforeEach(() => {
    for (const k of Object.keys(h.store)) delete h.store[k];
  });

  it("returns [] for an unknown key", async () => {
    expect(await loadRows("nope")).toEqual([]);
  });

  it("round-trips rows through storage under the prefixed key", async () => {
    const rows: RallyRow[] = [{ n: 1, s: 1, e: 2, reason: "winner", sport: "badminton", shots: "9", extra: null }];
    await saveRows("vidkey", rows);
    expect(h.store["rally:vidkey"]).toEqual(rows);
    expect(await loadRows("vidkey")).toEqual(rows);
  });
});
