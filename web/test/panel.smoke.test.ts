// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { mountPanel, type PanelHandle } from "../src/ui/panel";
import { Annotator } from "../src/state/annotator";
import { DirectVideoHandler } from "../src/video/directVideo";

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
