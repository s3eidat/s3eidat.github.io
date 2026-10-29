# Features: study-planner
No libraries. Single page app: index.html + app.js + app.css + sw.js. Data in S3.store("study-planner").

## Must (core stage)
- Subjects: name, colour, teacher, room. Add/edit/delete.
- Timetable: classes (subject, weekday, start/end time, room, type). Week grid view (Sat–Fri or Mon–Sun, setting).
- Exams: subject, date, time, room, topics (one per line), difficulty 1–3.
- Tasks: title, subject, due date, kind (homework/assignment/reading), done tick; overdue highlight.
- Auto revision plan: per weekday study minutes + session length; sessions from today to the day before each exam,
  weighted by difficulty and closeness, topics rotated, final review the day before. Agenda list by day, tick done,
  per-exam progress bar. "Re-plan" keeps done sessions and moves missed ones forward.
- Today view: today's classes, tasks due soon, today's sessions, next exam countdown, link to /focus-timer/.
- Backup: export/import .json file. S3.done() after export.

## Should (full stage)
- Arabic/English UI switch (RTL), remembered.
- A/B week rotation for classes (week A/B/every week, with a "this week is A" anchor).
- Export calendar .ics (classes as weekly repeat, exams, revision sessions) — import into Google/Apple calendar.
- Print view of timetable and plan.
- Keyboard shortcuts (1–5 tabs, N new item, ? help), empty states, mobile 390px, light/dark, S3_SELFTEST, offline sw.js.

## Could
- Mini focus timer inside a session; browser notification for a session (permission on click only).
- Term dates / holidays to skip; subtasks.
