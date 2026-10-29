/* Gantt UI. Everything stays in this browser (localStorage via S3.store). Scheduling lives in core.js. */
(function () {
  "use strict";
  var G = window.GanttCore, h = S3.h, $ = S3.$, $$ = S3.$$;
  var NS = "http://www.w3.org/2000/svg", FONT = "Arial, Helvetica, 'Noto Sans Arabic', sans-serif";
  var RH = 34, BH = 16;
  var ZOOM = { day: 30, week: 12, month: 3.6 };
  var P = null, S = null, sel = [], undoStack = [], redoStack = [], lastJSON = "", zoom = "week", showCrit = false, drag = null;
  var COLORS = ["#0e9f9a", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#ca8a04", "#16a34a", "#64748b"];

  function el(tag, attrs, kids) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs || {}) if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function fmtDate(key, short) {
    if (!key) return "";
    var d = new Date(G.dayNum(key) * 864e5);
    return d.toLocaleDateString("en", { timeZone: "UTC", weekday: short ? undefined : "short", day: "numeric", month: "short", year: short ? undefined : "2-digit" });
  }

  // ---------- storage, undo ----------
  function list() { return S3.store("gantt:list") || []; }
  function blank(p) { return !p.tasks.length && p.name === "New project"; }
  function saveNow() {
    if (!P) return;
    if (blank(P)) { S3.store("gantt:p:" + P.id, undefined); S3.store("gantt:list", list().filter(function (x) { return x.id !== P.id; })); return; }
    var ok = S3.store("gantt:p:" + P.id, P) !== undefined;
    var l = list().filter(function (x) { return x.id !== P.id; });
    l.unshift({ id: P.id, name: P.name, updated: P.updated, n: P.tasks.length });
    S3.store("gantt:list", l.slice(0, 100)); S3.store("gantt:open", P.id);
    if (!ok && !saveNow.warned) { saveNow.warned = true; S3.toast("Could not save in this browser (storage full or blocked). Use Save file.", "error"); }
  }
  var saveSoon = S3.debounce(saveNow, 300);
  function commit(msg) {
    var now = JSON.stringify(P);
    if (now === lastJSON) { render(); return; }
    undoStack.push(lastJSON); if (undoStack.length > 80) undoStack.shift();
    redoStack = []; lastJSON = now; P.updated = Date.now();
    saveSoon(); render();
    if (msg) S3.toast(msg);
  }
  function restore(json) {
    P = G.normalize(JSON.parse(json)); lastJSON = JSON.stringify(P);
    var ix = G.index(P); sel = sel.filter(function (id) { return ix[id] != null; });
    saveSoon(); render();
  }
  function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(P)); restore(undoStack.pop()); }
  function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(P)); restore(redoStack.pop()); }
  function openProject(p) {
    if (P) saveNow();
    P = p; sel = []; undoStack = []; redoStack = []; lastJSON = JSON.stringify(P);
    $("#pName").value = P.name;
    render(); saveNow();
    setTimeout(scrollToday, 0);
  }
  function loadProject(id) { var raw = S3.store("gantt:p:" + id); if (!raw) return null; try { return G.normalize(raw); } catch (e) { return null; } }

  // ---------- rows ----------
  function visibleRows() {
    var out = [], hideBelow = Infinity;
    P.tasks.forEach(function (t, i) {
      if (t.lvl > hideBelow) return;
      hideBelow = Infinity;
      out.push(i);
      if (t.col && G.isSummary(P, i)) hideBelow = t.lvl;
    });
    return out;
  }
  function selIdx() { var ix = G.index(P); return sel.map(function (id) { return ix[id]; }).filter(function (i) { return i != null; }).sort(function (a, b) { return a - b; }); }
  function current() { var s = selIdx(); return s.length ? s[s.length - 1] : -1; }

  // ---------- view range ----------
  function viewRange() {
    var lo = G.dayNum(S.start), hi = G.dayNum(S.finish);
    P.tasks.forEach(function (t) { var r = S.tasks[t.id]; lo = Math.min(lo, G.dayNum(r.start)); hi = Math.max(hi, G.dayNum(r.finish)); });
    if (P.baseline) Object.keys(P.baseline).forEach(function (k) { var b = P.baseline[k]; if (b && b.s) { lo = Math.min(lo, G.dayNum(b.s)); hi = Math.max(hi, G.dayNum(b.f)); } });
    var t = G.dayNum(G.today());
    if (t >= lo - 60 && t <= hi + 60) { lo = Math.min(lo, t); hi = Math.max(hi, t); }
    var pad = zoom === "month" ? 30 : zoom === "week" ? 14 : 5;
    lo -= pad; hi += pad * 2;
    if (zoom !== "day") lo -= ((lo % 7) + 7 + 4 - 1) % 7; // start on a Monday
    if (zoom === "month") { var d = new Date(lo * 864e5); lo = Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 864e5); }
    var minDays = zoom === "day" ? 45 : zoom === "week" ? 120 : 365;
    if (hi - lo < minDays) hi = lo + minDays;
    return { lo: lo, hi: hi, dw: ZOOM[zoom] };
  }

  // ---------- render ----------
  function render() {
    if (!P) return;
    S = G.schedule(P);
    $("#undoBtn").disabled = !undoStack.length; $("#redoBtn").disabled = !redoStack.length;
    $("#critBtn").setAttribute("aria-pressed", String(showCrit));
    $$("#zoom button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.z === zoom)); });
    $("#empty").hidden = P.tasks.length > 0;
    renderInfo();
    var rows = visibleRows(), V = viewRange();
    renderTable(rows);
    var W = (V.hi - V.lo) * V.dw, Hh = Math.max(rows.length * RH, 1);
    var scale = $("#scale"), chart = $("#chart");
    scale.setAttribute("width", W); scale.setAttribute("height", 52); chart.setAttribute("width", W); chart.setAttribute("height", Math.max(Hh, 200));
    scale.textContent = ""; chart.textContent = "";
    drawScale(scale, V, W);
    drawChart(chart, rows, V, { interactive: true, height: Math.max(Hh, 200) });
  }
  function renderInfo() {
    var info = $("#info"); info.textContent = "";
    if (!P.tasks.length) return;
    var crit = P.tasks.filter(function (t) { var r = S.tasks[t.id]; return !r.summary && r.critical; }).length;
    var add = function (label, val, cls) { info.appendChild(h("span", { "class": cls || "" }, [label + " ", h("b", { text: val })])); };
    add("Start", fmtDate(S.start)); add("Finish", fmtDate(S.finish)); add("Working days", String(S.workdays)); add("Tasks", String(P.tasks.length));
    add("Critical", crit + " task" + (crit === 1 ? "" : "s"));
    var done = P.tasks.filter(function (t, i) { return !G.isSummary(P, i); }), w = 0, c = 0;
    done.forEach(function (t) { var d = Math.max(1, t.dur); w += d; c += d * t.pct; });
    add("Complete", (w ? Math.round(c / w) : 0) + "%");
    if (P.baseline && P.baseline.at) {
      var bf = null; Object.keys(P.baseline).forEach(function (k) { var b = P.baseline[k]; if (b && b.f && (!bf || b.f > bf)) bf = b.f; });
      if (bf) {
        var v = S.cal.idx(G.addDays(S.finish, 1)) - S.cal.idx(G.addDays(bf, 1));
        add("vs baseline", v === 0 ? "on time" : (v > 0 ? "+" : "") + v + " working day" + (Math.abs(v) === 1 ? "" : "s"), v > 0 ? "late" : v < 0 ? "early" : "");
      }
    }
  }

  // ----- table -----
  var COLS = [["c-id", "#"], ["c-name", "Task"], ["c-dur", "Days"], ["c-start", "Start"], ["c-fin", "Finish"], ["c-pct", "%"], ["c-pred", "Predecessors"]];
  function tableWidth() { return $("#thead").getBoundingClientRect().width; }
  function renderTable(rows) {
    var th = $("#thead"); if (!th.childNodes.length) COLS.forEach(function (c) { th.appendChild(h("div", { "class": "gt-c " + c[0], text: c[1] })); });
    th.style.height = "52px";
    var tb = $("#tbody"); tb.textContent = "";
    var rowsMap = {}; P.tasks.forEach(function (t, i) { rowsMap[t.id] = i + 1; });
    var active = document.activeElement, keepFocus = active && active.dataset && active.dataset.f ? { id: active.closest(".gt-row") && active.closest(".gt-row").dataset.id, f: active.dataset.f } : null;
    rows.forEach(function (i) {
      var t = P.tasks[i], r = S.tasks[t.id], sum = r.summary;
      var row = h("div", { "class": "gt-row" + (sel.indexOf(t.id) >= 0 ? " sel" : "") + (sum ? " sum" : "") + (showCrit && r.critical && !sum ? " crit" : ""), "data-id": t.id });
      row.appendChild(h("div", { "class": "gt-c c-id", title: "Select (Shift: range, Ctrl: add)", text: String(i + 1) }));
      var name = inp("text", t.name, "name", { maxlength: 300, dir: "auto", "aria-label": "Task name" });
      name.style.paddingInlineStart = (6 + t.lvl * 16) + "px";
      row.appendChild(h("div", { "class": "gt-c c-name" }, [
        h("button", { "class": "gt-caret" + (sum ? "" : " leaf"), type: "button", tabindex: -1, "aria-label": t.col ? "Expand" : "Collapse", text: t.col ? "▶" : "▼",
          onclick: function () { t.col = !t.col; commit(); } }), name]));
      if (sum) {
        row.appendChild(h("div", { "class": "gt-c c-dur ro", text: String(r.dur) }));
        row.appendChild(h("div", { "class": "gt-c c-start ro", text: fmtDate(r.start, true) }));
        row.appendChild(h("div", { "class": "gt-c c-fin ro", text: fmtDate(r.finish, true) }));
        row.appendChild(h("div", { "class": "gt-c c-pct ro", text: r.pct + "%" }));
        row.appendChild(h("div", { "class": "gt-c c-pred ro" }));
      } else {
        row.appendChild(h("div", { "class": "gt-c c-dur" }, [inp("text", String(t.dur), "dur", { "aria-label": "Duration in working days", inputmode: "decimal" })]));
        row.appendChild(h("div", { "class": "gt-c c-start" }, [inp("date", r.start, "start", { "aria-label": "Start" })]));
        row.appendChild(h("div", { "class": "gt-c c-fin" }, [inp("date", r.finish, "fin", { "aria-label": "Finish" })]));
        row.appendChild(h("div", { "class": "gt-c c-pct" }, [inp("text", String(t.pct), "pct", { "aria-label": "Percent complete", inputmode: "numeric" })]));
        row.appendChild(h("div", { "class": "gt-c c-pred" }, [inp("text", G.fmtDeps(P, t, rowsMap), "pred", { "aria-label": "Predecessors", placeholder: "e.g. 2, 3SS+1" })]));
      }
      tb.appendChild(row);
    });
    if (keepFocus && keepFocus.id) {
      var again = tb.querySelector('.gt-row[data-id="' + keepFocus.id + '"] [data-f="' + keepFocus.f + '"]');
      if (again) again.focus();
    }
  }
  function inp(type, value, f, attrs) {
    var i = h("input", Object.assign({ type: type, "data-f": f, autocomplete: "off" }, attrs || {}));
    i.value = value == null ? "" : value;
    return i;
  }
  function onTableChange(e) {
    var i = e.target, f = i.dataset.f, row = i.closest(".gt-row"); if (!f || !row) return;
    var ix = G.index(P)[row.dataset.id], t = P.tasks[ix], cal = S.cal, r = S.tasks[t.id];
    if (f === "name") { t.name = i.value.trim().slice(0, 300) || "Task"; commit(); return; }
    if (f === "dur") { var d = G.parseDur(i.value, cal.wpw); if (isNaN(d)) { bad(i, "Duration in working days, like 5, 2w or 0 for a milestone"); return; } t.dur = d; commit(); return; }
    if (f === "pct") { var v = parseInt(String(i.value).replace(/[^\d]/g, ""), 10); if (!isFinite(v)) { bad(i, "Percent from 0 to 100"); return; } t.pct = Math.max(0, Math.min(100, v)); commit(); return; }
    if (f === "start") { if (!G.validDay(i.value)) { bad(i, "Pick a date"); return; } t.start = cal.next(i.value); commit(cal.next(i.value) !== i.value ? "Moved to the next working day" : null); return; }
    if (f === "fin") {
      if (!G.validDay(i.value)) { bad(i, "Pick a date"); return; }
      if (i.value < r.start) { bad(i, "Finish can't be before the start"); return; }
      t.dur = Math.max(t.dur === 0 ? 0 : 1, cal.idx(G.addDays(i.value, 1)) - cal.idx(r.start)); commit(); return;
    }
    if (f === "pred") {
      var deps = G.parseDeps(i.value);
      if (deps.error) { bad(i, "Use row numbers like 2, 3SS+1 or 4FF-2"); return; }
      var out = [], err = null;
      deps.forEach(function (d) {
        var q = P.tasks[d.row - 1];
        if (!q) err = "There is no row " + d.row;
        else if (G.isSummary(P, d.row - 1)) err = "Row " + d.row + " is a summary task; link to its subtasks";
        else if (q.id === t.id || G.wouldLoop(P, q.id, t.id)) err = "Row " + d.row + " would create a loop";
        else if (!out.some(function (o) { return o.id === q.id; })) out.push({ id: q.id, type: d.type, lag: d.lag });
      });
      if (err) { bad(i, err); return; }
      t.deps = out; commit();
    }
  }
  function bad(i, msg) { i.classList.add("bad"); S3.toast(msg, "error"); setTimeout(function () { render(); }, 1600); }
  function onTableKey(e) {
    var i = e.target, f = i.dataset && i.dataset.f, row = i.closest && i.closest(".gt-row"); if (!f || !row) return;
    var ix = G.index(P)[row.dataset.id];
    if (e.key === "Enter" && f === "name") { e.preventDefault(); i.blur(); addTask(false, ix); }
    else if (e.key === "Enter") { e.preventDefault(); i.blur(); }
    else if (e.key === "Tab" && f === "name") {
      e.preventDefault(); i.dispatchEvent(new Event("change", { bubbles: true }));
      sel = [P.tasks[ix].id];
      if (e.shiftKey) doOutdent(); else doIndent();
      focusName(P.tasks[G.index(P)[sel[0]]].id);
    } else if (e.key === "Escape") { i.blur(); render(); }
    else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); sel = [P.tasks[ix].id]; doMove(e.key === "ArrowUp" ? -1 : 1); focusName(sel[0]); }
  }
  function focusName(id) { var n = $('#tbody .gt-row[data-id="' + id + '"] [data-f="name"]'); if (n) { n.focus(); n.select(); } }
  function onTableClick(e) {
    var row = e.target.closest(".gt-row"); if (!row) return;
    var id = row.dataset.id;
    if (e.target.closest(".c-id")) {
      // the row re-renders on the first click, so detect the double click here
      var now = Date.now();
      if (lastId.id === id && now - lastId.t < 400 && !e.shiftKey && !e.ctrlKey && !e.metaKey) { lastId = { t: 0, id: null }; sel = [id]; markSel(); taskSheet(id); return; }
      lastId = { t: now, id: id };
      if (e.shiftKey && sel.length) {
        var ix = G.index(P), a = ix[sel[sel.length - 1]], b = ix[id], lo = Math.min(a, b), hi = Math.max(a, b);
        sel = P.tasks.slice(lo, hi + 1).map(function (t) { return t.id; });
      } else if (e.ctrlKey || e.metaKey) { sel = sel.indexOf(id) >= 0 ? sel.filter(function (x) { return x !== id; }) : sel.concat([id]); }
      else sel = [id];
      render(); return;
    }
    if (sel.length !== 1 || sel[0] !== id) { sel = [id]; markSel(); }
  }
  var lastId = { t: 0, id: null };
  function markSel() { $$("#tbody .gt-row").forEach(function (r) { r.classList.toggle("sel", sel.indexOf(r.dataset.id) >= 0); }); drawSelBands(); }

  // ----- scale -----
  function drawScale(svg, V, W) {
    var mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    svg.appendChild(el("line", { x1: 0, x2: W, y1: 26, y2: 26 }));
    var lastM = -1, lastY = -1;
    for (var n = V.lo; n < V.hi; n++) {
      var d = new Date(n * 864e5), x = (n - V.lo) * V.dw, m = d.getUTCMonth(), y = d.getUTCFullYear();
      if (zoom === "month") {
        if (y !== lastY) { svg.appendChild(el("text", { x: x + 4, y: 17, "class": "yr" }, [String(y)])); svg.appendChild(el("line", { x1: x, x2: x, y1: 0, y2: 52 })); lastY = y; }
        if (m !== lastM) { svg.appendChild(el("text", { x: x + 3, y: 43 }, [mon[m]])); svg.appendChild(el("line", { x1: x, x2: x, y1: 26, y2: 52 })); lastM = m; }
      } else {
        if (m !== lastM) { svg.appendChild(el("text", { x: x + 4, y: 17, "class": "yr" }, [mon[m] + " " + y])); svg.appendChild(el("line", { x1: x, x2: x, y1: 0, y2: 52 })); lastM = m; }
        if (zoom === "day") { svg.appendChild(el("text", { x: x + V.dw / 2, y: 43, "text-anchor": "middle" }, [String(d.getUTCDate())])); }
        else if (d.getUTCDay() === 1) { svg.appendChild(el("text", { x: x + 3, y: 43 }, [String(d.getUTCDate())])); svg.appendChild(el("line", { x1: x, x2: x, y1: 30, y2: 52 })); }
      }
    }
  }

  // ----- chart (screen and export) -----
  function barGeom(r, V) {
    var x = (G.dayNum(r.start) - V.lo) * V.dw, x2 = (G.dayNum(r.finish) + 1 - V.lo) * V.dw;
    return { x: x, w: Math.max(2, x2 - x) };
  }
  function drawChart(svg, rows, V, opts) {
    var W = (V.hi - V.lo) * V.dw, Hh = opts.height, cal = S.cal, ox = opts.ox || 0, oy = opts.oy || 0;
    var g = el("g", { transform: "translate(" + ox + " " + oy + ")" }); svg.appendChild(g);
    var bands = el("g", { "class": "bands" }); g.appendChild(bands);
    // weekends and holidays
    if (zoom !== "month") for (var n = V.lo; n < V.hi; n++) {
      if (!cal.isWorkNum(n)) {
        var hol = cal.we[((n % 7) + 7 + 4) % 7] ? "wkend" : "hol";
        g.appendChild(el("rect", { "class": hol, x: (n - V.lo) * V.dw, y: 0, width: V.dw, height: Hh, fill: opts.interactive ? null : hol === "wkend" ? "#f3f5f8" : "#fdf3dc" }));
      }
    }
    if (opts.interactive) svg._bands = bands;
    var t0 = G.dayNum(G.today());
    if (t0 >= V.lo && t0 <= V.hi) g.appendChild(el("line", { "class": "today", x1: (t0 - V.lo) * V.dw, x2: (t0 - V.lo) * V.dw, y1: 0, y2: Hh, stroke: opts.interactive ? null : "#dc2626", "stroke-width": 1.5 }));
    var rowOf = {}; rows.forEach(function (i, k) { rowOf[P.tasks[i].id] = k; });
    var CRIT = "#dc2626", INK = opts.interactive ? null : "#334155";
    // links
    var linkG = el("g", {}); g.appendChild(linkG);
    rows.forEach(function (i, k) {
      var t = P.tasks[i], r = S.tasks[t.id]; if (r.summary) return;
      t.deps.forEach(function (d) {
        var pk = rowOf[d.id]; if (pk == null) return;
        var q = S.tasks[d.id]; if (!q || q.summary) return;
        var a = barGeom(q, V), b = barGeom(r, V), y1 = pk * RH + RH / 2, y2 = k * RH + RH / 2;
        var fromEnd = d.type === "FS" || d.type === "FF", toEnd = d.type === "FF" || d.type === "SF";
        var x1 = q.milestone ? a.x : fromEnd ? a.x + a.w : a.x, x2 = r.milestone ? b.x : toEnd ? b.x + b.w : b.x;
        var dir1 = fromEnd ? 1 : -1, dir2 = toEnd ? 1 : -1, G1 = 8, path;
        var sx = x1 + dir1 * G1, ex = x2 + dir2 * G1;
        if (dir2 < 0 && ex >= sx) path = "M" + x1 + " " + y1 + "H" + sx + "V" + y2 + "H" + x2;
        else {
          var midY = y2 > y1 ? y2 - RH / 2 : y2 + RH / 2;
          if (dir1 === dir2) { var far = dir1 > 0 ? Math.max(sx, ex) : Math.min(sx, ex); path = "M" + x1 + " " + y1 + "H" + far + "V" + y2 + "H" + x2; }
          else path = "M" + x1 + " " + y1 + "H" + sx + "V" + midY + "H" + ex + "V" + y2 + "H" + x2;
        }
        var crit = showCrit && r.critical && q.critical, col = crit ? CRIT : opts.interactive ? "var(--text-3)" : "#64748b";
        linkG.appendChild(el("path", { d: path, fill: "none", stroke: col, "stroke-width": crit ? 1.6 : 1.2 }));
        var ah = 5, tipDir = -dir2;
        linkG.appendChild(el("path", { d: "M" + x2 + " " + y2 + "l" + (-tipDir * ah) + " " + (-ah * 0.8) + "v" + (ah * 1.6) + "Z", fill: col }));
      });
    });
    // bars
    rows.forEach(function (i, k) {
      var t = P.tasks[i], r = S.tasks[t.id], y = k * RH, b = barGeom(r, V);
      var crit = showCrit && r.critical, color = t.color || (opts.interactive ? null : "#0e9f9a");
      var bg = el("g", { "data-bar": r.summary ? null : t.id, "data-row": k, "class": sel.indexOf(t.id) >= 0 ? "on" : null }); g.appendChild(bg);
      if (P.baseline && P.baseline[t.id]) {
        var bl = P.baseline[t.id], bx = (G.dayNum(bl.s) - V.lo) * V.dw, bx2 = (G.dayNum(bl.f) + 1 - V.lo) * V.dw;
        bg.appendChild(el("rect", { x: bx, y: y + RH / 2 + BH / 2 + 1, width: Math.max(2, bx2 - bx), height: 4, rx: 2, fill: "#94a3b8", opacity: 0.8 }));
      }
      if (r.summary) {
        var sy = y + RH / 2 - 4, scol = crit ? CRIT : opts.interactive ? "var(--text)" : "#1e293b";
        bg.appendChild(el("path", { d: "M" + b.x + " " + (sy + 12) + "V" + sy + "H" + (b.x + b.w) + "V" + (sy + 12) + "l-6 -5H" + (b.x + 6) + "Z", fill: scol }));
      } else if (r.milestone) {
        var cx = b.x, cy = y + RH / 2, s = 8;
        bg.appendChild(el("path", { d: "M" + cx + " " + (cy - s) + "L" + (cx + s) + " " + cy + "L" + cx + " " + (cy + s) + "L" + (cx - s) + " " + cy + "Z", fill: crit ? CRIT : opts.interactive ? "var(--text)" : "#1e293b" }));
      } else {
        var by = y + (RH - BH) / 2, fill = crit ? CRIT : color;
        var main = el("rect", { x: b.x, y: by, width: b.w, height: BH, rx: 4, fill: fill, "fill-opacity": 0.35, stroke: fill, "stroke-width": 1 });
        if (!fill) { main.style.fill = "var(--accent)"; main.style.stroke = "var(--accent)"; }
        bg.appendChild(main);
        if (t.pct) {
          var pr = el("rect", { x: b.x, y: by, width: Math.max(1, b.w * t.pct / 100), height: BH, rx: 4, fill: fill });
          if (!fill) pr.style.fill = "var(--accent)";
          bg.appendChild(pr);
        }
        if (opts.interactive) {
          bg.appendChild(el("rect", { "data-res": t.id, x: b.x + b.w - 5, y: by - 2, width: 10, height: BH + 4, fill: "transparent" }));
          bg.appendChild(el("circle", { "class": "ldot", "data-link": t.id, cx: b.x + b.w + 10, cy: y + RH / 2, r: 5, fill: "#ffffff", stroke: "#0e9f9a", "stroke-width": 2 },
            [el("title", {}, ["Drag to another task to link them"])]));
        }
      }
      var label = (r.milestone ? fmtDate(r.start, true) + "  " : "") + (t.name || "") + (t.res ? "  [" + t.res + "]" : "");
      var lx = r.milestone ? b.x + 12 : b.x + b.w + (opts.interactive && !r.summary ? 20 : 6);
      bg.appendChild(el("text", { "class": "lbl", x: lx, y: y + RH / 2 + 4, "font-size": 11.5, fill: opts.interactive ? null : "#475569", "font-family": FONT }, [label]));
    });
    if (opts.interactive) drawSelBands();
    return W;
  }
  function drawSelBands() {
    var svg = $("#chart"), bands = svg._bands; if (!bands) return;
    bands.textContent = "";
    var rows = visibleRows();
    rows.forEach(function (i, k) { if (sel.indexOf(P.tasks[i].id) >= 0) bands.appendChild(el("rect", { "class": "rowsel", x: 0, y: k * RH, width: svg.getAttribute("width"), height: RH })); });
    $$("#chart [data-bar]").forEach(function (g) { g.classList.toggle("on", sel.indexOf(g.getAttribute("data-bar")) >= 0); });
  }

  // ---------- chart interactions ----------
  var lastTap = { t: 0, id: null }, pendingSheet = null;
  function chartPoint(e) { var r = $("#chart").getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function onChartDown(e) {
    var bar = e.target.closest("[data-bar]"), res = e.target.closest("[data-res]"), link = e.target.closest("[data-link]");
    var rows = visibleRows(), p = chartPoint(e);
    if (!bar && !res && !link) {
      var k = Math.floor(p.y / RH); if (rows[k] != null) { sel = [P.tasks[rows[k]].id]; markSel(); }
      return;
    }
    var id = (res || link || bar).getAttribute(res ? "data-res" : link ? "data-link" : "data-bar");
    if (sel.length !== 1 || sel[0] !== id) { sel = [id]; markSel(); }
    var now = Date.now();
    if (lastTap.id === id && now - lastTap.t < 380) {
      // open on the click that ends this tap, so that click can't land on the new window's buttons
      lastTap = { t: 0, id: null }; pendingSheet = id;
      setTimeout(function () { if (pendingSheet === id) { pendingSheet = null; taskSheet(id); } }, 700);
      return;
    }
    lastTap = { t: now, id: id };
    if (e.pointerType === "touch" && !link) return; // touch scrolls the chart; edit in the task window instead
    e.preventDefault();
    $("#chart").setPointerCapture(e.pointerId);
    drag = { mode: link ? "link" : res ? "res" : "move", id: id, x0: p.x, y0: p.y, moved: false, V: viewRange() };
    $("#chart").classList.add("dragging");
  }
  function onChartMove(e) {
    if (!drag) return;
    var p = chartPoint(e), dx = p.x - drag.x0;
    if (!drag.moved && Math.abs(dx) < 4 && Math.abs(p.y - drag.y0) < 4) return;
    drag.moved = true;
    var V = drag.V, t = P.tasks[G.index(P)[drag.id]], r = S.tasks[t.id], b = barGeom(r, V);
    var ghost = $("#chart .ghost");
    if (!ghost) { ghost = el("g", { "class": "ghost", "pointer-events": "none" }); $("#chart").appendChild(ghost); }
    ghost.textContent = "";
    var rows = visibleRows(), k = rows.indexOf(G.index(P)[t.id]), y = k * RH + (RH - BH) / 2;
    if (drag.mode === "link") {
      ghost.appendChild(el("path", { d: "M" + (b.x + b.w + 10) + " " + (k * RH + RH / 2) + "L" + p.x + " " + p.y, stroke: "#0e9f9a", "stroke-width": 2, "stroke-dasharray": "5 4", fill: "none" }));
      var tk = Math.floor(p.y / RH); drag.target = rows[tk] != null ? P.tasks[rows[tk]].id : null;
      if (drag.target) ghost.appendChild(el("rect", { x: 0, y: tk * RH, width: $("#chart").getAttribute("width"), height: RH, fill: "rgba(14,159,154,.10)" }));
      return;
    }
    var days = Math.round(dx / V.dw);
    drag.days = days;
    var gx = drag.mode === "move" ? b.x + days * V.dw : b.x, gw = drag.mode === "move" ? b.w : Math.max(V.dw, b.w + days * V.dw);
    ghost.appendChild(el("rect", { x: gx, y: y, width: gw, height: BH, rx: 4, fill: "rgba(14,159,154,.25)", stroke: "#0e9f9a", "stroke-dasharray": "4 3" }));
    var label = drag.mode === "move" ? fmtDate(G.keyOf(G.dayNum(r.start) + days), true) : fmtDate(G.keyOf(G.dayNum(r.finish) + days), true);
    ghost.appendChild(el("text", { x: gx, y: y - 4, "font-size": 11, fill: "#0e9f9a", "font-family": FONT }, [label]));
  }
  function onChartUp() {
    if (!drag) return;
    var dg = drag; drag = null;
    $("#chart").classList.remove("dragging");
    var gh = $("#chart .ghost"); if (gh) gh.remove();
    if (!dg.moved) return;
    var ix = G.index(P), t = P.tasks[ix[dg.id]], r = S.tasks[t.id], cal = S.cal;
    if (dg.mode === "link") {
      var target = dg.target;
      if (!target || target === t.id) return;
      var ti = ix[target];
      if (G.isSummary(P, ti)) { S3.toast("Link to a subtask, not a summary task", "error"); return; }
      if (G.wouldLoop(P, t.id, target)) { S3.toast("That link would create a loop", "error"); return; }
      var tt = P.tasks[ti];
      if (tt.deps.some(function (d) { return d.id === t.id; })) { S3.toast("Already linked"); return; }
      tt.deps.push({ id: t.id, type: "FS", lag: 0 }); sel = [target];
      commit("Linked: " + (ix[t.id] + 1) + " → " + (ti + 1));
      return;
    }
    if (!dg.days) return;
    if (dg.mode === "move") {
      var want = cal.next(G.keyOf(G.dayNum(r.start) + dg.days));
      t.start = want; commit();
      var after = S.tasks[t.id].start;
      if (after !== want) S3.toast("Starts " + fmtDate(after, true) + ": its predecessors finish later");
    } else {
      var fin = G.keyOf(G.dayNum(r.finish) + dg.days);
      t.dur = Math.max(1, cal.idx(G.addDays(fin, 1)) - cal.idx(r.start)); commit();
    }
  }

  // ---------- task operations ----------
  function addTask(milestone, afterIdx) {
    var i = afterIdx != null ? afterIdx : current();
    var lvl = i >= 0 ? P.tasks[i].lvl : 0, at = i >= 0 ? G.subtreeEnd(P, i) : P.tasks.length;
    if (i >= 0 && G.isSummary(P, i)) { lvl = P.tasks[i].lvl + 1; at = i + 1; }
    var t = G.newTask({ name: milestone ? "Milestone" : "New task", lvl: lvl, dur: milestone ? 0 : 1 });
    // start where the row above ends, so new tasks don't all pile up on the project start
    if (i >= 0) { var r = S.tasks[P.tasks[i].id]; if (r && !r.summary) t.start = S.cal.next(G.addDays(r.finish, r.milestone ? 0 : 1)); }
    P.tasks.splice(at, 0, t); sel = [t.id];
    commit();
    focusName(t.id);
  }
  function doIndent() { var s = selIdx(); if (!s.length) return; var changed = false; s.forEach(function (i) { changed = G.indent(P, i) || changed; }); if (!changed) { S3.toast("Can't indent: it needs a task above it at the same level"); return; } var n = G.cleanSummaryLinks(P); commit(n ? "Removed " + n + " link" + (n > 1 ? "s" : "") + " from the new summary task" : null); }
  function doOutdent() { var s = selIdx().reverse(); if (!s.length) return; var changed = false; s.forEach(function (i) { changed = G.outdent(P, i) || changed; }); if (changed) { var n = G.cleanSummaryLinks(P); commit(n ? "Removed " + n + " link" + (n > 1 ? "s" : "") + " from the new summary task" : null); } }
  function doMove(dir) { var i = current(); if (i < 0) return; if (G.move(P, i, dir)) commit(); }
  function doDelete() {
    var s = selIdx().reverse(); if (!s.length) return;
    var n = 0; s.forEach(function (i) { if (P.tasks[i] && sel.indexOf(P.tasks[i].id) >= 0) n += G.remove(P, i); });
    sel = []; commit("Deleted " + n + " task" + (n === 1 ? "" : "s") + ". Ctrl+Z to undo.");
  }
  function doLink() {
    var s = selIdx().filter(function (i) { return !G.isSummary(P, i); });
    if (s.length < 2) { S3.toast("Select two or more tasks (Shift+click the row numbers), then Link"); return; }
    var n = 0;
    for (var k = 1; k < s.length; k++) {
      var a = P.tasks[s[k - 1]], b = P.tasks[s[k]];
      if (!b.deps.some(function (d) { return d.id === a.id; }) && !G.wouldLoop(P, a.id, b.id)) { b.deps.push({ id: a.id, type: "FS", lag: 0 }); n++; }
    }
    commit(n ? "Linked " + n + " pair" + (n > 1 ? "s" : "") : "Already linked");
  }
  function doUnlink() {
    var ids = {}; sel.forEach(function (id) { ids[id] = 1; });
    var n = 0;
    P.tasks.forEach(function (t) { if (!ids[t.id]) return; var before = t.deps.length; t.deps = t.deps.filter(function (d) { return sel.length === 1 ? false : !ids[d.id]; }); n += before - t.deps.length; });
    commit(n ? "Removed " + n + " link" + (n > 1 ? "s" : "") : "No links to remove");
  }

  // ---------- sheets, menus ----------
  function sheet(title, body, buttons, opts) {
    opts = opts || {};
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": title });
    var form = h("form", { "class": "s3-sheet gt-sheet" }), foot = h("div", { "class": "foot" }), submit = null;
    form.appendChild(h("div", { "class": "row between" }, [h("h2", { text: title }), h("button", { "class": "btn ghost icon", type: "button", "aria-label": "Close", html: S3.icon("x"), onclick: close })]));
    form.appendChild(body);
    (buttons || []).forEach(function (b) {
      var x = h("button", { "class": "btn " + (b.cls || ""), type: b.submit ? "submit" : "button" }, [b.label]);
      if (b.submit) submit = b; else x.addEventListener("click", function () { if (b.run() !== false) close(); });
      foot.appendChild(x);
    });
    form.addEventListener("submit", function (e) { e.preventDefault(); if (submit && submit.run() !== false) close(); });
    form.appendChild(foot); m.appendChild(form);
    function close() { m.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    // a double tap opens this window on pointerdown; ignore the tap's own follow-up mouse event on the backdrop
    var opened = Date.now();
    m.addEventListener("mousedown", function (e) { if (e.target === m && Date.now() - opened > 400) close(); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(m);
    var f = form.querySelector(opts.focus || "input,select,textarea"); if (f) { f.focus(); if (f.select && f.type === "text") f.select(); }
    return { close: close };
  }
  function field(label, input) { return h("label", { "class": "field" }, [label, input]); }
  function taskSheet(id) {
    var ix = G.index(P)[id]; if (ix == null) return;
    var t = P.tasks[ix], r = S.tasks[t.id], sum = r.summary, rowsMap = {}; P.tasks.forEach(function (x, i) { rowsMap[x.id] = i + 1; });
    var name = h("input", { "class": "input", maxlength: 300, dir: "auto" }); name.value = t.name;
    var dur = h("input", { "class": "input", inputmode: "decimal" }); dur.value = t.dur;
    var start = h("input", { "class": "input", type: "date" }); start.value = t.start || "";
    var pct = h("input", { "class": "input", inputmode: "numeric" }); pct.value = t.pct;
    var pred = h("input", { "class": "input", placeholder: "e.g. 2, 3SS+1, 4FF-2" }); pred.value = G.fmtDeps(P, t, rowsMap);
    var res = h("input", { "class": "input", maxlength: 200, dir: "auto", placeholder: "People or teams" }); res.value = t.res;
    var notes = h("textarea", { "class": "textarea prose", rows: 3, dir: "auto", maxlength: 3000, style: "min-height:70px" }); notes.value = t.notes;
    var color = t.color, sw = h("div", { "class": "swr" });
    [null].concat(COLORS).forEach(function (c) {
      var b = h("button", { type: "button", title: c || "Default", "aria-pressed": String(c === color), onclick: function () { color = c; $$("button", sw).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); } });
      b.style.background = c || "linear-gradient(135deg, var(--accent) 50%, var(--surface) 50%)"; sw.appendChild(b);
    });
    var facts = "Row " + (ix + 1) + " · WBS " + r.wbs + " · " + fmtDate(r.start) + " – " + fmtDate(r.finish) + (sum ? "" : " · float " + r.float + " day" + (r.float === 1 ? "" : "s") + (r.critical ? " · on the critical path" : ""));
    var body = h("div", { "class": "stack" }, [h("p", { "class": "faint", text: facts }), field("Name", name)].concat(sum ? [] : [
      h("div", { "class": "g3" }, [field("Duration (working days)", dur), field("Not before", start), field("% complete", pct)]),
      field("Predecessors (row numbers)", pred)]).concat([field("Resources", res), h("div", { "class": "field" }, ["Bar colour", sw]), field("Notes", notes)]));
    sheet(sum ? "Summary task" : r.milestone ? "Milestone" : "Task", body, [
      { label: "Delete", cls: "danger left", run: function () { sel = [id]; doDelete(); } },
      { label: "Save", cls: "primary", submit: true, run: function () {
        var o = { name: name.value.trim().slice(0, 300) || "Task", res: res.value.trim().slice(0, 200), notes: notes.value.slice(0, 3000), color: color };
        if (!sum) {
          var d = G.parseDur(dur.value, S.cal.wpw); if (isNaN(d)) { S3.toast("Duration in working days, like 5, 2w or 0", "error"); return false; }
          var pc = parseInt(pct.value, 10); if (!isFinite(pc)) pc = 0;
          var deps = G.parseDeps(pred.value); if (deps.error) { S3.toast("Predecessors: use row numbers like 2, 3SS+1", "error"); return false; }
          var list2 = [];
          for (var k = 0; k < deps.length; k++) {
            var q = P.tasks[deps[k].row - 1];
            if (!q || q.id === t.id || G.isSummary(P, deps[k].row - 1) || G.wouldLoop(P, q.id, t.id)) { S3.toast("Row " + deps[k].row + " can't be a predecessor here", "error"); return false; }
            if (!list2.some(function (x) { return x.id === q.id; })) list2.push({ id: q.id, type: deps[k].type, lag: deps[k].lag });
          }
          o.dur = d; o.pct = Math.max(0, Math.min(100, pc)); o.deps = list2; o.start = G.validDay(start.value) ? S.cal.next(start.value) : null;
        }
        Object.assign(t, o); commit();
      } }], { focus: "input" });
  }
  var menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; document.removeEventListener("pointerdown", outside, true); } }
  function outside(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
  function menu(anchor, items) {
    closeMenu();
    menuEl = h("div", { "class": "gt-menu", role: "menu" });
    items.forEach(function (it) {
      if (it === "-") { menuEl.appendChild(h("div", { "class": "sep" })); return; }
      if (it.head) { menuEl.appendChild(h("div", { "class": "hd", text: it.head })); return; }
      menuEl.appendChild(h("button", { type: "button", role: "menuitem", onclick: function () { closeMenu(); it.run(); } }, [h("span", { dir: "auto", text: it.label })].concat(it.hint ? [h("small", { text: it.hint })] : [])));
    });
    document.body.appendChild(menuEl);
    var r = anchor.getBoundingClientRect();
    menuEl.style.left = Math.max(8, Math.min(window.innerWidth - menuEl.offsetWidth - 8, r.left)) + "px";
    menuEl.style.top = (r.bottom + 6) + "px";
    setTimeout(function () { document.addEventListener("pointerdown", outside, true); }, 0);
    var f = menuEl.querySelector("button"); if (f) f.focus();
  }
  function newMenu() {
    menu($("#newBtn"), [{ label: "Blank project", run: function () { openProject(G.newProject("New project", G.today())); } }, "-", { head: "Templates" },
      { label: "Website launch", run: function () { openProject(G.template("web", G.today())); } },
      { label: "Event plan", run: function () { openProject(G.template("event", G.today())); } }]);
  }
  function openMenu() {
    var items = [{ label: "Open a file…", hint: ".gantt.json", run: function () { pick(".json,application/json", openJSON); } },
      { label: "Import CSV…", hint: "ours or MS Project", run: function () { pick(".csv,text/csv", function (txt, f) { tryImport(function () { return G.importCSV(txt, f.name.replace(/\.csv$/i, "")); }); }); } },
      { label: "Open Microsoft Project XML…", hint: ".xml", run: function () { pick(".xml,text/xml,application/xml", function (txt) { tryImport(function () { return G.importMSPDI(txt); }); }); } },
      "-", { head: "Saved in this browser" }];
    list().forEach(function (x) {
      items.push({ label: (x.id === P.id ? "• " : "") + (x.name || "Project"), hint: (x.n || 0) + " tasks", run: function () { if (x.id === P.id) return; var p = loadProject(x.id); if (p) openProject(p); else S3.toast("Could not open it", "error"); } });
    });
    items.push("-", { label: "Delete this project…", run: function () {
      sheet("Delete “" + P.name + "”?", h("p", { "class": "muted", text: "This removes it from this browser. Save a file first if you might want it back." }), [
        { label: "Cancel", cls: "ghost", run: function () {} },
        { label: "Delete", cls: "danger", run: function () {
          S3.store("gantt:p:" + P.id, undefined); S3.store("gantt:list", list().filter(function (x) { return x.id !== P.id; }));
          var nx = list()[0], p = nx && loadProject(nx.id); P = null; openProject(p || G.newProject("New project")); S3.toast("Project deleted");
        } }]);
    } });
    menu($("#openBtn"), items);
  }
  function pick(accept, fn) {
    var i = h("input", { type: "file", accept: accept });
    i.addEventListener("change", function () { var f = i.files[0]; if (f) S3.readFile(f, "text").then(function (t) { fn(t, f); }).catch(function () { S3.toast("Could not read that file", "error"); }); });
    i.click();
  }
  function openJSON(txt) {
    try { var p = G.normalize(JSON.parse(txt)); if (list().some(function (x) { return x.id === p.id; }) || p.id === P.id) p.id = G.uid(); openProject(p); S3.toast("Opened " + p.name); }
    catch (e) { S3.toast("That file is not a Gantt project from this tool", "error"); }
  }
  function tryImport(fn) {
    try { var p = fn(); if (!p.tasks.length) throw new Error("none"); openProject(p); S3.toast("Imported " + p.tasks.length + " tasks. Check the weekend and holidays in project settings."); S3.done(); }
    catch (e) { S3.toast("Could not read tasks from that file", "error"); }
  }
  function baselineMenu() {
    var items = [{ label: P.baseline ? "Update baseline to the current plan" : "Save baseline (current plan)", run: function () { G.setBaseline(P); commit("Baseline saved. Grey bars show it under each task."); } }];
    if (P.baseline) items.push({ label: "Clear baseline", run: function () { P.baseline = null; commit("Baseline cleared"); } });
    menu($("#baseBtn"), items);
  }
  function settingsSheet() {
    var name = h("input", { "class": "input", maxlength: 120, dir: "auto" }); name.value = P.name;
    var start = h("input", { "class": "input", type: "date" }); start.value = P.start;
    var key = Object.keys(G.WEEKENDS).filter(function (k) { return G.WEEKENDS[k].slice().sort().join() === P.weekend.slice().sort().join(); })[0] || "satsun";
    var we = h("select", { "class": "select" }, [["satsun", "Saturday and Sunday"], ["frisat", "Friday and Saturday"], ["sun", "Sunday only"], ["fri", "Friday only"], ["none", "No weekend (7-day week)"]].map(function (o) {
      var op = h("option", { value: o[0] }, [o[1]]); if (o[0] === key) op.selected = true; return op; }));
    var hol = h("textarea", { "class": "textarea", rows: 4, placeholder: "One date per line, e.g. 2026-12-25", style: "min-height:90px" }); hol.value = P.holidays.join("\n");
    sheet("Project settings", h("div", { "class": "stack" }, [field("Project name", name), h("div", { "class": "grid-2" }, [field("Project start", start), field("Weekend (non-working days)", we)]),
      field("Holidays (non-working days)", hol),
      h("p", { "class": "faint", text: "Durations count working days only. Tasks without links start on the project start or on their own 'not before' date." })]), [
      { label: "Cancel", cls: "ghost", run: function () {} },
      { label: "Save", cls: "primary", submit: true, run: function () {
        var hs = hol.value.split(/[\s,;]+/).filter(Boolean), badH = hs.filter(function (x) { return !G.validDay(x); });
        if (badH.length) { S3.toast("Holiday dates must look like 2026-12-25 (" + badH[0] + ")", "error"); return false; }
        if (!G.validDay(start.value)) { S3.toast("Pick the project start date", "error"); return false; }
        P.name = name.value.trim() || "Project"; P.start = start.value; P.weekend = G.WEEKENDS[we.value].slice(); P.holidays = hs;
        $("#pName").value = P.name; commit();
      } }]);
  }
  function helpSheet() {
    var keys = [["Enter", "In a task name: add a task below"], ["Tab / Shift+Tab", "Indent / outdent (subtasks)"], ["Alt+↑ / Alt+↓", "Move the task up or down"], ["Delete", "Delete selected tasks (outside a field)"],
      ["Ctrl+Z / Ctrl+Y", "Undo / redo"], ["Ctrl+S", "Save file"], ["Shift+click #", "Select a range of rows"], ["Double-click a bar", "Open the task window"], ["?", "This help"]];
    var grid = h("div", { "class": "keys" });
    keys.forEach(function (k) { grid.appendChild(h("kbd", { text: k[0] })); grid.appendChild(h("span", { text: k[1] })); });
    sheet("Shortcuts and tips", h("div", { "class": "stack" }, [grid,
      h("p", { "class": "faint", text: "Drag a bar to move it, drag its right end to change the duration, and drag the dot after it onto another task to link them. Predecessors use row numbers: 2 (finish-to-start), 3SS+1 (start-to-start, 1 day lag), 4FF-2 (finish-to-finish, 2 days lead)." })]),
      [{ label: "Close", cls: "primary", submit: true, run: function () {} }]);
  }

  // ---------- export ----------
  function fileBase() { return (P.name || "project").replace(/[^\w\u0600-\u06FF\- ]+/g, "").trim().replace(/\s+/g, "-") || "project"; }
  function exportSVG() {
    var rows = P.tasks.map(function (t, i) { return i; }), V = viewRange(), W = (V.hi - V.lo) * V.dw, TW = 420, HD = 52, Hh = rows.length * RH;
    var svg = el("svg", { xmlns: NS, width: TW + W, height: HD + Hh + 2, viewBox: "0 0 " + (TW + W) + " " + (HD + Hh + 2), "font-family": FONT });
    svg.appendChild(el("rect", { x: 0, y: 0, width: TW + W, height: HD + Hh + 2, fill: "#ffffff" }));
    svg.appendChild(el("rect", { x: 0, y: 0, width: TW + W, height: HD, fill: "#f1f5f9" }));
    var scale = el("g", { transform: "translate(" + TW + " 0)" }); svg.appendChild(scale); drawScale(scale, V, W);
    $$("text", scale).forEach(function (n) { n.setAttribute("fill", n.getAttribute("class") === "yr" ? "#0f172a" : "#475569"); n.setAttribute("font-size", 11); });
    $$("line", scale).forEach(function (n) { n.setAttribute("stroke", "#cbd5e1"); });
    [["#", 8], ["Task", 34], ["Days", 250], ["Start", 290], ["Finish", 356]].forEach(function (c) { svg.appendChild(el("text", { x: c[1], y: 42, "font-size": 11, "font-weight": "bold", fill: "#64748b" }, [c[0]])); });
    rows.forEach(function (i, k) {
      var t = P.tasks[i], r = S.tasks[t.id], y = HD + k * RH + RH / 2 + 4, bold = r.summary ? "bold" : null;
      svg.appendChild(el("line", { x1: 0, x2: TW + W, y1: HD + (k + 1) * RH, y2: HD + (k + 1) * RH, stroke: "#eef2f6" }));
      svg.appendChild(el("text", { x: 8, y: y, "font-size": 11, fill: "#94a3b8" }, [String(i + 1)]));
      var nm = t.name.length > 34 - t.lvl * 2 ? t.name.slice(0, 33 - t.lvl * 2) + "…" : t.name;
      svg.appendChild(el("text", { x: 34 + t.lvl * 12, y: y, "font-size": 12, "font-weight": bold, fill: "#0f172a" }, [nm]));
      svg.appendChild(el("text", { x: 250, y: y, "font-size": 12, fill: "#334155" }, [String(r.dur)]));
      svg.appendChild(el("text", { x: 290, y: y, "font-size": 12, fill: "#334155" }, [fmtDate(r.start, true)]));
      svg.appendChild(el("text", { x: 356, y: y, "font-size": 12, fill: "#334155" }, [fmtDate(r.finish, true)]));
    });
    svg.appendChild(el("line", { x1: TW, x2: TW, y1: 0, y2: HD + Hh, stroke: "#cbd5e1" }));
    var keepSel = sel; sel = [];
    drawChart(svg, rows, V, { interactive: false, height: Hh, ox: TW, oy: HD });
    sel = keepSel;
    return { str: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg), w: TW + W, h: HD + Hh + 2 };
  }
  function toCanvas(out, scale) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(new Blob([out.str], { type: "image/svg+xml" })), img = new Image();
      img.onload = function () {
        var k = Math.min(scale, 12000 / out.w, 12000 / out.h), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(out.w * k)); c.height = Math.max(1, Math.round(out.h * k));
        var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("render")); };
      img.src = url;
    });
  }
  function pdfWithJpeg(jpeg, iw, ih, pw, ph) {
    var enc = new TextEncoder(), parts = [], off = [], len = 0;
    function add(x) { var b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; }
    function obj(n, f) { off[n] = len; add(n + " 0 obj\n"); f(); add("\nendobj\n"); }
    var content = "q " + pw.toFixed(2) + " 0 0 " + ph.toFixed(2) + " 0 0 cm /Im0 Do Q";
    add("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    obj(1, function () { add("<< /Type /Catalog /Pages 2 0 R >>"); });
    obj(2, function () { add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"); });
    obj(3, function () { add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pw.toFixed(2) + " " + ph.toFixed(2) + "] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>"); });
    obj(4, function () { add("<< /Type /XObject /Subtype /Image /Width " + iw + " /Height " + ih + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n"); add(jpeg); add("\nendstream"); });
    obj(5, function () { add("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream"); });
    var xref = len, x = "xref\n0 6\n0000000000 65535 f \n";
    for (var i = 1; i <= 5; i++) x += String(off[i]).padStart(10, "0") + " 00000 n \n";
    add(x + "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
    var outB = new Uint8Array(len), o = 0; parts.forEach(function (p) { outB.set(p, o); o += p.length; }); return outB;
  }
  function exportMenu() {
    menu($("#exportBtn"), [
      { label: "PNG image", hint: "whole chart", run: function () { exp("png"); } },
      { label: "PDF", hint: "image in PDF", run: function () { exp("pdf"); } },
      { label: "SVG (vector)", run: function () { exp("svg"); } },
      { label: "CSV (spreadsheet)", hint: "Excel, Sheets", run: function () { S3.download(G.exportCSV(P), fileBase() + ".csv", "text/csv"); S3.done(); } }]);
  }
  function exp(kind) {
    if (!P.tasks.length) { S3.toast("Add some tasks first"); return; }
    var out = exportSVG();
    if (kind === "svg") { S3.download(new Blob([out.str], { type: "image/svg+xml" }), fileBase() + ".svg"); S3.done(); return; }
    toCanvas(out, 2).then(function (c) {
      return new Promise(function (res) { c.toBlob(res, kind === "png" ? "image/png" : "image/jpeg", 0.92); }).then(function (bl) {
        if (kind === "png") { S3.download(bl, fileBase() + ".png"); S3.done(); return; }
        return bl.arrayBuffer().then(function (buf) {
          S3.download(new Blob([pdfWithJpeg(new Uint8Array(buf), c.width, c.height, out.w * 0.75, out.h * 0.75)], { type: "application/pdf" }), fileBase() + ".pdf"); S3.done();
        });
      });
    }).catch(function () { S3.toast("Export failed in this browser", "error"); });
  }
  function saveFile() { saveNow(); S3.download(JSON.stringify(P, null, 1), fileBase() + ".gantt.json", "application/json"); S3.done(); }
  function scrollToday() {
    if (!P || !P.tasks.length) return;
    var V = viewRange(), sc = $("#scroll"), t0 = G.dayNum(G.today()), first = G.dayNum(S.start);
    var target = t0 >= V.lo && t0 <= V.hi ? t0 : first;
    sc.scrollLeft = Math.max(0, (target - V.lo) * V.dw - 120);
  }

  // ---------- self-test ----------
  window.S3_SELFTEST = function () {
    try {
      var p = G.template("web", "2026-11-02"), s = G.schedule(p), ok = true;
      p.tasks.forEach(function (t) {
        var r = s.tasks[t.id]; ok = ok && G.validDay(r.start) && r.finish >= r.start;
        if (!r.summary) t.deps.forEach(function (d) { var q = s.tasks[d.id]; ok = ok && (d.type !== "FS" || q.milestone || q.finish < r.start); });
      });
      ok = ok && Object.keys(s.tasks).some(function (k) { return s.tasks[k].critical; });
      var back = G.importCSV(G.exportCSV(p), "x"), s2 = G.schedule(back);
      ok = ok && back.tasks.length === p.tasks.length && s2.finish === s.finish;
      var xml = '<Project xmlns="http://schemas.microsoft.com/project"><MinutesPerDay>480</MinutesPerDay><Tasks><Task><UID>1</UID><ID>1</ID><Name>A</Name><OutlineLevel>1</OutlineLevel><Start>2026-11-02T08:00:00</Start><Duration>PT16H0M0S</Duration></Task><Task><UID>2</UID><ID>2</ID><Name>B</Name><OutlineLevel>1</OutlineLevel><Start>2026-11-04T08:00:00</Start><Duration>PT8H0M0S</Duration><PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type></PredecessorLink></Task></Tasks></Project>';
      var m = G.importMSPDI(xml), sm = G.schedule(m);
      ok = ok && m.tasks.length === 2 && sm.tasks[m.tasks[1].id].start === "2026-11-04";
      return Promise.resolve(ok && !!$("#chart"));
    } catch (e) { return Promise.resolve(false); }
  };

  // ---------- start ----------
  function start() {
    $("#tbody").addEventListener("change", onTableChange);
    $("#tbody").addEventListener("keydown", onTableKey);
    $("#tbody").addEventListener("click", onTableClick);
    $("#tbody").addEventListener("focusin", function (e) { var row = e.target.closest(".gt-row"); if (row && (sel.length !== 1 || sel[0] !== row.dataset.id)) { sel = [row.dataset.id]; markSel(); } });
    var ch = $("#chart");
    ch.addEventListener("pointerdown", onChartDown); ch.addEventListener("pointermove", onChartMove);
    ch.addEventListener("pointerup", onChartUp); ch.addEventListener("pointercancel", onChartUp);
    ch.addEventListener("click", function () { if (pendingSheet) { var id = pendingSheet; pendingSheet = null; taskSheet(id); } });
    $("#pName").addEventListener("change", function () { P.name = $("#pName").value.trim() || "Project"; $("#pName").value = P.name; commit(); });
    $("#newBtn").addEventListener("click", newMenu); $("#openBtn").addEventListener("click", openMenu);
    $("#saveBtn").addEventListener("click", saveFile); $("#exportBtn").addEventListener("click", exportMenu);
    $("#undoBtn").addEventListener("click", undo); $("#redoBtn").addEventListener("click", redo);
    $("#setBtn").addEventListener("click", settingsSheet); $("#helpBtn").addEventListener("click", helpSheet);
    $("#addTask").addEventListener("click", function () { addTask(false); }); $("#addMile").addEventListener("click", function () { addTask(true); });
    $("#inBtn").addEventListener("click", doIndent); $("#outBtn").addEventListener("click", doOutdent);
    $("#upBtn").addEventListener("click", function () { doMove(-1); }); $("#downBtn").addEventListener("click", function () { doMove(1); });
    $("#linkBtn").addEventListener("click", doLink); $("#unlinkBtn").addEventListener("click", doUnlink);
    $("#delBtn").addEventListener("click", doDelete);
    $("#editBtn").addEventListener("click", function () { var i = current(); if (i < 0) S3.toast("Select a task first"); else taskSheet(P.tasks[i].id); });
    $$("#zoom button").forEach(function (b) { b.addEventListener("click", function () { zoom = b.dataset.z; render(); scrollToday(); }); });
    $("#todayBtn").addEventListener("click", scrollToday);
    $("#critBtn").addEventListener("click", function () { showCrit = !showCrit; render(); });
    $("#baseBtn").addEventListener("click", baselineMenu);
    var eb = $("#emptyBtns");
    eb.appendChild(h("button", { "class": "btn primary small", type: "button", onclick: function () { addTask(false); } }, ["Add the first task"]));
    eb.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { openProject(G.template("web", G.today())); } }, ["Website launch"]));
    eb.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { openProject(G.template("event", G.today())); } }, ["Event plan"]));
    document.addEventListener("keydown", function (e) {
      if ($(".s3-modal")) return;
      if (menuEl && e.key === "Escape") { closeMenu(); return; }
      var mod = e.ctrlKey || e.metaKey, typing = /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || "");
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveFile(); return; }
      if (typing) return;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (mod || e.altKey) return;
      if (e.key === "Delete" || e.key === "Backspace") { if (sel.length) { e.preventDefault(); doDelete(); } }
      else if (e.key === "?") helpSheet();
      else if (e.key === "Enter" && sel.length === 1) { e.preventDefault(); taskSheet(sel[0]); }
    });
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") saveNow(); });
    var id = S3.store("gantt:open"), p = (id && loadProject(id)) || (list()[0] && loadProject(list()[0].id));
    openProject(p || G.newProject("New project", G.today()));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
