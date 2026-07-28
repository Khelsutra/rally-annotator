# Target profiles and sparse target-state review

> **This supersedes the neighborhood window track.** An earlier design asked the operator to mark
> and tag windows of *surrounding* play — `adjacent_court_rally`, `simultaneous_rallies`,
> `target_court_non_rally`, `empty`. That turned the neighbours into an exhaustive annotation
> problem: a ten-minute multicourt clip could take hours, and none of it is what the product
> actually indexes. **It is withdrawn.** Nothing in this tool asks you to identify or time a
> neighbouring rally. See [Legacy neighborhood files](#legacy-neighborhood-files).

The pipeline is **target-first**. One prominent court is designated per static camera section; the
segmenter emits rally START/END for **that match only**. Everything here supports that and nothing
else.

Two artifacts:

| File | What it holds |
|---|---|
| `<clip>.clipmeta.json` → `target_profiles[]` | one persistent **target profile per static camera section** |
| `<clip>.target-review.csv` | **sparse** target-state answers: `rallying` / `not_rallying` / `unclear` |

## Rally annotation is unchanged

- rally **START** = serve / first legal contact
- rally **END** = terminal ground / net / out / fault event
- **only the prominent target match is indexed**

That is `<clip>.rallies.csv`, exactly as before ([CSV_FORMAT.md](CSV_FORMAT.md)). The complete
prominent-match timeline already makes every non-target-rally instant an implicit negative for
ordinary training — which is precisely why exhaustively labelling the neighbours was unnecessary.

## Target profiles

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

Whether this camera section is one the target-first pipeline can actually serve:

- **`supported`** — the target court is prominent and its play volume is fully framed. Normal case.
- **`unsupported`** — this section cannot be served as-is: no court is prominent, the target is
  badly occluded or clipped, or the camera drifts within the section.
- **`unclear`** — you could not tell. **Use this rather than guessing**; `unclear` is a real,
  recordable answer and is more useful than a wrong `supported`.

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

## Sparse target-state review

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
