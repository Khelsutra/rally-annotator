// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { mountPanel, type PanelHandle } from "../src/ui/panel";
import { Annotator } from "../src/state/annotator";
import { DirectVideoHandler } from "../src/video/directVideo";
import { emptyClipMeta, type ClipMeta } from "../src/state/clipmeta";
import type { ReviewRow, TargetProfile } from "../src/state/targetReview";

// The panel uses an OPEN shadow root, so we can drive its controls from the test.
// (No real <video> in jsdom; we type Start/End by hand, which the panel supports.)
function shadow(): ShadowRoot {
  const host = document.body.querySelector("div") as HTMLElement;
  return host.shadowRoot as ShadowRoot;
}
function btn(r: ShadowRoot, substr: string): HTMLButtonElement {
  const b = [...r.querySelectorAll("button")].find((x) => (x.textContent || "").includes(substr));
  if (!b) throw new Error(`no button containing "${substr}"`);
  return b as HTMLButtonElement;
}
function setField(el: Element | null, value: string) {
  const node = el as HTMLInputElement | HTMLSelectElement;
  node.value = value;
  node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input"));
}
function statusText(r: ShadowRoot): string {
  return (r.querySelector(".status") as HTMLElement).textContent || "";
}

let panel: PanelHandle | null = null;
beforeEach(() => {
  document.body.innerHTML = "";
  panel = null;
});

function mount(download: (csv: string) => void = () => {}) {
  const a = new Annotator();
  panel = mountPanel({ annotator: a, video: new DirectVideoHandler(), identity: { key: "url:t", title: "T" }, download });
  return a;
}

describe("panel (jsdom, DOM-driven)", () => {
  it("renders the full control set", () => {
    mount();
    const r = shadow();
    expect(r.querySelector("select[name=sport]")).toBeTruthy();
    expect(r.querySelector("select[name=reason]")).toBeTruthy();
    expect(r.querySelector('input[placeholder="start s"]')).toBeTruthy();
    expect(r.querySelector('input[placeholder="end s"]')).toBeTruthy();
    expect(r.querySelector('input[placeholder="shots"]')).toBeTruthy();
    expect(btn(r, "Mark START")).toBeTruthy();
    expect(btn(r, "Save Rally")).toBeTruthy();
    panel!.destroy();
  });

  it("marks (by hand), saves, lists the rally, downloads, and resets the reason", () => {
    let csv = "";
    const a = mount((c) => (csv = c));
    const r = shadow();
    setField(r.querySelector('input[placeholder="start s"]'), "1.0");
    setField(r.querySelector('input[placeholder="end s"]'), "2.5");
    setField(r.querySelector("select[name=reason]"), "winner");
    setField(r.querySelector('input[placeholder="shots"]'), "9");
    btn(r, "Save Rally").click();

    expect(a.rows).toHaveLength(1);
    expect(r.querySelectorAll('[data-list=rallies] .item')).toHaveLength(1);
    expect(r.querySelector('[data-list=rallies] .item')!.textContent).toContain("#1");
    expect(csv).toContain("1,1.000,2.500,winner,badminton,9");
    expect((r.querySelector("select[name=reason]") as HTMLSelectElement).value).toBe("unknown");
    panel!.destroy();
  });

  it("toggles help and reports no-video on Mark with no media", () => {
    mount();
    const r = shadow();
    const help = btn(r, "Help");
    help.click();
    expect(help.textContent).toBe("Hide help");
    btn(r, "Mark START").click();
    expect(statusText(r)).toContain("No media playing");
    panel!.destroy();
  });

  it("wires playback/refresh and list select → edit → undo → delete", () => {
    let csv = "";
    const a = mount((c) => (csv = c));
    const r = shadow();

    // playback with no <video> is handled gracefully
    btn(r, "Back 5s").click();
    expect(statusText(r)).toContain("No video");
    btn(r, "Play / Pause").click();
    expect(statusText(r)).toContain("No video");
    btn(r, "Fwd 5s").click();
    btn(r, "Refresh").click();
    expect(statusText(r)).toContain("No video");

    // create a rally by hand
    setField(r.querySelector('input[placeholder="start s"]'), "1.0");
    setField(r.querySelector('input[placeholder="end s"]'), "2.0");
    btn(r, "Save Rally").click();
    expect(a.rows).toHaveLength(1);

    btn(r, "Download CSV").click();
    expect(csv).toContain("1,1.000,2.000");

    // select the row, edit it, then cancel via Undo
    (r.querySelector('[data-list=rallies] .item') as HTMLElement).click();
    btn(r, "Edit").click();
    expect(a.mode).toBe("edit");
    btn(r, "Undo").click();
    expect(a.mode).toBe("new");

    // select + delete
    (r.querySelector('[data-list=rallies] .item') as HTMLElement).click();
    btn(r, "Delete").click();
    expect(a.rows).toHaveLength(0);
    panel!.destroy();
  });

  it("supports dragging, fullscreen re-parenting, and toggle", () => {
    mount();
    const r = shadow();
    const host = document.body.querySelector("div") as HTMLElement;
    const hdr = r.querySelector(".hdr") as HTMLElement;
    const card = r.querySelector(".card") as HTMLElement;

    // drag the header
    hdr.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, clientY: 100, bubbles: true }));
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 150, clientY: 130 }));
    window.dispatchEvent(new MouseEvent("mouseup"));
    expect(card.style.left).toBe("50px");

    // fullscreen: panel re-parents into the fullscreen element, then back
    const fe = document.createElement("section");
    document.body.appendChild(fe);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fe });
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(fe.contains(host)).toBe(true);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(document.body.contains(host)).toBe(true);

    // toggle hide/show
    panel!.toggle();
    expect(host.style.display).toBe("none");
    panel!.toggle();
    expect(host.style.display).toBe("");
    panel!.destroy();
  });

  it("destroys cleanly (removes the host)", () => {
    mount();
    expect(document.body.querySelector("div")).not.toBe(null);
    panel!.destroy();
    expect(document.body.querySelector("div")).toBe(null);
  });
});

describe("rally annotation without a target profile", () => {
  function mountUndeclared() {
    const a = new Annotator();
    let csv = "";
    panel = mountPanel({
      annotator: a, video: new DirectVideoHandler(), identity: { key: "url:t", title: "T" },
      download: (c) => (csv = c),
    });
    return { a, r: shadow(), csv: () => csv };
  }

  it("preserves the normal no-media feedback instead of showing a court gate", () => {
    const { a, r } = mountUndeclared();
    btn(r, "Mark START").click();
    expect(statusText(r)).toContain("No media playing");
    expect(a.startField).toBe("");
    panel!.destroy();
  });

  it("saves a typed rally and downloads its CSV with no target profile", () => {
    const { a, r, csv } = mountUndeclared();
    setField(r.querySelector('input[placeholder="start s"]'), "1.0");
    setField(r.querySelector('input[placeholder="end s"]'), "2.0");
    btn(r, "Save Rally").click();
    expect(a.rows).toHaveLength(1);
    expect(csv()).toContain("1,1.000,2.000");
    panel!.destroy();
  });

  it("loads an existing labelled clip that has no optional target profile", () => {
    const a = new Annotator({ rows: [{ n: 1, s: 1, e: 2, reason: "winner", sport: "badminton", shots: null, extra: null }] });
    panel = mountPanel({
      annotator: a, video: new DirectVideoHandler(), identity: { key: "url:t", title: "T" }, download: () => {},
    });
    const r = shadow();
    expect(r.querySelectorAll('[data-list=rallies] .item')).toHaveLength(1);
    panel!.destroy();
  });
});

describe("clip info section", () => {
  function mountClip() {
    const a = new Annotator();
    const saved: { clip?: ClipMeta; json?: string } = {};
    panel = mountPanel({
      annotator: a,
      video: new DirectVideoHandler(),
      identity: { key: "url:t", title: "GX010150" },
      download: () => {},
      persistClip: (c) => (saved.clip = { ...c }),
      downloadClipMeta: (j) => (saved.json = j),
    });
    return { a, saved, r: shadow() };
  }

  it("is collapsed by default — the rally flow stays the front door", () => {
    const { r } = mountClip();
    expect((r.querySelector(".sect") as HTMLElement).style.display).toBe("none");
    btn(r, "Clip info").click();
    expect((r.querySelector(".sect") as HTMLElement).style.display).toBe("flex");
    panel!.destroy();
  });

  it("records courts VISIBLE and courts IN PLAY as two separate fields", () => {
    const { saved, r } = mountClip();
    setField(r.querySelector("input[name=clip-courtsVisible]"), "2");
    setField(r.querySelector("input[name=clip-courtsActive]"), "1");
    setField(r.querySelector("input[name=clip-venue]"), "bxh_indiranagar");
    btn(r, "Save clip info").click();
    expect(saved.clip).toMatchObject({ court_count: 2, active_court_count: 1, venue_id: "bxh_indiranagar" });
    expect(saved.json).toContain('"active_court_count": 1');
    panel!.destroy();
  });

  it("refuses active > visible, and writes nothing", () => {
    const { saved, r } = mountClip();
    setField(r.querySelector("input[name=clip-courtsVisible]"), "1");
    setField(r.querySelector("input[name=clip-courtsActive]"), "3");
    btn(r, "Save clip info").click();
    expect(statusText(r)).toContain("cannot exceed");
    expect(saved.json).toBeUndefined();
    panel!.destroy();
  });

  it("refuses a non-numeric count loudly rather than recording nothing", () => {
    const { saved, r } = mountClip();
    setField(r.querySelector("input[name=clip-courtsVisible]"), "two");
    btn(r, "Save clip info").click();
    expect(statusText(r)).toContain("whole number");
    expect(saved.json).toBeUndefined();
    panel!.destroy();
  });

  it("a blank field is recorded as null (not screened), never 0", () => {
    const { saved, r } = mountClip();
    btn(r, "Save clip info").click();
    expect(saved.json).toContain('"court_count": null');
    expect(saved.json).not.toContain('"court_count": 0');
    panel!.destroy();
  });

  it("the match-format picker defaults to (not set), so a forgotten pick records null", () => {
    const { saved, r } = mountClip();
    const sel = r.querySelector("select[name=clip-matchFormat]") as HTMLSelectElement;
    expect(sel.value).toBe("");
    btn(r, "Save clip info").click();
    expect(saved.json).toContain('"match_format": null');
    setField(sel, "singles");
    btn(r, "Save clip info").click();
    expect(saved.json).toContain('"match_format": "singles"');
    panel!.destroy();
  });

  it("offers no way to type a capture date — it can only come from the container", () => {
    const { r } = mountClip();
    expect(r.querySelector("input[name=clip-captureTime]")).toBeNull();
    panel!.destroy();
  });

  it("reloads previously recorded screening instead of re-asking", () => {
    const a = new Annotator();
    panel = mountPanel({
      annotator: a,
      video: new DirectVideoHandler(),
      identity: { key: "url:t", title: "T" },
      download: () => {},
      clip: { ...emptyClipMeta(), court_count: 4, active_court_count: 3 },
    });
    const r = shadow();
    expect((r.querySelector("input[name=clip-courtsVisible]") as HTMLInputElement).value).toBe("4");
    panel!.destroy();
  });
});

describe("label-completeness readout", () => {
  // jsdom has no real <video>, so stub the one method the readout needs.
  function mountWithDuration(duration: number | null) {
    const a = new Annotator();
    const video = new DirectVideoHandler();
    video.duration = () => duration;
    panel = mountPanel({
      annotator: a,
      video,
      identity: { key: "url:t", title: "T" },
      download: () => {},
    });
    return { a, r: shadow() };
  }

  function addRally(r: ShadowRoot, s: string, e: string) {
    setField(r.querySelector('input[placeholder="start s"]'), s);
    setField(r.querySelector('input[placeholder="end s"]'), e);
    btn(r, "Save Rally").click();
  }

  it("warns when a long tail carries no labels — the shape density cannot catch", () => {
    const { r } = mountWithDuration(768.768);
    addRally(r, "0.51", "10");
    addRally(r, "430", "439.956");
    expect(statusText(r)).toContain("328.8"); // the unlabelled tail
    expect(statusText(r)).toContain("WARNING");
    panel!.destroy();
  });

  it("does not warn once the tail is inside the collector's tolerance", () => {
    const { r } = mountWithDuration(768.768);
    addRally(r, "0.51", "10");
    addRally(r, "700", "760");
    expect(statusText(r)).not.toContain("WARNING");
    panel!.destroy();
  });

  it("shows nothing at all when the duration is unknown — never a guess", () => {
    const { r } = mountWithDuration(null);
    addRally(r, "1", "2");
    expect(statusText(r)).not.toContain("span)");
    panel!.destroy();
  });
});

const POLY = "0.2,0.5 0.8,0.5 0.95,0.98 0.05,0.98";

const profile = (over: Partial<TargetProfile> = {}): TargetProfile => ({
  camera_section_id: "s1",
  target_court_id: "3",
  camera_profile_id: null,
  play_volume_polygon: [[0.2, 0.5], [0.8, 0.5], [0.95, 0.98], [0.05, 0.98]],
  setup_validity: "supported",
  notes: null,
  ...over,
});

describe("target profile section", () => {
  function mountTarget(clip?: Partial<ClipMeta>) {
    const a = new Annotator();
    const saved: { clip?: ClipMeta; json?: string } = {};
    panel = mountPanel({
      annotator: a,
      video: new DirectVideoHandler(),
      identity: { key: "url:t", title: "T" },
      download: () => {},
      clip: { ...emptyClipMeta(), ...clip },
      persistClip: (c) => (saved.clip = { ...c, target_profiles: [...c.target_profiles] }),
      downloadClipMeta: (j) => (saved.json = j),
    });
    return { a, saved, r: shadow() };
  }

  function fill(r: ShadowRoot, poly = POLY, section = "s1", court = "3") {
    setField(r.querySelector("input[name=target-section]"), section);
    setField(r.querySelector("input[name=target-court]"), court);
    setField(r.querySelector("input[name=target-polygon]"), poly);
  }

  it("saves one profile per camera section", () => {
    const { saved, r } = mountTarget();
    fill(r);
    btn(r, "Save target profile").click();
    expect(saved.clip?.target_profiles).toHaveLength(1);
    expect(saved.clip?.target_profiles[0]).toMatchObject({ camera_section_id: "s1", target_court_id: "3" });
    expect(saved.json).toContain('"target_profiles"');
    panel!.destroy();
  });

  it("refuses pixel coordinates instead of coercing them", () => {
    const { saved, r } = mountTarget();
    fill(r, "120,540 880,540 1010,980 70,980");
    btn(r, "Save target profile").click();
    expect(statusText(r)).toContain("NORMALIZED");
    expect(saved.json).toBeUndefined();
    panel!.destroy();
  });

  it("refuses a missing section id, a missing court and a degenerate polygon", () => {
    const { saved, r } = mountTarget();
    fill(r, POLY, "", "3");
    btn(r, "Save target profile").click();
    expect(statusText(r)).toContain("Camera section ID is required");

    fill(r, POLY, "s1", "");
    btn(r, "Save target profile").click();
    expect(statusText(r)).toContain("Target court ID is required");

    fill(r, "0.1,0.1 0.9,0.1", "s1", "3");
    btn(r, "Save target profile").click();
    expect(statusText(r)).toContain("at least 3 points");
    expect(saved.json).toBeUndefined();
    panel!.destroy();
  });

  it("re-saving a section replaces it rather than duplicating", () => {
    const { saved, r } = mountTarget();
    fill(r);
    btn(r, "Save target profile").click();
    fill(r, POLY, "s1", "4");
    btn(r, "Save target profile").click();
    expect(saved.clip?.target_profiles).toHaveLength(1);
    expect(saved.clip?.target_profiles[0].target_court_id).toBe("4");
    panel!.destroy();
  });

  it("picks the play volume by clicking the video, normalized to its rendered box", () => {
    const a = new Annotator();
    const video = new DirectVideoHandler();
    const el = document.createElement("video");
    el.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 400, height: 200, right: 500, bottom: 250, x: 100, y: 50, toJSON: () => ({}) }) as DOMRect;
    document.body.append(el);
    video.findActive = () => el;
    const saved: { clip?: ClipMeta } = {};
    panel = mountPanel({
      annotator: a, video, identity: { key: "url:t", title: "T" },
      download: () => {},
      persistClip: (c) => (saved.clip = { ...c, target_profiles: [...c.target_profiles] }),
    });
    const r = shadow();
    const pick = btn(r, "Pick on video");
    pick.click();
    expect(statusText(r)).toContain("corners");
    // (300,150) is the centre of the 400x200 box at (100,50) -> 0.5, 0.5
    const at = (x: number, y: number) =>
      el.dispatchEvent(new MouseEvent("click", { clientX: x, clientY: y, bubbles: true }));
    at(300, 150);
    expect((r.querySelector("input[name=target-polygon]") as HTMLInputElement).value).toBe("0.500,0.500");
    at(180, 90);
    at(420, 90);
    at(460, 230);
    // four corners auto-stops the pick
    expect(pick.textContent).toBe("Pick on video");
    setField(r.querySelector("input[name=target-section]"), "s1");
    setField(r.querySelector("input[name=target-court]"), "3");
    btn(r, "Save target profile").click();
    expect(saved.clip?.target_profiles[0].play_volume_polygon).toHaveLength(4);
    el.remove();
    panel!.destroy();
  });

  it("a click outside the video box is ignored, and picking can be cancelled", () => {
    const a = new Annotator();
    const video = new DirectVideoHandler();
    const el = document.createElement("video");
    el.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    document.body.append(el);
    video.findActive = () => el;
    panel = mountPanel({ annotator: a, video, identity: { key: "url:t", title: "T" }, download: () => {} });
    const r = shadow();
    const pick = btn(r, "Pick on video");
    pick.click();
    el.dispatchEvent(new MouseEvent("click", { clientX: 500, clientY: 500, bubbles: true }));
    expect((r.querySelector("input[name=target-polygon]") as HTMLInputElement).value).toBe("");
    pick.click(); // cancel
    expect(pick.textContent).toBe("Pick on video");
    el.dispatchEvent(new MouseEvent("click", { clientX: 50, clientY: 50, bubbles: true }));
    expect((r.querySelector("input[name=target-polygon]") as HTMLInputElement).value).toBe("");
    el.remove();
    panel!.destroy();
  });

  it("reports when there is no video to pick on", () => {
    const { r } = mountTarget();
    btn(r, "Pick on video").click();
    expect(statusText(r)).toContain("No video");
    panel!.destroy();
  });

  it("clicking a listed profile loads it back into the fields", () => {
    const { r } = mountTarget({ target_profiles: [profile({ notes: "left rig" })] });
    (r.querySelector('[data-list=profiles] .item') as HTMLElement).click();
    expect((r.querySelector("input[name=target-section]") as HTMLInputElement).value).toBe("s1");
    expect((r.querySelector("input[name=target-polygon]") as HTMLInputElement).value)
      .toBe("0.200,0.500 0.800,0.500 0.950,0.980 0.050,0.980");
    expect((r.querySelector("input[name=target-notes]") as HTMLInputElement).value).toBe("left rig");
    panel!.destroy();
  });

  it("lists saved profiles and deletes the selected one", () => {
    const { saved, r } = mountTarget({ target_profiles: [profile()] });
    expect(r.querySelectorAll('[data-list=profiles] .item')).toHaveLength(1);
    (r.querySelector('[data-list=profiles] .item') as HTMLElement).click();
    btn(r, "Delete profile").click();
    expect(saved.clip?.target_profiles).toHaveLength(0);
    panel!.destroy();
  });
});

describe("sparse target-state review", () => {
  function mountReview(clip?: Partial<ClipMeta>) {
    const a = new Annotator();
    const saved: { rows?: ReviewRow[]; csv?: string } = {};
    panel = mountPanel({
      annotator: a,
      video: new DirectVideoHandler(),
      identity: { key: "url:t", title: "T" },
      download: () => {},
      clip: { ...emptyClipMeta(), ...clip },
      persistReviews: (rows) => (saved.rows = [...rows]),
      downloadReviews: (c) => (saved.csv = c),
    });
    return { a, saved, r: shadow() };
  }

  it("offers exactly three answers and nothing about a neighbouring court", () => {
    const { r } = mountReview({ target_profiles: [profile()] });
    const sel = r.querySelector("select[name=review-state]") as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value)).toEqual(["rallying", "not_rallying", "unclear"]);
    panel!.destroy();
  });

  it("refuses a review before any target profile exists", () => {
    const { saved, r } = mountReview();
    setField(r.querySelector("input[name=review-start]"), "412.5");
    setField(r.querySelector("input[name=review-end]"), "418.25");
    btn(r, "Save review").click();
    expect(statusText(r)).toContain("Save a target profile first");
    expect(saved.csv).toBeUndefined();
    panel!.destroy();
  });

  it("saves an answer against the camera section", () => {
    const { saved, r } = mountReview({ target_profiles: [profile()] });
    setField(r.querySelector("input[name=review-start]"), "412.5");
    setField(r.querySelector("input[name=review-end]"), "418.25");
    setField(r.querySelector("select[name=review-state]"), "not_rallying");
    btn(r, "Save review").click();
    expect(saved.csv).toContain("1,412.500,418.250,not_rallying,s1,operator,");
    expect(saved.rows).toHaveLength(1);
    panel!.destroy();
  });

  it("shows no quota or progress tally - this is sparse evidence, not a count gate", () => {
    const { r } = mountReview({ target_profiles: [profile()] });
    expect(statusText(r)).not.toMatch(/\/12|of 12/);
    expect((r.textContent || "")).not.toMatch(/\/12/);
    panel!.destroy();
  });

  it("surfaces a legacy neighborhood file as refused, not as data", () => {
    const a = new Annotator();
    panel = mountPanel({
      annotator: a,
      video: new DirectVideoHandler(),
      identity: { key: "url:t", title: "T" },
      download: () => {},
      clip: { ...emptyClipMeta(), target_profiles: [profile()] },
      legacyWindowsPresent: true,
    });
    const r = shadow();
    const note = [...r.querySelectorAll(".warn")].map((e) => e.textContent || "").join(" ");
    expect(note).toContain("NOT read");
    panel!.destroy();
  });

  it("the review track never touches the rally CSV", () => {
    let rallyCsv = "";
    const a = new Annotator();
    panel = mountPanel({
      annotator: a,
      video: new DirectVideoHandler(),
      identity: { key: "url:t", title: "T" },
      download: (c) => (rallyCsv = c),
      clip: { ...emptyClipMeta(), target_profiles: [profile()] },
      downloadReviews: () => {},
    });
    const r = shadow();
    setField(r.querySelector("input[name=review-start]"), "1");
    setField(r.querySelector("input[name=review-end]"), "2");
    btn(r, "Save review").click();
    expect(rallyCsv).toBe("");
    expect(a.rows).toHaveLength(0);
    panel!.destroy();
  });
});
