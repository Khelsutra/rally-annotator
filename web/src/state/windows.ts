// The WINDOW track — time intervals carrying a category, kept in their own file because a
// window may overlap a rally or sit between rallies. Byte-compatible with the VLC
// extension's `<clip>.windows.csv` (docs/WINDOW_LABELS.md).
//
// Vocabulary is badminton-highlight-indexer §4.4, verbatim: these five strings are DATA and
// never translate, exactly like the rally CSV's reason/sport values.

export const WINDOW_LABELS = [
  "target_rally",
  "adjacent_court_rally",
  "simultaneous_rallies",
  "target_court_non_rally",
  "empty",
] as const;
export type WindowLabel = (typeof WINDOW_LABELS)[number];

// §4.4 asks for 12 reviewed windows of each hard-negative subtype plus 12 matched
// target_rally controls; the tally counts against this so an operator can see what is still
// missing instead of counting rows afterwards.
export const WINDOW_TARGET_EACH = 12;

export const WIN_HEADER =
  "window_number,start_time,end_time,window_label,target_court_id,notes\n";

export interface WindowRow {
  n: number;
  s: number;
  e: number;
  label: string;
  court: string;
  notes: string;
}

// The format has no quoting (the same deliberate simplicity as rallies.csv), so free text is
// flattened on write rather than corrupting the column count on read.
export function csvSafe(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(/[\r\n]+/g, " ").replace(/,/g, ";");
}

export function serializeWindows(rows: WindowRow[]): string {
  let out = WIN_HEADER;
  for (const r of rows) {
    out += `${Math.trunc(r.n)},${r.s.toFixed(3)},${r.e.toFixed(3)},${r.label},${csvSafe(r.court)},${csvSafe(r.notes)}\n`;
  }
  return out;
}

// Same forgiving rule as the rally CSV: any line whose first field is an integer is a row;
// the header and blank lines are skipped. A row with end <= start is dropped, not repaired —
// a zero-length window carries no information and would score as a phantom.
export function parseWindows(text: string): WindowRow[] {
  const rows: WindowRow[] = [];
  for (const raw of text.split(/\n/)) {
    const line = raw.replace(/\r$/, "");
    if (!/\S/.test(line)) continue;
    const parts = line.split(",");
    const n = Number(parts[0]);
    if (!Number.isFinite(n) || !Number.isInteger(n) || parts[0].trim() === "") continue;
    const s = Number(parts[1]);
    const e = Number(parts[2]);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    rows.push({
      n,
      s,
      e,
      label: parts[3] || WINDOW_LABELS[0],
      court: parts[4] ?? "",
      notes: parts.slice(5).join(",") ?? "",
    });
  }
  return rows;
}

export function nextWindowNumber(rows: WindowRow[]): number {
  let maxn = 0;
  for (const r of rows) if (r.n > maxn) maxn = r.n;
  return maxn + 1;
}

export function indexOfWindow(rows: WindowRow[], n: number): number {
  return rows.findIndex((r) => r.n === n);
}

export function tally(rows: WindowRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const l of WINDOW_LABELS) counts[l] = 0;
  for (const r of rows) if (r.label in counts) counts[r.label] += 1;
  return counts;
}

export function windowsFilename(title: string): string {
  const base = title.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 80);
  return base ? `${base}.windows.csv` : "rallies.windows.csv";
}
