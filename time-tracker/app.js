/* Time Tracker UI. Everything stays in this browser (localStorage via S3.store). Logic lives in core.js. */
(function () {
  "use strict";
  var T = window.TimeCore, h = S3.h, $ = S3.$, $$ = S3.$$;
  var D = null, view = "log", undoStack = [], tick = null, weekKey = null, logDays = 14;
  var timerTags = [], timerBill = false;

  // ---------- storage / undo ----------
  function save() {
    if (S3.store("tt:data", D) === undefined && !save.warned) { save.warned = true; S3.toast("Could not save in this browser (storage full or blocked). Download a backup.", "error"); }
  }
  function change(fn, label) {
    var snap = JSON.stringify(D);
    if (fn() === false) return;
    undoStack.push(snap); if (undoStack.length > 50) undoStack.shift();
    save(); render(); if (label) S3.toast(label);
  }
  function undo() { if (!undoStack.length) return; D = T.normalize(JSON.parse(undoStack.pop())); save(); syncTimerBar(); render(); S3.toast("Undone"); }

  // ---------- format ----------
  function now() { return Date.now(); }
  function money(v) { return T.money(v, D.settings.cur); }
  function time(ms) {
    var d = new Date(ms);
    if (D.settings.clock === 12) { var hh = d.getHours() % 12 || 12; return hh + ":" + ("0" + d.getMinutes()).slice(-2) + (d.getHours() < 12 ? " am" : " pm"); }
    return T.hhmm(ms);
  }
  function dayLabel(key) {
    var t = T.dayKey(now());
    if (key === t) return "Today";
    if (key === T.addDays(t, -1)) return "Yesterday";
    return new Date(T.dayStart(key)).toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short", year: key.slice(0, 4) === t.slice(0, 4) ? undefined : "numeric" });
  }
  function proj(id) { return id ? T.byId(D.projects, id) : null; }
  function client(id) { return id ? T.byId(D.clients, id) : null; }
  function option(v, text, sel) { var o = h("option", { value: v }, [text]); if (sel) o.selected = true; return o; }
  function projectSelect(sel, current, opts) {
    opts = opts || {};
    sel.textContent = "";
    sel.appendChild(option("", opts.any ? "All projects" : "No project", !current));
    if (opts.any) sel.appendChild(option("none", "Without project", current === "none"));
    var groups = {};
    D.projects.forEach(function (p) { if (p.archived && p.id !== current && !opts.any) return; var c = client(p.client), k = c ? c.name : ""; (groups[k] = groups[k] || []).push(p); });
    Object.keys(groups).sort().forEach(function (k) {
      var parent = k ? h("optgroup", { label: k }) : sel;
      groups[k].forEach(function (p) { parent.appendChild(option(p.id, p.name + (p.archived ? " (archived)" : ""), p.id === current)); });
      if (k) sel.appendChild(parent);
    });
    return sel;
  }
  function amt(str) { var v = Number(String(str || "").replace(/[\u0660-\u0669]/g, function (c) { return c.charCodeAt(0) - 0x660; }).replace(/,/g, ".").replace(/[^\d.]/g, "")); return str === "" || str == null ? null : isFinite(v) ? v : NaN; }

  // ---------- sheets / popovers ----------
  function sheet(title, body, buttons, opts) {
    opts = opts || {};
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": title });
    var form = h("form", { "class": "s3-sheet tt-sheetm" + (opts.wide ? " wide" : "") }), foot = h("div", { "class": "foot" });
    form.appendChild(h("div", { "class": "row between" }, [h("h2", { text: title }), h("button", { "class": "btn ghost icon", type: "button", "aria-label": "Close", html: S3.icon("x"), onclick: close })]));
    form.appendChild(body);
    var submit = null;
    (buttons || []).forEach(function (b) {
      var el = h("button", { "class": "btn " + (b.cls || ""), type: b.submit ? "submit" : "button" }, [b.label]);
      if (b.submit) submit = b; else el.addEventListener("click", function () { if (b.run() !== false) close(); });
      foot.appendChild(el);
    });
    form.addEventListener("submit", function (e) { e.preventDefault(); if (submit && submit.run() !== false) close(); });
    form.appendChild(foot); m.appendChild(form);
    var opener = document.activeElement;
    function close() { m.remove(); document.removeEventListener("keydown", onKey, true); if (opener && opener.focus && document.contains(opener)) opener.focus(); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    m.addEventListener("mousedown", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(m);
    var f = opts.focus ? $(opts.focus, form) : form.querySelector("input:not([type=checkbox]):not([type=color]),select,textarea");
    if (f) { f.focus(); if (f.select && f.tagName === "INPUT") f.select(); }
    return { el: form, close: close };
  }
  function field(label, input) { return h("label", { "class": "field" }, [label, input]); }
  function tagPicker(selected, onChange) {
    var box = h("div", { "class": "stack", style: "gap:8px" }), list = h("div", { "class": "tagpick" });
    var inp = h("input", { "class": "input", maxlength: 60, placeholder: "New tag, then Enter", dir: "auto" });
    function draw() {
      list.textContent = "";
      D.tags.concat(selected.filter(function (t) { return D.tags.indexOf(t) < 0; })).forEach(function (t) {
        list.appendChild(h("button", { "class": "btn small", type: "button", "aria-pressed": String(selected.indexOf(t) >= 0), onclick: function () {
          var i = selected.indexOf(t); if (i >= 0) selected.splice(i, 1); else selected.push(t); onChange(selected); draw();
        } }, ["#" + t]));
      });
      if (!list.childNodes.length) list.appendChild(h("span", { "class": "faint", text: "No tags yet." }));
    }
    inp.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault(); e.stopPropagation();
      var t = inp.value.trim().replace(/^#/, "").slice(0, 60); if (!t) return;
      if (selected.indexOf(t) < 0) selected.push(t);
      inp.value = ""; onChange(selected); draw();
    });
    draw();
    box.appendChild(list); box.appendChild(inp);
    return box;
  }
  var pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; document.removeEventListener("pointerdown", outside, true); } }
  function outside(e) { if (pop && !pop.contains(e.target) && e.target !== $("#tTags") && !$("#tTags").contains(e.target)) closePop(); }

  // ---------- timer bar ----------
  function syncTimerBar() {
    var r = T.running(D);
    projectSelect($("#tProj"), r ? r.project : $("#tProj").value || "");
    if (r) { $("#tDesc").value = r.desc; timerTags = r.tags.slice(); timerBill = r.billable; $("#tProj").value = r.project || ""; }
    $("#tBill").setAttribute("aria-pressed", String(timerBill));
    $("#tTagsN").textContent = timerTags.length ? String(timerTags.length) : "";
    $("#timerBar").classList.toggle("on", !!r);
    $("#tGo").textContent = r ? "Stop" : "Start";
    clearInterval(tick);
    if (r) tick = setInterval(updateClock, 1000);
    updateClock();
  }
  function updateClock() {
    var r = T.running(D);
    var txt = r ? T.fmtDur(T.dur(r, now())) : "0:00:00";
    $("#tTime").textContent = txt;
    document.title = r ? txt + " · " + (r.desc || (proj(r.project) || {}).name || "Timer running") : "Time Tracker — Free Timer, Timesheet and Invoices | S3eidat Tools";
    var row = $(".tt-row.run .tt-dur"); if (row && r) row.textContent = txt;
  }
  function startStop() {
    closePop();
    var r = T.running(D);
    if (r) {
      change(function () { T.stop(D, now()); }, "Stopped · " + T.fmtDur(T.dur(r, now())));
      $("#tDesc").value = ""; timerTags = []; timerBill = false;
      S3.done();
    } else {
      var p = proj($("#tProj").value);
      change(function () { T.start(D, { desc: $("#tDesc").value.trim(), project: p ? p.id : null, tags: timerTags.slice(), billable: timerBill || (p ? p.billable !== false && (p.rate != null || (client(p.client) || {}).rate != null || D.settings.rate > 0) : false) }, now()); });
    }
    syncTimerBar();
  }
  function liveEdit(fn) { var r = T.running(D); if (r) change(function () { fn(r); }); }
  function wireTimer() {
    $("#timerBar").addEventListener("submit", function (e) { e.preventDefault(); startStop(); });
    $("#tDesc").addEventListener("change", function () { var v = $("#tDesc").value.trim(); liveEdit(function (r) { r.desc = v; }); });
    $("#tProj").addEventListener("change", function () {
      var p = proj($("#tProj").value);
      if (!T.running(D) && p) { timerBill = p.billable !== false && (p.rate != null || (client(p.client) || {}).rate != null || D.settings.rate > 0); $("#tBill").setAttribute("aria-pressed", String(timerBill)); }
      liveEdit(function (r) { r.project = p ? p.id : null; });
    });
    $("#tBill").addEventListener("click", function () { timerBill = !timerBill; $("#tBill").setAttribute("aria-pressed", String(timerBill)); liveEdit(function (r) { r.billable = timerBill; }); });
    $("#tTags").addEventListener("click", function () {
      if (pop) { closePop(); return; }
      pop = h("div", { "class": "tt-pop" }, [h("b", { text: "Tags" }), tagPicker(timerTags, function (sel) {
        timerTags = sel.slice(); $("#tTagsN").textContent = timerTags.length ? String(timerTags.length) : "";
        liveEdit(function (r) { r.tags = timerTags.slice(); T.addTags(D, r.tags); });
        if (!T.running(D)) { T.addTags(D, timerTags); save(); }
      })]);
      document.body.appendChild(pop);
      var r = $("#tTags").getBoundingClientRect();
      pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left)) + "px";
      pop.style.top = (r.bottom + 6) + "px";
      setTimeout(function () { document.addEventListener("pointerdown", outside, true); }, 0);
      var i = $("input", pop); if (i) i.focus();
    });
  }

  // ---------- views ----------
  function setView(v) {
    view = v;
    $$("#tabs button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.view === v)); });
    $$(".view").forEach(function (s) { s.hidden = s.id !== "view-" + v; });
    render();
  }
  function render() {
    if (!D) return;
    $("#undoBtn").disabled = !undoStack.length;
    if (view === "log") renderLog();
    else if (view === "sheet") renderSheet();
    else if (view === "reports") renderReports();
    else renderProjects();
  }

  // ----- entries -----
  function renderLog() {
    var box = $("#log"); box.textContent = "";
    var t = now(), today = T.dayKey(t), wk = T.weekOf(today, D.settings.ws);
    var weekMs = T.filter(D, { from: wk, to: T.addDays(wk, 6) }, t).reduce(function (a, e) { return a + T.dur(e, t); }, 0);
    var todayMs = T.filter(D, { from: today, to: today }, t).reduce(function (a, e) { return a + T.dur(e, t); }, 0);
    if (!D.entries.length) {
      box.appendChild(h("div", { "class": "card empty" }, [h("b", { text: "No time tracked yet" }),
        "Type what you're working on and press Start, or add a past entry. Projects and clients (with hourly rates) are under Projects.",
        h("div", { "class": "row mt", style: "justify-content:center" }, [
          h("button", { "class": "btn", type: "button", onclick: function () { entrySheet(null); } }, ["Add a past entry"]),
          h("button", { "class": "btn ghost", type: "button", onclick: loadSample }, ["Try with sample data"])])]));
      return;
    }
    box.appendChild(h("div", { "class": "tt-weektotal" }, [h("span", {}, ["Today ", h("b", { text: T.fmtDur(todayMs, "hm") })]), h("span", {}, ["This week ", h("b", { text: T.fmtDur(weekMs, "hm") })])]));
    var from = T.addDays(today, -(logDays - 1)), days = {}, order = [];
    D.entries.forEach(function (e) {
      var k = T.dayKey(e.start); if (k < from) return;
      if (!days[k]) { days[k] = []; order.push(k); }
      days[k].push(e);
    });
    order.sort().reverse().forEach(function (k) {
      var list = days[k], total = list.reduce(function (a, e) { return a + T.dur(e, t); }, 0);
      var card = h("div", { "class": "card tt-day", style: "padding:0" }, [h("div", { "class": "tt-dayhead" }, [h("span", { text: dayLabel(k) }), h("b", { text: T.fmtDur(total) })])]);
      list.forEach(function (e) { card.appendChild(entryRow(e, t)); });
      box.appendChild(card);
    });
    var older = D.entries.some(function (e) { return T.dayKey(e.start) < from; });
    if (older) box.appendChild(h("div", { "class": "center" }, [h("button", { "class": "btn small", type: "button", onclick: function () { logDays += 28; renderLog(); } }, ["Show older entries"])]));
  }
  function entryRow(e, t) {
    var p = proj(e.project), c = p && client(p.client), run = e.end == null;
    var row = h("div", { "class": "tt-row" + (run ? " run" : ""), role: "button", tabindex: "0" }, [
      h("div", { "class": "tt-main" }, [h("b", { "class": e.desc ? "" : "none", dir: "auto", text: e.desc || "(no description)" }),
        p ? h("span", { "class": "tt-pj" }, [h("i", { "class": "dot", style: "background:" + p.color }), p.name + (c ? " · " + c.name : "")]) : null]),
      h("div", { "class": "tt-tags" }, e.tags.map(function (tg) { return h("span", { "class": "chip", dir: "auto", text: "#" + tg }); })),
      h("span", { "class": "tt-billed" + (e.billable ? "" : " off"), title: e.billable ? "Billable" : "", text: "$" }),
      h("span", { "class": "tt-span", text: time(e.start) + " – " + (run ? "now" : time(e.end)) }),
      h("span", { "class": "tt-dur", text: T.fmtDur(T.dur(e, t)) }),
      h("button", { "class": "tt-play", type: "button", title: run ? "Stop" : "Continue this", "aria-label": run ? "Stop" : "Continue",
        html: run ? '<svg class="i" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>' : S3.icon("play"), onclick: function (ev) {
          ev.stopPropagation();
          if (run) { startStop(); return; }
          change(function () { T.start(D, { desc: e.desc, project: e.project, tags: e.tags.slice(), billable: e.billable }, now()); });
          syncTimerBar(); S3.toast("Timer started");
        } })]);
    row.addEventListener("click", function () { entrySheet(e.id); });
    row.addEventListener("keydown", function (ev) { if (ev.key === "Enter") entrySheet(e.id); });
    return row;
  }

  // Add or edit an entry. preset: {day, project, desc}
  function entrySheet(id, preset) {
    var e = id ? T.byId(D.entries, id) : null, run = e && e.end == null;
    preset = preset || {};
    var t = now(), dayK = e ? T.dayKey(e.start) : preset.day || T.dayKey(t);
    var startMs = e ? e.start : defaultStart(dayK), endMs = e ? (run ? t : e.end) : startMs + (preset.dur || 60 * T.MIN);
    var desc = h("input", { "class": "input", maxlength: 500, dir: "auto", placeholder: "What did you work on?" }); desc.value = e ? e.desc : preset.desc || "";
    var project = projectSelect(h("select", { "class": "select" }), e ? e.project : preset.project || "");
    var tags = e ? e.tags.slice() : [];
    var bill = h("input", { type: "checkbox" }); bill.checked = e ? e.billable : defaultBill(preset.project);
    project.addEventListener("change", function () { if (!e) bill.checked = defaultBill(project.value); });
    var date = h("input", { "class": "input", type: "date", required: true }); date.value = dayK;
    var st = h("input", { "class": "input", type: "time", required: true, step: 60 }); st.value = T.hhmm(startMs);
    var en = h("input", { "class": "input", type: "time", step: 60, disabled: run }); en.value = run ? "" : T.hhmm(endMs);
    var du = h("input", { "class": "input", placeholder: "1:30 or 90m", "aria-label": "Duration", disabled: run }); du.value = run ? "" : T.fmtDur(endMs - startMs, "hm");
    function times() {
      var s = T.at(date.value, st.value), en2 = T.at(date.value, en.value);
      if (en2 < s) en2 += 24 * T.H; // ends after midnight
      return { s: s, e: en2 };
    }
    function fromEnd() { if (run || !st.value || !en.value || !T.validDay(date.value)) return; var x = times(); du.value = T.fmtDur(x.e - x.s, "hm"); }
    function fromDur() { if (run) return; var d = T.parseDuration(du.value); if (isNaN(d) || !st.value) return; en.value = T.hhmm(T.at(date.value, st.value) + d); }
    en.addEventListener("change", fromEnd); st.addEventListener("change", function () { if (!run) fromDur(); }); du.addEventListener("change", fromDur);
    var body = h("div", { "class": "stack" }, [field("Description", desc), h("div", { "class": "grid-2" }, [field("Project", project), h("div", { "class": "field" }, ["Billable", h("label", { "class": "check", style: "min-height:40px" }, [bill, "Billable time"])])]),
      h("div", { "class": "field" }, ["Tags", tagPicker(tags, function (s) { tags = s; })]),
      h("div", { "class": "g3" }, [field("Date", date), field("Start", st), field(run ? "End (running)" : "End", en)]),
      field(run ? "Duration (running)" : "Duration", du)]);
    function collect() {
      if (!T.validDay(date.value) || !st.value) { S3.toast("Pick a date and a start time", "error"); return null; }
      var s = T.at(date.value, st.value), end;
      if (run) end = null;
      else {
        var d = T.parseDuration(du.value);
        if (en.value) { end = times().e; if (!isNaN(d) && Math.abs((end - s) - d) > T.MIN) end = s + d; }
        else if (!isNaN(d)) end = s + d;
        else { S3.toast("Enter an end time or a duration such as 1:30", "error"); return null; }
        if (end <= s) { S3.toast("The entry needs a length of at least a minute", "error"); return null; }
      }
      if (run && s > now()) { S3.toast("A running timer can't start in the future", "error"); return null; }
      return { desc: desc.value.trim(), project: project.value || null, tags: tags.slice(), billable: bill.checked, start: s, end: end };
    }
    var btns = [];
    if (e) {
      btns.push({ label: "Delete", cls: "danger left", run: function () { change(function () { D.entries = D.entries.filter(function (x) { return x.id !== e.id; }); }, "Entry deleted. Ctrl+Z to undo."); syncTimerBar(); } });
      if (!run) btns.push({ label: "Duplicate", cls: "ghost", run: function () { var o = collect(); if (!o) return false; change(function () { T.addEntry(D, o); }, "Duplicated"); } });
      if (run) btns.push({ label: "Stop timer", cls: "ghost", run: function () { var o = collect(); if (!o) return false; change(function () { Object.assign(e, o); e.end = Math.max(e.start, now()); }, "Stopped"); syncTimerBar(); } });
    }
    btns.push({ label: e ? "Save" : "Add entry", cls: "primary", submit: true, run: function () {
      var o = collect(); if (!o) return false;
      change(function () { if (e) { Object.assign(e, o); T.sortEntries(D); T.addTags(D, o.tags); } else T.addEntry(D, o); }, e ? "Saved" : "Added " + T.fmtDur(o.end - o.start, "hm"));
      if (run) syncTimerBar();
      if (!e) S3.done();
    } });
    sheet(e ? (run ? "Running timer" : "Edit entry") : "Add a time entry", body, btns, { focus: e ? null : "input" });
  }
  function defaultStart(dayK) {
    // after the last entry that day, or 9:00
    var list = D.entries.filter(function (x) { return x.end != null && T.dayKey(x.start) === dayK; });
    var last = list.reduce(function (a, x) { return Math.max(a, x.end); }, 0);
    var nine = T.at(dayK, "09:00");
    if (last) return Math.ceil(last / T.MIN) * T.MIN;
    if (dayK === T.dayKey(now())) return Math.min(nine, Math.floor((now() - T.H) / (5 * T.MIN)) * 5 * T.MIN);
    return nine;
  }
  function defaultBill(pid) { var p = proj(pid); return p ? p.billable !== false && (p.rate != null || (client(p.client) || {}).rate != null || D.settings.rate > 0) : false; }

  // ----- timesheet -----
  function renderSheet() {
    var t = now(); weekKey = weekKey || T.weekOf(T.dayKey(t), D.settings.ws);
    var ts = T.timesheet(D, weekKey, t), today = T.dayKey(t);
    var end = T.addDays(weekKey, 6);
    $("#wLabel").textContent = new Date(T.dayStart(weekKey)).toLocaleDateString("en", { day: "numeric", month: "short" }) + " – " + new Date(T.dayStart(end)).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
    var tbl = $("#sheet"); tbl.textContent = "";
    var head = h("tr", {}, [h("th", { text: "Project" })]);
    ts.days.forEach(function (k) { head.appendChild(h("th", { "class": k === today ? "today" : "", text: new Date(T.dayStart(k)).toLocaleDateString("en", { weekday: "short", day: "numeric" }) })); });
    head.appendChild(h("th", { text: "Total" }));
    tbl.appendChild(h("thead", {}, [head]));
    var body = h("tbody");
    var rows = ts.rows.slice();
    // show active projects with no time yet too, so you can add time to them
    D.projects.forEach(function (p) { if (!p.archived && !rows.some(function (r) { return r.project === p.id; })) rows.push({ project: p.id, days: [0, 0, 0, 0, 0, 0, 0], total: 0 }); });
    if (!rows.some(function (r) { return !r.project; })) rows.push({ project: null, days: [0, 0, 0, 0, 0, 0, 0], total: 0 });
    rows.forEach(function (r) {
      var p = proj(r.project);
      var tr = h("tr", {}, [h("td", {}, [p ? h("span", { "class": "tt-pj", style: "color:var(--text);font-size:13.5px" }, [h("i", { "class": "dot", style: "background:" + p.color }), p.name]) : h("span", { "class": "faint", text: "No project" })])]);
      r.days.forEach(function (ms, i) {
        var td = h("td", { "class": "cell" + (ms ? "" : " zero"), title: "Add time", text: ms ? T.fmtDur(ms, "hm") : "–" });
        td.addEventListener("click", function () { entrySheet(null, { day: ts.days[i], project: r.project || "" }); });
        tr.appendChild(td);
      });
      tr.appendChild(h("td", { style: "font-weight:650", text: T.fmtDur(r.total, "hm") }));
      body.appendChild(tr);
    });
    var tot = h("tr", { "class": "tot" }, [h("td", { text: "Total" })]);
    ts.dayTotals.forEach(function (ms) { tot.appendChild(h("td", { text: T.fmtDur(ms, "hm") })); });
    tot.appendChild(h("td", { text: T.fmtDur(ts.total, "hm") }));
    body.appendChild(tot);
    tbl.appendChild(body);
  }

  // ----- reports -----
  function range() {
    var v = $("#rRange").value, t = T.dayKey(now()), ws = D.settings.ws, d = new Date(T.dayStart(t)), from, to;
    if (v === "week") { from = T.weekOf(t, ws); to = T.addDays(from, 6); }
    else if (v === "lastweek") { from = T.addDays(T.weekOf(t, ws), -7); to = T.addDays(from, 6); }
    else if (v === "month") { from = t.slice(0, 8) + "01"; to = T.dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime()); }
    else if (v === "lastmonth") { from = T.dayKey(new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime()); to = T.dayKey(new Date(d.getFullYear(), d.getMonth(), 0).getTime()); }
    else if (v === "year") { from = t.slice(0, 4) + "-01-01"; to = t.slice(0, 4) + "-12-31"; }
    else { from = T.validDay($("#rFrom").value) ? $("#rFrom").value : T.addDays(t, -29); to = T.validDay($("#rTo").value) ? $("#rTo").value : t; if (to < from) { var x = from; from = to; to = x; } }
    return { from: from, to: to };
  }
  function filters() {
    var r = range();
    return { from: r.from, to: r.to, client: $("#rClient").value, project: $("#rProject").value, tag: $("#rTag").value, billable: $("#rBill").value };
  }
  function fillFilterSelects() {
    var keep = { c: $("#rClient").value, p: $("#rProject").value, t: $("#rTag").value };
    var cs = $("#rClient"); cs.textContent = ""; cs.appendChild(option("", "All clients", !keep.c));
    D.clients.forEach(function (c) { cs.appendChild(option(c.id, c.name, c.id === keep.c)); });
    projectSelect($("#rProject"), keep.p, { any: true });
    var ts = $("#rTag"); ts.textContent = ""; ts.appendChild(option("", "All tags", !keep.t));
    D.tags.forEach(function (t) { ts.appendChild(option(t, "#" + t, t === keep.t)); });
  }
  function renderReports() {
    fillFilterSelects();
    var f = filters(), t = now();
    if ($("#rRange").value !== "custom") { $("#rFrom").value = f.from; $("#rTo").value = f.to; }
    var list = T.filter(D, f, t), sum = T.summarize(D, list, t);
    var st = $("#rStats"); st.textContent = "";
    [["Total time", T.fmtDur(sum.total, "hm")], ["Billable", T.fmtDur(sum.billable, "hm")], ["Billable amount", money(sum.amount)], ["Entries", String(sum.count)]].forEach(function (x) {
      st.appendChild(h("div", { "class": "stat" }, [h("b", { text: x[1] }), h("span", { text: x[0] })]));
    });
    if (D.settings.round) st.appendChild(h("div", { "class": "stat" }, [h("b", { text: D.settings.round + " min" }), h("span", { text: "Each entry rounded " + (D.settings.roundMode === "nearest" ? "to nearest" : "up") })]));
    drawDays($("#rChart"), f, sum);
    var box = $("#rProjects"); box.textContent = "";
    var rows = Object.keys(sum.byProject).map(function (k) { return sum.byProject[k]; }).sort(function (a, b) { return b.ms - a.ms; });
    if (!rows.length) box.appendChild(h("div", { "class": "empty" }, [h("b", { text: "No time in this period" }), "Change the period or the filters."]));
    var max = rows.length ? rows[0].ms : 1;
    rows.forEach(function (r) {
      var p = proj(r.id), c = p && client(p.client);
      box.appendChild(h("div", { "class": "rep-bar" }, [
        h("span", { dir: "auto" }, [h("i", { "class": "dot", style: "background:" + (p ? p.color : "var(--text-3)") }), (p ? p.name : "No project") + (c ? " · " + c.name : "")]),
        h("b", {}, [T.fmtDur(r.ms, "hm"), r.amount ? h("small", { text: money(T.roundMoney(r.amount, D.settings.cur)) }) : null]),
        h("div", { "class": "track" }, [h("i", { style: "width:" + Math.max(1, Math.round(100 * r.ms / max)) + "%;background:" + (p ? p.color : "var(--text-3)") })])]));
    });
  }
  var NS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs, kids) { var el = document.createElementNS(NS, tag); for (var k in attrs) el.setAttribute(k, attrs[k]); (kids || []).forEach(function (c) { el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }); return el; }
  function drawDays(box, f, sum) {
    box.textContent = "";
    var days = []; for (var k = f.from; k <= f.to && days.length < 400; k = T.addDays(k, 1)) days.push(k);
    var vals = days.map(function (k) { return sum.byDay[k] || 0; });
    var W = Math.max(280, Math.min(900, Math.round(box.clientWidth || 480))), Hh = 180, padL = 34, padB = 20, padT = 6, pw = W - padL, ph = Hh - padB - padT;
    var maxH = Math.max(1, Math.ceil(Math.max.apply(null, vals) / T.H));
    var s = svg("svg", { "class": "chart", viewBox: "0 0 " + W + " " + Hh, role: "img", "aria-label": "Hours per day" });
    for (var i = 0; i <= 4; i++) {
      var v = maxH * i / 4, y = padT + ph - ph * i / 4;
      s.appendChild(svg("line", { "class": "grid", x1: padL, x2: W, y1: y, y2: y }));
      s.appendChild(svg("text", { x: padL - 6, y: y + 4, "text-anchor": "end" }, [(Math.round(v * 10) / 10) + "h"]));
    }
    var gw = pw / days.length, bw = Math.max(1, Math.min(26, gw * 0.7)), every = Math.ceil(days.length / 10);
    days.forEach(function (k, i) {
      var hh = ph * (vals[i] / T.H) / maxH, x = padL + gw * i + (gw - bw) / 2;
      s.appendChild(svg("rect", { "class": "bar", x: x, y: padT + ph - hh, width: bw, height: Math.max(0, hh), rx: 2 }, [svg("title", {}, [dayLabel(k) + ": " + T.fmtDur(vals[i], "hm")])]));
      if (i % every === 0) s.appendChild(svg("text", { x: padL + gw * i + gw / 2, y: Hh - 5, "text-anchor": "middle" }, [days.length <= 7 ? new Date(T.dayStart(k)).toLocaleDateString("en", { weekday: "short" }) : String(+k.slice(8))]));
    });
    box.appendChild(s);
  }
  function fileName(base) { return base + "-" + filters().from + "-to-" + filters().to; }

  // ----- invoice -----
  function invoiceSheet() {
    var f = filters(), t = now(), list = T.filter(D, f, t);
    if (!list.some(function (e) { return e.billable && e.end != null; })) { S3.toast("No billable time in this report. Mark entries or projects as billable first.", "error"); return; }
    var cl = client(f.client) || (function () {
      var ids = {}; list.forEach(function (e) { var p = proj(e.project); if (p && p.client) ids[p.client] = 1; });
      var k = Object.keys(ids); return k.length === 1 ? client(k[0]) : null;
    })();
    var no = h("input", { "class": "input" }); no.value = String(D.settings.invNo).padStart(4, "0");
    var issued = h("input", { "class": "input", type: "date" }); issued.value = T.dayKey(t);
    var due = h("input", { "class": "input", type: "date" }); due.value = T.addDays(T.dayKey(t), 14);
    var by = h("select", { "class": "select" }, [option("project", "One line per project", true), option("entry", "One line per entry", false)]);
    var from = h("textarea", { "class": "textarea prose", rows: 3, dir: "auto", placeholder: "Your name, address, tax number, bank details", style: "min-height:80px" }); from.value = D.settings.me;
    var to = h("textarea", { "class": "textarea prose", rows: 3, dir: "auto", placeholder: "Client name and address", style: "min-height:80px" }); to.value = cl ? (cl.name + (cl.info ? "\n" + cl.info : "")) : "";
    var tax = h("input", { "class": "input", inputmode: "decimal" }); tax.value = D.settings.tax || "";
    var notes = h("textarea", { "class": "textarea prose", rows: 2, dir: "auto", placeholder: "Payment terms, thank-you note (optional)", style: "min-height:60px" });
    var preview = h("div", { "class": "faint" });
    function calc() { D.settings.tax = amt(tax.value) || 0; return T.invoiceLines(D, list, by.value, t); }
    function upd() { var inv = calc(); preview.textContent = inv.lines.length + " line" + (inv.lines.length === 1 ? "" : "s") + " · subtotal " + money(inv.subtotal) + (inv.tax ? " · tax " + money(inv.tax) : "") + " · total " + money(inv.total); }
    [by, tax].forEach(function (x) { x.addEventListener("change", upd); x.addEventListener("input", upd); });
    upd();
    var body = h("div", { "class": "stack" }, [
      h("p", { "class": "muted", text: "From the billable time in this report (" + f.from + " to " + f.to + "). " + (D.settings.round ? "Entries are rounded as set in Settings. " : "") + "Rates come from projects, clients or your default rate." }),
      h("div", { "class": "g3" }, [field("Invoice number", no), field("Date", issued), field("Due", due)]),
      h("div", { "class": "grid-2" }, [field("From (you)", from), field("Bill to", to)]),
      h("div", { "class": "grid-2" }, [field("Lines", by), field("Tax %", tax)]),
      field("Notes", notes), preview]);
    function build() {
      var inv = calc(), cur = D.settings.cur;
      D.settings.me = from.value.trim();
      var area = $("#printArea"); area.textContent = "";
      var rows = inv.lines.map(function (l) {
        return h("tr", {}, [h("td", { dir: "auto", text: l.text + (l.from ? " (" + l.from + (l.to !== l.from ? " – " + l.to : "") + ")" : l.date ? " (" + l.date + ")" : "") }),
          h("td", { "class": "num", text: l.hours.toFixed(2) }), h("td", { "class": "num", text: T.money(l.rate, cur) }), h("td", { "class": "num", text: T.money(l.amount, cur) })]);
      });
      var foot = [h("tr", { "class": "tot" }, [h("td", { text: "Subtotal" }), h("td"), h("td"), h("td", { "class": "num", text: T.money(inv.subtotal, cur) })])];
      if (inv.tax) foot.push(h("tr", { "class": "tot" }, [h("td", { text: "Tax " + D.settings.tax + "%" }), h("td"), h("td"), h("td", { "class": "num", text: T.money(inv.tax, cur) })]));
      foot.push(h("tr", { "class": "tot" }, [h("td", { text: "Total due" }), h("td"), h("td"), h("td", { "class": "num", text: T.money(inv.total, cur) })]));
      area.appendChild(h("div", {}, [h("h1", { text: "Invoice" }), h("div", { text: "No. " + no.value + " · Date " + issued.value + (due.value ? " · Due " + due.value : "") }),
        h("div", { "class": "parties" }, [h("div", { dir: "auto" }, [h("b", { text: "From" }), "\n" + from.value]), h("div", { dir: "auto" }, [h("b", { text: "Bill to" }), "\n" + to.value])]),
        h("table", {}, [h("thead", {}, [h("tr", {}, [h("th", { text: "Description" }), h("th", { "class": "num", text: "Hours" }), h("th", { "class": "num", text: "Rate" }), h("th", { "class": "num", text: "Amount" })])]),
          h("tbody", {}, rows.concat(foot))]),
        notes.value.trim() ? h("div", { "class": "notes", dir: "auto", text: notes.value.trim() }) : null]));
      return inv;
    }
    function bump() { var n = parseInt(no.value, 10); if (isFinite(n) && n >= D.settings.invNo) D.settings.invNo = n + 1; save(); }
    sheet("Create invoice", body, [
      { label: "Download CSV", cls: "ghost", run: function () {
        var inv = build(), cur = D.settings.cur;
        var rows = [["Invoice", no.value], ["Date", issued.value], ["Due", due.value], [], ["Description", "Hours", "Rate (" + cur + ")", "Amount (" + cur + ")"]];
        inv.lines.forEach(function (l) { rows.push([l.text + (l.date ? " (" + l.date + ")" : ""), l.hours.toFixed(2), l.rate, l.amount]); });
        rows.push([], ["Subtotal", "", "", inv.subtotal]); if (inv.tax) rows.push(["Tax " + D.settings.tax + "%", "", "", inv.tax]); rows.push(["Total", "", "", inv.total]);
        S3.download(T.csv(rows), "invoice-" + no.value + ".csv", "text/csv"); bump(); S3.done(); return false;
      } },
      { label: "Print / save as PDF", cls: "primary", submit: true, run: function () {
        build(); bump();
        document.body.classList.add("printing");
        setTimeout(function () { window.print(); }, 50);
        S3.done();
      } }], { wide: true });
  }

  // ----- projects / clients -----
  function rateText(r) { return r == null ? "" : money(r) + "/h"; }
  function renderProjects() {
    var cs = $("#pClient"), keep = cs.value; cs.textContent = ""; cs.appendChild(option("", "No client", !keep));
    D.clients.forEach(function (c) { cs.appendChild(option(c.id, c.name, c.id === keep)); });
    if (!$("#pColor").dataset.touched) $("#pColor").value = T.COLORS[D.projects.length % T.COLORS.length];
    var pl = $("#pList"); pl.textContent = "";
    if (!D.projects.length) pl.appendChild(h("p", { "class": "faint", text: "No projects yet. Add one below; give it a client and a rate if you bill for it." }));
    D.projects.slice().sort(function (a, b) { return a.archived - b.archived || a.name.localeCompare(b.name); }).forEach(function (p) {
      var c = client(p.client), eff = T.rateFor(D, { project: p.id });
      pl.appendChild(h("div", { "class": "li" + (p.archived ? " arch" : "") }, [h("i", { "class": "dot", style: "background:" + p.color }),
        h("div", { "class": "grow" }, [h("b", { dir: "auto", text: p.name }), h("span", { "class": "faint", text: (c ? c.name + " · " : "") + (eff ? money(eff) + "/h" + (p.rate == null ? (c && c.rate != null ? " (client)" : " (default)") : "") : "no rate") + (p.archived ? " · archived" : "") })]),
        h("button", { "class": "btn ghost small", type: "button", onclick: function () { projectSheet(p); } }, ["Edit"])]));
    });
    var cl = $("#cList"); cl.textContent = "";
    if (!D.clients.length) cl.appendChild(h("p", { "class": "faint", text: "No clients yet." }));
    D.clients.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) {
      var n = D.projects.filter(function (p) { return p.client === c.id; }).length;
      cl.appendChild(h("div", { "class": "li" }, [h("div", { "class": "grow" }, [h("b", { dir: "auto", text: c.name }), h("span", { "class": "faint", text: n + " project" + (n === 1 ? "" : "s") + (c.rate != null ? " · " + rateText(c.rate) : "") })]),
        h("button", { "class": "btn ghost small", type: "button", onclick: function () { clientSheet(c); } }, ["Edit"])]));
    });
    var tl = $("#tagList"); tl.textContent = "";
    if (!D.tags.length) tl.appendChild(h("span", { "class": "faint", text: "Tags you add to entries appear here." }));
    D.tags.forEach(function (t) {
      tl.appendChild(h("span", { "class": "chip" }, ["#" + t, h("button", { type: "button", "aria-label": "Delete tag " + t, text: "✕", onclick: function () {
        change(function () { D.tags = D.tags.filter(function (x) { return x !== t; }); D.entries.forEach(function (e) { e.tags = e.tags.filter(function (x) { return x !== t; }); }); }, "Tag removed from all entries");
      } })]));
    });
  }
  function projectSheet(p) {
    var name = h("input", { "class": "input", maxlength: 120, dir: "auto", required: true }); name.value = p.name;
    var cs = h("select", { "class": "select" }, [option("", "No client", !p.client)]); D.clients.forEach(function (c) { cs.appendChild(option(c.id, c.name, c.id === p.client)); });
    var rate = h("input", { "class": "input", inputmode: "decimal", placeholder: "Client or default rate" }); rate.value = p.rate == null ? "" : p.rate;
    var color = h("input", { type: "color" }); color.value = p.color;
    var bill = h("input", { type: "checkbox" }); bill.checked = p.billable !== false;
    var arch = h("input", { type: "checkbox" }); arch.checked = p.archived;
    var n = D.entries.filter(function (e) { return e.project === p.id; }).length;
    sheet("Edit project", h("div", { "class": "stack" }, [h("div", { "class": "grid-2" }, [field("Name", name), field("Client", cs), field("Hourly rate (" + D.settings.cur + ")", rate), field("Colour", color)]),
      h("label", { "class": "check" }, [bill, "New entries are billable"]), h("label", { "class": "check" }, [arch, "Archived (hidden from the timer)"]),
      h("p", { "class": "faint", text: n + " entr" + (n === 1 ? "y" : "ies") + "." })]), [
      { label: "Delete", cls: "danger left", run: function () { change(function () { D.entries.forEach(function (e) { if (e.project === p.id) e.project = null; }); D.projects = D.projects.filter(function (x) { return x !== p; }); }, "Project deleted, its entries kept without a project"); syncTimerBar(); } },
      { label: "Save", cls: "primary", submit: true, run: function () {
        var r = amt(rate.value); if (isNaN(r)) { S3.toast("Rate must be a number", "error"); return false; }
        if (!name.value.trim()) return false;
        change(function () { p.name = name.value.trim(); p.client = cs.value || null; p.rate = r; p.color = color.value; p.billable = bill.checked; p.archived = arch.checked; });
        syncTimerBar();
      } }]);
  }
  function clientSheet(c) {
    var name = h("input", { "class": "input", maxlength: 120, dir: "auto", required: true }); name.value = c.name;
    var rate = h("input", { "class": "input", inputmode: "decimal", placeholder: "Default rate" }); rate.value = c.rate == null ? "" : c.rate;
    var info = h("textarea", { "class": "textarea prose", rows: 3, dir: "auto", placeholder: "Address and details for invoices", style: "min-height:70px" }); info.value = c.info || "";
    sheet("Edit client", h("div", { "class": "stack" }, [h("div", { "class": "grid-2" }, [field("Name", name), field("Hourly rate (" + D.settings.cur + ")", rate)]), field("Invoice details", info)]), [
      { label: "Delete", cls: "danger left", run: function () { change(function () { D.projects.forEach(function (p) { if (p.client === c.id) p.client = null; }); D.clients = D.clients.filter(function (x) { return x !== c; }); }, "Client deleted, its projects kept"); } },
      { label: "Save", cls: "primary", submit: true, run: function () {
        var r = amt(rate.value); if (isNaN(r)) { S3.toast("Rate must be a number", "error"); return false; }
        if (!name.value.trim()) return false;
        change(function () { c.name = name.value.trim(); c.rate = r; c.info = info.value.trim().slice(0, 1000); });
      } }]);
  }
  function wireProjects() {
    $("#pColor").addEventListener("input", function () { $("#pColor").dataset.touched = "1"; });
    $("#pForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var r = amt($("#pRate").value); if (isNaN(r)) { S3.toast("Rate must be a number", "error"); return; }
      var n = $("#pName").value.trim(); if (!n) return;
      change(function () { D.projects.push({ id: T.uid(), name: n.slice(0, 120), client: $("#pClient").value || null, color: $("#pColor").value, rate: r, billable: true, archived: false }); }, "Project added");
      $("#pName").value = ""; $("#pRate").value = ""; delete $("#pColor").dataset.touched; syncTimerBar(); renderProjects();
    });
    $("#cForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var r = amt($("#cRate").value); if (isNaN(r)) { S3.toast("Rate must be a number", "error"); return; }
      var n = $("#cName").value.trim(); if (!n) return;
      change(function () { D.clients.push({ id: T.uid(), name: n.slice(0, 120), rate: r, info: "" }); }, "Client added");
      $("#cName").value = ""; $("#cRate").value = "";
    });
  }

  // ----- settings, backup, import -----
  function settingsSheet() {
    var s = D.settings;
    var cur = h("input", { "class": "input", maxlength: 3, value: s.cur, style: "text-transform:uppercase" });
    var rate = h("input", { "class": "input", inputmode: "decimal" }); rate.value = s.rate || "";
    var ws = h("select", { "class": "select" }, [option("6", "Saturday", s.ws === 6), option("0", "Sunday", s.ws === 0), option("1", "Monday", s.ws === 1)]);
    var clock = h("select", { "class": "select" }, [option("24", "24-hour (14:30)", s.clock === 24), option("12", "12-hour (2:30 pm)", s.clock === 12)]);
    var round = h("select", { "class": "select" }); [0, 1, 5, 6, 10, 15, 30, 60].forEach(function (m) { round.appendChild(option(String(m), m ? m + " minutes" : "No rounding", s.round === m)); });
    var mode = h("select", { "class": "select" }, [option("up", "Round up", s.roundMode === "up"), option("nearest", "Round to nearest", s.roundMode === "nearest")]);
    var body = h("div", { "class": "stack" }, [
      h("div", { "class": "g3" }, [field("Currency code", cur), field("Default hourly rate", rate), field("Week starts on", ws)]),
      h("div", { "class": "g3" }, [field("Clock", clock), field("Rounding in reports", round), field("Rounding", mode)]),
      h("hr", { style: "border:0;border-top:1px solid var(--line);width:100%" }),
      h("b", { text: "Backup and import" }),
      h("p", { "class": "faint", text: "Your time is saved in this browser only. A backup file restores it or moves it to another device. You can also import a detailed CSV export from Toggl Track." }),
      h("div", { "class": "row" }, [
        h("button", { "class": "btn small primary", type: "button", html: S3.icon("download") + "Download backup", onclick: function () { S3.download(JSON.stringify(D, null, 1), "time-tracker-" + T.dayKey(now()) + ".json", "application/json"); S3.done(); } }),
        h("button", { "class": "btn small", type: "button", html: S3.icon("upload") + "Restore backup", onclick: function () { m.close(); pickFile(".json,application/json", restore); } }),
        h("button", { "class": "btn small", type: "button", html: S3.icon("upload") + "Import Toggl CSV", onclick: function () { m.close(); pickFile(".csv,text/csv", importToggl); } })]),
      h("div", { "class": "row" }, [h("button", { "class": "btn small danger", type: "button", onclick: function () {
        m.close();
        sheet("Erase everything?", h("p", { "class": "muted", text: "This deletes all entries, projects, clients and tags from this browser. Download a backup first if you might need them." }), [
          { label: "Cancel", cls: "ghost", run: function () {} },
          { label: "Erase all", cls: "danger", run: function () { change(function () { var keep = D.settings; D = T.newData(); D.settings = keep; }, "Erased. Ctrl+Z to undo."); syncTimerBar(); } }]);
      } }, ["Erase all data"])])]);
    var m = sheet("Settings", body, [{ label: "Save", cls: "primary", submit: true, run: function () {
      var c = cur.value.trim().toUpperCase(), r = amt(rate.value);
      if (!/^[A-Z]{3}$/.test(c)) { S3.toast("Use a 3-letter currency code like USD, EUR or JOD", "error"); return false; }
      if (isNaN(r)) { S3.toast("Rate must be a number", "error"); return false; }
      change(function () { s.cur = c; s.rate = r || 0; s.ws = +ws.value; s.clock = +clock.value; s.round = +round.value; s.roundMode = mode.value; }, "Settings saved");
      weekKey = null;
    } }]);
  }
  function pickFile(accept, fn) {
    var inp = h("input", { type: "file", accept: accept });
    inp.addEventListener("change", function () { var f = inp.files[0]; if (f) S3.readFile(f, "text").then(fn).catch(function () { S3.toast("Could not read that file", "error"); }); });
    inp.click();
  }
  function restore(txt) {
    var d;
    try { d = T.normalize(JSON.parse(txt)); } catch (e) { S3.toast("That file is not a Time Tracker backup", "error"); return; }
    sheet("Restore backup?", h("p", { "class": "muted", text: "This replaces what is in this browser now (" + D.entries.length + " entries) with the backup (" + d.entries.length + " entries). You can undo right after." }), [
      { label: "Cancel", cls: "ghost", run: function () {} },
      { label: "Replace", cls: "primary", run: function () { change(function () { D = d; }, "Backup restored"); syncTimerBar(); } }]);
  }
  function importToggl(txt) {
    var res;
    try { change(function () { res = T.importCSV(D, txt); if (!res.added) return false; }); }
    catch (e) { S3.toast("That CSV doesn't look like a Toggl detailed export (it needs Start date, Start time and End time or Duration columns)", "error"); return; }
    S3.toast(res.added ? "Imported " + res.added + " entries" + (res.skipped ? ", skipped " + res.skipped : "") : "Nothing new to import (" + res.skipped + " rows skipped)");
    syncTimerBar(); if (res.added) S3.done();
  }
  function loadSample() {
    change(function () { var keep = D.settings.ws; D = T.sample(now()); D.settings.ws = keep; }, "Sample data loaded. Erase it in Settings when you're done.");
    syncTimerBar();
  }
  function helpSheet() {
    var keys = [["S", "Start or stop the timer"], ["N", "Add a past entry"], ["1 2 3 4", "Timer, Timesheet, Reports, Projects"], ["Enter", "In the description: start the timer"],
      ["Ctrl+Z", "Undo"], ["?", "This help"], ["Esc", "Close a window"]];
    var grid = h("div", { "class": "keys" });
    keys.forEach(function (k) { grid.appendChild(h("span", {}, k[0].split(" ").map(function (x) { return h("kbd", { text: x }); }))); grid.appendChild(h("span", { text: k[1] })); });
    sheet("Shortcuts", h("div", { "class": "stack" }, [grid, h("p", { "class": "faint", text: "Durations accept 1:30, 90m, 1.5h, 1h 20m or 45 (minutes). The timer keeps running if you close the tab." })]),
      [{ label: "Close", cls: "primary", submit: true, run: function () {} }]);
  }

  // ---------- self-test ----------
  window.S3_SELFTEST = function () {
    try {
      var d = T.sample(now()), t = now();
      var ok = d.entries.length > 3 && T.parseDuration("1:30") === 90 * T.MIN && T.parseDuration("1h 20m") === 80 * T.MIN && T.parseDuration("١:٣٠") === 90 * T.MIN;
      var s = T.summarize(d, T.filter(d, {}, t), t);
      ok = ok && s.total === d.entries.reduce(function (a, e) { return a + T.dur(e, t); }, 0) && s.amount > 0;
      var x = T.newData(); var r = T.importCSV(x, T.exportDetailed(d, d.entries, t).replace("Date,Start,End", "Start date,Start time,End time"));
      ok = ok && r.added === d.entries.length;
      ok = ok && JSON.stringify(T.normalize(JSON.parse(JSON.stringify(d)))).length > 100 && T.invoiceLines(d, d.entries, "project", t).total > 0;
      return Promise.resolve(ok && !!$("#timerBar"));
    } catch (e) { return Promise.resolve(false); }
  };

  // ---------- start ----------
  function start() {
    var raw = S3.store("tt:data");
    try { D = raw ? T.normalize(raw) : T.newData(); } catch (e) { D = T.newData(); }
    if (!raw) { var tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {} if (/^Asia\/(Amman|Riyadh|Kuwait|Baghdad|Qatar|Bahrain|Dubai|Muscat)|^Africa\/Cairo/.test(tz)) D.settings.ws = tz === "Asia/Dubai" ? 1 : 6; }
    wireTimer(); wireProjects();
    $$("#tabs button").forEach(function (b) { b.addEventListener("click", function () { setView(b.dataset.view); }); });
    $("#addBtn").addEventListener("click", function () { entrySheet(null); });
    $("#undoBtn").addEventListener("click", undo);
    $("#helpBtn").addEventListener("click", helpSheet);
    $("#setBtn").addEventListener("click", settingsSheet);
    $("#wPrev").addEventListener("click", function () { weekKey = T.addDays(weekKey, -7); renderSheet(); });
    $("#wNext").addEventListener("click", function () { weekKey = T.addDays(weekKey, 7); renderSheet(); });
    $("#wNow").addEventListener("click", function () { weekKey = null; renderSheet(); });
    ["#rRange", "#rClient", "#rProject", "#rTag", "#rBill"].forEach(function (s) { $(s).addEventListener("change", renderReports); });
    ["#rFrom", "#rTo"].forEach(function (s) { $(s).addEventListener("change", function () { $("#rRange").value = "custom"; renderReports(); }); });
    $("#rCsv").addEventListener("click", function () { var f = filters(); S3.download(T.exportDetailed(D, T.filter(D, f, now()), now()), fileName("time-detailed") + ".csv", "text/csv"); S3.done(); });
    $("#rCsv2").addEventListener("click", function () { var f = filters(), t = now(); S3.download(T.exportSummary(D, T.summarize(D, T.filter(D, f, t), t)), fileName("time-summary") + ".csv", "text/csv"); S3.done(); });
    $("#rInvoice").addEventListener("click", invoiceSheet);
    window.addEventListener("afterprint", function () { document.body.classList.remove("printing"); });
    document.addEventListener("keydown", function (e) {
      if ($(".s3-modal")) return;
      if (e.key === "Escape" && pop) { closePop(); return; }
      var typing = /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || "");
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); undo(); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key.toLowerCase();
      if (k === "s") { e.preventDefault(); startStop(); }
      else if (k === "n") { e.preventDefault(); entrySheet(null); }
      else if (k >= "1" && k <= "4") setView(["log", "sheet", "reports", "projects"][+k - 1]);
      else if (e.key === "?") helpSheet();
    });
    // another tab changed the data (e.g. stopped the timer there)
    window.addEventListener("storage", function (e) {
      if (e.key !== "s3:tt:data" || !e.newValue) return;
      try { D = T.normalize(JSON.parse(e.newValue)); syncTimerBar(); render(); } catch (err) {}
    });
    syncTimerBar();
    setView("log");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
