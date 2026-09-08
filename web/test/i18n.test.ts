import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { t, catalogKeys, EN_KEYS } from "../src/i18n";
import { Annotator } from "../src/state/annotator";
import { MATCH_FORMATS } from "../src/state/clipmeta";
import { SETUP_VALIDITY, TARGET_STATES, serializeReviews } from "../src/state/targetReview";

describe("English message catalog", () => {
  it("interpolates {vars}", () => {
    expect(t("status.removedLast", { n: 7, count: 3 })).toBe("Removed last rally #7. 3 remaining.");
  });

  it("leaves unknown placeholders intact", () => {
    expect(t("status.startSet", {})).toContain("{t}");
  });

  it("returns the raw key when the catalog is missing it", () => {
    expect(t("does.not.exist")).toBe("does.not.exist");
  });

  it("ships exactly one locale catalog", () => {
    const locales = readdirSync(new URL("../src/i18n/locales", import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(locales).toEqual(["en"]);
  });

  it("exposes the English source key set", () => {
    expect(new Set(EN_KEYS)).toEqual(new Set(catalogKeys()));
    expect(EN_KEYS.length).toBeGreaterThan(100);
  });
});

describe("catalog integrity", () => {
  it("contains every key the Annotator can emit", () => {
    const en = new Set(EN_KEYS);
    const used = [
      "status.noMediaStart", "status.unsavedGuard", "status.startSet", "status.noMediaEnd",
      "status.endSet", "status.needStart", "status.needEnd", "status.zeroLength", "status.needReason",
      "status.needShots", "status.exportBlocked", "status.writeFailed",
      "status.needVideoSport", "status.mixedVideoSport", "clip.sportNormalized",
      "status.updated", "status.duplicate", "status.saved", "status.needSelectEdit", "status.notFound",
      "status.editGuard", "status.editing", "status.needSelectDelete", "status.deleted",
      "status.editCancelled", "status.clearedMark", "status.nothingUndo", "status.removedLast",
      "btn.markStart", "btn.markEnd", "btn.reMarkStart", "btn.reMarkEnd", "btn.saveRally",
      "btn.saveRallyN", "btn.saveChangesN", "btn.undo", "btn.undoCancelEdit", "btn.undoClearMark", "btn.undoN",
    ];
    for (const key of used) expect(en.has(key), `missing English key: ${key}`).toBe(true);
  });

  it("contains every clip-info key the panel can emit", () => {
    const en = new Set(EN_KEYS);
    const used = [
      "btn.clipInfo", "btn.saveClip", "label.venue", "label.cameraSetup", "label.courtsVisible",
      "label.courtsActive", "label.courtsPartial", "label.matchFormat", "label.captureTime",
      "label.notes", "fmt.unset", ...MATCH_FORMATS.map((format) => "fmt." + format),
      "clip.saved", "clip.savedNormalized", "clip.invalidActive", "clip.invalidPartial",
      "clip.invalidNumber", "clip.captureUnknown", "cov.line", "cov.tail", "cov.span",
    ];
    for (const key of used) expect(en.has(key), `missing English key: ${key}`).toBe(true);
  });

  it("contains display text for every canonical target state and validity", () => {
    for (const state of TARGET_STATES) expect(t("state." + state)).not.toBe("state." + state);
    for (const validity of SETUP_VALIDITY) expect(t("validity." + validity)).not.toBe("validity." + validity);
  });
});

describe("canonical data stays independent of display prose", () => {
  it("serializes target states unchanged", () => {
    const csv = serializeReviews([
      { n: 1, s: 12.5, e: 18.25, state: "not_rallying", section: "s1", source: "operator", notes: "" },
    ]);
    expect(csv).toContain("1,12.500,18.250,not_rallying,s1,operator,");
  });

  it("serializes canonical reason and sport values", () => {
    const annotator = new Annotator({ sport: "badminton" });
    annotator.markStart(1);
    annotator.markEnd(2.5);
    annotator.reason = "winner";
    annotator.shotsField = "9";
    annotator.saveRally();
    expect(annotator.toCSV()).toContain("1,1.000,2.500,winner,badminton,9");
  });
});

describe("withdrawn vocabulary", () => {
  const withdrawn = [
    "wlabel.target_rally", "wlabel.adjacent_court_rally", "wlabel.simultaneous_rallies",
    "wlabel.target_court_non_rally", "wlabel.empty", "tally.line", "btn.saveWindow",
    "label.windowLabel", "label.recentWindows", "clip.needTarget",
  ];

  it("is absent from catalog keys and values", () => {
    const keys = new Set(catalogKeys());
    for (const key of withdrawn) expect(keys.has(key), `still defines ${key}`).toBe(false);
    for (const key of catalogKeys()) {
      if (key === "legacy.windowsPresent") continue;
      const value = t(key);
      for (const bad of ["adjacent_court_rally", "simultaneous_rallies", "target_court_non_rally"]) {
        expect(value.includes(bad), `${key} mentions ${bad}`).toBe(false);
      }
    }
  });
});

describe("no-bare-strings guard", () => {
  it("panel.ts routes UI text through t()", () => {
    const src = readFileSync(new URL("../src/ui/panel.ts", import.meta.url), "utf8");
    const bare = src.match(/(?:textContent|placeholder)\s*:\s*"[^"]*[A-Za-z][^"]*"/g) ?? [];
    expect(bare).toEqual([]);
  });
});
