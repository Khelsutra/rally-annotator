import { describe, it, expect } from "vitest";
import { parseRows, serializeRows, HEADER } from "../src/state/csv";

// The exact example from docs/CSV_FORMAT.md (header + 3 rows, trailing newline).
const SAMPLE =
  HEADER +
  "1,8.800,11.500,winner,badminton,9\n" +
  "2,24.389,46.589,unforced_error,badminton,21\n" +
  "3,49.183,54.683,let,badminton,\n";

describe("csv serialize/parse (byte-compatible with vlc/rally_annotator.lua)", () => {
  it("round-trips the documented sample byte-identically", () => {
    expect(serializeRows(parseRows(SAMPLE))).toBe(SAMPLE);
  });

  it("reads shots_count: a value as a verbatim token, blank as null", () => {
    expect(parseRows(SAMPLE).map((r) => r.shots)).toEqual(["9", "21", null]);
  });

  it("skips the header and blank lines; only integer-leading lines are rows", () => {
    const rows = parseRows(
      "rally_number,start_time\n\n   \n5,1.0,2.0,winner,tennis,\nnotarow,1,2\n"
    );
    expect(rows.map((r) => r.n)).toEqual([5]);
  });

  it("preserves columns 7+ verbatim on rewrite", () => {
    const csv = HEADER + "1,1.000,2.000,winner,badminton,5,extraA,extraB\n";
    expect(parseRows(csv)[0].extra).toBe("extraA,extraB");
    expect(serializeRows(parseRows(csv))).toBe(csv);
  });

  it("loads a missing/blank reason as 'other' (the load-time default)", () => {
    expect(parseRows("7,1.0,2.0,,padel,\n")[0].reason).toBe("other");
  });

  it("serializes blank shots as a trailing empty field, value as the token", () => {
    expect(
      serializeRows([
        { n: 1, s: 1, e: 2, reason: "winner", sport: "badminton", shots: null, extra: null },
        { n: 2, s: 3, e: 4, reason: "let", sport: "tennis", shots: "12", extra: null },
      ])
    ).toBe(HEADER + "1,1.000,2.000,winner,badminton,\n2,3.000,4.000,let,tennis,12\n");
  });

  it("formats times to 3 decimals like Lua %.3f", () => {
    expect(
      serializeRows([{ n: 1, s: 8.8, e: 11.5, reason: "winner", sport: "badminton", shots: null, extra: null }])
    ).toBe(HEADER + "1,8.800,11.500,winner,badminton,\n");
  });
});
