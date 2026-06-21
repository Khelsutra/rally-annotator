// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DirectVideoHandler } from "../src/video/directVideo";

// jsdom doesn't implement media playback, so we instrument a <video> with controllable
// currentTime/duration/paused and stub play()/pause() to test the handler's logic.
function addVideo(opts: { currentTime?: number; duration?: number; paused?: boolean } = {}) {
  const v = document.createElement("video");
  Object.defineProperty(v, "currentTime", { value: opts.currentTime ?? 0, writable: true, configurable: true });
  Object.defineProperty(v, "duration", { value: opts.duration ?? NaN, configurable: true });
  Object.defineProperty(v, "paused", { value: opts.paused ?? true, writable: true, configurable: true });
  (v as unknown as { play: () => Promise<void> }).play = vi.fn().mockResolvedValue(undefined);
  (v as unknown as { pause: () => void }).pause = vi.fn();
  document.body.appendChild(v);
  return v;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("DirectVideoHandler", () => {
  it("reports no video on an empty page", () => {
    const h = new DirectVideoHandler();
    expect(h.hasVideo()).toBe(false);
    expect(h.now()).toBe(null);
    expect(h.seekBy(5)).toBe(false);
    expect(h.playPause()).toBe(null);
  });

  it("reads currentTime and finite duration", () => {
    addVideo({ currentTime: 2.5, duration: 6 });
    const h = new DirectVideoHandler();
    expect(h.hasVideo()).toBe(true);
    expect(h.now()).toBe(2.5);
    expect(h.duration()).toBe(6);
  });

  it("returns null duration when not finite", () => {
    addVideo({ currentTime: 0, duration: NaN });
    expect(new DirectVideoHandler().duration()).toBe(null);
  });

  it("seeks relatively and clamps at 0", () => {
    const v = addVideo({ currentTime: 2 });
    const h = new DirectVideoHandler();
    expect(h.seekBy(5)).toBe(true);
    expect(v.currentTime).toBe(7);
    h.seekBy(-100);
    expect(v.currentTime).toBe(0);
  });

  it("toggles play/pause based on paused state", () => {
    const v = addVideo({ paused: true });
    const h = new DirectVideoHandler();
    expect(h.playPause()).toBe("playing");
    expect((v as unknown as { play: ReturnType<typeof vi.fn> }).play).toHaveBeenCalled();
    Object.defineProperty(v, "paused", { value: false, configurable: true });
    expect(h.playPause()).toBe("paused");
    expect((v as unknown as { pause: ReturnType<typeof vi.fn> }).pause).toHaveBeenCalled();
  });

  it("prefers a playing video over a paused one", () => {
    addVideo({ paused: true, currentTime: 1 });
    const playing = addVideo({ paused: false, currentTime: 9 });
    expect(new DirectVideoHandler().now()).toBe(9);
    expect(playing).toBeTruthy();
  });
});
