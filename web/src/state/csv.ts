// CSV serialize/parse for rally rows.
//
// This is a faithful port of the VLC extension's save_all() / load_rows()
// (vlc/rally_annotator.lua) and is intentionally BYTE-COMPATIBLE with it, so the
// CSV this browser extension produces ingests into the same pipeline
// (sports-data-collector -> badminton-highlight-indexer). See docs/CSV_FORMAT.md.
//
// Columns: rally_number,start_time,end_time,ending_reason,sport,shots_count
//   - times are decimal seconds, 3 dp (Lua "%.3f" <-> JS toFixed(3))
//   - new golden rows require a positive integer shots_count
//   - any columns beyond shots_count (col 7+) are preserved verbatim on rewrite,
//     so richer downstream metadata is never dropped.

export interface RallyRow {
  n: number; // rally_number (integer, 1-based, monotonic)
  s: number; // start_time, decimal seconds
  e: number; // end_time, decimal seconds (> s)
  reason: string; // ending_reason
  sport: string;
  shots: string | null; // shots_count token verbatim (e.g. "9"); null when blank
  extra: string | null; // columns 7+ joined verbatim; null when none
}

export const HEADER =
  "rally_number,start_time,end_time,ending_reason,sport,shots_count\n";

export const GOLDEN_ENDING_REASONS = [
  "service_fault",
  "unforced_error",
  "winner",
] as const;

export function isGoldenEndingReason(value: unknown): boolean {
  return typeof value === "string" &&
    (GOLDEN_ENDING_REASONS as readonly string[]).includes(value);
}

export function isPositiveIntegerShots(value: unknown): boolean {
  if (typeof value !== "string" || value.trim() === "") return false;
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed >= 1;
}

export function goldenRepairRows(rows: RallyRow[]): number[] {
  return rows
    .filter((row) => !isGoldenEndingReason(row.reason) || !isPositiveIntegerShots(row.shots))
    .map((row) => row.n);
}

// Mirror Lua tonumber(): trims, "" -> nil, non-numeric -> nil. (NB: JS Number("")
// is 0 and Number("  1 ") is 1, so we must special-case empty after trimming.)
function luaToNumber(x: string | undefined): number | null {
  if (x == null) return null;
  const t = x.trim();
  if (t === "") return null;
  const v = Number(t);
  return Number.isNaN(v) ? null : v;
}

// Rewrite the whole CSV from rows (header once) — mirrors save_all(). The browser
// has no atomic tmp+rename; durability is handled by the IndexedDB live store
// (see persist layer), with this serialized form as the downloadable artifact.
export function serializeRows(rows: RallyRow[]): string {
  let out = HEADER;
  for (const r of rows) {
    const shots = r.shots != null ? r.shots : "";
    let line = `${Math.trunc(r.n)},${r.s.toFixed(3)},${r.e.toFixed(3)},${r.reason},${r.sport},${shots}`;
    if (r.extra != null && r.extra !== "") line += "," + r.extra;
    out += line + "\n";
  }
  return out;
}

// Export boundary for a complete golden artifact. The forgiving serializer above is
// intentionally retained for rewriting a legacy file while it is being repaired.
export function serializeGoldenRows(rows: RallyRow[]): string {
  const repair = goldenRepairRows(rows);
  if (repair.length > 0) {
    throw new Error(`golden export blocked; repair rally rows: ${repair.join(", ")}`);
  }
  return serializeRows(rows);
}

// Forgiving parse — mirrors load_rows(): any line whose first field is an integer
// is a rally row; header and blank lines are skipped; column 6 is the optional
// shots_count (blank/missing in older CSVs); columns 7+ are kept verbatim.
export function parseRows(text: string): RallyRow[] {
  const rows: RallyRow[] = [];
  for (const raw of text.split(/\n/)) {
    const line = raw.replace(/\r$/, "");
    if (!/\S/.test(line)) continue; // skip blank lines
    const parts = line.split(",");
    const nRaw = luaToNumber(parts[0]);
    if (nRaw == null || nRaw !== Math.floor(nRaw)) continue; // not a row (e.g. header)
    let shots: string | null = parts[5] ?? null;
    if (shots === "") shots = null; // blank => not recorded
    // Preserve a missing/blank legacy reason exactly. Repair requires an explicit
    // owner choice; silently turning blank into another category loses source truth.
    const reason = parts[3] ?? "";
    const extra = parts.length > 6 ? parts.slice(6).join(",") : null;
    rows.push({
      n: Math.floor(nRaw),
      s: luaToNumber(parts[1]) ?? 0,
      e: luaToNumber(parts[2]) ?? 0,
      reason,
      sport: parts[4] ?? "",
      shots,
      extra,
    });
  }
  return rows;
}
