# Per-clip metadata sidecar — `<clip>.clipmeta.json`

The rally CSV says **when** each rally happened. It says nothing about **what the camera was
looking at**. This sidecar records that — once per clip, from the one place where the information
is free: the operator is already watching the video.

```json
{
  "clipmeta_version": 3,
  "generator": "rally-annotator-vlc/2.2.0",
  "clip_name": "GX010150",
  "sport": "badminton",
  "venue_id": "Boxhill",
  "target_court_id": "3",
  "camera_setup_id": "court-left-corner",
  "capture_time_utc": null,
  "capture_time_source": null,
  "court_count": 2,
  "active_court_count": 1,
  "partially_visible_court_count": 0,
  "match_format": "doubles",
  "notes": "divider excludes the right-hand court",
  "target_profiles": [
    {
      "camera_section_id": "s1",
      "target_court_id": "3",
      "camera_profile_id": "bxh-lowside-3court",
      "play_volume_polygon": [[0.208, 0.541], [0.775, 0.541], [0.942, 0.983], [0.061, 0.983]],
      "setup_validity": "supported",
      "notes": null
    }
  ],
  "label_completeness": null
}
```

## Why this exists

Reconstructing these facts later, from sampled frames, was tried and failed:

- Two automated attempts to read how busy the venue was straight from pixels **failed
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
| `clipmeta_version` | int | — | Always present. **`3`** today; v1/v2 files are read and upgraded on their next save (see [Migration](#migration-from-clipmeta_version-1-or-2)). Readers must reject a version they don't know. |
| `generator` | string | — | `rally-annotator-<frontend>/<version>`, e.g. `rally-annotator-web/0.2.0`. |
| `clip_name` | string | `null` | Video stem (VLC) or the page's video title (web). Provenance only — never a source of dates. |
| `sport` | enum | `null` | Same vocabulary as the rally CSV: `badminton` / `tennis` / `table_tennis` / `pickleball` / `padel`. |
| `venue_id` | string | `null` | Stable identifier for the **physical facility**. |
| `target_court_id` | string | `null` | The venue's stable identifier for the prominent court whose rallies are being labelled. Declarative metadata only; never a rally-saving gate. |
| `camera_setup_id` | string | `null` | Stable identifier for the camera **placement/framing**. Two materially different setups at one venue count as distinct. An absent value is never assumed to differ from anything. |
| `capture_time_utc` | string | `null` | ISO-8601 UTC, **container-derived only** — see [Capture time](#capture-time). |
| `capture_time_source` | enum | `null` | `container` when a container tag supplied it; `null` when unknown. There is deliberately **no** `operator` value. |
| `court_count` | int ≥ 1 | `null` | Courts **visible in frame**, including any that are only partly visible. |
| `active_court_count` | int ≥ 1 | `null` | Visible courts **with play on them**, including the target court, **at the clip's busiest moment** — see [When the count changes mid-clip](#when-the-count-changes-mid-clip). Never greater than `court_count`. |
| `partially_visible_court_count` | int ≥ 0 | `null` | How many of the `court_count` courts are only partly in frame. Never greater than `court_count`. |
| `match_format` | enum | `null` | `singles` / `doubles` / `mixed`, for the **target** court. |
| `notes` | string | `null` | Free text — occlusions, partial courts, mid-clip changes. |
| `target_profiles` | array | `[]` | Legacy/downstream-produced target geometry. The annotator preserves existing values but does not ask the operator to create them; see [TARGET_REVIEW.md](TARGET_REVIEW.md). |
| `label_completeness` | object | `null` | Derived snapshot; see [Label completeness](#label-completeness). |

### `court_count` and `active_court_count` are two fields on purpose

Both are **capture metadata**: they describe the room the recording was made in. Neither is
background-event truth, a training quota, or permission to time a neighbouring rally — only the
prominent target match is ever indexed (see [TARGET_REVIEW.md](TARGET_REVIEW.md)).

They stay separate because collapsing them loses real information. A clip can show a neighbouring
court that sits **empty for its whole duration**: multicourt geometry, single-court content. "Four
courts in shot" and "four courts being played on" describe very different footage, and a single
number cannot say which you have.

Owner-reviewed examples from the reference corpus:

| Clip | `court_count` | `active_court_count` | `partially_visible_court_count` | |
|---|---|---|---|---|
| `GX010150` | 2 | 1 | 0 | a divider excludes the neighbour |
| `adarsh_avi_singles` | 2 | 1 | 1 | the right-hand court is empty throughout; a third court on the left is <20 % visible |
| `Badminton_BXH_2` | 4 | 3 | 0 | target court plus two other live games, one idle court on the right |

`adarsh_avi_singles` is why `partially_visible_court_count` exists: the sliver of court on the left
is real and the operator should be able to record it **and say so**, rather than silently round it
away or inflate `court_count` with no qualifier.

### When the count changes mid-clip

It usually does — a neighbouring court finishes a game, sits idle, then a new pair walks on. **You
do not track that here.** `active_court_count` is **one number for the whole clip: the most courts
that were in play at any one time.** Record the maximum, not an average and not the state at the
end.

It is a coarse note about how busy the venue was, nothing more. Nothing downstream may read a
per-moment claim out of it, because it does not contain one — and recording *when* a neighbour was
playing is explicitly not this tool's job.

If the variation is worth a human note — "court 3 idle until ~6:00, then a doubles game" — put it in
`notes`. Do not try to encode it in the count.

### The three identifiers: how to choose them

`venue_id` and `target_court_id` are free text. `camera_setup_id` offers the orientation vocabulary
below while retaining free text for compatibility and genuinely venue-specific legacy values.
All three are nevertheless **identity keys, not descriptions**: downstream
gating counts *distinct values*, and the collector's rule is that an **absent value is never assumed
to differ from anything**. A typo invents a venue, or a camera setup, and quietly inflates the
apparent diversity of a training split.

So the only real requirement is that you reuse the **exact same string** for the same thing, every
time. Values already in use in this corpus:

| Field | Values in use |
|---|---|
| `venue_id` | `Boxhill` |
| `camera_setup_id` | `bxh-elevated-baseline` · `bxh-lowside-3court` · `bxh-lowside-singlecourt` |

`camera_setup_id` identifies a **placement and framing**, not a camera. Move the tripod somewhere
materially different and it is a new setup, because that is what makes it count toward setup
representativeness. Two clips shot from the same spot on different days share one id.

#### The orientation vocabulary (owner, 2026-07-28)

`camera_setup_id` describes **where the camera sits relative to the court**, and nothing else:

| Value | Placement |
|---|---|
| `court-left-corner` | corner, left side |
| `court-right-corner` | corner, right side |
| `court-center` | centred on the court |
| `court-side-middle` | side-on, level with the net |

**The venue is deliberately NOT baked into these**, and that is worth stating because prefixing them
(`bxh-court-left-corner`) looks tempting and is wrong twice over:

1. **It is already recorded.** `venue_id` is its own field. Duplicating it into a second string is
   denormalization that buys nothing and can go out of sync — `venue_id: Boxhill` alongside
   `camera_setup_id: xyz-court-left-corner` is unrepresentable nonsense that no validator would catch.
2. **Consumers already compose the pair.** The indexer's representativeness unit is
   `f"{venue_id}::{camera_setup_id}"` — see `ClipRow.setup_key` in
   `backend/eval/qwen_tolf1_075_grouping.py`, whose docstring is literally *"Venue plus camera
   setup — the unit §4.3 counts for representativeness."* `Boxhill::court-left-corner` and
   `OtherVenue::court-left-corner` are already two distinct setups. There is no collision to
   prevent.

Keeping the vocabulary venue-agnostic also buys something a prefix would destroy: you can ask
"which clips are left-corner framings?" **across** venues, which is a question about camera domain
rather than about a building.

The older `bxh-elevated-baseline` / `bxh-lowside-3court` / `bxh-lowside-singlecourt` values predate
this vocabulary. They are valid and should not be rewritten — a stable identifier that changes is
worse than an inconsistent one — but new setups use the table above.

#### `target_court_id` — use the venue's own court numbering

In v3, `target_court_id` is restored at the top level as a declarative property of the clip. Legacy
v2 target profiles may also carry it per camera section (see
[TARGET_REVIEW.md](TARGET_REVIEW.md)); those profiles are preserved compatibility data and are not
an operator workflow.

**Name the target court by the number the venue itself paints on it.** At Boxhill that is Boxhill's
court numbering; at any other venue, that venue's own numbering.

This beats a frame-relative scheme (`c1` = leftmost) because it **survives a camera move**. A
frame-relative id silently re-points at a different slab of floor the moment the tripod shifts, so
two clips of the same physical court disagree about which court they are. A painted number is a
property of the building, so it stays true across every setup, session and clip.

For rally annotation, the target is the video's **largest, most visually focused court**: that is
the match whose rallies go into `<clip>.rallies.csv`. `target_court_id` records its stable venue
identity when the operator knows it; court localization/selection is still derived downstream, and
the field is never a prerequisite for marking or saving rallies.

Rules that make the id load-bearing rather than decorative:

- Non-empty, and **stable within the clip**.
- The **same physical court carries the same id in every clip**, across setups and sessions.
- If a venue does not number its courts, pick a scheme, write it down here, and keep it — the cost
  is not in choosing badly, it is in choosing differently twice.

### Unset is not "no"

Every field defaults to `null` and stays `null` until the operator sets it. `null` means
**not screened**; it must never be collapsed into a `0`, a `false`, or a plausible default.
`sports-data-collector` depends on this distinction: its screening fields are `Optional`, and a
`None` there means "nobody has looked", which is not the same claim as a recorded zero
(`src/core/schemas/base.py`).

Concretely, the annotator will **not** write a field the operator left blank, and the
`match_format` picker's first entry is an explicit *(not set)* that writes `null` — so a forgotten
pick can never record a guess.

A forgotten pick is, however, **called out on save**: the status line says the format is still
*(not set)* rather than just confirming the write. The save is never blocked — an operator who
genuinely cannot tell must be able to leave it `null`, and a guessed singles/doubles is worse than a
recorded unknown — but a null that nobody noticed is only discovered downstream, where the
primary-split gate cannot evidence its singles+doubles minimum from nulls and the clip has to be
annotated again.

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

A snapshot of the current rally-label coverage. After the sidecar has been explicitly saved once,
the annotator rewrites this block after every successful rally save/edit/delete/undo, so it cannot
go stale during the rest of that labeling pass. Rally work does not create a missing sidecar and an
optional sidecar-refresh failure never blocks or rolls back the rally CSV. The value is `null` when
the video duration is unknown — **no rule should ever fire on a guess**.

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
| `target_court_id` | **no home yet** | — |
| `camera_setup_id` | `camera_setup_id` | `--camera-setup-id` |
| `court_count` | `court_count` | `--court-count` |
| `active_court_count` | `active_court_count` | `--active-court-count` |
| `match_format` | `match_format` | `--match-format` |
| `sport` | `sport` | `--sport` |
| `capture_time_utc` | `capture_time_utc` | *(none — the collector probes the container itself)* |
| `notes` | `candidate_reason` | `--candidate-reason` |
| `target_profiles[].target_court_id` | **legacy compatibility only** | — |
| `target_profiles[]` (section id, polygon, validity) | **no home yet** | — |
| `partially_visible_court_count` | **no home yet** | — |
| `label_completeness` | recomputed at import | — |

The collector derives anything it wants from these fields; the sidecar carries only what the
operator observed, so there is exactly one place each fact can be wrong.

The two "no home yet" fields are recorded regardless: they are cheap for the operator now and
expensive to reconstruct later, which is the whole premise of this file. Until the collector grows
columns for them, keep them out of `--candidate-reason` and read them from the sidecar directly.

Importing today, until a sidecar reader lands on the collector side:

```bash
python -m src.cli.curate import-local --sport badminton \
  --video-path GX010150.MP4 --annotations-path GX010150.rallies.csv \
  --venue-id Boxhill --camera-setup-id bxh-lowside-3court \
  --court-count 2 --active-court-count 1
```

## Compatibility

- **Additive evolution.** A reader must ignore fields it does not know. Version 3 restores the
  top-level target identifier while preserving all v2 fields, including `target_profiles`.
- **Absent == `null`.** A reader must treat a missing key exactly like an explicit `null`.
- The sidecar is written next to the video (VLC) or downloaded alongside the CSV (browser
  extension, which cannot write next to a web video — see [../web/DESIGN.md](../web/DESIGN.md)).
- Stable key order and 2-space indentation, so a re-save produces a readable diff rather than a
  reshuffle.

### Migration from `clipmeta_version` 1 or 2

- Every unchanged field is read as-is, and existing `target_profiles` remain preserved.
- A v1 top-level `target_court_id` becomes the v3 top-level value directly.
- A v2 file normally has no top-level target. When every non-empty profile target agrees, that
  consensus seeds the v3 top-level value. If profiles conflict, it remains `null`; the annotator
  never chooses one.
- Saving writes `clipmeta_version: 3`. A legacy file that is never touched stays valid on disk.

## First-open intake and sibling prefill

When a real clip has no sidecar, Clip info opens as a one-time, skippable prompt. Navigation back to
Rallies is always available and all rally actions work without completing the form.

For local VLC clips, the first valid sibling `.clipmeta.json` in the same directory (lexical
filename order) seeds the whole declarative form: sport, venue, target court, camera setup, court
counts, match format, and notes. This is visibly an **unsaved starting point**. It does not copy the
sibling's clip name, container capture time, target profiles/geometry, or completeness, and it does
not write the new clip's sidecar until the operator presses **Save clip info**. The browser
extension cannot enumerate the directory around a web video, so sibling prefill is VLC-only.

## Compatibility when a newer producer adds fields

The VLC extension writes a canonical document containing the fields in this specification. Pressing
**Save clip info** is therefore an explicit replacement operation: unknown top-level fields written
by a newer producer are not round-tripped.

Automatic `label_completeness` maintenance is deliberately safer. If an existing sidecar contains
any unknown top-level field, rally save/edit/delete/undo leaves the sidecar byte-for-byte untouched
and logs a warning instead of erasing data it cannot serialize. The rally CSV write still succeeds.
Use a producer that understands the newer field, or deliberately press **Save clip info** after
deciding that canonical replacement is intended.

See also: [CSV_FORMAT.md](CSV_FORMAT.md) (the rally track) and
[TARGET_REVIEW.md](TARGET_REVIEW.md) (target profiles + sparse target-state review).
