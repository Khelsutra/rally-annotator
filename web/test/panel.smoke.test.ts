// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { mountPanel, type PanelHandle } from "../src/ui/panel";
import { Annotator } from "../src/state/annotator";
import { DirectVideoHandler } from "../src/video/directVideo";
import { emptyClipMeta, type ClipMeta } from "../src/state/clipmeta";
import type { WindowRow } from "../src/state/windows";

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
    expect(r.querySelectorAll(".item")).toHaveLength(1);
    expect(r.querySelector(".item")!.textContent).toContain("#1");
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
    (r.querySelector(".item") as HTMLElement).click();
    btn(r, "Edit").click();
    expect(a.mode).toBe("edit");
    btn(r, "Undo").click();
    expect(a.mode).toBe("new");

    // select + delete
    (r.querySelector(".item") as HTMLElement).click();
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
      clip: { ...emptyClipMeta(), court_count: 4, active_court_count: 3, target_court_id: "c1" },
    });
    const r = shadow();
    expect((r.querySelector("input[name=clip-courtsVisible]") as HTMLInputElement).value).toBe("4");
    expect((r.querySelector("input[name=clip-targetCourt]") as HTMLInputElement).value).toBe("c1");
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

describe("window track section", () => {
  function mountWin(clip?: Partial<ClipMeta>) {
    const a = new Annotator();
    const saved: { rows?: WindowRow[]; csv?: string } = {};
    panel = mountPanel({
      annotator: a,
      video: new DirectVideoHandler(),
      identity: { key: "url:t", title: "T" },
      download: () => {},
      clip: { ...emptyClipMeta(), ...clip },
      persistWindows: (w) => (saved.rows = [...w]),
      downloadWindows: (c) => (saved.csv = c),
    });
    return { a, saved, r: shadow() };
  }

  it("refuses to save a window before the target court is known", () => {
    const { saved, r } = mountWin();
    setField(r.querySelector("input[name=win-start]"), "12.5");
    setField(r.querySelector("input[name=win-end]"), "18.25");
    btn(r, "Save window").click();
    expect(statusText(r)).toContain("Target court ID");
    expect(saved.csv).toBeUndefined();
    panel!.destroy();
  });

  it("saves a labelled interval into its own CSV, stamped with the target court", () => {
    const { saved, r } = mountWin({ target_court_id: "c1" });
    setField(r.querySelector("input[name=win-start]"), "12.5");
    setField(r.querySelector("input[name=win-end]"), "18.25");
    setField(r.querySelector("select[name=win-label]"), "adjacent_court_rally");
    setField(r.querySelector("input[name=win-notes]"), "left neighbour");
    btn(r, "Save window").click();
    expect(saved.csv).toContain("1,12.500,18.250,adjacent_court_rally,c1,left neighbour");
    expect(saved.rows).toHaveLength(1);
    panel!.destroy();
  });

  it("tolerates reversed marks and refuses a zero-length window", () => {
    const { saved, r } = mountWin({ target_court_id: "c1" });
    setField(r.querySelector("input[name=win-start]"), "9");
    setField(r.querySelector("input[name=win-end]"), "9");
    btn(r, "Save window").click();
    expect(statusText(r)).toContain("later than");
    setField(r.querySelector("input[name=win-start]"), "20");
    setField(r.querySelector("input[name=win-end]"), "15");
    btn(r, "Save window").click();
    expect(saved.csv).toContain("1,15.000,20.000,");
    panel!.destroy();
  });

  it("shows a live per-label tally against the 12-of-each target", () => {
    const { r } = mountWin({ target_court_id: "c1" });
    const tallyEl = [...r.querySelectorAll(".mini")].find((e) => (e.textContent || "").includes("0/12"));
    expect(tallyEl).toBeTruthy();
    setField(r.querySelector("input[name=win-start]"), "1");
    setField(r.querySelector("input[name=win-end]"), "2");
    setField(r.querySelector("select[name=win-label]"), "simultaneous_rallies");
    btn(r, "Save window").click();
    expect([...r.querySelectorAll(".mini")].some((e) => (e.textContent || "").includes("1/12"))).toBe(true);
    panel!.destroy();
  });

  it("undo clears an in-progress mark, then drops the last saved window", () => {
    const { saved, r } = mountWin({ target_court_id: "c1" });
    setField(r.querySelector("input[name=win-start]"), "1");
    setField(r.querySelector("input[name=win-end]"), "2");
    btn(r, "Save window").click();
    setField(r.querySelector("input[name=win-start]"), "5");
    const undo = [...r.querySelectorAll("button")].filter((b) => b.textContent === "Undo last").pop()!;
    undo.click();
    expect(statusText(r)).toContain("Cleared");
    undo.click();
    expect(saved.rows).toHaveLength(0);
    undo.click();
    expect(statusText(r)).toContain("No windows");
    panel!.destroy();
  });

  it("the window track never touches the rally CSV", () => {
    let rallyCsv = "";
    const a = new Annotator();
    panel = mountPanel({
      annotator: a,
      video: new DirectVideoHandler(),
      identity: { key: "url:t", title: "T" },
      download: (c) => (rallyCsv = c),
      clip: { ...emptyClipMeta(), target_court_id: "c1" },
      downloadWindows: () => {},
    });
    const r = shadow();
    setField(r.querySelector("input[name=win-start]"), "1");
    setField(r.querySelector("input[name=win-end]"), "2");
    btn(r, "Save window").click();
    expect(rallyCsv).toBe("");
    expect(a.rows).toHaveLength(0);
    panel!.destroy();
  });
});
