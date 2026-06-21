// In-page annotation panel — the browser analogue of the VLC dialog. Rendered into an
// OPEN Shadow DOM so the host page's CSS can't bleed in (and vice-versa) while still
// being reachable by automation/devtools (open vs closed only affects JS visibility of
// the root, not style encapsulation; "closed" is not a real security boundary). Reproduces
// the v1.6.4 widget set and wires it to the pure Annotator state machine and the video
// handler. Draggable; re-parents into the fullscreen element so it survives fullscreen.

import { Annotator, SPORTS, REASON_OPTIONS } from "../state/annotator";
import type { DirectVideoHandler } from "../video/directVideo";
import type { VideoIdentity } from "../persist/store";
import { VERSION } from "../version";

export interface PanelDeps {
  annotator: Annotator;
  video: DirectVideoHandler;
  identity: VideoIdentity;
  download: (csv: string) => void;
}

export interface PanelHandle {
  toggle(): void;
  destroy(): void;
}

// mm:ss.mmm for display (matches the Lua fmt_clock).
function fmtClock(s: number | null): string {
  if (s == null) return "--:--";
  if (s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(3).padStart(6, "0")}`;
}

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, sans-serif; }
.card {
  position: fixed; top: 16px; right: 16px; width: 340px; z-index: 2147483647;
  background: #1e1f22; color: #e6e6e6; border: 1px solid #444; border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0,0,0,.5); font-size: 12px; user-select: none;
}
.hdr { display: flex; align-items: center; gap: 6px; padding: 7px 9px; cursor: move;
  background: #2b2d31; border-radius: 8px 8px 0 0; }
.hdr .t { font-weight: 600; flex: 1; }
.hdr button { cursor: pointer; }
.body { padding: 9px; display: flex; flex-direction: column; gap: 7px; }
.row { display: flex; gap: 6px; align-items: center; }
.row > * { min-width: 0; }
label { color: #aab; white-space: nowrap; }
input, select, button {
  font-size: 12px; background: #2b2d31; color: #e6e6e6; border: 1px solid #555;
  border-radius: 5px; padding: 4px 6px;
}
input { width: 100%; }
button { cursor: pointer; background: #3a3d44; }
button:hover { background: #474b54; }
button.primary { background: #2f6f4f; border-color: #3c8a63; }
button.primary:hover { background: #38805c; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.status { background: #15161a; border: 1px solid #333; border-radius: 5px; padding: 6px;
  line-height: 1.45; min-height: 52px; color: #cfd3da; }
.list { background: #15161a; border: 1px solid #333; border-radius: 5px; height: 122px;
  overflow-y: auto; }
.list .item { padding: 3px 6px; cursor: pointer; border-bottom: 1px solid #232427;
  white-space: nowrap; }
.list .item:hover { background: #25262b; }
.list .item.sel { background: #2f4a6f; }
.help { background: #15161a; border: 1px solid #333; border-radius: 5px; padding: 7px;
  line-height: 1.5; max-height: 260px; overflow-y: auto; color: #cfd3da; }
.mini { font-size: 11px; color: #8b90a0; }
`;

const HELP_HTML = `
<b>Rally Annotator (web) — how to use</b><br>
1. Pick the <b>Sport</b> (stays set).<br>
2. <b>Back 5s / Play&nbsp;/&nbsp;Pause / Fwd 5s</b> drive the page's video from here.<br>
3. At a rally's start click <b>Mark START</b> (pause/scrub first for accuracy); at its end
click <b>Mark END</b>. Fine-tune the Start/End seconds by editing the fields.<br>
4. Choose the <b>Ending reason</b> (or leave it <b>unknown</b>), optionally type a
<b>Number of shots</b>, then <b>Save Rally</b> — the full CSV downloads.<br>
5. Reason &amp; shots RESET after each save (never silently reused); Sport stays.<br>
6. <b>Recent rallies</b>: click a row, then <b>Edit</b> / <b>Delete</b>. <b>Undo last</b>
removes the most recent row, clears an in-progress mark, or cancels an edit.<br>
7. Rallies autosave to extension storage keyed to this video, so reloading the page resumes
numbering. The CSV lands in your <b>Downloads</b> folder (it can't be written next to a web video).<br>
<br><b>Reasons:</b> winner · forced_error · unforced_error · service_fault · let · other ·
unknown (default). All but <i>winner</i> are charged to the side that lost the rally.
`;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v as string;
    else (e as any)[k] = v;
  }
  for (const kid of kids) e.append(kid as any);
  return e;
}

export function mountPanel(deps: PanelDeps): PanelHandle {
  const { annotator: a, video, download } = deps;

  const host = document.createElement("div");
  host.style.all = "initial";
  const root = host.attachShadow({ mode: "open" });
  root.append(h("style", { textContent: STYLE }));

  const card = h("div", { class: "card" });
  root.append(card);

  // ---- header (drag handle) ----
  const titleEl = h("span", { class: "t", textContent: `🏸 Rally Annotator v${VERSION}` });
  const helpBtn = h("button", { textContent: "Help", title: "Toggle help" });
  const hideBtn = h("button", { textContent: "—", title: "Hide panel" });
  const hdr = h("div", { class: "hdr" }, titleEl, helpBtn, hideBtn);
  card.append(hdr);

  const body = h("div", { class: "body" });
  card.append(body);

  // ---- sport ----
  const sportSel = h("select", { title: "Sport", name: "sport" }) as HTMLSelectElement;
  for (const s of SPORTS) sportSel.append(h("option", { value: s, textContent: s }));
  sportSel.value = a.sport;
  body.append(h("div", { class: "row" }, h("label", { textContent: "Sport:" }), sportSel));

  // ---- playback ----
  const backBtn = h("button", { textContent: "« Back 5s" });
  const playBtn = h("button", { textContent: "Play / Pause" });
  const fwdBtn = h("button", { textContent: "Fwd 5s »" });
  body.append(h("div", { class: "row" }, backBtn, playBtn, fwdBtn));

  // ---- start / end ----
  const startIn = h("input", { placeholder: "start s" }) as HTMLInputElement;
  const endIn = h("input", { placeholder: "end s" }) as HTMLInputElement;
  body.append(
    h("div", { class: "row" },
      h("label", { textContent: "Start:" }), startIn,
      h("label", { textContent: "End:" }), endIn)
  );

  // ---- next # / shots ----
  const nextIn = h("input", { placeholder: "next #" }) as HTMLInputElement;
  const shotsIn = h("input", { placeholder: "shots" }) as HTMLInputElement;
  body.append(
    h("div", { class: "row" },
      h("label", { textContent: "Next #:" }), nextIn,
      h("label", { textContent: "Shots:" }), shotsIn)
  );

  // ---- reason ----
  const reasonSel = h("select", { title: "Ending reason", name: "reason" }) as HTMLSelectElement;
  for (const r of REASON_OPTIONS) reasonSel.append(h("option", { value: r, textContent: r }));
  body.append(h("div", { class: "row" }, h("label", { textContent: "Reason:" }), reasonSel));

  // ---- mark / save ----
  const markStartBtn = h("button", { textContent: "Mark START" });
  const markEndBtn = h("button", { textContent: "Mark END" });
  const saveBtn = h("button", { class: "primary", textContent: "Save Rally" });
  body.append(h("div", { class: "grid2" }, markStartBtn, markEndBtn));
  body.append(h("div", { class: "row" }, saveBtn));

  // ---- status ----
  const status = h("div", { class: "status" });
  body.append(status);

  // ---- help (hidden by default) ----
  const help = h("div", { class: "help" });
  help.innerHTML = HELP_HTML;
  help.style.display = "none";
  body.append(help);

  // ---- recent list ----
  body.append(h("div", { class: "mini", textContent: "Recent rallies (click one, then Edit/Delete):" }));
  const list = h("div", { class: "list" });
  body.append(list);

  // ---- actions ----
  const editBtn = h("button", { textContent: "Edit" });
  const delBtn = h("button", { textContent: "Delete" });
  const undoBtn = h("button", { textContent: "Undo last" });
  const refreshBtn = h("button", { textContent: "Refresh" });
  const dlBtn = h("button", { textContent: "Download CSV" });
  body.append(h("div", { class: "grid2" }, editBtn, delBtn));
  body.append(h("div", { class: "grid2" }, undoBtn, refreshBtn));
  body.append(h("div", { class: "row" }, dlBtn));

  // ---- state ----
  let selectedN: number | null = null;
  let lastMsg = "Ready. Pick the Sport, then mark rallies. Click Help for usage.";

  function setStatus(msg: string) {
    lastMsg = msg;
    render();
  }

  function render() {
    // fields
    startIn.value = a.startField;
    endIn.value = a.endField;
    nextIn.value = a.nextField;
    shotsIn.value = a.shotsField;
    reasonSel.value = a.reason;
    sportSel.value = a.sport;
    // labels
    markStartBtn.textContent = a.markStartLabel();
    markEndBtn.textContent = a.markEndLabel();
    saveBtn.textContent = a.saveLabel();
    undoBtn.textContent = a.undoLabel();
    // status
    const modeLine =
      a.mode === "edit" && a.editIndex != null && a.rows[a.editIndex]
        ? `Mode: EDITING #${a.rows[a.editIndex].n} (Save changes / Undo cancels).`
        : "Mode: new rally (Mark START, Mark END, reason, Save Rally).";
    const last = a.lastRow();
    const lastLine = last
      ? `Last row (Undo removes): #${last.n} ${esc(fmtClock(last.s))} → ${esc(fmtClock(last.e))} [${esc(last.reason)}]<br>`
      : "";
    status.innerHTML =
      `${esc(lastMsg)}<br>${esc(modeLine)}<br>${lastLine}` +
      `Now: ${esc(fmtClock(video.now()))} &nbsp;|&nbsp; Rallies: ${a.rows.length}<br>` +
      `<span class="mini">CSV → Downloads · key: ${esc(deps.identity.key)}</span>`;
    // list
    list.replaceChildren();
    for (const r of a.rows) {
      const shotsTxt = r.shots != null ? `  ${r.shots} shots` : "";
      const item = h("div", {
        class: "item" + (r.n === selectedN ? " sel" : ""),
        textContent: `#${r.n}  ${fmtClock(r.s)} → ${fmtClock(r.e)}  [${r.reason}, ${r.sport}]${shotsTxt}`,
      });
      item.addEventListener("click", () => {
        selectedN = r.n;
        render();
      });
      list.append(item);
    }
  }

  // ---- wiring ----
  startIn.addEventListener("input", () => {
    a.startField = startIn.value;
    render();
  });
  endIn.addEventListener("input", () => {
    a.endField = endIn.value;
    render();
  });
  nextIn.addEventListener("input", () => {
    a.nextField = nextIn.value;
    render();
  });
  shotsIn.addEventListener("input", () => {
    a.shotsField = shotsIn.value;
  });
  reasonSel.addEventListener("change", () => {
    a.reason = reasonSel.value;
  });
  sportSel.addEventListener("change", () => {
    a.sport = sportSel.value;
  });

  backBtn.addEventListener("click", () => setStatus(video.seekBy(-5) ? "Seek -5s." : "No video to seek."));
  fwdBtn.addEventListener("click", () => setStatus(video.seekBy(5) ? "Seek +5s." : "No video to seek."));
  playBtn.addEventListener("click", () => {
    const st = video.playPause();
    setStatus(st === "playing" ? "Resumed." : st === "paused" ? "Paused." : "No video loaded.");
  });

  markStartBtn.addEventListener("click", () => setStatus(a.markStart(video.now()).status));
  markEndBtn.addEventListener("click", () => setStatus(a.markEnd(video.now()).status));
  saveBtn.addEventListener("click", () => {
    const res = a.saveRally();
    if (res.ok) download(a.toCSV()); // download the full CSV on each save (per design)
    setStatus(res.status);
  });

  editBtn.addEventListener("click", () => setStatus(a.editSelected(selectedN).status));
  delBtn.addEventListener("click", () => {
    const res = a.deleteSelected(selectedN);
    if (res.ok) selectedN = null;
    setStatus(res.status + (res.ok ? "  (click Download CSV to refresh the file)" : ""));
  });
  undoBtn.addEventListener("click", () => setStatus(a.undoLast().status));
  refreshBtn.addEventListener("click", () => {
    video.findActive();
    setStatus(video.hasVideo() ? "Refreshed (video re-detected)." : "No video found on this page yet.");
  });
  dlBtn.addEventListener("click", () => {
    download(a.toCSV());
    setStatus(`Downloaded CSV (${a.rows.length} rallies).`);
  });

  helpBtn.addEventListener("click", () => {
    const showing = help.style.display !== "none";
    help.style.display = showing ? "none" : "block";
    helpBtn.textContent = showing ? "Help" : "Hide help";
  });
  hideBtn.addEventListener("click", () => api.toggle());

  // ---- dragging ----
  let drag: { x: number; y: number; left: number; top: number } | null = null;
  hdr.addEventListener("mousedown", (e) => {
    const rect = card.getBoundingClientRect();
    card.style.right = "auto";
    card.style.left = rect.left + "px";
    card.style.top = rect.top + "px";
    drag = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
    e.preventDefault();
  });
  const onMove = (e: MouseEvent) => {
    if (!drag) return;
    card.style.left = drag.left + (e.clientX - drag.x) + "px";
    card.style.top = drag.top + (e.clientY - drag.y) + "px";
  };
  const onUp = () => {
    drag = null;
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);

  // ---- live clock ----
  const clock = window.setInterval(render, 333);

  // ---- fullscreen re-parent (so the panel survives fullscreen video; desktop) ----
  const onFs = () => {
    const fe = document.fullscreenElement;
    if (fe && !fe.contains(host)) fe.append(host);
    else if (!fe && host.parentElement !== document.body) document.body.append(host);
  };
  document.addEventListener("fullscreenchange", onFs);

  document.body.append(host);
  render();

  const api: PanelHandle = {
    toggle() {
      host.style.display = host.style.display === "none" ? "" : "none";
    },
    destroy() {
      window.clearInterval(clock);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.removeEventListener("fullscreenchange", onFs);
      host.remove();
    },
  };
  return api;
}
