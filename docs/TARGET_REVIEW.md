# Legacy target metadata compatibility

> **Not an annotation workflow.** The current annotator has no Target screen, Review screen, or
> court picker. Operators label rallies on the video's largest, most visually focused court.
> This document records the old sidecar schemas only so existing data can still be read and
> preserved safely.

> **This supersedes the neighborhood window track.** An earlier design asked the operator to mark
> and tag windows of *surrounding* play — `adjacent_court_rally`, `simultaneous_rallies`,
> `target_court_non_rally`, `empty`. That turned the neighbours into an exhaustive annotation
> problem: a ten-minute multicourt clip could take hours, and none of it is what the product
> actually indexes. **It is withdrawn.** Nothing in this tool asks you to identify or time a
> neighbouring rally. See [Legacy neighborhood files](#legacy-neighborhood-files).

The pipeline is **target-first**. The target is the largest, most visually focused court in the
video; the segmenter emits rally START/END for **that match only**. Court localization/selection is
derived downstream from the video rather than imposed as a prerequisite on the rally annotator.

Two legacy artifacts may still exist:

| File | What it holds |
|---|---|
| `<clip>.clipmeta.json` → `target_profiles[]` | previously recorded target profiles |
| `<clip>.target-review.csv` | previously recorded sparse target-state answers |

## Rally annotation never waits for court metadata

**Mark START and Save Rally always work without a saved target profile**, in both front-ends. The
operator labels the rallies on the video's largest, most visually focused court. A missing still,
polygon, court number, or target profile must never block that work.

The court is derived downstream using the video itself: frame coverage is the primary geometric
signal, with visual focus and sustained play evidence resolving what the camera is actually about.
No operator-drawn polygon is required to make that choice.

Existing target profiles and reviews are compatibility data, not an operator task. Downstream code
can use `polygonArea`, `rankProminence`, and `isProminentCourt` in
`web/src/state/targetReview.ts` when processing legacy polygons.

## Rally annotation is unchanged

- rally **START** = serve / first legal contact
- rally **END** = terminal ground / net / out / fault event
- **only the prominent target match is indexed**

That is `<clip>.rallies.csv`, exactly as before ([CSV_FORMAT.md](CSV_FORMAT.md)). The complete
prominent-match timeline already makes every non-target-rally instant an implicit negative for
ordinary training — which is precisely why exhaustively labelling the neighbours was unnecessary.

## Legacy target-profile schema

One per **static camera section**. A section is a stretch of the recording over which the camera
does not move; a fixed-tripod clip is a single section.

```json
"target_profiles": [
  {
    "camera_section_id": "s1",
    "target_court_id": "3",
    "camera_profile_id": "bxh-lowside-3court",
    "play_volume_polygon": [[0.208, 0.541], [0.775, 0.541], [0.942, 0.983], [0.061, 0.983]],
    "setup_validity": "supported",
    "notes": null
  }
]
```

| Field | Type | Notes |
|---|---|---|
| `camera_section_id` | string, required | Identifies the static section. Unique within the clip. |
| `target_court_id` | string, required | The court this section indexes — the venue's own painted court number. |
| `camera_profile_id` | string | The camera placement/profile this section was shot on. |
| `play_volume_polygon` | array, required | The target court's play volume, **normalized to the frame**: each point `[x, y]` with `0 ≤ x,y ≤ 1`, origin top-left. At least 3 points; 4 for the usual quadrilateral. |
| `setup_validity` | enum, required | `supported` / `unsupported` / `unclear` — see below. |
| `notes` | string | Free text. |

### `setup_validity`

The question is **serviceability, not geometric completeness**: can rally boundaries for the target
match be determined from this framing?

- **`supported`** — they can. The target court is prominent and its rallies are callable.
- **`unsupported`** — they cannot: no court is prominent (two or more compete for the frame with
  none dominant), the target is occluded to the point where rallies cannot be called, or the camera
  drifts within the section.
- **`unclear`** — you could not tell. **Use this rather than guessing**; `unclear` is a real,
  recordable answer and is more useful than a wrong `supported`.

#### A partly-visible court is NOT automatically `unsupported`

This is the mistake to avoid, and it is an easy one — the polygon makes the clipping vivid, so it
invites the conclusion.

A camera aimed at one court from a corner will routinely run part of that court off the top of
frame while still being unambiguously *about* that court. That is a framing trade, not a failure.
**Geometry falling outside the frame is a fact about the shot; serviceability is a question about
the task.** They are not the same question, and one does not decide the other.

The strongest available evidence is direct: **if you could label that clip's rallies, its rallies
are callable.** Human labelling of the match is a demonstration that the framing carries enough
signal, and it outranks any inference from the polygon's shape.

So: clipping is a symptom worth *considering*, never a verdict on its own. Downgrade a section for
what it cost you while labelling, not for what the polygon could not enclose.

#### Prominence is relative, not absolute

The target court is the one that **dominates the frame relative to the other visible courts** —
maximum coverage of the visible courts — not the one that happens to be wholly enclosed. A shot
where the target fills most of the frame and the neighbours are reduced to slivers at the edge is
the *intended* outcome of aiming at a single court, not a defect in it.

Because coverage is comparable rather than absolute, this is computable: given a polygon per visible
court, ranking by area picks the prominent one. That is the shape the indexer's §4.5 already
anticipates for automatic court selection ("compare configured polygons with player-cluster,
shuttle-density, and court-line proposals"), and it is the reason a single signal — "is the whole
court in frame?" — must not be allowed to decide the answer by itself.

### Downstream utility: generating an empty-court still

No single frame of a live match has all four corners of the target court unobstructed — a player
is always standing on a line. So build an **empty-court still** first:

```bash
node tools/court_still.mjs "<clip>.MP4"
```

It samples 25 frames spread across the clip and takes their **temporal median**. On a fixed camera
that erases everything that moves — players, shuttles, a passing coach — and keeps everything that
does not, which is exactly the court lines. The result lands next to the video as
`<clip>.court.png`, sharing the stem with the label sidecars.

Two things this deliberately is **not**:

- It does not detect or select the court. It only produces an image for downstream inspection.
- It never touches `<clip>.rallies.csv`, `<clip>.clipmeta.json` or `<clip>.target-review.csv`.

Sampling at rally START/END timestamps would be the **worst** choice, incidentally: those are
precisely the moments when players are on the lines. The median needs no labels at all.

For a whole session at once:

```bash
node tools/court_still.mjs --all "<session folder>"
```

which skips any clip that already has a still, so it is free to re-run. This tool is not invoked by
the annotator and does not create a manual court-selection step.

**The polygon is not a completeness claim.** It records the play volume *that is visible*. A court
running off the top of frame still has a well-defined visible play volume, and marking it is
correct — that padded region is exactly what the crop / mask / marker views operate on. Never
withhold a polygon because the court is partly out of shot, and never downgrade `setup_validity`
for it on its own.

> **Wide-angle caveat.** On GoPro footage the lens bows straight lines noticeably, so a four-point
> quadrilateral is an *approximation* of a court whose edges are actually curved. That is usually
> acceptable for a padded play volume; if it is not, add points along the bowed edges rather than
> forcing four.

### Validation fails closed

A profile is **refused** — not silently coerced — when any of these hold:

1. `camera_section_id` or `target_court_id` is empty or whitespace.
2. Two profiles in one clip share a `camera_section_id`.
3. The polygon has fewer than 3 points.
4. Any point is not a pair of finite numbers.
5. Any coordinate falls outside `0 … 1`. The polygon is **normalized**; a pixel coordinate is a
   different thing wearing the same shape, and accepting it would silently produce garbage geometry.

A profile that fails is not written. A clip with no valid profile is a clip with no profile — never
a clip with a guessed one.

## Legacy sparse target-state review schema

`<clip>.target-review.csv` records answers to one question about one interval: **was the target
court rallying?**

```
review_number,start_time,end_time,target_state,camera_section_id,source,notes
1,412.500,418.250,not_rallying,s1,model_proposed,
2,655.000,661.400,unclear,s1,operator,heavy occlusion
```

| Column | Notes |
|---|---|
| `review_number` | 1-based, monotonic |
| `start_time` / `end_time` | decimal seconds, `end > start` |
| `target_state` | **`rallying`** / **`not_rallying`** / **`unclear`** — the only three answers |
| `camera_section_id` | which target profile the answer is about |
| `source` | `model_proposed` (the system mined this interval) or `operator` (you flagged it) |
| `notes` | free text; commas become `;` and newlines become spaces on write |

Three things this deliberately is **not**:

- **Not a labelling pass.** Intervals are *mined* — a handful of uncertain or false-positive
  stretches the system already flagged. You answer; you do not sweep the clip.
- **Not a count gate.** There is no quota, no per-category minimum, no progress tally. This is
  sparse active-learning evidence. A clip with two reviews is fine; a clip with none is fine.
- **Not about the neighbours.** `not_rallying` means *the target court is not rallying*. It says
  nothing about which other court might be, and you are never asked to find out. No surrounding
  match is identified or timed, ever.

## Legacy neighborhood files

`<clip>.windows.csv` files from the withdrawn design are **legacy diagnostic material only**.

The annotator **detects them and refuses to read them**. It will not load them into the review
track, will not convert them, and will not migrate them. It says one line in the status panel so you
know one is sitting there, and otherwise ignores it entirely.

They must never be auto-imported into a training manifest. Their labels asserted facts about
surrounding courts under a contract that no longer exists, and a `target_rally` window is not a
`rallying` review: one was a sampled span from an exhaustive scheme, the other is an answer to a
mined question. Converting between them would launder withdrawn assumptions into new truth.

If a legacy file holds work you want to keep, promote it **deliberately and by hand**, with a human
deciding what each row means under the current contract.

## Per-clip capture metadata

`venue_id`, `camera_setup_id`, `court_count`, `active_court_count`,
`partially_visible_court_count` and `match_format` remain in
[CLIP_METADATA.md](CLIP_METADATA.md) as **optional capture metadata**. They describe the recording.

They are **not** background-event truth, **not** training quotas, and **not** permission to time a
neighbouring rally. In particular `active_court_count` is a note about the room, not a claim about
what any other court was doing at any moment.
