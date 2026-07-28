// Per-clip screening metadata — the browser port of the VLC extension's clipmeta sidecar,
// emitting the same `<clip>.clipmeta.json` shape (docs/CLIP_METADATA.md).
//
// The one rule that matters here: an UNSET field stays null. `null` means "not screened";
// it is never collapsed into 0, false, or a plausible default, because
// sports-data-collector distinguishes an unscreened clip from one that was screened and
// found single-court. A tool that guesses is worse than one that says nothing.

import type { RallyRow } from "./csv";
import { parseProfiles, type TargetProfile } from "./targetReview";

// v2 adds `target_profiles` (one per static camera section) and drops the top-level
// `target_court_id`, which belongs to a section rather than to the whole clip. A v1 file is read
// and upgraded in memory; see MIGRATION below.
export const CLIPMETA_VERSION = 2;
export const MATCH_FORMATS = ["singles", "doubles", "mixed"] as const;
export type MatchFormat = (typeof MATCH_FORMATS)[number];

// Thresholds copied from sports-data-collector's report spec (src/reporting/spec.yaml) so
// the readout here and the gate there cannot disagree:
//   labels_truncated  severity=error  tail_unlabelled_s   > 120
//   label_span_low    severity=warn   label_span_coverage < 0.9
export const TAIL_WARN_S = 120;
export const SPAN_WARN = 0.9;

export interface LabelCompleteness {
  video_duration_s: number;
  labelled_to_s: number;
  label_span_coverage: number;
  head_unlabelled_s: number;
  tail_unlabelled_s: number;
  largest_unlabelled_gap_s: number;
  rally_count: number;
}

export interface ClipMeta {
  sport: string | null;
  venue_id: string | null;
  camera_setup_id: string | null;
  capture_time_utc: string | null;
  court_count: number | null;
  active_court_count: number | null;
  partially_visible_court_count: number | null;
  match_format: string | null;
  notes: string | null;
  target_profiles: TargetProfile[];
  // MIGRATION: a v1 file's top-level `target_court_id`. Kept so the value is not lost, and
  // offered as the default when the first profile is created — but never promoted into a
  // profile automatically, because a profile without a validated section and polygon would
  // fail its own validation. Never serialized.
  legacy_target_court_id?: string | null;
}

export function emptyClipMeta(): ClipMeta {
  return {
    sport: null,
    venue_id: null,
    camera_setup_id: null,
    capture_time_utc: null,
    court_count: null,
    active_court_count: null,
    partially_visible_court_count: null,
    match_format: null,
    notes: null,
    target_profiles: [],
  };
}

// A blank box is NOT zero and NOT a default — it is "not screened". `invalid` is returned
// only for text that is present but not a valid count, so a typo is refused loudly rather
// than silently recording nothing.
export type CountField = { value: number | null } | { invalid: true };

export function parseCount(text: string, min: number): CountField {
  const t = text.replace(/\s+/g, "");
  if (t === "") return { value: null };
  const v = Number(t);
  if (!Number.isFinite(v) || !Number.isInteger(v) || v < min) return { invalid: true };
  return { value: v };
}

export function optText(text: string): string | null {
  const t = text.trim();
  return t === "" ? null : t;
}

export type ClipIssue =
  | { key: "clip.invalidNumber"; params: { field: string; min: number } }
  | { key: "clip.invalidActive"; params: { active: number; visible: number } }
  | { key: "clip.invalidPartial"; params: { partial: number; visible: number } };

// Mirrors sports-data-collector's `_check_active_courts_within_visible` model validator, so
// an invalid sidecar can never reach import.
export function validateClipMeta(m: ClipMeta): ClipIssue | null {
  const { court_count: v, active_court_count: a, partially_visible_court_count: p } = m;
  if (v != null && a != null && a > v) {
    return { key: "clip.invalidActive", params: { active: a, visible: v } };
  }
  if (v != null && p != null && p > v) {
    return { key: "clip.invalidPartial", params: { partial: p, visible: v } };
  }
  return null;
}

// Label completeness, formula-for-formula identical to the collector's
// _label_completeness() (src/reporting/adapter.py). Returns null when the duration is
// unknown — no rule may fire on a guess.
export function completeness(rows: RallyRow[], durationS: number | null): LabelCompleteness | null {
  if (!durationS || durationS <= 0 || rows.length === 0) return null;
  const spans = rows.map((r) => ({ s: r.s, e: r.e })).sort((x, y) => x.s - y.s);
  const firstStart = Math.min(...spans.map((x) => x.s));
  const lastEnd = Math.max(...spans.map((x) => x.e));
  let largestGap = 0;
  let prevEnd = spans[0].e;
  for (let i = 1; i < spans.length; i++) {
    largestGap = Math.max(largestGap, spans[i].s - prevEnd);
    prevEnd = Math.max(prevEnd, spans[i].e);
  }
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    video_duration_s: durationS,
    labelled_to_s: lastEnd,
    label_span_coverage: Math.round(Math.min(lastEnd / durationS, 1) * 10000) / 10000,
    head_unlabelled_s: r1(Math.max(firstStart, 0)),
    tail_unlabelled_s: r1(Math.max(durationS - lastEnd, 0)),
    largest_unlabelled_gap_s: r1(largestGap),
    rally_count: rows.length,
  };
}

// Key order is fixed here, not derived from an object walk, so a re-save produces a readable
// diff rather than a reshuffle — and matches the VLC extension's output byte for byte.
export function serializeClipMeta(
  m: ClipMeta,
  opts: { clipName: string | null; generator: string; completeness: LabelCompleteness | null }
): string {
  const doc = {
    clipmeta_version: CLIPMETA_VERSION,
    generator: opts.generator,
    clip_name: opts.clipName,
    sport: m.sport,
    venue_id: m.venue_id,
    camera_setup_id: m.camera_setup_id,
    capture_time_utc: m.capture_time_utc,
    capture_time_source: m.capture_time_utc ? "container" : null,
    court_count: m.court_count,
    active_court_count: m.active_court_count,
    partially_visible_court_count: m.partially_visible_court_count,
    match_format: m.match_format,
    notes: m.notes,
    target_profiles: m.target_profiles.map((p) => ({
      camera_section_id: p.camera_section_id,
      target_court_id: p.target_court_id,
      camera_profile_id: p.camera_profile_id,
      play_volume_polygon: p.play_volume_polygon.map(([x, y]) => [x, y]),
      setup_validity: p.setup_validity,
      notes: p.notes,
    })),
    label_completeness: opts.completeness,
  };
  return JSON.stringify(doc, null, 2) + "\n";
}

// Forgiving read-back: an unknown/absent key is "unset", and a corrupt file yields null so a
// caller can tell "unreadable" from "nothing recorded" instead of conflating them.
export function parseClipMeta(text: string): ClipMeta | null {
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object") return null;
  const m = emptyClipMeta();
  for (const k of ["sport", "venue_id", "camera_setup_id", "capture_time_utc",
                   "match_format", "notes"] as const) {
    const v = doc[k];
    if (typeof v === "string" && v !== "") m[k] = v;
  }
  m.target_profiles = parseProfiles(doc.target_profiles);
  // v1 carried the court id at the top level; keep it for the first-profile default only.
  if (typeof doc.target_court_id === "string" && doc.target_court_id !== "") {
    m.legacy_target_court_id = doc.target_court_id;
  }
  for (const k of ["court_count", "active_court_count", "partially_visible_court_count"] as const) {
    const v = doc[k];
    if (typeof v === "number" && Number.isFinite(v)) m[k] = Math.floor(v);
  }
  return m;
}

export function clipmetaFilename(title: string): string {
  const base = title.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 80);
  return base ? `${base}.clipmeta.json` : "clipmeta.json";
}
