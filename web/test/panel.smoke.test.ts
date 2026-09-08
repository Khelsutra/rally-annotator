// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { mountPanel, type PanelHandle } from "../src/ui/panel";
import { Annotator } from "../src/state/annotator";
import { DirectVideoHandler } from "../src/video/directVideo";
import { emptyClipMeta, type ClipMeta } from "../src/state/clipmeta";

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
function fillGolden(r: ShadowRoot, shots = "1", reason = "winner") {
  setField(r.querySelector('input[placeholder="shots"]'), shots);
  setField(r.querySelector("select[name=reason]"), reason);
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
    expect(r.querySelector(".hdr .t")?.textContent).toBe("Rally Annotator v0.2.0");
    expect(r.querySelector("select[name=sport]")).toBeNull();
    expect(r.querySelector("[data-video-sport]")?.textContent).toBe("badminton");
    expect(r.querySelector("select[name=clip-sport]")).toBeTruthy();
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
    expect((r.querySelector("select[name=reason]") as HTMLSelectElement).value).toBe("");
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
    fillGolden(r);
    btn(r, "Save Rally").click();
    expect(a.rows).toHaveLength(1);

    btn(r, "Download complete").click();
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
    fillGolden(r);
    btn(r, "Save Rally").click();
    expect(a.rows).toHaveLength(1);
    expect(csv()).toContain("1,1.000,2.000");
    panel!.destroy();
  });

  it("requires only the per-video sport, not optional court metadata", () => {
    const a = new Annotator({ sport: null });
    let csv = "";
    panel = mountPanel({
      annotator: a, video: new DirectVideoHandler(), identity: { key: "url:t", title: "T" },
      download: (c) => (csv = c),
    });
    const r = shadow();
    setField(r.querySelector('input[placeholder="start s"]'), "1.0");
    setField(r.querySelector('input[placeholder="end s"]'), "2.0");
    fillGolden(r);
    btn(r, "Save Rally").click();
    expect(statusText(r)).toContain("Choose and save the video sport");
    expect(a.rows).toHaveLength(0);

    setField(r.querySelector("select[name=clip-sport]"), "table_tennis");
    btn(r, "Save clip info").click();
    btn(r, "Save Rally").click();
    expect(a.rows[0].sport).toBe("table_tennis");
    expect(csv).toContain("1,1.000,2.000,winner,table_tennis,1");
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

  it("visibly marks every legacy repair row and blocks golden download", () => {
    const a = new Annotator({
      rows: [
        { n: 1, s: 1, e: 2, reason: "forced_error", sport: "badminton", shots: "7", extra: null },
        { n: 2, s: 3, e: 4, reason: "winner", sport: "badminton", shots: null, extra: null },
      ],
    });
    let downloads = 0;
    panel = mountPanel({
      annotator: a, video: new DirectVideoHandler(), identity: { key: "url:t", title: "T" },
      download: () => downloads++,
    });
    const r = shadow();
    const items = r.querySelectorAll('[data-list=rallies] .item');
    expect(items).toHaveLength(2);
    expect([...items].every((item) => item.textContent?.includes("NEEDS REVIEW"))).toBe(true);
    (items[0] as HTMLElement).click();
    btn(r, "Edit").click();
    expect((r.querySelector("select[name=reason]") as HTMLSelectElement).selectedOptions[0].textContent)
      .toContain("legacy");
    btn(r, "Download complete").click();
    expect(downloads).toBe(0);
    expect(statusText(r)).toContain("Golden CSV download blocked");
    panel!.destroy();
  });

  it("does not expose Target, Review, or picker controls", () => {
    const { r } = mountUndeclared();
    const labels = [...r.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(labels).not.toContain("Target");
    expect(labels).not.toContain("Review");
    expect(r.querySelector("[name^=target-]")).toBeNull();
    expect(r.querySelector("[name^=review-]")).toBeNull();
    expect(r.textContent).not.toContain("Pick on video");
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

  it("opens once for a video with no sidecar, and remains skippable", () => {
    const { r } = mountClip();
    expect((r.querySelector(".sect") as HTMLElement).style.display).toBe("flex");
    btn(r, "Clip info").click();
    expect((r.querySelector(".sect") as HTMLElement).style.display).toBe("none");
    panel!.destroy();
  });

  it("records target identity plus courts VISIBLE and IN PLAY as separate fields", () => {
    const { saved, r } = mountClip();
    setField(r.querySelector("input[name=clip-courtsVisible]"), "2");
    setField(r.querySelector("input[name=clip-courtsActive]"), "1");
    setField(r.querySelector("input[name=clip-venue]"), "bxh_indiranagar");
    setField(r.querySelector("input[name=clip-targetCourt]"), "3");
    btn(r, "Save clip info").click();
    expect(saved.clip).toMatchObject({
      court_count: 2,
      active_court_count: 1,
      venue_id: "bxh_indiranagar",
      target_court_id: "3",
    });
    expect(saved.json).toContain('"target_court_id": "3"');
    expect(saved.json).toContain('"active_court_count": 1');
    panel!.destroy();
  });

  it("seeds camera setup suggestions but preserves free-text legacy ids", () => {
    const { saved, r } = mountClip();
    const camera = r.querySelector("input[name=clip-cameraSetup]") as HTMLInputElement;
    expect(camera.getAttribute("list")).toBe("rally-annotator-camera-setups");
    const values = [...r.querySelectorAll("datalist option")].map((o) => o.getAttribute("value"));
    expect(values).toEqual([
      "court-left-corner", "court-right-corner", "court-center", "court-side-middle",
    ]);
    setField(camera, "bxh-lowside-3court");
    btn(r, "Save clip info").click();
    expect(saved.clip?.camera_setup_id).toBe("bxh-lowside-3court");
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
      clip: { ...emptyClipMeta(), sport: "tennis", court_count: 4, active_court_count: 3 },
    });
    const r = shadow();
    expect((r.querySelector(".sect") as HTMLElement).style.display).toBe("none");
    expect((r.querySelector("input[name=clip-courtsVisible]") as HTMLInputElement).value).toBe("4");
    expect(r.querySelector("[data-video-sport]")?.textContent).toBe("tennis");
    expect((r.querySelector("select[name=clip-sport]") as HTMLSelectElement).value).toBe("tennis");
    panel!.destroy();
  });

  it("saving the video sport normalizes every existing rally row", () => {
    const rows = [
      { n: 1, s: 1, e: 2, reason: "winner", sport: "badminton", shots: null, extra: null },
      { n: 2, s: 3, e: 4, reason: "let", sport: "table_tennis", shots: null, extra: null },
    ];
    const a = new Annotator({ rows, sport: "badminton" });
    let saved: ClipMeta | undefined;
    panel = mountPanel({
      annotator: a,
      video: new DirectVideoHandler(),
      identity: { key: "url:t", title: "T" },
      download: () => {},
      persistClip: (clip) => (saved = { ...clip }),
    });
    const r = shadow();
    setField(r.querySelector("select[name=clip-sport]"), "pickleball");
    btn(r, "Save clip info").click();
    expect(a.rows.map((row) => row.sport)).toEqual(["pickleball", "pickleball"]);
    expect(saved?.sport).toBe("pickleball");
    expect(r.querySelector("[data-video-sport]")?.textContent).toBe("pickleball");
    expect(statusText(r)).toContain("Normalized 2 existing rally row");
    panel!.destroy();
  });

  it("does not save clip info when rally-row sport normalization fails", () => {
    const rows = [
      { n: 1, s: 1, e: 2, reason: "winner", sport: "badminton", shots: null, extra: null },
    ];
    const a = new Annotator({ rows, sport: "badminton", persist: () => ({ ok: false, err: "disk full" }) });
    let saved: ClipMeta | undefined;
    panel = mountPanel({
      annotator: a,
      video: new DirectVideoHandler(),
      identity: { key: "url:t", title: "T" },
      download: () => {},
      clip: { ...emptyClipMeta(), sport: "badminton" },
      persistClip: (clip) => (saved = { ...clip }),
    });
    const r = shadow();
    setField(r.querySelector("select[name=clip-sport]"), "pickleball");
    btn(r, "Save clip info").click();
    expect(statusText(r)).toContain("disk full");
    expect(a.sport).toBe("badminton");
    expect(a.rows[0].sport).toBe("badminton");
    expect(r.querySelector("[data-video-sport]")?.textContent).toBe("badminton");
    expect(saved).toBeUndefined();
    panel!.destroy();
  });

  it("refreshes a saved sidecar's completeness after every rally mutation", () => {
    const a = new Annotator();
    const video = new DirectVideoHandler();
    video.duration = () => 100;
    const json: string[] = [];
    panel = mountPanel({
      annotator: a,
      video,
      identity: { key: "url:t", title: "T" },
      download: () => {},
      clip: { ...emptyClipMeta(), sport: "badminton", target_court_id: "3" },
      downloadClipMeta: (j) => json.push(j),
    });
    const r = shadow();
    setField(r.querySelector('input[placeholder="start s"]'), "1");
    setField(r.querySelector('input[placeholder="end s"]'), "5");
    fillGolden(r);
    btn(r, "Save Rally").click();
    expect(JSON.parse(json.at(-1)!).label_completeness.rally_count).toBe(1);
    setField(r.querySelector('input[placeholder="start s"]'), "10");
    setField(r.querySelector('input[placeholder="end s"]'), "20");
    fillGolden(r);
    btn(r, "Save Rally").click();
    expect(JSON.parse(json.at(-1)!).label_completeness).toMatchObject({
      rally_count: 2,
      labelled_to_s: 20,
    });
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
    fillGolden(r);
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
