# Time Tracker — features (browser-only)

## Must (core)
- Timer bar: description, project, tags, billable, start/stop; one running timer that survives reload/close;
  live time in the page title; continue a past entry with one click.
- Manual entries: date, start and end or a duration ("1:30", "90m", "1.5h", "1h 20m", Arabic digits).
- Entry list grouped by day with day and week totals; edit, duplicate, delete, undo.
- Projects (name, client, colour, hourly rate, archive), clients (hourly rate), tags.
- Weekly timesheet: projects × days with totals; click a cell to add time.
- Reports: range presets and custom dates, filters (client, project, tag, billable), totals, billable hours and
  amount, chart by day, breakdown by project and client.
- Exports: detailed CSV, summary CSV; saved in this browser; backup file.

## Should (full)
- Invoice from a report: client, number, dates, your details, lines by project or by entry, rounding,
  tax %, notes; print / save as PDF; invoice CSV.
- Import a Toggl Track detailed CSV export (projects, clients, tags created as needed).
- Settings: currency, default rate, week start (Sat/Sun/Mon), rounding in reports, 12/24h clock.
- Keyboard shortcuts (s start/stop, n new entry, 1-4 tabs, ?), empty states, mobile 390px, light/dark,
  S3_SELFTEST, offline service worker.

## Could (later)
- Calendar day view, Pomodoro mode, project budgets/estimates, idle detection, reminders.
