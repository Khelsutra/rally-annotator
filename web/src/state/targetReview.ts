// Target profiles + sparse target-state review (docs/TARGET_REVIEW.md).
//
// This REPLACES the withdrawn neighborhood window track. Nothing here identifies or times a rally
// on a neighbouring court: a review answers one question about one interval — was the TARGET court
// rallying? — and a target profile says which court that is and where it sits in frame.
//
// Byte-compatible with the VLC extension's `<clip>.target-review.csv`.

export const TARGET_STATES = ["rallying", "not_rallying", "unclear"] as const;
export type TargetState = (typeof TARGET_STATES)[number];

// Who chose the interval. The contract is that the SYSTEM mines uncertain / false-positive
// stretches and the human answers; an operator-flagged one is recorded as such rather than
// being passed off as model-proposed evidence.
export const REVIEW_SOURCES = ["model_proposed", "operator"] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

export const SETUP_VALIDITY = ["supported", "unsupported", "unclear"] as const;
export type SetupValidity = (typeof SETUP_VALIDITY)[number];

export const REVIEW_HEADER =
  "review_number,start_time,end_time,target_state,camera_section_id,source,notes\n";

export interface TargetProfile {
  camera_section_id: string;
  target_court_id: string;
  camera_profile_id: string | null;
  play_volume_polygon: Array<[number, number]>;
  setup_validity: SetupValidity;
  notes: string | null;
}

export interface ReviewRow {
  n: number;
  s: number;
  e: number;
  state: string;
  section: string;
  source: string;
  notes: string;
}

// ---------------------------------------------------------------------------------------
// Polygon parsing + validation. FAILS CLOSED: an unparseable or out-of-range polygon is
// rejected with a reason, never coerced, clamped or silently dropped. The coordinates are
// NORMALIZED to the frame (0..1) — a pixel coordinate is a different thing wearing the same
// shape, and accepting it would produce geometry that is wrong but well-formed.
// ---------------------------------------------------------------------------------------
export type PolygonResult =
  | { points: Array<[number, number]> }
  | { error: "polygonSyntax" | "polygonTooFewPoints" | "polygonRange" };

export function parsePolygon(text: string): PolygonResult {
  const t = text.trim();
  if (t === "") return { error: "polygonTooFewPoints" };
  // Accept "x,y x,y ..." and "x,y; x,y" and a bare JSON array of pairs — all the shapes a
  // human or a tool plausibly produces.
  let raw: unknown;
  if (t.startsWith("[")) {
    try {
      raw = JSON.parse(t);
    } catch {
      return { error: "polygonSyntax" };
    }
  } else {
    const nums = t.split(/[\s;]+/).filter(Boolean);
    raw = nums.map((pair) => pair.split(",").map((v) => Number(v)));
  }
  if (!Array.isArray(raw)) return { error: "polygonSyntax" };
  const points: Array<[number, number]> = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 2) return { error: "polygonSyntax" };
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: "polygonSyntax" };
    if (x < 0 || x > 1 || y < 0 || y > 1) return { error: "polygonRange" };
    points.push([x, y]);
  }
  if (points.length < 3) return { error: "polygonTooFewPoints" };
  return { points };
}

// 3 dp, with the zeros kept: identical to the Lua front-end's "%.3f" so the same profile reads
// the same in both tools. The save path re-parses this text, so what you see is what is stored.
export function formatPolygon(points: Array<[number, number]>): string {
  return points.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(" ");
}

export type ProfileIssue =
  | { key: "target.needSection" }
  | { key: "target.needCourt" }
  | { key: "target.duplicateSection"; params: { section: string } }
  | { key: "target.polygonSyntax" }
  | { key: "target.polygonTooFewPoints" }
  | { key: "target.polygonRange" };

// `others` is every profile already on the clip EXCEPT the one being saved, so a re-save of an
// existing section is not rejected as a duplicate of itself.
export function validateProfile(p: TargetProfile, others: TargetProfile[]): ProfileIssue | null {
  if (!p.camera_section_id.trim()) return { key: "target.needSection" };
  if (!p.target_court_id.trim()) return { key: "target.needCourt" };
  if (others.some((o) => o.camera_section_id === p.camera_section_id)) {
    return { key: "target.duplicateSection", params: { section: p.camera_section_id } };
  }
  if (p.play_volume_polygon.length < 3) return { key: "target.polygonTooFewPoints" };
  for (const [x, y] of p.play_volume_polygon) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { key: "target.polygonSyntax" };
    if (x < 0 || x > 1 || y < 0 || y > 1) return { key: "target.polygonRange" };
  }
  return null;
}

export function parseProfiles(raw: unknown): TargetProfile[] {
  if (!Array.isArray(raw)) return [];
  const out: TargetProfile[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const section = typeof o.camera_section_id === "string" ? o.camera_section_id : "";
    const court = typeof o.target_court_id === "string" ? o.target_court_id : "";
    const poly = parsePolygonPoints(o.play_volume_polygon);
    const validity = (SETUP_VALIDITY as readonly string[]).includes(o.setup_validity as string)
      ? (o.setup_validity as SetupValidity)
      : "unclear";
    const p: TargetProfile = {
      camera_section_id: section,
      target_court_id: court,
      camera_profile_id: typeof o.camera_profile_id === "string" && o.camera_profile_id !== ""
        ? o.camera_profile_id : null,
      play_volume_polygon: poly,
      setup_validity: validity,
      notes: typeof o.notes === "string" && o.notes !== "" ? o.notes : null,
    };
    // A stored profile that no longer validates is DROPPED rather than loaded: a half-valid
    // geometry read back as truth is worse than an absent one.
    if (validateProfile(p, out) === null) out.push(p);
  }
  return out;
}

function parsePolygonPoints(raw: unknown): Array<[number, number]> {
  if (!Array.isArray(raw)) return [];
  const pts: Array<[number, number]> = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 2) return [];
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    pts.push([x, y]);
  }
  return pts;
}

// ---------------------------------------------------------------------------------------
// The review CSV
// ---------------------------------------------------------------------------------------

// No quoting in this format (the same deliberate simplicity as rallies.csv), so free text is
// flattened on write rather than corrupting the column count on read.
export function csvSafe(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(/[\r\n]+/g, " ").replace(/,/g, ";");
}

export function serializeReviews(rows: ReviewRow[]): string {
  let out = REVIEW_HEADER;
  for (const r of rows) {
    out += `${Math.trunc(r.n)},${r.s.toFixed(3)},${r.e.toFixed(3)},${r.state},${csvSafe(r.section)},${csvSafe(r.source)},${csvSafe(r.notes)}\n`;
  }
  return out;
}

// Same forgiving rule as the rally CSV. A row whose target_state is not one of the three
// answers is DROPPED — that is what stops a legacy neighborhood label (`adjacent_court_rally`
// and friends) from being read in as if it were a target-state answer.
export function parseReviews(text: string): ReviewRow[] {
  const rows: ReviewRow[] = [];
  for (const raw of text.split(/\n/)) {
    const line = raw.replace(/\r$/, "");
    if (!/\S/.test(line)) continue;
    const parts = line.split(",");
    const n = Number(parts[0]);
    if (!Number.isFinite(n) || !Number.isInteger(n) || parts[0].trim() === "") continue;
    const s = Number(parts[1]);
    const e = Number(parts[2]);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    const state = (parts[3] ?? "").trim();
    if (!(TARGET_STATES as readonly string[]).includes(state)) continue;
    rows.push({
      n, s, e, state,
      section: parts[4] ?? "",
      source: parts[5] ?? "operator",
      notes: parts.slice(6).join(","),
    });
  }
  return rows;
}

export function nextReviewNumber(rows: ReviewRow[]): number {
  let maxn = 0;
  for (const r of rows) if (r.n > maxn) maxn = r.n;
  return maxn + 1;
}

export function indexOfReview(rows: ReviewRow[], n: number): number {
  return rows.findIndex((r) => r.n === n);
}

export function reviewFilename(title: string): string {
  const base = title.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 80);
  return base ? `${base}.target-review.csv` : "rallies.target-review.csv";
}

// The withdrawn vocabulary. Kept ONLY so a legacy file can be recognised and refused — never to
// read one in. A `target_rally` window was a sampled span under a contract that no longer
// exists; a `rallying` review is an answer to a mined question. Equating them would launder
// withdrawn assumptions into new training truth.
export const LEGACY_WINDOW_LABELS = [
  "target_rally", "adjacent_court_rally", "simultaneous_rallies",
  "target_court_non_rally", "empty",
] as const;

export function looksLikeLegacyWindowFile(text: string): boolean {
  const head = text.slice(0, 4096);
  if (head.includes("window_number") && head.includes("window_label")) return true;
  return LEGACY_WINDOW_LABELS.some((l) => l !== "empty" && head.includes(l));
}
