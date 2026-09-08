import { describe, it, expect } from "vitest";
import { Annotator, unanimousRowSport } from "../src/state/annotator";
import { parseRows, serializeRows, HEADER } from "../src/state/csv";

// Build an Annotator with a capturing persist (records the serialized CSV each write).
function make(rowsCsv = "") {
  const store = { csv: "", writes: 0 };
  const a = new Annotator({
    rows: rowsCsv ? parseRows(HEADER + rowsCsv) : [],
    persist: (rows) => {
      store.csv = serializeRows(rows);
      store.writes++;
      return { ok: true };
    },
  });
  return { a, store };
}

function complete(a: Annotator, reason = "winner", shots = "1") {
  a.reason = reason;
  a.shotsField = shots;
}

describe("numbering", () => {
  it("continues from max existing rally_number", () => {
    const { a } = make("1,1.0,2.0,winner,badminton,\n5,3.0,4.0,let,tennis,\n");
    expect(a.nextRallyNumber()).toBe(6);
    expect(a.nextField).toBe("6"); // initialized on construction
  });

  it("starts at 1 when empty", () => {
    const { a } = make();
    expect(a.nextRallyNumber()).toBe(1);
    expect(a.nextField).toBe("1");
  });

  it("nextFreeFrom skips occupied numbers", () => {
    const { a } = make("1,1,2,winner,badminton,\n2,3,4,let,tennis,\n4,5,6,winner,padel,\n");
    expect(a.nextFreeFrom(1)).toBe(3);
    expect(a.nextFreeFrom(3)).toBe(3);
    expect(a.nextFreeFrom(4)).toBe(5);
  });
});

describe("two-step commit + non-sticky reason/shots, video-level sport", () => {
  it("marks then saves; nothing is written until Save", () => {
    const { a, store } = make();
    expect(a.markStart(8.8).ok).toBe(true);
    expect(a.startField).toBe("8.800");
    expect(a.rows.length).toBe(0);
    expect(a.markEnd(11.5).ok).toBe(true);
    expect(a.endField).toBe("11.500");
    expect(a.isArmed()).toBe(true);
    expect(a.rows.length).toBe(0); // still nothing saved

    a.reason = "winner";
    a.shotsField = "9";
    const res = a.saveRally();
    expect(res.ok).toBe(true);
    expect(a.rows.length).toBe(1);
    expect(a.rows[0]).toMatchObject({ n: 1, s: 8.8, e: 11.5, reason: "winner", sport: "badminton", shots: "9" });
    expect(store.csv).toContain("1,8.800,11.500,winner,badminton,9");
  });

  it("resets reason and shots after save, keeps the video sport, advances next #", () => {
    const { a } = make();
    a.sport = "tennis";
    a.markStart(1);
    a.markEnd(2);
    a.reason = "unforced_error";
    a.shotsField = "7";
    a.saveRally();
    expect(a.reason).toBe(""); // required non-sticky placeholder
    expect(a.shotsField).toBe(""); // non-sticky
    expect(a.sport).toBe("tennis"); // one setting for the video
    expect(a.startField).toBe("");
    expect(a.endField).toBe("");
    expect(a.nextField).toBe("2");
  });

  it("rejects zero, blank, negative and fractional shot counts", () => {
    const { a } = make();
    a.markStart(1);
    a.markEnd(2);
    a.reason = "winner";
    for (const value of ["0", "", "-3", "1.5", "words"]) {
      a.shotsField = value;
      expect(a.saveRally()).toMatchObject({ ok: false, key: "status.needShots" });
    }
    expect(a.rows).toHaveLength(0);
  });

  it("requires one of the three current ending reasons", () => {
    const { a } = make();
    a.markStart(1);
    a.markEnd(2);
    a.shotsField = "1";
    for (const reason of ["", "unknown", "let", "forced_error", "other", "custom"]) {
      a.reason = reason;
      expect(a.saveRally()).toMatchObject({ ok: false, key: "status.needReason" });
    }
    for (const reason of ["service_fault", "unforced_error", "winner"]) {
      a.reason = reason;
      expect(a.saveRally().ok).toBe(true);
      if (reason !== "winner") {
        a.markStart(1);
        a.markEnd(2);
        a.shotsField = "1";
      }
    }
  });
});

describe("video-level sport", () => {
  it("requires a declared sport for a real new video", () => {
    const a = new Annotator({ sport: null });
    a.markStart(1);
    a.markEnd(2);
    complete(a);
    const res = a.saveRally();
    expect(res).toMatchObject({ ok: false, key: "status.needVideoSport" });
    expect(a.rows).toHaveLength(0);
  });

  it("derives a unanimous legacy CSV sport when no sidecar declaration is supplied", () => {
    const { a } = make("1,1,2,winner,table_tennis,\n2,3,4,let,table_tennis,\n");
    expect(a.sport).toBe("table_tennis");
  });

  it("does not guess a video sport from mixed legacy rows", () => {
    const rows = parseRows(HEADER + "1,1,2,winner,badminton,\n2,3,4,let,pickleball,\n");
    expect(unanimousRowSport(rows)).toBeNull();
    const a = new Annotator({ rows, sport: unanimousRowSport(rows) });
    expect(a.sport).toBeNull();
  });

  it("refuses to append while existing rows disagree with the declared video sport", () => {
    const a = new Annotator({
      rows: parseRows(HEADER + "1,1,2,winner,badminton,\n"),
      sport: "pickleball",
    });
    a.markStart(3);
    a.markEnd(4);
    complete(a);
    const res = a.saveRally();
    expect(res).toMatchObject({ ok: false, key: "status.mixedVideoSport" });
    expect(a.rows).toHaveLength(1);
  });

  it("normalizes every existing row when Clip info changes the video sport", () => {
    const store = { writes: 0, csv: "" };
    const a = new Annotator({
      rows: parseRows(HEADER + "1,1,2,winner,badminton,\n2,3,4,let,table_tennis,\n"),
      sport: "badminton",
      persist: (rows) => {
        store.writes++;
        store.csv = serializeRows(rows);
        return { ok: true };
      },
    });
    const res = a.setVideoSport("pickleball");
    expect(res).toMatchObject({ ok: true, normalized: 2 });
    expect(a.sport).toBe("pickleball");
    expect(a.rows.map((row) => row.sport)).toEqual(["pickleball", "pickleball"]);
    expect(store.writes).toBe(1);
    expect(store.csv).not.toContain("badminton");
    expect(store.csv).not.toContain("table_tennis");
  });

  it("rolls back the video and row sports when normalization cannot persist", () => {
    const a = new Annotator({
      rows: parseRows(HEADER + "1,1,2,winner,badminton,\n"),
      sport: "badminton",
      persist: () => ({ ok: false, err: "disk full" }),
    });
    const res = a.setVideoSport("tennis");
    expect(res).toMatchObject({ ok: false, key: "status.writeFailed", normalized: 0 });
    expect(a.sport).toBe("badminton");
    expect(a.rows[0].sport).toBe("badminton");
  });
});

describe("validation", () => {
  it("swaps reversed marks (end < start)", () => {
    const { a } = make();
    a.markStart(10);
    a.markEnd(5);
    complete(a);
    a.saveRally();
    expect(a.rows[0]).toMatchObject({ s: 5, e: 10 });
  });

  it("refuses a zero-length rally (end <= start)", () => {
    const { a } = make();
    a.markStart(5);
    a.markEnd(5);
    const res = a.saveRally();
    expect(res.ok).toBe(false);
    expect(a.rows.length).toBe(0);
  });

  it("refuses a duplicate rally number", () => {
    const { a } = make("2,1,2,winner,badminton,\n");
    a.nextField = "2";
    a.markStart(3);
    a.markEnd(4);
    complete(a);
    const res = a.saveRally();
    expect(res.ok).toBe(false);
    expect(res.key).toBe("status.duplicate");
  });
});

describe("unsaved-rally guard (v1.6.4)", () => {
  it("refuses Mark START while a rally is armed", () => {
    const { a } = make();
    a.markStart(1);
    a.markEnd(2);
    const res = a.markStart(3);
    expect(res.ok).toBe(false);
    expect(res.key).toBe("status.unsavedGuard");
    expect(a.startField).toBe("1.000"); // unchanged
  });

  it("refuses Edit selected while a rally is armed", () => {
    const { a } = make("1,1,2,winner,badminton,\n");
    a.markStart(3);
    a.markEnd(4);
    const res = a.editSelected(1);
    expect(res.ok).toBe(false);
    expect(a.mode).toBe("new");
  });
});

describe("3-way undo", () => {
  it("cancels an edit", () => {
    const { a } = make("1,1,2,winner,badminton,\n");
    a.editSelected(1);
    expect(a.mode).toBe("edit");
    const res = a.undoLast();
    expect(res.key).toBe("status.editCancelled");
    expect(a.mode).toBe("new");
  });

  it("clears an in-progress mark without writing", () => {
    const { a, store } = make();
    a.markStart(1);
    const res = a.undoLast();
    expect(res.key).toBe("status.clearedMark");
    expect(a.startField).toBe("");
    expect(store.writes).toBe(0);
  });

  it("drops the last committed row and resyncs next #", () => {
    const { a } = make("1,1,2,winner,badminton,\n2,3,4,let,tennis,\n");
    const res = a.undoLast();
    expect(res.ok).toBe(true);
    expect(a.rows.map((r) => r.n)).toEqual([1]);
    expect(a.nextField).toBe("2");
  });

  it("reports nothing to undo on an empty, idle form", () => {
    const { a } = make();
    expect(a.undoLast().ok).toBe(false);
  });
});

describe("edit mode", () => {
  it("relabels Mark/Save buttons to make edit mode unmissable", () => {
    const { a } = make("3,1,2,winner,badminton,\n");
    a.editSelected(3);
    expect(a.markStartLabel()).toEqual({ key: "btn.reMarkStart", params: { n: 3 } });
    expect(a.markEndLabel()).toEqual({ key: "btn.reMarkEnd", params: { n: 3 } });
    expect(a.saveLabel()).toEqual({ key: "btn.saveChangesN", params: { n: 3 } });
  });

  it("loads the row's fields (incl. shots) and keeps the same rally_number on save", () => {
    const { a } = make("3,1.000,2.000,winner,badminton,9\n");
    a.editSelected(3);
    expect(a.startField).toBe("1.000");
    expect(a.endField).toBe("2.000");
    expect(a.shotsField).toBe("9");
    expect(a.reason).toBe("winner");
    a.endField = "5.000";
    a.reason = "unforced_error";
    const res = a.saveRally();
    expect(res.ok).toBe(true);
    expect(a.rows[0]).toMatchObject({ n: 3, e: 5, reason: "unforced_error" });
    expect(a.mode).toBe("new"); // back to new after committing the edit
  });
});

describe("delete", () => {
  it("removes a row and resyncs the next # field", () => {
    const { a } = make("1,1,2,winner,badminton,\n2,3,4,let,tennis,\n");
    const res = a.deleteSelected(1);
    expect(res.ok).toBe(true);
    expect(a.rows.map((r) => r.n)).toEqual([2]);
    expect(a.nextField).toBe("3"); // max(2)+1
  });
});

describe("save-button label in new mode", () => {
  it("shows the planned number once both times are set", () => {
    const { a } = make();
    expect(a.saveLabel()).toEqual({ key: "btn.saveRally" });
    a.markStart(1);
    a.markEnd(2);
    expect(a.saveLabel()).toEqual({ key: "btn.saveRallyN", params: { n: 1 } });
  });
});

describe("write-failure rollback", () => {
  function failing(rowsCsv = "") {
    return new Annotator({
      rows: rowsCsv ? parseRows(HEADER + rowsCsv) : [],
      persist: () => ({ ok: false, err: "disk full" }),
    });
  }

  it("rolls back a new save when the write fails", () => {
    const a = failing();
    a.markStart(1);
    a.markEnd(2);
    complete(a);
    const res = a.saveRally();
    expect(res.ok).toBe(false);
    expect(res.key).toBe("status.writeFailed");
    expect(a.rows).toHaveLength(0);
  });

  it("restores the row when an edit fails to write", () => {
    const a = failing("1,1.000,2.000,winner,badminton,1\n");
    a.editSelected(1);
    a.endField = "9.000";
    complete(a);
    expect(a.saveRally().ok).toBe(false);
    expect(a.rows[0].e).toBe(2); // unchanged
  });

  it("restores the row when delete fails to write", () => {
    const a = failing("1,1,2,winner,badminton,\n");
    expect(a.deleteSelected(1).ok).toBe(false);
    expect(a.rows).toHaveLength(1);
  });

  it("restores the row when undo fails to write", () => {
    const a = failing("1,1,2,winner,badminton,\n");
    expect(a.undoLast().ok).toBe(false);
    expect(a.rows).toHaveLength(1);
  });
});

describe("legacy repair and golden export", () => {
  it("preserves legacy values, identifies every repair row and blocks export", () => {
    const { a } = make(
      "1,1,2,forced_error,badminton,7\n" +
      "2,3,4,,badminton,\n" +
      "3,5,6,winner,badminton,9\n"
    );
    expect(a.rows[0].reason).toBe("forced_error");
    expect(a.rows[1]).toMatchObject({ reason: "", shots: null });
    expect(a.goldenRepairRows()).toEqual([1, 2]);
    expect(() => a.toCSV()).toThrow(/repair rally rows: 1, 2/);
  });

  it("requires both fields while repairing a legacy row, then exports once clean", () => {
    const { a } = make("1,1,2,let,badminton,\n");
    a.editSelected(1);
    expect(a.reason).toBe("let");
    expect(a.saveRally()).toMatchObject({ ok: false, key: "status.needReason" });
    a.reason = "winner";
    expect(a.saveRally()).toMatchObject({ ok: false, key: "status.needShots" });
    a.shotsField = "1";
    expect(a.saveRally().ok).toBe(true);
    expect(a.goldenRepairRows()).toEqual([]);
    expect(a.toCSV()).toContain("1,1.000,2.000,winner,badminton,1");
  });
});
