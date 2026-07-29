import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROMINENCE_MARGIN, LEGACY_WINDOW_LABELS, REVIEW_HEADER, SETUP_VALIDITY, TARGET_STATES,
  csvSafe, formatPolygon, isProminentCourt, isSelfIntersecting, polygonArea, rankProminence,
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

describe("the normalized polygon string contract", () => {
  // Legacy sidecars may contain this compact, space-separated representation. Keep accepting
  // it even though the annotator no longer exposes a manual target editor.
  const PICKER_OUTPUT = "0.208,0.541 0.775,0.541 0.942,0.983 0.061,0.983";

  it("is accepted by the parser", () => {
    const r = parsePolygon(PICKER_OUTPUT);
    expect("points" in r).toBe(true);
    expect("points" in r && r.points).toEqual([
      [0.208, 0.541], [0.775, 0.541], [0.942, 0.983], [0.061, 0.983],
    ]);
  });

  it("is what formatPolygon itself produces, so the two never drift", () => {
    const r = parsePolygon(PICKER_OUTPUT);
    expect("points" in r && formatPolygon(r.points)).toBe(PICKER_OUTPUT);
  });

  it("survives the full profile validation", () => {
    const r = parsePolygon(PICKER_OUTPUT);
    expect(validateProfile(prof({ play_volume_polygon: "points" in r ? r.points : [] }), [])).toBeNull();
  });

  it("a 3-point and a 6-point pick are both accepted (bowed wide-angle edges)", () => {
    expect("points" in parsePolygon("0.1,0.1 0.9,0.1 0.5,0.9")).toBe(true);
    expect("points" in parsePolygon(
      "0.10,0.50 0.45,0.47 0.80,0.50 0.94,0.98 0.50,0.99 0.06,0.98")).toBe(true);
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


// A unit square covers the whole frame; a half-width one covers half; and so on. Coordinates are
// normalized, so area IS coverage — no image dimensions anywhere.
const rect = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

describe("polygon area is coverage", () => {
  it("measures the fraction of frame directly", () => {
    expect(polygonArea(rect(0, 0, 1, 1))).toBeCloseTo(1, 6);
    expect(polygonArea(rect(0, 0, 0.5, 1))).toBeCloseTo(0.5, 6);
    expect(polygonArea(rect(0.25, 0.25, 0.75, 0.75))).toBeCloseTo(0.25, 6);
  });

  it("is winding-independent — clicking clockwise or anticlockwise gives the same coverage", () => {
    const cw = rect(0, 0, 0.5, 0.4);
    expect(polygonArea([...cw].reverse())).toBeCloseTo(polygonArea(cw), 9);
  });

  it("handles a non-rectangular court and a degenerate one", () => {
    expect(polygonArea([[0, 0], [1, 0], [0.5, 1]])).toBeCloseTo(0.5, 6); // triangle
    expect(polygonArea([[0, 0], [1, 1]])).toBe(0);
    expect(polygonArea([])).toBe(0);
  });

  it("matches the real GX020096 polygon measured off the still", () => {
    const drawn: Array<[number, number]> =
      [[0.763, 0.989], [0.005, 0.757], [0.454, 0.522], [0.652, 0.525]];
    expect(polygonArea(drawn)).toBeCloseTo(0.187, 3);
  });
});

describe("self-intersection", () => {
  it("catches a bowtie, whose area is meaningless because its lobes cancel", () => {
    const bowtie: Array<[number, number]> = [[0, 0], [1, 1], [1, 0], [0, 1]];
    expect(isSelfIntersecting(bowtie)).toBe(true);
    expect(validateProfile(prof({ play_volume_polygon: bowtie }), [])?.key)
      .toBe("target.polygonSelfIntersecting");
  });

  it("passes a simple convex court and a simple concave one", () => {
    expect(isSelfIntersecting(rect(0, 0, 1, 1))).toBe(false);
    expect(isSelfIntersecting([[0, 0], [1, 0], [1, 1], [0.5, 0.4], [0, 1]])).toBe(false);
  });

  it("does not mistake shared endpoints for a crossing", () => {
    expect(isSelfIntersecting([[0, 0], [1, 0], [0.5, 1]])).toBe(false);
  });
});

describe("prominence is decided by coverage, not by being wholly in frame", () => {
  const big = { id: "target", polygon: rect(0, 0.3, 0.9, 1) };        // 0.63, runs off the top
  const sliver = { id: "neighbour", polygon: rect(0.9, 0.4, 1, 0.7) }; // 0.03, fully in frame

  it("picks the court with maximum coverage", () => {
    const r = rankProminence([sliver, big]);
    expect(r.winner).toBe("target");
    expect(r.verdict).toBe("prominent");
    expect(r.ranked.map((x) => x.id)).toEqual(["target", "neighbour"]);
  });

  it("a partly-out-of-frame court still wins over a fully-visible sliver", () => {
    // The whole point: enclosure is not the criterion, coverage is.
    const v = isProminentCourt(big, [sliver]);
    expect(v.prominent).toBe(true);
    expect(v.coverage).toBeCloseTo(0.63, 6);
    expect(v.runnerUp).toBe("neighbour");
  });

  it("says AMBIGUOUS rather than picking two near-equal courts apart by a rounding error", () => {
    const a = { id: "a", polygon: rect(0, 0, 0.5, 0.4) };   // 0.20
    const b = { id: "b", polygon: rect(0.5, 0, 1, 0.42) };  // 0.21
    const r = rankProminence([a, b]);
    expect(r.verdict).toBe("ambiguous");
    expect(r.winner).toBe("b");                       // still ranked
    expect(isProminentCourt(b, [a]).prominent).toBe(false); // but not declared prominent
  });

  it("a single court is prominent only if it covers more than the margin", () => {
    expect(rankProminence([{ id: "only", polygon: rect(0, 0, 0.9, 0.9) }]).verdict).toBe("prominent");
    // a 1% sliver alone is not evidence the camera is pointed at it
    expect(rankProminence([{ id: "only", polygon: rect(0, 0, 0.1, 0.1) }]).verdict).toBe("ambiguous");
  });

  it("refuses to rank a bowtie or a degenerate shape", () => {
    const r = rankProminence([
      { id: "bowtie", polygon: [[0, 0], [1, 1], [1, 0], [0, 1]] },
      { id: "line", polygon: [[0, 0], [1, 1]] },
    ]);
    expect(r.verdict).toBe("none");
    expect(r.winner).toBeNull();
  });

  it("reports the margin so a caller can see how close the call was", () => {
    const r = rankProminence([
      { id: "a", polygon: rect(0, 0, 1, 0.8) },   // 0.8
      { id: "b", polygon: rect(0, 0, 1, 0.2) },   // 0.2
    ]);
    expect(r.margin).toBeCloseTo(0.6, 6);
    expect(DEFAULT_PROMINENCE_MARGIN).toBe(0.05);
  });

  it("answers 'none' for nothing rankable", () => {
    expect(rankProminence([]).verdict).toBe("none");
    expect(isProminentCourt({ id: "x", polygon: [] }).prominent).toBe(false);
  });
});
