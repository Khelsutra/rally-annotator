import { describe, it, expect } from "vitest";
import {
  CAMERA_SETUP_IDS, CLIPMETA_VERSION, SPAN_WARN, TAIL_WARN_S, clipmetaFilename, completeness,
  emptyClipMeta, optText, parseClipMeta, parseCount, serializeClipMeta, validateClipMeta,
} from "../src/state/clipmeta";
import type { RallyRow } from "../src/state/csv";

const row = (n: number, s: number, e: number): RallyRow =>
  ({ n, s, e, reason: "winner", sport: "badminton", shots: null, extra: null });

const ser = (m = emptyClipMeta(), comp = null) =>
  serializeClipMeta(m, { clipName: "GX010150", generator: "rally-annotator-web/0.1.0", completeness: comp });

describe("unset is not 'no'", () => {
  it("a blank count is null, not 0", () => {
    expect(parseCount("", 1)).toEqual({ value: null });
    expect(parseCount("   ", 0)).toEqual({ value: null });
  });

  it("text that is present but not a count is refused loudly, not silently dropped", () => {
    expect(parseCount("two", 1)).toEqual({ invalid: true });
    expect(parseCount("1.5", 1)).toEqual({ invalid: true });
    expect(parseCount("0", 1)).toEqual({ invalid: true }); // court_count has ge=1
    expect(parseCount("0", 0)).toEqual({ value: 0 }); // but partial-visible may be 0
  });

  it("blank text fields are null", () => {
    expect(optText("  ")).toBeNull();
    expect(optText(" c1 ")).toBe("c1");
  });

  it("an unscreened clip serializes every field as null — never 0, never false", () => {
    const j = JSON.parse(ser());
    expect(j.court_count).toBeNull();
    expect(j.active_court_count).toBeNull();
    expect(j.match_format).toBeNull();
    expect(j.target_court_id).toBeNull();
    expect(j.capture_time_utc).toBeNull();
    expect(j.capture_time_source).toBeNull();
    expect(j.clipmeta_version).toBe(CLIPMETA_VERSION);
  });

  it("never emits a derived capability flag — the collector derives what it needs", () => {
    expect(ser()).not.toContain("can_supply_adjacent_court_negatives");
  });
});

describe("court_count and active_court_count stay separate", () => {
  it("GX010150: 2 visible, 1 active — multicourt geometry, single-court content", () => {
    const m = { ...emptyClipMeta(), court_count: 2, active_court_count: 1 };
    expect(validateClipMeta(m)).toBeNull();
    const j = JSON.parse(ser(m));
    expect(j.court_count).toBe(2);
    expect(j.active_court_count).toBe(1);
  });

  it("adarsh_avi_singles: a <20%-visible court is recorded AND flagged, not rounded away", () => {
    const m = {
      ...emptyClipMeta(), court_count: 2, active_court_count: 1,
      partially_visible_court_count: 1,
    };
    expect(validateClipMeta(m)).toBeNull();
    expect(JSON.parse(ser(m)).partially_visible_court_count).toBe(1);
  });

  it("Badminton_BXH_2: 4 visible, 3 active, singles", () => {
    const m = {
      ...emptyClipMeta(), court_count: 4, active_court_count: 3, match_format: "singles",
    };
    expect(validateClipMeta(m)).toBeNull();
    const j = JSON.parse(ser(m));
    expect([j.court_count, j.active_court_count, j.match_format]).toEqual([4, 3, "singles"]);
  });

  it("a court cannot be in play without being in frame", () => {
    const bad = { ...emptyClipMeta(), court_count: 1, active_court_count: 2 };
    expect(validateClipMeta(bad)?.key).toBe("clip.invalidActive");
  });

  it("nor can more courts be partly visible than are visible", () => {
    const bad = { ...emptyClipMeta(), court_count: 2, partially_visible_court_count: 3 };
    expect(validateClipMeta(bad)?.key).toBe("clip.invalidPartial");
  });

  it("an unscreened count cannot trip either invariant", () => {
    expect(validateClipMeta({ ...emptyClipMeta(), active_court_count: 9 })).toBeNull();
  });
});

describe("serialize / parse", () => {
  it("key order is fixed, so a re-save diffs cleanly instead of reshuffling", () => {
    const keys = Object.keys(JSON.parse(ser()));
    expect(keys).toEqual([
      "clipmeta_version", "generator", "clip_name", "sport", "venue_id", "target_court_id",
      "camera_setup_id", "capture_time_utc", "capture_time_source", "court_count",
      "active_court_count", "partially_visible_court_count", "match_format", "notes",
      "target_profiles", "label_completeness",
    ]);
  });

  it("round-trips through parse", () => {
    const m = {
      ...emptyClipMeta(), venue_id: "bxh_indiranagar", target_court_id: "3",
      camera_setup_id: "court-left-corner",
      court_count: 4, active_court_count: 3, partially_visible_court_count: 1,
      match_format: "singles", notes: "one idle court on the right",
      sport: "badminton",
    };
    expect(parseClipMeta(ser(m))).toEqual(m);
  });

  it("a corrupt file reads as null, so it is never mistaken for 'nothing recorded'", () => {
    expect(parseClipMeta("{oops")).toBeNull();
    expect(parseClipMeta("")).toBeNull();
    expect(parseClipMeta('{"clipmeta_version":4}')).toBeNull();
  });

  it("ignores unknown keys and wrong types rather than importing junk", () => {
    const m = parseClipMeta('{"court_count":"two","venue_id":"","future_field":1,"active_court_count":3}');
    expect(m?.court_count).toBeNull();
    expect(m?.venue_id).toBeNull();
    expect(m?.active_court_count).toBe(3);
  });

  it("records capture_time_source only when a container date is present", () => {
    expect(JSON.parse(ser()).capture_time_source).toBeNull();
    const withDate = { ...emptyClipMeta(), capture_time_utc: "2026-05-22T04:11:07Z" };
    expect(JSON.parse(ser(withDate)).capture_time_source).toBe("container");
  });

  it("uses the owner orientation vocabulary without preventing free-text legacy ids", () => {
    expect(CAMERA_SETUP_IDS).toEqual([
      "court-left-corner", "court-right-corner", "court-center", "court-side-middle",
    ]);
    const legacy = { ...emptyClipMeta(), camera_setup_id: "bxh-lowside-3court" };
    expect(parseClipMeta(ser(legacy))?.camera_setup_id).toBe("bxh-lowside-3court");
  });

  it("upgrades a v1 top-level target court into the v3 declarative field", () => {
    const parsed = parseClipMeta(JSON.stringify({
      clipmeta_version: 1,
      venue_id: "Boxhill",
      target_court_id: "3",
    }));
    expect(parsed?.target_court_id).toBe("3");
    expect(JSON.parse(ser(parsed!))).toMatchObject({
      clipmeta_version: 3,
      target_court_id: "3",
    });
  });

  it("restores a v2 target court only when every legacy profile agrees", () => {
    const profile = (court: string) => ({
      camera_section_id: "s1",
      target_court_id: court,
      camera_profile_id: null,
      play_volume_polygon: [[0.1, 0.1], [0.9, 0.1], [0.5, 0.9]],
      setup_validity: "supported",
      notes: null,
    });
    const agreed = parseClipMeta(JSON.stringify({
      clipmeta_version: 2,
      target_profiles: [profile("4"), { ...profile("4"), camera_section_id: "s2" }],
    }));
    expect(agreed?.target_court_id).toBe("4");

    const agreedDespiteBadLegacyGeometry = parseClipMeta(JSON.stringify({
      clipmeta_version: 2,
      target_profiles: [
        { ...profile("4"), play_volume_polygon: [] },
        { ...profile("4"), camera_section_id: "s2", play_volume_polygon: "damaged" },
      ],
    }));
    expect(agreedDespiteBadLegacyGeometry?.target_court_id).toBe("4");

    const conflicted = parseClipMeta(JSON.stringify({
      clipmeta_version: 2,
      target_profiles: [profile("4"), { ...profile("5"), camera_section_id: "s2" }],
    }));
    expect(conflicted?.target_court_id).toBeNull();
  });

  it("sanitizes the filename like the CSV does", () => {
    expect(clipmetaFilename("a/b:c")).toBe("a_b_c.clipmeta.json");
    expect(clipmetaFilename("   ")).toBe("clipmeta.json");
  });
});

describe("label completeness", () => {
  // The real truncated pass: a 768.768 s clip whose labels stop at 439.956 s.
  const TRUNCATED = [row(1, 0.51, 10), row(2, 100, 120), row(3, 430, 439.956)];

  it("matches the collector's formulas", () => {
    const c = completeness(TRUNCATED, 768.768)!;
    expect(c.label_span_coverage).toBeCloseTo(0.5722, 3);
    expect(c.tail_unlabelled_s).toBeCloseTo(328.8, 1);
    expect(c.head_unlabelled_s).toBeCloseTo(0.5, 1);
    expect(c.largest_unlabelled_gap_s).toBeCloseTo(310.0, 1);
    expect(c.rally_count).toBe(3);
  });

  it("the tail separates a truncated pass from a complete one where density cannot", () => {
    const complete = [...TRUNCATED, row(4, 700, 760)];
    expect(completeness(TRUNCATED, 768.768)!.tail_unlabelled_s).toBeGreaterThan(TAIL_WARN_S);
    expect(completeness(complete, 768.768)!.tail_unlabelled_s).toBeLessThan(TAIL_WARN_S);
  });

  it("returns null when the duration is unknown — no rule may fire on a guess", () => {
    expect(completeness(TRUNCATED, null)).toBeNull();
    expect(completeness(TRUNCATED, 0)).toBeNull();
    expect(completeness([], 768.768)).toBeNull();
  });

  it("coverage is clamped at 1 when labels run past a short reported duration", () => {
    expect(completeness([row(1, 0, 100)], 50)!.label_span_coverage).toBe(1);
  });

  it("thresholds match the collector's spec.yaml", () => {
    expect(TAIL_WARN_S).toBe(120);
    expect(SPAN_WARN).toBe(0.9);
  });

  it("is embedded in the sidecar as a snapshot, with the rally count so staleness is detectable", () => {
    const j = JSON.parse(ser(emptyClipMeta(), completeness(TRUNCATED, 768.768) as never));
    expect(j.label_completeness.rally_count).toBe(3);
    expect(j.label_completeness.tail_unlabelled_s).toBeCloseTo(328.8, 1);
  });
});
