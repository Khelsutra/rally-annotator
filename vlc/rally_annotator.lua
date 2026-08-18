--[[ rally_annotator.lua  --  VLC Lua EXTENSION (v2.3.1)

  Rally Annotator for NET-SEPARATED RACQUET SPORTS
  (badminton · tennis · table tennis · pickleball · padel)

  While watching a match in VLC, mark each rally's START / END and the point-stop
  reason, and append one CSV row per rally. Pause/scrub freely, then click — the
  callback snapshots the exact playback time. Output is a plain CSV that ingests
  directly into common rally-segmentation tooling.

  Output CSV columns (times in decimal SECONDS):
      rally_number,start_time,end_time,ending_reason,sport,shots_count

  WHAT'S NEW IN v2.3.1
    - Sport is selected once in Clip info and shown read-only on the rally screen.
      Every CSV row remains a compatibility projection of that video-level value.
    - Mixed legacy rows and CSV/clipmeta disagreement fail closed until Clip info
      explicitly normalizes all rows to the chosen sport.
    - The tool is English-only; translated catalogs and language controls are removed.

  WHAT'S NEW IN v2.2.0
    - clipmeta.json is now additive version 3: target_court_id is restored as a
      one-time declarative clip property while legacy target_profiles stay readable.
    - Camera setup offers the owner orientation vocabulary with free-text fallback.
    - A clip with no sidecar opens the optional Clip info screen once; rally marking
      remains immediately available and never waits on metadata.
    - New clips prefill declarative fields from a sibling sidecar in the same folder.
      Prefill is never auto-saved.
    - Whenever rally rows change, an existing sidecar is rewritten with freshly
      computed label_completeness so a mid-pass snapshot cannot remain stale.

  WHAT'S NEW IN v2.1.0
    - Rally annotation is NEVER gated on court metadata. The target is the largest,
      most focused court in the video and is derived downstream. The manual TARGET,
      REVIEW, and image-picker workflow has been removed from the annotator.
      Existing target metadata is still preserved for backward compatibility.
    - A self-intersecting play volume is refused: a bowtie passes every per-point
      check and has a MEANINGLESS area (its lobes cancel), so it would poison any
      coverage comparison built on it.

  WHAT'S NEW IN v2.0.0  (target-first correction)
    - The neighborhood WINDOW track is REMOVED. Nothing in this tool asks the
      operator to identify or time a rally on a surrounding court: that turned the
      neighbours into an exhaustive annotation problem, and the complete
      prominent-match timeline already makes every non-target instant an implicit
      negative. Only the prominent target match is indexed.
    - New TARGET screen: one persistent target profile per static camera section
      (camera_section_id, target_court_id, camera_profile_id, a play-volume polygon
      NORMALIZED to the frame, and setup_validity supported/unsupported/unclear).
      Invalid geometry or a missing identity FAILS CLOSED -- it is refused, never
      coerced (docs/TARGET_REVIEW.md).
    - New REVIEW screen: sparse target-state answers to <video>.target-review.csv,
      with exactly three answers -- rallying / not_rallying / unclear -- all about
      the TARGET court. No quota, no tally, no sweep.
    - clipmeta.json is now version 2 (adds target_profiles, drops the top-level
      target_court_id). A v1 file is read and upgraded on the next save; its old
      target_court_id is offered as the first profile's default and never promoted
      automatically.
    - A legacy <video>.windows.csv is DETECTED AND REFUSED: never read, never
      converted, never imported. It is diagnostic material from a withdrawn design.

  WHAT'S NEW IN v1.8.1
    - Fix (data safety): Refresh repointed the CSV/sidecar paths at the newly
      playing video but did NOT repaint the Clip info / Windows screens, so their
      boxes still showed the PREVIOUS video's values. Saving then wrote video A's
      venue/court counts into video B's clipmeta.json. Refresh now rebuilds those
      screens from the freshly loaded state, and a video switch drops the
      in-progress fields instead of carrying them across.

  WHAT'S NEW IN v1.8.0
    - Three screens, switched from a nav row at the top: RALLIES (unchanged),
      CLIP INFO, and WINDOWS.
    - CLIP INFO writes <video>.clipmeta.json -- the per-clip facts the operator
      knows while labelling and nobody can reconstruct later: venue, camera setup,
      courts VISIBLE vs courts IN PLAY (two separate fields on purpose), how many
      are only partly in frame, target court id, match format, notes. Every field
      stays UNSET until set: a blank writes null, never a guess (see
      docs/CLIP_METADATA.md).
    - WINDOWS writes <video>.windows.csv -- a second track of time intervals tagged
      target_rally / adjacent_court_rally / simultaneous_rallies /
      target_court_non_rally / empty. (REMOVED in v2.0.0 -- see above.)
    - The status panel now carries a LABEL-COMPLETENESS readout (span coverage +
      unlabelled tail), warning at the same thresholds the collector blocks on, so
      a half-finished pass is caught while annotating rather than at import.
    - Switching screens no longer discards the in-progress Start/End.

  WHAT'S NEW IN v1.6.4
    - Guard against silently losing unsaved work: once a rally is fully marked
      (START + END) but not yet saved, clicking Mark START (new rally) or Edit
      selected is REFUSED with a prompt to Save Rally or Undo last first.
    - While editing an existing rally, the Mark buttons relabel to
      "Re-mark START/END (#N)" so it's obvious they change THAT rally, not a new one.

  WHAT'S NEW IN v1.6.3
    - The version now shows next to the plugin name in VLC's "Active Extensions"
      list (Tools > Plugins and extensions), e.g. "Rally Annotator v1.6.3" --
      VLC shows the descriptor title verbatim, so the version is baked into it.

  WHAT'S NEW IN v1.6.2
    - Fix (data safety on resume): if the extension was enabled BEFORE the video
      was loaded, the CSV path fell back to ~/rally_labels.csv and rallies were
      written there instead of next to the video -- so on pause/restart the
      video's labels looked "lost". Now the moment you Mark START (video is
      provably playing), the tool adopts <video>.rallies.csv and loads any
      rallies already saved for it.

  WHAT'S NEW IN v1.6.1
    - Fix: the Recent rallies list now shows EVERY rally (it scrolls), not just
      the most recent 12 -- so the oldest rallies (e.g. #1) are no longer hidden
      and can still be selected for Edit/Delete.

  WHAT'S NEW IN v1.6
    - Playback is now a single PLAY / PAUSE toggle (was separate Play/Resume +
      Pause), so the playback row is just Back 5s / Play / Pause / Fwd 5s.
    - New optional "Number of shots" field -> a shots_count column appended to
      the CSV (blank when you don't fill it; older CSVs still load fine).

  WHAT'S NEW IN v1.3
    - In-dialog HELP button: usage + an ending-reason decision guide, rendered
      inside the extension's own dialog (see "WHERE HELP LIVES" below).
    - Two-step commit: Mark END now ARMS a rally; you pick the (required) reason
      and click "Save Rally" to write it. The reason is RESET after every save,
      so it can never silently reuse the previous rally's reason.
    - Editable Start/End fields (fine-tune the marked seconds before saving).
    - "Recent rallies" list with Edit selected / Delete selected, plus Undo last.

  WHERE HELP LIVES (VLC internals, verified against the 3.0.x source):
    The empty "About <name>.lua" window under Tools > Plugins and extensions >
    Add-ons is VLC's AddonInfoDialog; its body text ("Lua script") is a hardcoded
    constant supplied by VLC's filesystem addon scanner (modules/misc/addons/
    fsstorage.c) and CANNOT be set by an extension. The descriptor() shortdesc/
    description below DO show, but in a different place — the "More information"
    dialog reached from the *Active Extensions* tab. For real, author-controlled
    help we therefore render it INSIDE this extension's dialog (the HELP button).

  WHY a button-dialog (not an auto-pause hook):
    VLC 3.x can expose pause via the {"playing-listener"} capability
    (status_changed/playing_changed), but that callback is flaky on macOS
    (VLC #22778) and the input/meta listeners are broken in VLC 4.0 (#27558).
    A persistent dialog whose button callbacks SNAPSHOT the current playback
    time is portable, precise, and lets the rater pause/scrub before committing.
    So we declare NO listener capabilities.

  UNITS: playback time is MICROSECONDS on VLC 3.x and 4.x -> /1e6 for seconds.
    VLC 3: vlc.var.get(input,"time"); VLC 4: vlc.player.get_time().

  Widget grid args are (col, row, colspan, rowspan), 1-indexed.

  Install (Windows): copy this file to
      %APPDATA%\vlc\lua\extensions\rally_annotator.lua
    macOS:  ~/Library/Application Support/org.videolan.vlc/lua/extensions/
    Linux:  ~/.local/share/vlc/lua/extensions/
  then VLC > Tools > Plugins and extensions > Reload extensions (or restart),
  then enable it from the View menu.

  MIT licensed. https://github.com/Khelsutra/rally-annotator
]]

--------------------------------------------------------------------------------
-- Extension registration
--------------------------------------------------------------------------------
local VERSION = "2.3.1"

function descriptor()
  return {
    -- VLC's "Active Extensions" list shows the title VERBATIM (it never appends the
    -- version), so we bake the version into the title -- same as VLsub -- to show it
    -- next to the plugin name there. Fed by VERSION so it can't drift. (Concatenation
    -- only: descriptor() runs in VLC's restricted scan sandbox, which has no globals.)
    title       = "Rally Annotator v" .. VERSION,
    version     = VERSION,
    author      = "Avi Dullu",
    url         = "https://github.com/Khelsutra/rally-annotator",
    shortdesc   = "Mark rally start/end + a point-ending reason to a CSV (net-separated racquet sports)",
    description =
        "Mark each rally's START and END while you watch, tag WHY the point ended "
     .. "(unknown / winner / forced_error / unforced_error / service_fault / let / other), and append "
     .. "one CSV row per rally next to the video "
     .. "(rally_number,start_time,end_time,ending_reason,sport,shots_count; decimal seconds). "
     .. "Built-in Play/Pause + seek so you never leave the window; "
     .. "two-step Save (Mark END, then Save Rally) with a non-sticky reason (defaults to unknown); "
     .. "editable times; edit or delete recent rallies; resumable numbering. "
     .. "For badminton/tennis/table-tennis/pickleball/padel. "
     .. "Click the HELP button inside the dialog for usage + an ending-reason decision guide.",
    capabilities = {}   -- button-click model: no listeners needed
  }
end

--------------------------------------------------------------------------------
-- Config / constants
--------------------------------------------------------------------------------
-- Net-separated racquet sports share a forced/unforced-error point-stop taxonomy.
-- "unknown" is the default/reset value: a real, savable reason meaning "not yet
-- classified" (so a forgotten pick records 'unknown', never the previous rally's reason).
local REASON_DEFAULT = "unknown"
local REASONS = {
  "winner", "forced_error", "unforced_error", "service_fault", "let", "other"
}
local SPORTS = {
  "badminton", "tennis", "table_tennis", "pickleball", "padel"
}
local HEADER = "rally_number,start_time,end_time,ending_reason,sport,shots_count\n"

-- Sparse TARGET-STATE review (docs/TARGET_REVIEW.md). One question about one interval:
-- was the TARGET court rallying? These three answers are the whole vocabulary -- there is
-- deliberately no way to say anything about a surrounding court, because the operator is
-- never asked to identify or time one.
local REVIEW_HEADER =
  "review_number,start_time,end_time,target_state,camera_section_id,source,notes\n"
local TARGET_STATES = { "rallying", "not_rallying", "unclear" }

-- Whether a static camera section is one the target-first pipeline can serve. "unclear" is a
-- real, recordable answer: more useful than a guessed "supported".
local SETUP_VALIDITY = { "supported", "unsupported", "unclear" }

-- The withdrawn neighborhood vocabulary. Kept ONLY to recognise a legacy file and refuse it --
-- never to offer it. A `target_rally` window was a sampled span under a contract that no
-- longer exists; a `rallying` review is an answer to a mined question. Equating them would
-- launder withdrawn assumptions into new training truth.
local LEGACY_WINDOW_MARKERS = { "window_label", "adjacent_court_rally", "simultaneous_rallies" }

-- Format played on the TARGET court. "" is a real, savable choice meaning NOT SET -- it
-- writes JSON null, so a forgotten pick can never record a guessed format.
local MATCH_FORMATS = { "singles", "doubles", "mixed" }
local CAMERA_SETUP_IDS = {
  "court-left-corner", "court-right-corner", "court-center", "court-side-middle"
}
local CLIPMETA_VERSION = 3
local CLIPMETA_TOP_LEVEL_KEYS = {
  clipmeta_version = true, generator = true, clip_name = true, sport = true,
  venue_id = true, target_court_id = true, camera_setup_id = true,
  capture_time_utc = true, capture_time_source = true, court_count = true,
  active_court_count = true, partially_visible_court_count = true,
  match_format = true, notes = true, target_profiles = true, label_completeness = true,
}

-- Label-completeness thresholds, copied from sports-data-collector's report spec so the
-- readout here and the gate there cannot disagree (src/reporting/spec.yaml):
--   labels_truncated  severity=error  tail_unlabelled_s  > 120
--   label_span_low    severity=warn   label_span_coverage < 0.9
local TAIL_WARN_S = 120
local SPAN_WARN = 0.9

-- reason/sport -> id lookups. POPULATED IN activate(), NOT here: VLC scans an
-- extension's descriptor() in a restricted Lua sandbox that lacks base globals
-- like ipairs, so calling ipairs at top level makes the whole extension fail to
-- load (it then never appears under the View menu).
local REASON_ID = {}
local SPORT_ID = {}

--------------------------------------------------------------------------------
-- English message catalog. Keys keep callbacks free of duplicated prose, while reason/sport
-- DATA values written to CSV remain the canonical identifiers declared above.
--------------------------------------------------------------------------------
STRINGS = {
  ["en"] = {
    ["label.sport"] = "Sport:",
    ["btn.saveTarget"] = "Save target profile",
    ["btn.deleteProfile"] = "Delete profile",
    ["btn.saveReview"] = "Save review",
    ["btn.saveReviewN"] = "Save review (#{n})",
    ["label.cameraSection"] = "Camera section ID:",
    ["label.cameraProfile"] = "Camera profile ID:",
    ["label.polygon"] = "Play volume (x,y 0-1):",
    ["label.setupValidity"] = "Setup validity:",
    ["label.profiles"] = "Target profiles (click one to load it):",
    ["label.targetState"] = "Was the target rallying?",
    ["label.recentReviews"] = "Reviews (click one, then Delete):",
    ["validity.supported"] = "supported",
    ["validity.unsupported"] = "unsupported",
    ["validity.unclear"] = "unclear",
    ["state.rallying"] = "rallying",
    ["state.not_rallying"] = "not rallying",
    ["state.unclear"] = "unclear",
    ["target.volumeSummary"] = "Play volume: {n} corners covering {pct}% of the frame.",
    ["target.volumeEmpty"] = "No play volume recorded.",
    ["target.volumeInvalid"] = "Play volume is not usable yet — {why}",
    ["target.saved"] = "Saved target profile '{section}' ({n}-point play volume, {pct}% of frame).",
    ["target.deleted"] = "Deleted target profile '{section}'.",
    ["target.needSelect"] = "Click a target profile in the list first.",
    ["target.needSection"] = "Camera section ID is required - it identifies the static section this profile describes.",
    ["target.needCourt"] = "Target court ID is required - use the number the venue paints on the court.",
    ["target.duplicateSection"] = "Camera section '{section}' already has a target profile - re-saving replaces it.",
    ["target.polygonSyntax"] = "Play volume must be points like '0.21,0.55 0.78,0.55 0.94,0.98 0.06,0.98'.",
    ["target.polygonTooFewPoints"] = "A play volume needs at least 3 points (4 for the usual quadrilateral).",
    ["target.polygonRange"] = "Play-volume coordinates are NORMALIZED: every x and y must be between 0 and 1, not pixels.",
    ["target.polygonSelfIntersecting"] = "The play volume crosses itself — its corners are out of order, so it encloses nothing. Re-pick them going around the court.",
    ["target.needProfile"] = "Save a target profile first - a review answers a question about one camera section.",
    ["review.saved"] = "Saved review #{n}: {s} → {e} [{state}].",
    ["review.deleted"] = "Deleted review #{n}. {count} remaining.",
    ["review.removed"] = "Removed last review #{n}. {count} remaining.",
    ["review.nothing"] = "No reviews to remove.",
    ["legacy.windowsPresent"] = "A legacy neighborhood window file exists for this clip. It is diagnostic material only: it is NOT read, converted or imported here.",
    ["nav.target"] = "Target",
    ["nav.review"] = "Review",
    ["btn.loadProfile"] = "Load selected",
    ["target.loaded"] = "Loaded target profile '{section}'. Edit the fields, then Save target profile.",
    ["target.mode"] = "Target profiles: {count} saved. One per static camera section.",
    ["review.mode"] = "Sparse review: answer whether the TARGET court was rallying. No quota, no sweep.",
    ["nav.rallies"] = "Rallies",
    ["nav.clip"] = "Clip info",
    ["label.venue"] = "Venue ID:",
    ["label.cameraSetup"] = "Camera setup ID:",
    ["label.courtsVisible"] = "Courts visible:",
    ["label.courtsActive"] = "Courts in play:",
    ["label.courtsPartial"] = "Only partly visible:",
    ["label.targetCourt"] = "Target court ID:",
    ["label.matchFormat"] = "Match format:",
    ["label.captureTime"] = "Capture time (UTC):",
    ["label.notes"] = "Notes:",
    ["fmt.unset"] = "(not set)",
    ["fmt.singles"] = "singles",
    ["fmt.doubles"] = "doubles",
    ["fmt.mixed"] = "mixed",
    ["btn.saveClip"] = "Save clip info",
    ["clip.saved"] = "Saved clip info: {summary}",
    ["clip.sportNormalized"] = "Normalized {count} existing rally row(s) to the video sport {sport}.",
    ["clip.savedNoFormat"] = "Saved clip info: {summary} — but MATCH FORMAT is still (not set), so this clip records no singles/doubles. Pick one and save again; leave it only if you genuinely cannot tell.",
    ["clip.savedPickerWins"] = "The camera vocabulary selection was saved; the simultaneous free-text camera value was not. Clear the picker first to save a custom value.",
    ["clip.loaded"] = "Loaded the clip info already recorded for this video.",
    ["clip.prefilled"] = "Prefilled from sibling {source}. Review and save; nothing was written automatically.",
    ["clip.invalidActive"] = "Courts in play ({active}) cannot exceed courts visible ({visible}) -- a court cannot be in play without being in frame.",
    ["clip.invalidPartial"] = "Only-partly-visible ({partial}) cannot exceed courts visible ({visible}).",
    ["clip.invalidNumber"] = "{field} needs a whole number of {min} or more -- or leave it BLANK to record 'not screened'.",
    ["clip.captureUnknown"] = "(not readable here -- probed from the container at import)",
    ["cov.line"] = "Labelled to {to}s of {dur}s ({pct}% span)  |  unlabelled tail {tail}s  |  largest gap {gap}s",
    ["cov.tail"] = "WARNING: {tail}s at the END carry no labels. If play continues there, this pass is unfinished (import blocks over {limit}s).",
    ["cov.span"] = "Note: labels span under {limit}% of the clip -- expected for a long idle outro, a red flag for an interrupted pass.",
    ["cov.unknown"] = "Clip duration unknown -- no completeness readout (never guessed).",
    ["label.start"] = "Start (s):",
    ["label.end"] = "End (s):",
    ["label.next"] = "Next rally #:",
    ["label.shots"] = "Number of shots:",
    ["label.reason"] = "Ending reason:",
    ["label.recent"] = "Recent rallies (select one, then Edit/Delete):",
    ["btn.help"] = "Help",
    ["btn.hideHelp"] = "Hide help",
    ["btn.back5"] = "Back 5s",
    ["btn.playPause"] = "Play / Pause",
    ["btn.fwd5"] = "Fwd 5s",
    ["btn.markStart"] = "Mark START",
    ["btn.markEnd"] = "Mark END",
    ["btn.reMarkStart"] = "Re-mark START (#{n})",
    ["btn.reMarkEnd"] = "Re-mark END (#{n})",
    ["btn.saveRally"] = "Save Rally",
    ["btn.saveRallyN"] = "Save Rally (#{n})",
    ["btn.saveChangesN"] = "Save changes (#{n})",
    ["btn.edit"] = "Edit selected",
    ["btn.delete"] = "Delete selected",
    ["btn.undo"] = "Undo last",
    ["btn.undoCancelEdit"] = "Undo last (cancel edit)",
    ["btn.undoClearMark"] = "Undo last (clear mark)",
    ["btn.undoN"] = "Undo last (#{n})",
    ["btn.refresh"] = "Refresh",
    ["reason.unknown"] = "unknown",
    ["reason.winner"] = "winner",
    ["reason.forced_error"] = "forced error",
    ["reason.unforced_error"] = "unforced error",
    ["reason.service_fault"] = "service fault",
    ["reason.let"] = "let",
    ["reason.other"] = "other",
    ["sport.badminton"] = "badminton",
    ["sport.tennis"] = "tennis",
    ["sport.table_tennis"] = "table tennis",
    ["sport.pickleball"] = "pickleball",
    ["sport.padel"] = "padel",
    ["status.modeEdit"] = "Mode: EDITING rally #{n}  (Save changes to commit, Undo last to cancel).",
    ["status.modeNew"] = "Mode: new rally  (Mark START, Mark END, choose reason, Save Rally).",
    ["status.lastRow"] = "Last row (what Undo removes): #{n}  {start} -> {end}  [{reason}]",
    ["status.footer"] = "Now: {clock}  |  Rallies in CSV: {count}",
    ["status.csvPath"] = "CSV: {path}",
    ["seek.noMedia"] = "No media playing -- cannot seek.",
    ["seek.noTime"] = "No playback time available to seek from.",
    ["seek.done"] = "Seek {delta}s  ->  {clock}.",
    ["markStart.noMedia"] = "No media playing -- cannot mark START.",
    ["markStart.armed"] = "You have an UNSAVED rally (START -> END). Click 'Save Rally' to keep it, or 'Undo last' to clear it, before marking a new START. (You can also edit the Start field by hand.)",
    ["markStart.set"] = "START set @ {clock}. Play to the rally's end, then Mark END.",
    ["markEnd.noMedia"] = "No media playing -- cannot mark END.",
    ["markEnd.set"] = "END set @ {clock}. Choose the Ending reason, then click Save Rally.",
    ["save.needStart"] = "Set a START time first (click Mark START).",
    ["save.needVideoSport"] = "Choose and save the video sport in Clip info before saving rallies.",
    ["save.mixedVideoSport"] = "Existing rally rows disagree with the video sport. Open Clip info and save the correct sport to normalize them.",
    ["save.needEnd"] = "Set an END time first (click Mark END).",
    ["save.zeroLen"] = "END must be later than START (rally must be > 0s).",
    ["save.writeFailed"] = "WRITE FAILED: {err}",
    ["save.updated"] = "Updated rally #{n}: {start} -> {end}  [{reason}, {sport}{shots}].",
    ["save.duplicate"] = "Rally #{n} already exists -- set \"Next rally #\" to a free number.",
    ["save.saved"] = "Saved rally #{n}: {start} -> {end}  [{reason}, {sport}{shots}].",
    ["edit.armedGuard"] = "Finish the current rally ('Save Rally') or clear it ('Undo last') before editing another -- your unsaved START -> END would be lost.",
    ["edit.needSelect"] = "Pick a rally in the Recent list first, then Edit selected.",
    ["edit.notFound"] = "Rally #{n} not found (try Refresh).",
    ["edit.editing"] = "Editing rally #{n}. Adjust Start/End/reason, then Save changes. (Undo last cancels.)",
    ["del.needSelect"] = "Pick a rally in the Recent list first, then Delete selected.",
    ["del.deleted"] = "Deleted rally #{n}. {count} remaining.",
    ["undo.cancelled"] = "Edit cancelled.",
    ["undo.cleared"] = "Cleared the in-progress START/END (nothing was written).",
    ["undo.nothing"] = "Nothing to undo.",
    ["undo.removed"] = "Removed last rally #{n}. {count} remaining.",
    ["play.paused"] = "Paused. Annotate (or fine-tune Start/End), then Play / Pause to resume.",
    ["play.resumed"] = "Resumed playback.",
    ["play.started"] = "Started playback.",
    ["play.noMedia"] = "No media loaded to play.",
    ["sync.editFirst"] = "Finish (Save changes) or cancel (Undo last) the current edit before refreshing.",
    ["sync.noMedia"] = "No media is playing -- still using this CSV. Open the video, then click Refresh.",
    ["sync.refreshed"] = "Refreshed. {count} rallies loaded for this video.",
    ["sync.switched"] = "Switched to the current video. Loaded {count} existing rallies; next is #{n}.",
    ["activate.fallback"] = "No video detected yet. Open/play the video, then click Mark START -- the tool will switch to that video's own .rallies.csv automatically (and load any rallies already saved for it). Tip: open the video FIRST, then enable this extension.",
    ["activate.resumed"] = "Resumed this video: {count} existing rallies loaded (next is #{n}). Click Help for the guide.",
    ["activate.ready"] = "Ready. Set and save the video Sport in Clip info, then mark rallies. Click Help for usage + the ending-reason guide.",
    ["help.html"] = "<b>Rally Annotator &mdash; how to use</b><br>\n<b>Playback:</b> the <b>Back 5s / Play / Pause / Fwd 5s</b> row drives the VLC player from here &mdash; <b>Play / Pause</b> is one toggle (pause, annotate, and resume without switching to the main VLC window).<br>\n1. Open <b>Clip info</b>, choose the video <b>Sport</b>, and click <b>Save clip info</b>. Sport is one setting for the whole video.<br>\n2. When a rally begins, click <b>Mark START</b> (pause/scrub first for frame accuracy &mdash; it snapshots the current playback time into the Start field).<br>\n3. When the rally ends, click <b>Mark END</b>. You may fine-tune the Start/End seconds by editing those fields directly.<br>\n4. Choose the <b>Ending reason</b> (the box between <b>Mark END</b> and <b>Save Rally</b>; or leave it as <b>unknown</b>), optionally type a <b>Number of shots</b> (the rally's shot/stroke count &mdash; leave blank to skip), then click <b>Save Rally</b> &mdash; one CSV row is written next to the video.<br>\n5. The reason RESETS to <b>unknown</b> after every save (never silently reused), and you can pick the same reason on consecutive rallies.<br>\n6. <b>Recent rallies</b>: select a row, then <b>Edit selected</b> (loads it back into the fields) or <b>Delete selected</b>. <b>Undo last</b> removes the most recent row (the button shows which, e.g. <i>Undo last (#7)</i>), or clears an in-progress mark, or cancels an edit.<br>\n7. <b>Resuming later:</b> labels are saved to the CSV next to the video as you go. Re-open the SAME video and enable the extension &mdash; it reloads your existing rallies and continues numbering. Set the <b>Next rally #</b> field to resume numbering from any value (e.g. restart at 1, or continue from 50); it auto-advances after each save. If you switch videos with this dialog open, click <b>Refresh</b> to load the current video's rallies. (The video's playback position is not restored &mdash; scrub to where you stopped.)<br>\n<br>\n<b>Ending reasons &mdash; what they mean (pick the one that says WHY the rally ended).</b><br>\nAll reasons except <i>winner</i> are charged to the side that LOST the rally.<br>\n&bull; <b>winner</b> &mdash; the last shot landed IN and was not returned (opponent couldn't reach it, or only waved at it). A clean untouched serve (ace) counts here.<br>\n&bull; <b>forced_error</b> &mdash; the loser MISSED (out, or into the net) while UNDER PRESSURE: stretched, rushed, jammed, or handling the opponent's pace/spin/depth. They were made to miss.<br>\n&bull; <b>unforced_error</b> &mdash; the loser MISSED a routine shot they had time AND position to make, with little or no pressure. They gave it away.<br>\n&bull; <b>service_fault</b> &mdash; the point ended on the SERVE: serve into the net, out of the service box, illegal action/foot fault, or a double fault (tennis/padel).<br>\n&bull; <b>let</b> &mdash; the rally is REPLAYED under the rules (no point): e.g. a tennis/table-tennis serve that clips the net and is otherwise good, or outside interference.<br>\n&bull; <b>other</b> &mdash; anything else (occluded footage, injury/retirement, penalty, hindrance). Use sparingly.<br>\n&bull; <b>unknown</b> &mdash; the default; this rally hasn't been classified yet (pick a specific reason when you can).<br>\n<br>\n<b>Quick cases</b><br>\n&bull; Ball/shuttle lands <b>OUT</b> (past the baseline / outside the lines): it is the hitter's miss &mdash; <b>forced</b> if they were under pressure, <b>unforced</b> if it was a comfortable ball. (OUT is NOT automatically forced, and never a winner for the opponent.)<br>\n&bull; <b>Into the net</b> during a rally: same &mdash; forced if pressured, unforced if routine. A <b>serve</b> into the net is <b>service_fault</b>.<br>\n&bull; <b>Net-cord that dribbles over and lands in</b>: live and good &mdash; usually a <b>winner</b> if unreachable, else judge what happens next. On the SERVE it varies by sport: tennis/table-tennis = <b>let</b> (replay); badminton net-tick that passes over and lands in = play on (but a serve shuttle CAUGHT on the net = service_fault); pickleball (2026) = play on.<br>\n&bull; <b>Unsure forced vs unforced?</b> Default to <b>unforced</b> &mdash; only mark forced when you can point to the specific pressure.<br>\n<br>\nOutput: <i>&lt;video&gt;.rallies.csv</i> next to the video. Full guide: docs/ENDING_REASONS.md in the repo.<br>\nClick <b>Hide help</b> to return to the status panel.",
  },
}

-- t(key, vars): English catalog -> raw key, with {var} interpolation. gsub stays in the
-- function body so the descriptor() scan sandbox never evaluates unavailable base globals.
local function t(key, vars)
  local s = (STRINGS.en and STRINGS.en[key]) or key
  if vars then
    s = s:gsub("{(%w+)}", function(k)
      local v = vars[k]
      if v == nil then return "{" .. k .. "}" end
      return tostring(v)
    end)
  end
  return s
end

--------------------------------------------------------------------------------
-- Minimal JSON, hand-rolled: VLC 3.x embeds Lua 5.1 with no JSON library, and an
-- extension cannot require() anything outside VLC's own module path. Covers exactly
-- the subset the clipmeta sidecar uses (objects, arrays, strings, numbers, booleans,
-- null) and nothing else.
--
-- Objects are built from an ORDERED {key, value} list, not a hash: Lua's pairs() order
-- is undefined, and a sidecar that reshuffles its keys on every save produces a diff
-- no reviewer can read.
--------------------------------------------------------------------------------
local function jobj(items) return { __obj = items } end

local JESC = { ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b', ['\f'] = '\\f',
               ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }

-- Escape per RFC 8259: the two mandatory escapes plus every control byte. Bytes >= 0x80
-- pass through verbatim -- valid UTF-8 is legal JSON, and venue names may contain it.
local function jstr(s)
  s = tostring(s):gsub('[%z\1-\31"\\]', function(c)
    return JESC[c] or string.format('\\u%04x', string.byte(c))
  end)
  return '"' .. s .. '"'
end

-- %.14g round-trips a double without printing 0.30000000000000004; whole numbers print
-- without a trailing ".0" so counts read as counts. NaN/inf have no JSON form.
local function jnum(n)
  if n ~= n or n == math.huge or n == -math.huge then return "null" end
  if n == math.floor(n) and math.abs(n) < 2 ^ 53 then return string.format("%d", n) end
  return string.format("%.14g", n)
end

local function jenc(v, pad)
  pad = pad or ""
  local ty = type(v)
  if v == nil then return "null" end
  if ty == "number" then return jnum(v) end
  if ty == "boolean" then return v and "true" or "false" end
  if ty == "string" then return jstr(v) end
  if ty == "table" and v.__list then
    if #v.__list == 0 then return "[]" end
    local inner, out = pad .. "  ", {}
    for _, item in ipairs(v.__list) do out[#out + 1] = inner .. jenc(item, inner) end
    return "[\n" .. table.concat(out, ",\n") .. "\n" .. pad .. "]"
  end
  if ty == "table" and v.__pts then
    -- Points stay on one line each: a polygon is far more readable as [x, y] rows than as
    -- eight separate numbers.
    local out = {}
    for _, pt in ipairs(v.__pts) do
      out[#out + 1] = pad .. "  [" .. jnum(pt[1]) .. ", " .. jnum(pt[2]) .. "]"
    end
    if #out == 0 then return "[]" end
    return "[\n" .. table.concat(out, ",\n") .. "\n" .. pad .. "]"
  end
  if ty == "table" and v.__obj then
    if #v.__obj == 0 then return "{}" end
    local inner, out = pad .. "  ", {}
    for _, kv in ipairs(v.__obj) do
      out[#out + 1] = inner .. jstr(kv[1]) .. ": " .. jenc(kv[2], inner)
    end
    return "{\n" .. table.concat(out, ",\n") .. "\n" .. pad .. "}"
  end
  return "null"
end

-- Decoder: tolerant enough to re-read a hand-edited sidecar, strict enough to refuse
-- garbage (nil + a message, never half a table -- a corrupt file must not be silently
-- read as "no metadata recorded"). JSON null decodes to ABSENT, matching the reader's
-- "missing == unset" rule.
local function jdec(str)
  local i, n = 1, #str
  local function err(msg) error({ json = msg .. " at byte " .. i }, 0) end
  local function skip()
    while i <= n do
      local c = str:sub(i, i)
      if c == " " or c == "\t" or c == "\n" or c == "\r" then i = i + 1 else break end
    end
  end
  local function utf8_char(cp)
    if cp < 0x80 then return string.char(cp) end
    if cp < 0x800 then return string.char(0xC0 + math.floor(cp / 0x40), 0x80 + (cp % 0x40)) end
    if cp < 0x10000 then
      return string.char(0xE0 + math.floor(cp / 0x1000),
                         0x80 + (math.floor(cp / 0x40) % 0x40), 0x80 + (cp % 0x40))
    end
    return string.char(0xF0 + math.floor(cp / 0x40000),
                       0x80 + (math.floor(cp / 0x1000) % 0x40),
                       0x80 + (math.floor(cp / 0x40) % 0x40), 0x80 + (cp % 0x40))
  end
  local UNESC = { ['"'] = '"', ['\\'] = '\\', ['/'] = '/', b = '\b', f = '\f',
                  n = '\n', r = '\r', t = '\t' }
  local function pstring()
    i = i + 1
    local out = {}
    while true do
      if i > n then err("unterminated string") end
      local c = str:sub(i, i)
      if c == '"' then i = i + 1; return table.concat(out) end
      if c == "\\" then
        local e = str:sub(i + 1, i + 1)
        if e == "u" then
          local hex = str:sub(i + 2, i + 5)
          local cp = tonumber(hex, 16)
          if not cp or #hex < 4 then err("bad \\u escape") end
          i = i + 6
          -- A high surrogate needs its low partner; anything else becomes U+FFFD rather
          -- than a broken byte run.
          if cp >= 0xD800 and cp <= 0xDBFF then
            local lo = (str:sub(i, i + 1) == "\\u") and tonumber(str:sub(i + 2, i + 5), 16) or nil
            if lo and lo >= 0xDC00 and lo <= 0xDFFF then
              cp = 0x10000 + (cp - 0xD800) * 0x400 + (lo - 0xDC00); i = i + 6
            else cp = 0xFFFD end
          elseif cp >= 0xDC00 and cp <= 0xDFFF then
            cp = 0xFFFD
          end
          out[#out + 1] = utf8_char(cp)
        else
          local u = UNESC[e]
          if not u then err("bad escape") end
          out[#out + 1] = u; i = i + 2
        end
      else
        out[#out + 1] = c; i = i + 1
      end
    end
  end
  local pvalue
  local function pobject()
    i = i + 1
    local o = {}
    skip()
    if str:sub(i, i) == "}" then i = i + 1; return o end
    while true do
      skip()
      if str:sub(i, i) ~= '"' then err("expected a key") end
      local k = pstring()
      skip()
      if str:sub(i, i) ~= ":" then err("expected ':'") end
      i = i + 1
      o[k] = pvalue()                        -- null -> nil, i.e. the key stays absent
      skip()
      local c = str:sub(i, i)
      if c == "," then i = i + 1
      elseif c == "}" then i = i + 1; return o
      else err("expected ',' or '}'") end
    end
  end
  local function parray()
    i = i + 1
    local a = {}
    skip()
    if str:sub(i, i) == "]" then i = i + 1; return a end
    while true do
      a[#a + 1] = pvalue()
      skip()
      local c = str:sub(i, i)
      if c == "," then i = i + 1
      elseif c == "]" then i = i + 1; return a
      else err("expected ',' or ']'") end
    end
  end
  pvalue = function()
    skip()
    local c = str:sub(i, i)
    if c == "{" then return pobject() end
    if c == "[" then return parray() end
    if c == '"' then return pstring() end
    if str:sub(i, i + 3) == "true" then i = i + 4; return true end
    if str:sub(i, i + 4) == "false" then i = i + 5; return false end
    if str:sub(i, i + 3) == "null" then i = i + 4; return nil end
    local num = str:match("^%-?%d+%.?%d*[eE]?[%+%-]?%d*", i)
    if num and num ~= "" and tonumber(num) then i = i + #num; return tonumber(num) end
    err("unexpected character")
  end
  local ok, res = pcall(function()
    local v = pvalue(); skip()
    if i <= n then err("trailing content") end
    return v
  end)
  if ok then return res end
  return nil, (type(res) == "table" and res.json) or tostring(res)
end

--------------------------------------------------------------------------------
-- State
--------------------------------------------------------------------------------
local d                 -- the single dialog (one per extension)
local w_status          -- status label widget (HTML/rich-text); also hosts help
local w_reason          -- ending_reason dropdown widget
local w_clip_sport      -- one per-video sport dropdown on the Clip info screen
local w_video_sport     -- read-only video sport on the rally screen
local w_start           -- start-time text input (editable seconds)
local w_end             -- end-time text input (editable seconds)
local w_list            -- recent-rallies list widget
local w_save            -- "Save Rally" / "Save changes" button (relabeled by state)
local w_mark_start      -- "Mark START" button (relabeled "Re-mark START (#N)" while editing)
local w_mark_end        -- "Mark END" button (relabeled "Re-mark END (#N)" while editing)
local w_undo            -- "Undo last" button (relabeled to show which row it removes)
local w_next            -- "Next rally #" text input (lets you resume numbering anywhere)
local w_shots           -- "Number of shots" text input (optional shots_count per rally)
local w_help_btn        -- the Help button (relabeled "Hide help" when open)
local w_help            -- the help panel widget; nil when hidden (toggled via del_widget)

local w_venue, w_target_court, w_camera_picker, w_camera  -- Clip info screen inputs
local w_visible, w_active, w_partial                      -- Clip info screen inputs
local w_format, w_capture, w_notes                        -- Clip info screen inputs
local w_sec, w_court, w_profile, w_poly, w_tnotes         -- Target screen inputs
local w_validity, w_profile_list                          -- Target screen dropdown + list
local w_rv_start, w_rv_end, w_rv_notes                    -- Review screen inputs
local w_rv_state, w_rv_section, w_rv_list, w_rv_save      -- Review screen dropdowns/list/button

local rows = {}         -- rally rows; `sport` is a denormalized projection of clip.sport
local mode = "new"      -- "new" (marking a fresh rally) or "edit" (editing a row)
local edit_index = nil  -- index into rows when mode == "edit"
local out_path          -- resolved CSV path (set on activate; re-resolved by Refresh)
local out_path_is_fallback = false  -- true when out_path is the home-dir fallback (no video
                                    -- was resolvable when we last set it); see adopt_current_video_csv

-- Which screen the dialog is showing. The whole grid is rebuilt on a switch, reusing the
-- screen-rebuild path -- one screen's widgets never coexist with another's.
local screen = "rally"          -- "rally" | "clip" | "windows"
local help_row = 17             -- grid row the help panel occupies (per-screen; see build_*)

-- CLIP INFO. Every field is nil until the operator sets it: nil means NOT SCREENED and is
-- written as JSON null. It is never collapsed into 0/false/a plausible default, because
-- sports-data-collector distinguishes "unscreened" from "screened and found single-court".
local clip = {}                 -- venue_id, camera_setup_id, court_count, active_court_count,
                                -- partially_visible_court_count, target_court_id, match_format,
                                -- capture_time_utc, notes
local clip_path                 -- <video-stem>.clipmeta.json
-- Clip-info values the operator has entered but NOT yet saved, or nil when no edit is in
-- progress. Same job `form` does for the rally screen. Without it every dialog rebuild
-- (screen switch or same-video Refresh) silently reset the whole screen -- and
-- an unset dropdown repaints as "(not set)", which looks like a deliberate answer rather than
-- a cleared box, so a lost match_format left no trace until the sidecar came back null.
local clip_form = nil
local clipmeta_exists = false   -- never create the optional sidecar merely because a rally changed
local clip_prefill_source = nil -- sibling filename used as unsaved starting values, if any
local clipmeta_has_unknown_top_level = false -- automatic rewrites must not erase newer fields

-- TARGET PROFILES: one per static camera section, held on the clip (docs/TARGET_REVIEW.md).
local profiles = {}             -- { section, court, profile_id, poly = {{x,y},...}, validity, notes }
local selected_section = nil    -- which profile the list has selected
local legacy_target_court = nil -- top-level target used only to prefill the hidden legacy profile UI

-- SPARSE TARGET-STATE REVIEW: its own file, its own numbering.
local reviews = {}              -- { n, s, e, state, section, source, notes }
local review_path               -- <video-stem>.target-review.csv
local legacy_windows_present = false   -- a withdrawn-design windows.csv is sitting there

-- Rally form values survive a dialog rebuild (such as a screen switch). Without this,
-- switching screens mid-rally would silently discard an unsaved START -> END -- exactly the
-- data loss the v1.6.4 armed-guard exists to prevent.
local form = { start = "", stop = "", shots = "", next = "", reason = REASON_DEFAULT }
local rv_form = { start = "", stop = "", notes = "", state = TARGET_STATES[1] }

-- Forward declarations: the button callbacks below are defined BEFORE the dialog builders
-- they call. Without these the callbacks would resolve these names as (nil) globals.
local capture_form, capture_clip_form, target_refresh, create_dialog, rebuild_after_sync
local refresh_clipmeta_completeness

--------------------------------------------------------------------------------
-- Helpers (declared before the global callbacks that capture them)
--------------------------------------------------------------------------------

-- VLC 3.x used vlc.object.input() + vlc.var.get/set("time") + vlc.input.item().
-- VLC 4.x replaced that surface with vlc.player.* (time still in MICROSECONDS).
-- These shims keep one extension working on both without branching at call sites.

local function player_item()
  if vlc.player and vlc.player.item then
    local ok, item = pcall(vlc.player.item)
    if ok and item then return item end
  end
  if vlc.input and vlc.input.item then
    local ok, item = pcall(vlc.input.item)
    if ok and item then return item end
  end
  return nil
end

-- Current playback time in MICROSECONDS, or nil if nothing is playing.
local function get_time_us()
  if vlc.player and vlc.player.get_time then
    local ok, t = pcall(vlc.player.get_time)
    if ok and type(t) == "number" then return t end
  end
  local input = vlc.object and vlc.object.input and vlc.object.input()
  if not input or not vlc.var or not vlc.var.get then return nil end
  local ok, t = pcall(function() return vlc.var.get(input, "time") end)
  if ok and type(t) == "number" then return t end
  return nil
end

local function set_time_us(us)
  if type(us) ~= "number" then return false end
  if us < 0 then us = 0 end
  if vlc.player and vlc.player.seek_by_time_absolute then
    local ok = pcall(function() vlc.player.seek_by_time_absolute(us) end)
    return ok and true or false
  end
  local input = vlc.object and vlc.object.input and vlc.object.input()
  if not input or not vlc.var or not vlc.var.set then return false end
  local ok = pcall(function() vlc.var.set(input, "time", us) end)
  return ok and true or false
end

-- Current playback time in SECONDS, or nil if nothing is playing.
local function now_seconds()
  local t_us = get_time_us()
  if not t_us then return nil end
  return t_us / 1000000.0
end

-- mm:ss.mmm for display only.
local function fmt_clock(s)
  if not s then return "--:--" end
  if s < 0 then s = 0 end
  local m   = math.floor(s / 60)
  local sec = s - m * 60
  return string.format("%d:%06.3f", m, sec)
end

-- Minimal HTML-escape so paths/messages render literally in the rich-text label.
local function esc(text)
  text = tostring(text or "")
  text = text:gsub("&", "&amp;")
  text = text:gsub("<", "&lt;")
  text = text:gsub(">", "&gt;")
  return text
end

-- Best-effort path to the currently playing media file (decoded from URI).
local function current_media_path()
  local item = player_item()
  if not item then return nil end
  local uri = item:uri()                   -- item:uri()
  if not uri or uri == "" then return nil end
  local p = uri
  -- Strip the scheme. Windows file URIs look like file:///C:/dir/clip.mp4;
  -- POSIX ones like file:///home/user/clip.mp4 -- keep the POSIX leading "/".
  if p:match("^file:///%a:") then
    p = p:gsub("^file:///", "")            -- file:///C:/... -> C:/...
  else
    p = p:gsub("^file://", "")             -- file:///home/... -> /home/...
  end
  -- percent-decode (e.g. %20 -> space) BEFORE separator normalization
  p = p:gsub("%%(%x%x)", function(h) return string.char(tonumber(h, 16)) end)
  if p:match("^%a:") then                  -- Windows drive path -> backslashes
    p = p:gsub("/", "\\")
  end
  return p
end

-- Resolve a sensible default output path: next to the video if we can, else
-- the user's home (USERPROFILE on Windows, HOME elsewhere).
local function resolve_out_path()
  local media = current_media_path()
  if media then
    local dir, stem = media:match("^(.*[\\/])([^\\/]-)%.?[^\\/%.]*$")
    if dir and stem and stem ~= "" then
      return dir .. stem .. ".rallies.csv"
    end
    local d2 = media:match("^(.*[\\/])")
    if d2 then return d2 .. "rally_labels.csv" end
  end
  local home = os.getenv("USERPROFILE") or os.getenv("HOME") or "."
  local sep = home:find("\\") and "\\" or "/"
  if home:sub(-1) ~= sep then home = home .. sep end
  return home .. "rally_labels.csv"
end

-- Load all rally rows from the CSV into `rows` (header + blank lines skipped).
-- Forgiving parser: any leading-integer line is a rally row. Column 6 is the
-- optional shots_count (blank/missing in older CSVs); any columns beyond it are
-- preserved verbatim so we never drop richer metadata on rewrite.
local function load_rows()
  rows = {}
  local f = io.open(out_path, "r")
  if not f then return end
  for line in f:lines() do
    line = line:gsub("\r$", "")
    if line:match("%S") then
      local parts = {}
      for field in (line .. ","):gmatch("([^,]*),") do parts[#parts + 1] = field end
      local n = tonumber(parts[1])
      if n and n == math.floor(n) then
        local shots = parts[6]
        if shots == "" then shots = nil end   -- blank => not recorded
        local row = {
          n      = math.floor(n),
          s      = tonumber(parts[2]) or 0,
          e      = tonumber(parts[3]) or 0,
          reason = (parts[4] ~= nil and parts[4] ~= "") and parts[4] or "other",
          sport  = parts[5] or "",
          shots  = shots,
        }
        if #parts > 6 then
          local ex = {}
          for i = 7, #parts do ex[#ex + 1] = parts[i] end
          row.extra = table.concat(ex, ",")
        end
        rows[#rows + 1] = row
      end
    end
  end
  f:close()
end

local function canonical_sport(value)
  for _, sport in ipairs(SPORTS) do
    if value == sport then return sport end
  end
  return nil
end

-- `sport` remains repeated in the CSV for the established interchange schema, but it is no
-- longer an independently editable rally property. A unanimous legacy CSV can seed the video
-- value when no sidecar exists; mixed or non-canonical rows require an explicit Clip info save.
local function unanimous_row_sport()
  local found = nil
  for _, row in ipairs(rows) do
    local sport = canonical_sport(row.sport)
    if not sport or (found and found ~= sport) then return nil end
    found = sport
  end
  return found
end

local function adopt_row_sport_if_missing()
  if canonical_sport(clip.sport) then return end
  clip.sport = unanimous_row_sport()
end

local function video_sport()
  local declared = canonical_sport(clip.sport)
  if declared then return declared end
  local legacy = unanimous_row_sport()
  if legacy then return legacy end
  -- The no-video home fallback predates per-clip metadata and is retained only so enabling the
  -- extension before playback remains harmless. Once a real video is adopted this default is
  -- discarded and its sport must come from that video's Clip info or unanimous legacy rows.
  if out_path_is_fallback then return SPORTS[1] end
  return nil
end

local function refresh_video_sport()
  if not w_video_sport then return end
  local sport = video_sport()
  w_video_sport:set_text(sport and t("sport." .. sport) or t("fmt.unset"))
end

local function sport_mismatch_count(sport)
  local count = 0
  for _, row in ipairs(rows) do
    if row.sport ~= sport then count = count + 1 end
  end
  return count
end

-- Rewrite the whole CSV from `rows` (header once). We write a temp file and swap
-- it into place so the live CSV is never lost if a step fails: rename is atomic on
-- POSIX (and succeeds for a brand-new file on Windows); when Windows can't rename
-- over an existing file we stash the original as .bak and roll back on error.
local function save_all(skip_clipmeta_refresh)
  local tmp = out_path .. ".tmp"
  local f, err = io.open(tmp, "w")
  if not f then return false, ("cannot open CSV for write: " .. tostring(err)) end
  f:write(HEADER)
  for _, r in ipairs(rows) do
    local shots = (r.shots ~= nil) and tostring(r.shots) or ""
    local line = string.format("%d,%.3f,%.3f,%s,%s,%s", r.n, r.s, r.e, r.reason, r.sport, shots)
    if r.extra and r.extra ~= "" then line = line .. "," .. r.extra end
    f:write(line .. "\n")
  end
  f:close()
  -- Atomic on POSIX; also succeeds on Windows when out_path doesn't exist yet.
  if os.rename(tmp, out_path) then
    if not skip_clipmeta_refresh and refresh_clipmeta_completeness then
      refresh_clipmeta_completeness()
    end
    return true
  end
  -- Windows overwrite path: keep a backup so the original is never lost.
  local bak = out_path .. ".bak"
  os.remove(bak)
  local stashed = os.rename(out_path, bak)        -- move original aside (nil if none)
  local ok, rerr = os.rename(tmp, out_path)
  if not ok then
    if stashed then os.rename(bak, out_path) end  -- roll back
    return false, ("cannot replace CSV: " .. tostring(rerr))
  end
  os.remove(bak)
  if not skip_clipmeta_refresh and refresh_clipmeta_completeness then
    refresh_clipmeta_completeness()
  end
  return true
end

--------------------------------------------------------------------------------
-- Clip metadata sidecar + target profiles + review track
-- (docs/CLIP_METADATA.md, docs/TARGET_REVIEW.md)
--------------------------------------------------------------------------------

-- Swap the ".rallies.csv" tail of out_path for another sidecar suffix, so all three files
-- share one stem and travel together.
local function sidecar_path(suffix)
  if not out_path then return nil end
  local stem = out_path:gsub("%.rallies%.csv$", ""):gsub("%.csv$", "")
  return stem .. suffix
end

-- Clip duration in SECONDS, or nil. item:duration() is seconds (VLC 3 + 4); "length" on the
-- VLC 3 input object is MICROSECONDS. Both are wrapped: a build where either is absent must
-- leave the duration UNKNOWN rather than throw, because every completeness rule is gated on
-- having a real duration (never a guess).
local function media_duration()
  local item = player_item()
  if item and item.duration then
    local ok2, secs = pcall(function() return item:duration() end)
    if ok2 and type(secs) == "number" and secs > 0 then return secs end
  end
  local input = vlc.object and vlc.object.input and vlc.object.input()
  if input and vlc.var and vlc.var.get then
    local ok3, us = pcall(function() return vlc.var.get(input, "length") end)
    if ok3 and type(us) == "number" and us > 0 then return us / 1000000.0 end
  end
  return nil
end

-- Container-level date, when the player exposes one. NEVER derived from the file or folder
-- name: in the reference archive a folder named "May 19 2026" holds files captured
-- 2026-05-21. sports-data-collector re-probes the container at import and that value wins;
-- this is the operator's record, not the authority.
local function container_capture_time()
  local item = player_item()
  if not item or not item.metas then return nil end
  local ok2, metas = pcall(function() return item:metas() end)
  if not ok2 or type(metas) ~= "table" then return nil end
  local v = metas["date"] or metas["Date"]
  if type(v) == "string" and v:match("%d%d%d%d") then return v end
  return nil
end

-- Label completeness, formula-for-formula identical to sports-data-collector's
-- _label_completeness() (src/reporting/adapter.py) so the readout here and the gate there
-- cannot disagree. Returns nil when the duration is unknown -- no rule fires on a guess.
local function completeness()
  local dur = media_duration()
  if not dur or dur <= 0 or #rows == 0 then return nil end
  local first_start, last_end = nil, nil
  local sorted = {}
  for _, r in ipairs(rows) do sorted[#sorted + 1] = { s = r.s, e = r.e } end
  table.sort(sorted, function(a, b) return a.s < b.s end)
  local largest_gap, prev_end = 0, sorted[1].e
  for idx, sp in ipairs(sorted) do
    if first_start == nil or sp.s < first_start then first_start = sp.s end
    if last_end == nil or sp.e > last_end then last_end = sp.e end
    if idx > 1 then
      if sp.s - prev_end > largest_gap then largest_gap = sp.s - prev_end end
      if sp.e > prev_end then prev_end = sp.e end
    end
  end
  local function r1(x) return math.floor(x * 10 + 0.5) / 10 end
  local cov = last_end / dur
  if cov > 1 then cov = 1 end
  return {
    video_duration_s = dur,
    labelled_to_s = last_end,
    label_span_coverage = math.floor(cov * 10000 + 0.5) / 10000,
    head_unlabelled_s = r1(math.max(first_start, 0)),
    tail_unlabelled_s = r1(math.max(dur - last_end, 0)),
    largest_unlabelled_gap_s = r1(largest_gap),
    rally_count = #rows,
  }
end

-- Read the sidecar back so re-opening a clip resumes its screening rather than re-asking.
-- A corrupt file leaves `clip` empty and says so, instead of masquerading as "not screened".
-- Shoelace area of a NORMALIZED polygon, i.e. the fraction of frame it covers. This is the
-- coverage that decides which court is prominent (docs/TARGET_REVIEW.md).
local function polygon_area(poly)
  if not poly or #poly < 3 then return 0 end
  local a = 0
  for i = 1, #poly do
    local p1, p2 = poly[i], poly[(i % #poly) + 1]
    a = a + (p1[1] * p2[2] - p2[1] * p1[2])
  end
  return math.abs(a) / 2
end

-- A bowtie passes every per-point check and still has a MEANINGLESS area -- its two lobes
-- cancel in the shoelace sum -- so it must be refused before any coverage comparison is built
-- on it. Proper crossings only; edges sharing a vertex are not a crossing.
local function sign(v) if v > 0 then return 1 elseif v < 0 then return -1 else return 0 end end
local function segments_cross(p, p2, q, q2)
  local function o(a, b, c)
    return sign((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]))
  end
  local d1, d2 = o(p, p2, q), o(p, p2, q2)
  local d3, d4 = o(q, q2, p), o(q, q2, p2)
  return d1 ~= d2 and d3 ~= d4
end

local function self_intersecting(poly)
  local n = #poly
  if n < 4 then return false end
  for i = 1, n do
    for j = i + 1, n do
      local adj = (j == i) or ((j % n) + 1 == i) or ((i % n) + 1 == j)
      if not adj then
        if segments_cross(poly[i], poly[(i % n) + 1], poly[j], poly[(j % n) + 1]) then return true end
      end
    end
  end
  return false
end

-- Validate a target profile. FAILS CLOSED: returns a message key + vars on any violation, and
-- the caller refuses the save. Nothing is coerced, clamped or half-accepted.
local function validate_profile(p, others)
  if not p.section or p.section == "" then return "target.needSection" end
  if not p.court or p.court == "" then return "target.needCourt" end
  for _, o in ipairs(others or {}) do
    if o.section == p.section then return "target.duplicateSection", { section = p.section } end
  end
  if type(p.poly) ~= "table" or #p.poly < 3 then return "target.polygonTooFewPoints" end
  for _, pt in ipairs(p.poly) do
    if type(pt) ~= "table" or #pt ~= 2 or type(pt[1]) ~= "number" or type(pt[2]) ~= "number" then
      return "target.polygonSyntax"
    end
    -- The polygon is NORMALIZED to the frame. A pixel coordinate is a different thing wearing
    -- the same shape, and accepting it would produce geometry that is wrong but well-formed.
    if pt[1] < 0 or pt[1] > 1 or pt[2] < 0 or pt[2] > 1 then return "target.polygonRange" end
  end
  if self_intersecting(p.poly) then return "target.polygonSelfIntersecting" end
  return nil
end

-- "x,y x,y ..." (also ; separated) -> a point list, or nil + a message key.
local function parse_polygon(text)
  text = (text or ""):gsub("^%s+", ""):gsub("%s+$", "")
  if text == "" then return nil, "target.polygonTooFewPoints" end
  local pts = {}
  for tok in text:gmatch("[^%s;]+") do
    local x, y = tok:match("^(-?[%d%.]+),(-?[%d%.]+)$")
    if not x then return nil, "target.polygonSyntax" end
    local nx, ny = tonumber(x), tonumber(y)
    if not nx or not ny then return nil, "target.polygonSyntax" end
    if nx < 0 or nx > 1 or ny < 0 or ny > 1 then return nil, "target.polygonRange" end
    pts[#pts + 1] = { nx, ny }
  end
  if #pts < 3 then return nil, "target.polygonTooFewPoints" end
  return pts
end

local function format_polygon(poly)
  local out = {}
  for _, pt in ipairs(poly or {}) do
    out[#out + 1] = string.format("%.3f,%.3f", pt[1], pt[2])
  end
  return table.concat(out, " ")
end

-- NB: this deliberately does NOT clear `clip_form`. A same-video Refresh re-reads the sidecar
-- from disk without changing which clip is being described, and it can be pressed from the RALLY
-- screen, where no clip widget exists to re-stage the operator's edits from. Clearing here would
-- silently discard them -- the exact failure this whole change exists to fix. The three real
-- context changes clear it themselves: activate(), adopt_current_video_csv(), rebuild_after_sync(true).
local function read_clipmeta_doc(path)
  local f = io.open(path, "r")
  if not f then return nil, nil, false end
  local body = f:read("*a"); f:close()
  local doc, why = jdec(body or "")
  if type(doc) ~= "table" then return nil, why or "unreadable", true end
  local version = tonumber(doc.clipmeta_version or 1)
  if not version or version < 1 or version > CLIPMETA_VERSION then
    return nil, "unsupported clipmeta_version", true
  end
  local has_unknown = false
  for key, _ in pairs(doc) do
    if type(key) == "string" and not CLIPMETA_TOP_LEVEL_KEYS[key] then
      has_unknown = true
      break
    end
  end
  return doc, nil, true, has_unknown
end

-- v1 already had the declarative top-level id. v2 moved it into camera-section profiles;
-- restore that value only when every recorded profile agrees, never by guessing through a
-- conflict. v3 writes the resulting identity back at the top level.
local function target_court_from_doc(doc)
  if type(doc.target_court_id) == "string" and doc.target_court_id ~= "" then
    return doc.target_court_id
  end
  local found = nil
  if type(doc.target_profiles) == "table" then
    for _, raw in ipairs(doc.target_profiles) do
      local court = type(raw) == "table" and raw.target_court_id or nil
      if type(court) == "string" and court ~= "" then
        if found and found ~= court then return nil end
        found = court
      end
    end
  end
  return found
end

local function apply_declarative_clipmeta(doc, include_capture_time)
  for _, k in ipairs({ "venue_id", "camera_setup_id", "match_format", "notes" }) do
    if type(doc[k]) == "string" and doc[k] ~= "" then clip[k] = doc[k] end
  end
  clip.sport = canonical_sport(doc.sport)
  if include_capture_time and type(doc.capture_time_utc) == "string"
      and doc.capture_time_utc ~= "" then
    clip.capture_time_utc = doc.capture_time_utc
  end
  clip.target_court_id = target_court_from_doc(doc)
  for _, k in ipairs({ "court_count", "active_court_count", "partially_visible_court_count" }) do
    if type(doc[k]) == "number" then clip[k] = math.floor(doc[k]) end
  end
end

-- Later chapters in one capture sitting normally share a directory. Pick the first valid sibling
-- deterministically (lexical filename order) and copy only declarative form fields: never geometry,
-- completeness, clip identity, or the sibling's container timestamp. This is an unsaved starting
-- point, not evidence and never an auto-save.
local function sibling_clipmeta()
  if not current_media_path() or type(vlc.io) ~= "table"
      or type(vlc.io.readdir) ~= "function" then return nil end
  local dir = clip_path and clip_path:match("^(.*[\\/])")
  local current = clip_path and clip_path:match("([^\\/]+)$")
  if not dir or not current then return nil end
  local ok, names = pcall(function() return vlc.io.readdir(dir) end)
  if not ok or type(names) ~= "table" then return nil end
  table.sort(names)
  for _, name in ipairs(names) do
    if type(name) == "string" and name ~= current and name:match("%.clipmeta%.json$") then
      local doc = read_clipmeta_doc(dir .. name)
      if type(doc) == "table" then return doc, name end
    end
  end
  return nil
end
local function load_clipmeta()
  clip = {}
  profiles = {}
  legacy_target_court = nil
  selected_section = nil
  clipmeta_exists = false
  clip_prefill_source = nil
  clipmeta_has_unknown_top_level = false
  clip_path = sidecar_path(".clipmeta.json")
  if not clip_path then return nil end

  local doc, why, found, has_unknown = read_clipmeta_doc(clip_path)
  local from_sibling = false
  if found and type(doc) ~= "table" then return why or "unreadable" end
  if not found then
    doc, clip_prefill_source = sibling_clipmeta()
    from_sibling = type(doc) == "table"
  else
    clipmeta_exists = true
    clipmeta_has_unknown_top_level = has_unknown
  end
  if type(doc) ~= "table" then return nil end

  apply_declarative_clipmeta(doc, not from_sibling)
  legacy_target_court = clip.target_court_id
  if from_sibling then return nil end

  if type(doc.target_profiles) == "table" then
    for _, raw in ipairs(doc.target_profiles) do
      if type(raw) == "table" then
        local poly = {}
        if type(raw.play_volume_polygon) == "table" then
          for _, pt in ipairs(raw.play_volume_polygon) do
            if type(pt) == "table" and type(pt[1]) == "number" and type(pt[2]) == "number" then
              poly[#poly + 1] = { pt[1], pt[2] }
            end
          end
        end
        local validity = "unclear"        -- an unknown value degrades to unclear, never supported
        for _, v in ipairs(SETUP_VALIDITY) do if raw.setup_validity == v then validity = v end end
        local p = {
          section = type(raw.camera_section_id) == "string" and raw.camera_section_id or "",
          court = type(raw.target_court_id) == "string" and raw.target_court_id or "",
          profile_id = type(raw.camera_profile_id) == "string" and raw.camera_profile_id or nil,
          poly = poly, validity = validity,
          notes = type(raw.notes) == "string" and raw.notes ~= "" and raw.notes or nil,
        }
        -- A stored profile that no longer validates is DROPPED: half-valid geometry read back
        -- as truth is worse than an absent profile.
        if validate_profile(p, profiles) == nil then profiles[#profiles + 1] = p end
      end
    end
  end
  return nil
end

local function save_clipmeta_file()
  if not clip_path then return false, "no clip path resolved" end
  local stem = clip_path:match("([^\\/]+)%.clipmeta%.json$")
  local cov = completeness()
  local covobj = nil
  if cov then
    covobj = jobj({
      { "video_duration_s", cov.video_duration_s }, { "labelled_to_s", cov.labelled_to_s },
      { "label_span_coverage", cov.label_span_coverage },
      { "head_unlabelled_s", cov.head_unlabelled_s }, { "tail_unlabelled_s", cov.tail_unlabelled_s },
      { "largest_unlabelled_gap_s", cov.largest_unlabelled_gap_s },
      { "rally_count", cov.rally_count },
    })
  end
  local prof_arr = {}
  for _, p in ipairs(profiles) do
    local pts = {}
    for _, pt in ipairs(p.poly) do
      pts[#pts + 1] = { __arr2 = true, x = pt[1], y = pt[2] }
    end
    prof_arr[#prof_arr + 1] = jobj({
      { "camera_section_id", p.section },
      { "target_court_id", p.court },
      { "camera_profile_id", p.profile_id },
      { "play_volume_polygon", { __pts = p.poly } },
      { "setup_validity", p.validity },
      { "notes", p.notes },
    })
  end
  -- Key order is fixed here, not derived from a hash, so a re-save diffs cleanly.
  local doc = jobj({
    { "clipmeta_version", CLIPMETA_VERSION },
    { "generator", "rally-annotator-vlc/" .. VERSION },
    { "clip_name", stem },
    { "sport", clip.sport },
    { "venue_id", clip.venue_id },
    { "target_court_id", clip.target_court_id },
    { "camera_setup_id", clip.camera_setup_id },
    { "capture_time_utc", clip.capture_time_utc },
    { "capture_time_source", clip.capture_time_utc and "container" or nil },
    { "court_count", clip.court_count },
    { "active_court_count", clip.active_court_count },
    { "partially_visible_court_count", clip.partially_visible_court_count },
    { "match_format", clip.match_format },
    { "notes", clip.notes },
    { "target_profiles", { __list = prof_arr } },
    { "label_completeness", covobj },
  })
  local tmp = clip_path .. ".tmp"
  local f, err = io.open(tmp, "w")
  if not f then return false, tostring(err) end
  f:write(jenc(doc) .. "\n")
  f:close()
  if os.rename(tmp, clip_path) then return true end
  -- Windows cannot rename over an existing file. Preserve the old sidecar until the new one
  -- is installed, matching the CSV writer's rollback contract.
  local bak = clip_path .. ".bak"
  os.remove(bak)
  local stashed = os.rename(clip_path, bak)
  local ok, rerr = os.rename(tmp, clip_path)
  if not ok then
    if stashed then os.rename(bak, clip_path) end
    return false, tostring(rerr)
  end
  os.remove(bak)
  return true
end

-- Rally writes must never create or gate on the optional clip sidecar. When one already exists,
-- however, keep its advisory completeness block synchronized with the just-written CSV. A sidecar
-- failure is logged but cannot roll back or block a successfully saved rally.
refresh_clipmeta_completeness = function()
  if not clipmeta_exists then return end
  if clipmeta_has_unknown_top_level then
    if vlc.msg and vlc.msg.warn then
      vlc.msg.warn("Rally Annotator: skipped clipmeta completeness refresh because the sidecar "
        .. "contains unknown top-level fields; use Save clip info only if replacing them is intended")
    end
    return
  end
  local ok, err = save_clipmeta_file()
  if not ok and vlc.msg and vlc.msg.warn then
    vlc.msg.warn("Rally Annotator: could not refresh clipmeta label_completeness: " .. tostring(err))
  end
end

-- The window CSV has no quoting (same deliberate simplicity as rallies.csv), so free text
-- is flattened on write rather than corrupting the column count on read.
local function csv_safe(s)
  if not s then return "" end
  return (tostring(s):gsub("[\r\n]+", " "):gsub(",", ";"))
end

-- A withdrawn-design windows.csv is DETECTED and REFUSED: never read into the review track,
-- never converted, never imported. Its labels asserted facts about surrounding courts under a
-- contract that no longer exists (docs/TARGET_REVIEW.md).
local function detect_legacy_windows()
  legacy_windows_present = false
  local p = sidecar_path(".windows.csv")
  if not p then return end
  local f = io.open(p, "r")
  if not f then return end
  local head = f:read(4096) or ""
  f:close()
  for _, marker in ipairs(LEGACY_WINDOW_MARKERS) do
    if head:find(marker, 1, true) then legacy_windows_present = true; return end
  end
  legacy_windows_present = true    -- a windows.csv at all is legacy by name
end

local function load_reviews()
  reviews = {}
  review_path = sidecar_path(".target-review.csv")
  if not review_path then return end
  local f = io.open(review_path, "r")
  if not f then return end
  for line in f:lines() do
    line = line:gsub("\r$", "")
    if line:match("%S") then
      local parts = {}
      for field in (line .. ","):gmatch("([^,]*),") do parts[#parts + 1] = field end
      local n = tonumber(parts[1])
      if n and n == math.floor(n) then
        local st = (parts[4] or ""):gsub("^%s+", ""):gsub("%s+$", "")
        local known = false
        for _, v in ipairs(TARGET_STATES) do if v == st then known = true end end
        local a, b = tonumber(parts[2]) or 0, tonumber(parts[3]) or 0
        -- An unknown state is DROPPED. This is what stops a legacy neighborhood label from
        -- being read back in as though it were a target-state answer.
        if known and b > a then
          reviews[#reviews + 1] = { n = math.floor(n), s = a, e = b, state = st,
                                    section = parts[5] or "", source = parts[6] or "operator",
                                    notes = parts[7] or "" }
        end
      end
    end
  end
  f:close()
end

local function save_reviews()
  if not review_path then return false, "no review path resolved" end
  local tmp = review_path .. ".tmp"
  local f, err = io.open(tmp, "w")
  if not f then return false, tostring(err) end
  f:write(REVIEW_HEADER)
  for _, r in ipairs(reviews) do
    f:write(string.format("%d,%.3f,%.3f,%s,%s,%s,%s\n", r.n, r.s, r.e, r.state,
                          csv_safe(r.section), csv_safe(r.source), csv_safe(r.notes)))
  end
  f:close()
  if os.rename(tmp, review_path) then return true end
  os.remove(review_path)
  local ok, rerr = os.rename(tmp, review_path)
  if not ok then return false, tostring(rerr) end
  return true
end

-- Next monotonic rally_number (max existing + 1); keeps numbering across reopen.
local function next_rally_number()
  local maxn = 0
  for _, r in ipairs(rows) do if r.n > maxn then maxn = r.n end end
  return maxn + 1
end

-- Read a text-input widget as a number, or nil if blank/non-numeric.
local function get_field_num(w)
  if not w then return nil end
  local t = w:get_text()
  if not t then return nil end
  t = t:gsub("%s+", "")
  if t == "" then return nil end
  return tonumber(t)
end

-- The "Number of shots" field as a non-negative integer, or nil if blank or not a
-- valid count. Optional metadata: a blank/garbage value just records no shots_count.
local function get_shots()
  local v = get_field_num(w_shots)
  if not v or v < 0 then return nil end
  return math.floor(v)
end

-- True when a fresh rally is fully marked (both START and END) but NOT yet saved --
-- i.e. there is unsaved work in the fields. Guards against silently discarding it when
-- the user starts a new rally (Mark START) or jumps to editing another (Edit selected).
local function is_armed()
  return mode == "new" and get_field_num(w_start) ~= nil and get_field_num(w_end) ~= nil
end

-- The number the NEXT new rally will get. Defaults to next_rally_number(), but the
-- user can type any value into the "Next rally #" field to resume/insert anywhere.
local function planned_next_number()
  local v = get_field_num(w_next)
  if v and v >= 1 then return math.floor(v) end
  return next_rally_number()
end

-- Reset the "Next rally #" field to the natural next number for the current CSV.
local function refresh_next_field()
  if w_next then w_next:set_text(tostring(next_rally_number())) end
end

local function index_of_rally(n)
  for i, r in ipairs(rows) do if r.n == n then return i end end
  return nil
end

-- Smallest integer >= start that is not already a rally_number (auto-advance skips
-- over occupied numbers so consecutive saves never walk into an existing one).
local function next_free_from(start)
  local n = start
  while index_of_rally(n) do n = n + 1 end
  return n
end

-- The review track keeps its own numbering, independent of the rally track.
local function next_review_number()
  local maxn = 0
  for _, r in ipairs(reviews) do if r.n > maxn then maxn = r.n end end
  return maxn + 1
end

local function index_of_review(n)
  for i, r in ipairs(reviews) do if r.n == n then return i end end
  return nil
end

local function selected_review_number()
  if not w_rv_list then return nil end
  local sel = w_rv_list:get_selection()
  if type(sel) ~= "table" then return nil end
  for id, _ in pairs(sel) do return tonumber(id) or id end
  return nil
end

local function selected_profile_index()
  if not w_profile_list then return nil end
  local sel = w_profile_list:get_selection()
  if type(sel) ~= "table" then return nil end
  for id, _ in pairs(sel) do return tonumber(id) end
  return nil
end

-- First selected rally_number in the recent list, or nil. get_selection() returns
-- a { [id]=text } table in VLC 3.0.x (id is the rally_number we stored).
local function selected_rally_number()
  if not w_list then return nil end
  local sel = w_list:get_selection()
  if type(sel) ~= "table" then return nil end
  for id, _ in pairs(sel) do
    return tonumber(id) or id
  end
  return nil
end

-- Dropdowns have no set_value in 3.0.x. clear()+re-add did NOT repaint reliably in
-- VLC (the selection got "stuck" on the previous reason), so we RECREATE the dropdown
-- at the SAME grid cell via del_widget+add_dropdown -- a real widget swap VLC renders
-- every time, with no net layout change. The first value added is auto-selected, so we
-- add the value we want shown first.
local function rebuild_reason_default()
  if not d or screen ~= "rally" then return end
  if w_reason then d:del_widget(w_reason) end
  w_reason = d:add_dropdown(3, 7, 1, 1)
  w_reason:add_value(t("reason." .. REASON_DEFAULT), 0)  -- "unknown" default (id 0)
  for i, v in ipairs(REASONS) do w_reason:add_value(t("reason." .. v), i) end
end

local function rebuild_reason_selected(sel)
  if not d or screen ~= "rally" then return end
  if not sel or sel == "" then sel = REASON_DEFAULT end
  if w_reason then d:del_widget(w_reason) end
  w_reason = d:add_dropdown(3, 7, 1, 1)
  w_reason:add_value(t("reason." .. sel), REASON_ID[sel] or 0)   -- selected first
  if sel ~= REASON_DEFAULT then w_reason:add_value(t("reason." .. REASON_DEFAULT), 0) end
  for i, v in ipairs(REASONS) do
    if v ~= sel then w_reason:add_value(t("reason." .. v), i) end
  end
end

local function rebuild_clip_sport_selected(sel)
  if not w_clip_sport then return end
  sel = canonical_sport(sel)
  w_clip_sport:clear()
  if sel then
    w_clip_sport:add_value(t("sport." .. sel), SPORT_ID[sel])
    w_clip_sport:add_value(t("fmt.unset"), 0)
  else
    w_clip_sport:add_value(t("fmt.unset"), 0)
  end
  for i, v in ipairs(SPORTS) do
    if v ~= sel then w_clip_sport:add_value(t("sport." .. v), i) end
  end
end

-- Repaint the recent-rallies list with EVERY rally (oldest first). The box is a
-- fixed-height, scrollable list, so we show the full history instead of a window --
-- a "last 12" cap used to hide the oldest rallies (e.g. #1 once you had 13+), which
-- also made them impossible to select for Edit/Delete.
local function refresh_list()
  if not w_list then return end
  w_list:clear()
  for _, r in ipairs(rows) do
    local label = string.format("#%d   %s -> %s   [%s, %s]", r.n, fmt_clock(r.s), fmt_clock(r.e),
      t("reason." .. r.reason), t("sport." .. r.sport))
    if r.shots ~= nil then label = label .. string.format("   %s shots", tostring(r.shots)) end
    w_list:add_value(label, r.n)
  end
  if d then d:update() end
end

-- Action-button labels reflect state. Save shows the rally number it will write
-- (or "Save changes (#N)" while editing). Undo last shows exactly which row it
-- will remove ("Undo last (#N)"), or that it will cancel an edit / clear a mark.
local function refresh_buttons()
  if w_save then
    if mode == "edit" and edit_index and rows[edit_index] then
      w_save:set_text(t("btn.saveChangesN", { n = rows[edit_index].n }))
    else
      local s = get_field_num(w_start)
      local e = get_field_num(w_end)
      if s and e then
        w_save:set_text(t("btn.saveRallyN", { n = planned_next_number() }))
      else
        w_save:set_text(t("btn.saveRally"))
      end
    end
  end
  -- While editing, the Mark buttons re-mark the EDITED rally's times (not a new one),
  -- so relabel them to make that unmissable -- a forgotten edit-mode is how you'd
  -- accidentally overwrite an existing rally thinking you were creating a new one.
  if w_mark_start and w_mark_end then
    if mode == "edit" and edit_index and rows[edit_index] then
      w_mark_start:set_text(t("btn.reMarkStart", { n = rows[edit_index].n }))
      w_mark_end:set_text(t("btn.reMarkEnd", { n = rows[edit_index].n }))
    else
      w_mark_start:set_text(t("btn.markStart"))
      w_mark_end:set_text(t("btn.markEnd"))
    end
  end
  if w_undo then
    if mode == "edit" then
      w_undo:set_text(t("btn.undoCancelEdit"))
    else
      local s = get_field_num(w_start)
      local e = get_field_num(w_end)
      if s or e then
        w_undo:set_text(t("btn.undoClearMark"))
      elseif #rows > 0 then
        w_undo:set_text(t("btn.undoN", { n = rows[#rows].n }))
      else
        w_undo:set_text(t("btn.undo"))
      end
    end
  end
  if d then d:update() end
end

-- The completeness readout, as 0-2 escaped HTML lines. Rally DENSITY cannot catch a
-- half-finished pass on its own (a truncated pass and a genuinely sparse clip both sit near
-- 23%), but the unlabelled TAIL can -- so the warning is on the tail, at the same threshold
-- the collector blocks on.
local function coverage_lines()
  local c = completeness()
  if not c then return "" end
  local out = esc(t("cov.line", {
    to = string.format("%.1f", c.labelled_to_s), dur = string.format("%.1f", c.video_duration_s),
    pct = string.format("%.1f", c.label_span_coverage * 100),
    tail = string.format("%.1f", c.tail_unlabelled_s),
    gap = string.format("%.1f", c.largest_unlabelled_gap_s),
  })) .. "<br>"
  if c.tail_unlabelled_s > TAIL_WARN_S then
    out = out .. "<b>" .. esc(t("cov.tail", { tail = string.format("%.1f", c.tail_unlabelled_s),
      limit = TAIL_WARN_S })) .. "</b><br>"
  elseif c.label_span_coverage < SPAN_WARN then
    out = out .. esc(t("cov.span", { limit = math.floor(SPAN_WARN * 100) })) .. "<br>"
  end
  return out
end

-- One line naming a legacy neighborhood file, so the operator knows it is there and knows it
-- is being ignored rather than quietly read.
local function legacy_line()
  if not legacy_windows_present then return "" end
  return "<b>" .. esc(t("legacy.windowsPresent")) .. "</b><br>"
end

local last_status_msg = ""
local function set_status(msg)
  if not w_status then return end
  last_status_msg = msg
  local mode_line, body
  if screen == "review" then
    body = legacy_line() .. esc(t("review.mode")) .. "<br>"
      .. esc(t("status.csvPath", { path = review_path or "-" }))
  elseif screen == "target" then
    local vol
    local poly, perr = parse_polygon(w_poly and w_poly:get_text() or "")
    if poly then
      vol = t("target.volumeSummary", { n = #poly,
        pct = string.format("%.1f", polygon_area(poly) * 100) })
    elseif perr == "target.polygonTooFewPoints" and (not w_poly or (w_poly:get_text() or "") == "") then
      vol = t("target.volumeEmpty")
    else
      vol = t("target.volumeInvalid", { why = t(perr) })
    end
    body = esc(vol) .. "<br>" .. esc(t("target.mode", { count = #profiles })) .. "<br>"
      .. esc(t("status.csvPath", { path = clip_path or "-" }))
  elseif screen == "clip" then
    body = coverage_lines() .. esc(t("status.csvPath", { path = clip_path or "-" }))
  else
    if mode == "edit" and edit_index and rows[edit_index] then
      mode_line = t("status.modeEdit", { n = rows[edit_index].n })
    else
      mode_line = t("status.modeNew")
    end
    local last_line = ""
    if #rows > 0 then
      local lr = rows[#rows]
      last_line = esc(t("status.lastRow", { n = lr.n, start = fmt_clock(lr.s),
        ["end"] = fmt_clock(lr.e), reason = t("reason." .. lr.reason) })) .. "<br>"
    end
    body = esc(mode_line) .. "<br>" .. last_line
      .. esc(t("status.footer", { clock = fmt_clock(now_seconds()), count = #rows })) .. "<br>"
      .. coverage_lines() .. esc(t("status.csvPath", { path = out_path }))
  end
  w_status:set_text(esc(msg) .. "<br>" .. body)
  if d then d:update() end
end

-- Clear the form back to a fresh "new rally" state (reason reset = non-sticky).
local function reset_form()
  mode = "new"
  edit_index = nil
  if w_start then w_start:set_text("") end
  if w_end then w_end:set_text("") end
  if w_shots then w_shots:set_text("") end
  rebuild_reason_default()
  refresh_buttons()
  if d then d:update() end
end

-- Re-resolve the CSV path against whatever video is playing NOW and load its
-- labels. Lets the user open a video later (or switch videos) and pick up exactly
-- where they left off without toggling the extension off/on. Same video -> just
-- re-read the CSV; a different video -> repoint and load that video's rallies.
local function sync_to_current_video()
  if mode == "edit" then
    -- Reloading rows would invalidate edit_index; make the user resolve the edit first.
    refresh_list(); refresh_buttons()
    set_status(t("sync.editFirst"))
    return
  end
  local media = current_media_path()
  if not media then
    refresh_list(); refresh_buttons()
    set_status(t("sync.noMedia"))
    return
  end
  out_path_is_fallback = false   -- a video is playing now -> we have a real path
  local new_path = resolve_out_path()
  if new_path == out_path then
    -- BEFORE the reload: decide whether the clip screen holds unsaved work, while `clip` still
    -- holds what was last committed. Asking afterwards would read a sidecar changed on disk as
    -- operator input and re-stage the stale widgets over it.
    capture_clip_form()
    load_rows()                  -- re-read in case the file changed on disk
    load_clipmeta(); adopt_row_sport_if_missing(); load_reviews(); detect_legacy_windows()
    refresh_next_field()
    refresh_list(); refresh_buttons(); refresh_video_sport()
    -- The Clip info / Target / Review screens paint from widgets, not from state, so a
    -- reload alone would leave them showing pre-reload text. Rebuild those screens.
    if screen ~= "rally" then rebuild_after_sync(false) end
    set_status(t("sync.refreshed", { count = #rows }))
    return
  end
  out_path = new_path            -- switched videos -> repoint + resume that file
  load_rows()
  load_clipmeta(); adopt_row_sport_if_missing(); load_reviews(); detect_legacy_windows()
  reset_form()
  refresh_next_field()
  refresh_list()
  refresh_video_sport()
  refresh_buttons()
  -- Switching video must not carry the previous clip's fields across. Without this the
  -- Clip info boxes still held video A's venue/court counts while `clip_path` already
  -- pointed at video B, so a Save would have written A's metadata into B's sidecar.
  if not clipmeta_exists then screen = "clip" end
  rebuild_after_sync(true)
  set_status(t("sync.switched", { count = #rows, n = next_rally_number() }))
end

-- Lazily adopt the playing video's CSV. We may have started on the home-dir FALLBACK
-- (extension enabled before the video was loaded, so no path was resolvable then). The
-- moment a timestamp exists the video is provably playing, so switch to <video>.rallies.csv
-- and load that video's existing rallies BEFORE anything is written to the fallback -- this
-- is what makes "enable, then open the video" and pause/restart resume correctly instead of
-- silently writing to ~/rally_labels.csv. No-op once we're already on a real video CSV.
local function adopt_current_video_csv()
  if not out_path_is_fallback then return end
  local media = current_media_path()
  if not media then return end           -- still no video -> stay on the fallback for now
  out_path_is_fallback = false           -- a real path is resolvable now
  local p = resolve_out_path()
  if p == out_path then return end       -- already pointing there (defensive)
  out_path = p
  load_rows()                            -- pick up rallies already saved for this video
  load_clipmeta(); adopt_row_sport_if_missing(); load_reviews(); detect_legacy_windows()
  clip_form = nil                        -- a real clip now, possibly with recorded metadata of its
                                         -- own: staged fallback edits must not shadow what it says
  refresh_next_field()
  refresh_list()
  refresh_video_sport()
end

-- Seek the player by delta_s seconds (relative), clamped at 0 (time is microseconds in 3.x/4.x).
local function seek_by(delta_s)
  local cur = get_time_us()   -- microseconds (named 'cur', not 't', to not shadow t())
  if not cur then set_status(t("seek.noMedia")); return end
  local nt = cur + delta_s * 1000000
  if nt < 0 then nt = 0 end
  if not set_time_us(nt) then set_status(t("seek.noTime")); return end
  set_status(t("seek.done", { delta = string.format("%+d", delta_s), clock = fmt_clock(nt / 1000000.0) }))
end

--------------------------------------------------------------------------------
-- Button callbacks (VLC calls these on its main loop; kept global to be safe)
--------------------------------------------------------------------------------
function mark_start()
  local now = now_seconds()
  if not now then set_status(t("markStart.noMedia")); return end
  if is_armed() then
    set_status(t("markStart.armed"))
    return
  end
  adopt_current_video_csv()   -- video is playing now: make sure we're on its CSV, not the fallback
  w_start:set_text(string.format("%.3f", now))
  refresh_buttons()
  set_status(t("markStart.set", { clock = fmt_clock(now) }))
end

function mark_end()
  local now = now_seconds()
  if not now then set_status(t("markEnd.noMedia")); return end
  w_end:set_text(string.format("%.3f", now))
  refresh_buttons()
  set_status(t("markEnd.set", { clock = fmt_clock(now) }))
end

function save_rally()
  adopt_current_video_csv()   -- in case times were typed by hand without Mark START
  local s = get_field_num(w_start)
  local e = get_field_num(w_end)
  if not s then set_status(t("save.needStart")); return end
  if not e then set_status(t("save.needEnd")); return end
  if e < s then s, e = e, s end   -- tolerate reversed marks
  if e <= s then
    set_status(t("save.zeroLen"))
    return
  end
  -- The reason belongs to this rally. Sport does not: Clip info owns one canonical value for
  -- the whole video, repeated into each CSV row only for interchange compatibility.
  local rid = w_reason:get_value()
  local reason = (rid == nil or rid == 0) and REASON_DEFAULT or (REASONS[rid] or REASON_DEFAULT)
  local sport = video_sport()
  if not sport then set_status(t("save.needVideoSport")); return end
  if sport_mismatch_count(sport) > 0 then
    set_status(t("save.mixedVideoSport")); return
  end
  local shots = get_shots()                -- optional; nil when blank
  local shots_note = (shots ~= nil) and string.format(", %d shots", shots) or ""

  local msg
  if mode == "edit" and edit_index and rows[edit_index] then
    local r = rows[edit_index]
    r.s, r.e, r.reason, r.sport, r.shots = s, e, reason, sport, shots
    local ok, err = save_all()
    if not ok then set_status(t("save.writeFailed", { err = tostring(err) })); return end
    msg = t("save.updated", { n = r.n, start = fmt_clock(s), ["end"] = fmt_clock(e),
      reason = t("reason." .. reason), sport = t("sport." .. sport), shots = shots_note })
  else
    local n = planned_next_number()
    if index_of_rally(n) then
      set_status(t("save.duplicate", { n = n }))
      return
    end
    rows[#rows + 1] = { n = n, s = s, e = e, reason = reason, sport = sport, shots = shots }
    local ok, err = save_all()
    if not ok then rows[#rows] = nil; set_status(t("save.writeFailed", { err = tostring(err) })); return end
    if w_next then w_next:set_text(tostring(next_free_from(n + 1))) end   -- next free number
    msg = t("save.saved", { n = n, start = fmt_clock(s), ["end"] = fmt_clock(e),
      reason = t("reason." .. reason), sport = t("sport." .. sport), shots = shots_note })
  end

  reset_form()       -- clears fields + resets the (required) reason to placeholder
  refresh_list()
  set_status(msg)
end

function edit_selected()
  if is_armed() then
    set_status(t("edit.armedGuard"))
    return
  end
  local n = selected_rally_number()
  if not n then set_status(t("edit.needSelect")); return end
  local idx = index_of_rally(n)
  if not idx then set_status(t("edit.notFound", { n = n })); return end
  local r = rows[idx]
  mode = "edit"; edit_index = idx
  w_start:set_text(string.format("%.3f", r.s))
  w_end:set_text(string.format("%.3f", r.e))
  if w_shots then w_shots:set_text(r.shots ~= nil and tostring(r.shots) or "") end
  rebuild_reason_selected(r.reason)
  refresh_buttons()
  set_status(t("edit.editing", { n = r.n }))
end

function delete_selected()
  local n = selected_rally_number()
  if not n then set_status(t("del.needSelect")); return end
  local idx = index_of_rally(n)
  if not idx then set_status(t("edit.notFound", { n = n })); return end
  table.remove(rows, idx)
  local ok, err = save_all()
  if not ok then set_status(t("save.writeFailed", { err = tostring(err) })); return end
  reset_form()
  refresh_next_field()
  refresh_list()
  set_status(t("del.deleted", { n = n, count = #rows }))
end

function undo_last()
  if mode == "edit" then
    reset_form(); refresh_list(); set_status(t("undo.cancelled"))
    return
  end
  local s = get_field_num(w_start)
  local e = get_field_num(w_end)
  if s or e then
    reset_form()
    set_status(t("undo.cleared"))
    return
  end
  if #rows == 0 then set_status(t("undo.nothing")); return end
  local last = rows[#rows]
  rows[#rows] = nil
  local ok, err = save_all()
  if not ok then rows[#rows + 1] = last; set_status(t("save.writeFailed", { err = tostring(err) })); return end
  refresh_list()
  refresh_next_field()
  refresh_buttons()
  set_status(t("undo.removed", { n = last.n, count = #rows }))
end

function refresh_now()
  sync_to_current_video()
end

--------------------------------------------------------------------------------
-- Clip info (docs/CLIP_METADATA.md)
--------------------------------------------------------------------------------

-- A blank box is NOT zero and NOT a default -- it is "not screened", which the sidecar
-- writes as null. Returns (value, ok): ok is false only for text that is present but not a
-- valid count, so a typo is refused loudly instead of silently recording nothing.
local function opt_count(w, min)
  if not w then return nil, true end
  local raw = (w:get_text() or ""):gsub("%s+", "")
  if raw == "" then return nil, true end
  local v = tonumber(raw)
  if not v or v ~= math.floor(v) or v < min then return nil, false end
  return math.floor(v), true
end

local function opt_text(w)
  if not w then return nil end
  local s = (w:get_text() or ""):gsub("^%s+", ""):gsub("%s+$", "")
  if s == "" then return nil end
  return s
end

local function camera_setup_index(value)
  for i, setup in ipairs(CAMERA_SETUP_IDS) do if setup == value then return i end end
  return 0
end

local function camera_setup_from_widgets()
  local id = w_camera_picker and w_camera_picker:get_value() or 0
  if id and id > 0 and CAMERA_SETUP_IDS[id] then return CAMERA_SETUP_IDS[id] end
  return opt_text(w_camera)
end

function save_clip_info()
  local sport_id = w_clip_sport and w_clip_sport:get_value() or 0
  local sport = (sport_id ~= nil and sport_id ~= 0) and SPORTS[sport_id] or nil
  if not canonical_sport(sport) then set_status(t("save.needVideoSport")); return end
  local visible, ok1 = opt_count(w_visible, 1)
  if not ok1 then
    set_status(t("clip.invalidNumber", { field = t("label.courtsVisible"), min = 1 })); return
  end
  local active, ok2 = opt_count(w_active, 1)
  if not ok2 then
    set_status(t("clip.invalidNumber", { field = t("label.courtsActive"), min = 1 })); return
  end
  local partial, ok3 = opt_count(w_partial, 0)
  if not ok3 then
    set_status(t("clip.invalidNumber", { field = t("label.courtsPartial"), min = 0 })); return
  end
  -- Same invariant sports-data-collector enforces with a model validator, so an invalid
  -- sidecar can never reach import.
  if visible and active and active > visible then
    set_status(t("clip.invalidActive", { active = active, visible = visible })); return
  end
  if visible and partial and partial > visible then
    set_status(t("clip.invalidPartial", { partial = partial, visible = visible })); return
  end

  local old_clip = {}
  for key, value in pairs(clip) do old_clip[key] = value end

  local fid = w_format and w_format:get_value() or 0
  local camera_picker_id = w_camera_picker and w_camera_picker:get_value() or 0
  local camera_custom = opt_text(w_camera)
  local camera_picker_wins = camera_picker_id and camera_picker_id > 0 and camera_custom ~= nil
  clip.match_format = (fid ~= nil and fid ~= 0) and MATCH_FORMATS[fid] or nil
  clip.venue_id = opt_text(w_venue)
  clip.target_court_id = opt_text(w_target_court)
  clip.camera_setup_id = camera_setup_from_widgets()
  clip.notes = opt_text(w_notes)
  clip.court_count, clip.active_court_count, clip.partially_visible_court_count =
    visible, active, partial
  clip.capture_time_utc = container_capture_time()   -- container only; never the path
  clip.sport = sport

  -- One explicit Clip info choice owns the video. The CSV keeps its historical sport column,
  -- but every existing row is normalized to this value in the same user action so mixed-video
  -- metadata cannot survive a resume or an edit. Roll back memory if the safe CSV swap fails.
  local old_sports, normalized = {}, 0
  for i, row in ipairs(rows) do
    old_sports[i] = row.sport
    if row.sport ~= sport then row.sport = sport; normalized = normalized + 1 end
  end
  if normalized > 0 then
    -- Defer the automatic sidecar refresh until the explicit sidecar write below. Otherwise
    -- a failed sidecar write could leave the normalized CSV paired with stale video metadata.
    local okr, rerr = save_all(true)
    if not okr then
      for i, old in ipairs(old_sports) do rows[i].sport = old end
      clip = old_clip
      set_status(t("save.writeFailed", { err = tostring(rerr) }))
      return
    end
  end

  local okw, err = save_clipmeta_file()
  if not okw then
    clip = old_clip
    local rollback_err = nil
    if normalized > 0 then
      for i, old in ipairs(old_sports) do rows[i].sport = old end
      local rolled_back, rerr = save_all(true)
      if not rolled_back then rollback_err = rerr end
    end
    local detail = tostring(err)
    if rollback_err then detail = detail .. "; CSV rollback failed: " .. tostring(rollback_err) end
    set_status(t("save.writeFailed", { err = detail }))
    return
  end
  clip_form = nil                        -- committed; `clip` is the source of truth again
  clipmeta_exists = true
  clip_prefill_source = nil
  clipmeta_has_unknown_top_level = false
  legacy_target_court = clip.target_court_id
  local summary = string.format("%s/%s courts", visible and tostring(visible) or "?",
                                active and tostring(active) or "?")
  -- A null match_format is WARNED, never blocked. Blocking would force an answer out of an
  -- operator who cannot tell, and a guessed singles/doubles is worse than a recorded "unknown".
  -- But it is not silent either: the downstream primary-split gate cannot evidence its
  -- singles+doubles minimum from nulls, and finding out then costs a re-annotation round trip.
  local saved_status = t(clip.match_format and "clip.saved" or "clip.savedNoFormat",
                         { summary = summary })
  if normalized > 0 then
    saved_status = saved_status .. " " .. t("clip.sportNormalized", {
      count = normalized, sport = t("sport." .. sport),
    })
  end
  if camera_picker_wins then saved_status = saved_status .. " " .. t("clip.savedPickerWins") end
  set_status(saved_status)
end

--------------------------------------------------------------------------------
-- Target profiles (docs/TARGET_REVIEW.md)
--------------------------------------------------------------------------------
function save_target_profile()
  if not w_sec then return end
  local poly, perr = parse_polygon(w_poly and w_poly:get_text() or "")
  if not poly then set_status(t(perr)); return end
  local vid = w_validity and w_validity:get_value() or 1
  local p = {
    section = opt_text(w_sec) or "",
    court = opt_text(w_court) or "",
    profile_id = opt_text(w_profile),
    poly = poly,
    validity = SETUP_VALIDITY[vid] or SETUP_VALIDITY[#SETUP_VALIDITY],
    notes = opt_text(w_tnotes),
  }
  -- Re-saving an existing section REPLACES it, so the duplicate check excludes it.
  local others, at = {}, nil
  for i, o in ipairs(profiles) do
    if o.section == p.section then at = i else others[#others + 1] = o end
  end
  local key, vars = validate_profile(p, others)
  if key then set_status(t(key, vars)); return end

  if at then profiles[at] = p else profiles[#profiles + 1] = p end
  selected_section = p.section
  local ok, err = save_clipmeta_file()
  if not ok then set_status(t("save.writeFailed", { err = tostring(err) })); return end
  clipmeta_exists = true
  clip_prefill_source = nil
  target_refresh()
  set_status(t("target.saved", { section = p.section, n = #poly,
                                 pct = string.format("%.1f", polygon_area(poly) * 100) }))
end

function delete_target_profile()
  local idx = selected_profile_index()
  if not idx or not profiles[idx] then set_status(t("target.needSelect")); return end
  local section = profiles[idx].section
  table.remove(profiles, idx)
  selected_section = nil
  local ok, err = save_clipmeta_file()
  if not ok then set_status(t("save.writeFailed", { err = tostring(err) })); return end
  clipmeta_exists = true
  clip_prefill_source = nil
  target_refresh()
  set_status(t("target.deleted", { section = section }))
end

-- Load the selected profile back into the fields. VLC dropdowns have no set_value, so showing
-- its validity as selected means rebuilding the grid -- the same widget-swap the reason
-- dropdown uses.
function edit_target_profile()
  local idx = selected_profile_index()
  if not idx or not profiles[idx] then set_status(t("target.needSelect")); return end
  selected_section = profiles[idx].section
  if d then d:delete(); d = nil end
  create_dialog()
  set_status(t("target.loaded", { section = selected_section }))
end

--------------------------------------------------------------------------------
-- Sparse target-state review (docs/TARGET_REVIEW.md)
--------------------------------------------------------------------------------
function mark_rv_start()
  if not w_rv_start then return end
  local now = now_seconds()
  if not now then set_status(t("markStart.noMedia")); return end
  adopt_current_video_csv()
  w_rv_start:set_text(string.format("%.3f", now))
  target_refresh()
  set_status(t("markStart.set", { clock = fmt_clock(now) }))
end

function mark_rv_end()
  if not w_rv_end then return end
  local now = now_seconds()
  if not now then set_status(t("markEnd.noMedia")); return end
  w_rv_end:set_text(string.format("%.3f", now))
  target_refresh()
  set_status(t("markEnd.set", { clock = fmt_clock(now) }))
end

local function reset_rv_form()
  if w_rv_start then w_rv_start:set_text("") end
  if w_rv_end then w_rv_end:set_text("") end
  if w_rv_notes then w_rv_notes:set_text("") end
end

function save_review()
  adopt_current_video_csv()
  local a = get_field_num(w_rv_start)
  local b = get_field_num(w_rv_end)
  if not a then set_status(t("save.needStart")); return end
  if not b then set_status(t("save.needEnd")); return end
  if b < a then a, b = b, a end
  if b <= a then set_status(t("save.zeroLen")); return end
  -- A review answers a question about a camera section, so there is nothing to answer until a
  -- target profile exists.
  if #profiles == 0 then set_status(t("target.needProfile")); return end

  local sid = w_rv_state and w_rv_state:get_value() or 1
  local state = TARGET_STATES[sid] or TARGET_STATES[1]
  local secid = w_rv_section and w_rv_section:get_value() or 1
  local section = (profiles[secid] and profiles[secid].section) or profiles[1].section
  local n = next_review_number()
  reviews[#reviews + 1] = { n = n, s = a, e = b, state = state, section = section,
                            source = "operator",
                            notes = (w_rv_notes and w_rv_notes:get_text()) or "" }
  local ok, err = save_reviews()
  if not ok then
    reviews[#reviews] = nil
    set_status(t("save.writeFailed", { err = tostring(err) })); return
  end
  reset_rv_form()
  target_refresh()
  set_status(t("review.saved", { n = n, start = fmt_clock(a), ["end"] = fmt_clock(b),
                                 state = t("state." .. state) }))
end

function delete_review()
  local n = selected_review_number()
  if not n then set_status(t("del.needSelect")); return end
  local idx = index_of_review(n)
  if not idx then set_status(t("edit.notFound", { n = n })); return end
  table.remove(reviews, idx)
  local ok, err = save_reviews()
  if not ok then set_status(t("save.writeFailed", { err = tostring(err) })); return end
  target_refresh()
  set_status(t("review.deleted", { n = n, count = #reviews }))
end

function undo_review()
  if get_field_num(w_rv_start) or get_field_num(w_rv_end) then
    reset_rv_form(); target_refresh(); set_status(t("undo.cleared")); return
  end
  if #reviews == 0 then set_status(t("review.nothing")); return end
  local last = reviews[#reviews]
  reviews[#reviews] = nil
  local ok, err = save_reviews()
  if not ok then
    reviews[#reviews + 1] = last
    set_status(t("save.writeFailed", { err = tostring(err) })); return
  end
  target_refresh()
  set_status(t("review.removed", { n = last.n, count = #reviews }))
end

-- Playback control (VLC 3.x + 4.x playlist API). pause() is a TOGGLE
-- (playlist_TogglePause), so we branch on status() to keep one Play / Pause button
-- deterministic: pause() flips playing<->paused, and from stopped we play() fresh.
function play_pause()
  local st = vlc.playlist and vlc.playlist.status and vlc.playlist.status()
  if st == "playing" then
    vlc.playlist.pause()        -- toggles playing -> paused
    set_status(t("play.paused"))
  elseif st == "paused" then
    vlc.playlist.pause()        -- toggles paused -> playing
    set_status(t("play.resumed"))
  elseif st == "stopped" then
    vlc.playlist.play()
    set_status(t("play.started"))
  else
    set_status(t("play.noMedia"))
  end
end

function seek_back() seek_by(-5) end
function seek_fwd()  seek_by(5) end

function show_help()
  -- Toggle a DEDICATED help panel by adding/removing a widget. In-place set_text on
  -- the shared status widget did not repaint reliably in VLC (the panel got "stuck");
  -- add_html + del_widget forces a real layout change that VLC renders every time.
  if w_help then
    if d then d:del_widget(w_help) end
    w_help = nil
    if w_help_btn then w_help_btn:set_text(t("btn.help")) end
  else
    if d then w_help = d:add_html(t("help.html"), 1, help_row, 4, 8) end
    if w_help_btn then w_help_btn:set_text(t("btn.hideHelp")) end
  end
  if d then d:update() end
end

--------------------------------------------------------------------------------
-- Dialog construction
--------------------------------------------------------------------------------
-- Snapshot the editable widgets into module state before a screen rebuild. Without this an
-- in-progress START -> END would be silently discarded -- the very loss the v1.6.4 armed guard
-- exists to prevent.
function capture_form()
  if w_start then form.start = w_start:get_text() or "" end
  if w_end then form.stop = w_end:get_text() or "" end
  if w_shots then form.shots = w_shots:get_text() or "" end
  if w_next then form.next = w_next:get_text() or "" end
  if w_reason then
    local rid = w_reason:get_value()
    form.reason = (rid == nil or rid == 0) and REASON_DEFAULT or (REASONS[rid] or REASON_DEFAULT)
  end
  if w_rv_start then rv_form.start = w_rv_start:get_text() or "" end
  if w_rv_end then rv_form.stop = w_rv_end:get_text() or "" end
  if w_rv_notes then rv_form.notes = w_rv_notes:get_text() or "" end
  if w_rv_state then
    local sid = w_rv_state:get_value()
    rv_form.state = (sid ~= nil and TARGET_STATES[sid]) or rv_form.state
  end
end

-- Clip info, captured exactly as the operator left it -- raw strings, not validated counts -- so a
-- rebuild hands their work back verbatim (typos included, to be corrected rather than silently
-- dropped). Only save_clip_info validates and commits into `clip`.
--
-- A CLEAN form is deliberately not staged. build_clip_screen prefers clip_form over clip, so
-- staging a form that merely agrees with `clip` would pin the screen to those values and mask a
-- sidecar edited on disk between saves -- and the next Save would write the stale value back over
-- it. Only a genuinely dirty form is worth protecting from a rebuild; when nothing is in progress
-- the freshly loaded `clip` must win.
--
-- This is SEPARATE from capture_form() because it must run BEFORE a reload, not after: the
-- dirtiness question is "does the screen differ from what was last committed", and comparing
-- against an already-reloaded `clip` would read every externally-changed field as operator input.
function capture_clip_form()
  if not w_venue then return end            -- clip screen not built; leave any staged form alone
  local fid = w_format and w_format:get_value() or 0
  local sport_id = w_clip_sport and w_clip_sport:get_value() or 0
  local staged = {
    sport = (sport_id ~= nil and sport_id ~= 0) and SPORTS[sport_id] or nil,
    venue_id = w_venue:get_text() or "",
    target_court_id = w_target_court and w_target_court:get_text() or "",
    camera_setup_id = camera_setup_from_widgets() or "",
    court_count = w_visible and w_visible:get_text() or "",
    active_court_count = w_active and w_active:get_text() or "",
    partially_visible_court_count = w_partial and w_partial:get_text() or "",
    match_format = (fid ~= nil and fid ~= 0) and MATCH_FORMATS[fid] or nil,
    notes = w_notes and w_notes:get_text() or "",
  }
  local function shown(v) return v == nil and "" or tostring(v) end
  local dirty = false
  for _, k in ipairs({ "sport", "venue_id", "target_court_id", "camera_setup_id",
                       "court_count", "active_court_count",
                       "partially_visible_court_count", "match_format", "notes" }) do
    if shown(staged[k]) ~= shown(clip[k]) then dirty = true; break end
  end
  clip_form = dirty and staged or nil
end

-- Repaint the profile list, the review list and the review Save caption.
function target_refresh()
  -- Repainting the status here is what makes the coordinate box self-checking: paste a line and
  -- the panel immediately says how many corners it parsed and how much of the frame they cover.
  if w_status and screen == "target" then set_status(last_status_msg or "") end
  if w_profile_list then
    w_profile_list:clear()
    for i, p in ipairs(profiles) do
      w_profile_list:add_value(string.format("%s -> %s  [%s]  %dpt", p.section, p.court,
        t("validity." .. p.validity), #p.poly), i)
    end
  end
  if w_rv_list then
    w_rv_list:clear()
    for _, r in ipairs(reviews) do
      local label = string.format("#%d   %s -> %s   [%s]  %s", r.n, fmt_clock(r.s), fmt_clock(r.e),
        t("state." .. r.state), r.section or "")
      if r.notes ~= nil and r.notes ~= "" then label = label .. "   " .. r.notes end
      w_rv_list:add_value(label, r.n)
    end
  end
  if w_rv_save then
    if w_rv_start and get_field_num(w_rv_start) and get_field_num(w_rv_end) then
      w_rv_save:set_text(t("btn.saveReviewN", { n = next_review_number() }))
    else
      w_rv_save:set_text(t("btn.saveReview"))
    end
  end
  if d then d:update() end
end

-- Operator navigation only exposes rally annotation and clip facts. Target profiles/reviews remain
-- readable for sidecar compatibility, but their manual editors are deliberately not reachable.
local function build_nav()
  local function cap(key, mine) return (screen == mine and "\226\150\184 " or "") .. t(key) end
  d:add_button(cap("nav.rallies", "rally"), show_rallies, 1, 1, 2, 1)
  d:add_button(cap("nav.clip",    "clip"),  show_clip,    3, 1, 2, 1)
end

local function build_rally_screen()
  d:add_label(t("label.sport"), 1, 2, 1, 1)
  local sport = video_sport()
  w_video_sport = d:add_label(sport and t("sport." .. sport) or t("fmt.unset"), 2, 2, 2, 1)
  w_help_btn = d:add_button(t("btn.help"), show_help, 4, 2, 1, 1)

  -- Playback controls -- one row of 3: Back 5s | Play / Pause (toggle) | Fwd 5s.
  d:add_button(t("btn.back5"),     seek_back,  1, 3, 1, 1)
  d:add_button(t("btn.playPause"), play_pause, 2, 3, 2, 1)   -- spans cols 2-3, centered
  d:add_button(t("btn.fwd5"),      seek_fwd,   4, 3, 1, 1)

  d:add_label(t("label.start"), 1, 4, 1, 1)
  w_start = d:add_text_input(form.start, 2, 4, 1, 1)
  d:add_label(t("label.end"), 3, 4, 1, 1)
  w_end = d:add_text_input(form.stop, 4, 4, 1, 1)

  d:add_label(t("label.next"), 1, 5, 1, 1)
  w_next = d:add_text_input("", 2, 5, 1, 1)
  d:add_label(t("label.shots"), 3, 5, 1, 1)   -- optional; blank => shots_count left empty
  w_shots = d:add_text_input(form.shots, 4, 5, 1, 1)

  d:add_label(t("label.reason"), 3, 6, 1, 1)   -- labels the reason dropdown directly below it

  -- Per-rally commit row, left-to-right: Mark START -> Mark END -> reason -> Save.
  w_mark_start = d:add_button(t("btn.markStart"), mark_start, 1, 7, 1, 1)
  w_mark_end   = d:add_button(t("btn.markEnd"),   mark_end,   2, 7, 1, 1)
  rebuild_reason_selected(form.reason)         -- creates w_reason at (3,7,1,1), under its label
  w_save = d:add_button(t("btn.saveRally"), save_rally, 4, 7, 1, 1)

  w_status = d:add_html("", 1, 8, 4, 2)   -- rich-text status panel (multi-line via <br>)

  d:add_label(t("label.recent"), 1, 10, 4, 1)
  w_list = d:add_list(1, 11, 4, 4)

  d:add_button(t("btn.edit"),   edit_selected,   1, 15, 1, 1)
  d:add_button(t("btn.delete"), delete_selected, 2, 15, 1, 1)
  w_undo = d:add_button(t("btn.undo"), undo_last, 3, 15, 1, 1)
  d:add_button(t("btn.refresh"), refresh_now,     4, 15, 1, 1)

  help_row = 16
  refresh_next_field()
  if form.next ~= "" and w_next then w_next:set_text(form.next) end
  refresh_list()
  refresh_buttons()
end

-- Clip info. Every input starts from the stored value or EMPTY -- never a plausible
-- default -- because an empty field is written as JSON null, meaning "not screened", which
-- sports-data-collector treats differently from a recorded negative.
local function build_clip_screen()
  local function txt(v) return v ~= nil and tostring(v) or "" end
  -- Paint from the in-progress capture when there is one, so a screen switch or same-video
  -- Refresh returns the operator's unsaved input instead of resetting the screen.
  local src = clip_form or clip
  d:add_label(t("label.venue"), 1, 2, 1, 1)
  w_venue = d:add_text_input(txt(src.venue_id), 2, 2, 1, 1)
  d:add_label(t("label.targetCourt"), 3, 2, 1, 1)
  w_target_court = d:add_text_input(txt(src.target_court_id), 4, 2, 1, 1)

  d:add_label(t("label.cameraSetup"), 1, 3, 1, 1)
  w_camera_picker = d:add_dropdown(2, 3, 1, 1)
  local camera_pick = camera_setup_index(src.camera_setup_id)
  if camera_pick > 0 then
    w_camera_picker:add_value(CAMERA_SETUP_IDS[camera_pick], camera_pick)
  else
    w_camera_picker:add_value(t("fmt.unset"), 0)
  end
  for i, v in ipairs(CAMERA_SETUP_IDS) do
    if i ~= camera_pick then w_camera_picker:add_value(v, i) end
  end
  if camera_pick > 0 then w_camera_picker:add_value(t("fmt.unset"), 0) end
  -- VLC dropdowns cannot accept a custom value. Keep a text field alongside the
  -- vocabulary picker so older or venue-specific identifiers remain round-trippable.
  w_camera = d:add_text_input(camera_pick == 0 and txt(src.camera_setup_id) or "", 3, 3, 2, 1)

  d:add_label(t("label.courtsVisible"), 1, 4, 1, 1)
  w_visible = d:add_text_input(txt(src.court_count), 2, 4, 1, 1)
  d:add_label(t("label.courtsActive"), 3, 4, 1, 1)
  w_active = d:add_text_input(txt(src.active_court_count), 4, 4, 1, 1)

  d:add_label(t("label.courtsPartial"), 1, 5, 1, 1)
  w_partial = d:add_text_input(txt(src.partially_visible_court_count), 2, 5, 1, 1)
  d:add_label(t("label.sport"), 3, 5, 1, 1)
  w_clip_sport = d:add_dropdown(4, 5, 1, 1)
  rebuild_clip_sport_selected(src.sport or video_sport())

  -- "(not set)" is added FIRST so it shows selected, i.e. the default writes null.
  d:add_label(t("label.matchFormat"), 1, 6, 1, 1)
  w_format = d:add_dropdown(2, 6, 1, 1)
  local sel = src.match_format
  if sel then
    for i, v in ipairs(MATCH_FORMATS) do if v == sel then w_format:add_value(t("fmt." .. v), i) end end
    w_format:add_value(t("fmt.unset"), 0)
    for i, v in ipairs(MATCH_FORMATS) do
      if v ~= sel then w_format:add_value(t("fmt." .. v), i) end
    end
  else
    w_format:add_value(t("fmt.unset"), 0)
    for i, v in ipairs(MATCH_FORMATS) do w_format:add_value(t("fmt." .. v), i) end
  end

  -- Capture time is READ-ONLY on purpose: there is no box to type a date into, because an
  -- operator-typed date is exactly the "folder says May 19, container says May 21" failure
  -- this sidecar exists to prevent. It is written only when the container supplies one.
  d:add_label(t("label.captureTime"), 3, 6, 1, 1)
  w_capture = d:add_label(clip.capture_time_utc or t("clip.captureUnknown"), 4, 6, 1, 1)

  d:add_label(t("label.notes"), 1, 7, 1, 1)
  w_notes = d:add_text_input(txt(src.notes), 2, 7, 3, 1)

  d:add_button(t("btn.saveClip"), save_clip_info, 1, 8, 1, 1)
  w_help_btn = d:add_button(t("btn.help"), show_help, 2, 8, 1, 1)
  d:add_button(t("btn.refresh"), refresh_now, 4, 8, 1, 1)

  w_status = d:add_html("", 1, 9, 4, 2)
  help_row = 11
end

-- Target profile: one per static camera section. Fields prefill from the selected profile so
-- editing is load-change-save, and geometry is validated fail-closed on save.
local function build_target_screen()
  local sel
  for _, p in ipairs(profiles) do if p.section == selected_section then sel = p end end
  local function txt(v) return v ~= nil and tostring(v) or "" end

  d:add_label(t("label.cameraSection"), 1, 2, 1, 1)
  w_sec = d:add_text_input(txt(sel and sel.section), 2, 2, 1, 1)
  d:add_label(t("label.targetCourt"), 3, 2, 1, 1)
  -- The declarative top-level target is only a DEFAULT here and is never promoted into a
  -- legacy profile without a human supplying a section and a polygon.
  w_court = d:add_text_input(txt(sel and sel.court or legacy_target_court), 4, 2, 1, 1)

  d:add_label(t("label.cameraProfile"), 1, 3, 1, 1)
  w_profile = d:add_text_input(txt(sel and sel.profile_id or clip.camera_setup_id), 2, 3, 1, 1)
  d:add_label(t("label.setupValidity"), 3, 3, 1, 1)
  w_validity = d:add_dropdown(4, 3, 1, 1)
  local pick = (sel and sel.validity) or SETUP_VALIDITY[1]
  for i, v in ipairs(SETUP_VALIDITY) do                 -- selected first => shown selected
    if v == pick then w_validity:add_value(t("validity." .. v), i) end
  end
  for i, v in ipairs(SETUP_VALIDITY) do
    if v ~= pick then w_validity:add_value(t("validity." .. v), i) end
  end

  d:add_label(t("label.polygon"), 1, 4, 1, 1)
  w_poly = d:add_text_input(sel and format_polygon(sel.poly) or "", 2, 4, 3, 1)
  d:add_label(t("label.notes"), 1, 5, 1, 1)
  w_tnotes = d:add_text_input(txt(sel and sel.notes), 2, 5, 2, 1)
  w_help_btn = d:add_button(t("btn.help"), show_help, 4, 5, 1, 1)

  d:add_button(t("btn.saveTarget"), save_target_profile, 1, 6, 2, 1)
  d:add_button(t("btn.loadProfile"), edit_target_profile, 3, 6, 1, 1)
  d:add_button(t("btn.deleteProfile"), delete_target_profile, 4, 6, 1, 1)

  w_status = d:add_html("", 1, 7, 4, 2)
  d:add_label(t("label.profiles"), 1, 9, 4, 1)
  w_profile_list = d:add_list(1, 10, 4, 3)

  help_row = 13
  target_refresh()
end

-- Sparse target-state review: one question, three answers, about the TARGET court only.
-- There is deliberately no quota, no tally and no per-category progress -- this is
-- active-learning evidence, not a count gate.
local function build_review_screen()
  d:add_button(t("btn.back5"),     seek_back,  1, 2, 1, 1)
  d:add_button(t("btn.playPause"), play_pause, 2, 2, 2, 1)
  d:add_button(t("btn.fwd5"),      seek_fwd,   4, 2, 1, 1)

  d:add_label(t("label.start"), 1, 3, 1, 1)
  w_rv_start = d:add_text_input(rv_form.start, 2, 3, 1, 1)
  d:add_label(t("label.end"), 3, 3, 1, 1)
  w_rv_end = d:add_text_input(rv_form.stop, 4, 3, 1, 1)

  d:add_label(t("label.cameraSection"), 1, 4, 1, 1)
  w_rv_section = d:add_dropdown(2, 4, 1, 1)
  for i, p in ipairs(profiles) do w_rv_section:add_value(p.section, i) end
  d:add_label(t("label.targetState"), 3, 4, 1, 1)
  w_rv_state = d:add_dropdown(4, 4, 1, 1)
  local pick = rv_form.state or TARGET_STATES[1]
  for i, v in ipairs(TARGET_STATES) do
    if v == pick then w_rv_state:add_value(t("state." .. v), i) end
  end
  for i, v in ipairs(TARGET_STATES) do
    if v ~= pick then w_rv_state:add_value(t("state." .. v), i) end
  end

  d:add_label(t("label.notes"), 1, 5, 1, 1)
  w_rv_notes = d:add_text_input(rv_form.notes, 2, 5, 3, 1)

  d:add_button(t("btn.markStart"), mark_rv_start, 1, 6, 1, 1)
  d:add_button(t("btn.markEnd"),   mark_rv_end,   2, 6, 1, 1)
  w_rv_save = d:add_button(t("btn.saveReview"), save_review, 3, 6, 1, 1)
  w_help_btn = d:add_button(t("btn.help"), show_help, 4, 6, 1, 1)

  w_status = d:add_html("", 1, 7, 4, 2)
  d:add_label(t("label.recentReviews"), 1, 9, 4, 1)
  w_rv_list = d:add_list(1, 10, 4, 4)

  d:add_button(t("btn.delete"),  delete_review, 1, 14, 1, 1)
  d:add_button(t("btn.undo"),    undo_review,   2, 14, 1, 1)
  d:add_button(t("btn.refresh"), refresh_now,   4, 14, 1, 1)

  help_row = 15
  target_refresh()
end

function create_dialog()
  d = vlc.dialog("Rally Annotator v" .. VERSION)
  -- Every handle from the previous grid is stale after a rebuild; nil them so the shared
  -- refreshers no-op for widgets the current screen does not have.
  w_status, w_reason, w_clip_sport, w_video_sport, w_start, w_end, w_list, w_save =
    nil, nil, nil, nil, nil, nil, nil, nil
  w_mark_start, w_mark_end, w_undo, w_next, w_shots, w_help = nil, nil, nil, nil, nil, nil
  w_venue, w_target_court, w_camera_picker, w_camera, w_visible, w_active, w_partial =
    nil, nil, nil, nil, nil, nil, nil
  w_format, w_capture, w_notes = nil, nil, nil
  w_sec, w_court, w_profile, w_poly, w_tnotes = nil, nil, nil, nil, nil
  w_validity, w_profile_list = nil, nil
  w_rv_start, w_rv_end, w_rv_notes, w_rv_state, w_rv_section, w_rv_list, w_rv_save =
    nil, nil, nil, nil, nil, nil, nil

  build_nav()
  if screen == "clip" then build_clip_screen()
  elseif screen == "target" then build_target_screen()
  elseif screen == "review" then build_review_screen()
  else build_rally_screen() end

  d:show()
  if screen == "clip" and clip_prefill_source then
    set_status(t("clip.prefilled", { source = clip_prefill_source }))
  elseif screen ~= "rally" then
    set_status("")
  elseif out_path_is_fallback then
    set_status(t("activate.fallback"))
  elseif #rows > 0 then
    set_status(t("activate.resumed", { count = #rows, n = next_rally_number() }))
  else
    set_status(t("activate.ready"))
  end
end

-- Repaint the current screen from freshly loaded state after Refresh repointed the files.
-- `switched_video` = true drops the in-progress form, because those values belong to the
-- video we just navigated away from.
function rebuild_after_sync(switched_video)
  if switched_video then
    form = { start = "", stop = "", shots = "", next = "", reason = REASON_DEFAULT }
    rv_form = { start = "", stop = "", notes = "", state = TARGET_STATES[1] }
    clip_form = nil        -- A's staged clip info belongs to A, and must never reach B's sidecar
    selected_section = nil
  else
    capture_form()
  end
  if d then d:delete(); d = nil end
  create_dialog()
end

-- Screen switches go through one place so the in-progress form is always captured first.
local function switch_screen(name)
  if screen == name then return end
  capture_form(); capture_clip_form()
  screen = name
  if d then d:delete(); d = nil end
  create_dialog()
end
function show_rallies() switch_screen("rally") end
function show_clip()    switch_screen("clip") end
function show_target()  switch_screen("target") end
function show_review()  switch_screen("review") end

-- Lifecycle
--------------------------------------------------------------------------------
function activate()
  -- Build the id lookups here (full Lua environment), not at top level (see note
  -- where REASON_ID/SPORT_ID are declared -- the descriptor scan sandbox lacks ipairs).
  for i, v in ipairs(REASONS) do REASON_ID[v] = i end
  for i, v in ipairs(SPORTS) do SPORT_ID[v] = i end
  mode = "new"
  edit_index = nil
  screen = "rally"
  form = { start = "", stop = "", shots = "", next = "", reason = REASON_DEFAULT }
  rv_form = { start = "", stop = "", notes = "", state = TARGET_STATES[1] }
  clip_form = nil
  selected_section = nil
  w_help = nil
  w_reason = nil          -- niled so the first rebuild on a re-enable doesn't del a stale handle
  out_path = resolve_out_path()
  out_path_is_fallback = (current_media_path() == nil)   -- no video yet -> adopt its CSV lazily on first Mark
  load_rows()             -- continue an existing CSV (numbering + recent list)
  load_clipmeta()         -- capture metadata + target profiles, if recorded
  adopt_row_sport_if_missing()
  load_reviews()
  detect_legacy_windows() -- a withdrawn-design windows.csv is flagged, never read
  -- A missing sidecar gets one first-open prompt. Court metadata remains optional, but the
  -- operator must save one video sport there before the first rally can be committed.
  if not out_path_is_fallback and not clipmeta_exists then screen = "clip" end
  create_dialog()
end

function deactivate()
  if d then d:delete(); d = nil end
  w_help = nil
end

function close()
  deactivate()
  vlc.deactivate()
end
