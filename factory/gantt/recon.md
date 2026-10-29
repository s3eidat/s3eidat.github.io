# Recon: Gantt (free alternative to Microsoft Project)

Light recon, public pages only (run 2026-10-29). Nothing from Microsoft (code, icons, ribbon design, copy) is
reused. Generic scheduling terms only (task, duration, predecessor, lag, milestone, critical path, baseline).

## What the paid app is
Project scheduling: task list with outline (summary tasks), durations in working days, predecessors (FS/SS/FF/SF
with lag), auto-scheduling, Gantt chart, milestones, critical path, baselines, resources and calendars, timeline,
reports; desktop app plus web (now sold as "Planner and Project" plans).

## Pricing (secondary sources; they disagree — verify on the vendor page before quoting a number)
- Planner Plan 1 about $10 per user per month; "Planner and Project Plan 3" about $30 per user per month, and it is
  the tier that adds baselines, critical path, lead/lag and the desktop app. AI features need a separate Copilot
  licence. Sources: https://www.ppm.express/microsoft-planner-licensing-pricing (competitor),
  https://costbench.com/software/project-management/microsoft-project , https://www.larksuite.com/en_us/blog/microsoft-project-pricing
- Guide copy rule: say "critical path and baselines are on the higher paid plan", avoid exact prices.

## What users run into
- Cost per user for scheduling basics (critical path, baselines are on the expensive tier — sources above).
- Free Gantt tools often leave out dependency arrows or critical path on the free plan, or limit export
  (https://softpicker.com/how-to-create-gantt-chart-online-free/ ; https://clickup.com/blog/free-gantt-chart-software/).
- Exports that drop dependencies (monday.com community: https://community.monday.com/t/customization-within-the-gantt-widget-export-the-whole-gantt/91202).
- Free desktop alternatives people name: ProjectLibre, GanttProject (installs, older UI):
  https://ones.com/blog/reddits-top-picks-free-gantt-chart-software-worth-using/ (vendor roundup, treat with care).

## Our angle
In the browser, no install, no account: outline with summary tasks, working-day durations with a weekend you
choose (Fri/Sat or Sat/Sun) and holidays, all four dependency types with lag, auto-scheduling, critical path,
baseline, progress, export PNG/PDF/CSV, open Microsoft Project XML and CSV files. Nothing uploaded.

## Honest limits (do not claim)
- No resource levelling, cost/budget tracking, multiple calendars per task, team sharing or sync.
- MS Project XML import reads tasks, outline, dates, durations, progress and links; not resources, costs,
  custom fields or calendars. No .mpp files.
- PDF export is an image of the chart in a PDF.
