import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_FRAMES, DEFAULT_INSET, VIDEO_EXTS, isVideoFile, medianRadius, oddify, parseArgs,
  parseDuration, planTimestamps, stillPathFor,
  // @ts-expect-error - plain .mjs tool, no types; the pure helpers are what we test
} from "../../tools/court_still.mjs";

describe("sample planning", () => {
  it("forces an ODD count, because tmedian buffers 2*radius+1 frames", () => {
    expect(oddify(24)).toBe(23);
    expect(oddify(25)).toBe(25);
    expect(medianRadius(25)).toBe(12);
    expect(medianRadius(24)).toBe(11);
  });

  it("never drops below 3 frames — two frames have no median", () => {
    expect(oddify(0)).toBe(3);
    expect(oddify(-5)).toBe(3);
    expect(oddify(2)).toBe(3);
  });

  it("spreads samples evenly across the clip", () => {
    const ts = planTimestamps(1000, 5, 0);
    expect(ts).toEqual([0, 250, 500, 750, 1000]);
  });

  it("insets the head and tail, where GoPro clips show the camera being handled", () => {
    const ts = planTimestamps(1000, 3, 0.05);
    expect(ts[0]).toBeCloseTo(50, 3);
    expect(ts[ts.length - 1]).toBeCloseTo(950, 3);
    expect(DEFAULT_INSET).toBe(0.05);
  });

  it("returns nothing for an unusable duration rather than guessing one", () => {
    expect(planTimestamps(0)).toEqual([]);
    expect(planTimestamps(-1)).toEqual([]);
    expect(planTimestamps(NaN)).toEqual([]);
  });

  it("falls back to a mid-clip sample when the inset would swallow the whole clip", () => {
    expect(planTimestamps(10, 5, 0.6)).toEqual([5]);
  });

  it("plans the real clip sensibly", () => {
    const ts = planTimestamps(768.768, DEFAULT_FRAMES);
    expect(ts).toHaveLength(25);
    expect(ts[0]).toBeGreaterThan(30); // past the handling at the head
    expect(ts[24]).toBeLessThan(735); // and before the tail
    expect(new Set(ts).size).toBe(25); // no duplicate seeks
  });
});

describe("output path", () => {
  it("shares the stem with the label sidecars", () => {
    expect(stillPathFor("/v/GX020096.MP4").replace(/\\/g, "/")).toBe("/v/GX020096.court.png");
  });
  it("handles a dotted name and a bare name", () => {
    expect(stillPathFor("/v/a.b.c.mp4").replace(/\\/g, "/")).toBe("/v/a.b.c.court.png");
    expect(stillPathFor("clip").replace(/\\/g, "/")).toBe("clip.court.png");
  });
});

describe("ffprobe parsing", () => {
  it("reads the duration", () => {
    expect(parseDuration("duration=768.768000\n")).toBeCloseTo(768.768, 3);
  });
  it("returns null rather than 0 when there is no usable duration", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("duration=0")).toBeNull();
    expect(parseDuration("duration=N/A")).toBeNull();
  });
});

describe("batch mode", () => {
  it("recognises the containers a GoPro session actually contains", () => {
    expect(isVideoFile("GX020096.MP4")).toBe(true);
    expect(isVideoFile("clip.mov")).toBe(true);
    expect(isVideoFile("clip.mkv")).toBe(true);
    expect(VIDEO_EXTS).toContain(".mp4");
  });

  it("ignores the sidecars sitting in the same folder", () => {
    // A session folder holds the labels next to the videos; batching must not try to
    // ffprobe a CSV.
    expect(isVideoFile("GX020096.rallies.csv")).toBe(false);
    expect(isVideoFile("GX020096.clipmeta.json")).toBe(false);
    expect(isVideoFile("GX020096.court.png")).toBe(false);
    expect(isVideoFile("notes")).toBe(false);
  });

  it("takes a folder and refuses a folder plus a video", () => {
    expect(parseArgs(["--all", "F:/clips"])).toMatchObject({ all: "F:/clips", video: null, error: null });
    expect(parseArgs(["--all", "F:/clips", "x.mp4"]).error).toMatch(/--all takes a folder/);
  });

  it("carries --force, so a re-run can be made to redo existing stills", () => {
    expect(parseArgs(["--all", "d", "--force"]).force).toBe(true);
    expect(parseArgs(["--all", "d"]).force).toBe(false);
  });
});

describe("argument parsing", () => {
  it("takes the video positionally and the rest as flags", () => {
    const o = parseArgs(["clip.mp4", "--frames", "9", "--width", "640", "--out", "x.png"]);
    expect(o).toMatchObject({ video: "clip.mp4", frames: 9, width: 640, out: "x.png", error: null });
  });
  it("defaults frames and width", () => {
    const o = parseArgs(["clip.mp4"]);
    expect(o.frames).toBe(DEFAULT_FRAMES);
    expect(o.error).toBeNull();
  });
  it("refuses garbage rather than running on a default", () => {
    expect(parseArgs([]).error).toMatch(/no video/);
    expect(parseArgs(["a.mp4", "--nope"]).error).toMatch(/unknown option/);
    expect(parseArgs(["a.mp4", "b.mp4"]).error).toMatch(/unexpected argument/);
    expect(parseArgs(["a.mp4", "--frames", "x"]).error).toMatch(/--frames/);
  });
});

describe("picker image handoff", () => {
  it("accepts the still URL supplied by VLC instead of always opening blank", () => {
    const picker = readFileSync(new URL("../../tools/court_picker.html", import.meta.url), "utf8");
    const vlc = readFileSync(new URL("../../vlc/rally_annotator.lua", import.meta.url), "utf8");
    expect(picker).toContain('new URLSearchParams(location.search).get("image")');
    expect(vlc).toContain('picker_url = picker_url .. "?image="');
  });
});
