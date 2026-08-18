// In-page annotation panel — the browser analogue of the VLC dialog. Rendered into an
// OPEN Shadow DOM so the host page's CSS can't bleed in (and vice-versa) while still
// being reachable by automation/devtools ("closed" is not a real security boundary).
// Every user-facing string goes through the English message catalog (keys-not-prose);
// reason/sport VALUES stay canonical when written to CSV.

import { Annotator, SPORTS, REASON_OPTIONS, canonicalSport, type Msg } from "../state/annotator";
import type { DirectVideoHandler } from "../video/directVideo";
import type { VideoIdentity } from "../persist/store";
import { VERSION } from "../version";
import { t } from "../i18n";
import {
  CAMERA_SETUP_IDS, MATCH_FORMATS, SPAN_WARN, TAIL_WARN_S, completeness, emptyClipMeta, optText,
  parseCount, serializeClipMeta, validateClipMeta, type ClipMeta,
} from "../state/clipmeta";
import type { ReviewRow } from "../state/targetReview";

export interface PanelDeps {
  annotator: Annotator;
  video: DirectVideoHandler;
  identity: VideoIdentity;
  download: (csv: string) => void;
  clip?: ClipMeta; // capture metadata + target profiles already recorded for this video
  reviews?: ReviewRow[]; // sparse target-state answers already recorded for this video
  legacyWindowsPresent?: boolean; // a withdrawn-design windows.csv exists; refused, never read
  downloadClipMeta?: (json: string) => void;
  downloadReviews?: (csv: string) => void;
  persistClip?: (clip: ClipMeta) => void;
  persistReviews?: (rows: ReviewRow[]) => void;
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

// Translate a Msg, mapping canonical reason/sport params to their display labels.
function tMsg(m: Msg): string {
  let p = m.params;
  if (p && (typeof p.reason === "string" || typeof p.sport === "string")) {
    p = { ...p };
    if (typeof p.reason === "string") p.reason = t("reason." + p.reason);
    if (typeof p.sport === "string") p.sport = t("sport." + p.sport);
  }
  return t(m.key, p);
}

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, sans-serif; }
.card {
  position: fixed; top: 16px; right: 16px; width: 340px; z-index: 2147483647;
  background: #1e1f22; color: #e6e6e6; border: 1px solid #444; border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0,0,0,.5); font-size: 12px; user-select: none;
  /* Expanding the clip-info or window section can make the card taller than the window;
     without this the Save button below the fold is unreachable on a laptop screen. */
  max-height: calc(100vh - 32px); overflow-y: auto;
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
.sect { display: flex; flex-direction: column; gap: 6px; padding: 7px; border: 1px solid #333;
  border-radius: 5px; background: #17181c; }
.warn { color: #f0b36b; }
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
  const titleEl = h("span", { class: "t" });
  const helpBtn = h("button", { title: "Toggle help" });
  const hideBtn = h("button", { textContent: "—", title: "Hide panel" });
  const hdr = h("div", { class: "hdr" }, titleEl, helpBtn, hideBtn);
  card.append(hdr);

  const body = h("div", { class: "body" });
  card.append(body);

  // ---- sport ----
  const sportLabel = h("label");
  const sportValue = h("span", { class: "mini" });
  sportValue.dataset.videoSport = "true";
  body.append(h("div", { class: "row" }, sportLabel, sportValue));

  // ---- playback ----
  const backBtn = h("button");
  const playBtn = h("button");
  const fwdBtn = h("button");
  body.append(h("div", { class: "row" }, backBtn, playBtn, fwdBtn));

  // ---- start / end ----
  const startLabel = h("label");
  const startIn = h("input", { name: "start" }) as HTMLInputElement;
  const endLabel = h("label");
  const endIn = h("input", { name: "end" }) as HTMLInputElement;
  body.append(h("div", { class: "row" }, startLabel, startIn, endLabel, endIn));

  // ---- next # / shots ----
  const nextLabel = h("label");
  const nextIn = h("input", { name: "next" }) as HTMLInputElement;
  const shotsLabel = h("label");
  const shotsIn = h("input", { name: "shots" }) as HTMLInputElement;
  body.append(h("div", { class: "row" }, nextLabel, nextIn, shotsLabel, shotsIn));

  // ---- reason ----
  const reasonLabel = h("label");
  const reasonSel = h("select", { name: "reason" }) as HTMLSelectElement;
  for (const r of REASON_OPTIONS) reasonSel.append(h("option", { value: r }));
  body.append(h("div", { class: "row" }, reasonLabel, reasonSel));

  // ---- mark / save ----
  const markStartBtn = h("button");
  const markEndBtn = h("button");
  const saveBtn = h("button", { class: "primary" });
  body.append(h("div", { class: "grid2" }, markStartBtn, markEndBtn));
  body.append(h("div", { class: "row" }, saveBtn));

  // ---- status ----
  const status = h("div", { class: "status" });
  body.append(status);

  // ---- help (hidden by default) ----
  const help = h("div", { class: "help" });
  help.style.display = "none";
  body.append(help);

  // ---- recent list ----
  const recentLabel = h("div", { class: "mini" });
  body.append(recentLabel);
  const list = h("div", { class: "list" });
  list.dataset.list = "rallies";
  body.append(list);

  // ---- actions ----
  const editBtn = h("button");
  const delBtn = h("button");
  const undoBtn = h("button");
  const refreshBtn = h("button");
  const dlBtn = h("button");
  body.append(h("div", { class: "grid2" }, editBtn, delBtn));
  body.append(h("div", { class: "grid2" }, undoBtn, refreshBtn));
  body.append(h("div", { class: "row" }, dlBtn));

  // ---- clip info (collapsed: the rally flow stays the front door) ----
  // Target/review editors are intentionally not exposed. Existing profile/review data still loads
  // through the compatibility model, but the operator only labels rallies for the video's largest,
  // most visually focused court.
  const clipToggle = h("button");
  body.append(h("div", { class: "row" }, clipToggle));

  // Clip info. Every input starts EMPTY unless something was recorded, and an empty input
  // is written as null ("not screened") — never 0, never a plausible default.
  const clipBox = h("div", { class: "sect" });
  // First-open intake: a video without saved clip metadata opens this optional section once
  // when the panel is mounted. It remains collapsible and never gates the rally controls above.
  clipBox.style.display = deps.clip ? "none" : "flex";
  const clipSportLabel = h("label");
  const clipSportSel = h("select", { name: "clip-sport" }) as HTMLSelectElement;
  clipSportSel.append(h("option", { value: "" }));
  for (const sport of SPORTS) clipSportSel.append(h("option", { value: sport }));
  clipBox.append(h("div", { class: "row" }, clipSportLabel, clipSportSel));
  const clipFields: Record<string, HTMLInputElement> = {};
  const clipLabels: Record<string, HTMLLabelElement> = {};
  for (const f of ["venue", "targetCourt", "cameraSetup", "courtsVisible", "courtsActive",
                   "courtsPartial", "notes"]) {
    const lab = h("label");
    const inp = h("input", { name: `clip-${f}` }) as HTMLInputElement;
    clipLabels[f] = lab;
    clipFields[f] = inp;
    clipBox.append(h("div", { class: "row" }, lab, inp));
  }
  const cameraOptions = h("datalist", { id: "rally-annotator-camera-setups" });
  for (const setup of CAMERA_SETUP_IDS) cameraOptions.append(h("option", { value: setup }));
  clipFields.cameraSetup.setAttribute("list", cameraOptions.id);
  clipBox.append(cameraOptions);
  const fmtLabel = h("label");
  const fmtSel = h("select", { name: "clip-matchFormat" }) as HTMLSelectElement;
  fmtSel.append(h("option", { value: "" })); // "(not set)" first => the default writes null
  for (const f of MATCH_FORMATS) fmtSel.append(h("option", { value: f }));
  clipBox.append(h("div", { class: "row" }, fmtLabel, fmtSel));
  // Capture time is READ-ONLY on purpose: there is no box to type a date into, because an
  // operator-typed date is exactly the "folder says May 19, container says May 21" failure
  // this sidecar exists to prevent. A web page exposes no container tags at all.
  const capLabel = h("label");
  const capValue = h("span", { class: "mini" });
  clipBox.append(h("div", { class: "row" }, capLabel, capValue));
  const saveClipBtn = h("button", { class: "primary" });
  clipBox.append(h("div", { class: "row" }, saveClipBtn));
  body.append(clipBox);

  // ---- state ----
  let selectedN: number | null = null;
  let lastMsg: Msg = { key: "status.ready" };
  const clip: ClipMeta = {
    ...emptyClipMeta(),
    ...deps.clip,
    target_profiles: [...(deps.clip?.target_profiles ?? [])],
  };
  const declaredSport = canonicalSport(clip.sport);
  clip.sport = declaredSport;
  if (declaredSport) a.sport = declaredSport;
  let clipSidecarSaved = deps.clip != null;

  function setStatus(m: Msg) {
    lastMsg = m;
    render();
  }

  // Static English labels, option labels, placeholders, fixed buttons, and help.
  function applyText() {
    titleEl.textContent = `${t("panel.title")} v${VERSION}`;
    sportLabel.textContent = t("label.sport");
    clipSportLabel.textContent = t("label.sport");
    clipSportSel.options[0].textContent = t("fmt.unset");
    for (const o of Array.from(clipSportSel.options).slice(1)) o.textContent = t("sport." + o.value);
    backBtn.textContent = t("btn.back5");
    playBtn.textContent = t("btn.playPause");
    fwdBtn.textContent = t("btn.fwd5");
    startLabel.textContent = t("label.start");
    endLabel.textContent = t("label.end");
    nextLabel.textContent = t("label.next");
    shotsLabel.textContent = t("label.shots");
    startIn.placeholder = t("ph.start");
    endIn.placeholder = t("ph.end");
    nextIn.placeholder = t("ph.next");
    shotsIn.placeholder = t("ph.shots");
    reasonLabel.textContent = t("label.reason");
    for (const o of Array.from(reasonSel.options)) o.textContent = t("reason." + o.value);
    editBtn.textContent = t("btn.edit");
    delBtn.textContent = t("btn.delete");
    refreshBtn.textContent = t("btn.refresh");
    dlBtn.textContent = t("btn.downloadCsv");
    recentLabel.textContent = t("label.recent");
    help.innerHTML = t("help.html");
    clipToggle.textContent = t("btn.clipInfo");
    clipLabels.venue.textContent = t("label.venue");
    clipLabels.targetCourt.textContent = t("label.targetCourt");
    clipLabels.cameraSetup.textContent = t("label.cameraSetup");
    clipLabels.courtsVisible.textContent = t("label.courtsVisible");
    clipLabels.courtsActive.textContent = t("label.courtsActive");
    clipLabels.courtsPartial.textContent = t("label.courtsPartial");
    clipLabels.notes.textContent = t("label.notes");
    fmtLabel.textContent = t("label.matchFormat");
    fmtSel.options[0].textContent = t("fmt.unset");
    for (const f of MATCH_FORMATS) {
      const o = Array.from(fmtSel.options).find((x) => x.value === f);
      if (o) o.textContent = t("fmt." + f);
    }
    capLabel.textContent = t("label.captureTime");
    capValue.textContent = t("clip.captureUnknown");
    saveClipBtn.textContent = t("btn.saveClip");
  }

  // The completeness readout — the same formula and the same thresholds the collector
  // blocks on, so a half-finished pass is caught here rather than at import.
  function coverageHtml(): string {
    const c = completeness(a.rows, video.duration());
    if (!c) return "";
    let out =
      "<br>" +
      esc(t("cov.line", {
        to: c.labelled_to_s.toFixed(1), dur: c.video_duration_s.toFixed(1),
        pct: (c.label_span_coverage * 100).toFixed(1),
        tail: c.tail_unlabelled_s.toFixed(1), gap: c.largest_unlabelled_gap_s.toFixed(1),
      }));
    if (c.tail_unlabelled_s > TAIL_WARN_S) {
      out += `<br><span class="warn">${esc(t("cov.tail", { tail: c.tail_unlabelled_s.toFixed(1), limit: TAIL_WARN_S }))}</span>`;
    } else if (c.label_span_coverage < SPAN_WARN) {
      out += "<br>" + esc(t("cov.span", { limit: Math.round(SPAN_WARN * 100) }));
    }
    return out;
  }

  function render() {
    // fields
    startIn.value = a.startField;
    endIn.value = a.endField;
    nextIn.value = a.nextField;
    shotsIn.value = a.shotsField;
    reasonSel.value = a.reason;
    sportValue.textContent = a.sport ? t("sport." + a.sport) : t("fmt.unset");
    // state-dependent labels
    markStartBtn.textContent = tMsg(a.markStartLabel());
    markEndBtn.textContent = tMsg(a.markEndLabel());
    saveBtn.textContent = tMsg(a.saveLabel());
    undoBtn.textContent = tMsg(a.undoLabel());
    helpBtn.textContent = help.style.display === "none" ? t("btn.help") : t("btn.hideHelp");
    // status
    const editing = a.mode === "edit" && a.editIndex != null ? a.rows[a.editIndex] : null;
    const last = a.lastRow();
    const lines = [
      tMsg(lastMsg),
      editing ? t("status.modeEdit", { n: editing.n }) : t("status.modeNew"),
    ];
    if (last) {
      lines.push(
        tMsg({
          key: "status.lastRow",
          params: { n: last.n, s: fmtClock(last.s), e: fmtClock(last.e), reason: last.reason },
        })
      );
    }
    lines.push(t("status.footer", { now: fmtClock(video.peekNow()), count: a.rows.length }));
    status.innerHTML =
      lines.map(esc).join("<br>") +
      coverageHtml() +
      `<br><span class="mini">${esc(t("status.csvLine", { key: deps.identity.key }))}</span>`;
    // list
    list.replaceChildren();
    for (const r of a.rows) {
      const shotsTxt = r.shots != null ? `  ${r.shots} ${t("ph.shots")}` : "";
      const item = h("div", {
        class: "item" + (r.n === selectedN ? " sel" : ""),
        textContent: `#${r.n}  ${fmtClock(r.s)} → ${fmtClock(r.e)}  [${t("reason." + r.reason)}, ${t("sport." + r.sport)}]${shotsTxt}`,
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
  backBtn.addEventListener("click", () =>
    setStatus({ key: video.seekBy(-5) ? "status.seekBack" : "status.noVideoSeek" })
  );
  fwdBtn.addEventListener("click", () =>
    setStatus({ key: video.seekBy(5) ? "status.seekFwd" : "status.noVideoSeek" })
  );
  playBtn.addEventListener("click", () => {
    const st = video.playPause();
    setStatus({ key: st === "playing" ? "status.resumed" : st === "paused" ? "status.paused" : "status.noVideoLoaded" });
  });

  // Rally labels are never gated on court metadata. The target court is the largest, most
  // visually focused court in the video and is derived downstream.
  markStartBtn.addEventListener("click", () => setStatus(a.markStart(video.now())));
  markEndBtn.addEventListener("click", () => setStatus(a.markEnd(video.now())));
  saveBtn.addEventListener("click", () => {
    const res = a.saveRally();
    if (res.ok) {
      download(a.toCSV()); // download the full CSV on each save (per design)
      refreshSavedClipSidecar();
    }
    setStatus(res);
  });

  editBtn.addEventListener("click", () => setStatus(a.editSelected(selectedN)));
  delBtn.addEventListener("click", () => {
    const res = a.deleteSelected(selectedN);
    if (res.ok) {
      selectedN = null;
      refreshSavedClipSidecar();
    }
    setStatus(res);
  });
  undoBtn.addEventListener("click", () => {
    const res = a.undoLast();
    if (res.ok) refreshSavedClipSidecar();
    setStatus(res);
  });
  refreshBtn.addEventListener("click", () => {
    video.findActive();
    setStatus({ key: video.hasVideo() ? "status.refreshedVideo" : "status.noVideoFound" });
  });
  dlBtn.addEventListener("click", () => {
    download(a.toCSV());
    setStatus({ key: "status.downloaded", params: { count: a.rows.length } });
  });

  // ---- clip info ----
  function loadClipFields() {
    clipSportSel.value = clip.sport ?? a.sport ?? "";
    clipFields.venue.value = clip.venue_id ?? "";
    clipFields.targetCourt.value = clip.target_court_id ?? "";
    clipFields.cameraSetup.value = clip.camera_setup_id ?? "";
    clipFields.courtsVisible.value = clip.court_count != null ? String(clip.court_count) : "";
    clipFields.courtsActive.value = clip.active_court_count != null ? String(clip.active_court_count) : "";
    clipFields.courtsPartial.value =
      clip.partially_visible_court_count != null ? String(clip.partially_visible_court_count) : "";
    clipFields.notes.value = clip.notes ?? "";
    fmtSel.value = clip.match_format ?? "";
  }
  loadClipFields();

  function writeClipSidecar() {
    deps.persistClip?.(clip);
    deps.downloadClipMeta?.(
      serializeClipMeta(clip, {
        clipName: deps.identity.title || null,
        generator: `rally-annotator-web/${VERSION}`,
        completeness: completeness(a.rows, video.duration()),
      })
    );
  }

  function refreshSavedClipSidecar() {
    if (clipSidecarSaved) writeClipSidecar();
  }

  saveClipBtn.addEventListener("click", () => {
    const selectedSport = canonicalSport(clipSportSel.value);
    if (selectedSport == null) {
      setStatus({ key: "status.needVideoSport" });
      return;
    }
    const previousClip = { ...clip };
    const counts: Array<[string, string, number]> = [
      ["courtsVisible", "label.courtsVisible", 1],
      ["courtsActive", "label.courtsActive", 1],
      ["courtsPartial", "label.courtsPartial", 0],
    ];
    const parsed: Record<string, number | null> = {};
    for (const [field, labelKey, min] of counts) {
      const r = parseCount(clipFields[field].value, min);
      if ("invalid" in r) {
        setStatus({ key: "clip.invalidNumber", params: { field: t(labelKey), min } });
        return;
      }
      parsed[field] = r.value;
    }
    clip.venue_id = optText(clipFields.venue.value);
    clip.target_court_id = optText(clipFields.targetCourt.value);
    clip.camera_setup_id = optText(clipFields.cameraSetup.value);
    clip.notes = optText(clipFields.notes.value);
    clip.court_count = parsed.courtsVisible;
    clip.active_court_count = parsed.courtsActive;
    clip.partially_visible_court_count = parsed.courtsPartial;
    clip.match_format = fmtSel.value === "" ? null : fmtSel.value;
    clip.sport = selectedSport;

    const issue = validateClipMeta(clip);
    if (issue) {
      setStatus(issue);
      return;
    }
    const sportResult = a.setVideoSport(selectedSport);
    if (!sportResult.ok) {
      Object.assign(clip, previousClip);
      setStatus(sportResult);
      return;
    }
    clipSidecarSaved = true;
    writeClipSidecar();
    setStatus({
      key: sportResult.normalized > 0 ? "clip.savedNormalized" : "clip.saved",
      params: {
        summary: `${clip.court_count ?? "?"}/${clip.active_court_count ?? "?"} courts`,
        count: sportResult.normalized,
        sport: selectedSport,
      },
    });
  });

  clipToggle.addEventListener("click", () => {
    clipBox.style.display = clipBox.style.display === "none" ? "flex" : "none";
  });

  helpBtn.addEventListener("click", () => {
    help.style.display = help.style.display === "none" ? "block" : "none";
    render();
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

  // ---- live clock (only ticks while the panel is visible) ----
  let clock: number | null = null;
  const startClock = () => {
    if (clock == null) clock = window.setInterval(render, 333);
  };
  const stopClock = () => {
    if (clock != null) {
      window.clearInterval(clock);
      clock = null;
    }
  };

  // ---- fullscreen re-parent (so the panel survives fullscreen video; desktop) ----
  const onFs = () => {
    const fe = document.fullscreenElement;
    if (fe && !fe.contains(host)) fe.append(host);
    else if (!fe && host.parentElement !== document.body) document.body.append(host);
  };
  document.addEventListener("fullscreenchange", onFs);

  document.body.append(host);
  applyText();
  render();

  const api: PanelHandle = {
    toggle() {
      const willShow = host.style.display === "none";
      host.style.display = willShow ? "" : "none";
      if (willShow) startClock();
      else stopClock();
    },
    destroy() {
      stopClock();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.removeEventListener("fullscreenchange", onFs);
      host.remove();
    },
  };
  return api;
}
