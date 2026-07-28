# Per-clip metadata sidecar — `<clip>.clipmeta.json`

The rally CSV says **when** each rally happened. It says nothing about **what the camera was
looking at**. This sidecar records that — once per clip, from the one place where the information
is free: the operator is already watching the video.

```json
{
  "clipmeta_version": 1,
  "generator": "rally-annotator-vlc/1.8.0",
  "clip_name": "GX010150",
  "sport": "badminton",
  "venue_id": "bxh_indiranagar",
  "camera_setup_id": "bxh_low_side_a",
  "capture_time_utc": null,
  "capture_time_source": null,
  "target_court_id": "c1",
  "court_count": 2,
  "active_court_count": 1,
  "partially_visible_court_count": 0,
  "match_format": "doubles",
  "notes": "divider excludes the right-hand court; it is empty throughout",
  "label_completeness": null
}
```

## Why this exists

Reconstructing these facts later, from sampled frames, was tried and failed:

- Two automated attempts to infer "does this clip have adjacent-court play?" from pixels **failed
  calibration**. Motion energy above the target net line scored an attested single-court clip
  *higher* than three of four known multicourt clips. Camera shake, lighting, spectators and the
  target court's own far-side player all pollute the signal.
- Frame-sampled guesses were wrong where it mattered: `Badminton_BXH_2` is **singles** where four
  sampled frames read as doubles; `GX010141` has **one** active court, not two.
- **Folder and file names are not a fallback.** In the reference archive a folder named
  `May 19 2026` holds files whose container `creation_time` is `2026-05-21`, and
  `gBaaddy20May2026.MP4` was captured `2026-05-22`.

## Fields

| Field | Type | Unset | Notes |
|---|---|---|---|
| `clipmeta_version` | int | — | Always present. `1` today. Readers must reject a version they don't know. |
| `generator` | string | — | `rally-annotator-<frontend>/<version>`, e.g. `rally-annotator-web/0.2.0`. |
| `clip_name` | string | `null` | Video stem (VLC) or the page's video title (web). Provenance only — never a source of dates. |
| `sport` | enum | `null` | Same vocabulary as the rally CSV: `badminton` / `tennis` / `table_tennis` / `pickleball` / `padel`. |
| `venue_id` | string | `null` | Stable identifier for the **physical facility**. |
| `camera_setup_id` | string | `null` | Stable identifier for the camera **placement/framing**. Two materially different setups at one venue count as distinct. An absent value is never assumed to differ from anything. |
| `capture_time_utc` | string | `null` | ISO-8601 UTC, **container-derived only** — see [Capture time](#capture-time). |
| `capture_time_source` | enum | `null` | `container` when a container tag supplied it; `null` when unknown. There is deliberately **no** `operator` value. |
| `target_court_id` | string | `null` | Stable id for the court being labelled, so "adjacent" is well defined. Required before window labels mean anything. |
| `court_count` | int ≥ 1 | `null` | Courts **visible in frame**, including any that are only partly visible. |
| `active_court_count` | int ≥ 1 | `null` | Visible courts **with play on them**, including the target court. Never greater than `court_count`. |
| `partially_visible_court_count` | int ≥ 0 | `null` | How many of the `court_count` courts are only partly in frame. Never greater than `court_count`. |
| `match_format` | enum | `null` | `singles` / `doubles` / `mixed`, for the **target** court. |
| `notes` | string | `null` | Free text — occlusions, partial courts, mid-clip changes. |
| `label_completeness` | object | `null` | Derived snapshot; see [Label completeness](#label-completeness). |

### `court_count` and `active_court_count` are two fields on purpose

Conflating them makes a clip look usable for work it cannot do. A clip can show a neighbouring
court that sits **empty for its whole duration**: multicourt geometry, single-court content. It
supplies no adjacent-court training examples however many court lines are in shot.

Owner-reviewed examples from the reference corpus:

| Clip | `court_count` | `active_court_count` | `partially_visible_court_count` | Can supply adjacent-court negatives |
|---|---|---|---|---|
| `GX010150` | 2 | 1 | 0 | **no** — a divider excludes the neighbour |
| `adarsh_avi_singles` | 2 | 1 | 1 | **no** — the right-hand court is empty throughout; a third court on the left is <20 % visible |
| `Badminton_BXH_2` | 4 | 3 | 0 | **yes** — target court plus two other live games, one idle court on the right |

`adarsh_avi_singles` is why `partially_visible_court_count` exists: the sliver of court on the left
is real and the operator should be able to record it **and say so**, rather than silently round it
away or inflate `court_count` with no qualifier.

### Unset is not "no"

Every field defaults to `null` and stays `null` until the operator sets it. `null` means
**not screened**; it must never be collapsed into a `0`, a `false`, or a plausible default.
`sports-data-collector` depends on this distinction — `can_supply_adjacent_court_negatives` is
`None` for an unscreened clip and `False` only for one that was screened and found single-active
(`src/core/schemas/base.py`).

Concretely, the annotator will **not** write a field the operator left blank, and the
`match_format` picker's first entry is an explicit *(not set)* that writes `null` — so a forgotten
pick can never record a guess.

### Capture time

`capture_time_utc` is written **only** when the player hands us a container-level date tag; it is
never derived from the file or folder name, and there is no text box for the operator to type one
into. That is deliberate: an operator-typed date is exactly the `May 19 2026`-folder failure the
sidecar exists to prevent.

`sports-data-collector` re-probes the container itself at import
(`ffprobe -show_entries format_tags=creation_time`, `src/core/capture.py`) and **that value wins**.
The field here is an operator-visible record, not the authority. When the two disagree, the
container probe is right.

### Label completeness

A snapshot of the rally-label coverage at the moment the sidecar was saved. `null` when the video
duration is unknown — **no rule should ever fire on a guess**.

```json
"label_completeness": {
  "video_duration_s": 768.768,
  "labelled_to_s": 439.956,
  "label_span_coverage": 0.5723,
  "head_unlabelled_s": 0.5,
  "tail_unlabelled_s": 328.8,
  "largest_unlabelled_gap_s": 260.0,
  "rally_count": 33
}
```

The formulas match `sports-data-collector`'s `_label_completeness()`
(`src/reporting/adapter.py`) exactly, so the annotator's live readout and the collector's import
report cannot disagree:

| Metric | Formula | Rounding |
|---|---|---|
| `label_span_coverage` | `min(last_end / duration, 1.0)` | 4 dp |
| `tail_unlabelled_s` | `max(duration - last_end, 0)` | 1 dp |
| `head_unlabelled_s` | `max(first_start, 0)` | 1 dp |
| `largest_unlabelled_gap_s` | largest `start[i] - max(end[0..i-1])` | 1 dp |

This is a **derived, advisory** snapshot: the collector recomputes it from the CSV and the probed
duration. `rally_count` is included so a stale snapshot is detectable.

Why it is worth showing while annotating: a partial pass was nearly ingested as complete — 33
rallies ending at 439.956 s of a 768.768 s clip, while frames at 500/700/760 s showed active play.
Rally *density* did not separate it from a genuinely sparse clip (22.9 % vs 40.8 % complete); the
**328.8 s tail** did. The collector flags this at import; the annotator flags it a step earlier, at
the same thresholds:

| Readout | Threshold | Collector rule |
|---|---|---|
| ⚠ unfinished pass | `tail_unlabelled_s > 120` | `labels_truncated` (severity **error**) |
| ⓘ labels span < 90 % | `label_span_coverage < 0.9` | `label_span_low` (severity warn) |

## Validation

The annotator refuses to write a sidecar that violates any of these, and says which one:

1. `active_court_count` ≤ `court_count` — a court cannot be in play without being in frame. This
   mirrors the collector's `_check_active_courts_within_visible` model validator, so an invalid
   sidecar can never reach import.
2. `partially_visible_court_count` ≤ `court_count`.
3. `court_count` ≥ 1, `active_court_count` ≥ 1, `partially_visible_court_count` ≥ 0, all integers.
4. `match_format` ∈ {`singles`, `doubles`, `mixed`} or `null`.
5. `sport` ∈ the rally CSV's sport vocabulary or `null`.

## Mapping into `sports-data-collector`

Every screening field has a home on the `videos` table as of schema v2, so a sidecar in this shape
imports with no schema work:

| Sidecar field | `VideoMetadata` attribute | `curate.py import-local` flag |
|---|---|---|
| `venue_id` | `venue_id` | `--venue-id` |
| `camera_setup_id` | `camera_setup_id` | `--camera-setup-id` |
| `court_count` | `court_count` | `--court-count` |
| `active_court_count` | `active_court_count` | `--active-court-count` |
| `match_format` | `match_format` | `--match-format` |
| `sport` | `sport` | `--sport` |
| `capture_time_utc` | `capture_time_utc` | *(none — the collector probes the container itself)* |
| `notes` | `candidate_reason` | `--candidate-reason` |
| `target_court_id` | **no home yet** | — |
| `partially_visible_court_count` | **no home yet** | — |
| `label_completeness` | recomputed at import | — |

`can_supply_adjacent_court_negatives` is **derived** by the collector from `active_court_count >= 2`
— the sidecar deliberately does not carry it, so there is one place it can be wrong.

The two "no home yet" fields are recorded regardless: they are cheap for the operator now and
expensive to reconstruct later, which is the whole premise of this file. Until the collector grows
columns for them, keep them out of `--candidate-reason` and read them from the sidecar directly.

Importing today, until a sidecar reader lands on the collector side:

```bash
python -m src.cli.curate import-local --sport badminton \
  --video-path GX010150.MP4 --annotations-path GX010150.rallies.csv \
  --venue-id bxh_indiranagar --camera-setup-id bxh_low_side_a \
  --court-count 2 --active-court-count 1
```

## Compatibility

- **Additive only.** New fields may be added at `clipmeta_version` 1; a reader must ignore fields it
  does not know. Removing or re-typing a field bumps the version.
- **Absent == `null`.** A reader must treat a missing key exactly like an explicit `null`.
- The sidecar is written next to the video (VLC) or downloaded alongside the CSV (browser
  extension, which cannot write next to a web video — see [../web/DESIGN.md](../web/DESIGN.md)).
- Stable key order and 2-space indentation, so a re-save produces a readable diff rather than a
  reshuffle.

See also: [CSV_FORMAT.md](CSV_FORMAT.md) (the rally track) and
[WINDOW_LABELS.md](WINDOW_LABELS.md) (the window track).
