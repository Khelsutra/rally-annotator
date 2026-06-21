// Annotator state machine — a faithful, provider-agnostic port of the pure logic
// in vlc/rally_annotator.lua (the button callbacks + helpers, minus VLC widget I/O).
//
// The UI layer (closed-shadow-root panel) renders this state and forwards user
// actions; the video layer supplies playback time in SECONDS (HTML5
// video.currentTime is already seconds — no microsecond conversion as VLC needs);
// the persist layer is injected as `persist` (writes the IndexedDB live store and
// triggers the CSV download). Keeping this module pure makes it unit-testable
// without a browser, mirroring test/dialog_test.lua.

import { RallyRow, serializeRows } from "./csv";

export const SPORTS = [
  "badminton",
  "tennis",
  "table_tennis",
  "pickleball",
  "padel",
] as const;

export const REASON_DEFAULT = "unknown";
export const REASONS = [
  "winner",
  "forced_error",
  "unforced_error",
  "service_fault",
  "let",
  "other",
] as const;
// Dropdown order: the savable default ("unknown") first so it shows selected.
export const REASON_OPTIONS = [REASON_DEFAULT, ...REASONS] as const;

export type Mode = "new" | "edit";

export interface PersistResult {
  ok: boolean;
  err?: string;
}
export type PersistFn = (rows: RallyRow[]) => PersistResult;

const okPersist: PersistFn = () => ({ ok: true });

// Mirror get_field_num(): strip ALL whitespace (not just ends), "" -> null,
// non-numeric -> null.
function fieldNum(text: string): number | null {
  const t = text.replace(/\s+/g, "");
  if (t === "") return null;
  const v = Number(t);
  return Number.isNaN(v) ? null : v;
}

export interface OpResult {
  ok: boolean;
  status: string;
}

export interface AnnotatorOpts {
  rows?: RallyRow[];
  persist?: PersistFn;
}

export class Annotator {
  rows: RallyRow[];
  mode: Mode = "new";
  editIndex: number | null = null;

  // Form fields mirror the editable widgets (kept as strings, like the text inputs).
  startField = "";
  endField = "";
  shotsField = "";
  nextField = "";
  reason: string = REASON_DEFAULT; // non-sticky
  sport: string = SPORTS[0]; // sticky

  private persist: PersistFn;

  constructor(opts: AnnotatorOpts = {}) {
    this.persist = opts.persist ?? okPersist;
    this.rows = opts.rows ?? [];
    this.refreshNextField();
  }

  // ---- pure helpers (ported 1:1) ----

  nextRallyNumber(): number {
    let maxn = 0;
    for (const r of this.rows) if (r.n > maxn) maxn = r.n;
    return maxn + 1;
  }

  indexOfRally(n: number): number {
    return this.rows.findIndex((r) => r.n === n);
  }

  // Smallest integer >= start not already used (auto-advance skips occupied numbers).
  nextFreeFrom(start: number): number {
    let n = start;
    while (this.indexOfRally(n) !== -1) n++;
    return n;
  }

  // The number the next NEW rally will get (the "Next rally #" override, else max+1).
  plannedNextNumber(): number {
    const v = fieldNum(this.nextField);
    if (v != null && v >= 1) return Math.floor(v);
    return this.nextRallyNumber();
  }

  // Optional shots_count: null for blank/negative/non-numeric; else floor. NB: 0 is
  // VALID (the Lua treats only nil/negative as "no count", and 0 is truthy there).
  getShots(): number | null {
    const v = fieldNum(this.shotsField);
    if (v == null || v < 0) return null;
    return Math.floor(v);
  }

  // Fresh rally fully marked (START + END) but not yet saved -> unsaved work exists.
  isArmed(): boolean {
    return (
      this.mode === "new" &&
      fieldNum(this.startField) != null &&
      fieldNum(this.endField) != null
    );
  }

  refreshNextField(): void {
    this.nextField = String(this.nextRallyNumber());
  }

  lastRow(): RallyRow | null {
    return this.rows.length ? this.rows[this.rows.length - 1] : null;
  }

  // ---- button labels (port of refresh_buttons) ----

  saveLabel(): string {
    if (this.mode === "edit" && this.editIndex != null && this.rows[this.editIndex])
      return `Save changes (#${this.rows[this.editIndex].n})`;
    const s = fieldNum(this.startField);
    const e = fieldNum(this.endField);
    if (s != null && e != null) return `Save Rally (#${this.plannedNextNumber()})`;
    return "Save Rally";
  }

  markStartLabel(): string {
    if (this.mode === "edit" && this.editIndex != null && this.rows[this.editIndex])
      return `Re-mark START (#${this.rows[this.editIndex].n})`;
    return "Mark START";
  }

  markEndLabel(): string {
    if (this.mode === "edit" && this.editIndex != null && this.rows[this.editIndex])
      return `Re-mark END (#${this.rows[this.editIndex].n})`;
    return "Mark END";
  }

  undoLabel(): string {
    if (this.mode === "edit") return "Undo last (cancel edit)";
    const s = fieldNum(this.startField);
    const e = fieldNum(this.endField);
    if (s != null || e != null) return "Undo last (clear mark)";
    const last = this.lastRow();
    if (last) return `Undo last (#${last.n})`;
    return "Undo last";
  }

  // ---- form reset: reason + shots are NON-STICKY; sport & nextField untouched ----
  resetForm(): void {
    this.mode = "new";
    this.editIndex = null;
    this.startField = "";
    this.endField = "";
    this.shotsField = "";
    this.reason = REASON_DEFAULT;
  }

  // ---- operations (port of the button callbacks) ----

  markStart(now: number | null): OpResult {
    if (now == null)
      return { ok: false, status: "No media playing -- cannot mark START." };
    if (this.isArmed())
      return {
        ok: false,
        status:
          "You have an UNSAVED rally (START -> END). Click 'Save Rally' to keep it, " +
          "or 'Undo last' to clear it, before marking a new START.",
      };
    this.startField = now.toFixed(3);
    return {
      ok: true,
      status: `START set @ ${now.toFixed(3)}s. Play to the rally's end, then Mark END.`,
    };
  }

  markEnd(now: number | null): OpResult {
    if (now == null)
      return { ok: false, status: "No media playing -- cannot mark END." };
    this.endField = now.toFixed(3);
    return {
      ok: true,
      status: `END set @ ${now.toFixed(3)}s. Choose the Ending reason, then click Save Rally.`,
    };
  }

  saveRally(): OpResult {
    let s = fieldNum(this.startField);
    let e = fieldNum(this.endField);
    if (s == null)
      return { ok: false, status: "Set a START time first (click Mark START)." };
    if (e == null)
      return { ok: false, status: "Set an END time first (click Mark END)." };
    if (e < s) {
      const t = s;
      s = e;
      e = t;
    } // tolerate reversed marks
    if (e <= s)
      return { ok: false, status: "END must be later than START (rally must be > 0s)." };

    const reason = this.reason || REASON_DEFAULT;
    const sport = this.sport || SPORTS[0];
    const shotsNum = this.getShots();
    const shots = shotsNum != null ? String(shotsNum) : null;

    if (this.mode === "edit" && this.editIndex != null && this.rows[this.editIndex]) {
      const r = this.rows[this.editIndex];
      const backup = { ...r };
      r.s = s;
      r.e = e;
      r.reason = reason;
      r.sport = sport;
      r.shots = shots;
      const res = this.persist(this.rows);
      if (!res.ok) {
        Object.assign(r, backup);
        return { ok: false, status: "WRITE FAILED: " + res.err };
      }
      const status = `Updated rally #${r.n}: ${s.toFixed(3)} -> ${e.toFixed(3)} [${reason}, ${sport}].`;
      this.resetForm();
      return { ok: true, status };
    }

    const n = this.plannedNextNumber();
    if (this.indexOfRally(n) !== -1)
      return {
        ok: false,
        status: `Rally #${n} already exists -- set "Next rally #" to a free number.`,
      };
    const row: RallyRow = { n, s, e, reason, sport, shots, extra: null };
    this.rows.push(row);
    const res = this.persist(this.rows);
    if (!res.ok) {
      this.rows.pop();
      return { ok: false, status: "WRITE FAILED: " + res.err };
    }
    this.nextField = String(this.nextFreeFrom(n + 1));
    const status = `Saved rally #${n}: ${s.toFixed(3)} -> ${e.toFixed(3)} [${reason}, ${sport}].`;
    this.resetForm();
    return { ok: true, status };
  }

  editSelected(n: number | null): OpResult {
    if (this.isArmed())
      return {
        ok: false,
        status:
          "Finish the current rally ('Save Rally') or clear it ('Undo last') before " +
          "editing another -- your unsaved START -> END would be lost.",
      };
    if (n == null)
      return { ok: false, status: "Pick a rally in the Recent list first, then Edit selected." };
    const idx = this.indexOfRally(n);
    if (idx === -1)
      return { ok: false, status: `Rally #${n} not found (try Refresh).` };
    const r = this.rows[idx];
    this.mode = "edit";
    this.editIndex = idx;
    this.startField = r.s.toFixed(3);
    this.endField = r.e.toFixed(3);
    this.shotsField = r.shots != null ? r.shots : "";
    this.reason = r.reason || REASON_DEFAULT;
    this.sport = r.sport || this.sport;
    return {
      ok: true,
      status: `Editing rally #${r.n}. Adjust Start/End/reason, then Save changes. (Undo last cancels.)`,
    };
  }

  deleteSelected(n: number | null): OpResult {
    if (n == null)
      return { ok: false, status: "Pick a rally in the Recent list first, then Delete selected." };
    const idx = this.indexOfRally(n);
    if (idx === -1)
      return { ok: false, status: `Rally #${n} not found (try Refresh).` };
    const removed = this.rows.splice(idx, 1)[0];
    const res = this.persist(this.rows);
    if (!res.ok) {
      this.rows.splice(idx, 0, removed);
      return { ok: false, status: "WRITE FAILED: " + res.err };
    }
    this.resetForm();
    this.refreshNextField();
    return { ok: true, status: `Deleted rally #${n}. ${this.rows.length} remaining.` };
  }

  // 3-way: cancel edit / clear in-progress mark / drop the last committed row.
  undoLast(): OpResult {
    if (this.mode === "edit") {
      this.resetForm();
      return { ok: true, status: "Edit cancelled." };
    }
    const s = fieldNum(this.startField);
    const e = fieldNum(this.endField);
    if (s != null || e != null) {
      this.resetForm();
      return { ok: true, status: "Cleared the in-progress START/END (nothing was written)." };
    }
    if (this.rows.length === 0) return { ok: false, status: "Nothing to undo." };
    const last = this.rows.pop()!;
    const res = this.persist(this.rows);
    if (!res.ok) {
      this.rows.push(last);
      return { ok: false, status: "WRITE FAILED: " + res.err };
    }
    this.refreshNextField();
    return { ok: true, status: `Removed last rally #${last.n}. ${this.rows.length} remaining.` };
  }

  toCSV(): string {
    return serializeRows(this.rows);
  }
}
