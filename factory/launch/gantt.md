# Launch posts: Gantt (free alternative to Microsoft Project)

App: https://s3eidat.github.io/gantt/
Guide: https://s3eidat.github.io/guides/gantt/

Facts you can say (all true in the code): free, no account, no install, data saved only in the browser, works
offline after first load, outline with summary tasks, durations in working days, weekend choice (Sat+Sun, Fri+Sat,
Sun, Fri, none) and holidays, predecessors FS/SS/FF/SF with lag or lead, automatic scheduling, loops refused,
critical path and float, baseline with variance, milestones, % complete, drag to move/resize/link, zoom
days/weeks/months, several projects, export PNG/PDF (image)/SVG/CSV, import CSV and Microsoft Project XML.
Not true / don't claim: .mpp files, resources/costs/levelling, team sharing or sync, MS Project export, AI,
Arabic interface (Arabic task names work).

## AlternativeTo (suggest as alternative to Microsoft Project)

**Name:** S3eidat Gantt
**Short description:** Free Gantt chart planner in the browser with dependencies, critical path, baselines and MS Project XML import.
**Description:**
Gantt is a project planner that runs entirely in your browser. Build an outline of tasks and summary tasks, give
them durations in working days, and link them with finish-to-start, start-to-start, finish-to-finish or
start-to-finish links with lag. Tasks schedule themselves on your calendar (choose the weekend days and add
holidays), the critical path and float are shown, and a baseline lets you compare the plan with what's happening.
Drag bars to move or resize them and drag between bars to link. Export PNG, PDF, SVG or CSV; open CSV and
Microsoft Project XML files. No account, nothing uploaded, works offline. No resources, costs or team sync.
**Tags:** gantt-chart, project-management, critical-path, scheduling, privacy, offline, no-signup
**License:** Free. **Platforms:** Web (any modern browser, desktop and mobile).

## Show HN

**Title:** Show HN: A Gantt planner with critical path and MS Project XML import, entirely in the browser

**First comment:**
This is a static page that does the scheduling core of a desktop project tool: an outline with summary tasks,
working-day durations, FS/SS/FF/SF links with lag, a forward/backward pass for float and the critical path, and
baselines. Dates are mapped to a working-day index (weekend days and holidays removed), so a task is just
[start, start + duration) and every link type becomes one integer inequality; that made the scheduler small
and easy to test against a brute-force calendar.

It opens Microsoft Project XML (MSPDI) and CSV, and exports PNG/PDF/SVG/CSV. No network calls (CSP
connect-src 'self'), data in localStorage plus a JSON file. Plain JS, no build. Known gaps: no resources or
costs, no .mpp, no multi-user. I'd love bug reports from people who plan real projects with it.

## Reddit

**Subreddit:** r/SideProject — sharing things you built is what it's for; say you made it and reply to comments.
(Check r/projectmanagement's rules before posting there; self-promotion is usually limited.)

**Title:** I made a free Gantt chart planner with critical path that runs in your browser (no sign-up)

**Body:**
Disclosure: I built this. It's free, no account, and your plan stays on your device.

List your tasks, give them durations in working days and link them (finish-to-start, start-to-start, etc., with
lag). It schedules everything for you, shows the critical path, and lets you save a baseline to see if you're
slipping. You can set the weekend to Fri/Sat or Sat/Sun and add holidays. It exports PNG, PDF and CSV, and it can
open Microsoft Project XML files.

What it doesn't do: resources and costs, .mpp files, or shared editing.

Link: https://s3eidat.github.io/gantt/ — feedback welcome.

## X (Twitter)

Free Gantt chart planner in your browser: working-day scheduling, dependencies with lag, critical path, baselines,
PNG/PDF/CSV export, opens MS Project XML. No sign-up, nothing uploaded. https://s3eidat.github.io/gantt/

## Arabic post (Jordanian / Arab student groups)

أداة مجانية لعمل مخطط جانت (Gantt Chart) بدون تسجيل 📅
بتكتب مهام المشروع ومدة كل وحدة بأيام العمل، وبتربطها ببعض، والأداة بتجدول المشروع لحالها وبتطلع لك المسار الحرج (Critical Path).
بتقدر تختار العطلة الأسبوعية جمعة وسبت، وتضيف العطل الرسمية، وتحفظ خط أساس (Baseline) لتقارن التقدم.
مفيدة جدًا لمواد إدارة المشاريع والهندسة، وبتصدّر صورة PNG أو PDF أو CSV، وبتفتح ملفات Microsoft Project بصيغة XML.
مشروعك بضل على جهازك وما بنرفع لأي مكان.
الرابط: https://s3eidat.github.io/gantt/
