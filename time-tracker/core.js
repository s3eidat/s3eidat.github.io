/* Time Tracker core: data model, durations, timer, rates, reports, timesheet, CSV in/out, invoice lines.
   No DOM, no network. Times are epoch milliseconds; days are local "YYYY-MM-DD". */
(function (root) {
  "use strict";

  var H = 3600000, MIN = 60000;
  var COLORS = ["#0e9f9a", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#64748b"];

  function uid() {
    var a = new Uint8Array(6);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(a); else for (var i = 0; i < 6; i++) a[i] = Math.random() * 256;
    return Array.prototype.map.call(a, function (b) { return (b + 256).toString(16).slice(1); }).join("");
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // ---------- dates ----------
  function dayKey(ms) { var d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function dayStart(key) { return new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)).getTime(); }
  function addDays(key, n) { var d = new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10) + n); return dayKey(d.getTime()); }
  function validDay(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && dayKey(dayStart(s)) === s; }
  // First day of the week containing `key`. ws: 0 Sunday, 1 Monday, 6 Saturday.
  function weekOf(key, ws) {
    var d = new Date(dayStart(key)), back = (d.getDay() - ws + 7) % 7;
    return addDays(key, -back);
  }
  function at(key, hhmm) {
    var m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
    var d = new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10), m ? +m[1] : 0, m ? +m[2] : 0);
    return d.getTime();
  }
  function hhmm(ms) { var d = new Date(ms); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }

  // ---------- durations ----------
  function asciiDigits(s) {
    return String(s).replace(/[\u0660-\u0669]/g, function (c) { return c.charCodeAt(0) - 0x660; })
      .replace(/[\u06F0-\u06F9]/g, function (c) { return c.charCodeAt(0) - 0x6F0; }).replace(/\u066B/g, ".").replace(/,/g, ".");
  }
  // "1:30" (h:mm) · "1:30:15" · "90m" · "1.5h" · "1h 20m" · "45" (minutes) · "2.5" (hours). Returns ms or NaN.
  function parseDuration(str) {
    var s = asciiDigits(str).trim().toLowerCase().replace(/\s+/g, " ");
    if (!s) return NaN;
    var m;
    if ((m = /^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/.exec(s))) return (+m[1]) * H + (+m[2]) * MIN + (m[3] ? +m[3] * 1000 : 0);
    if ((m = /^(\d+(?:\.\d+)?)$/.exec(s))) return s.indexOf(".") >= 0 ? Math.round(parseFloat(s) * H) : (+s) * MIN;
    var total = 0, rest = s.replace(/(\d+(?:\.\d+)?)\s*(hours|hour|hrs|hr|h|minutes|minute|mins|min|m|seconds|second|secs|sec|s|\u0633\u0627\u0639\u0627\u062A|\u0633\u0627\u0639\u0629|\u0633|\u062F\u0642\u0627\u0626\u0642|\u062F\u0642\u064A\u0642\u0629|\u062F)/g, function (_, n, u) {
      var v = parseFloat(n);
      total += /^(h|\u0633)/.test(u) ? v * H : /^(m|\u062F)/.test(u) ? v * MIN : v * 1000; // \u0633 = Arabic hour, \u062F = minute
      return "";
    });
    if (rest.replace(/[\s,]/g, "")) return NaN;
    return total > 0 ? Math.round(total) : NaN;
  }
  // 1:05:09 (clock), or h:mm with style "hm", or decimal hours with style "dec".
  function fmtDur(ms, style) {
    ms = Math.max(0, Math.round(ms || 0));
    if (style === "dec") return (ms / H).toFixed(2);
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (style === "hm") { var mm = Math.round(ms / MIN); return Math.floor(mm / 60) + ":" + pad(mm % 60); }
    return h + ":" + pad(m) + ":" + pad(sec);
  }

  // ---------- data ----------
  function newData() {
    return { app: "s3-time", v: 1, settings: { cur: "USD", rate: 0, ws: 1, round: 0, roundMode: "up", clock: 24, me: "", tax: 0, invNo: 1 },
      clients: [], projects: [], tags: [], entries: [] };
  }
  function normalize(o) {
    if (!o || o.app !== "s3-time" || !Array.isArray(o.entries)) throw new Error("Not a time tracker file");
    var d = newData(), st = o.settings || {};
    var str = function (v, n) { return String(v == null ? "" : v).slice(0, n); };
    var num = function (v, def, lo, hi) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
    d.settings = { cur: /^[A-Z]{3}$/.test(st.cur) ? st.cur : "USD", rate: num(st.rate, 0, 0, 1e7), ws: [0, 1, 6].indexOf(st.ws) >= 0 ? st.ws : 1,
      round: [0, 1, 5, 6, 10, 15, 30, 60].indexOf(st.round) >= 0 ? st.round : 0, roundMode: st.roundMode === "nearest" ? "nearest" : "up",
      clock: st.clock === 12 ? 12 : 24, me: str(st.me, 1000), tax: num(st.tax, 0, 0, 100), invNo: Math.round(num(st.invNo, 1, 1, 1e9)) };
    var cids = {}, pids = {};
    (o.clients || []).forEach(function (c) { if (c && c.id && !cids[c.id]) { cids[c.id] = 1; d.clients.push({ id: str(c.id, 40), name: str(c.name, 120), rate: c.rate == null || c.rate === "" ? null : num(c.rate, null, 0, 1e7), info: str(c.info, 1000) }); } });
    (o.projects || []).forEach(function (p) { if (p && p.id && !pids[p.id]) { pids[p.id] = 1; d.projects.push({ id: str(p.id, 40), name: str(p.name, 120), client: cids[p.client] ? p.client : null,
      color: /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color : COLORS[0], rate: p.rate == null || p.rate === "" ? null : num(p.rate, null, 0, 1e7), billable: p.billable !== false, archived: !!p.archived }); } });
    var tagSet = {};
    (o.tags || []).forEach(function (t) { t = str(t, 60).trim(); if (t && !tagSet[t.toLowerCase()]) { tagSet[t.toLowerCase()] = 1; d.tags.push(t); } });
    var running = false, eids = {};
    o.entries.slice().sort(function (a, b) { return (b && b.start || 0) - (a && a.start || 0); }).forEach(function (e) {
      if (!e || !isFinite(e.start) || eids[e.id]) return;
      var end = e.end == null ? null : Number(e.end);
      if (end == null) { if (running) return; running = true; } // only one running timer
      else if (!isFinite(end) || end < e.start) return;
      var id = str(e.id, 40) || uid(); eids[id] = 1;
      var tags = Array.isArray(e.tags) ? e.tags.map(function (t) { return str(t, 60).trim(); }).filter(Boolean).slice(0, 20) : [];
      tags.forEach(function (t) { if (!tagSet[t.toLowerCase()]) { tagSet[t.toLowerCase()] = 1; d.tags.push(t); } });
      d.entries.push({ id: id, desc: str(e.desc, 500), project: pids[e.project] ? e.project : null, tags: tags, billable: !!e.billable, start: Math.round(Number(e.start)), end: end == null ? null : Math.round(end) });
    });
    return d;
  }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function running(d) { for (var i = 0; i < d.entries.length; i++) if (d.entries[i].end == null) return d.entries[i]; return null; }
  function dur(e, now) { return Math.max(0, (e.end == null ? now : e.end) - e.start); }

  // ---------- timer ----------
  function stop(d, now) { var r = running(d); if (r) r.end = Math.max(r.start, now); return r; }
  function start(d, o, now) {
    stop(d, now);
    var p = o.project ? byId(d.projects, o.project) : null;
    var e = { id: uid(), desc: String(o.desc || "").slice(0, 500), project: p ? p.id : null, tags: (o.tags || []).slice(0, 20),
      billable: o.billable != null ? !!o.billable : p ? p.billable !== false : false, start: o.start || now, end: null };
    d.entries.unshift(e);
    addTags(d, e.tags);
    return e;
  }
  function addEntry(d, o) {
    var e = { id: uid(), desc: String(o.desc || "").slice(0, 500), project: o.project && byId(d.projects, o.project) ? o.project : null, tags: (o.tags || []).slice(0, 20),
      billable: !!o.billable, start: o.start, end: o.end };
    d.entries.push(e); sortEntries(d); addTags(d, e.tags);
    return e;
  }
  function sortEntries(d) { d.entries.sort(function (a, b) { return b.start - a.start; }); }
  function addTags(d, tags) {
    var have = {}; d.tags.forEach(function (t) { have[t.toLowerCase()] = 1; });
    (tags || []).forEach(function (t) { if (t && !have[t.toLowerCase()]) { have[t.toLowerCase()] = 1; d.tags.push(t); } });
  }

  // ---------- money ----------
  // Hourly rate for an entry: project rate, else its client's rate, else the default rate.
  function rateFor(d, e) {
    var p = e.project ? byId(d.projects, e.project) : null;
    if (p && p.rate != null) return p.rate;
    var c = p && p.client ? byId(d.clients, p.client) : null;
    if (c && c.rate != null) return c.rate;
    return d.settings.rate || 0;
  }
  function roundMs(ms, minutes, mode) {
    if (!minutes) return ms;
    var step = minutes * MIN;
    return mode === "nearest" ? Math.round(ms / step) * step : Math.ceil(ms / step) * step;
  }
  function money(v, cur) {
    try { return new Intl.NumberFormat("en", { style: "currency", currency: cur, currencyDisplay: "narrowSymbol" }).format(v || 0); }
    catch (e) { return (v || 0).toFixed(2) + " " + cur; }
  }
  function decimalsFor(cur) { try { return new Intl.NumberFormat("en", { style: "currency", currency: cur }).resolvedOptions().maximumFractionDigits; } catch (e) { return 2; } }
  function roundMoney(v, cur) { var k = Math.pow(10, decimalsFor(cur)); return Math.round(v * k) / k; }

  // ---------- reports ----------
  // f: {from, to (day keys, inclusive), client, project ("none" = no project), tag, billable ("yes"|"no"|"")}
  function filter(d, f, now) {
    var lo = f.from ? dayStart(f.from) : -Infinity, hi = f.to ? dayStart(addDays(f.to, 1)) : Infinity;
    return d.entries.filter(function (e) {
      if (e.start < lo || e.start >= hi) return false;
      if (f.project) { if (f.project === "none" ? e.project : e.project !== f.project) return false; }
      if (f.client) { var p = e.project ? byId(d.projects, e.project) : null; if (!p || p.client !== f.client) return false; }
      if (f.tag && e.tags.indexOf(f.tag) < 0) return false;
      if (f.billable === "yes" && !e.billable) return false;
      if (f.billable === "no" && e.billable) return false;
      if (f.q) { var q = f.q.toLowerCase(), p2 = e.project ? byId(d.projects, e.project) : null; if ((e.desc + " " + (p2 ? p2.name : "") + " " + e.tags.join(" ")).toLowerCase().indexOf(q) < 0) return false; }
      return true;
    });
  }
  function summarize(d, list, now) {
    var st = d.settings, out = { total: 0, billable: 0, amount: 0, count: list.length, byProject: {}, byClient: {}, byDay: {} };
    list.forEach(function (e) {
      var ms = roundMs(dur(e, now), st.round, st.roundMode), amt = e.billable ? ms / H * rateFor(d, e) : 0;
      var p = e.project ? byId(d.projects, e.project) : null, ck = p && p.client ? p.client : "", pk = p ? p.id : "", day = dayKey(e.start);
      out.total += ms; if (e.billable) out.billable += ms; out.amount += amt;
      var bp = out.byProject[pk] || (out.byProject[pk] = { id: pk, ms: 0, billable: 0, amount: 0 });
      bp.ms += ms; if (e.billable) bp.billable += ms; bp.amount += amt;
      var bc = out.byClient[ck] || (out.byClient[ck] = { id: ck, ms: 0, amount: 0 });
      bc.ms += ms; bc.amount += amt;
      out.byDay[day] = (out.byDay[day] || 0) + ms;
    });
    out.amount = roundMoney(out.amount, st.cur);
    return out;
  }
  // Weekly timesheet from week start key: rows [{project, days:[ms x7], total}], dayTotals, total.
  function timesheet(d, wk, now) {
    var days = []; for (var i = 0; i < 7; i++) days.push(addDays(wk, i));
    var rows = {}, dayTotals = [0, 0, 0, 0, 0, 0, 0], total = 0;
    filter(d, { from: days[0], to: days[6] }, now).forEach(function (e) {
      var i = days.indexOf(dayKey(e.start)); if (i < 0) return;
      var k = e.project || "", ms = dur(e, now);
      var r = rows[k] || (rows[k] = { project: k || null, days: [0, 0, 0, 0, 0, 0, 0], total: 0 });
      r.days[i] += ms; r.total += ms; dayTotals[i] += ms; total += ms;
    });
    var list = Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) { return b.total - a.total; });
    return { days: days, rows: list, dayTotals: dayTotals, total: total };
  }

  // ---------- CSV ----------
  function csvCell(v) {
    v = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(v) && !/^-?\d[\d.,:]*$/.test(v)) v = "'" + v;
    return /[",\n\r']/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function csv(rows) { return rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }
  function names(d, e) {
    var p = e.project ? byId(d.projects, e.project) : null, c = p && p.client ? byId(d.clients, p.client) : null;
    return { project: p ? p.name : "", client: c ? c.name : "" };
  }
  function exportDetailed(d, list, now) {
    var st = d.settings, rows = [["Date", "Start", "End", "Duration (h:mm:ss)", "Hours", "Description", "Project", "Client", "Tags", "Billable", "Rate", "Amount (" + st.cur + ")"]];
    list.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (e) {
      var n = names(d, e), ms = roundMs(dur(e, now), st.round, st.roundMode), rate = rateFor(d, e);
      rows.push([dayKey(e.start), hhmm(e.start), e.end == null ? "running" : hhmm(e.end), fmtDur(ms), fmtDur(ms, "dec"), e.desc, n.project, n.client, e.tags.join(", "),
        e.billable ? "Yes" : "No", e.billable ? rate : "", e.billable ? roundMoney(ms / H * rate, st.cur) : ""]);
    });
    return csv(rows);
  }
  function exportSummary(d, sum) {
    var st = d.settings, rows = [["Client", "Project", "Hours", "Billable hours", "Amount (" + st.cur + ")"]];
    Object.keys(sum.byProject).forEach(function (k) {
      var b = sum.byProject[k], p = k ? byId(d.projects, k) : null, c = p && p.client ? byId(d.clients, p.client) : null;
      rows.push([c ? c.name : "", p ? p.name : "(no project)", fmtDur(b.ms, "dec"), fmtDur(b.billable, "dec"), roundMoney(b.amount, st.cur)]);
    });
    rows.push(["Total", "", fmtDur(sum.total, "dec"), fmtDur(sum.billable, "dec"), sum.amount]);
    return csv(rows);
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
  // Import a Toggl Track "detailed" CSV export (or our own detailed CSV). Returns {added, skipped} or throws.
  function importCSV(d, text) {
    var rows = parseCSV(text);
    if (rows.length < 2) throw new Error("empty");
    var hd = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var col = function () { for (var i = 0; i < arguments.length; i++) { var k = hd.indexOf(arguments[i]); if (k >= 0) return k; } return -1; };
    var cDesc = col("description"), cProj = col("project"), cCli = col("client"), cTags = col("tags"), cBill = col("billable"),
      cSD = col("start date", "date"), cST = col("start time", "start"), cED = col("end date"), cET = col("end time", "end"), cDur = col("duration", "duration (h:mm:ss)");
    if (cSD < 0 || cST < 0 || (cET < 0 && cDur < 0)) throw new Error("columns");
    var seen = {}; d.entries.forEach(function (e) { seen[e.start + "|" + e.end + "|" + e.desc] = 1; });
    var added = 0, skipped = 0;
    rows.slice(1).forEach(function (r) {
      var get = function (i) { return i >= 0 ? String(r[i] || "").trim() : ""; };
      var sd = get(cSD), sdKey = /^\d{4}-\d{2}-\d{2}$/.test(sd) ? sd : null;
      if (!sdKey || !validDay(sdKey) || !/^\d{1,2}:\d{2}/.test(get(cST))) { skipped++; return; }
      var startMs = at(sdKey, get(cST)) + (/:\d{2}:(\d{2})/.exec(get(cST)) ? +/:\d{2}:(\d{2})/.exec(get(cST))[1] * 1000 : 0), endMs = NaN;
      if (cET >= 0 && /^\d{1,2}:\d{2}/.test(get(cET))) {
        var ed = /^\d{4}-\d{2}-\d{2}$/.test(get(cED)) ? get(cED) : sdKey;
        endMs = at(ed, get(cET)) + (/:\d{2}:(\d{2})/.exec(get(cET)) ? +/:\d{2}:(\d{2})/.exec(get(cET))[1] * 1000 : 0);
        if (endMs < startMs) endMs += 24 * H;
      } else if (cDur >= 0) { var du = parseDuration(get(cDur)); if (!isNaN(du)) endMs = startMs + du; }
      if (!isFinite(endMs)) { skipped++; return; }
      var desc = get(cDesc).slice(0, 500);
      if (seen[startMs + "|" + endMs + "|" + desc]) { skipped++; return; }
      seen[startMs + "|" + endMs + "|" + desc] = 1;
      var pid = null, pname = get(cProj);
      if (pname && pname !== "(no project)") {
        var cid = null, cname = get(cCli);
        if (cname) { var c = d.clients.filter(function (x) { return x.name.toLowerCase() === cname.toLowerCase(); })[0]; if (!c) { c = { id: uid(), name: cname.slice(0, 120), rate: null, info: "" }; d.clients.push(c); } cid = c.id; }
        var p = d.projects.filter(function (x) { return x.name.toLowerCase() === pname.toLowerCase() && (x.client || null) === cid; })[0];
        if (!p) { p = { id: uid(), name: pname.slice(0, 120), client: cid, color: COLORS[d.projects.length % COLORS.length], rate: null, billable: true, archived: false }; d.projects.push(p); }
        pid = p.id;
      }
      var tags = get(cTags) ? get(cTags).split(/\s*,\s*/).filter(Boolean) : [];
      addEntry(d, { desc: desc, project: pid, tags: tags, billable: /^(yes|true|1)$/i.test(get(cBill)), start: startMs, end: endMs });
      added++;
    });
    return { added: added, skipped: skipped };
  }

  // ---------- invoice ----------
  // Lines for an invoice from entries: by "project" (one line per project) or "entry" (one per entry). Billable only.
  function invoiceLines(d, list, by, now) {
    var st = d.settings, lines = [], groups = {};
    list.filter(function (e) { return e.billable && e.end != null; }).sort(function (a, b) { return a.start - b.start; }).forEach(function (e) {
      var ms = roundMs(dur(e, now), st.round, st.roundMode), rate = rateFor(d, e), n = names(d, e);
      if (by === "entry") { lines.push({ text: (e.desc || n.project || "Work") + (e.desc && n.project ? " · " + n.project : ""), date: dayKey(e.start), hours: ms / H, rate: rate }); return; }
      var k = (e.project || "") + "|" + rate, g = groups[k];
      if (!g) { g = groups[k] = { text: n.project || "Other work", hours: 0, rate: rate, from: dayKey(e.start), to: dayKey(e.start) }; lines.push(g); }
      g.hours += ms / H; g.to = dayKey(e.start);
    });
    lines.forEach(function (l) { l.hours = Math.round(l.hours * 100) / 100; l.amount = roundMoney(l.hours * l.rate, st.cur); });
    var sub = lines.reduce(function (a, l) { return a + l.amount; }, 0), tax = roundMoney(sub * (st.tax || 0) / 100, st.cur);
    return { lines: lines, subtotal: roundMoney(sub, st.cur), tax: tax, total: roundMoney(sub + tax, st.cur) };
  }

  // ---------- sample ----------
  function sample(now) {
    var d = newData(); d.settings.rate = 40; d.settings.cur = "USD";
    var c1 = { id: uid(), name: "Acme Ltd", rate: 50, info: "" }, c2 = { id: uid(), name: "Studio Nour", rate: null, info: "" };
    d.clients.push(c1, c2);
    var p1 = { id: uid(), name: "Website redesign", client: c1.id, color: COLORS[1], rate: null, billable: true, archived: false };
    var p2 = { id: uid(), name: "Brand guide", client: c2.id, color: COLORS[3], rate: 35, billable: true, archived: false };
    var p3 = { id: uid(), name: "Admin", client: null, color: COLORS[9], rate: null, billable: false, archived: false };
    d.projects.push(p1, p2, p3);
    var today = dayKey(now);
    var plan = [[0, "09:00", 95, p1, "Homepage layout", ["design"]], [0, "11:00", 50, p3, "Email and planning", []], [1, "09:30", 120, p1, "Contact form", ["dev"]],
      [1, "13:30", 75, p2, "Logo variations", ["design"]], [2, "10:00", 160, p2, "Colour palette and type", ["design"]], [3, "09:15", 140, p1, "Responsive fixes", ["dev"]],
      [3, "14:00", 40, p3, "Invoices", []], [4, "10:00", 110, p2, "Guide document", ["writing"]], [6, "09:00", 90, p1, "Client call and notes", ["meeting"]]];
    plan.forEach(function (x) {
      var k = addDays(today, -x[0]), s = at(k, x[1]), e = s + x[2] * MIN;
      if (e > now) return;
      addEntry(d, { desc: x[4], project: x[3].id, tags: x[5], billable: x[3].billable, start: s, end: e });
    });
    return d;
  }

  var API = {
    H: H, MIN: MIN, COLORS: COLORS, uid: uid, dayKey: dayKey, dayStart: dayStart, addDays: addDays, validDay: validDay, weekOf: weekOf, at: at, hhmm: hhmm,
    parseDuration: parseDuration, fmtDur: fmtDur, newData: newData, normalize: normalize, byId: byId, running: running, dur: dur,
    start: start, stop: stop, addEntry: addEntry, sortEntries: sortEntries, addTags: addTags, rateFor: rateFor, roundMs: roundMs, money: money, roundMoney: roundMoney,
    filter: filter, summarize: summarize, timesheet: timesheet, exportDetailed: exportDetailed, exportSummary: exportSummary, parseCSV: parseCSV, importCSV: importCSV,
    invoiceLines: invoiceLines, sample: sample, csv: csv
  };
  root.TimeCore = API;
  if (typeof module === "object" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
