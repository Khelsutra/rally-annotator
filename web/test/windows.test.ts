import { describe, it, expect } from "vitest";
import {
  WINDOW_LABELS, WINDOW_TARGET_EACH, WIN_HEADER, csvSafe, indexOfWindow, nextWindowNumber,
  parseWindows, serializeWindows, tally, windowsFilename, type WindowRow,
} from "../src/state/windows";

const w = (n: number, s: number, e: number, label: string, notes = ""): WindowRow =>
  ({ n, s, e, label, court: "c1", notes });

describe("the §4.4 vocabulary", () => {
  it("is exactly the five labels, verbatim", () => {
    expect([...WINDOW_LABELS]).toEqual([
      "target_rally",
      "adjacent_court_rally",
      "simultaneous_rallies",
      "target_court_non_rally",
      "empty",
    ]);
  });

  it("counts against §4.4's per-subtype minimum", () => {
    expect(WINDOW_TARGET_EACH).toBe(12);
  });

  it("tallies every label, including the ones with no rows yet", () => {
    const t = tally([w(1, 0, 1, "adjacent_court_rally"), w(2, 2, 3, "adjacent_court_rally")]);
    expect(t.adjacent_court_rally).toBe(2);
    expect(t.simultaneous_rallies).toBe(0);
    expect(Object.keys(t)).toHaveLength(5);
  });

  it("ignores an unknown label rather than inventing a bucket for it", () => {
    expect(tally([w(1, 0, 1, "nonsense")]).target_rally).toBe(0);
  });
});

describe("serialize / parse", () => {
  it("writes the documented header and 3-dp seconds", () => {
    const csv = serializeWindows([w(1, 12.5, 18.25, "adjacent_court_rally", "left neighbour")]);
    expect(csv.startsWith(WIN_HEADER)).toBe(true);
    expect(csv).toContain("1,12.500,18.250,adjacent_court_rally,c1,left neighbour\n");
  });

  it("keeps the label canonical — it is DATA, like reason/sport in the rally CSV", () => {
    expect(serializeWindows([w(1, 0, 1, "empty")])).toContain(",empty,");
  });

  it("flattens free text, because the format has no quoting", () => {
    expect(csvSafe("a, b\nc")).toBe("a; b c");
    const csv = serializeWindows([w(1, 0, 1, "empty", "one, two\nthree")]);
    expect(csv.trim().split("\n")[1].split(",")).toHaveLength(6); // column count survives
  });

  it("round-trips", () => {
    const rows = [w(1, 12.5, 18.25, "adjacent_court_rally", "x"), w(2, 30, 36, "target_rally")];
    expect(parseWindows(serializeWindows(rows))).toEqual(rows);
  });

  it("skips the header and blank lines, like the rally CSV loader", () => {
    expect(parseWindows(WIN_HEADER + "\n\n")).toEqual([]);
  });

  it("drops a zero-length or reversed window instead of repairing it", () => {
    const csv = WIN_HEADER + "1,5.000,5.000,empty,c1,\n2,9.000,4.000,empty,c1,\n3,1.000,2.000,empty,c1,\n";
    expect(parseWindows(csv).map((r) => r.n)).toEqual([3]);
  });

  it("tolerates an older file with no notes column", () => {
    expect(parseWindows(WIN_HEADER + "1,1.000,2.000,empty,c1\n")[0].notes).toBe("");
  });
});

describe("numbering", () => {
  it("is independent of the rally track and continues across a reload", () => {
    expect(nextWindowNumber([])).toBe(1);
    expect(nextWindowNumber([w(1, 0, 1, "empty"), w(7, 2, 3, "empty")])).toBe(8);
  });

  it("finds a row by its number", () => {
    const rows = [w(1, 0, 1, "empty"), w(2, 2, 3, "empty")];
    expect(indexOfWindow(rows, 2)).toBe(1);
    expect(indexOfWindow(rows, 99)).toBe(-1);
  });

  it("sanitizes the filename and never collides with the rally CSV", () => {
    expect(windowsFilename("My Match")).toBe("My Match.windows.csv");
    expect(windowsFilename("")).toBe("rallies.windows.csv");
  });
});
