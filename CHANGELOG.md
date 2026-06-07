# Changelog

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
