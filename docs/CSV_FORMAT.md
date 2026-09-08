# Output CSV format

One row per rally. Header is written once when the file is created.

```
rally_number,start_time,end_time,ending_reason,sport,shots_count
1,8.800,11.500,winner,badminton,9
2,24.389,46.589,unforced_error,badminton,21
3,49.183,54.683,winner,badminton,1
```

| Column | Type | Notes |
|---|---|---|
| `rally_number` | int | 1-based, monotonic; continues across re-opening the same CSV |
| `start_time` | float | rally start, **decimal seconds** from the video start |
| `end_time` | float | rally end, decimal seconds (always `> start_time`) |
| `ending_reason` | enum | **required** — exactly `service_fault`, `unforced_error`, or `winner` for new and updated golden rows; see [ENDING_REASONS.md](ENDING_REASONS.md) |
| `sport` | enum | Denormalized projection of the video's single Clip-info sport: `badminton` / `tennis` / `table_tennis` / `pickleball` / `padel`. Every row for one video must agree. |
| `shots_count` | int | **required** — number of racket/paddle contacts including the serve; whole number `>= 1`. Older CSVs without this column still load as repair inputs. |

Notes:
- **Decimal seconds**, not `mm:ss` — downstream loaders parse floats.
- Rows are appended live; **Undo last** truncates the last row (one level).
- Legacy rows with a missing/non-positive count or an old reason still load without data loss and
  are marked for review. A browser golden CSV export is blocked until every row is repaired. The
  VLC file remains an in-progress repair artifact while its warning is visible.
- Consumers should read by **column name** (the header is stable but column *order* may evolve; extra
  columns may be added later). Most CSV `DictReader`-style loaders already tolerate extra columns.

## Ingesting the labels

This CSV is intentionally compatible with common rally-segmentation tooling that reads
`rally_number,start_time,end_time` by header name and drops rows where `end <= start`:

```bash
# Generic: any tool that takes a labels CSV of start/end seconds.

# Example — score a detector against these labels, or slice clips by them
# (badminton-highlight-indexer loaders read --labels <this.csv> directly):
python -m backend.eval.calibrate_wasb --trajectory traj.csv --labels match.rallies.csv --fps 59.94 --frame-width 1920
python -m backend.tools.rally_slicer --video match.mp4 --labels match.rallies.csv --rallies all

# Example — register as curated golden data in sports-data-collector:
python -m src.cli.curate import-local --sport badminton --video-path match.mp4 --annotations-path match.rallies.csv
```

The `sport` column remains for interchange compatibility, but it is not a per-rally annotation.
`<clip>.clipmeta.json` is authoritative and the annotator normalizes all existing rows when that
video-level choice is saved. Ingest should reject a mixed CSV or a CSV/sidecar disagreement.

## The other two tracks

This file holds the ground truth: **the prominent target match only**. The other two files the
annotator can produce are optional and do not change this schema:

- **[CLIP_METADATA.md](CLIP_METADATA.md)** — `<clip>.clipmeta.json`, per-clip screening facts
  (venue, camera setup, courts visible vs courts in play, target court, match format).
- **[TARGET_REVIEW.md](TARGET_REVIEW.md)** — target profiles (one per static camera section) and
  `<clip>.target-review.csv`, sparse `rallying` / `not_rallying` / `unclear` answers about the
  **target** court.
