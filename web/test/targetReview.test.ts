import { describe, it, expect } from "vitest";
import {
  LEGACY_WINDOW_LABELS, REVIEW_HEADER, SETUP_VALIDITY, TARGET_STATES, csvSafe, formatPolygon,
  indexOfReview, looksLikeLegacyWindowFile, nextReviewNumber, parsePolygon, parseProfiles,
  parseReviews, reviewFilename, serializeReviews, validateProfile,
  type ReviewRow, type TargetProfile,
} from "../src/state/targetReview";

const prof = (over: Partial<TargetProfile> = {}): TargetProfile => ({
  camera_section_id: "s1",
  target_court_id: "3",
  camera_profile_id: "bxh-lowside-3court",
  play_volume_polygon: [[0.2, 0.5], [0.8, 0.5], [0.95, 0.98], [0.05, 0.98]],
  setup_validity: "supported",
  notes: null,
  ...over,
});

const rv = (n: number, s: number, e: number, state: string): ReviewRow =>
  ({ n, s, e, state, section: "s1", source: "operator", notes: "" });

describe("the target-first vocabulary", () => {
  it("offers exactly three answers, all about the TARGET court", () => {
    expect([...TARGET_STATES]).toEqual(["rallying", "not_rallying", "unclear"]);
  });

  it("has no way to name a neighbouring court's state", () => {
    for (const s of TARGET_STATES) {
      expect(s).not.toMatch(/adjacent|simultaneous|neighbou?r/);
    }
  });

  it("setup validity keeps 'unclear' as a first-class answer, not a silent default", () => {
    expect([...SETUP_VALIDITY]).toEqual(["supported", "unsupported", "unclear"]);
  });
});

describe("polygon parsing fails closed", () => {
  it("accepts the space-separated pair form", () => {
    const r = parsePolygon("0.2,0.5 0.8,0.5 0.95,0.98 0.05,0.98");
    expect("points" in r && r.points).toHaveLength(4);
  });

  it("accepts a JSON array of pairs", () => {
    const r = parsePolygon("[[0.1,0.1],[0.9,0.1],[0.5,0.9]]");
    expect("points" in r && r.points).toHaveLength(3);
  });

  it("accepts semicolon separators", () => {
    expect("points" in parsePolygon("0.1,0.1; 0.9,0.1; 0.5,0.9")).toBe(true);
  });

  it("REFUSES pixel coordinates rather than coercing them", () => {
    // The single most likely operator mistake, and the one that would produce geometry that is
    // wrong but perfectly well-formed.
    expect(parsePolygon("120,540 880,540 1010,980 70,980")).toEqual({ error: "polygonRange" });
  });

  it("refuses a negative coordinate", () => {
    expect(parsePolygon("-0.1,0.5 0.8,0.5 0.5,0.9")).toEqual({ error: "polygonRange" });
  });

  it("refuses fewer than 3 points, and an empty field", () => {
    expect(parsePolygon("0.1,0.1 0.9,0.1")).toEqual({ error: "polygonTooFewPoints" });
    expect(parsePolygon("   ")).toEqual({ error: "polygonTooFewPoints" });
  });

  it("refuses malformed input rather than salvaging part of it", () => {
    expect(parsePolygon("0.1 0.9 0.5")).toEqual({ error: "polygonSyntax" });
    expect(parsePolygon("[[0.1,0.1],[0.9]]")).toEqual({ error: "polygonSyntax" });
    expect(parsePolygon("[not json")).toEqual({ error: "polygonSyntax" });
    expect(parsePolygon("a,b c,d e,f")).toEqual({ error: "polygonSyntax" });
  });

  it("round-trips through formatPolygon at 3 dp, matching the Lua front-end's %.3f", () => {
    // Trailing zeros are kept, and 0.2085 lands on 0.208 in BOTH front-ends: the double is
    // 0.20849999..., so JS toFixed and C printf %.3f agree.
    expect(formatPolygon([[0.2085, 0.5412], [0.8, 0.5], [0.5, 0.9]]))
      .toBe("0.208,0.541 0.800,0.500 0.500,0.900");
    const r = parsePolygon(formatPolygon([[0.2085, 0.5412], [0.8, 0.5], [0.5, 0.9]]));
    expect("points" in r && r.points[0]).toEqual([0.208, 0.541]);
  });
});

describe("profile validation fails closed", () => {
  it("accepts a well-formed profile", () => {
    expect(validateProfile(prof(), [])).toBeNull();
  });

  it("requires a camera section and a target court", () => {
    expect(validateProfile(prof({ camera_section_id: "  " }), [])?.key).toBe("target.needSection");
    expect(validateProfile(prof({ target_court_id: "" }), [])?.key).toBe("target.needCourt");
  });

  it("refuses two profiles for one camera section", () => {
    expect(validateProfile(prof(), [prof()])?.key).toBe("target.duplicateSection");
  });

  it("does not treat a re-save of the same section as a duplicate", () => {
    // The caller filters the profile being replaced out of `others`.
    expect(validateProfile(prof({ target_court_id: "4" }), [prof({ camera_section_id: "s2" })])).toBeNull();
  });

  it("refuses an out-of-range or degenerate polygon", () => {
    expect(validateProfile(prof({ play_volume_polygon: [[0.1, 0.1], [0.9, 0.1]] }), [])?.key)
      .toBe("target.polygonTooFewPoints");
    expect(validateProfile(prof({ play_volume_polygon: [[0.1, 0.1], [0.9, 0.1], [2, 0.9]] }), [])?.key)
      .toBe("target.polygonRange");
  });
});

describe("parseProfiles", () => {
  it("reads back what was written", () => {
    expect(parseProfiles([prof()])).toEqual([prof()]);
  });

  it("DROPS a stored profile that no longer validates", () => {
    // A half-valid geometry read back as truth is worse than an absent one.
    const bad = { ...prof(), play_volume_polygon: [[0.1, 0.1], [2, 2], [0.5, 0.5]] };
    expect(parseProfiles([bad])).toEqual([]);
    expect(parseProfiles([{ ...prof(), camera_section_id: "" }])).toEqual([]);
  });

  it("drops a duplicate section rather than keeping both", () => {
    expect(parseProfiles([prof(), prof()])).toHaveLength(1);
  });

  it("defaults an unknown setup_validity to 'unclear', never to 'supported'", () => {
    expect(parseProfiles([{ ...prof(), setup_validity: "definitely" }])[0].setup_validity).toBe("unclear");
  });

  it("tolerates junk", () => {
    expect(parseProfiles(null)).toEqual([]);
    expect(parseProfiles([1, "x", null])).toEqual([]);
  });
});

describe("the review CSV", () => {
  it("writes the documented header and 3-dp seconds", () => {
    const csv = serializeReviews([rv(1, 412.5, 418.25, "not_rallying")]);
    expect(csv.startsWith(REVIEW_HEADER)).toBe(true);
    expect(csv).toContain("1,412.500,418.250,not_rallying,s1,operator,\n");
  });

  it("round-trips", () => {
    const rows = [rv(1, 1, 2, "rallying"), rv(2, 5, 9, "unclear")];
    expect(parseReviews(serializeReviews(rows))).toEqual(rows);
  });

  it("flattens free text, because the format has no quoting", () => {
    expect(csvSafe("a, b\nc")).toBe("a; b c");
    const line = serializeReviews([{ ...rv(1, 1, 2, "unclear"), notes: "one, two\nthree" }])
      .trim().split("\n")[1];
    expect(line.split(",")).toHaveLength(7); // column count survives
  });

  it("drops rows whose state is not one of the three answers", () => {
    const csv = REVIEW_HEADER + "1,1.000,2.000,rallying,s1,operator,\n" +
      "2,3.000,4.000,adjacent_court_rally,s1,operator,\n" +
      "3,5.000,6.000,simultaneous_rallies,s1,operator,\n";
    // This is the load-bearing one: it is what stops a withdrawn neighborhood label from being
    // read back in as if it were a target-state answer.
    expect(parseReviews(csv).map((r) => r.n)).toEqual([1]);
  });

  it("drops a zero-length or reversed interval", () => {
    const csv = REVIEW_HEADER + "1,5.000,5.000,rallying,s1,operator,\n" +
      "2,9.000,4.000,rallying,s1,operator,\n3,1.000,2.000,rallying,s1,operator,\n";
    expect(parseReviews(csv).map((r) => r.n)).toEqual([3]);
  });

  it("numbers independently of the rally track", () => {
    expect(nextReviewNumber([])).toBe(1);
    expect(nextReviewNumber([rv(1, 0, 1, "rallying"), rv(7, 2, 3, "unclear")])).toBe(8);
    expect(indexOfReview([rv(1, 0, 1, "rallying"), rv(2, 2, 3, "unclear")], 2)).toBe(1);
  });

  it("uses its own filename, never colliding with the rally CSV", () => {
    expect(reviewFilename("My Match")).toBe("My Match.target-review.csv");
    expect(reviewFilename("")).toBe("rallies.target-review.csv");
  });
});

describe("legacy neighborhood files are recognised and refused", () => {
  it("detects a withdrawn-design windows file by its header", () => {
    expect(looksLikeLegacyWindowFile(
      "window_number,start_time,end_time,window_label,target_court_id,notes\n1,1.0,2.0,target_rally,3,\n"
    )).toBe(true);
  });

  it("detects one by its vocabulary alone", () => {
    expect(looksLikeLegacyWindowFile("x\n1,1,2,adjacent_court_rally,3,\n")).toBe(true);
  });

  it("does not mistake a target-review file for one", () => {
    expect(looksLikeLegacyWindowFile(serializeReviews([rv(1, 1, 2, "rallying")]))).toBe(false);
  });

  it("keeps the withdrawn vocabulary only for recognition, never for offer", () => {
    // The five withdrawn labels must not appear in anything the operator can choose.
    for (const legacy of LEGACY_WINDOW_LABELS) {
      expect((TARGET_STATES as readonly string[]).includes(legacy)).toBe(false);
    }
  });
});
