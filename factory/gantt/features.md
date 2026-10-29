# Gantt — features (browser-only)

## Must (core)
- Task table: ID, name, duration (working days; "5", "5d", "2w", 0 = milestone), start, finish, % complete,
  predecessors ("2, 3FS+2, 5SS-1"); inline editing; add task/milestone, delete, indent/outdent (summary tasks
  roll up dates and progress), move up/down.
- Dependencies FS/SS/FF/SF with lag; auto-scheduling (a task starts as soon as its links allow, never before
  the start you set); cycles refused.
- Gantt chart: bars with progress, summary bars, milestones, dependency arrows, today line, weekend shading;
  zoom day / week / month; drag a bar to move, drag its end to change duration, drag from its dot to another bar
  to link.
- Critical path highlight.
- Calendar: project start, weekend days (Fri+Sat, Sat+Sun, Sun only, none), holidays.
- Save in the browser, save/open file, undo/redo, export PNG and CSV.

## Should (full)
- Export PDF (image), import CSV (ours and MS Project CSV export), open Microsoft Project XML (MSPDI).
- Baseline: save and show the original plan under the bars; variance in days.
- Task sheet with notes, resource names and colour; several projects in the browser.
- Keyboard: Enter new task, Tab/Shift+Tab indent, Alt+Up/Down move, Delete, Ctrl+Z/Y, ?.
- Mobile 390px (name column + chart, edit in a sheet), light/dark, empty state + templates, S3_SELFTEST, offline.

## Could (later)
- Resource view and over-allocation, cost columns, MS Project XML export, print to multiple pages.
