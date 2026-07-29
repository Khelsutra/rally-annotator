--[[ dialog_test.lua -- headless tests for vlc/rally_annotator.lua

  The extension is a single Lua file that only talks to VLC through the global
  `vlc` table. This test STUBS that table (dialog widgets + playback) in pure Lua,
  loads the real extension, drives its callbacks, and asserts the resulting state.
  It cannot exercise VLC's actual GUI rendering, but it covers all the dialog LOGIC
  (mark/save/edit/delete/undo, reason reset, Next-# numbering, help toggle, and the
  playback controls) plus a LAYOUT SNAPSHOT of the whole widget grid + window title
  (diffed against test/dialog_layout.snapshot), and catches regressions before VLC.

  Run (needs Lua 5.1, matching VLC 3.x's embedded interpreter):
      lua5.1 test/dialog_test.lua            # from the repo root; exit 0 = pass, 1 = fail
      lua5.1 test/dialog_test.lua --update   # regenerate the layout snapshot golden
]]

-- Resolve the extension path relative to this test file, so it runs from anywhere.
local here = (arg and arg[0] and arg[0]:match("^(.*[/\\])")) or "./"
local EXT  = here .. "../vlc/rally_annotator.lua"

-- Redirect the CSV the extension writes to a temp dir, and start clean.
local TMP = os.getenv("TMPDIR") or os.getenv("TEMP") or "/tmp"
local _getenv = os.getenv
os.getenv = function(k) if k == "HOME" or k == "USERPROFILE" then return TMP end return _getenv(k) end
local sep = TMP:find("\\") and "\\" or "/"
local CSV = (TMP:sub(-1) == sep and TMP or TMP .. sep) .. "rally_labels.csv"
os.remove(CSV)

--------------------------------------------------------------------------------
-- Minimal stub of VLC's dialog/widget + playback API
--------------------------------------------------------------------------------
local function new_widget(kind, col, row, width, height)
  local w = { kind = kind, col = col, row = row, width = width or 1, height = height or 1,
              text = nil, values = {}, selection = {}, deleted = false }
  function w:set_text(t) self.text = t end
  function w:get_text() return self.text end
  function w:add_value(t, id) self.values[#self.values+1] = {id=id, text=t}; if #self.values==1 then self.sel_id=id; self.sel_text=t end end
  function w:get_value() return self.sel_id, self.sel_text end
  function w:clear() self.values = {}; self.sel_id = nil; self.sel_text = nil end
  function w:get_selection() return self.selection end
  return w
end

local DIALOG
local function new_dialog(title)
  local d = { title = title, widgets = {}, updates = 0 }
  function d:add_label(t,c,r,cs,rs) local w=new_widget('label',c,r,cs,rs); w.text=t; self.widgets[#self.widgets+1]=w; return w end
  function d:add_button(t,cb,c,r,cs,rs) local w=new_widget('button',c,r,cs,rs); w.text=t; w.cb=cb; self.widgets[#self.widgets+1]=w; return w end
  function d:add_dropdown(c,r,cs,rs) local w=new_widget('dropdown',c,r,cs,rs); self.widgets[#self.widgets+1]=w; return w end
  function d:add_list(c,r,cs,rs) local w=new_widget('list',c,r,cs,rs); self.widgets[#self.widgets+1]=w; return w end
  function d:add_text_input(t,c,r,cs,rs) local w=new_widget('text_input',c,r,cs,rs); w.text=(type(t)=='string') and t or ''; self.widgets[#self.widgets+1]=w; return w end
  function d:add_html(t,c,r,cs,rs) local w=new_widget('html',c,r,cs,rs); w.text=t; self.widgets[#self.widgets+1]=w; return w end
  function d:del_widget(w) w.deleted=true end
  function d:show() end
  function d:update() self.updates = self.updates + 1 end
  function d:delete() end
  function d:set_title(t) self.title=t end
  return d
end

-- playback state machine (mirrors VLC 3.x: pause() is a toggle)
local PB = { state = "stopped", time_us = 0 }
-- Currently-loaded media URI, or nil for "no media" (the default, so existing tests keep
-- resolving the CSV to the HOME fallback). Set MEDIA_URI to simulate a loaded video.
MEDIA_URI = nil
-- Clip duration in SECONDS and the container meta table, both nil by default so the
-- completeness readout stays UNKNOWN unless a test opts in (it must never be guessed).
MEDIA_DURATION = nil
MEDIA_METAS = nil
vlc = {
  dialog   = function(t) DIALOG = new_dialog(t); return DIALOG end,
  object   = { input = function() return (PB.state ~= "stopped") and { kind = "input" } or nil end },
  var      = {
    get = function(_, name)
      if name == "time" then return PB.time_us end
      if name == "length" then return MEDIA_DURATION and MEDIA_DURATION * 1000000 or nil end
      return nil
    end,
    set = function(_, name, val) if name == "time" then PB.time_us = val end end,
  },
  input    = { item = function()
    if not MEDIA_URI then return nil end
    return {
      uri = function() return MEDIA_URI end,
      duration = MEDIA_DURATION and function() return MEDIA_DURATION end or nil,
      metas = MEDIA_METAS and function() return MEDIA_METAS end or nil,
    }
  end },
  playlist = {
    status = function() return PB.state end,
    play   = function() PB.state = "playing" end,
    pause  = function() if PB.state == "playing" then PB.state = "paused" elseif PB.state == "paused" then PB.state = "playing" end end,
    stop   = function() PB.state = "stopped" end,
  },
  deactivate = function() end,
  msg = { dbg=function() end, warn=function() end, err=function() end, info=function() end },
}

--------------------------------------------------------------------------------
-- Assertions
--------------------------------------------------------------------------------
local pass, fail = 0, 0
local function eq(name, got, want)
  if tostring(got) == tostring(want) then pass = pass + 1
  else fail = fail + 1; print(string.format("  FAIL  %s\n          got =%s\n          want=%s", name, tostring(got), tostring(want))) end
end
local function ok(name, cond) eq(name, cond and true or false, true) end

--------------------------------------------------------------------------------
-- Load the extension and build the dialog
--------------------------------------------------------------------------------
dofile(EXT)
ok("descriptor() returns a title", descriptor().title ~= nil)
eq("descriptor version", descriptor().version, "2.1.0")
-- the title carries the version so VLC's "Active Extensions" list (which shows the
-- title verbatim) displays it next to the plugin name -- and stays in sync, no drift.
eq("descriptor title carries the version", descriptor().title, "Rally Annotator v" .. descriptor().version)
activate()
local d = DIALOG
ok("dialog was created", d ~= nil)

-- the window title carries the version, and stays in sync with the descriptor (no drift)
ok("dialog title shows version", d.title:find("v" .. descriptor().version, 1, true) ~= nil)
eq("dialog title is exactly Name + version", d.title, "Rally Annotator v" .. descriptor().version)

--------------------------------------------------------------------------------
-- Layout snapshot -- the full widget grid + window title, diffed against a committed
-- golden (test/dialog_layout.snapshot). This is the deterministic, cross-platform
-- equivalent of a screenshot diff: VLC renders extension dialogs through Qt with no
-- headless/offscreen path, so we snapshot the widget tree the extension HANDS to VLC
-- (kind, grid column/row, column/row span, and the caption/options) instead of pixels.
-- Catches any moved, resized, renamed, added, or removed control, and any title change.
-- Runs here, right after activate(), while the dialog is in its pristine initial state
-- (no rows in the temp CSV, empty Start/End, help hidden) -- before any callback below
-- mutates the widget list. Regenerate intentionally with:
--     lua5.1 test/dialog_test.lua --update      (or UPDATE_SNAPSHOT=1)
--------------------------------------------------------------------------------
local function snap_caption(w)
  if w.kind == 'dropdown' then
    local opts = {}; for _, v in ipairs(w.values) do opts[#opts+1] = v.text end
    return '[' .. table.concat(opts, ', ') .. ']'           -- dropdown options (sports / reasons)
  elseif w.kind == 'html' then return '<runtime html>'      -- status/help body is dynamic content
  elseif w.kind == 'list' then return '<list>'              -- recent-rallies list (rows are data)
  elseif w.kind == 'text_input' then return string.format('%q', w.text or '')
  else return w.text or '' end                              -- label / button caption
end
local function render_snapshot()
  local lines = { 'title :: ' .. tostring(d.title) }
  local i = 0
  for _, w in ipairs(d.widgets) do
    if not w.deleted then
      i = i + 1
      lines[#lines+1] = string.format('%2d. %-10s @(%d,%d) %dx%d :: %s',
        i, w.kind, w.col, w.row, w.width, w.height, snap_caption(w))
    end
  end
  return table.concat(lines, '\n') .. '\n'
end
local function split_lines(s) local t={}; for l in (s.."\n"):gmatch('(.-)\n') do t[#t+1]=l end; return t end

local SNAP_FILE = here .. 'dialog_layout.snapshot'
local snap_got  = render_snapshot()
local snap_update = os.getenv('UPDATE_SNAPSHOT') == '1' or (arg and arg[1] == '--update')
if snap_update then
  local f = assert(io.open(SNAP_FILE, 'w')); f:write(snap_got); f:close()
  print('  (wrote layout snapshot: ' .. SNAP_FILE .. ')')
else
  local f = io.open(SNAP_FILE, 'r'); local snap_want = f and f:read('*a') or nil; if f then f:close() end
  if snap_want == nil then
    fail = fail + 1
    print('  FAIL  layout snapshot golden missing -- create it: lua5.1 test/dialog_test.lua --update')
  elseif snap_got == snap_want then
    pass = pass + 1
  else
    fail = fail + 1
    print('  FAIL  dialog layout/title differs from ' .. SNAP_FILE)
    local g, w = split_lines(snap_got), split_lines(snap_want)
    for k = 1, math.max(#g, #w) do
      if g[k] ~= w[k] then
        print(string.format('          want L%d: %s', k, w[k] or '<missing>'))
        print(string.format('          got  L%d: %s', k, g[k] or '<missing>'))
      end
    end
    print('        If this layout change is intentional, regenerate: lua5.1 test/dialog_test.lua --update')
  end
end

-- live (non-deleted) widget by grid position; reason dropdown is recreated on reset
-- NB: these read the LIVE dialog (DIALOG), not the one captured at startup. Switching screen
-- rebuilds the whole grid, so a captured handle goes stale the moment a test declares a target.
local function find(kind, col, row)
  local f
  for _, w in ipairs(DIALOG.widgets) do if w.kind==kind and w.col==col and w.row==row and not w.deleted then f=w end end
  return f
end
local function buttonWithCb(cb) for _,w in ipairs(DIALOG.widgets) do if w.kind=='button' and w.cb==cb and not w.deleted then return w end end end
local function pickReason(name)
  local w = find('dropdown', 3, 7)
  for _, v in ipairs(w.values) do if v.text==name then w.sel_id=v.id; w.sel_text=v.text; return end end
  error('reason option not found: '..name)
end
local function curReason() return (find('dropdown',3,7)).sel_text end
local function nextF()  return (find('text_input',2,5)):get_text() end
local function setNext(s) (find('text_input',2,5)):set_text(s) end
local function setS(s)  (find('text_input',2,4)):set_text(s) end
local function setE(s)  (find('text_input',4,4)):set_text(s) end
local function setShots(s) (find('text_input',4,5)):set_text(s) end
local function getShots()  return (find('text_input',4,5)):get_text() end

local helpBtn = buttonWithCb(show_help)
local statusHtml; for _, w in ipairs(d.widgets) do if w.kind=='html' then statusHtml=w; break end end
local function dedicatedHelp()
  local n=0; for _,w in ipairs(d.widgets) do if w.kind=='html' and w~=statusHtml and not w.deleted and w.text and w.text:find('how to use',1,true) then n=n+1 end end; return n
end

--------------------------------------------------------------------------------
-- Construction: all controls wired
--------------------------------------------------------------------------------
ok("Back 5s button wired",       buttonWithCb(seek_back) ~= nil)
ok("Play / Pause button wired",  buttonWithCb(play_pause) ~= nil)
ok("single playback toggle (no separate Resume/Pause globals)",
   _G.play_resume == nil and _G.pause_playback == nil)
ok("Fwd 5s button wired",        buttonWithCb(seek_fwd) ~= nil)
ok("Mark START button wired",    buttonWithCb(mark_start) ~= nil)
ok("Save Rally button wired",    buttonWithCb(save_rally) ~= nil)
ok("reason dropdown present",    find('dropdown',3,7) ~= nil)
ok("Number of shots input present", find('text_input',4,5) ~= nil)

--------------------------------------------------------------------------------
-- i18n: every locale defines EXACTLY the en key set (catches a missing/extra/typo'd key).
-- STRINGS is exposed as a global precisely so this parity gate can run headless.
--------------------------------------------------------------------------------
do
  ok("STRINGS table is exposed", type(STRINGS) == "table" and type(STRINGS.en) == "table")
  local enKeys, nEn = {}, 0
  for k in pairs(STRINGS.en) do enKeys[k] = true; nEn = nEn + 1 end
  for _, code in ipairs({ "kn", "hi", "te", "es", "da", "id" }) do
    local n, missing, extra = 0, nil, nil
    for k in pairs(STRINGS[code] or {}) do n = n + 1; if not enKeys[k] then extra = k end end
    for k in pairs(enKeys) do if not (STRINGS[code] or {})[k] then missing = k end end
    eq("i18n " .. code .. ": key count matches en (" .. nEn .. ")", n, nEn)
    ok("i18n " .. code .. ": no missing key vs en (" .. tostring(missing) .. ")", missing == nil)
    ok("i18n " .. code .. ": no extra key vs en (" .. tostring(extra) .. ")", extra == nil)
  end
end

--------------------------------------------------------------------------------
-- Help toggle (dedicated panel add/remove)
--------------------------------------------------------------------------------
eq("help hidden initially", dedicatedHelp(), 0)
show_help(); eq("help shows on 1st click", dedicatedHelp(), 1); eq("button says Hide help", helpBtn.text, "Hide help")
show_help(); eq("help hides on 2nd click", dedicatedHelp(), 0); eq("button says Help", helpBtn.text, "Help")
show_help(); eq("help shows again", dedicatedHelp(), 1)
show_help(); eq("help hides again", dedicatedHelp(), 0)

--------------------------------------------------------------------------------
-- Rally annotation is never gated on optional target metadata. Mark and save must work on a
-- fresh clip with zero target profiles, because court selection is derived downstream.
--------------------------------------------------------------------------------
do
  PB.state = "playing"; PB.time_us = 1250000
  mark_start()
  eq("Mark START works without a target profile", find('text_input', 2, 4):get_text(), "1.250")
  find('text_input', 4, 4):set_text("2.000")
  save_rally()
  eq("Save Rally works without a target profile", find('text_input', 2, 5):get_text(), "2")
  os.remove(CSV)
  activate() -- reset the clean fixture for the rest of the suite
end

--------------------------------------------------------------------------------
-- Reason: default unknown, resets each save, consecutive identical reasons work
--------------------------------------------------------------------------------
eq("reason defaults to unknown", curReason(), "unknown")
setNext('1'); setS('1'); setE('2'); pickReason('winner'); setShots('12'); save_rally()
eq("reason resets to unknown after save A", curReason(), "unknown")
eq("shots field clears after save A", getShots(), "")          -- non-sticky like reason
eq("Next# auto-advances to 2", nextF(), "2")
setS('3'); setE('4'); pickReason('winner'); save_rally()        -- consecutive winner, no shots
eq("reason resets to unknown after save B", curReason(), "unknown")
setS('5'); setE('6'); save_rally()                              -- no pick -> unknown, no shots
eq("Next# at 4 after three saves", nextF(), "4")

--------------------------------------------------------------------------------
-- Next #: collision refused; undo of a committed row re-syncs Next#
--------------------------------------------------------------------------------
setNext('2'); setS('7'); setE('8'); pickReason('let'); save_rally()   -- #2 exists -> refuse
eq("duplicate #2 refused (Next# unchanged)", nextF(), "2")
setS(''); setE('')        -- clear in-progress so undo removes a row
setNext('99')             -- stale value
undo_last()               -- removes the last committed row (#3)
eq("undo re-syncs Next# to real next (3, not 99)", nextF(), "3")

--------------------------------------------------------------------------------
-- Verify the CSV the extension actually wrote (1=winner, 2=winner, 3 undone)
--------------------------------------------------------------------------------
local fh = io.open(CSV, "r"); local csv = fh and fh:read("*a") or ""; if fh then fh:close() end
ok("CSV has shots_count header", csv:find("rally_number,start_time,end_time,ending_reason,sport,shots_count", 1, true) ~= nil)
ok("CSV row #1 winner + shots=12", csv:find("\n1,1.000,2.000,winner,badminton,12\n", 1, true) ~= nil)
ok("CSV row #2 winner, shots column blank", csv:find("\n2,3.000,4.000,winner,badminton,\n", 1, true) ~= nil)
ok("CSV row #3 was undone (absent)", csv:find("\n3,", 1, true) == nil)
os.remove(CSV)

--------------------------------------------------------------------------------
-- Edit reloads the saved shots into the field; editing the count rewrites the CSV
--------------------------------------------------------------------------------
local lst = find('list', 1, 11)
lst.selection = { [1] = "row #1" }       -- select rally #1 in the Recent list
edit_selected()
eq("edit loads shots=12 into field", getShots(), "12")
eq("edit loads start time", (find('text_input',2,4)):get_text(), "1.000")
eq("edit loads reason winner", curReason(), "winner")
setShots('7'); save_rally()              -- change the count and commit
eq("shots field clears after edit-save", getShots(), "")
local fh2 = io.open(CSV, "r"); local csv2 = fh2 and fh2:read("*a") or ""; if fh2 then fh2:close() end
ok("edited shots persisted (#1 now 7)", csv2:find("\n1,1.000,2.000,winner,badminton,7\n", 1, true) ~= nil)
os.remove(CSV)

--------------------------------------------------------------------------------
-- Playback: one Play / Pause toggle branches on status() (playing<->paused), and
-- starts fresh from stopped. Seek is relative ±5s, clamped at 0.
--------------------------------------------------------------------------------
PB.state = "playing"; PB.time_us = 30 * 1000000
play_pause(); eq("Play/Pause while playing -> paused", PB.state, "paused")
play_pause(); eq("Play/Pause while paused -> playing", PB.state, "playing")
play_pause(); eq("Play/Pause toggles back to paused", PB.state, "paused")
seek_back();  eq("Back 5s from 30s -> 25s", PB.time_us, 25 * 1000000)
seek_fwd();   eq("Fwd 5s from 25s -> 30s", PB.time_us, 30 * 1000000)
PB.time_us = 2 * 1000000; seek_back(); eq("Back 5s from 2s clamps to 0", PB.time_us, 0)
PB.state = "stopped"; play_pause(); eq("Play/Pause from stopped -> playing", PB.state, "playing")

--------------------------------------------------------------------------------
-- Recent list shows EVERY rally, oldest first (regression: a "last 12" cap used to
-- hide the oldest rallies once there were 13+, so #1 was unselectable for Edit/Delete).
--------------------------------------------------------------------------------
do
  local f = io.open(CSV, "w")
  f:write("rally_number,start_time,end_time,ending_reason,sport,shots_count\n")
  for n = 1, 13 do f:write(string.format("%d,%d.000,%d.000,winner,badminton,\n", n, n, n + 1)) end
  f:close()
  activate()                                  -- rebuild the dialog + list from the 13-row CSV
  local L; for _, w in ipairs(DIALOG.widgets) do if w.kind == 'list' and not w.deleted then L = w end end
  ok("recent list present after reload", L ~= nil)
  eq("recent list shows all 13 rallies (no cap)", #L.values, 13)
  eq("oldest rally #1 is the first row", L.values[1] and L.values[1].text:match("^#(%d+)"), "1")
  eq("newest rally #13 is the last row", L.values[#L.values] and L.values[#L.values].text:match("^#(%d+)"), "13")
  os.remove(CSV)
end

--------------------------------------------------------------------------------
-- Data safety on resume: enabling the extension BEFORE the video loads used to write
-- rallies to ~/rally_labels.csv (the home fallback) and never reload the video's own CSV
-- on restart, so labels looked "lost". The moment a timestamp exists (video playing), the
-- first Mark START must adopt <video>.rallies.csv and load any rallies already saved for it.
--------------------------------------------------------------------------------
do
  local TMPb = (TMP:sub(-1) == sep) and TMP:sub(1, -2) or TMP
  local VIDEO_CSV = TMPb .. sep .. "clip.rallies.csv"
  os.remove(CSV); os.remove(VIDEO_CSV)
  local vf = io.open(VIDEO_CSV, "w")            -- a prior session already saved 2 rallies here
  vf:write("rally_number,start_time,end_time,ending_reason,sport,shots_count\n")
  vf:write("1,1.000,2.000,winner,badminton,\n")
  vf:write("2,3.000,4.000,let,badminton,\n")
  vf:close()

  MEDIA_URI = nil; PB.state = "stopped"          -- enable with NO video loaded -> home fallback
  activate()
  local D2 = DIALOG
  local function live(kind, c, r)
    local f; for _, w in ipairs(D2.widgets) do if w.kind==kind and w.col==c and w.row==r and not w.deleted then f=w end end; return f
  end
  local function nVals() local L; for _, w in ipairs(D2.widgets) do if w.kind=='list' and not w.deleted then L=w end end; return L and #L.values or -1 end
  eq("fallback start shows no video rallies", nVals(), 0)

  MEDIA_URI = "file://" .. TMPb .. sep .. "clip.mp4"; PB.state = "playing"; PB.time_us = 10 * 1000000
  mark_start()                                   -- video provably playing -> adopt clip.rallies.csv
  eq("Mark START adopts the video's 2 existing rallies", nVals(), 2)
  live('text_input', 4, 4):set_text("11")        -- End (s); Start was set to 10.000 by mark_start
  save_rally()
  local hv = io.open(VIDEO_CSV, "r"); local vcsv = hv and hv:read("*a") or ""; if hv then hv:close() end
  ok("new rally #3 written to <video>.rallies.csv", vcsv:find("\n3,", 1, true) ~= nil)
  local hh = io.open(CSV, "r"); local home = hh and hh:read("*a") or ""; if hh then hh:close() end
  ok("home fallback CSV was never written", home == "")
  MEDIA_URI = nil; os.remove(VIDEO_CSV); os.remove(CSV)
end

--------------------------------------------------------------------------------
-- Guard: a fully-marked-but-unsaved rally (START + END) must not be silently lost when
-- the user starts a new rally (Mark START) or jumps to editing another (Edit selected).
--------------------------------------------------------------------------------
do
  os.remove(CSV)
  MEDIA_URI = nil; PB.state = "playing"; PB.time_us = 200 * 1000000
  activate()
  local function win(kind, c, r) local f; for _, x in ipairs(DIALOG.widgets) do if x.kind==kind and x.col==c and x.row==r and not x.deleted then f=x end end; return f end
  local function listw() local L; for _, x in ipairs(DIALOG.widgets) do if x.kind=='list' and not x.deleted then L=x end end; return L end

  -- save one rally so the Recent list has a row to (attempt to) edit
  win('text_input',2,4):set_text("1.000"); win('text_input',4,4):set_text("2.000"); save_rally()
  -- arm a fresh rally: START + END filled, unsaved
  win('text_input',2,4):set_text("100.000"); win('text_input',4,4):set_text("110.000")

  mark_start()   -- would overwrite START to 200.000 -> must be REFUSED, fields untouched
  eq("armed: Mark START refused (START unchanged)", win('text_input',2,4):get_text(), "100.000")
  eq("armed: still a new rally (not pushed to edit)", win('text_input',4,4):get_text(), "110.000")

  listw().selection = { [1] = "row #1" }
  edit_selected() -- would load #1 over the armed marks -> must be REFUSED
  eq("armed: Edit selected refused (START still the armed 100.000)", win('text_input',2,4):get_text(), "100.000")

  undo_last()     -- the documented escape hatch: clears the in-progress mark
  eq("after Undo last, START cleared", win('text_input',2,4):get_text(), "")
  mark_start()    -- no longer armed -> now allowed
  eq("after clearing, Mark START works (200.000)", win('text_input',2,4):get_text(), "200.000")
  os.remove(CSV)
end

--------------------------------------------------------------------------------
-- Edit-mode prominence: the Mark buttons relabel to "Re-mark START/END (#N)" so it is
-- obvious they change the EDITED rally, not a new one; they revert when the edit ends.
--------------------------------------------------------------------------------
do
  os.remove(CSV)
  MEDIA_URI = nil; PB.state = "stopped"
  activate()
  local function markBtn(cb) for _, x in ipairs(DIALOG.widgets) do if x.kind=='button' and x.cb==cb and not x.deleted then return x end end end
  local function w23(c,r) local f; for _, x in ipairs(DIALOG.widgets) do if x.kind=='text_input' and x.col==c and x.row==r and not x.deleted then f=x end end; return f end
  local function listw() local L; for _, x in ipairs(DIALOG.widgets) do if x.kind=='list' and not x.deleted then L=x end end; return L end

  w23(2,4):set_text("1.000"); w23(4,4):set_text("2.000"); save_rally()
  eq("pristine Mark START label", markBtn(mark_start).text, "Mark START")
  eq("pristine Mark END label",   markBtn(mark_end).text,   "Mark END")

  listw().selection = { [1] = "row #1" }
  edit_selected()
  eq("editing relabels Mark START", markBtn(mark_start).text, "Re-mark START (#1)")
  eq("editing relabels Mark END",   markBtn(mark_end).text,   "Re-mark END (#1)")

  undo_last()   -- cancels the edit
  eq("after cancel Mark START label restored", markBtn(mark_start).text, "Mark START")
  eq("after cancel Mark END label restored",   markBtn(mark_end).text,   "Mark END")
  os.remove(CSV)
end

--------------------------------------------------------------------------------
-- Language switch: picking a locale + change_language() rebuilds the dialog localized;
-- switching back restores English. (The CSV stays canonical regardless -- the save path
-- maps the selected dropdown id back to the canonical value, exercised above.)
--------------------------------------------------------------------------------
do
  local LANGCFG = (TMP:sub(-1) == sep and TMP or TMP .. sep) .. ".rally_annotator_lang"
  os.remove(LANGCFG); os.remove(CSV)
  MEDIA_URI = nil; PB.state = "stopped"
  activate()
  local function lbl(c, r) for _, w in ipairs(DIALOG.widgets) do if w.kind=='label' and w.col==c and w.row==r and not w.deleted then return w end end end
  local function langDrop() for _, w in ipairs(DIALOG.widgets) do if w.kind=='dropdown' and w.col==2 and w.row==16 and not w.deleted then return w end end end
  eq("sport label English before switch", lbl(1,2) and lbl(1,2).text, "Sport:")
  ok("language dropdown present at (2,16)", langDrop() ~= nil)
  langDrop().sel_id = 2            -- kn = LOCALES[2]
  change_language()
  ok("sport label localized (non-English) after switch to kn", lbl(1,2) ~= nil and lbl(1,2).text ~= "Sport:")
  langDrop().sel_id = 1            -- en = LOCALES[1]
  change_language()
  eq("sport label English again after switch back", lbl(1,2) and lbl(1,2).text, "Sport:")
  os.remove(LANGCFG); os.remove(CSV)
end

--------------------------------------------------------------------------------
-- Screens: the nav row switches between the rally track, the clip-metadata sidecar and the
-- window track. A switch must never cost the operator an in-progress mark (the whole grid
-- is rebuilt, so the field values have to survive it).
--------------------------------------------------------------------------------
local function wd(kind, c, r)
  local f
  for _, w in ipairs(DIALOG.widgets) do
    if w.kind == kind and w.col == c and w.row == r and not w.deleted then f = w end
  end
  return f
end
local function wbtn(text)
  for _, w in ipairs(DIALOG.widgets) do
    if w.kind == 'button' and not w.deleted and w.text and w.text:find(text, 1, true) then return w end
  end
end
local function read_file(p)
  local f = io.open(p, "r"); local s = f and f:read("*a") or nil; if f then f:close() end; return s
end

local TMPb = (TMP:sub(-1) == sep) and TMP:sub(1, -2) or TMP
local CLIPMETA = TMPb .. sep .. "rally_labels.clipmeta.json"
local WINCSV   = TMPb .. sep .. "rally_labels.windows.csv"

do
  os.remove(CSV); os.remove(CLIPMETA); os.remove(WINCSV)
  MEDIA_URI = nil; PB.state = "playing"; PB.time_us = 0
  activate()
  ok("nav: Rallies button present",  wbtn("Rallies") ~= nil)
  ok("nav: Clip info button present", wbtn("Clip info") ~= nil)
  ok("nav: Target button removed",   wbtn("Target") == nil)
  ok("nav: Review button removed",   wbtn("Review") == nil)
  ok("nav offers NO neighborhood-window screen", wbtn("Windows") == nil)
  eq("nav marks the active screen", wbtn("Rallies").text:sub(1, 3), "\226\150\184")

  -- Arm a rally and visit Clip info. Legacy target/review builders remain testable for old
  -- sidecars, but there is deliberately no operator-facing navigation to them.
  wd('text_input', 2, 4):set_text("12.500")
  wd('text_input', 4, 4):set_text("18.250")
  show_clip()
  ok("clip screen has the venue field", wd('text_input', 2, 2) ~= nil)
  ok("clip screen has no rally reason dropdown", wd('dropdown', 3, 7) == nil)
  show_target()
  ok("target screen has the camera-section field", wd('text_input', 2, 2) ~= nil)
  ok("target screen has the play-volume field", wd('text_input', 2, 4) ~= nil)
  show_review()
  ok("review screen has the target-state dropdown", wd('dropdown', 4, 4) ~= nil)
  eq("review offers exactly three answers", #wd('dropdown', 4, 4).values, 3)
  show_rallies()
  eq("switching screens preserves the armed START", wd('text_input', 2, 4):get_text(), "12.500")
  eq("switching screens preserves the armed END",   wd('text_input', 4, 4):get_text(), "18.250")
  wd('text_input', 2, 4):set_text(""); wd('text_input', 4, 4):set_text("")
end

--------------------------------------------------------------------------------
-- Clip metadata sidecar: two SEPARATE court counts, blank == "not screened" (null, never
-- 0/false/a default), and the collector's active<=visible invariant enforced here so an
-- invalid sidecar can never reach import.
--------------------------------------------------------------------------------
do
  os.remove(CLIPMETA)
  show_clip()
  local venue, camera = wd('text_input', 2, 2), wd('text_input', 4, 2)
  local visible, active = wd('text_input', 2, 3), wd('text_input', 4, 3)
  local partial = wd('text_input', 2, 4)
  local notes = wd('text_input', 2, 6)
  local statusw; for _, w in ipairs(DIALOG.widgets) do if w.kind == 'html' and not w.deleted then statusw = w end end

  -- GX010150: 2 courts visible, 1 active -- a divider excludes the neighbour.
  venue:set_text("bxh_indiranagar"); camera:set_text("bxh_low_side_a")
  visible:set_text("2"); active:set_text("1"); partial:set_text("0")
  notes:set_text("divider excludes the neighbour")
  save_clip_info()
  local j = read_file(CLIPMETA) or ""
  ok("clipmeta written", #j > 0)
  ok("clipmeta records courts VISIBLE", j:find('"court_count": 2', 1, true) ~= nil)
  ok("clipmeta records courts IN PLAY separately", j:find('"active_court_count": 1', 1, true) ~= nil)
  ok("clipmeta records the partial-court count", j:find('"partially_visible_court_count": 0', 1, true) ~= nil)
  ok("clipmeta records venue", j:find('"venue_id": "bxh_indiranagar"', 1, true) ~= nil)
  ok("clipmeta is version 2", j:find('"clipmeta_version": 2', 1, true) ~= nil)
  ok("clipmeta has a target_profiles array", j:find('"target_profiles"', 1, true) ~= nil)
  ok("clip screen no longer asks for a target court", wd('text_input', 4, 4) == nil)
  ok("unset match_format writes null, never a guess", j:find('"match_format": null', 1, true) ~= nil)
  ok("no container date -> capture_time_utc null", j:find('"capture_time_utc": null', 1, true) ~= nil)
  ok("clipmeta names its generator", j:find('"generator": "rally%-annotator%-vlc/') ~= nil)

  -- a court cannot be in play without being in frame
  active:set_text("3")
  save_clip_info()
  ok("active > visible is refused", statusw.text:find("cannot exceed", 1, true) ~= nil)
  eq("refused write left the file unchanged", read_file(CLIPMETA), j)
  active:set_text("1")

  partial:set_text("9")
  save_clip_info()
  ok("partial > visible is refused", statusw.text:find("cannot exceed", 1, true) ~= nil)
  partial:set_text("0")

  visible:set_text("two")
  save_clip_info()
  ok("non-numeric court count is refused loudly", statusw.text:find("whole number", 1, true) ~= nil)

  -- blank == not screened, which must survive as null rather than becoming 0
  visible:set_text(""); active:set_text(""); partial:set_text("")
  save_clip_info()
  local j2 = read_file(CLIPMETA) or ""
  ok("blank court_count writes null (unscreened)", j2:find('"court_count": null', 1, true) ~= nil)
  ok("blank active_court_count writes null (unscreened)", j2:find('"active_court_count": null', 1, true) ~= nil)
  ok("blank is not 0", j2:find('"court_count": 0', 1, true) == nil)

  -- Badminton_BXH_2: 4 visible / 3 active, singles -- and the format picker round-trips.
  visible:set_text("4"); active:set_text("3")
  local fmt = wd('dropdown', 2, 5)
  for _, v in ipairs(fmt.values) do if v.text == "singles" then fmt.sel_id = v.id end end
  save_clip_info()
  local j3 = read_file(CLIPMETA) or ""
  ok("4 visible / 3 active recorded", j3:find('"court_count": 4', 1, true) and j3:find('"active_court_count": 3', 1, true))
  ok("match_format singles recorded", j3:find('"match_format": "singles"', 1, true) ~= nil)

  -- re-enabling the extension reloads what was screened rather than re-asking
  activate(); show_clip()
  eq("clip info reloads on re-open (visible)", wd('text_input', 2, 3):get_text(), "4")
  eq("clip info reloads on re-open (active)",  wd('text_input', 4, 3):get_text(), "3")
  eq("clip info reloads on re-open (venue)",   wd('text_input', 2, 2):get_text(), "bxh_indiranagar")
end

--------------------------------------------------------------------------------
-- Target profiles: one per static camera section, validated FAIL-CLOSED. Nothing here asks
-- about a surrounding court -- that requirement was withdrawn.
--------------------------------------------------------------------------------
do
  os.remove(CLIPMETA); os.remove(WINCSV)
  MEDIA_URI = nil; PB.state = "playing"
  activate(); show_target()
  local sec, court = wd('text_input', 2, 2), wd('text_input', 4, 2)
  local poly = wd('text_input', 2, 4)
  local statusw; for _, w in ipairs(DIALOG.widgets) do if w.kind == 'html' and not w.deleted then statusw = w end end

  eq("setup validity offers three answers", #wd('dropdown', 4, 3).values, 3)

  -- a pixel polygon is the likeliest operator mistake, and the one that would be wrong
  -- but perfectly well-formed
  sec:set_text("s1"); court:set_text("3")
  poly:set_text("120,540 880,540 1010,980 70,980")
  save_target_profile()
  ok("pixel coordinates are refused", statusw.text:find("NORMALIZED", 1, true) ~= nil)
  ok("nothing written on refusal", read_file(CLIPMETA) == nil)

  poly:set_text("0.2,0.5 0.8,0.5")
  save_target_profile()
  ok("a 2-point polygon is refused", statusw.text:find("at least 3 points", 1, true) ~= nil)

  poly:set_text("0.2,0.5 0.8,0.5 0.95,0.98 0.05,0.98")
  sec:set_text("")
  save_target_profile()
  ok("a missing camera section is refused", statusw.text:find("Camera section ID is required", 1, true) ~= nil)
  sec:set_text("s1"); court:set_text("")
  save_target_profile()
  ok("a missing target court is refused", statusw.text:find("Target court ID is required", 1, true) ~= nil)

  court:set_text("3")
  save_target_profile()
  local j = read_file(CLIPMETA) or ""
  ok("a valid profile is written", j:find('"camera_section_id": "s1"', 1, true) ~= nil)
  ok("with its target court", j:find('"target_court_id": "3"', 1, true) ~= nil)
  ok("with a normalized polygon", j:find("[0.2, 0.5]", 1, true) ~= nil)
  ok("and its setup validity", j:find('"setup_validity": "supported"', 1, true) ~= nil)
  eq("one profile listed", #wd('list', 1, 10).values, 1)

  -- re-saving the same section replaces rather than duplicating
  court:set_text("4")
  save_target_profile()
  eq("re-saving a section does not duplicate it", #wd('list', 1, 10).values, 1)
  ok("re-save updated the court", (read_file(CLIPMETA) or ""):find('"target_court_id": "4"', 1, true) ~= nil)

  -- a second section is a second profile
  sec:set_text("s2"); court:set_text("5")
  save_target_profile()
  eq("a second camera section adds a profile", #wd('list', 1, 10).values, 2)

  -- profiles survive a reopen
  activate(); show_target()
  eq("profiles reload on re-open", #wd('list', 1, 10).values, 2)

  wd('list', 1, 10).selection = { [1] = "row" }
  delete_target_profile()
  eq("delete removes the selected profile", #wd('list', 1, 10).values, 1)
  os.remove(CLIPMETA)
end

--------------------------------------------------------------------------------
-- Legacy sidecars may contain compact normalized polygon strings. Keep accepting them even
-- though the annotator no longer exposes a manual target editor.
--------------------------------------------------------------------------------
do
  os.remove(CLIPMETA)
  MEDIA_URI = nil; PB.state = "playing"
  activate(); show_target()
  wd('text_input', 2, 2):set_text("s1")
  wd('text_input', 4, 2):set_text("3")
  wd('text_input', 2, 4):set_text("0.208,0.541 0.775,0.541 0.942,0.983 0.061,0.983")
  save_target_profile()
  local j = read_file(CLIPMETA) or ""
  ok("the normalized polygon string is accepted verbatim", j:find("[0.208, 0.541]", 1, true) ~= nil)
  ok("and every legacy corner survives", j:find("[0.061, 0.983]", 1, true) ~= nil)
  eq("one profile saved from it", #wd('list', 1, 10).values, 1)
  os.remove(CLIPMETA)
end

--------------------------------------------------------------------------------
-- Sparse target-state review: three answers, all about the TARGET court. No quota.
--------------------------------------------------------------------------------
do
  local REVIEWCSV = TMPb .. sep .. "rally_labels.target-review.csv"
  os.remove(CLIPMETA); os.remove(REVIEWCSV); os.remove(WINCSV)
  MEDIA_URI = nil; PB.state = "playing"
  activate(); show_review()
  local rs, re_ = wd('text_input', 2, 3), wd('text_input', 4, 3)
  local statusw; for _, w in ipairs(DIALOG.widgets) do if w.kind == 'html' and not w.deleted then statusw = w end end

  local states = {}
  for _, v in ipairs(wd('dropdown', 4, 4).values) do states[#states + 1] = v.text end
  eq("exactly three answers offered", #states, 3)
  for _, txt in ipairs(states) do
    ok("no answer names a neighbouring court (" .. txt .. ")",
       txt:find("adjacent", 1, true) == nil and txt:find("simultaneous", 1, true) == nil)
  end

  rs:set_text("412.5"); re_:set_text("418.25")
  save_review()
  ok("a review is refused before any target profile exists",
     statusw.text:find("Save a target profile first", 1, true) ~= nil)
  ok("nothing written", read_file(REVIEWCSV) == nil)

  show_target()
  wd('text_input', 2, 2):set_text("s1"); wd('text_input', 4, 2):set_text("3")
  wd('text_input', 2, 4):set_text("0.2,0.5 0.8,0.5 0.95,0.98 0.05,0.98")
  save_target_profile()
  show_review()
  rs, re_ = wd('text_input', 2, 3), wd('text_input', 4, 3)
  for _, w in ipairs(DIALOG.widgets) do if w.kind == 'html' and not w.deleted then statusw = w end end
  local st = wd('dropdown', 4, 4)
  for _, v in ipairs(st.values) do if v.id == 2 then st.sel_id = v.id end end   -- not_rallying
  rs:set_text("412.5"); re_:set_text("418.25")
  save_review()
  local rv = read_file(REVIEWCSV) or ""
  ok("review header", rv:find("review_number,start_time,end_time,target_state,camera_section_id,source,notes", 1, true) ~= nil)
  ok("answer written with the canonical state", rv:find("\n1,412.500,418.250,not_rallying,s1,operator,", 1, true) ~= nil)
  eq("review fields clear after save", (wd('text_input', 2, 3)):get_text(), "")

  ok("no quota or per-category tally is shown", statusw.text:find("/12", 1, true) == nil)

  -- reversed marks swap; a zero-length interval is refused
  rs, re_ = wd('text_input', 2, 3), wd('text_input', 4, 3)
  rs:set_text("50"); re_:set_text("50")
  save_review()
  ok("zero-length interval refused", statusw.text:find("later than", 1, true) ~= nil)
  rs:set_text("60"); re_:set_text("55")
  save_review()
  ok("reversed marks swapped", (read_file(REVIEWCSV) or ""):find("\n2,55.000,60.000,", 1, true) ~= nil)

  wd('list', 1, 10).selection = { [1] = "row" }
  delete_review()
  ok("delete removes the selected review", (read_file(REVIEWCSV) or ""):find("\n1,", 1, true) == nil)
  undo_review()
  eq("undo removes the last review", #wd('list', 1, 10).values, 0)

  -- reviews reload, and the rally CSV is untouched throughout
  ok("rally CSV untouched by reviewing", read_file(CSV) == nil)
  os.remove(CLIPMETA); os.remove(REVIEWCSV)
end

--------------------------------------------------------------------------------
-- A legacy neighborhood windows.csv is DETECTED AND REFUSED: never read, never converted.
--------------------------------------------------------------------------------
do
  local REVIEWCSV = TMPb .. sep .. "rally_labels.target-review.csv"
  os.remove(CLIPMETA); os.remove(REVIEWCSV)
  local f = io.open(WINCSV, "w")
  f:write("window_number,start_time,end_time,window_label,target_court_id,notes\n")
  f:write("1,12.500,18.250,adjacent_court_rally,3,\n")
  f:write("2,30.000,36.000,target_rally,3,\n")
  f:close()

  MEDIA_URI = nil; PB.state = "playing"
  activate(); show_review()
  local statusw; for _, w in ipairs(DIALOG.widgets) do if w.kind == 'html' and not w.deleted then statusw = w end end
  eq("legacy windows are NOT loaded as reviews", #wd('list', 1, 10).values, 0)
  ok("the legacy file is called out as refused", statusw.text:find("NOT read", 1, true) ~= nil)
  ok("nothing was converted into a review file", read_file(REVIEWCSV) == nil)
  ok("the legacy file itself is left untouched",
     (read_file(WINCSV) or ""):find("adjacent_court_rally", 1, true) ~= nil)
  os.remove(WINCSV); os.remove(CLIPMETA)
end

--------------------------------------------------------------------------------
-- A withdrawn label must not survive anywhere an operator can reach it.
--------------------------------------------------------------------------------
do
  local WITHDRAWN = { "adjacent_court_rally", "simultaneous_rallies", "target_court_non_rally" }
  local offenders = {}
  for code, tbl in pairs(STRINGS) do
    for key, val in pairs(tbl) do
      if key ~= "legacy.windowsPresent" then
        for _, bad in ipairs(WITHDRAWN) do
          if tostring(val):find(bad, 1, true) then
            offenders[#offenders + 1] = code .. "/" .. key .. " -> " .. bad
          end
        end
      end
    end
  end
  eq("no localized string anywhere still offers a withdrawn neighborhood label",
     #offenders == 0 and "none" or table.concat(offenders, ", "), "none")
end

--------------------------------------------------------------------------------
-- Refresh after switching videos must repaint the Clip info / Windows screens, not just
-- reload them into memory. Regression: the boxes kept video A's text while clip_path already
-- pointed at video B, so a Save would have written A's metadata into B's sidecar.
--------------------------------------------------------------------------------
do
  local A = TMPb .. sep .. "vidA"
  local B = TMPb .. sep .. "vidB"
  for _, stem in ipairs({ A, B }) do
    os.remove(stem .. ".rallies.csv"); os.remove(stem .. ".clipmeta.json"); os.remove(stem .. ".target-review.csv")
  end
  MEDIA_DURATION = nil; MEDIA_METAS = nil

  -- video A: screened as 2 visible / 1 active, target court "3"
  MEDIA_URI = "file://" .. A .. ".mp4"; PB.state = "playing"; PB.time_us = 0
  activate(); show_clip()
  wd('text_input', 2, 2):set_text("Boxhill")
  wd('text_input', 2, 3):set_text("2"); wd('text_input', 4, 3):set_text("1")
  save_clip_info()
  ok("video A clipmeta written", read_file(A .. ".clipmeta.json") ~= nil)

  -- switch to video B (never screened) and Refresh while still on the Clip info screen
  MEDIA_URI = "file://" .. B .. ".mp4"
  refresh_now()
  eq("Refresh clears the previous clip's venue", wd('text_input', 2, 2):get_text(), "")
  eq("Refresh clears the previous clip's court count", wd('text_input', 2, 3):get_text(), "")
  eq("Refresh clears the previous clip's partial count", wd('text_input', 2, 4):get_text(), "")

  -- and a Save now must not carry A's values into B's sidecar
  wd('text_input', 2, 3):set_text("4"); wd('text_input', 4, 3):set_text("3")
  save_clip_info()
  local jb = read_file(B .. ".clipmeta.json") or ""
  ok("video B sidecar written", #jb > 0)
  ok("B has its own counts", jb:find('"court_count": 4', 1, true) ~= nil)
  ok("B did not inherit A's venue", jb:find('"venue_id": null', 1, true) ~= nil)
  ok("B did not inherit A's camera setup", jb:find('"camera_setup_id": null', 1, true) ~= nil)
  local ja = read_file(A .. ".clipmeta.json") or ""
  ok("A's sidecar was left intact", ja:find('"court_count": 2', 1, true) ~= nil)

  -- the same must hold for the review list
  MEDIA_URI = "file://" .. A .. ".mp4"
  refresh_now(); show_review()
  eq("A has no reviews yet", #wd('list', 1, 10).values, 0)

  for _, stem in ipairs({ A, B }) do
    os.remove(stem .. ".rallies.csv"); os.remove(stem .. ".clipmeta.json"); os.remove(stem .. ".target-review.csv")
  end
  MEDIA_URI = nil; activate(); show_rallies()
end

--------------------------------------------------------------------------------
-- Clip-info input survives a dialog REBUILD.
--
-- Regression for three 2.1.0 sidecars that came back "match_format": null after the operator
-- had picked a format. The dropdown itself was never broken (a 2.1.0 clip does carry
-- "doubles"): capture_form() covered the rally and review screens but not the clip screen, so
-- any rebuild -- nav switch, language switch, or the Refresh button sitting one cell from Save
-- -- silently repainted the whole screen from `clip`. A cleared TEXT box is visibly empty and
-- gets retyped; a cleared DROPDOWN repaints as "(not set)", which reads as a deliberate answer.
-- That asymmetry is why camera_setup_id survived on the same clip whose match_format did not.
--------------------------------------------------------------------------------
do
  local function pick_format(name)
    local fmt = wd('dropdown', 2, 5)
    for _, v in ipairs(fmt.values) do if v.text == name then fmt.sel_id = v.id end end
    return fmt
  end
  local function fmt_shown()
    local fmt = wd('dropdown', 2, 5)
    return fmt and fmt.values[1] and fmt.values[1].text        -- selected value is added FIRST
  end

  -- 1. A NAV round-trip must not eat the pick.
  os.remove(CLIPMETA); MEDIA_URI = nil
  activate(); show_clip()
  wd('text_input', 2, 3):set_text("2"); wd('text_input', 4, 3):set_text("2")
  wd('text_input', 2, 2):set_text("bxh_indiranagar")
  pick_format("doubles")
  show_rallies(); show_clip()
  eq("nav round-trip repaints the format as picked", fmt_shown(), "doubles")
  eq("nav round-trip preserves an unsaved venue", wd('text_input', 2, 2):get_text(), "bxh_indiranagar")
  eq("nav round-trip preserves an unsaved court count", wd('text_input', 2, 3):get_text(), "2")
  save_clip_info()
  local j = read_file(CLIPMETA) or ""
  ok("format picked BEFORE a nav switch is still saved", j:find('"match_format": "doubles"', 1, true) ~= nil)
  ok("a rebuilt-then-saved clip is not null", j:find('"match_format": null', 1, true) == nil)

  -- 2. A LANGUAGE switch must not eat it either (it rebuilds through the same path).
  local LANGCFG = (TMP:sub(-1) == sep and TMP or TMP .. sep) .. ".rally_annotator_lang"
  os.remove(CLIPMETA); os.remove(LANGCFG)
  activate(); show_clip()
  wd('text_input', 2, 3):set_text("2")
  pick_format("singles")
  local langDrop = wd('dropdown', 2, 10)                       -- clip screen's language row
  ok("clip screen carries the language row", langDrop ~= nil)
  langDrop.sel_id = 2; change_language()                       -- -> kn, whole grid rebuilt
  save_clip_info()
  local jl = read_file(CLIPMETA) or ""
  ok("format survives a language switch", jl:find('"match_format": "singles"', 1, true) ~= nil)
  ok("the sidecar stays canonical English regardless of UI language",
     jl:find('"match_format": "singles"', 1, true) ~= nil)
  langDrop = wd('dropdown', 2, 10); langDrop.sel_id = 1; change_language()   -- back to en
  os.remove(LANGCFG)

  -- 3. The REFRESH button is the likeliest trigger -- it sits on the clip screen itself, one
  --    cell from Save. Same video => re-read the sidecar, but keep the in-progress edit.
  local STEM = TMPb .. sep .. "clipfmt_refresh"
  os.remove(STEM .. ".clipmeta.json"); os.remove(STEM .. ".rallies.csv")
  MEDIA_URI = "file://" .. STEM .. ".mp4"; PB.state = "playing"
  activate(); show_clip()
  wd('text_input', 2, 3):set_text("3"); wd('text_input', 4, 3):set_text("2")
  pick_format("mixed")
  refresh_now()                                                -- same video -> rebuild_after_sync(false)
  eq("same-video Refresh repaints the format as picked", fmt_shown(), "mixed")
  eq("same-video Refresh preserves an unsaved court count", wd('text_input', 2, 3):get_text(), "3")
  save_clip_info()
  local jr = read_file(STEM .. ".clipmeta.json") or ""
  ok("format picked BEFORE Refresh is still saved", jr:find('"match_format": "mixed"', 1, true) ~= nil)

  -- 4. ...but switching to a DIFFERENT video must still drop it. Carrying an unsaved format
  --    across videos would write A's answer into B's sidecar -- the failure rebuild_after_sync
  --    (true) already guards for venue/counts, now also for the format.
  local OTHER = TMPb .. sep .. "clipfmt_other"
  os.remove(OTHER .. ".clipmeta.json")
  show_clip(); pick_format("doubles")
  MEDIA_URI = "file://" .. OTHER .. ".mp4"
  refresh_now()
  eq("a video switch drops the previous clip's unsaved format", fmt_shown(), "(not set)")
  wd('text_input', 2, 3):set_text("1")
  save_clip_info()
  local jo = read_file(OTHER .. ".clipmeta.json") or ""
  ok("video B did not inherit A's unsaved format", jo:find('"match_format": null', 1, true) ~= nil)

  for _, s in ipairs({ STEM, OTHER }) do
    os.remove(s .. ".clipmeta.json"); os.remove(s .. ".rallies.csv"); os.remove(s .. ".target-review.csv")
  end
  MEDIA_URI = nil; PB.state = "stopped"
end

--------------------------------------------------------------------------------
-- A null match_format is WARNED, not blocked. Blocking would force an answer out of an
-- operator who cannot tell, and a guessed singles/doubles is worse than a recorded unknown.
-- But it must not be silent: the downstream primary-split gate cannot evidence its
-- singles+doubles minimum from nulls, and finding that out later costs a re-annotation pass.
--------------------------------------------------------------------------------
do
  os.remove(CLIPMETA); MEDIA_URI = nil
  activate(); show_clip()
  local statusw; for _, w in ipairs(DIALOG.widgets) do if w.kind == 'html' and not w.deleted then statusw = w end end
  wd('text_input', 2, 3):set_text("2"); wd('text_input', 4, 3):set_text("2")
  save_clip_info()
  local j = read_file(CLIPMETA) or ""
  ok("a null match_format still SAVES (warn, never block)", j:find('"court_count": 2', 1, true) ~= nil)
  ok("...and is still written as null, never guessed", j:find('"match_format": null', 1, true) ~= nil)
  ok("...but the save says the format is missing", statusw.text:find("not set", 1, true) ~= nil)
  ok("...and says which answer is missing", statusw.text:find("singles/doubles", 1, true) ~= nil)

  local fmt = wd('dropdown', 2, 5)
  for _, v in ipairs(fmt.values) do if v.text == "doubles" then fmt.sel_id = v.id end end
  save_clip_info()
  ok("a set format saves without the warning", statusw.text:find("not set", 1, true) == nil)
  ok("...and confirms the save", statusw.text:find("Saved clip info", 1, true) ~= nil)
  os.remove(CLIPMETA)
end

--------------------------------------------------------------------------------
print(string.format("\n%d passed, %d failed", pass, fail))
os.exit(fail == 0 and 0 or 1)
