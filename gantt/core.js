/* Gantt core: working-day calendar, scheduling (FS/SS/FF/SF with lag), critical path, outline, parsing,
   CSV and Microsoft Project XML import, CSV export. No DOM needed (XML import uses DOMParser when present). */
(function (root) {
  "use strict";

  function uid() {
    var a = new Uint8Array(6);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(a); else for (var i = 0; i < 6; i++) a[i] = Math.random() * 256;
    return Array.prototype.map.call(a, function (b) { return (b + 256).toString(16).slice(1); }).join("");
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // ---------- days as integers (UTC, no time zones or DST) ----------
  function dayNum(key) { return Math.round(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 864e5); }
  function keyOf(n) { var d = new Date(n * 864e5); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
  function addDays(key, n) { return keyOf(dayNum(key) + n); }
  function weekday(key) { return ((dayNum(key) % 7) + 7 + 4) % 7; } // 0 Sunday … 6 Saturday
  function validDay(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && keyOf(dayNum(s)) === s; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  // ---------- working-day calendar ----------
  // Index space: idx(day) = number of working days before `day` counted from a fixed anchor, so a task
  // occupies [s, s + duration) and finish/start arithmetic is plain integer maths.
  var ANCHOR = dayNum("2000-01-03"); // a Monday
  function Calendar(weekend, holidays) {
    var we = [false, false, false, false, false, false, false];
    (weekend || []).forEach(function (d) { if (d >= 0 && d < 7) we[d] = true; });
    if (we.every(Boolean)) we = [true, false, false, false, false, false, true];
    this.we = we;
    this.wpw = we.filter(function (x) { return !x; }).length;
    // working weekdays among the first k days of a week starting on the anchor's weekday (Monday)
    this.prefix = [0];
    for (var k = 0; k < 7; k++) this.prefix.push(this.prefix[k] + (we[(1 + k) % 7] ? 0 : 1));
    var hs = {};
    this.hol = (holidays || []).filter(function (h) { return validDay(h) && !hs[h] && (hs[h] = 1); }).map(dayNum)
      .filter(function (n) { return !we[((n % 7) + 7 + 4) % 7]; }).sort(function (a, b) { return a - b; });
  }
  Calendar.prototype.isWorkNum = function (n) {
    if (this.we[((n % 7) + 7 + 4) % 7]) return false;
    return bsearch(this.hol, n) < 0;
  };
  Calendar.prototype.isWork = function (key) { return this.isWorkNum(dayNum(key)); };
  // working days in [ANCHOR, n) (negative when n is before the anchor)
  Calendar.prototype.countNum = function (n) {
    var d = n - ANCHOR, weeks = Math.floor(d / 7), rem = d - weeks * 7;
    var c = weeks * this.wpw + this.prefix[rem];
    // holidays before n (and from the anchor on), or after n when n is before the anchor
    var hi = lowerBound(this.hol, n), lo = lowerBound(this.hol, ANCHOR);
    return c - (hi - lo);
  };
  Calendar.prototype.idx = function (key) { return this.countNum(dayNum(key)); };
  Calendar.prototype.dayAt = function (i) {
    var n = ANCHOR + Math.floor(i / this.wpw) * 7, guard = 0;
    // walk to the working day whose index is i (holidays shift it by a few days at most)
    while (guard++ < 5000) {
      var c = this.countNum(n);
      if (c === i && this.isWorkNum(n)) return keyOf(n);
      n += c < i || (c === i && !this.isWorkNum(n)) ? 1 : -1;
    }
    return keyOf(n);
  };
  Calendar.prototype.next = function (key) { var n = dayNum(key); while (!this.isWorkNum(n)) n++; return keyOf(n); };
  function bsearch(a, x) { var lo = 0, hi = a.length - 1; while (lo <= hi) { var m = (lo + hi) >> 1; if (a[m] === x) return m; if (a[m] < x) lo = m + 1; else hi = m - 1; } return -1; }
  function lowerBound(a, x) { var lo = 0, hi = a.length; while (lo < hi) { var m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }

  // ---------- project ----------
  var WEEKENDS = { satsun: [6, 0], frisat: [5, 6], sun: [0], fri: [5], none: [] };
  function newProject(name, start) {
    return { app: "s3-gantt", v: 1, id: uid(), name: name || "New project", start: start || today(), weekend: [6, 0], holidays: [], tasks: [], baseline: null, updated: Date.now() };
  }
  function newTask(over) {
    var t = { id: uid(), name: "New task", lvl: 0, start: null, dur: 1, pct: 0, deps: [], res: "", notes: "", color: null };
    for (var k in over || {}) t[k] = over[k];
    return t;
  }
  var TYPES = ["FS", "SS", "FF", "SF"];
  function normalize(o) {
    if (!o || o.app !== "s3-gantt" || !Array.isArray(o.tasks)) throw new Error("Not a Gantt file");
    var str = function (v, n) { return String(v == null ? "" : v).slice(0, n); };
    var int = function (v, d, lo, hi) { v = Math.round(Number(v)); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
    var p = newProject(str(o.name, 120) || "Project", validDay(o.start) ? o.start : today());
    p.id = str(o.id, 40) || p.id; p.updated = int(o.updated, Date.now(), 0, 1e15);
    p.weekend = Array.isArray(o.weekend) ? o.weekend.filter(function (d) { return d >= 0 && d < 7 && d === Math.round(d); }).slice(0, 6) : [6, 0];
    p.holidays = Array.isArray(o.holidays) ? o.holidays.filter(validDay).slice(0, 500) : [];
    var ids = {}, prevLvl = -1;
    o.tasks.forEach(function (t) {
      if (!t || !t.id || ids[t.id]) return;
      ids[t.id] = 1;
      var lvl = int(t.lvl, 0, 0, 20); if (lvl > prevLvl + 1) lvl = prevLvl + 1; prevLvl = lvl;
      p.tasks.push({ id: str(t.id, 40), name: str(t.name, 300), lvl: lvl, start: validDay(t.start) ? t.start : null, dur: int(t.dur, 1, 0, 100000), pct: int(t.pct, 0, 0, 100),
        deps: [], res: str(t.res, 200), notes: str(t.notes, 3000), color: /^#[0-9a-fA-F]{6}$/.test(t.color) ? t.color : null, col: !!t.col, _deps: t.deps });
    });
    p.tasks.forEach(function (t) {
      var seen = {};
      (Array.isArray(t._deps) ? t._deps : []).forEach(function (d) {
        if (d && ids[d.id] && d.id !== t.id && !seen[d.id]) { seen[d.id] = 1; t.deps.push({ id: d.id, type: TYPES.indexOf(d.type) >= 0 ? d.type : "FS", lag: int(d.lag, 0, -10000, 10000) }); }
      });
      delete t._deps;
    });
    // drop links that would form a loop
    p.tasks.forEach(function (t) { t.deps = t.deps.filter(function (d) { return !reaches(p, d.id, t.id, t.id + ">" + d.id); }); });
    if (o.baseline && typeof o.baseline === "object") {
      p.baseline = {};
      Object.keys(o.baseline).forEach(function (k) { var b = o.baseline[k]; if (ids[k] && b && validDay(b.s) && validDay(b.f)) p.baseline[k] = { s: b.s, f: b.f }; });
      p.baseline.at = validDay(o.baseline.at) ? o.baseline.at : null;
    }
    return p;
  }
  function index(p) { var m = {}; p.tasks.forEach(function (t, i) { m[t.id] = i; }); return m; }
  function isSummary(p, i) { return i + 1 < p.tasks.length && p.tasks[i + 1].lvl > p.tasks[i].lvl; }
  function subtreeEnd(p, i) { var j = i + 1; while (j < p.tasks.length && p.tasks[j].lvl > p.tasks[i].lvl) j++; return j; }
  // Does `from` (following predecessor links back) reach `target`? skip = an edge to ignore ("succ>pred").
  function reaches(p, from, target, skip) {
    var byId = {}; p.tasks.forEach(function (t) { byId[t.id] = t; });
    var stack = [from], seen = {};
    while (stack.length) {
      var id = stack.pop(); if (id === target) return true;
      if (seen[id]) continue; seen[id] = 1;
      var t = byId[id]; if (!t) continue;
      t.deps.forEach(function (d) { if (skip !== id + ">" + d.id) stack.push(d.id); });
    }
    return false;
  }
  // Would making `pred` a predecessor of `succ` create a loop?
  function wouldLoop(p, predId, succId) { return predId === succId || reaches(p, predId, succId); }

  // ---------- scheduling ----------
  function schedule(p) {
    var cal = new Calendar(p.weekend, p.holidays), n = p.tasks.length, out = {}, ix = index(p);
    var projStart = cal.idx(cal.next(p.start));
    var summary = p.tasks.map(function (t, i) { return isSummary(p, i); });
    // links between leaf tasks only
    var preds = {}, succs = {};
    p.tasks.forEach(function (t, i) {
      preds[t.id] = []; succs[t.id] = succs[t.id] || [];
      if (summary[i]) return;
      t.deps.forEach(function (d) {
        var j = ix[d.id]; if (j == null || summary[j]) return;
        preds[t.id].push(d); (succs[d.id] = succs[d.id] || []).push({ id: t.id, type: d.type, lag: d.lag });
      });
    });
    // topological order (Kahn)
    var indeg = {}, order = [], queue = [];
    p.tasks.forEach(function (t, i) { if (!summary[i]) { indeg[t.id] = preds[t.id].length; if (!indeg[t.id]) queue.push(t.id); } });
    while (queue.length) { var id = queue.shift(); order.push(id); (succs[id] || []).forEach(function (s) { if (--indeg[s.id] === 0) queue.push(s.id); }); }
    p.tasks.forEach(function (t, i) { if (!summary[i] && order.indexOf(t.id) < 0) order.push(t.id); }); // leftovers of a loop: schedule anyway
    var R = {};
    order.forEach(function (id) {
      var t = p.tasks[ix[id]], es = t.start ? cal.idx(t.start) : projStart, d = t.dur;
      preds[id].forEach(function (l) {
        var q = R[l.id]; if (!q) return;
        var c = l.type === "FS" ? q.e + l.lag : l.type === "SS" ? q.s + l.lag : l.type === "FF" ? q.e + l.lag - d : q.s + l.lag - d;
        if (c > es) es = c;
      });
      R[id] = { s: es, e: es + d };
    });
    // backward pass for float
    var end = -Infinity; Object.keys(R).forEach(function (k) { if (R[k].e > end) end = R[k].e; });
    if (!isFinite(end)) end = projStart;
    order.slice().reverse().forEach(function (id) {
      var t = p.tasks[ix[id]], d = t.dur, le = end;
      (succs[id] || []).forEach(function (l) {
        var q = R[l.id]; if (!q || q.ls == null) return;
        var c = l.type === "FS" ? q.ls - l.lag : l.type === "SS" ? q.ls - l.lag + d : l.type === "FF" ? q.le - l.lag : q.le - l.lag + d;
        if (c < le) le = c;
      });
      R[id].le = le; R[id].ls = le - d; R[id].float = R[id].ls - R[id].s;
    });
    // summaries roll up from their leaves (deepest first)
    for (var i = n - 1; i >= 0; i--) {
      if (!summary[i]) continue;
      var j = subtreeEnd(p, i), s = Infinity, e = -Infinity, work = 0, done = 0, crit = false;
      for (var k = i + 1; k < j; k++) {
        if (summary[k]) continue;
        var r = R[p.tasks[k].id]; if (!r) continue;
        s = Math.min(s, r.s); e = Math.max(e, r.e);
        var w = Math.max(1, p.tasks[k].dur); work += w; done += w * p.tasks[k].pct;
        if (r.float <= 0) crit = true;
      }
      if (!isFinite(s)) { s = projStart; e = projStart; }
      R[p.tasks[i].id] = { s: s, e: e, summary: true, pct: work ? Math.round(done / work) : 0, crit: crit };
    }
    var wbs = [], counters = [];
    p.tasks.forEach(function (t, i) {
      counters.length = t.lvl + 1; counters[t.lvl] = (counters[t.lvl] || 0) + 1;
      var r = R[t.id], milestone = !summary[i] && t.dur === 0;
      out[t.id] = { row: i + 1, wbs: counters.join("."), summary: summary[i], milestone: milestone, s: r.s, e: r.e,
        start: cal.dayAt(r.s), finish: milestone || r.e <= r.s ? cal.dayAt(r.s) : cal.dayAt(r.e - 1), dur: r.e - r.s,
        pct: summary[i] ? r.pct : t.pct, float: summary[i] ? null : r.float, critical: summary[i] ? r.crit : r.float <= 0 };
    });
    var leaves = p.tasks.filter(function (t, i) { return !summary[i]; });
    return { tasks: out, cal: cal, start: cal.dayAt(projStart), finish: leaves.length ? cal.dayAt(Math.max(projStart, end - 1)) : cal.dayAt(projStart),
      startIdx: projStart, endIdx: end, workdays: Math.max(0, end - projStart) };
  }

  // ---------- parsing ----------
  function asciiDigits(s) {
    return String(s).replace(/[\u0660-\u0669]/g, function (c) { return c.charCodeAt(0) - 0x660; }).replace(/[\u06F0-\u06F9]/g, function (c) { return c.charCodeAt(0) - 0x6F0; });
  }
  // "5", "5d", "5 days", "2w", "1 wk", "1.5w", "0" → working days. wpw = working days per week.
  function parseDur(s, wpw) {
    s = asciiDigits(s).trim().toLowerCase().replace(/,/g, ".");
    var m = /^(-?\d+(?:\.\d+)?)\s*(d|day|days|w|wk|wks|week|weeks|mo|mon|month|months|ي|يوم|أيام|أسبوع|أسابيع)?\??$/.exec(s);
    if (!m) return NaN;
    var v = parseFloat(m[1]), u = m[2] || "d";
    if (/^(w|wk|week|أسب)/.test(u)) v *= wpw || 5;
    else if (/^(mo|mon|month)/.test(u)) v *= (wpw || 5) * 4;
    v = Math.round(v);
    return v >= 0 && v <= 100000 ? v : NaN;
  }
  // "2, 3FS+2, 5SS-1d, 7ff" with row numbers → [{row, type, lag}] or {error}
  function parseDeps(s) {
    var out = [], bad = null;
    asciiDigits(s || "").split(/[,;،]+/).forEach(function (part) {
      part = part.trim().toUpperCase(); if (!part) return;
      var m = /^(\d+)\s*(FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+)\s*(?:D|DAYS?)?)?$/.exec(part);
      if (!m) { bad = part; return; }
      out.push({ row: +m[1], type: m[2] || "FS", lag: m[3] ? (m[3] === "-" ? -1 : 1) * +m[4] : 0 });
    });
    return bad ? { error: bad } : out;
  }
  function fmtDeps(p, t, rows) {
    return t.deps.map(function (d) {
      var r = rows[d.id]; if (!r) return null;
      return r + (d.type !== "FS" || d.lag ? d.type : "") + (d.lag ? (d.lag > 0 ? "+" : "") + d.lag + "d" : "");
    }).filter(Boolean).join(", ");
  }

  // ---------- outline edits ----------
  function indent(p, i) {
    if (i <= 0) return false;
    var t = p.tasks[i], prev = p.tasks[i - 1];
    if (t.lvl > prev.lvl) return false;
    var j = subtreeEnd(p, i);
    for (var k = i; k < j; k++) p.tasks[k].lvl++;
    return true;
  }
  function outdent(p, i) {
    var t = p.tasks[i]; if (!t || t.lvl === 0) return false;
    var j = subtreeEnd(p, i);
    // its following siblings now sit under it, so they become its children (the outline is positional)
    for (var k = i; k < j; k++) p.tasks[k].lvl--;
    return true;
  }
  function move(p, i, dir) {
    var t = p.tasks[i], j = subtreeEnd(p, i), block = p.tasks.slice(i, j);
    if (dir < 0) {
      var k = i - 1; while (k >= 0 && p.tasks[k].lvl > t.lvl) k--;
      if (k < 0 || p.tasks[k].lvl < t.lvl) return false;
      p.tasks.splice(i, block.length); Array.prototype.splice.apply(p.tasks, [k, 0].concat(block)); return true;
    }
    if (j >= p.tasks.length || p.tasks[j].lvl < t.lvl) return false;
    var e = subtreeEnd(p, j);
    var next = p.tasks.slice(j, e);
    p.tasks.splice(i, block.length + next.length); Array.prototype.splice.apply(p.tasks, [i, 0].concat(next, block)); return true;
  }
  function remove(p, i) {
    var j = subtreeEnd(p, i), gone = {};
    p.tasks.slice(i, j).forEach(function (t) { gone[t.id] = 1; });
    p.tasks.splice(i, j - i);
    p.tasks.forEach(function (t) { t.deps = t.deps.filter(function (d) { return !gone[d.id]; }); });
    if (p.baseline) Object.keys(gone).forEach(function (k) { delete p.baseline[k]; });
    // keep the outline valid: a first task can't be indented
    var prev = -1; p.tasks.forEach(function (t) { if (t.lvl > prev + 1) t.lvl = prev + 1; prev = t.lvl; });
    return j - i;
  }
  // Links on summary tasks are not used for scheduling; remove them so the table never shows dead links.
  function cleanSummaryLinks(p) {
    var sum = {}, n = 0; p.tasks.forEach(function (t, i) { if (isSummary(p, i)) sum[t.id] = 1; });
    p.tasks.forEach(function (t) {
      var before = t.deps.length;
      t.deps = sum[t.id] ? [] : t.deps.filter(function (d) { return !sum[d.id]; });
      n += before - t.deps.length;
    });
    return n;
  }
  function setBaseline(p) {
    var s = schedule(p); p.baseline = { at: today() };
    p.tasks.forEach(function (t) { var r = s.tasks[t.id]; p.baseline[t.id] = { s: r.start, f: r.finish }; });
  }

  // ---------- CSV ----------
  function csvCell(v) {
    v = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(v) && !/^-?\d[\d.,]*$/.test(v)) v = "'" + v;
    return /[",\n\r']/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function exportCSV(p) {
    var s = schedule(p), rows = {}; p.tasks.forEach(function (t, i) { rows[t.id] = i + 1; });
    var lines = [["ID", "Outline Level", "WBS", "Name", "Duration (days)", "Start", "Finish", "% Complete", "Predecessors", "Resource Names", "Notes", "Critical"].join(",")];
    p.tasks.forEach(function (t, i) {
      var r = s.tasks[t.id];
      lines.push([i + 1, t.lvl + 1, r.wbs, t.name, r.dur, r.start, r.finish, r.pct, fmtDeps(p, t, rows), t.res, t.notes, r.critical ? "Yes" : "No"].map(csvCell).join(","));
    });
    return lines.join("\r\n") + "\r\n";
  }
  function parseCSV(text) {
    text = String(text).replace(/^\uFEFF/, "");
    var first = text.split(/\r?\n/, 1)[0] || "";
    var delim = [",", ";", "\t"].map(function (x) { return [x, first.split(x).length]; }).sort(function (a, b) { return b[1] - a[1]; })[0][0];
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"' && cell === "") q = true;
      else if (ch === delim) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim(); }); });
  }
  // Dates like 2026-10-05, 10/5/26, 5/10/2026, "Mon 10/5/26", "October 5, 2026 8:00 AM". order: "mdy" | "dmy"
  function parseDate(s, order) {
    s = asciiDigits(String(s || "")).trim().replace(/^[A-Za-z]{2,4}\.?\s+(?=\d)/, "").replace(/\s+\d{1,2}:\d{2}.*$/, "").replace(/T.*$/, "");
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) { var k = m[1] + "-" + pad(+m[2]) + "-" + pad(+m[3]); return validDay(k) ? k : null; }
    m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s);
    if (m) {
      var a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
      var mo = order === "dmy" ? b : a, d = order === "dmy" ? a : b;
      var key = y + "-" + pad(mo) + "-" + pad(d); return validDay(key) ? key : null;
    }
    var t = Date.parse(s); if (isFinite(t)) { var dt = new Date(t); var kk = dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate()); return validDay(kk) ? kk : null; }
    return null;
  }
  function importCSV(text, name) {
    var rows = parseCSV(text); if (rows.length < 2) throw new Error("empty");
    var hd = rows[0].map(function (x) { return x.trim().toLowerCase().replace(/[_%]/g, " ").replace(/\s+/g, " ").trim(); });
    var col = function () { for (var i = 0; i < arguments.length; i++) { var k = hd.indexOf(arguments[i]); if (k >= 0) return k; } return -1; };
    var cId = col("id", "unique id"), cLvl = col("outline level"), cName = col("name", "task name", "task"), cDur = col("duration (days)", "duration"),
      cStart = col("start", "start date"), cFin = col("finish", "finish date", "end", "end date"), cPct = col("complete", "percent complete", "progress"),
      cPred = col("predecessors"), cRes = col("resource names", "resources", "resource"), cNotes = col("notes");
    if (cName < 0) throw new Error("columns");
    // date order: if any first number is over 12 it must be day/month
    var order = "mdy";
    rows.slice(1).forEach(function (r) { [cStart, cFin].forEach(function (c) { var m = /(\d{1,2})[\/.\-](\d{1,2})[\/.\-]\d{2,4}/.exec(r[c] || ""); if (m && +m[1] > 12) order = "dmy"; }); });
    var p = newProject(name || "Imported project"), byRow = {}, minStart = null;
    var cal = new Calendar(p.weekend, p.holidays);
    rows.slice(1).forEach(function (r, i) {
      var get = function (c) { return c >= 0 ? String(r[c] || "").trim() : ""; };
      if (!get(cName)) return;
      var t = newTask({ name: get(cName).slice(0, 300), lvl: cLvl >= 0 ? Math.max(0, (parseInt(get(cLvl), 10) || 1) - 1) : 0 });
      var st = parseDate(get(cStart), order), fi = parseDate(get(cFin), order), du = parseDur(get(cDur).replace(/\s*(edays?|elapsed.*)$/i, "d"), 5);
      if (st) { t.start = st; if (!minStart || st < minStart) minStart = st; }
      if (!isNaN(du)) t.dur = du; else if (st && fi) t.dur = Math.max(1, cal.idx(fi) - cal.idx(st) + 1);
      t.pct = Math.max(0, Math.min(100, parseInt(get(cPct), 10) || 0));
      t.res = get(cRes).slice(0, 200); t.notes = get(cNotes).slice(0, 3000);
      t._pred = get(cPred);
      byRow[cId >= 0 && get(cId) ? get(cId) : String(i + 1)] = t;
      p.tasks.push(t);
    });
    if (minStart) p.start = minStart;
    p.tasks.forEach(function (t) {
      var deps = parseDeps(t._pred); delete t._pred;
      if (deps.error) return;
      deps.forEach(function (d) { var q = byRow[String(d.row)]; if (q && q !== t && !wouldLoop(p, q.id, t.id)) t.deps.push({ id: q.id, type: d.type, lag: d.lag }); });
    });
    return normalize(JSON.parse(JSON.stringify(p)));
  }
  // Microsoft Project XML (MSPDI). Reads tasks, outline, start, duration, progress, links and notes.
  function importMSPDI(xml) {
    if (!root.DOMParser) throw new Error("no parser");
    var doc = new root.DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("bad xml");
    var prj = doc.documentElement; if (!prj || prj.localName !== "Project") throw new Error("not mspdi");
    var kid = function (el, name) { for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === name) return c; return null; };
    var txt = function (el, name) { var c = kid(el, name); return c ? c.textContent.trim() : ""; };
    var mpd = parseInt(txt(prj, "MinutesPerDay"), 10) || 480;
    var p = newProject(txt(prj, "Title") || txt(prj, "Name").replace(/\.xml$/i, "") || "Imported project");
    var sd = txt(prj, "StartDate").slice(0, 10); if (validDay(sd)) p.start = sd;
    var tasksEl = kid(prj, "Tasks"); if (!tasksEl) throw new Error("no tasks");
    var byUid = {}, links = [];
    for (var el = tasksEl.firstElementChild; el; el = el.nextElementSibling) {
      if (el.localName !== "Task") continue;
      var uidv = txt(el, "UID"), lvl = parseInt(txt(el, "OutlineLevel"), 10);
      if (uidv === "0" || lvl === 0 || txt(el, "IsNull") === "1") continue;
      var durm = /PT(\d+)H(\d+)M/.exec(txt(el, "Duration")), hours = durm ? +durm[1] + +durm[2] / 60 : 8;
      var t = newTask({ name: (txt(el, "Name") || "Task").slice(0, 300), lvl: Math.max(0, (lvl || 1) - 1), pct: Math.min(100, parseInt(txt(el, "PercentComplete"), 10) || 0),
        dur: txt(el, "Milestone") === "1" ? 0 : Math.max(0, Math.round(hours * 60 / mpd)), notes: txt(el, "Notes").slice(0, 3000) });
      var st = txt(el, "Start").slice(0, 10); if (validDay(st)) t.start = st;
      byUid[uidv] = t; p.tasks.push(t);
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
        if (c.localName !== "PredecessorLink") continue;
        var type = ["FF", "FS", "SF", "SS"][parseInt(txt(c, "Type"), 10)] || "FS";
        var lag = Math.round((parseInt(txt(c, "LinkLag"), 10) || 0) / 10 / mpd);
        links.push({ t: t, pred: txt(c, "PredecessorUID"), type: type, lag: lag });
      }
    }
    links.forEach(function (l) { var q = byUid[l.pred]; if (q && q !== l.t && !wouldLoop(p, q.id, l.t.id)) l.t.deps.push({ id: q.id, type: l.type, lag: l.lag }); });
    // keep starts only as "not before" dates for tasks without predecessors; linked tasks follow their links
    p.tasks.forEach(function (t) { if (t.deps.length) t.start = null; });
    var out = normalize(JSON.parse(JSON.stringify(p)));
    cleanSummaryLinks(out);
    return out;
  }

  // ---------- templates ----------
  function template(kind, start) {
    var p = newProject(kind === "event" ? "Event plan" : "Website launch", start || today()), T = function (name, lvl, dur, deps) {
      var t = newTask({ name: name, lvl: lvl, dur: dur }); t._d = deps || []; p.tasks.push(t); return t;
    };
    if (kind === "event") {
      T("Planning", 0, 1); T("Set budget and goals", 1, 2); T("Book venue", 1, 5, [1]); T("Choose date", 1, 0, [2]);
      T("Promotion", 0, 1); T("Design poster", 1, 3, [3]); T("Social media posts", 1, 10, [4]); T("Registrations open", 1, 0, [4]);
      T("Event day", 0, 1); T("Catering and equipment", 1, 4, [3]); T("Rehearsal", 1, 1, [7, 5]); T("Event", 1, 1, [8]);
    } else {
      T("Discovery", 0, 1); T("Kick-off meeting", 1, 1); T("Requirements", 1, 4, [1]); T("Sign-off", 1, 0, [2]);
      T("Design", 0, 1); T("Wireframes", 1, 5, [3]); T("Visual design", 1, 6, [4]); T("Build", 0, 1); T("Front end", 1, 10, [5]);
      T("Back end", 1, 12, [4]); T("Content", 1, 6, [5]); T("Launch", 0, 1); T("Testing", 1, 5, [6, 7, 8]); T("Go live", 1, 0, [9]);
    }
    // deps above are indexes among leaf tasks (in order)
    var leaves = p.tasks.filter(function (t, i) { return !isSummary(p, i); });
    leaves.forEach(function (t) { t.deps = (t._d || []).map(function (k) { return { id: leaves[k - 1].id, type: "FS", lag: 0 }; }); });
    p.tasks.forEach(function (t) { delete t._d; });
    p.tasks[1].pct = 100; p.tasks[2].pct = 40;
    return p;
  }

  var API = {
    uid: uid, dayNum: dayNum, keyOf: keyOf, addDays: addDays, weekday: weekday, validDay: validDay, today: today,
    Calendar: Calendar, WEEKENDS: WEEKENDS, TYPES: TYPES, newProject: newProject, newTask: newTask, normalize: normalize, index: index,
    isSummary: isSummary, subtreeEnd: subtreeEnd, wouldLoop: wouldLoop, schedule: schedule, parseDur: parseDur, parseDeps: parseDeps, fmtDeps: fmtDeps,
    indent: indent, outdent: outdent, move: move, remove: remove, cleanSummaryLinks: cleanSummaryLinks, setBaseline: setBaseline,
    exportCSV: exportCSV, parseCSV: parseCSV, parseDate: parseDate, importCSV: importCSV, importMSPDI: importMSPDI, template: template
  };
  root.GanttCore = API;
  if (typeof module === "object" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
