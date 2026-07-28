# Changelog

## v1.8.1 — 2026-07-28
- **Fix (data safety): Refresh could write one video's clip metadata into another's sidecar.**
  Refresh repointed `<video>.rallies.csv` / `.clipmeta.json` / `.windows.csv` at the newly playing
  video and reloaded them into memory, but did **not** repaint the **Clip info** and **Windows**
  screens — those paint from their widgets. So after switching videos the boxes still held the
  *previous* clip's venue and court counts while the save path already pointed at the new clip, and
  **Save clip info** would have written video A's screening into video B's file. Refresh now
  rebuilds those screens from the freshly loaded state, and a video switch clears the in-progress
  fields instead of carrying them across. Regression test asserts the fields clear, that B's sidecar
  carries `null` where A had values, and that A's own sidecar is left intact. (Rallies screen was
  never affected — its list and counters already repainted.)
- **Documented `active_court_count` when the count changes mid-clip:** record the **maximum**
  concurrent count over the whole clip, because the field answers a *capability* question
  (`can_supply_adjacent_court_negatives = active >= 2`). The time structure belongs to the window
  track, which records exactly when a neighbour was live.
- **Documented the identifier conventions**, with the values actually in use (`venue_id: Boxhill`;
  `camera_setup_id: bxh-elevated-baseline` / `bxh-lowside-3court` / `bxh-lowside-singlecourt`), and
  locked `target_court_id` to **the venue's own painted court number** — it survives a camera move,
  where a frame-relative scheme silently re-points at a different court. The doc's worked examples
  now use those real values instead of an invented naming style.
- `.gitignore` now covers `*.clipmeta.json` and `*.windows.csv` — they are user data, like the
  rally CSV, and were previously committable by accident.
- Suite **160 assertions** (was 150).

## v1.8.0 — 2026-07-28
- **Per-clip screening metadata → `<clip>.clipmeta.json`.** A new **Clip info** screen records what
  the camera was looking at — venue, camera setup, **courts visible** vs **courts in play** (two
  separate fields), how many are only partly in frame, target court id, match format, notes. These
  are facts the operator knows *while labelling* and that nobody can reconstruct afterwards: two
  attempts to infer adjacent-court play from pixels failed calibration, and frame-sampled guesses
  got `Badminton_BXH_2` (singles, not doubles) and `GX010141` (one active court, not two) wrong.
  Format + rationale: **[docs/CLIP_METADATA.md](docs/CLIP_METADATA.md)**.
  - **Unset stays unset.** A blank field writes `null` — "not screened" — never `0`, never `false`,
    never a plausible default; the `match_format` picker's first entry is an explicit *(not set)*.
    `sports-data-collector` treats "unscreened" and "screened and found single-court" differently,
    and this is what keeps them apart.
  - **`active_court_count ≤ court_count` is enforced here**, matching the collector's model
    validator, so an invalid sidecar can never reach import.
  - **Capture time is read-only** and comes from the container when the player exposes it. There is
    deliberately *no* box to type a date into: in this archive a folder named `May 19 2026` holds
    files captured `2026-05-21`, and `gBaaddy20May2026.MP4` was captured `2026-05-22`.
- **Window track → `<clip>.windows.csv`.** A new **Windows** screen marks time intervals and tags
  them `target_rally` / `adjacent_court_rally` / `simultaneous_rallies` / `target_court_non_rally` /
  `empty`, with its own numbering, its own edit/undo, and a **live per-label tally** against the
  12-of-each target. A window may overlap a rally or sit between rallies, so it is a separate track,
  not more CSV columns. See **[docs/WINDOW_LABELS.md](docs/WINDOW_LABELS.md)**.
- **Label-completeness readout.** The status panel now shows labelled span, unlabelled tail and
  largest interior gap, and **warns above a 120 s tail** — the same formulas and thresholds
  `sports-data-collector` blocks on. A partial pass was nearly ingested as complete (33 rallies
  ending at 439.956 s of a 768.768 s clip); rally *density* did not separate it from a sparse clip,
  the 328.8 s tail did.
- **Fix: switching screen or language no longer discards an in-progress `START → END`.** The form is
  captured before the grid is rebuilt (the language switch had this bug since v1.7).
- **Fix (web): the panel now scrolls internally** — with a section expanded it could grow past the
  viewport, putting its Save button out of reach on a laptop screen.
- Both front-ends, all 7 languages. VLC suite **150 assertions** (was 88); web **126 tests**
  (was 65) plus a new real-Chromium E2E for the two new artifacts.

## v1.7.1 — 2026-06-22
- **Completes the localization:** the dialog's **status messages** and the full in-dialog **HELP /
  ending-reason guide** are now localized into all 7 languages too (en/hi/kn/te/es/da/id) — so the
  *entire* dialog is translated, not just the chrome. Status lines show localized reason/sport labels
  while the CSV keeps **canonical English** values (mapped via the dropdown id). The machine-draft
  catalogs remain **pending native-speaker review**.
- The `STRINGS` table now carries 81 keys/locale; the headless suite's key-parity gate spans them all.
  **88 assertions** green (`lua5.1 test/dialog_test.lua`); `luac5.1 -p` clean.

## v1.7 — 2026-06-22
- **Localized dialog chrome** into 7 languages — English, Hindi, Kannada, Telugu, Spanish, Danish,
  Indonesian (the [Khelsutra](https://khelsutra.guru) set + Telugu). A new **Language** selector (with a
  `✓` apply button) rebuilds the dialog in the chosen language, and the choice **persists across sessions**
  in a small config file (`~/.rally_annotator_lang`). Labels, buttons, and the reason/sport dropdown
  **display labels** are translated; **status messages and the in-dialog HELP guide stay English for now**
  (a documented next phase — see [docs/LOCALIZATION.md](docs/LOCALIZATION.md)). The translations are
  **machine drafts pending native-speaker review**.
- **CSV stays canonical:** the reason/sport values written to the CSV are mapped from the selected
  dropdown *id* back to canonical English, so output is byte-identical regardless of interface language.
- **Tests:** the headless suite exposes the string table and asserts **key-parity** across all 7 locales,
  plus an end-to-end language-switch test; the layout snapshot is regenerated for the language row +
  localized dropdowns. **88 assertions**, green via `lua5.1 test/dialog_test.lua`.

## v1.6.4 — 2026-06-18
- **Guard unsaved work against silent loss (golden-data safety).** Once a rally is fully marked (**START + END**)
  but not yet saved, the two ways you could *accidentally* throw it away are now blocked with a clear prompt instead
  of silently discarding it:
  - **Mark START** (starting a new rally) is refused — "Save Rally to keep it, or Undo last to clear it" — so a new
    mark can't overwrite an unsaved one.
  - **Edit selected** is refused for the same reason (loading another row would replace the unsaved START→END).
  (The Start/End fields stay editable by hand, and **Undo last** is the explicit one-click "clear the mark" escape.)
- **Edit mode is now unmissable.** While editing an existing rally, the Mark buttons relabel to
  **"Re-mark START (#N)" / "Re-mark END (#N)"**, so it's obvious they change *that* rally rather than creating a new
  one (they revert to "Mark START"/"Mark END" when the edit is saved or cancelled).
- Regression tests for both guards (refusal + the relabel/revert) — suite now **65 assertions**.

## v1.6.3 — 2026-06-18
- **The version now shows next to the plugin in VLC's "Active Extensions" list** (Tools → Plugins and extensions →
  Active Extensions) — e.g. **`Rally Annotator v1.6.3`** — matching how VLsub shows `VLsub 0.11.1`. VLC renders the
  descriptor `title` verbatim there and never appends the version, so the version is now baked into the title, fed by
  the same `VERSION` constant as the dialog window title and `descriptor().version` (so all three stay in sync).
  Regression test asserts `descriptor().title == "Rally Annotator v" .. version`.

## v1.6.2 — 2026-06-18
- **Fix (data safety on resume): rallies could be written to `~/rally_labels.csv` instead of next to the video.**
  `out_path` was resolved **once**, when the extension was enabled. If the video wasn't loaded at that instant
  (extension enabled before the video, or VLC still opening it), `current_media_path()` returned `nil` and the path
  fell back to the home dir — so labels were saved there, and on **pause/restart** the video's own
  `<video>.rallies.csv` was never reloaded, making prior rallies look "lost". Because producing a timestamp requires
  the video to be playing, the tool now **adopts `<video>.rallies.csv` lazily on the first Mark START / Save**
  (loading any rallies already saved for that video) instead of relying on enable-time resolution. The initial
  status now says so when no video is detected yet. Window title → **`Rally Annotator v1.6.2`**. Regression test:
  enable with no media, then "play" a video and Mark START → asserts the existing rallies are adopted, the new
  rally lands in `<video>.rallies.csv`, and the home fallback is never written. Suite now **53 assertions**.

## v1.6.1 — 2026-06-18
- **Fix: the Recent rallies list hid the oldest rallies.** It was capped to the most recent 12 rows, so once a
  video had 13+ rallies the earliest ones (e.g. **#1**) silently dropped off the list — you couldn't see their
  start/end times or select them for **Edit selected** / **Delete selected**. The list now shows **every** rally
  (oldest first); the box scrolls. Window title bumps to **`Rally Annotator v1.6.1`**. Regression test added (loads a
  13-rally CSV and asserts the list shows all 13 with #1 first) — suite now at **49 assertions**.

## v1.6 — 2026-06-13
- **Single Play / Pause toggle.** The separate **Play / Resume** and **Pause** buttons are merged into one
  **Play / Pause** button, so the playback row is now just **Back 5s · Play / Pause · Fwd 5s** (3 buttons). The
  toggle branches on `vlc.playlist.status()` — pause→resume, play→pause, and a fresh `play()` from stopped — so it
  never flips the wrong way (VLC's `pause()` is a hard toggle).
- **Feature: optional "Number of shots" field → new `shots_count` CSV column.** Type a rally's shot/stroke count
  before **Save Rally** (leave blank to skip); it's appended as a 6th column
  (`rally_number,start_time,end_time,ending_reason,sport,shots_count`). The field clears after each save (non-sticky,
  like the reason), **Edit selected** reloads the saved count, and the Recent-rallies list shows it. Older 5-column
  CSVs still load (the column reads blank); readers that go by column name are unaffected.
- Dialog regrouped for the new field: **Number of shots** sits next to **Next rally #**; the reason label/dropdown
  and the Mark/Save action row shift down one row. The layout-snapshot golden (`test/dialog_layout.snapshot`) is
  regenerated for the new grid, and the suite grows to **45 assertions** (shots write/blank/edit, Play/Pause toggle),
  green via `lua5.1 test/dialog_test.lua`.

## v1.5.1 — 2026-06-09
- **UX: the annotation window title now shows the version** — the dialog opens as **"Rally Annotator v1.5.1"** instead
  of just "Rally Annotator", so a rater can tell at a glance which build they're running. The version is a single
  `VERSION` constant the descriptor and the dialog title both read, so they can't drift.
- **Test:** added two assertions that the dialog title carries the version and exactly matches `Rally Annotator v` +
  `descriptor().version`.
- **Test: layout snapshot** (`test/dialog_layout.snapshot`). The harness now serializes the full widget grid the
  extension hands to VLC — every control's kind, grid column/row, column/row span, and caption/options, plus the
  window title — and diffs it against a committed golden. It's the deterministic, cross-platform stand-in for a
  screenshot diff (VLC renders extension dialogs through Qt with no headless path), catching any moved, resized,
  renamed, added, or removed control and any title change. Regenerate intentional layout changes with
  `lua5.1 test/dialog_test.lua --update`. **39 assertions total.**
- **CI: GitHub Actions** (`.github/workflows/ci.yml`) runs on every push and PR — syntax-checks the extension with
  `luac5.1 -p` (the kind of scan-time error that silently broke loading in v1.3.1), then runs the full dialog suite
  including the layout snapshot. A status badge is on the root `README`.
- **Docs:** `test/README.md` gains a **Windows** Lua-5.1 install FAQ (no-admin portable install + the `choco` route),
  since `lua5.1` isn't on PATH by default there.

## v1.5 — 2026-06-08
- **Feature: playback controls (issue #4).** A new **Back 5s · Play / Resume · Pause · Fwd 5s** row drives the VLC
  player from the annotation window — pause, label, and resume without switching to the main VLC window. Uses the
  extension-exposed `vlc.playlist` (play/pause/status) and `vlc.var` seek on the input; Pause / Play-Resume are
  **gated on `vlc.playlist.status()`** because VLC's `pause()` is a hard toggle, so they never flip the wrong way.
  Seek is relative ±5 s, clamped at 0. (Verified feasible against the VLC 3.0 source before building.)
- **Committed test suite** (`test/dialog_test.lua`, run with `lua5.1`): stubs VLC's dialog + playback API, loads the
  real extension, and asserts reason reset / consecutive-reason / numbering / undo re-sync / help toggle / playback
  gating / CSV output — **36 assertions, exit-code-based** for CI. See `test/README.md`.
- Dialog regrouped to fit the playback row at the top; reason dropdown cell `(3,4)` → `(3,5)`, help panel row `14` → `15`.

## v1.4 — 2026-06-08
- **Fix: the Help button now toggles reliably.** It previously got "stuck" showing help — VLC didn't repaint the
  in-place text swap on the shared status widget. Help is now a **dedicated panel** added/removed via
  `add_html`/`del_widget`, which forces a real layout change VLC renders every time. (Verified with a headless
  `lua5.1` harness that stubs the VLC dialog API and drives the toggle.)
- **Feature: "Next rally #" field** — choose where numbering resumes from (restart at 1, continue from 50, fill a
  gap, …). Defaults to the natural next number, auto-advances to the next **free** number after each save, and
  refuses a number that already exists in the CSV. The Save button shows the number it will write.
- **Fix: the Ending reason no longer gets "stuck".** Picking a reason (e.g. `winner`) used to block the next rally
  from using the same one — VLC didn't repaint the `clear()`-based dropdown reset. The reason now resets to a real,
  savable **`unknown`** default by recreating the dropdown (same `del_widget` technique as Help), so consecutive
  rallies can share a reason and a forgotten pick records `unknown` rather than the previous rally's reason. Reason
  is no longer a hard-required field; `unknown` was added to the documented vocabulary.
- **Fix: removing a rally no longer leaves a numbering gap.** `Undo last` and `Delete selected` now re-sync the
  "Next rally #" field to the current data.

## v1.3.1 — 2026-06-08
- **Fix: the extension failed to load and never appeared under the View menu.** v1.3 built the `REASON_ID`/`SPORT_ID`
  lookup tables with **top-level `ipairs` loops**, which run during VLC's *descriptor scan* — a restricted Lua sandbox
  that does not expose base globals like `ipairs` — so the whole script errored at scan time
  (`attempt to call global 'ipairs' (a nil value)`) and VLC skipped it. Moved that table-building into `activate()`
  (the full Lua environment); no top-level code now calls any global function. Verified via VLC's `-vv` extension-scan log.

## v1.3 — 2026-06-08
- **Ending reason is now required and non-sticky:** a `-- choose reason --` placeholder is the default, Save is
  refused until a real reason is picked, and the reason **resets after every save** (fixes the bug where the
  previous rally's reason was silently reused).
- **Two-step commit:** `Mark END` now *arms* the rally; you pick the reason and click **Save Rally** to write it
  (the button shows the rally number it will write). Per-rally reasons are captured at save time.
- **Editable Start/End fields** — fine-tune the marked seconds before saving.
- **Edit recent rallies:** a *Recent rallies* list with **Edit selected** / **Delete selected**; `Undo last`
  removes the most recent row, clears an in-progress mark, or cancels an edit. `Undo last` now shows **which** row
  it will remove (`Undo last (#N)`) and the status panel shows that row's details. CSV is now rewritten atomically
  (tmp + rename, with a Windows `.bak` rollback) and preserves any extra columns.
- **Resume a half-finished video:** on activate the extension reloads that video's existing `.rallies.csv` (shown
  in the Recent list, with continued numbering); **Refresh** now re-points to whatever video is playing and loads
  its rallies — so reopening (or switching) videos picks up where you left off. (Playback position isn't restored.)
- **In-dialog Help button** — usage + an ending-reason decision guide, rendered inside the extension's own dialog
  (VLC's own *About* dialog shows a hardcoded "Lua script" and cannot be set by an extension). New repo guide
  `docs/ENDING_REASONS.md`; README gains reason definitions and the out-of-bounds / into-net / net-cord rulings.
- Richer `descriptor()` `shortdesc`/`description` (these surface in the *Active Extensions* tab's "More information").

## v1.2 — 2026-06-07
- Generalized from badminton-only to **net-separated racquet sports** (badminton, tennis, table tennis,
  pickleball, padel) via a new **Sport** dropdown and a `sport` CSV column.
- Generic naming/branding; MIT-licensed standalone release.

## v1.1 (badminton-only, pre-release; from badminton-highlight-indexer)
- Button-driven dialog (not an auto-pause hook — that VLC callback is flaky on macOS / broken in VLC 4.0).
- Snapshots `vlc.var.get(input,"time")/1e6` (microseconds → seconds).
- Continues rally numbering across re-enable (no duplicate `rally_number`); one-level Undo; HTML status panel.
- Writes `rally_number,start_time,end_time,ending_reason` next to the video.

> Note: v1.2 changes the multi-sport path and is **pending a live VLC smoke test** across all five sports.
