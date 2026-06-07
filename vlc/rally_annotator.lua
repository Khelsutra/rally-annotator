--[[ rally_annotator.lua  --  VLC Lua EXTENSION (v1.2)

  Rally Annotator for NET-SEPARATED RACQUET SPORTS
  (badminton · tennis · table tennis · pickleball · padel)

  While watching a match in VLC, mark each rally's START / END and a point-stop
  reason, and append one CSV row per rally. Pause/scrub freely, then click — the
  callback snapshots the exact playback time. Output is a plain CSV that ingests
  directly into common rally-segmentation tooling.

  Output CSV columns (times in decimal SECONDS):
      rally_number,start_time,end_time,ending_reason,sport

  WHY a button-dialog (not an auto-pause hook):
    VLC 3.x can expose pause via the {"playing-listener"} capability
    (status_changed/playing_changed), but that callback is flaky on macOS
    (VLC #22778) and the input/meta listeners are broken in VLC 4.0 (#27558).
    A persistent dialog whose button callbacks SNAPSHOT the current playback
    time is portable, precise, and lets the rater pause/scrub before committing.
    So we declare NO listener capabilities.

  UNITS: in VLC 3.x, vlc.var.get(input,"time") is in MICROSECONDS -> /1e6.

  Install (Windows): copy this file to
      %APPDATA%\vlc\lua\extensions\rally_annotator.lua
    macOS:  ~/Library/Application Support/org.videolan.vlc/lua/extensions/
    Linux:  ~/.local/share/vlc/lua/extensions/
  then VLC > Tools > Plugins and extensions > Reload extensions (or restart),
  then enable it from the View menu.

  MIT licensed. https://github.com/avidullu/rally-annotator
]]

--------------------------------------------------------------------------------
-- Extension registration
--------------------------------------------------------------------------------
function descriptor()
  return {
    title       = "Rally Annotator",
    version     = "1.2",
    author      = "Avi Dullu",
    url         = "https://github.com/avidullu/rally-annotator",
    shortdesc   = "Mark rally start/end + reason to a CSV (net-separated racquet sports)",
    description = "Persistent dialog to mark rally START/END and a point-stop reason "
               .. "for badminton/tennis/table-tennis/pickleball/padel; appends "
               .. "rally_number,start_time,end_time,ending_reason,sport (decimal seconds) "
               .. "to a CSV next to the video.",
    capabilities = {}   -- button-click model: no listeners needed
  }
end

--------------------------------------------------------------------------------
-- Config
--------------------------------------------------------------------------------
-- Net-separated racquet sports share a forced/unforced-error point-stop taxonomy.
local REASONS = {
  "winner", "forced_error", "unforced_error", "service_fault", "let", "other"
}
local SPORTS = {
  "badminton", "tennis", "table_tennis", "pickleball", "padel"
}

local HEADER = "rally_number,start_time,end_time,ending_reason,sport\n"

--------------------------------------------------------------------------------
-- State
--------------------------------------------------------------------------------
local d                 -- the single dialog
local w_status          -- status label widget (HTML/rich-text)
local w_reason          -- ending_reason dropdown widget
local w_sport           -- sport dropdown widget
local pending_start     -- number (seconds) or nil
local rally_count = 0   -- highest rally_number written to the CSV so far
local last_line_len = nil -- byte length of the last appended line (for Undo)
local out_path          -- resolved CSV path (computed once on activate)

--------------------------------------------------------------------------------
-- Helpers
--------------------------------------------------------------------------------

-- Current playback time in SECONDS, or nil if nothing is playing.
local function now_seconds()
  local input = vlc.object.input()
  if not input then return nil end
  local t_us = vlc.var.get(input, "time")   -- MICROSECONDS in VLC 3.x
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
  local input = vlc.object.input()
  if not input then return nil end
  local item = vlc.input.item()           -- VLC 3.x: vlc.input.item()
  if not item then return nil end
  local uri = item:uri()                   -- item:uri()
  if not uri or uri == "" then return nil end
  -- file:///C:/dir/clip.mp4  ->  C:\dir\clip.mp4
  local p = uri
  p = p:gsub("^file:///", "")
  p = p:gsub("^file://", "")
  -- percent-decode (e.g. %20 -> space) BEFORE separator normalization
  p = p:gsub("%%(%x%x)", function(h) return string.char(tonumber(h, 16)) end)
  p = p:gsub("/", "\\")
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

local function file_exists(path)
  local fh = io.open(path, "r")
  if fh then fh:close(); return true end
  return false
end

-- Scan an existing CSV and return the highest integer rally_number in it, so a
-- re-enabled session keeps numbering monotonic instead of restarting at 1.
local function max_existing_rally()
  local f = io.open(out_path, "r")
  if not f then return 0 end
  local maxn = 0
  for line in f:lines() do
    local first = line:match("^%s*([^,]+)")
    if first then
      local n = tonumber(first)
      if n and n == math.floor(n) and n > maxn then maxn = n end
    end
  end
  f:close()
  return maxn
end

local function set_status(msg)
  if not w_status then return end
  local tail = pending_start
      and string.format("START armed @ %s", esc(fmt_clock(pending_start)))
      or  "START not set"
  w_status:set_text(string.format(
    "%s<br>Now: %s &nbsp;|&nbsp; %s<br>Rallies written: %d<br>CSV: %s",
    esc(msg), esc(fmt_clock(now_seconds())), tail, rally_count, esc(out_path)))
  if d then d:update() end
end

--------------------------------------------------------------------------------
-- CSV append (header written once if the file is new/empty)
--------------------------------------------------------------------------------
local function append_row(n, start_s, end_s, why, sport)
  local exists = file_exists(out_path)
  local f, err = io.open(out_path, "a")
  if not f then return false, ("cannot open CSV: " .. tostring(err)) end
  if not exists then
    f:write(HEADER)
  end
  local line = string.format("%d,%.3f,%.3f,%s,%s\n", n, start_s, end_s, why, sport)
  f:write(line)
  f:close()
  last_line_len = #line   -- track byte length so Undo can truncate it
  return true
end

-- Remove the last appended data line by rewriting the file without its tail.
local function remove_last_row()
  if not last_line_len then return false, "nothing to undo" end
  local f = io.open(out_path, "rb")
  if not f then return false, "CSV not found" end
  local data = f:read("*a") or ""
  f:close()
  if #data < last_line_len then return false, "CSV shorter than last row" end
  local kept = data:sub(1, #data - last_line_len)
  if kept == HEADER then kept = "" end   -- only the header left -> blank it
  local wf = io.open(out_path, "wb")
  if not wf then return false, "cannot rewrite CSV" end
  wf:write(kept)
  wf:close()
  last_line_len = nil   -- only one level of undo
  return true
end

--------------------------------------------------------------------------------
-- Button callbacks (VLC calls these on its main loop; MUST be global)
--------------------------------------------------------------------------------
function mark_start()
  local t = now_seconds()
  if not t then set_status("No media playing -- cannot mark START."); return end
  pending_start = t
  set_status(string.format("START marked @ %s", fmt_clock(t)))
end

function mark_end()
  local t = now_seconds()
  if not t then set_status("No media playing -- cannot mark END."); return end
  if not pending_start then
    set_status("No START armed -- press \"Mark START\" first.")
    return
  end
  local s, e = pending_start, t
  if e <= s then
    if e == s then
      set_status(string.format(
        "END (%s) equals START (%s) -- mark END later (rally must be > 0s).",
        fmt_clock(e), fmt_clock(s)))
      return
    end
    s, e = e, s   -- END before START position: swap to a positive interval
  end
  local _, reason = w_reason:get_value()   -- (id, text); we want the text
  if not reason or reason == "" then reason = "other" end
  local _, sport = w_sport:get_value()
  if not sport or sport == "" then sport = "badminton" end
  local n = rally_count + 1
  local ok, err = append_row(n, s, e, reason, sport)
  if not ok then set_status("WRITE FAILED: " .. tostring(err)); return end
  rally_count = n
  pending_start = nil
  set_status(string.format(
    "Rally #%d saved: %s -> %s  [%s, %s]", n, fmt_clock(s), fmt_clock(e), reason, sport))
end

function undo_last()
  if pending_start and not last_line_len then
    pending_start = nil
    set_status("Cleared armed START (no row written yet).")
    return
  end
  local ok, err = remove_last_row()
  if not ok then set_status("Undo: " .. tostring(err)); return end
  if rally_count > 0 then rally_count = rally_count - 1 end
  set_status(string.format("Undid last rally. %d remaining in CSV.", rally_count))
end

function refresh_now()
  set_status("Refreshed.")
end

--------------------------------------------------------------------------------
-- Dialog construction
--------------------------------------------------------------------------------
local function create_dialog()
  d = vlc.dialog("Rally Annotator")

  d:add_label("Sport:", 1, 1, 1, 1)
  w_sport = d:add_dropdown(2, 1, 2, 1)
  for i, v in ipairs(SPORTS) do w_sport:add_value(v, i) end   -- add_value(text, id)

  d:add_label("Ending reason (used on Mark END):", 1, 2, 1, 1)
  w_reason = d:add_dropdown(2, 2, 2, 1)
  for i, v in ipairs(REASONS) do w_reason:add_value(v, i) end

  d:add_button("Mark START", mark_start, 1, 3, 1, 1)
  d:add_button("Mark END",   mark_end,   2, 3, 1, 1)
  d:add_button("Undo last",  undo_last,  3, 3, 1, 1)

  d:add_button("Refresh time", refresh_now, 1, 4, 1, 1)

  w_status = d:add_html("", 1, 5, 3, 2)   -- rich-text so multi-line (<br>) renders

  d:show()
  set_status("Ready. Pick the sport, play a video, then Mark START / Mark END per rally.")
end

--------------------------------------------------------------------------------
-- Lifecycle
--------------------------------------------------------------------------------
function activate()
  pending_start = nil
  last_line_len = nil
  out_path      = resolve_out_path()
  rally_count   = max_existing_rally()   -- continue numbering an existing CSV
  create_dialog()
end

function deactivate()
  if d then d:delete(); d = nil end
end

function close()
  deactivate()
  vlc.deactivate()
end
