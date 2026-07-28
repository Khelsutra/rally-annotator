# Window track — `<clip>.windows.csv`

A second, independent track alongside the rally CSV: **time intervals carrying a category**, not
rallies. A window may overlap a rally or sit between rallies, which is why it cannot be more
columns on `<clip>.rallies.csv`.

```
window_number,start_time,end_time,window_label,target_court_id,notes
1,12.500,18.250,adjacent_court_rally,c1,left neighbour court
2,20.000,26.400,target_rally,c1,
3,31.000,39.750,simultaneous_rallies,c1,both neighbours live
```

| Column | Type | Notes |
|---|---|---|
| `window_number` | int | 1-based, monotonic; continues across re-opening the file |
| `start_time` | float | decimal seconds from the video start |
| `end_time` | float | decimal seconds, always `> start_time` |
| `window_label` | enum | one of the five below |
| `target_court_id` | string | the clip's stable target court (from `<clip>.clipmeta.json`); repeated per row so the file is self-documenting, exactly as `sport` is in the rally CSV |
| `notes` | string | free text; **commas become `;` and newlines become spaces on write** — the format has no quoting, matching `rallies.csv` |

## The vocabulary

Five labels, matching `badminton-highlight-indexer` §4.4 verbatim:

| Label | The window shows… |
|---|---|
| `target_rally` | a rally **on the target court** — the matched positive control |
| `adjacent_court_rally` | a rally on a **neighbouring** court while the target court is not rallying |
| `simultaneous_rallies` | the target court **and** a neighbour rallying at the same time |
| `target_court_non_rally` | the target court occupied but **not rallying** — knock-up, shuttle retrieval, between-points |
| `empty` | no play on any court in frame |

These are the hard negatives a rally segmenter gets wrong: it fires on a neighbour's rally, or on
the target court's knock-up. Labelling them is what lets a model be trained and scored against
them.

### You are not labelling the neighbours' rallies

This is the point people get wrong, so it is worth being blunt about.

`adjacent_court_rally` does **not** mean "segment the match on court 4". You are not producing
ground truth for the neighbouring court and its rallies never go in `<clip>.rallies.csv`. You are
marking a stretch of video where something that *looks* exactly like a rally is happening on a court
that is **not** the target — a **negative example**, so the model can learn not to fire on it.

That changes what precision is required:

| | Rally row | Window |
|---|---|---|
| What it is | a **measurement** — the boundary is the label | a **sample** — the category is the label |
| Boundary accuracy | frame-accurate; the model is scored against it | approximate; "roughly here to roughly here" is fine |
| Completeness | every rally on the target court | ~12 examples of each category **across the whole corpus** |
| Where it goes | `<clip>.rallies.csv` | `<clip>.windows.csv` |

So: pick a stretch where the neighbour is clearly rallying and your court clearly is not, mark it,
tag it, move on. Do not chase exact serve-contact and terminal-event boundaries — a window is not
scored against a boundary.

**What `target_rally` is doing in this list.** It is the **matched control**: the positives the
negatives are compared against. You do not need to find new ones — take a dozen of the rallies you
already labelled on the target court and mark those spans again as `target_rally` windows, choosing
ones of comparable duration and from the same sessions as your negatives (§4.4 asks for
session/duration matching).

**The track is optional, per clip.** A clip with `active_court_count = 1` cannot supply
`adjacent_court_rally` or `simultaneous_rallies` at all, no matter how many court lines are in shot
— it can still supply `target_court_non_rally` and controls. And a clip needs no windows whatsoever
for its rally CSV to be complete and usable.

If you only ever record `target_rally`, this track produces nothing of value: the three hard
negatives are the entire reason it exists.

`target_court_id` must be set in the clip sidecar before window labels mean anything — "adjacent"
is undefined without a target. The annotator refuses to save a window until it is set.

## Why the counts matter

The indexer's §4.4 fixes these minima for its H1 training run:

- **12 reviewed windows each** of `adjacent_court_rally`, `simultaneous_rallies` and
  `target_court_non_rally`,
- plus **12** session/duration-matched `target_rally` controls,
- with **each subtype spanning at least two capture sessions**.

That is 48 windows, and coverage was **0 of 48** when this track was specified. Both front-ends
show a live per-label tally against the 12-window target while you work, so an operator can see
what is still missing rather than counting rows afterwards.

A clip whose `active_court_count` is 1 **cannot** supply `adjacent_court_rally` or
`simultaneous_rallies` at all, however many court lines are in shot — see
[CLIP_METADATA.md](CLIP_METADATA.md). It can still supply `target_court_non_rally` and matched
`target_rally` controls.

## Provenance

§4.4 admits a label as human-from-scratch only when a human produced it. Everything this tool
writes **is** human-from-scratch: it has no model, no suggestion, no autofill, and no network
access. It never invents a window, never proposes a boundary, and never fills a field the operator
left blank.

The **edge-event** vocabulary in §4.4 (`serve_or_first_contact`, `target_hit`, `ground_terminal`,
`net_continue`, `net_terminal`, `out_or_fault`, `occluded_or_unknown`, `background`) is a third,
separate track and is deliberately **not** built here: it arrives with the indexer's Q7, after H1,
and `occluded_or_unknown` carries the extra rule that it may never carry a timestamp. Court
polygons / play-volumes are likewise out of scope — this tool records a court *identity*, not
geometry.

## Compatibility

- Read by **column name**; column order may evolve and extra columns may be appended.
- Rows with `end_time <= start_time` are refused at write time and dropped by loaders.
- Blank lines and the header are skipped; any line whose first field is an integer is a row —
  the same forgiving rule as [CSV_FORMAT.md](CSV_FORMAT.md).
