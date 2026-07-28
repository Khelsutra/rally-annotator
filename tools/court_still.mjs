#!/usr/bin/env node
// court_still — build an EMPTY-COURT still from a match video, for drawing the target
// court's play-volume polygon against.
//
//     node tools/court_still.mjs <video> [--out FILE] [--frames N] [--width PX]
//
// It samples N frames spread across the clip and takes their TEMPORAL MEDIAN. On a fixed
// camera that erases everything that moves — players, shuttles, a passing coach — and keeps
// everything that does not, which is exactly the court lines. The result is a cleaner surface
// for marking court geometry than any single frame, because no single frame has all four
// corners unobstructed.
//
// WHY MEDIAN, AND NOT "a frame at each rally start":
// rally boundaries are the WORST moments to sample — that is precisely when players are
// standing on the lines. The median needs no labels at all, and beats hand-picked frames.
//
// WHAT THIS TOOL DOES NOT DO — deliberately:
//   * it never writes to <clip>.rallies.csv, .clipmeta.json or .target-review.csv;
//   * it does not detect the court, propose a polygon, or infer anything. It produces an
//     IMAGE. A human reads that image and draws the polygon.
// That boundary is the point: an operator reading a picture is human-from-scratch labelling,
// with no model in the provenance chain (see docs/TARGET_REVIEW.md).
//
// Requires ffmpeg + ffprobe on PATH.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------------------
// Pure helpers (unit-tested in web/test/courtStill.test.ts)
// ---------------------------------------------------------------------------------------

export const DEFAULT_FRAMES = 25;
export const DEFAULT_WIDTH = 1280;
// Skip the head and tail of the clip: GoPro recordings routinely open and close with the
// camera being handled, and a frame of someone's hand is a frame the median has to outvote.
export const DEFAULT_INSET = 0.05;

/** ffmpeg's tmedian buffers 2*radius+1 frames, so a true median needs an ODD sample count. */
export function oddify(n) {
  const v = Math.max(3, Math.floor(n));
  return v % 2 === 0 ? v - 1 : v;
}

export function medianRadius(frameCount) {
  return (oddify(frameCount) - 1) / 2;
}

/** Evenly spaced sample times inside [inset, 1-inset] of the duration. */
export function planTimestamps(durationS, count = DEFAULT_FRAMES, inset = DEFAULT_INSET) {
  if (!Number.isFinite(durationS) || durationS <= 0) return [];
  const n = oddify(count);
  const lo = durationS * inset;
  const hi = durationS * (1 - inset);
  if (hi <= lo) return [durationS / 2];
  // n points across [lo, hi] inclusive; a single sample sits in the middle.
  if (n === 1) return [(lo + hi) / 2];
  const step = (hi - lo) / (n - 1);
  return Array.from({ length: n }, (_, i) => Number((lo + i * step).toFixed(3)));
}

/** `<clip>.court.png`, next to the video — the same stem the label sidecars share. */
export function stillPathFor(videoPath) {
  const dir = path.dirname(videoPath);
  const base = path.basename(videoPath);
  const stem = base.replace(/\.[^.\\/]+$/, "");
  return path.join(dir, `${stem}.court.png`);
}

export function parseDuration(ffprobeStdout) {
  const m = String(ffprobeStdout).match(/duration=([0-9.]+)/);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function parseArgs(argv) {
  const opts = { video: null, out: null, frames: DEFAULT_FRAMES, width: DEFAULT_WIDTH, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") opts.out = argv[++i] ?? null;
    else if (a === "--frames") opts.frames = Number(argv[++i]);
    else if (a === "--width") opts.width = Number(argv[++i]);
    else if (a.startsWith("--")) opts.error = `unknown option ${a}`;
    else if (opts.video == null) opts.video = a;
    else opts.error = `unexpected argument ${a}`;
  }
  if (!opts.error && !opts.video) opts.error = "no video given";
  if (!opts.error && !Number.isFinite(opts.frames)) opts.error = "--frames must be a number";
  if (!opts.error && !Number.isFinite(opts.width)) opts.error = "--width must be a number";
  return opts;
}

// ---------------------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------------------

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function have(cmd) {
  const r = run(cmd, ["-version"]);
  return !r.error && r.status === 0;
}

export function buildStill(videoPath, { out, frames, width, log = () => {} } = {}) {
  if (!existsSync(videoPath)) throw new Error(`no such file: ${videoPath}`);
  if (!have("ffprobe") || !have("ffmpeg")) {
    throw new Error("ffmpeg and ffprobe must be on PATH");
  }

  const probe = run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1", videoPath,
  ]);
  const duration = parseDuration(probe.stdout);
  if (!duration) throw new Error("could not read the clip duration");

  const times = planTimestamps(duration, frames);
  const dest = out || stillPathFor(videoPath);
  const work = mkdtempSync(path.join(tmpdir(), "court-still-"));
  log(`sampling ${times.length} frames across ${duration.toFixed(1)}s`);

  try {
    times.forEach((t, i) => {
      // -ss BEFORE -i is the fast seek: it jumps to the nearest keyframe instead of decoding
      // the whole file, which matters when the clip is 11 GB.
      const frame = path.join(work, `f${String(i + 1).padStart(3, "0")}.png`);
      const r = run("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-ss", String(t), "-i", videoPath,
        "-frames:v", "1", "-vf", `scale=${Math.round(width)}:-1`, frame,
      ]);
      if (r.status !== 0 && !existsSync(frame)) log(`  (no frame at ${t}s, skipping)`);
    });

    const grabbed = readdirSync(work).filter((f) => f.endsWith(".png")).sort();
    if (grabbed.length < 3) throw new Error(`only ${grabbed.length} frames could be read`);
    // A median needs an odd count; drop the last grab rather than weight one frame twice.
    const usable = grabbed.length % 2 === 0 ? grabbed.length - 1 : grabbed.length;
    const radius = (usable - 1) / 2;
    log(`median over ${usable} frames`);

    // tmedian emits nothing until its window is full, so it writes (usable - 2*radius) = 1
    // frame; ask for a numbered pattern and take the last one written.
    const med = run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-framerate", "1", "-i", path.join(work, "f%03d.png"),
      "-frames:v", String(usable),
      "-vf", `tmedian=radius=${radius}`,
      path.join(work, "med%03d.png"),
    ]);
    const outs = readdirSync(work).filter((f) => f.startsWith("med")).sort();
    if (outs.length === 0) {
      throw new Error(`ffmpeg produced no median frame${med.stderr ? `: ${med.stderr.trim()}` : ""}`);
    }
    copyFileSync(path.join(work, outs[outs.length - 1]), dest);
    return dest;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
  .replace(/^file:\/\/([A-Za-z]:)/, "file:///$1");

if (isMain || process.argv[1]?.endsWith("court_still.mjs")) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.error) {
    console.error(`court_still: ${opts.error}
usage: node tools/court_still.mjs <video> [--out FILE] [--frames ${DEFAULT_FRAMES}] [--width ${DEFAULT_WIDTH}]`);
    process.exit(2);
  }
  try {
    const dest = buildStill(opts.video, { ...opts, log: (m) => console.log(`  ${m}`) });
    console.log(`wrote ${dest}`);
  } catch (e) {
    console.error(`court_still: ${e.message}`);
    process.exit(1);
  }
}
