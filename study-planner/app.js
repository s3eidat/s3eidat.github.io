/* Study Planner — timetable, tasks, exams and an automatic revision plan. Everything stays in this browser. */
(function () {
  "use strict";
  var $ = S3.$, h = S3.h;
  var KEY = "study-planner";
  var COLORS = ["#3dd6d0", "#7c9cff", "#f5b971", "#ff7b7b", "#6ee7a8", "#c792ea", "#f78fb3", "#ffd166", "#4fc3f7", "#a3be8c"];
  var LENGTHS = [25, 30, 40, 45, 50, 60, 90];

  // ---------- strings ----------
  var EN = {
    title: "Study Planner",
    sub: "Timetable, homework, exams and a revision plan that builds itself. Saved in this browser only.",
    today: "Today", week: "Week", timetable: "Timetable", tasks: "Tasks", exams: "Exams", plan: "Revision plan", subjects: "Subjects", settings: "Settings",
    add: "Add", save: "Save", cancel: "Cancel", del: "Delete", edit: "Edit", undo: "Undo", close: "Close",
    addSubject: "Add subject", addClass: "Add class", addExam: "Add exam", addTask: "Add task",
    editSubject: "Edit subject", editClass: "Edit class", editExam: "Edit exam", editTask: "Edit task",
    name: "Name", color: "Colour", teacher: "Teacher", room: "Room", subject: "Subject", none: "— none —",
    day: "Day", start: "Starts", end: "Ends", kind: "Type", lecture: "Lecture", lab: "Lab", tutorial: "Tutorial", seminar: "Seminar",
    date: "Date", time: "Time", examTitle: "Exam name", examTitlePh: "e.g. Midterm, Final, Quiz 2",
    topics: "Topics to revise (one per line)", topicsPh: "Chapter 1: Limits\nChapter 2: Derivatives\nPast papers",
    level: "How hard is it for you?", easy: "Easy", medium: "Medium", hard: "Hard",
    sessionsWanted: "Revision sessions", auto: "Auto",
    taskTitle: "What to do", taskTitlePh: "e.g. Problem set 3", due: "Due", homework: "Homework", assignment: "Assignment", reading: "Reading", project: "Project", other: "Other",
    notes: "Notes",
    needName: "Give it a name first", needSubjectFirst: "Add a subject first, then your classes and exams.", endBeforeStart: "The class ends before it starts",
    needDate: "Pick a date", saved: "Saved", deleted: "Deleted",
    welcomeT: "Plan your term in a few minutes",
    welcomeP: "Add your subjects, your weekly classes and your exam dates. The planner spreads revision sessions over the days you have left, and tells you what to study today.",
    tryExample: "Try with an example", startSubjects: "Add your first subject",
    nextExam: "Next exam", noExams: "No exams coming up", inDays: "in {n} days", tomorrowL: "tomorrow", todayL: "today", daysAgo: "{n} days ago", yesterday: "yesterday",
    classesToday: "Classes today", noClassesToday: "No classes today.",
    revToday: "Revise today", noRevToday: "Nothing planned for today.", focus: "Focus timer",
    dueSoon: "Due soon", nothingDue: "Nothing due in the next 7 days.", overdue: "Overdue",
    sessionsDone: "{d} of {t} sessions done", openTasks: "Open tasks", upcomingExams: "Upcoming exams", todaySessions: "Today's sessions",
    noClasses: "No classes", noClassesYet: "No classes yet", noClassesP: "Add the classes you have each week. They show on the Today page on the right days.",
    open: "Open", done: "Done", all: "All", noTasks: "No tasks here", noTasksP: "Add homework, assignments and reading with a due date.",
    noExamsP: "Add an exam with its date and topics. Your revision plan is built from it automatically.",
    pastExams: "Past exams", examToday: "Exam today. Good luck!", topicsN: "{n} topics",
    studyTime: "Your study time", studyTimeP: "Minutes you can revise on each day. The plan never puts more than this on a day.",
    minutes: "min", sessionLen: "Session length", replan: "Re-plan",
    missed: "Missed sessions: {n}. Re-plan moves that work to the days ahead.",
    short: "{x}: not enough study time for {n} more session(s) before the exam. Add time or lower the number of sessions.",
    noPlan: "No revision planned yet", noPlanP: "Add an exam with a future date and some study time, and the plan appears here.",
    finalReview: "Final review", revision: "Revision {n}", missedL: "Missed",
    noSubjects: "No subjects yet", noSubjectsP: "Start with the subjects you take this term.",
    classesN: "{n} classes", examsN: "{n} exams", tasksN: "{n} tasks",
    delSubjectQ: "Delete {x} and its classes, exams, tasks and sessions?",
    weekStart: "Week starts on", backup: "Backup", backupP: "Your planner lives in this browser. Save a backup file to move it to another device or keep it safe.",
    exportBackup: "Save backup file", importBackup: "Open backup file", importQ: "Replace everything in the planner with this backup?",
    badFile: "That isn't a Study Planner backup", imported: "Backup loaded",
    danger: "Start over", wipe: "Delete all planner data", wipeQ: "Delete all subjects, classes, exams, tasks and the plan from this browser?", wiped: "All data deleted",
    storeFail: "Couldn't save in this browser. Save a backup file so you don't lose work.",
    exampleLoaded: "Example loaded. Change anything, or delete it in Settings.",
    wantHint: "Leave empty for auto: per topic 1 session (easy), 1.5 (medium) or 2 (hard), plus a final review.",
    lang: "العربية", rotation: "Week rotation", rotationOn: "My timetable alternates between week A and week B",
    thisWeekIs: "This week is", weekA: "Week A", weekB: "Week B", everyWeek: "Every week", thisWeek: "this week",
    calendar: "Calendar file (.ics)", calendarP: "Add your classes, exams and revision sessions to Google Calendar, Apple Calendar or Outlook: save the file, then import it there.",
    incClasses: "Classes (repeat weekly until your last exam)", incExams: "Exams", incSessions: "Revision sessions", incTasks: "Task due dates",
    exportIcs: "Save .ics file", nothingToExport: "Nothing to put in the calendar yet", print: "Print",
    shortcuts: "Keyboard shortcuts", scTabs: "Switch section", scNew: "New item in this section", scHelp: "Show this help", scClose: "Close a dialog",
    revise: "Revise", exam: "Exam",
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    daysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  };
  var AR = {
    title: "مخطط الدراسة",
    sub: "جدول المحاضرات والواجبات والامتحانات وخطة مراجعة تُبنى تلقائيًا. محفوظ في هذا المتصفح فقط.",
    today: "اليوم", week: "الأسبوع", timetable: "الجدول", tasks: "المهام", exams: "الامتحانات", plan: "خطة المراجعة", subjects: "المواد", settings: "الإعدادات",
    add: "إضافة", save: "حفظ", cancel: "إلغاء", del: "حذف", edit: "تعديل", undo: "تراجع", close: "إغلاق",
    addSubject: "إضافة مادة", addClass: "إضافة محاضرة", addExam: "إضافة امتحان", addTask: "إضافة مهمة",
    editSubject: "تعديل المادة", editClass: "تعديل المحاضرة", editExam: "تعديل الامتحان", editTask: "تعديل المهمة",
    name: "الاسم", color: "اللون", teacher: "المدرّس", room: "القاعة", subject: "المادة", none: "— بدون —",
    day: "اليوم", start: "تبدأ", end: "تنتهي", kind: "النوع", lecture: "محاضرة", lab: "مختبر", tutorial: "مناقشة", seminar: "سيمينار",
    date: "التاريخ", time: "الوقت", examTitle: "اسم الامتحان", examTitlePh: "مثل: أول، ثاني، نهائي، كويز 2",
    topics: "المواضيع المطلوب مراجعتها (موضوع في كل سطر)", topicsPh: "الفصل 1: النهايات\nالفصل 2: الاشتقاق\nأسئلة سنوات سابقة",
    level: "ما مدى صعوبتها عليك؟", easy: "سهلة", medium: "متوسطة", hard: "صعبة",
    sessionsWanted: "عدد جلسات المراجعة", auto: "تلقائي",
    taskTitle: "المطلوب", taskTitlePh: "مثل: حل الواجب 3", due: "موعد التسليم", homework: "واجب", assignment: "تكليف", reading: "قراءة", project: "مشروع", other: "أخرى",
    notes: "ملاحظات",
    needName: "اكتب الاسم أولًا", needSubjectFirst: "أضف مادة أولًا، ثم محاضراتك وامتحاناتك.", endBeforeStart: "وقت النهاية قبل وقت البداية",
    needDate: "اختر التاريخ", saved: "تم الحفظ", deleted: "تم الحذف",
    welcomeT: "خطّط لفصلك الدراسي في دقائق",
    welcomeP: "أضف موادك ومحاضراتك الأسبوعية ومواعيد امتحاناتك. المخطط يوزّع جلسات المراجعة على الأيام المتبقية، ويخبرك ماذا تدرس اليوم.",
    tryExample: "جرّب بمثال", startSubjects: "أضف أول مادة",
    nextExam: "الامتحان القادم", noExams: "لا امتحانات قادمة", inDays: "بعد {n} أيام", tomorrowL: "غدًا", todayL: "اليوم", daysAgo: "قبل {n} أيام", yesterday: "أمس",
    classesToday: "محاضرات اليوم", noClassesToday: "لا محاضرات اليوم.",
    revToday: "راجع اليوم", noRevToday: "لا شيء مخطط لليوم.", focus: "مؤقت التركيز",
    dueSoon: "قريبة التسليم", nothingDue: "لا شيء مطلوب خلال 7 أيام.", overdue: "متأخرة",
    sessionsDone: "{d} من {t} جلسات منجزة", openTasks: "مهام مفتوحة", upcomingExams: "الامتحانات القادمة", todaySessions: "جلسات اليوم",
    noClasses: "لا محاضرات", noClassesYet: "لا محاضرات بعد", noClassesP: "أضف المحاضرات التي لديك كل أسبوع. ستظهر في صفحة اليوم في أيامها.",
    open: "مفتوحة", done: "منجزة", all: "الكل", noTasks: "لا مهام هنا", noTasksP: "أضف الواجبات والتكاليف والقراءات مع موعد التسليم.",
    noExamsP: "أضف امتحانًا بتاريخه ومواضيعه، وتُبنى خطة المراجعة منه تلقائيًا.",
    pastExams: "امتحانات سابقة", examToday: "امتحان اليوم. بالتوفيق!", topicsN: "{n} مواضيع",
    studyTime: "وقت الدراسة", studyTimeP: "الدقائق التي تستطيع المراجعة فيها كل يوم. الخطة لا تضع أكثر من ذلك في اليوم.",
    minutes: "د", sessionLen: "مدة الجلسة", replan: "إعادة التخطيط",
    missed: "جلسات فائتة: {n}. إعادة التخطيط تنقل هذا العمل إلى الأيام القادمة.",
    short: "{x}: الوقت لا يكفي لـ {n} جلسة إضافية قبل الامتحان. زد وقت الدراسة أو قلّل عدد الجلسات.",
    noPlan: "لا توجد خطة مراجعة بعد", noPlanP: "أضف امتحانًا بتاريخ قادم وبعض وقت الدراسة، وستظهر الخطة هنا.",
    finalReview: "مراجعة نهائية", revision: "مراجعة {n}", missedL: "فائتة",
    noSubjects: "لا مواد بعد", noSubjectsP: "ابدأ بالمواد التي تدرسها هذا الفصل.",
    classesN: "{n} محاضرات", examsN: "{n} امتحانات", tasksN: "{n} مهام",
    delSubjectQ: "حذف {x} مع محاضراتها وامتحاناتها ومهامها وجلساتها؟",
    weekStart: "يبدأ الأسبوع يوم", backup: "نسخة احتياطية", backupP: "مخططك محفوظ في هذا المتصفح. احفظ ملف نسخة احتياطية لنقله إلى جهاز آخر أو للاحتفاظ به.",
    exportBackup: "حفظ ملف النسخة", importBackup: "فتح ملف نسخة", importQ: "استبدال كل ما في المخطط بهذه النسخة؟",
    badFile: "هذا ليس ملف نسخة من مخطط الدراسة", imported: "تم تحميل النسخة",
    danger: "البدء من جديد", wipe: "حذف كل بيانات المخطط", wipeQ: "حذف كل المواد والمحاضرات والامتحانات والمهام والخطة من هذا المتصفح؟", wiped: "تم حذف كل البيانات",
    storeFail: "تعذّر الحفظ في هذا المتصفح. احفظ ملف نسخة احتياطية حتى لا تفقد عملك.",
    exampleLoaded: "تم تحميل المثال. عدّل ما تريد، أو احذفه من الإعدادات.",
    wantHint: "اتركه فارغًا ليُحسب تلقائيًا: لكل موضوع جلسة (سهلة) أو 1.5 (متوسطة) أو 2 (صعبة)، مع مراجعة نهائية.",
    lang: "English", rotation: "تناوب الأسابيع", rotationOn: "جدولي يتناوب بين أسبوع أ وأسبوع ب",
    thisWeekIs: "هذا الأسبوع هو", weekA: "أسبوع أ", weekB: "أسبوع ب", everyWeek: "كل أسبوع", thisWeek: "هذا الأسبوع",
    calendar: "ملف تقويم (.ics)", calendarP: "أضف محاضراتك وامتحاناتك وجلسات المراجعة إلى تقويم Google أو Apple أو Outlook: احفظ الملف ثم استورده هناك.",
    incClasses: "المحاضرات (تتكرر أسبوعيًا حتى آخر امتحان)", incExams: "الامتحانات", incSessions: "جلسات المراجعة", incTasks: "مواعيد تسليم المهام",
    exportIcs: "حفظ ملف ‎.ics", nothingToExport: "لا يوجد ما يُضاف إلى التقويم بعد", print: "طباعة",
    shortcuts: "اختصارات لوحة المفاتيح", scTabs: "التنقل بين الأقسام", scNew: "عنصر جديد في هذا القسم", scHelp: "عرض هذه المساعدة", scClose: "إغلاق النافذة",
    revise: "مراجعة", exam: "امتحان",
    days: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
    daysShort: ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"]
  };

  // ---------- data ----------
  function blank() {
    return { v: 1, lang: "en", settings: { weekStart: 1, session: 45, minutes: [60, 90, 90, 90, 90, 60, 60], rotation: false, anchor: "" },
      subjects: [], classes: [], exams: [], tasks: [], sessions: [], short: {} };
  }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function str(x, max) { return typeof x === "string" ? x.slice(0, max || 200) : ""; }
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^\d{2}:\d{2}$/;
  // Accepts anything (stored data or a backup file) and returns a well-formed state, or null if it isn't ours.
  function clean(d) {
    if (!d || typeof d !== "object" || !Array.isArray(d.subjects)) return null;
    var s = blank(), ds = d.settings || {};
    s.lang = d.lang === "ar" ? "ar" : "en";
    s.settings.weekStart = [0, 1, 6].indexOf(+ds.weekStart) >= 0 ? +ds.weekStart : 1;
    s.settings.session = LENGTHS.indexOf(+ds.session) >= 0 ? +ds.session : 45;
    if (Array.isArray(ds.minutes) && ds.minutes.length === 7) s.settings.minutes = ds.minutes.map(function (m) { m = Math.round(+m) || 0; return Math.max(0, Math.min(960, m)); });
    s.settings.rotation = !!ds.rotation;
    s.settings.anchor = DATE_RE.test(ds.anchor) ? ds.anchor : "";
    s.subjects = arr(d.subjects).filter(function (x) { return x && x.id; }).map(function (x) {
      return { id: str(x.id, 40), name: str(x.name, 80) || "?", color: /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : COLORS[0], teacher: str(x.teacher, 80), room: str(x.room, 40) };
    });
    s.classes = arr(d.classes).filter(function (x) { return x && x.id && TIME_RE.test(x.start) && TIME_RE.test(x.end); }).map(function (x) {
      return { id: str(x.id, 40), subject: str(x.subject, 40), day: Math.max(0, Math.min(6, +x.day || 0)), start: x.start, end: x.end, room: str(x.room, 40), kind: str(x.kind, 20) || "lecture", week: ["A", "B"].indexOf(x.week) >= 0 ? x.week : "all" };
    });
    s.exams = arr(d.exams).filter(function (x) { return x && x.id && DATE_RE.test(x.date); }).map(function (x) {
      return { id: str(x.id, 40), subject: str(x.subject, 40), title: str(x.title, 80), date: x.date, time: TIME_RE.test(x.time) ? x.time : "", room: str(x.room, 40),
        topics: arr(x.topics).map(function (t) { return str(t, 120); }).filter(Boolean).slice(0, 100), level: [1, 2, 3].indexOf(+x.level) >= 0 ? +x.level : 2,
        want: Math.max(0, Math.min(200, Math.round(+x.want) || 0)) };
    });
    s.tasks = arr(d.tasks).filter(function (x) { return x && x.id; }).map(function (x) {
      return { id: str(x.id, 40), subject: str(x.subject, 40), title: str(x.title, 160) || "?", due: DATE_RE.test(x.due) ? x.due : "", kind: str(x.kind, 20) || "homework", notes: str(x.notes, 2000), done: !!x.done };
    });
    s.sessions = arr(d.sessions).filter(function (x) { return x && x.id && DATE_RE.test(x.date); }).map(function (x) {
      return { id: str(x.id, 40), exam: str(x.exam, 40), date: x.date, mins: Math.max(5, Math.min(240, +x.mins || 45)), topic: str(x.topic, 120), final: !!x.final, done: !!x.done };
    });
    if (d.short && typeof d.short === "object") for (var k in d.short) if (+d.short[k] > 0) s.short[str(k, 40)] = Math.round(+d.short[k]);
    return s;
  }
  var st = clean(S3.store(KEY));
  if (!st) { st = blank(); if (/^ar\b/i.test(navigator.language || "")) { st.lang = "ar"; st.settings.weekStart = 6; } }
  var view = S3.store(KEY + ":view") || "today";
  var taskFilter = "open", ttWeek = "";

  function save() {
    if (S3.store(KEY, st) === undefined) S3.toast(T("storeFail"), "error");
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  // Run a change, save, redraw. opts.replan rebuilds the revision plan; opts.undo offers an Undo toast.
  function change(fn, opts) {
    opts = opts || {};
    var before = JSON.stringify(st);
    fn();
    if (opts.replan) replan();
    save(); render();
    if (opts.undo) {
      var t = S3.toast(opts.undo + " ");
      t.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { st = clean(JSON.parse(before)) || st; save(); render(); t.remove(); } }, [T("undo")]));
    } else if (opts.msg) S3.toast(opts.msg);
  }

  function T(k, a) {
    var s = (st.lang === "ar" && AR[k] != null ? AR : EN)[k];
    if (s == null) s = k;
    if (a && typeof s === "string") for (var i in a) s = s.split("{" + i + "}").join(a[i]);
    return s;
  }

  // ---------- dates (local calendar days as "YYYY-MM-DD") ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) { var p = s.split("-"); return new Date(+p[0], p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function diff(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  function dow(s) { return parse(s).getDay(); }
  function todayStr() { return iso(new Date()); }
  function locale() { return st.lang === "ar" ? "ar-u-nu-latn" : "en-GB"; }
  function fmtDate(s, long) {
    try { return parse(s).toLocaleDateString(locale(), long ? { weekday: "long", day: "numeric", month: "long", year: "numeric" } : { weekday: "short", day: "numeric", month: "short" }); }
    catch (e) { return s; }
  }
  function rel(s) {
    var n = diff(todayStr(), s);
    if (n === 0) return T("todayL");
    if (n === 1) return T("tomorrowL");
    if (n === -1) return T("yesterday");
    return n > 0 ? T("inDays", { n: n }) : T("daysAgo", { n: -n });
  }
  function weekOrder() { var w = st.settings.weekStart, o = []; for (var i = 0; i < 7; i++) o.push((w + i) % 7); return o; }

  // ---------- lookups ----------
  function subj(id) { for (var i = 0; i < st.subjects.length; i++) if (st.subjects[i].id === id) return st.subjects[i]; return null; }
  function exam(id) { for (var i = 0; i < st.exams.length; i++) if (st.exams[i].id === id) return st.exams[i]; return null; }
  function subjName(id) { var s = subj(id); return s ? s.name : ""; }
  function subjColor(id) { var s = subj(id); return s ? s.color : "#8a93a0"; }
  function examName(e) { if (!e) return "?"; var n = subjName(e.subject); return n && e.title ? n + " · " + e.title : n || e.title || "?"; }
  function byTime(a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; }
  function classesOn(dateStr) {
    var d = dow(dateStr);
    return st.classes.filter(function (c) { return c.day === d && classInWeek(c, dateStr); }).sort(byTime);
  }
  function classInWeek(c, dateStr) { return c.week === "all" || !st.settings.rotation || c.week === weekLetter(dateStr); }
  // A/B rotation: weeks counted from the week that contains the anchor date (which is week A).
  function weekStartOf(s) { var back = (dow(s) - st.settings.weekStart + 7) % 7; return addDays(s, -back); }
  function weekLetter(s) {
    var a = st.settings.anchor || todayStr();
    var w = Math.round(diff(weekStartOf(a), weekStartOf(s)) / 7);
    return ((w % 2) + 2) % 2 === 0 ? "A" : "B";
  }

  // ---------- revision planner ----------
  function target(e) {
    if (e.want) return e.want;
    var n = e.topics.length, f = [1, 1.5, 2][e.level - 1];
    return (n ? Math.ceil(n * f) : [3, 5, 8][e.level - 1]) + 1; // +1 = final review
  }
  // Keeps every done session. Throws away the rest (including missed ones) and spreads what is still needed
  // over the free study slots between today and the day before each exam. Nearest exam is planned first.
  function replan(today) {
    today = today || todayStr();
    var L = st.settings.session, mins = st.settings.minutes;
    var kept = st.sessions.filter(function (s) { return s.done && exam(s.exam); });
    var exams = st.exams.filter(function (e) { return e.date > today; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    st.short = {};
    if (!exams.length) { st.sessions = kept; return; }
    var last = exams[exams.length - 1].date, days = [], at = {};
    for (var d = today, i = 0; d < last && i < 400; d = addDays(d, 1), i++) {
      var used = kept.filter(function (s) { return s.date === d; }).length;
      var day = { date: d, cap: Math.max(0, Math.floor(mins[dow(d)] / L) - used), used: 0 };
      days.push(day); at[d] = day;
    }
    var fresh = [];
    exams.forEach(function (e) {
      var done = kept.filter(function (s) { return s.exam === e.id; });
      var need = Math.max(0, target(e) - done.length), mine = [];
      if (!need) return;
      var win = days.filter(function (x) { return x.date < e.date; });
      function free() { return win.filter(function (x) { return x.used < x.cap; }); }
      // the last session is a final review, as close to the exam as possible
      var f = free();
      if (f.length && !done.some(function (s) { return s.final; })) {
        var lastDay = f[f.length - 1]; lastDay.used++;
        mine.push({ id: uid(), exam: e.id, date: lastDay.date, mins: L, topic: "", final: true, done: false }); need--;
      }
      while (need > 0) {
        f = free();
        if (!f.length) break;
        var m = Math.min(need, f.length);
        for (var k = 0; k < m; k++) {
          var x = f[Math.floor((k + 0.5) * f.length / m)];
          x.used++; need--;
          mine.push({ id: uid(), exam: e.id, date: x.date, mins: L, topic: "", final: false, done: false });
        }
      }
      if (need > 0) st.short[e.id] = need;
      // topics in order, starting with ones no done session covered yet, then round again
      var covered = {}; done.forEach(function (s) { covered[s.topic] = 1; });
      var queue = e.topics.filter(function (t) { return !covered[t]; }).concat(e.topics);
      var n = done.filter(function (s) { return !s.final; }).length;
      mine.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.final - b.final; }).forEach(function (s) {
        if (s.final) return;
        s.topic = queue.length ? queue[n % queue.length] : "";
        n++;
      });
      fresh = fresh.concat(mine);
    });
    st.sessions = kept.concat(fresh).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  function sessionLabel(s) {
    if (s.final) return T("finalReview");
    if (s.topic) return s.topic;
    var list = st.sessions.filter(function (x) { return x.exam === s.exam && !x.final; });
    return T("revision", { n: list.indexOf(s) + 1 });
  }
  function missed() { var t = todayStr(); return st.sessions.filter(function (s) { return !s.done && s.date < t; }); }

  // ---------- small UI pieces ----------
  function icon(n) { var s = h("span", { "class": "sp-ic", "aria-hidden": "true" }); s.innerHTML = S3.icon(n); return s; }
  function btn(label, onclick, cls, ic) {
    return h("button", { type: "button", "class": "btn " + (cls || ""), onclick: onclick }, ic ? [icon(ic), label] : [label]);
  }
  function dot(color) { return h("span", { "class": "sp-dot", style: "background:" + color }); }
  function empty(title, text, actions) {
    return h("div", { "class": "empty card" }, [h("b", { text: title }), h("p", { "class": "muted", text: text })].concat(actions ? [h("div", { "class": "row sp-center" }, actions)] : []));
  }
  function card(title, kids, extra) {
    return h("div", { "class": "card" }, [h("div", { "class": "row between sp-card-h" }, [h("h2", { text: title })].concat(extra || []))].concat(kids));
  }
  function check(on, onchange, label) {
    var c = h("input", { type: "checkbox", "aria-label": label });
    c.checked = on; c.addEventListener("change", function () { onchange(c.checked); });
    return c;
  }
  function bar(done, total) {
    var p = total ? Math.round(done / total * 100) : 0;
    return h("div", { "class": "sp-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(p) }, [h("span", { style: "width:" + p + "%" })]);
  }

  // ---------- modal form ----------
  // fields: [{k, label, type: text|textarea|select|date|time|number|color, options: [[value,label]], ph, req}]
  function form(title, fields, values, onSave, onDelete) {
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": title, dir: st.lang === "ar" ? "rtl" : "ltr", lang: st.lang });
    var f = h("form", { "class": "s3-sheet sp-form", novalidate: true });
    var inputs = {};
    f.appendChild(h("div", { "class": "row between" }, [h("h2", { text: title }), h("button", { type: "button", "class": "btn ghost icon", "aria-label": T("close"), "data-close": true }, [icon("x")])]));
    var grid = h("div", { "class": "sp-fields" });
    fields.forEach(function (fd) {
      var el, v = values[fd.k];
      if (fd.type === "textarea") { el = h("textarea", { "class": "textarea prose", rows: "5", placeholder: fd.ph || "" }); el.value = v == null ? "" : v; }
      else if (fd.type === "select") {
        el = h("select", { "class": "select" }, fd.options.map(function (o) { return h("option", { value: String(o[0]), text: o[1] }); }));
        el.value = v == null ? String(fd.options[0][0]) : String(v);
      } else if (fd.type === "colors") {
        el = h("div", { "class": "sp-swatches", role: "radiogroup", "aria-label": fd.label });
        var pick = h("input", { type: "color", "aria-label": fd.label }); pick.value = v || COLORS[0];
        COLORS.forEach(function (c) {
          el.appendChild(h("button", { type: "button", "class": "sp-sw", style: "background:" + c, "aria-label": c, "aria-pressed": String(c === pick.value),
            onclick: function () { pick.value = c; sync(); } }));
        });
        el.appendChild(pick);
        function sync() { S3.$$(".sp-sw", el).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("aria-label") === pick.value)); }); }
        pick.addEventListener("input", sync);
        el.value = pick; // read via .value.value below
      } else {
        el = h("input", { "class": "input", type: fd.type || "text", placeholder: fd.ph || "" });
        if (fd.type === "number") { el.min = fd.min != null ? fd.min : 0; el.max = fd.max || 999; el.inputMode = "numeric"; }
        el.value = v == null ? "" : v;
      }
      inputs[fd.k] = el;
      var lab = h("label", { "class": "field" + (fd.wide ? " sp-wide" : "") }, [fd.label, el]);
      if (fd.type === "colors") lab = h("div", { "class": "field sp-wide" }, [fd.label, el]);
      if (fd.hint) lab.appendChild(h("span", { "class": "faint", text: fd.hint }));
      grid.appendChild(lab);
    });
    f.appendChild(grid);
    var foot = h("div", { "class": "row between sp-form-foot" }, [
      onDelete ? btn(T("del"), function () { close(); onDelete(); }, "danger ghost", "trash") : h("span"),
      h("div", { "class": "row" }, [btn(T("cancel"), close, "ghost"), h("button", { type: "submit", "class": "btn primary" }, [T("save")])])
    ]);
    f.appendChild(foot);
    m.appendChild(f);
    function read() {
      var out = {};
      fields.forEach(function (fd) {
        var el = inputs[fd.k];
        out[fd.k] = fd.type === "colors" ? el.value.value : fd.type === "number" ? (el.value === "" ? 0 : +el.value) : el.value.trim();
      });
      return out;
    }
    function close() { m.remove(); document.removeEventListener("keydown", onKey); if (opener && opener.focus) opener.focus(); }
    function onKey(e) { if (e.key === "Escape") close(); }
    var opener = document.activeElement;
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = onSave(read());
      if (err) S3.toast(err, "error"); else close();
    });
    m.addEventListener("click", function (e) { if (e.target === m || e.target.closest("[data-close]")) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m);
    var first = f.querySelector("input:not([type=color]),select,textarea"); if (first) first.focus();
    return m;
  }

  function subjectOptions(allowNone) {
    var o = st.subjects.map(function (s) { return [s.id, s.name]; });
    return allowNone ? [["", T("none")]].concat(o) : o;
  }
  function needSubject(then) {
    if (st.subjects.length) return then();
    S3.toast(T("needSubjectFirst"));
    editSubject(null, then);
  }

  // ---------- editors ----------
  function editSubject(s, after) {
    var isNew = !s;
    s = s || { name: "", color: COLORS[st.subjects.length % COLORS.length], teacher: "", room: "" };
    form(isNew ? T("addSubject") : T("editSubject"), [
      { k: "name", label: T("name"), ph: "Mathematics", wide: true },
      { k: "color", label: T("color"), type: "colors" },
      { k: "teacher", label: T("teacher") },
      { k: "room", label: T("room") }
    ], s, function (v) {
      if (!v.name) return T("needName");
      change(function () {
        if (isNew) st.subjects.push({ id: uid(), name: v.name.slice(0, 80), color: v.color, teacher: v.teacher.slice(0, 80), room: v.room.slice(0, 40) });
        else { s.name = v.name.slice(0, 80); s.color = v.color; s.teacher = v.teacher.slice(0, 80); s.room = v.room.slice(0, 40); }
      }, { msg: T("saved") });
      if (after) setTimeout(after, 0);
    }, isNew ? null : function () { deleteSubject(s); });
  }
  function deleteSubject(s) {
    var n = st.classes.filter(function (c) { return c.subject === s.id; }).length + st.exams.filter(function (e) { return e.subject === s.id; }).length + st.tasks.filter(function (t) { return t.subject === s.id; }).length;
    if (n && !confirm(T("delSubjectQ", { x: s.name }))) return;
    change(function () {
      var gone = {}; st.exams.forEach(function (e) { if (e.subject === s.id) gone[e.id] = 1; });
      st.subjects = st.subjects.filter(function (x) { return x !== s; });
      st.classes = st.classes.filter(function (c) { return c.subject !== s.id; });
      st.exams = st.exams.filter(function (e) { return e.subject !== s.id; });
      st.tasks = st.tasks.filter(function (t) { return t.subject !== s.id; });
      st.sessions = st.sessions.filter(function (x) { return !gone[x.exam]; });
    }, { replan: true, undo: T("deleted") });
  }
  function editClass(c, preset) {
    needSubject(function () {
      var isNew = !c;
      c = c || Object.assign({ subject: st.subjects[0].id, day: dow(todayStr()), start: "09:00", end: "10:00", room: "", kind: "lecture", week: "all" }, preset || {});
      var fields = [
        { k: "subject", label: T("subject"), type: "select", options: subjectOptions(false), wide: true },
        { k: "day", label: T("day"), type: "select", options: weekOrder().map(function (d) { return [d, T("days")[d]]; }) },
        { k: "kind", label: T("kind"), type: "select", options: ["lecture", "lab", "tutorial", "seminar", "other"].map(function (k) { return [k, T(k)]; }) },
        { k: "start", label: T("start"), type: "time" },
        { k: "end", label: T("end"), type: "time" },
        { k: "room", label: T("room"), ph: (subj(c.subject) || {}).room || "" }
      ];
      if (st.settings.rotation) fields.push({ k: "week", label: T("week"), type: "select", options: [["all", T("everyWeek")], ["A", T("weekA")], ["B", T("weekB")]] });
      form(isNew ? T("addClass") : T("editClass"), fields, c, function (v) {
        if (!TIME_RE.test(v.start) || !TIME_RE.test(v.end)) return T("time") + "?";
        if (v.end <= v.start) return T("endBeforeStart");
        change(function () {
          var o = isNew ? { id: uid() } : c;
          o.subject = v.subject; o.day = +v.day; o.start = v.start; o.end = v.end; o.room = v.room.slice(0, 40); o.kind = v.kind;
          o.week = v.week || o.week || "all";
          if (isNew) st.classes.push(o);
        }, { msg: T("saved") });
      }, isNew ? null : function () {
        change(function () { st.classes = st.classes.filter(function (x) { return x !== c; }); }, { undo: T("deleted") });
      });
    });
  }
  function editExam(e) {
    needSubject(function () {
      var isNew = !e;
      e = e || { subject: st.subjects[0].id, title: "", date: addDays(todayStr(), 14), time: "09:00", room: "", topics: [], level: 2, want: 0 };
      var vals = Object.assign({}, e, { topics: e.topics.join("\n"), want: e.want || "" });
      form(isNew ? T("addExam") : T("editExam"), [
        { k: "subject", label: T("subject"), type: "select", options: subjectOptions(false) },
        { k: "title", label: T("examTitle"), ph: T("examTitlePh") },
        { k: "date", label: T("date"), type: "date" },
        { k: "time", label: T("time"), type: "time" },
        { k: "room", label: T("room") },
        { k: "level", label: T("level"), type: "select", options: [[1, T("easy")], [2, T("medium")], [3, T("hard")]] },
        { k: "topics", label: T("topics"), type: "textarea", ph: T("topicsPh"), wide: true },
        { k: "want", label: T("sessionsWanted"), type: "number", min: 0, max: 200, ph: T("auto"), hint: T("wantHint"), wide: true }
      ], vals, function (v) {
        if (!DATE_RE.test(v.date)) return T("needDate");
        change(function () {
          var o = isNew ? { id: uid() } : e;
          o.subject = v.subject; o.title = v.title.slice(0, 80); o.date = v.date; o.time = TIME_RE.test(v.time) ? v.time : ""; o.room = v.room.slice(0, 40);
          o.level = +v.level || 2; o.want = Math.max(0, Math.min(200, Math.round(v.want) || 0));
          o.topics = v.topics.split(/\r?\n/).map(function (t) { return t.trim().slice(0, 120); }).filter(Boolean).slice(0, 100);
          if (isNew) st.exams.push(o);
        }, { replan: true, msg: T("saved") });
      }, isNew ? null : function () {
        change(function () {
          st.exams = st.exams.filter(function (x) { return x !== e; });
          st.sessions = st.sessions.filter(function (s) { return s.exam !== e.id; });
        }, { replan: true, undo: T("deleted") });
      });
    });
  }
  function editTask(t) {
    var isNew = !t;
    t = t || { subject: st.subjects[0] ? st.subjects[0].id : "", title: "", due: addDays(todayStr(), 1), kind: "homework", notes: "", done: false };
    form(isNew ? T("addTask") : T("editTask"), [
      { k: "title", label: T("taskTitle"), ph: T("taskTitlePh"), wide: true },
      { k: "subject", label: T("subject"), type: "select", options: subjectOptions(true) },
      { k: "due", label: T("due"), type: "date" },
      { k: "kind", label: T("kind"), type: "select", options: ["homework", "assignment", "reading", "project", "other"].map(function (k) { return [k, T(k)]; }) },
      { k: "notes", label: T("notes"), type: "textarea", wide: true }
    ], t, function (v) {
      if (!v.title) return T("needName");
      change(function () {
        var o = isNew ? { id: uid(), done: false } : t;
        o.title = v.title.slice(0, 160); o.subject = v.subject; o.due = DATE_RE.test(v.due) ? v.due : ""; o.kind = v.kind; o.notes = v.notes.slice(0, 2000);
        if (isNew) st.tasks.push(o);
      }, { msg: T("saved") });
    }, isNew ? null : function () {
      change(function () { st.tasks = st.tasks.filter(function (x) { return x !== t; }); }, { undo: T("deleted") });
    });
  }

  // ---------- rows ----------
  function taskRow(t) {
    var od = !t.done && t.due && t.due < todayStr();
    var row = h("div", { "class": "sp-item" + (t.done ? " is-done" : "") }, [
      check(t.done, function (on) { change(function () { t.done = on; }); }, t.title),
      dot(subjColor(t.subject)),
      h("button", { type: "button", "class": "sp-item-main", onclick: function () { editTask(t); } }, [
        h("b", { text: t.title }),
        h("span", { "class": "faint", text: [subjName(t.subject), T(t.kind)].filter(Boolean).join(" · ") })
      ]),
      t.due ? h("span", { "class": "chip" + (od ? " bad" : t.due === todayStr() ? " warn" : ""), title: fmtDate(t.due, true), text: od ? T("overdue") + " · " + rel(t.due) : rel(t.due) }) : null
    ]);
    return row;
  }
  function sessionRow(s, showDate) {
    var e = exam(s.exam), late = !s.done && s.date < todayStr();
    return h("div", { "class": "sp-item" + (s.done ? " is-done" : "") }, [
      check(s.done, function (on) { change(function () { s.done = on; }); }, sessionLabel(s)),
      dot(subjColor(e && e.subject)),
      h("div", { "class": "sp-item-main" }, [
        h("b", { text: sessionLabel(s) }),
        h("span", { "class": "faint", text: [examName(e), s.mins + " " + T("minutes"), showDate ? fmtDate(s.date) : ""].filter(Boolean).join(" · ") })
      ]),
      late ? h("span", { "class": "chip bad", text: T("missedL") }) : s.final ? h("span", { "class": "chip accent", text: "★" }) : null
    ]);
  }
  function classCard(c, dateStr) {
    var s = subj(c.subject) || { name: "?", color: "#8a93a0", room: "" };
    return h("button", { type: "button", "class": "sp-class", style: "--c:" + s.color, onclick: function () { editClass(c); } }, [
      h("span", { "class": "sp-class-t", text: c.start + "–" + c.end }),
      h("b", { text: s.name }),
      h("span", { "class": "faint", text: [T(c.kind), c.room || s.room, st.settings.rotation && c.week !== "all" ? c.week : ""].filter(Boolean).join(" · ") })
    ]);
  }

  // ---------- views ----------
  var VIEWS = ["today", "timetable", "tasks", "exams", "plan", "subjects", "settings"];
  function renderToday(v) {
    var t = todayStr();
    if (!st.subjects.length && !st.exams.length && !st.tasks.length) {
      v.appendChild(h("div", { "class": "card sp-welcome" }, [
        h("h2", { text: T("welcomeT") }), h("p", { "class": "muted", text: T("welcomeP") }),
        h("div", { "class": "row" }, [btn(T("startSubjects"), function () { editSubject(null); }, "primary", "plus"), btn(T("tryExample"), loadExample)])
      ]));
      return;
    }
    var up = st.exams.filter(function (e) { return e.date >= t; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var todays = st.sessions.filter(function (s) { return s.date === t; });
    var open = st.tasks.filter(function (x) { return !x.done; });
    var stats = h("div", { "class": "stats sp-stats" }, [
      h("div", { "class": "stat" }, [h("b", { text: up.length ? rel(up[0].date) : "—" }), h("span", { text: up.length ? T("nextExam") + ": " + examName(up[0]) : T("noExams") })]),
      h("div", { "class": "stat" }, [h("b", { text: todays.filter(function (s) { return s.done; }).length + "/" + todays.length }), h("span", { text: T("todaySessions") })]),
      h("div", { "class": "stat" }, [h("b", { text: String(open.length) }), h("span", { text: T("openTasks") })]),
      h("div", { "class": "stat" }, [h("b", { text: String(up.length) }), h("span", { text: T("upcomingExams") })])
    ]);
    v.appendChild(h("p", { "class": "sp-date", text: fmtDate(t, true) + (st.settings.rotation ? " · " + T("week" + weekLetter(t)) : "") }));
    v.appendChild(stats);
    if (up.length && up[0].date === t) v.appendChild(h("div", { "class": "sp-banner ok" }, [icon("check"), h("span", { text: examName(up[0]) + " — " + T("examToday") })]));
    var m = missed();
    if (m.length) v.appendChild(missedBanner(m.length));

    var cls = classesOn(t);
    var g = h("div", { "class": "grid-2 sp-today" });
    g.appendChild(card(T("revToday"), todays.length ? todays.map(function (s) { return sessionRow(s); }) : [h("p", { "class": "muted", text: T("noRevToday") })],
      [h("a", { "class": "btn small", href: "/focus-timer/", target: "_blank", rel: "noopener" }, [icon("play"), T("focus")])]));
    g.appendChild(card(T("classesToday"), cls.length ? cls.map(function (c) { return classCard(c, t); }) : [h("p", { "class": "muted", text: T("noClassesToday") })]));
    var soon = open.filter(function (x) { return x.due && x.due <= addDays(t, 7); }).sort(function (a, b) { return a.due < b.due ? -1 : 1; });
    g.appendChild(card(T("dueSoon"), soon.length ? soon.map(taskRow) : [h("p", { "class": "muted", text: T("nothingDue") })],
      [btn(T("addTask"), function () { editTask(null); }, "small", "plus")]));
    g.appendChild(card(T("upcomingExams"), up.length ? up.slice(0, 4).map(examMini) : [h("p", { "class": "muted", text: T("noExams") })],
      [btn(T("addExam"), function () { editExam(null); }, "small", "plus")]));
    v.appendChild(g);
  }
  function examProgress(e) {
    var list = st.sessions.filter(function (s) { return s.exam === e.id; });
    return { done: list.filter(function (s) { return s.done; }).length, total: list.length };
  }
  function examMini(e) {
    var p = examProgress(e);
    return h("button", { type: "button", "class": "sp-exam-mini", onclick: function () { editExam(e); } }, [
      dot(subjColor(e.subject)),
      h("div", { "class": "grow" }, [h("b", { text: examName(e) }), h("span", { "class": "faint", text: fmtDate(e.date) + " · " + T("sessionsDone", { d: p.done, t: p.total }) }), bar(p.done, p.total)]),
      h("span", { "class": "chip accent", text: rel(e.date) })
    ]);
  }
  function missedBanner(n) {
    return h("div", { "class": "sp-banner warn" }, [h("span", { "class": "grow", text: T("missed", { n: n }) }),
      btn(T("replan"), function () { change(function () { }, { replan: true, msg: T("saved") }); }, "small", "refresh")]);
  }
  function renderTimetable(v) {
    var actions = [h("div", { "class": "row" }, [btn(T("print"), function () { window.print(); }, "ghost", "file"), btn(T("addClass"), function () { editClass(null); }, "primary", "plus")])];
    if (st.settings.rotation) {
      var cur = weekLetter(todayStr());
      actions.unshift(h("div", { "class": "seg" }, ["A", "B"].map(function (w) {
        return h("button", { type: "button", "aria-pressed": String(shownWeek() === w), onclick: function () { ttWeek = w; render(); } }, [T("week" + w) + (w === cur ? " · " + T("thisWeek") : "")]);
      })));
    }
    v.appendChild(h("div", { "class": "row between sp-bar-row" }, [h("h2", { "class": "sp-h", text: T("timetable") })].concat(actions)));
    if (!st.classes.length) { v.appendChild(empty(T("noClassesYet"), T("noClassesP"), [btn(T("addClass"), function () { editClass(null); }, "primary", "plus")])); return; }
    var t = todayStr(), ws = weekStartOf(t), grid = h("div", { "class": "sp-week" });
    weekOrder().forEach(function (d, i) {
      var date = addDays(ws, i + (st.settings.rotation && shownWeek() !== weekLetter(t) ? 7 : 0));
      var list = st.classes.filter(function (c) { return c.day === d && (!st.settings.rotation || c.week === "all" || c.week === shownWeek()); }).sort(byTime);
      grid.appendChild(h("div", { "class": "sp-day" + (date === t ? " is-today" : "") }, [
        h("div", { "class": "sp-day-h" }, [h("b", { text: T("days")[d] }), btn("", function () { editClass(null, { day: d }); }, "ghost icon small", "plus")])
      ].concat(list.length ? list.map(function (c) { return classCard(c, date); }) : [h("span", { "class": "faint sp-none", text: T("noClasses") })])));
    });
    v.appendChild(grid);
  }
  function shownWeek() { return ttWeek || weekLetter(todayStr()); }
  function renderTasks(v) {
    var seg = h("div", { "class": "seg" }, ["open", "done", "all"].map(function (f) {
      return h("button", { type: "button", "aria-pressed": String(taskFilter === f), onclick: function () { taskFilter = f; render(); } }, [T(f)]);
    }));
    v.appendChild(h("div", { "class": "row between sp-bar-row" }, [seg, btn(T("addTask"), function () { editTask(null); }, "primary", "plus")]));
    var list = st.tasks.filter(function (t) { return taskFilter === "all" || (taskFilter === "done") === t.done; })
      .sort(function (a, b) { return (a.done - b.done) || ((a.due || "9999") < (b.due || "9999") ? -1 : (a.due || "9999") > (b.due || "9999") ? 1 : 0); });
    if (!list.length) { v.appendChild(empty(T("noTasks"), T("noTasksP"), [btn(T("addTask"), function () { editTask(null); }, "primary", "plus")])); return; }
    v.appendChild(h("div", { "class": "card sp-list" }, list.map(taskRow)));
  }
  function renderExams(v) {
    v.appendChild(h("div", { "class": "row between sp-bar-row" }, [h("h2", { "class": "sp-h", text: T("exams") }), btn(T("addExam"), function () { editExam(null); }, "primary", "plus")]));
    var t = todayStr();
    var up = st.exams.filter(function (e) { return e.date >= t; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var past = st.exams.filter(function (e) { return e.date < t; }).sort(function (a, b) { return a.date > b.date ? -1 : 1; });
    if (!up.length) v.appendChild(empty(T("noExams"), T("noExamsP"), [btn(T("addExam"), function () { editExam(null); }, "primary", "plus")]));
    var g = h("div", { "class": "sp-exams" });
    up.forEach(function (e) { g.appendChild(examCard(e)); });
    v.appendChild(g);
    if (past.length) {
      var d = h("details", { "class": "sp-past" }, [h("summary", { text: T("pastExams") + " (" + past.length + ")" })]);
      var pg = h("div", { "class": "sp-exams" }); past.forEach(function (e) { pg.appendChild(examCard(e)); }); d.appendChild(pg);
      v.appendChild(d);
    }
  }
  function examCard(e) {
    var p = examProgress(e), s = st.short[e.id];
    return h("button", { type: "button", "class": "card sp-exam", style: "--c:" + subjColor(e.subject), onclick: function () { editExam(e); } }, [
      h("div", { "class": "row between" }, [h("b", { text: examName(e) }), h("span", { "class": "chip accent", text: rel(e.date) })]),
      h("span", { "class": "muted", text: [fmtDate(e.date, true), e.time, e.room].filter(Boolean).join(" · ") }),
      h("span", { "class": "faint", text: [T("topicsN", { n: e.topics.length }), [T("easy"), T("medium"), T("hard")][e.level - 1], T("sessionsDone", { d: p.done, t: p.total })].join(" · ") }),
      bar(p.done, p.total),
      s ? h("span", { "class": "sp-warn", text: T("short", { n: s, x: examName(e) }) }) : null
    ]);
  }
  function renderPlan(v) {
    var set = st.settings, order = weekOrder();
    var timeGrid = h("div", { "class": "sp-time" }, order.map(function (d) {
      var inp = h("input", { "class": "input", type: "number", min: "0", max: "960", step: "15", inputmode: "numeric", "aria-label": T("days")[d] + " " + T("minutes") });
      inp.value = set.minutes[d];
      inp.addEventListener("change", function () {
        var n = Math.max(0, Math.min(960, Math.round(+inp.value) || 0));
        change(function () { set.minutes[d] = n; }, { replan: true });
      });
      return h("label", { "class": "field" }, [T("daysShort")[d], inp]);
    }));
    var len = h("select", { "class": "select", "aria-label": T("sessionLen") }, LENGTHS.map(function (n) { return h("option", { value: String(n), text: n + " " + T("minutes") }); }));
    len.value = String(set.session);
    len.addEventListener("change", function () { change(function () { set.session = +len.value; }, { replan: true }); });
    v.appendChild(card(T("studyTime"), [h("p", { "class": "muted sp-p", text: T("studyTimeP") }), timeGrid,
      h("label", { "class": "field sp-len" }, [T("sessionLen"), len])],
      [h("div", { "class": "row" }, [btn(T("print"), function () { window.print(); }, "small ghost", "file"), btn(T("replan"), function () { change(function () { }, { replan: true, msg: T("saved") }); }, "small", "refresh")])]));

    var m = missed();
    if (m.length) v.appendChild(missedBanner(m.length));
    Object.keys(st.short).forEach(function (id) { var e = exam(id); if (e) v.appendChild(h("div", { "class": "sp-banner warn" }, [h("span", { text: T("short", { n: st.short[id], x: examName(e) }) })])); });

    var t = todayStr();
    var ahead = st.sessions.filter(function (s) { return s.date >= t || !s.done; });
    if (!ahead.length) { v.appendChild(empty(T("noPlan"), T("noPlanP"), [btn(T("addExam"), function () { editExam(null); }, "primary", "plus")])); return; }
    var groups = {}, dates = [];
    ahead.forEach(function (s) { var k = s.date < t ? "missed" : s.date; if (!groups[k]) { groups[k] = []; dates.push(k); } groups[k].push(s); });
    var list = h("div", { "class": "sp-agenda" });
    dates.sort(function (a, b) { return a === "missed" ? -1 : b === "missed" ? 1 : a < b ? -1 : 1; }).forEach(function (k) {
      var mins = groups[k].reduce(function (n, s) { return n + s.mins; }, 0);
      list.appendChild(h("div", { "class": "card sp-agenda-day" + (k === t ? " is-today" : "") }, [
        h("div", { "class": "row between sp-card-h" }, [h("h3", { text: k === "missed" ? T("missedL") : fmtDate(k) + (k === t ? " · " + T("todayL") : "") }), h("span", { "class": "faint", text: mins + " " + T("minutes") })])
      ].concat(groups[k].map(function (s) { return sessionRow(s, k === "missed"); }))));
    });
    v.appendChild(list);
  }
  function renderSubjects(v) {
    v.appendChild(h("div", { "class": "row between sp-bar-row" }, [h("h2", { "class": "sp-h", text: T("subjects") }), btn(T("addSubject"), function () { editSubject(null); }, "primary", "plus")]));
    if (!st.subjects.length) { v.appendChild(empty(T("noSubjects"), T("noSubjectsP"), [btn(T("addSubject"), function () { editSubject(null); }, "primary", "plus"), btn(T("tryExample"), loadExample)])); return; }
    v.appendChild(h("div", { "class": "sp-subjects" }, st.subjects.map(function (s) {
      var n = function (list) { return list.filter(function (x) { return x.subject === s.id; }).length; };
      return h("button", { type: "button", "class": "card sp-subject", style: "--c:" + s.color, onclick: function () { editSubject(s); } }, [
        h("b", { text: s.name }),
        h("span", { "class": "muted", text: [s.teacher, s.room].filter(Boolean).join(" · ") || " " }),
        h("span", { "class": "faint", text: [T("classesN", { n: n(st.classes) }), T("examsN", { n: n(st.exams) }), T("tasksN", { n: n(st.tasks) })].join(" · ") })
      ]);
    })));
  }
  function renderSettings(v) {
    var ws = h("select", { "class": "select", "aria-label": T("weekStart") }, [6, 0, 1].map(function (d) { return h("option", { value: String(d), text: T("days")[d] }); }));
    ws.value = String(st.settings.weekStart);
    ws.addEventListener("change", function () { change(function () { st.settings.weekStart = +ws.value; }); });
    var lang = h("select", { "class": "select", "aria-label": "Language / اللغة" }, [h("option", { value: "en", text: "English" }), h("option", { value: "ar", text: "العربية" })]);
    lang.value = st.lang;
    lang.addEventListener("change", function () { change(function () { st.lang = lang.value; }); });
    v.appendChild(card(T("settings"), [h("div", { "class": "sp-fields" }, [h("label", { "class": "field" }, ["Language / اللغة", lang]), h("label", { "class": "field" }, [T("weekStart"), ws])])]));

    var rot = h("label", { "class": "check" }, [check(st.settings.rotation, function (on) {
      change(function () { st.settings.rotation = on; if (on && !st.settings.anchor) st.settings.anchor = weekStartOf(todayStr()); });
    }, T("rotationOn")), T("rotationOn")]);
    var rk = [rot];
    if (st.settings.rotation) {
      var which = h("select", { "class": "select", "aria-label": T("thisWeekIs") }, [h("option", { value: "A", text: T("weekA") }), h("option", { value: "B", text: T("weekB") })]);
      which.value = weekLetter(todayStr());
      which.addEventListener("change", function () {
        change(function () { st.settings.anchor = addDays(weekStartOf(todayStr()), which.value === "A" ? 0 : -7); ttWeek = ""; });
      });
      rk.push(h("div", { "class": "sp-fields" }, [h("label", { "class": "field" }, [T("thisWeekIs"), which])]));
    }
    v.appendChild(card(T("rotation"), rk));

    var inc = { classes: true, exams: true, sessions: true, tasks: false };
    v.appendChild(card(T("calendar"), [h("p", { "class": "muted sp-p", text: T("calendarP") }),
      h("div", { "class": "stack sp-incs" }, ["classes", "exams", "sessions", "tasks"].map(function (k) {
        var label = T("inc" + k.charAt(0).toUpperCase() + k.slice(1));
        return h("label", { "class": "check" }, [check(inc[k], function (on) { inc[k] = on; }, label), label]);
      })),
      h("div", { "class": "row mt" }, [btn(T("exportIcs"), function () { exportIcs(inc); }, "primary", "download")])]));

    v.appendChild(card(T("shortcuts"), [h("div", { "class": "sp-keys" }, shortcutList())]));

    var file = h("input", { type: "file", accept: ".json,application/json", hidden: true });
    file.addEventListener("change", function () { if (file.files[0]) importFile(file.files[0]); file.value = ""; });
    v.appendChild(card(T("backup"), [h("p", { "class": "muted sp-p", text: T("backupP") }),
      h("div", { "class": "row" }, [btn(T("exportBackup"), exportBackup, "primary", "download"), btn(T("importBackup"), function () { file.click(); }, "", "upload"), file])]));
    v.appendChild(card(T("danger"), [h("div", { "class": "row" }, [btn(T("tryExample"), loadExample), btn(T("wipe"), function () {
      if (!confirm(T("wipeQ"))) return;
      change(function () { var lang = st.lang; st = blank(); st.lang = lang; }, { undo: T("wiped") });
    }, "danger", "trash")])]));
  }

  // ---------- backup ----------
  function exportBackup() {
    var data = JSON.stringify({ app: "s3eidat-study-planner", v: 1, saved: new Date().toISOString(), lang: st.lang, settings: st.settings,
      subjects: st.subjects, classes: st.classes, exams: st.exams, tasks: st.tasks, sessions: st.sessions, short: st.short }, null, 1);
    S3.download(data, "study-planner-" + todayStr() + ".json", "application/json");
    S3.done();
  }
  function importFile(f) {
    S3.readFile(f, "text").then(function (txt) {
      var d; try { d = clean(JSON.parse(txt)); } catch (e) { d = null; }
      if (!d) return S3.toast(T("badFile"), "error");
      if ((st.subjects.length || st.exams.length || st.tasks.length) && !confirm(T("importQ"))) return;
      change(function () { st = d; }, { undo: T("imported") });
    });
  }


  // ---------- calendar (.ics) ----------
  function icsText(x) { return String(x).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  // RFC 5545: lines longer than 75 octets are folded (CRLF + space); never split a UTF-8 character.
  function fold(line) {
    var enc = new TextEncoder(), out = "", cur = "", n = 0;
    Array.from(line).forEach(function (ch) {
      var b = enc.encode(ch).length;
      if (n + b > 74) { out += cur + "\r\n "; cur = ""; n = 1; }
      cur += ch; n += b;
    });
    return out + cur;
  }
  function icsDate(d) { return d.replace(/-/g, ""); }
  function icsDT(d, t) { return icsDate(d) + "T" + t.replace(":", "") + "00"; }
  function plusMinutes(t, m) { var x = +t.slice(0, 2) * 60 + +t.slice(3) + m; x = Math.min(x, 23 * 60 + 59); return pad(Math.floor(x / 60)) + ":" + pad(x % 60); }
  function buildIcs(inc, today) {
    today = today || todayStr();
    var now = new Date(), stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + "T" + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + "Z";
    var ev = [];
    function add(id, summary, start, end, extra) {
      ev.push(["BEGIN:VEVENT", "UID:" + id + "@study-planner.s3eidat.github.io", "DTSTAMP:" + stamp].concat(start, end, ["SUMMARY:" + icsText(summary)], extra || [], ["END:VEVENT"]));
    }
    var lastExam = st.exams.reduce(function (m, e) { return e.date > m ? e.date : m; }, "");
    var until = lastExam > today ? lastExam : addDays(today, 16 * 7);
    if (inc.classes) st.classes.forEach(function (c) {
      var s = subj(c.subject) || { name: "?" };
      var first = addDays(today, (c.day - dow(today) + 7) % 7);
      if (st.settings.rotation && c.week !== "all" && weekLetter(first) !== c.week) first = addDays(first, 7);
      var rr = "RRULE:FREQ=WEEKLY;" + (st.settings.rotation && c.week !== "all" ? "INTERVAL=2;" : "") + "UNTIL=" + icsDate(until) + "T235959";
      add(c.id, s.name + " (" + T(c.kind) + ")", ["DTSTART:" + icsDT(first, c.start)], ["DTEND:" + icsDT(first, c.end)],
        [rr].concat(c.room || s.room ? ["LOCATION:" + icsText(c.room || s.room)] : []));
    });
    if (inc.exams) st.exams.forEach(function (e) {
      var loc = e.room ? ["LOCATION:" + icsText(e.room)] : [], desc = e.topics.length ? ["DESCRIPTION:" + icsText(e.topics.join("\n"))] : [];
      if (e.time) add(e.id, T("exam") + ": " + examName(e), ["DTSTART:" + icsDT(e.date, e.time)], ["DTEND:" + icsDT(e.date, plusMinutes(e.time, 120))], loc.concat(desc));
      else add(e.id, T("exam") + ": " + examName(e), ["DTSTART;VALUE=DATE:" + icsDate(e.date)], ["DTEND;VALUE=DATE:" + icsDate(addDays(e.date, 1))], loc.concat(desc));
    });
    if (inc.sessions) st.sessions.forEach(function (x) {
      if (x.done || x.date < today) return;
      add(x.id, T("revise") + ": " + sessionLabel(x) + " — " + examName(exam(x.exam)) + " (" + x.mins + " " + T("minutes") + ")",
        ["DTSTART;VALUE=DATE:" + icsDate(x.date)], ["DTEND;VALUE=DATE:" + icsDate(addDays(x.date, 1))], ["TRANSP:TRANSPARENT"]);
    });
    if (inc.tasks) st.tasks.forEach(function (t) {
      if (t.done || !t.due) return;
      add(t.id, t.title + (subjName(t.subject) ? " — " + subjName(t.subject) : ""), ["DTSTART;VALUE=DATE:" + icsDate(t.due)], ["DTEND;VALUE=DATE:" + icsDate(addDays(t.due, 1))],
        ["TRANSP:TRANSPARENT"].concat(t.notes ? ["DESCRIPTION:" + icsText(t.notes)] : []));
    });
    if (!ev.length) return "";
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//S3eidat Tools//Study Planner//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:" + icsText(T("title"))];
    ev.forEach(function (e) { lines = lines.concat(e); });
    lines.push("END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
  }
  function exportIcs(inc) {
    var txt = buildIcs(inc);
    if (!txt) return S3.toast(T("nothingToExport"), "error");
    S3.download(txt, "study-planner-" + todayStr() + ".ics", "text/calendar");
    S3.done();
  }

  // ---------- keyboard ----------
  function shortcutList() {
    return [["1 – 7", T("scTabs")], ["N", T("scNew")], ["?", T("scHelp")], ["Esc", T("scClose")]].map(function (k) {
      return h("div", { "class": "row" }, [h("kbd", { text: k[0] }), h("span", { "class": "muted", text: k[1] })]);
    });
  }
  function showHelp() {
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": T("shortcuts"), dir: st.lang === "ar" ? "rtl" : "ltr" });
    var sheet = h("div", { "class": "s3-sheet" }, [h("div", { "class": "row between" }, [h("h2", { text: T("shortcuts") }), h("button", { type: "button", "class": "btn ghost icon", "aria-label": T("close"), "data-close": true }, [icon("x")])]),
      h("div", { "class": "sp-keys" }, shortcutList())]);
    m.appendChild(sheet);
    function close() { m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m || e.target.closest("[data-close]")) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m);
    sheet.querySelector("button").focus();
  }
  function newItem() {
    ({ today: editTask, tasks: editTask, timetable: editClass, exams: editExam, plan: editExam, subjects: editSubject }[view] || function () {})(null);
  }
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    var tg = e.target, tag = tg && tg.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (tg && tg.isContentEditable) || $(".s3-modal")) return;
    if (/^[1-7]$/.test(e.key)) { e.preventDefault(); go(VIEWS[+e.key - 1]); }
    else if (e.key === "n" || e.key === "N") { e.preventDefault(); newItem(); }
    else if (e.key === "?") { e.preventDefault(); showHelp(); }
  });

  // ---------- self-test (no side effects: works on a copy and restores the real state) ----------
  window.S3_SELFTEST = async function () {
    var real = st, ok = true;
    function expect(c) { if (!c) ok = false; }
    try {
      expect(clean(null) === null && clean({ foo: 1 }) === null && clean({ subjects: [] }).sessions.length === 0);
      var missing = Object.keys(EN).filter(function (k) { return AR[k] == null; });
      expect(missing.length === 0);
      st = clean({ subjects: [{ id: "s1", name: "Math" }], exams: [
        { id: "e1", subject: "s1", title: "Mid", date: "2026-01-15", time: "09:00", topics: ["A", "B", "C", "D"], level: 2 },
        { id: "e2", subject: "s1", title: "Quiz", date: "2026-01-09", topics: [], level: 1 }
      ], settings: { minutes: [60, 60, 60, 60, 60, 0, 60], session: 30, weekStart: 1 } });
      replan("2026-01-05");
      var e1 = st.sessions.filter(function (x) { return x.exam === "e1"; }), e2 = st.sessions.filter(function (x) { return x.exam === "e2"; });
      expect(e1.length === 7 && e2.length === 4);
      expect(st.sessions.every(function (x) { return x.date >= "2026-01-05" && x.date < exam(x.exam).date; }));
      var perDay = {}; st.sessions.forEach(function (x) { perDay[x.date] = (perDay[x.date] || 0) + 1; });
      expect(Object.keys(perDay).every(function (d) { return perDay[d] <= Math.floor(st.settings.minutes[dow(d)] / 30); }));
      expect(!perDay["2026-01-09"] || perDay["2026-01-09"] === 0); // Friday has 0 minutes
      expect(e1.filter(function (x) { return x.final; }).length === 1 && e1.filter(function (x) { return x.final; })[0].date === "2026-01-14");
      expect(e1.some(function (x) { return x.topic === "A"; }) && e1.some(function (x) { return x.topic === "D"; }));
      // tick two, a week passes: done ones stay, the rest is rebuilt from the new day
      st.sessions[0].done = true; st.sessions[1].done = true;
      var keep = [st.sessions[0].id, st.sessions[1].id];
      replan("2026-01-08");
      expect(keep.every(function (id) { return st.sessions.some(function (x) { return x.id === id && x.done; }); }));
      expect(st.sessions.filter(function (x) { return !x.done; }).every(function (x) { return x.date >= "2026-01-08"; }));
      // A/B weeks alternate; ics is well formed and folded
      st.settings.anchor = "2026-01-05"; st.settings.rotation = true;
      expect(weekLetter("2026-01-07") === "A" && weekLetter("2026-01-12") === "B" && weekLetter("2026-01-19") === "A" && weekLetter("2025-12-29") === "B");
      st.classes = [{ id: "c1", subject: "s1", day: 2, start: "08:30", end: "10:00", kind: "lecture", week: "B", room: "قاعة طويلة جدًا جدًا جدًا جدًا جدًا جدًا جدًا جدًا جدًا جدًا جدًا" }];
      var ics = buildIcs({ classes: true, exams: true, sessions: true, tasks: true }, "2026-01-05");
      var enc = new TextEncoder();
      expect(ics.indexOf("BEGIN:VCALENDAR") === 0 && ics.indexOf("DTSTART:20260113T083000") > 0 && ics.indexOf("INTERVAL=2") > 0);
      expect(ics.split("\r\n").every(function (l) { return enc.encode(l).length <= 75; }));
    } catch (err) { ok = false; }
    st = real;
    return ok;
  };

  // ---------- example ----------
  function loadExample() {
    var t = todayStr(), ids = [uid(), uid(), uid(), uid()];
    function o(d) { return addDays(t, d); }
    var ex = {
      lang: st.lang, settings: st.settings,
      subjects: [
        { id: ids[0], name: "Calculus I", color: COLORS[1], teacher: "Dr. Haddad", room: "B201" },
        { id: ids[1], name: "Physics", color: COLORS[2], teacher: "Dr. Saleh", room: "Lab 3" },
        { id: ids[2], name: "English", color: COLORS[4], teacher: "Ms. Nasser", room: "A105" },
        { id: ids[3], name: "Programming", color: COLORS[0], teacher: "Eng. Qasem", room: "C010" }
      ],
      classes: [
        { id: uid(), subject: ids[0], day: 0, start: "08:30", end: "10:00", kind: "lecture" }, { id: uid(), subject: ids[0], day: 2, start: "08:30", end: "10:00", kind: "lecture" },
        { id: uid(), subject: ids[1], day: 1, start: "10:00", end: "11:30", kind: "lecture" }, { id: uid(), subject: ids[1], day: 3, start: "12:00", end: "14:00", kind: "lab" },
        { id: uid(), subject: ids[2], day: 1, start: "12:00", end: "13:00", kind: "seminar" }, { id: uid(), subject: ids[2], day: 3, start: "09:00", end: "10:00", kind: "seminar" },
        { id: uid(), subject: ids[3], day: 0, start: "11:00", end: "12:30", kind: "lecture" }, { id: uid(), subject: ids[3], day: 4, start: "10:00", end: "12:00", kind: "lab" },
        { id: uid(), subject: ids[3], day: 2, start: "13:00", end: "14:00", kind: "tutorial" }
      ],
      exams: [
        { id: uid(), subject: ids[0], title: "Midterm", date: o(9), time: "10:00", room: "Hall 1", level: 2, topics: ["Limits", "Continuity", "Derivatives", "Chain rule", "Past papers"] },
        { id: uid(), subject: ids[1], title: "Quiz 2", date: o(5), time: "12:00", room: "Lab 3", level: 2, topics: ["Kinematics", "Newton's laws"] },
        { id: uid(), subject: ids[3], title: "Final", date: o(24), time: "09:00", room: "C010", level: 2, topics: ["Loops", "Functions", "Arrays", "Recursion", "OOP basics"] }
      ],
      tasks: [
        { id: uid(), subject: ids[0], title: "Problem set 4", due: o(2), kind: "homework" },
        { id: uid(), subject: ids[2], title: "Essay draft: my city", due: o(6), kind: "assignment" },
        { id: uid(), subject: ids[1], title: "Lab report 2", due: o(-1), kind: "assignment" },
        { id: uid(), subject: ids[3], title: "Read chapter 5", due: o(1), kind: "reading", done: true }
      ],
      sessions: []
    };
    var before = st;
    st = clean(ex); replan(); save();
    view = "today"; render();
    var tt = S3.toast(T("exampleLoaded") + " ");
    if (before.subjects.length) tt.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { st = before; save(); render(); tt.remove(); } }, [T("undo")]));
  }

  // ---------- shell ----------
  function render() {
    var root = $("#sp");
    root.setAttribute("dir", st.lang === "ar" ? "rtl" : "ltr");
    root.setAttribute("lang", st.lang);
    $("#sp-title").textContent = T("title");
    $("#sp-sub").textContent = T("sub");
    var act = $("#sp-actions"); act.textContent = "";
    act.appendChild(h("button", { type: "button", "class": "btn ghost small", lang: st.lang === "ar" ? "en" : "ar", onclick: function () { change(function () { st.lang = st.lang === "ar" ? "en" : "ar"; }); } }, [T("lang")]));
    act.appendChild(h("button", { type: "button", "class": "btn ghost small sp-help", "aria-label": T("shortcuts"), title: T("shortcuts"), onclick: showHelp }, ["?"]));
    var tabs = $("#sp-tabs"); tabs.textContent = "";
    VIEWS.forEach(function (k) {
      tabs.appendChild(h("button", { type: "button", "aria-pressed": String(view === k), "data-view": k, onclick: function () { go(k); } }, [T(k)]));
    });
    var v = $("#sp-view"); v.textContent = "";
    ({ today: renderToday, timetable: renderTimetable, tasks: renderTasks, exams: renderExams, plan: renderPlan, subjects: renderSubjects, settings: renderSettings }[view] || renderToday)(v);
  }
  function go(k) { if (VIEWS.indexOf(k) < 0) k = "today"; view = k; S3.store(KEY + ":view", k); render(); var b = $("#sp-tabs [aria-pressed=true]"); if (b && b.scrollIntoView) b.scrollIntoView({ block: "nearest", inline: "nearest" }); }

  // A new day can leave sessions behind: the plan is only rebuilt when you ask (Re-plan) or change exams/time.
  if (VIEWS.indexOf(view) < 0) view = "today";
  render();
  window.SP = { state: function () { return st; }, replan: replan, clean: clean, render: render };
})();
