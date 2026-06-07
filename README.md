# Rally Annotator

A tiny **VLC plugin** to hand-label rally **start/end + point-stop reason** while you watch a match,
for **net-separated racquet sports** — badminton, tennis, table tennis, pickleball, padel.

You watch the video in VLC, pause/scrub freely, and click **Mark START** / **Mark END** (with a
reason). It writes one CSV row per rally — clean ground-truth labels for training/evaluating rally
(point) segmentation models, or just for cutting highlights.

```
rally_number,start_time,end_time,ending_reason,sport
1,8.800,11.500,winner,badminton
2,24.389,46.589,unforced_error,badminton
```

Times are **decimal seconds**. See [docs/CSV_FORMAT.md](docs/CSV_FORMAT.md).

## Why
Labeling rally boundaries is the slow, expensive prerequisite for any rally-detection model. Most tools
make you transcribe timestamps by hand. This lets a rater do it **inside the player they already use**,
pausing to the exact frame before each mark — turning "watch a match" into "produce golden labels."

## Install
1. Copy `vlc/rally_annotator.lua` into your VLC Lua **extensions** folder:
   - **Windows:** `%APPDATA%\vlc\lua\extensions\`
   - **macOS:** `~/Library/Application Support/org.videolan.vlc/lua/extensions/`
   - **Linux:** `~/.local/share/vlc/lua/extensions/`
   (create the `extensions` folder if it doesn't exist)
2. In VLC: **Tools → Plugins and extensions → Reload extensions** (or just restart VLC).
3. Enable it from the **View** menu → **Rally Annotator**. A small dialog opens and stays open while you watch.

Requires **VLC 3.0.x**. (VLC 4.0 changed the Lua input/listener API; targeting 3.x for now.)

## Use
1. Pick the **Sport** in the dropdown.
2. Play the match. When a rally begins, click **Mark START** (snapshots the current time — pause/scrub first for frame accuracy).
3. Choose the **Ending reason** (winner / forced_error / unforced_error / service_fault / let / other).
4. When the rally ends, click **Mark END** → one row is appended immediately.
5. **Undo last** removes an uncommitted START or the last written row (one level).
6. The status panel shows the current time, whether a START is armed, rallies written, and the **output CSV path**.

**Output:** `<video-stem>.rallies.csv` next to the video (falls back to your home dir if the path can't be
resolved). Re-opening the extension **continues** rally numbering from the existing file — no duplicate IDs,
no overwrite.

## Sports & taxonomy
Net-separated racquet sports share a forced/unforced-error point-stop taxonomy, so one tool covers them all:

| Sport | Notes |
|---|---|
| badminton | the reference sport |
| tennis | service_fault = fault/double-fault; let supported |
| table_tennis | let (net serve) supported; fast cadence |
| pickleball | service_fault for faults; treat "let" per local rules |
| padel | net-separated; rally boundaries as in tennis |

`ending_reason` ∈ `{winner, forced_error, unforced_error, service_fault, let, other}` — a shared vocabulary
across these sports. Keep to these values for clean downstream aggregation.

## Roadmap
- [ ] Validate v1.2 multi-sport build live in VLC across all five sports.
- [ ] Optional per-sport reason presets / hotkeys.
- [ ] Alternative front-ends for power users / remote raters: a `python-vlc` + Tk/Qt app with global keyboard
      shortcuts (S/E/1–6/U), and a zero-install HTML5 `<video>` page that exports the same CSV.
- [ ] Optional extra columns (e.g. `shots_count`, server/receiver) behind a toggle.

## Contributing
Issues and PRs welcome — especially live test reports per sport/OS and small UX fixes. The plugin is a single
self-contained Lua file (`vlc/rally_annotator.lua`) using only documented VLC 3.x Lua APIs.

## License
MIT — see [LICENSE](LICENSE).
