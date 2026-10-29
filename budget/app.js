/* Budget app UI. All data stays in this browser (localStorage via S3.store). Maths lives in core.js. */
(function () {
  "use strict";
  var C = window.BudgetCore, h = S3.h, $ = S3.$, $$ = S3.$$;
  var B = null;            // the open budget
  var M = C.monthOf(C.today());
  var view = "plan";
  var undoStack = [];
  var txFilter = { acct: "", q: "", cat: null, month: null, limit: 150 };
  var focusAfter = null;   // category id whose "assigned" input gets focus after a render

  // ---------- storage ----------
  function list() { return S3.store("budget:list") || []; }
  function saveNow() {
    if (!B) return;
    var ok = S3.store("budget:b:" + B.id, B) !== undefined;
    var l = list().filter(function (x) { return x.id !== B.id; });
    l.unshift({ id: B.id, name: B.name });
    S3.store("budget:list", l);
    S3.store("budget:open", B.id);
    if (!ok && !saveNow.warned) { saveNow.warned = true; S3.toast("Could not save in this browser (storage full or blocked). Download a backup!", "error"); }
  }
  var saveSoon = S3.debounce(saveNow, 250);
  function load(id) {
    var raw = S3.store("budget:b:" + id);
    if (!raw) return null;
    try { return C.normalize(raw); } catch (e) { return null; }
  }
  // Run a change with undo. fn may return false to cancel.
  function change(fn, label) {
    var snap = JSON.stringify(B);
    if (fn() === false) return;
    undoStack.push(snap);
    if (undoStack.length > 40) undoStack.shift();
    saveSoon();
    render();
    if (label) S3.toast(label);
  }
  function undo() {
    if (!undoStack.length) return;
    B = C.normalize(JSON.parse(undoStack.pop()));
    saveSoon(); render(); S3.toast("Undone");
  }

  // ---------- formatting helpers ----------
  function f(minor) { return C.fmt(minor, B.cur, B.dec); }
  function amt(str) { return C.parseAmount(str, B.dec); }
  function monthName(m, short) {
    return new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleDateString("en", { month: short ? "short" : "long", year: "numeric" });
  }
  function dayName(d) {
    var dt = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
    return dt.toLocaleDateString("en", { day: "numeric", month: "short", year: d.slice(0, 4) === C.today().slice(0, 4) ? undefined : "2-digit" });
  }
  function catName(id) {
    if (id === C.INC) return "Ready to assign";
    var x = id && C.findCat(B, id);
    return x ? x.c.name : "Uncategorized";
  }
  function acctName(id) { var a = C.findAcct(B, id); return a ? a.name : "?"; }
  function option(value, text, selected) { var o = h("option", { value: value }, [text]); if (selected) o.selected = true; return o; }
  function catSelect(sel, selected, withInc, withNone) {
    sel.textContent = "";
    if (withNone) sel.appendChild(option("", "Uncategorized", !selected));
    if (withInc) sel.appendChild(option(C.INC, "Ready to assign (income)", selected === C.INC));
    B.groups.forEach(function (g) {
      if (!g.cats.length) return;
      var og = h("optgroup", { label: g.name });
      g.cats.forEach(function (c) { og.appendChild(option(c.id, c.name, c.id === selected)); });
      sel.appendChild(og);
    });
    return sel;
  }
  function acctSelect(sel, selected, opts) {
    opts = opts || {};
    sel.textContent = "";
    if (opts.all) sel.appendChild(option("", "All accounts", !selected));
    B.accounts.forEach(function (a) {
      if (a.closed && a.id !== selected && !opts.all) return;
      if (opts.except && a.id === opts.except) return;
      sel.appendChild(option(a.id, a.name + (a.closed ? " (closed)" : ""), a.id === selected));
    });
    return sel;
  }

  // ---------- sheets (modal forms) ----------
  function sheet(title, body, buttons, opts) {
    opts = opts || {};
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": title });
    var form = h("form", { "class": "s3-sheet bud-sheet" + (opts.wide ? " wide" : "") });
    var foot = h("div", { "class": "foot" });
    form.appendChild(h("div", { "class": "row between" }, [h("h2", { text: title }),
      h("button", { "class": "btn ghost icon", type: "button", "aria-label": "Close", html: S3.icon("x"), onclick: close })]));
    form.appendChild(body);
    (buttons || []).forEach(function (b) {
      var el = h("button", { "class": "btn " + (b.cls || ""), type: b.submit ? "submit" : "button" }, [b.label]);
      if (!b.submit) el.addEventListener("click", function () { if (b.run() !== false) close(); });
      foot.appendChild(el);
    });
    var submit = (buttons || []).filter(function (b) { return b.submit; })[0];
    form.addEventListener("submit", function (e) { e.preventDefault(); if (submit && submit.run() !== false) close(); });
    form.appendChild(foot);
    m.appendChild(form);
    function close() { m.remove(); document.removeEventListener("keydown", onKey, true); if (opts.onClose) opts.onClose(); if (opener && opener.focus) opener.focus(); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    var opener = document.activeElement;
    m.addEventListener("mousedown", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(m);
    var first = opts.focus ? $(opts.focus, form) : form.querySelector("input:not([type=hidden]):not([type=checkbox]),select,textarea");
    if (first) { first.focus(); if (first.select && first.tagName === "INPUT") first.select(); }
    return { el: form, close: close };
  }
  function field(label, input, extra) { return h("label", { "class": "field" }, [label, input].concat(extra || [])); }
  function ask(title, text, okLabel, danger) {
    return new Promise(function (res) {
      var done = false;
      sheet(title, h("p", { "class": "muted", text: text }), [
        { label: "Cancel", cls: "ghost", run: function () { done = true; res(false); } },
        { label: okLabel || "OK", cls: danger ? "danger" : "primary", submit: true, run: function () { done = true; res(true); } }
      ], { onClose: function () { if (!done) res(false); } });
    });
  }

  // ---------- welcome / budgets ----------
  function showWelcome() {
    B = null;
    $("#app").hidden = true; $("#welcome").hidden = false;
    var cur = $("#nbCur");
    if (!cur.options.length) {
      var names = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "currency" }) : null;
      C.CURRENCIES.forEach(function (c) { cur.appendChild(option(c, c + (names ? " · " + names.of(c) : ""), false)); });
      cur.value = guessCurrency();
    }
    $("#backToApp").hidden = !list().length;
  }
  function guessCurrency() {
    var loc = (navigator.language || "").toUpperCase(), tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    var byTz = { "Asia/Amman": "JOD", "Asia/Riyadh": "SAR", "Asia/Dubai": "AED", "Asia/Kuwait": "KWD", "Asia/Qatar": "QAR", "Asia/Bahrain": "BHD",
      "Asia/Muscat": "OMR", "Africa/Cairo": "EGP", "Asia/Baghdad": "IQD", "Asia/Beirut": "LBP", "Africa/Casablanca": "MAD", "Africa/Tunis": "TND",
      "Europe/London": "GBP", "Asia/Kolkata": "INR", "Asia/Karachi": "PKR", "Europe/Istanbul": "TRY", "Asia/Tokyo": "JPY" };
    if (byTz[tz]) return byTz[tz];
    if (/^en-US|^es-US/.test(loc)) return "USD";
    if (tz.indexOf("Europe/") === 0) return "EUR";
    return "USD";
  }
  function openBudget(b, fresh) {
    B = b; undoStack = []; M = C.monthOf(C.today());
    var due = C.runDue(B);
    saveNow();
    $("#welcome").hidden = true; $("#app").hidden = false;
    setView(fresh && !B.accounts.length ? "accounts" : "plan");
    if (due) S3.toast(due + " scheduled transaction" + (due > 1 ? "s" : "") + " entered");
    if (fresh && !B.accounts.length) $("#afName").focus();
  }
  function wireWelcome() {
    var lang = "en";
    $$("#nbLang button").forEach(function (b) {
      b.addEventListener("click", function () { lang = b.dataset.v; $$("#nbLang button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); });
    });
    $("#newForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var b = C.newBudget({ name: $("#nbName").value.trim() || "My budget", cur: $("#nbCur").value, lang: lang, starter: lang !== "none" });
      openBudget(b, true);
      S3.toast("Budget created. Add your first account.");
    });
    $("#trySample").addEventListener("click", function () { openBudget(C.sample($("#nbCur").value), false); S3.toast("Sample budget loaded. Change anything, it is yours."); });
    $("#openBackup").addEventListener("click", pickBackup);
    $("#backToApp").addEventListener("click", function () { var b = load(S3.store("budget:open")) || load((list()[0] || {}).id); if (b) openBudget(b); });
  }
  function pickBackup() {
    var inp = h("input", { type: "file", accept: ".json,application/json" });
    inp.addEventListener("change", function () {
      var file = inp.files[0]; if (!file) return;
      S3.readFile(file, "text").then(function (txt) {
        var b = C.normalize(JSON.parse(txt));
        var same = list().filter(function (x) { return x.id === b.id; })[0];
        if (!same) { openBudget(b); S3.toast("Backup opened: " + b.name); return; }
        // the same budget is already saved here: replace it, or keep both
        sheet("Open backup", h("p", { "class": "muted", text: "“" + same.name + "” is already saved in this browser. Replace it with the backup, or keep both?" }), [
          { label: "Keep both", cls: "ghost", run: function () { b.id = C.uid(); b.name += " (backup)"; openBudget(b); S3.toast("Backup opened as a new budget"); } },
          { label: "Replace", cls: "primary", submit: true, run: function () { openBudget(b); S3.toast("Budget restored from backup"); } }]);
      }).catch(function () { S3.toast("That file is not a budget backup", "error"); });
    });
    inp.click();
  }
  function fileBase() { return (B.name || "budget").replace(/[^\w\u0600-\u06FF\- ]+/g, "").trim().replace(/\s+/g, "-") || "budget"; }
  function downloadBackup() {
    B.backedUp = C.today();
    saveNow();
    S3.download(JSON.stringify({ app: "s3-budget", v: 1, saved: new Date().toISOString(), budget: B }, null, 1), fileBase() + "-" + C.today() + ".budget.json", "application/json");
    S3.done();
    render();
  }

  // ---------- views ----------
  function setView(v) {
    view = v;
    $$("#tabs button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.view === v)); });
    $$(".view").forEach(function (el) { el.hidden = el.id !== "view-" + v; });
    render();
  }
  function render() {
    if (!B) return;
    $("#budgetName").textContent = B.name;
    $("#undoBtn").disabled = !undoStack.length;
    if (view === "plan") renderPlan();
    else if (view === "tx") renderTx();
    else if (view === "accounts") renderAccounts();
    else if (view === "reports") renderReports();
    renderNag();
  }
  // Gentle reminder: the budget lives in this browser only.
  function renderNag() {
    var nag = $("#nag"), days = B.backedUp ? Math.round((Date.parse(C.today()) - Date.parse(B.backedUp)) / 864e5) : null;
    var age = Math.round((Date.parse(C.today()) - Date.parse(B.created)) / 864e5);
    var show = B.tx.length >= 15 && age >= 3 && (days == null || days > 30) && S3.store("budget:nag") !== C.today();
    nag.hidden = !show; nag.textContent = "";
    if (!show) return;
    nag.appendChild(h("span", { text: days == null ? "Your budget is saved only in this browser. Keep a backup file in case browser data gets cleared." :
      "Your last backup is " + days + " days old." }));
    nag.appendChild(h("button", { "class": "btn primary small", type: "button", onclick: downloadBackup, html: S3.icon("download") + "Download backup" }));
    nag.appendChild(h("button", { "class": "btn ghost small", type: "button", onclick: function () { S3.store("budget:nag", C.today()); renderNag(); } }, ["Not now"]));
  }

  // ----- plan -----
  function renderPlan() {
    var r = C.compute(B, M);
    $("#monthLabel").textContent = monthName(M);
    var box = $("#rta"), rta = r.rta;
    box.className = "bud-rta " + (rta > 0 ? "pos" : rta < 0 ? "neg" : "");
    $("#rtaAmt").textContent = f(rta);
    $("#rtaLbl").textContent = rta < 0 ? "Assigned more than you have. Take some back from a category." :
      rta > 0 ? "Ready to assign. Give it a job." : B.accounts.length ? "All money assigned. Nice." : "Add an account to start.";
    var acts = $("#rtaActions"); acts.textContent = "";
    var needTotal = 0, overspent = 0;
    C.allCats(B).forEach(function (c) { needTotal += r.cats[c.id].need; if (r.cats[c.id].available < 0) overspent++; });
    if (needTotal > 0 && rta > 0) acts.appendChild(h("button", { "class": "btn small primary", type: "button", onclick: function () {
      var n; change(function () { n = C.assignTargets(B, M); if (!n) return false; }, ""); if (n) S3.toast("Assigned " + f(n) + " to targets");
    } }, ["Assign what targets need (" + f(needTotal) + ")"]));
    if (overspent && rta > 0) acts.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () {
      var n; change(function () { n = C.coverOverspending(B, M); if (!n) return false; }); if (n) S3.toast("Covered " + f(n) + " of overspending");
    } }, ["Cover overspending"]));
    if (!B.assign[M] && B.assign[C.addMonths(M, -1)]) acts.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () {
      change(function () { if (!C.copyLastMonth(B, M)) return false; }, "Copied last month's amounts");
    } }, ["Copy last month"]));
    if (r.overspentBefore < 0) acts.appendChild(h("span", { "class": "faint", text: "Includes " + f(-r.overspentBefore) + " overspent in earlier months" }));

    var plan = $("#plan"); plan.textContent = "";
    plan.appendChild(h("div", { "class": "pl-row pl-head" }, [h("span", { text: "Category" }), h("span", { text: "Assigned" }),
      h("span", { "class": "pl-act-col", text: "Activity" }), h("span", { text: "Available" })]));
    if (!B.groups.length) plan.appendChild(h("div", { "class": "empty" }, [h("b", { text: "No categories yet" }), "Add a category group, then the categories you spend on."]));
    var inputs = [];
    B.groups.forEach(function (g) {
      var sa = 0, sc = 0, sv = 0;
      g.cats.forEach(function (c) { var x = r.cats[c.id]; sa += x.assigned; sc += x.activity; sv += x.available; });
      plan.appendChild(h("div", { "class": "pl-row pl-group" }, [
        h("div", { "class": "pl-name" }, [
          h("button", { type: "button", dir: "auto", title: "Rename or delete group", onclick: function () { groupSheet(g); } }, [g.name || "Group"]),
          h("button", { "class": "btn ghost icon small pl-add", type: "button", title: "Add category", "aria-label": "Add category to " + g.name, html: S3.icon("plus"), onclick: function () { addCategory(g); } })]),
        h("span", { "class": "pl-num", text: f(sa) }), h("span", { "class": "pl-num pl-act-col", text: f(sc) }), h("span", { "class": "pl-num", text: f(sv) })]));
      g.cats.forEach(function (c) {
        var x = r.cats[c.id];
        var inp = h("input", { "class": "pl-in", inputmode: "decimal", autocomplete: "off", "aria-label": "Assigned to " + c.name, "data-cat": c.id });
        inp.value = x.assigned ? C.toInput(x.assigned, B.dec) : "";
        inp.placeholder = f(0);
        inputs.push(inp);
        wireAssign(inp, c, inputs);
        var st = c.target ? targetStatus(c, x) : null;
        var cls = x.available < 0 ? "neg" : x.need > 0 ? "under" : x.available > 0 ? "pos" : "";
        var name = h("div", { "class": "pl-name" }, [h("button", { type: "button", dir: "auto", onclick: function () { catSheet(c.id); } }, [c.name || "Category"])]);
        if (x.available < 0) name.appendChild(h("span", { "class": "pl-sub warn", text: "Overspent by " + f(-x.available) }));
        else if (st) name.appendChild(h("span", { "class": "pl-sub " + st.cls, text: st.text }));
        if (st && st.pct != null) name.appendChild(h("div", { "class": "pl-bar" }, [h("i", { style: "width:" + st.pct + "%" })]));
        plan.appendChild(h("div", { "class": "pl-row" }, [name, h("div", {}, [inp]),
          h("div", { "class": "pl-num pl-act-col" }, [h("button", { "class": "pl-act", type: "button", title: "See these transactions", onclick: function () { showCatTx(c.id); } }, [f(x.activity)])]),
          h("div", { "class": "pl-num" }, [h("button", { "class": "pill " + cls, type: "button", title: "Move money", onclick: function () { catSheet(c.id, true); } }, [f(x.available)])])]));
      });
    });
    var u = r.cats[C.UNCAT];
    if (u && (u.activity || u.available)) {
      plan.appendChild(h("div", { "class": "pl-row" }, [
        h("div", { "class": "pl-name" }, [h("button", { type: "button", onclick: function () { showCatTx(null); } }, ["Uncategorized"]),
          h("span", { "class": "pl-sub warn", text: "Give these transactions a category" })]),
        h("span", {}), h("span", { "class": "pl-num pl-act-col", text: f(u.activity) }),
        h("div", { "class": "pl-num" }, [h("span", { "class": "pill " + (u.available < 0 ? "neg" : ""), text: f(u.available) })])]));
    }
    if (focusAfter) {
      var t = plan.querySelector('[data-cat="' + focusAfter + '"]'); focusAfter = null;
      if (t) { t.focus(); t.select(); }
    }
  }
  function targetStatus(c, x) {
    var t = c.target, goal = t.amt;
    if (t.type === "monthly") {
      var pct = goal ? Math.min(100, Math.round(100 * Math.max(0, x.assigned) / goal)) : 100;
      return x.need > 0 ? { cls: "warn", text: f(x.need) + " more needed this month", pct: pct } : { cls: "ok", text: "Target met ✓", pct: 100 };
    }
    var have = t.type === "refill" ? x.start + x.assigned : x.available;
    var p = goal ? Math.min(100, Math.round(100 * Math.max(0, have) / goal)) : 100;
    if (x.need > 0) return { cls: "warn", text: f(x.need) + " more needed this month", pct: p };
    if (t.type === "date" && have >= goal) return { cls: "ok", text: "Goal reached ✓", pct: 100 };
    return { cls: "ok", text: "On track · " + C.targetText(t, f).replace(/^\w/, function (s) { return s.toLowerCase(); }), pct: p };
  }
  function wireAssign(inp, c, inputs) {
    var orig = inp.value;
    inp.addEventListener("focus", function () { inp.select(); });
    function commit(next) {
      var v = amt(inp.value);
      if (isNaN(v)) { S3.toast("Type a number, like 120 or 100+20", "error"); inp.value = orig; return; }
      if (v === C.getAssigned(B, M, c.id)) { if (next) moveFocus(next); return; }
      focusAfter = next ? neighbour(next) : null;
      change(function () { C.setAssigned(B, M, c.id, v); });
    }
    function neighbour(dir) { var i = inputs.indexOf(inp) + dir; return inputs[i] ? inputs[i].dataset.cat : null; }
    function moveFocus(dir) { var i = inputs.indexOf(inp) + dir; if (inputs[i]) inputs[i].focus(); }
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); commit(e.shiftKey ? -1 : 1); }
      else if (e.key === "Escape") { inp.value = orig; inp.blur(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); inp.value === orig ? moveFocus(1) : commit(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); inp.value === orig ? moveFocus(-1) : commit(-1); }
    });
    inp.addEventListener("change", function () { commit(0); });
  }
  function addCategory(g) {
    var name = h("input", { "class": "input", maxlength: 80, dir: "auto", required: true, placeholder: "e.g. Groceries" });
    sheet("New category in " + (g.name || "group"), field("Name", name), [
      { label: "Cancel", cls: "ghost", run: function () {} },
      { label: "Add", cls: "primary", submit: true, run: function () {
        var n = name.value.trim(); if (!n) return false;
        change(function () { g.cats.push({ id: C.uid(), name: n, target: null, note: "" }); });
      } }]);
  }
  function groupSheet(g) {
    var isNew = !g;
    var name = h("input", { "class": "input", maxlength: 80, dir: "auto", required: true, placeholder: "e.g. Bills" });
    name.value = g ? g.name : "";
    var body = h("div", { "class": "stack" }, [field("Group name", name)]);
    var idx = g ? B.groups.indexOf(g) : -1;
    var btns = [];
    if (!isNew) {
      btns.push({ label: "Delete group", cls: "danger left", run: function () {
        if (g.cats.length) { S3.toast("Move or delete its categories first", "error"); return false; }
        change(function () { B.groups = B.groups.filter(function (x) { return x !== g; }); }, "Group deleted");
      } });
      if (idx > 0) btns.push({ label: "Move up", cls: "ghost", run: function () { change(function () { B.groups.splice(idx, 1); B.groups.splice(idx - 1, 0, g); }); } });
      if (idx < B.groups.length - 1) btns.push({ label: "Move down", cls: "ghost", run: function () { change(function () { B.groups.splice(idx, 1); B.groups.splice(idx + 1, 0, g); }); } });
    }
    btns.push({ label: isNew ? "Add group" : "Save", cls: "primary", submit: true, run: function () {
      var n = name.value.trim(); if (!n) return false;
      change(function () { if (isNew) B.groups.push({ id: C.uid(), name: n, cats: [] }); else g.name = n; });
    } });
    sheet(isNew ? "New category group" : "Category group", body, btns);
  }

  function catSheet(id, focusMove) {
    var fc = C.findCat(B, id); if (!fc) return;
    var c = fc.c, r = C.compute(B, M), x = r.cats[id];
    var name = h("input", { "class": "input", maxlength: 80, dir: "auto", required: true }); name.value = c.name;
    var grp = h("select", { "class": "select" });
    B.groups.forEach(function (g) { grp.appendChild(option(g.id, g.name, g === fc.g)); });
    var stats = h("div", { "class": "mini-stats" }, [
      h("div", {}, [h("b", { text: f(x.assigned) }), h("span", { text: "Assigned in " + monthName(M, true) })]),
      h("div", {}, [h("b", { text: f(x.activity) }), h("span", { text: "Activity" })]),
      h("div", {}, [h("b", { text: f(x.available), style: x.available < 0 ? "color:var(--danger)" : "" }), h("span", { text: "Available" })])]);

    // move money
    var mvAmt = h("input", { "class": "input", inputmode: "decimal", autocomplete: "off", placeholder: "Amount", "aria-label": "Amount to move" });
    var mvDir = h("select", { "class": "select", "aria-label": "Direction" }, [option("in", "into " + c.name + " from", x.available < 0), option("out", "out of " + c.name + " to", x.available >= 0)]);
    var mvOther = catSelect(h("select", { "class": "select", "aria-label": "Other category" }), C.INC, true, false);
    mvOther.options[0].textContent = "Ready to assign";
    $$("option", mvOther).forEach(function (o) { if (o.value === id) o.remove(); });
    if (x.available < 0) mvAmt.value = C.toInput(-x.available, B.dec);
    var mvBtn = h("button", { "class": "btn", type: "button", onclick: function () {
      var v = amt(mvAmt.value);
      if (!(v > 0)) { S3.toast("Enter an amount to move", "error"); mvAmt.focus(); return; }
      var from = mvDir.value === "in" ? mvOther.value : id, to = mvDir.value === "in" ? id : mvOther.value;
      change(function () { C.moveMoney(B, M, from, to, v); }, "Moved " + f(v) + " from " + catName(from) + " to " + catName(to));
      s.close();
    } }, ["Move"]);
    var move = h("div", { "class": "stack" }, [h("b", { text: "Move money" }), h("div", { "class": "row" }, [h("div", { "class": "grow", style: "min-width:110px" }, [mvAmt]), mvDir]), h("div", { "class": "row" }, [h("div", { "class": "grow" }, [mvOther]), mvBtn])]);

    // target
    var tType = h("select", { "class": "select" }, [option("", "No target", !c.target),
      option("monthly", "Assign a set amount every month", c.target && c.target.type === "monthly"),
      option("refill", "Keep a set amount available each month", c.target && c.target.type === "refill"),
      option("date", "Save a total by a date", c.target && c.target.type === "date")]);
    var tAmt = h("input", { "class": "input", inputmode: "decimal", autocomplete: "off", placeholder: "Amount" });
    tAmt.value = c.target ? C.toInput(c.target.amt, B.dec) : "";
    var tDate = h("input", { "class": "input", type: "month" }); tDate.value = c.target && c.target.date ? c.target.date : C.addMonths(M, 6);
    var tRow = h("div", { "class": "grid-2" }, [field("Amount", tAmt), field("By", tDate)]);
    function syncTarget() { tRow.hidden = !tType.value; tDate.parentNode.hidden = tType.value !== "date"; }
    tType.addEventListener("change", function () { syncTarget(); if (tType.value) tAmt.focus(); });
    var note = h("textarea", { "class": "textarea prose", rows: 2, maxlength: 500, dir: "auto", placeholder: "Optional note", style: "min-height:60px" }); note.value = c.note || "";

    var body = h("div", { "class": "stack" }, [stats, move, h("hr"), h("div", { "class": "grid-2" }, [field("Name", name), field("Group", grp)]),
      field("Target", tType), tRow, field("Note", note)]);
    syncTarget();
    var s = sheet(c.name || "Category", body, [
      { label: "Delete", cls: "danger left", run: function () { deleteCatFlow(id); } },
      { label: "Transactions", cls: "ghost", run: function () { showCatTx(id); } },
      { label: "Save", cls: "primary", submit: true, run: function () {
        var n = name.value.trim(); if (!n) { name.focus(); return false; }
        var t = null;
        if (tType.value) {
          var ta = amt(tAmt.value);
          if (!(ta > 0)) { S3.toast("Enter the target amount", "error"); tAmt.focus(); return false; }
          if (tType.value === "date" && !/^\d{4}-\d{2}$/.test(tDate.value)) { S3.toast("Pick the month you need it by", "error"); return false; }
          t = { type: tType.value, amt: ta, date: tType.value === "date" ? tDate.value : null };
        }
        change(function () {
          c.name = n; c.target = t; c.note = note.value.trim();
          var ng = B.groups.filter(function (g) { return g.id === grp.value; })[0];
          if (ng && ng !== fc.g) { fc.g.cats = fc.g.cats.filter(function (k) { return k !== c; }); ng.cats.push(c); }
        });
      } }], { focus: focusMove ? "input[inputmode]" : null });
  }
  function deleteCatFlow(id) {
    var used = B.tx.some(function (t) { return t.c === id; }) || B.sched.some(function (t) { return t.c === id; });
    if (!used) { change(function () { C.deleteCategory(B, id, null); }, "Category deleted"); return; }
    var to = catSelect(h("select", { "class": "select" }), null, false, true);
    $$("option", to).forEach(function (o) { if (o.value === id) o.remove(); });
    sheet("Delete " + catName(id), h("div", { "class": "stack" }, [h("p", { "class": "muted", text: "This category has transactions. Where should they and the money assigned to it go?" }), field("Move to", to)]), [
      { label: "Cancel", cls: "ghost", run: function () {} },
      { label: "Delete category", cls: "danger", submit: true, run: function () { change(function () { C.deleteCategory(B, id, to.value || null); }, "Category deleted"); } }]);
  }
  function showCatTx(id) {
    txFilter = { acct: "", q: "", cat: id || C.UNCAT, month: id ? M : null, limit: 150 };
    setView("tx");
  }

  // ----- transactions -----
  function txMatches(t) {
    if (txFilter.acct && t.a !== txFilter.acct) return false;
    if (txFilter.cat) {
      if (txFilter.cat === C.UNCAT ? (t.c || t.xfer) : t.c !== txFilter.cat) return false;
    }
    if (txFilter.month && C.monthOf(t.d) !== txFilter.month) return false;
    var q = txFilter.q.trim().toLowerCase();
    if (q) {
      var hay = [t.p, t.m, t.xfer ? "transfer " + acctName(t.xfer) : catName(t.c), acctName(t.a), C.toInput(Math.abs(t.amt), B.dec)].join(" ").toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }
  function renderTx() {
    var sel = acctSelect($("#txAcct"), txFilter.acct, { all: true });
    sel.value = txFilter.acct;
    if ($("#txSearch").value !== txFilter.q) $("#txSearch").value = txFilter.q;
    var chips = $("#txFilters"); chips.textContent = "";
    if (txFilter.cat || txFilter.month) {
      var label = (txFilter.cat ? (txFilter.cat === C.UNCAT ? "Uncategorized" : catName(txFilter.cat)) : "") + (txFilter.month ? " · " + monthName(txFilter.month, true) : "");
      chips.appendChild(h("span", { "class": "chip accent" }, [label, h("button", { type: "button", "aria-label": "Clear filter", text: "✕", onclick: function () { txFilter.cat = null; txFilter.month = null; renderTx(); } })]));
    }
    var sum = $("#acctSummary"); sum.textContent = "";
    if (txFilter.acct) {
      var bal = C.balances(B)[txFilter.acct], a = C.findAcct(B, txFilter.acct);
      if (bal && a) sum.appendChild(h("div", { "class": "bud-acctsum" }, [
        h("span", {}, [h("b", { text: f(bal.total) }), " balance"]), h("span", { text: "Cleared " + f(bal.cleared) }), h("span", { text: "Uncleared " + f(bal.uncleared) })]));
    }
    renderSched();
    var box = $("#txList"); box.textContent = "";
    if (!B.accounts.length) {
      box.appendChild(h("div", { "class": "empty" }, [h("b", { text: "No accounts yet" }), "Add an account first, then record what you spend.",
        h("div", { "class": "mt" }, [h("button", { "class": "btn primary", type: "button", onclick: function () { setView("accounts"); } }, ["Add an account"])])]));
      return;
    }
    var rows = C.sortedTx(B).filter(txMatches);
    var showBal = !!txFilter.acct && !txFilter.cat && !txFilter.month && !txFilter.q.trim();
    var running = {};
    if (showBal) {
      // running balance needs every transaction of the account, oldest first; same-day order follows the list
      var tot = 0; rows.slice().reverse().forEach(function (t) { tot += t.amt; running[t.id] = tot; });
    }
    var cls = "tx-row" + (showBal ? "" : " no-bal");
    box.appendChild(h("div", { "class": cls + " tx-head" }, [h("span", { text: "Date" }), h("span", { text: "Payee" }), h("span", { text: "Category" }),
      h("span", { "class": "tx-amt", text: "Amount" })].concat(showBal ? [h("span", { "class": "tx-bal", text: "Balance" })] : []).concat([h("span", { text: "" })])));
    if (!rows.length) {
      box.appendChild(h("div", { "class": "empty" }, [h("b", { text: B.tx.length ? "Nothing matches" : "No transactions yet" }),
        B.tx.length ? "Try another search or account." : "Press the Transaction button (or N) to record spending or income."]));
      return;
    }
    var td = C.today();
    rows.slice(0, txFilter.limit).forEach(function (t) {
      var catText = t.xfer ? (t.amt < 0 ? "→ " : "← ") + "Transfer: " + acctName(t.xfer) : catName(t.c);
      var none = !t.xfer && !t.c;
      var clr = h("button", { "class": "tx-clr" + (t.clr === 2 ? " rec" : t.clr ? " on" : ""), type: "button", title: t.clr === 2 ? "Reconciled" : t.clr ? "Cleared (click to unclear)" : "Not cleared (click when it shows in your bank)",
        "aria-label": t.clr ? "Cleared" : "Not cleared", text: t.clr === 2 ? "🔒" : "✓", onclick: function (e) {
          e.stopPropagation();
          if (t.clr === 2) { S3.toast("Reconciled. Edit the transaction to change it."); return; }
          change(function () { t.clr = t.clr ? 0 : 1; });
        } });
      var sub = [];
      if (!txFilter.acct) sub.push(acctName(t.a));
      if (t.m) sub.push(t.m);
      var row = h("div", { "class": cls + (t.d > td ? " future" : ""), role: "button", tabindex: "0" }, [
        h("span", { "class": "tx-date", text: dayName(t.d) }),
        h("div", { "class": "tx-main" }, [h("b", { dir: "auto", text: t.p || "—" })].concat(sub.length ? [h("span", { dir: "auto", text: sub.join(" · ") })] : [])),
        h("span", { "class": "tx-cat" + (none ? " none" : ""), dir: "auto", text: catText }),
        h("span", { "class": "tx-amt" + (t.amt > 0 ? " in" : ""), text: (t.amt > 0 ? "+" : "") + f(t.amt) })
      ].concat(showBal ? [h("span", { "class": "tx-bal", text: f(running[t.id]) })] : []).concat([clr]));
      row.addEventListener("click", function () { txSheet(t.id); });
      row.addEventListener("keydown", function (e) { if (e.key === "Enter") txSheet(t.id); });
      box.appendChild(row);
    });
    if (rows.length > txFilter.limit) {
      box.appendChild(h("div", { "class": "tx-more" }, [h("button", { "class": "btn small", type: "button", onclick: function () { txFilter.limit += 300; renderTx(); } },
        ["Show more (" + (rows.length - txFilter.limit) + " older)"])]));
    }
  }

  function renderSched() {
    var box = $("#schedList"); box.textContent = "";
    var items = B.sched.filter(function (s) { return !txFilter.acct || s.a === txFilter.acct || s.xfer === txFilter.acct; })
      .sort(function (x, y) { return x.next < y.next ? -1 : x.next > y.next ? 1 : 0; });
    box.hidden = !items.length || !!txFilter.cat || !!txFilter.q.trim();
    if (box.hidden) return;
    box.appendChild(h("h3", { text: "Upcoming · " + items.length }));
    items.forEach(function (s) {
      box.appendChild(h("div", { "class": "sc-row" }, [
        h("span", { "class": "tx-date", text: dayName(s.next) }),
        h("div", { "class": "tx-main" }, [h("b", { dir: "auto", text: s.p || (s.xfer ? "Transfer" : "—") }),
          h("span", { dir: "auto", text: C.FREQ[s.freq] + " · " + acctName(s.a) + " · " + (s.xfer ? "Transfer: " + acctName(s.xfer) : catName(s.c)) })]),
        h("span", { "class": "tx-amt" + (s.amt > 0 ? " in" : ""), text: (s.amt > 0 ? "+" : "") + f(s.amt) }),
        h("button", { "class": "btn small", type: "button", title: "Record it now with its date", onclick: function () { change(function () { C.enterSched(B, s.id); }, "Entered"); } }, ["Enter"]),
        h("button", { "class": "btn ghost small", type: "button", title: "Skip this one", onclick: function () { change(function () { C.skipSched(B, s.id); }, "Skipped"); } }, ["Skip"]),
        h("button", { "class": "btn ghost small", type: "button", onclick: function () { schedSheet(s); } }, ["Edit"])]));
    });
  }
  function schedSheet(s) {
    var amount = h("input", { "class": "input bud-amount", inputmode: "decimal", autocomplete: "off" }); amount.value = C.toInput(Math.abs(s.amt), B.dec);
    var inflow = h("input", { type: "checkbox" }); inflow.checked = s.amt > 0;
    var next = h("input", { "class": "input", type: "date", required: true }); next.value = s.next;
    var freq = h("select", { "class": "select" }); Object.keys(C.FREQ).forEach(function (k) { freq.appendChild(option(k, C.FREQ[k], k === s.freq)); });
    var payee = h("input", { "class": "input", maxlength: 120, dir: "auto" }); payee.value = s.p;
    var cat = catSelect(h("select", { "class": "select" }), s.c, true, true);
    var body = h("div", { "class": "stack" }, [field("Amount", amount), h("label", { "class": "check" }, [inflow, "Money coming in (income or refund)"]),
      h("div", { "class": "grid-2" }, [field("Next date", next), field("Repeat", freq)]), field("Payee", payee)].concat(s.xfer ? [] : [field("Category", cat)]));
    sheet("Scheduled transaction", body, [
      { label: "Delete", cls: "danger left", run: function () { change(function () { B.sched = B.sched.filter(function (x) { return x.id !== s.id; }); }, "Schedule deleted"); } },
      { label: "Save", cls: "primary", submit: true, run: function () {
        var v = amt(amount.value);
        if (isNaN(v) || !v) { S3.toast("Enter an amount", "error"); return false; }
        if (!C.validDay(next.value)) { S3.toast("Pick a date", "error"); return false; }
        change(function () {
          s.amt = Math.abs(v) * (inflow.checked ? 1 : -1); s.next = next.value; s.day = +next.value.slice(8, 10); s.freq = freq.value; s.p = payee.value.trim();
          if (!s.xfer) s.c = cat.value || null;
        });
      } }]);
  }

  // ----- CSV import -----
  function decodeText(buf) {
    var bytes = new Uint8Array(buf);
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch (e) {
      // older Arabic bank exports are often Windows-1256; other legacy files Windows-1252
      var arabic = 0; for (var i = 0; i < bytes.length && i < 20000; i++) if (bytes[i] >= 0xC1 && bytes[i] <= 0xDA) arabic++;
      try { return new TextDecoder(arabic > 20 ? "windows-1256" : "windows-1252").decode(bytes); } catch (e2) { return new TextDecoder().decode(bytes); }
    }
  }
  function importSheet() {
    if (!B.accounts.length) { S3.toast("Add the account first, then import its CSV"); setView("accounts"); return; }
    var inp = h("input", { type: "file", accept: ".csv,.txt,text/csv,text/plain" });
    inp.addEventListener("change", function () {
      var file = inp.files[0]; if (!file) return;
      if (file.size > 20e6) { S3.toast("That file is too big for a bank export (over 20 MB)", "error"); return; }
      S3.readFile(file).then(function (buf) { importMap(decodeText(buf), file.name); }).catch(function () { S3.toast("Could not read that file", "error"); });
    });
    inp.click();
  }
  function guessNoHeader(rows) {
    var sample = rows.slice(0, 30), n = Math.max.apply(null, sample.map(function (r) { return r.length; }));
    var g = { date: -1, payee: -1, memo: -1, amount: -1, out: -1, inn: -1 }, best = 0;
    for (var c = 0; c < n; c++) {
      var col = sample.map(function (r) { return r[c] || ""; });
      var dates = col.filter(function (v) { return C.parseDate(v, "dmy") || C.parseDate(v, "mdy"); }).length / col.length;
      var nums = col.filter(function (v) { return /\d/.test(v) && !/[a-z]{3,}/i.test(v) && !isNaN(C.parseBankAmount(v, 2)); }).length / col.length;
      var len = col.reduce(function (a, v) { return a + v.length; }, 0) / col.length;
      if (dates > 0.8 && g.date < 0) g.date = c;
      else if (nums > 0.8 && dates < 0.2) g.amount = c; // the last number column is usually the balance, so prefer the first
      else if (len > best && dates < 0.2) { best = len; g.payee = c; }
      if (nums > 0.8 && dates < 0.2 && g.amount !== c && g._first == null) g._first = c;
    }
    if (g._first != null) g.amount = g._first;
    delete g._first;
    return g;
  }
  function importMap(text, fileName) {
    var parsed = C.parseCSV(text), rows = parsed.rows;
    if (!rows.length) { S3.toast("That file has no rows", "error"); return; }
    var g = C.guessColumns(rows[0]);
    var hasHeader = g.date >= 0 && (g.amount >= 0 || g.out >= 0);
    if (!hasHeader) g = guessNoHeader(rows);
    var width = Math.max.apply(null, rows.slice(0, 50).map(function (r) { return r.length; }));
    var colName = function (i) { var hd = hasHeader ? rows[0][i] : ""; var sample = (rows[hasHeader ? 1 : 0] || [])[i] || ""; return (hd || "Column " + (i + 1)) + (sample ? " (" + sample.slice(0, 24) + ")" : ""); };
    function colSelect(val, none) {
      var sel = h("select", { "class": "select" }, [option("-1", none || "—", val < 0)]);
      for (var i = 0; i < width; i++) sel.appendChild(option(String(i), colName(i), i === val));
      return sel;
    }
    var map = { date: g.date, payee: g.payee, memo: g.memo, amount: g.amount, out: g.out, inn: g.inn, header: hasHeader, flip: false, order: "dmy" };
    map.order = map.date >= 0 ? C.guessDateOrder(rows.slice(hasHeader ? 1 : 0, 200).map(function (r) { return r[map.date]; })) : "dmy";
    var acct = acctSelect(h("select", { "class": "select" }), txFilter.acct || S3.store("budget:lastAcct") || "");
    var sDate = colSelect(map.date), sPayee = colSelect(map.payee), sMemo = colSelect(map.memo, "None");
    var sAmt = colSelect(map.amount), sOut = colSelect(map.out), sIn = colSelect(map.inn);
    var mode = map.amount < 0 && map.out >= 0 ? "split" : "single";
    var modeSel = h("select", { "class": "select" }, [option("single", "One amount column (minus = money out)", mode === "single"), option("split", "Separate money out and money in columns", mode === "split")]);
    var order = h("select", { "class": "select" }, [option("dmy", "Day / month / year", map.order === "dmy"), option("mdy", "Month / day / year", map.order === "mdy"), option("ymd", "Year / month / day", map.order === "ymd")]);
    var head = h("input", { type: "checkbox" }); head.checked = hasHeader;
    var flip = h("input", { type: "checkbox" });
    var amtField = field("Amount", sAmt), outField = field("Money out", sOut), inField = field("Money in", sIn);
    var prev = h("div", { "class": "imp-prev" }), info = h("p", { "class": "faint" });
    var result = [];
    function update() {
      mode = modeSel.value;
      amtField.hidden = mode !== "single"; outField.hidden = inField.hidden = mode !== "split";
      map = { date: +sDate.value, payee: +sPayee.value, memo: +sMemo.value, amount: mode === "single" ? +sAmt.value : -1,
        out: mode === "split" ? +sOut.value : -1, inn: mode === "split" ? +sIn.value : -1, header: head.checked, flip: flip.checked, order: order.value };
      result = C.csvToTx(rows, map, B.dec);
      var ok = result.filter(function (r) { return r.ok; }).length;
      info.textContent = ok + " of " + result.length + " rows ready" + (result.length - ok ? ", " + (result.length - ok) + " can't be read (shown in red, they will be skipped)" : "") +
        ". Rows already in this account (same date, amount and payee) are skipped.";
      prev.textContent = "";
      var tb = h("tbody");
      result.slice(0, 60).forEach(function (r) {
        tb.appendChild(h("tr", { "class": r.ok ? "" : "bad" }, [h("td", { text: r.d ? dayName(r.d) : "?" }), h("td", { dir: "auto", text: r.p }),
          h("td", { dir: "auto", text: r.m }), h("td", { "class": "num", text: isNaN(r.amt) ? "?" : f(r.amt) })]));
      });
      prev.appendChild(h("table", {}, [h("thead", {}, [h("tr", {}, [h("th", { text: "Date" }), h("th", { text: "Payee" }), h("th", { text: "Memo" }), h("th", { "class": "num", text: "Amount" })])]), tb]));
    }
    [sDate, sPayee, sMemo, sAmt, sOut, sIn, modeSel, order, head, flip].forEach(function (el) { el.addEventListener("change", update); });
    var body = h("div", { "class": "stack" }, [
      h("p", { "class": "muted", text: "File: " + fileName + ". Match the columns, check the preview, then import. Nothing leaves your device." }),
      field("Import into account", acct),
      h("div", { "class": "imp-grid" }, [field("Date", sDate), field("Date format", order), field("Payee / description", sPayee), field("Memo", sMemo), field("Amounts", modeSel), amtField, outField, inField]),
      h("div", { "class": "row" }, [h("label", { "class": "check" }, [head, "First row is a header"]), h("label", { "class": "check" }, [flip, "Flip signs (my bank shows spending as positive)"])]),
      info, prev]);
    update();
    sheet("Import bank CSV", body, [
      { label: "Cancel", cls: "ghost", run: function () {} },
      { label: "Import", cls: "primary", submit: true, run: function () {
        if (map.date < 0 || (map.amount < 0 && map.out < 0 && map.inn < 0)) { S3.toast("Choose the date and amount columns", "error"); return false; }
        if (!result.some(function (r) { return r.ok; })) { S3.toast("No rows could be read. Check the columns and date format.", "error"); return false; }
        var res;
        change(function () { res = C.importRows(B, acct.value, result); if (!res.added) return false; });
        S3.toast(res.added ? "Imported " + res.added + " transaction" + (res.added > 1 ? "s" : "") + (res.skipped ? ", skipped " + res.skipped + " already here" : "") :
          "Nothing new: all " + res.skipped + " rows are already in this account");
        if (res.added) { S3.done(); txFilter = { acct: acct.value, q: "", cat: null, month: null, limit: 150 }; setView("tx"); }
      } }], { wide: true });
  }

  function payeeList() {
    var seen = {}, out = [];
    C.sortedTx(B).forEach(function (t) { var k = (t.p || "").trim(); if (k && !seen[k.toLowerCase()] && !t.xfer && k !== "Starting balance") { seen[k.toLowerCase()] = 1; out.push(k); } });
    return out.slice(0, 400);
  }
  function txSheet(id, preset) {
    if (!B.accounts.filter(function (a) { return !a.closed; }).length) { S3.toast("Add an account first"); setView("accounts"); return; }
    var t = id ? C.findTx(B, id) : null;
    preset = preset || {};
    var kind = t ? (t.xfer ? "transfer" : t.amt > 0 ? "income" : "spend") : preset.kind || "spend";
    var seg = h("div", { "class": "seg", role: "radiogroup" });
    [["spend", "Spending"], ["income", "Income"], ["transfer", "Transfer"]].forEach(function (k) {
      seg.appendChild(h("button", { type: "button", "aria-pressed": String(k[0] === kind), onclick: function () { kind = k[0]; sync(); } }, [k[1]]));
    });
    var amount = h("input", { "class": "input bud-amount", inputmode: "decimal", autocomplete: "off", placeholder: f(0), "aria-label": "Amount" });
    amount.value = t ? C.toInput(Math.abs(t.amt), B.dec) : "";
    var date = h("input", { "class": "input", type: "date", required: true }); date.value = t ? t.d : preset.d || C.today();
    var defAcct = t ? t.a : txFilter.acct && C.findAcct(B, txFilter.acct) && !C.findAcct(B, txFilter.acct).closed ? txFilter.acct : (S3.store("budget:lastAcct") || "");
    if (!C.findAcct(B, defAcct)) defAcct = B.accounts.filter(function (a) { return !a.closed; })[0].id;
    var acct = acctSelect(h("select", { "class": "select" }), defAcct);
    var to = h("select", { "class": "select" });
    var payee = h("input", { "class": "input", maxlength: 120, dir: "auto", autocomplete: "off", list: "payeeList", placeholder: "Who you paid or who paid you" });
    payee.value = t ? t.p : "";
    var dl = h("datalist", { id: "payeeList" }); payeeList().forEach(function (p) { dl.appendChild(h("option", { value: p })); });
    var cat = catSelect(h("select", { "class": "select" }), t ? t.c : preset.c || null, true, true);
    var memo = h("input", { "class": "input", maxlength: 300, dir: "auto", placeholder: "Optional" }); memo.value = t ? t.m : "";
    var clr = h("input", { type: "checkbox" }); clr.checked = t ? !!t.clr : false;
    var rep = null;
    if (!t) {
      rep = h("select", { "class": "select" }, [option("", "Does not repeat", true)]);
      Object.keys(C.FREQ).forEach(function (k) { if (k !== "once") rep.appendChild(option(k, C.FREQ[k], false)); });
    }
    var catTouched = !!t;
    cat.addEventListener("change", function () { catTouched = true; });
    payee.addEventListener("change", function () {
      var k = payee.value.trim().toLowerCase(), mem = B.payees[k];
      if (mem && !catTouched && kind !== "transfer") { cat.value = mem; if (mem === C.INC && kind === "spend") { kind = "income"; sync(); } }
    });
    var catField = field("Category", cat), toField = field("To account", to), payeeField = field("Payee", payee, [dl]);
    function sync() {
      $$("button", seg).forEach(function (b, i) { b.setAttribute("aria-pressed", String(["spend", "income", "transfer"][i] === kind)); });
      catField.hidden = kind === "transfer"; toField.hidden = kind !== "transfer";
      if (kind === "transfer") {
        var keep = to.value || (t && t.xfer);
        acctSelect(to, keep, { except: acct.value });
        if (!to.options.length) to.appendChild(option("", "Add a second account first", true));
      }
      if (kind === "income" && !catTouched && !t) cat.value = C.INC;
      if (kind === "spend" && cat.value === C.INC && !catTouched) cat.value = "";
    }
    acct.addEventListener("change", sync);
    var body = h("div", { "class": "stack" }, [seg, field("Amount", amount), h("div", { "class": "grid-2" }, [field("Date", date), field("Account", acct)]),
      toField, payeeField, catField, field("Memo", memo)].concat(rep ? [field("Repeat", rep)] : []).concat([h("label", { "class": "check" }, [clr, "Cleared (it shows in my bank)"])]));
    sync();
    function save() {
      var v = amt(amount.value);
      if (isNaN(v) || !v) { S3.toast("Enter an amount", "error"); amount.focus(); return false; }
      if (!C.validDay(date.value)) { S3.toast("Pick a date", "error"); date.focus(); return false; }
      v = Math.abs(v) * (kind === "income" ? 1 : -1);
      if (kind === "transfer" && !to.value) { S3.toast("Pick the account the money goes to", "error"); return false; }
      var o = { id: t ? t.id : null, a: acct.value, d: date.value, p: payee.value.trim(), m: memo.value.trim(), amt: v, clr: clr.checked,
        c: kind === "transfer" ? null : cat.value || null, xfer: kind === "transfer" ? to.value : null };
      if (t && t.clr === 2 && clr.checked) o.clr = 2;
      S3.store("budget:lastAcct", acct.value);
      if (rep && rep.value) {
        // a future date only schedules it; today or earlier records it now and schedules the next one after today
        var future = o.d > C.today();
        change(function () {
          if (!future) C.saveTx(B, o);
          var sc = C.addSched(B, { a: o.a, p: o.p, c: o.c, m: o.m, amt: o.amt, xfer: o.xfer, freq: rep.value, next: o.d });
          if (!future) { var guard = 0; do { C.skipSched(B, sc.id); } while (sc.next <= C.today() && guard++ < 1000); }
        });
        S3.toast((future ? "Scheduled for " + dayName(o.d) : "Added. Next one on " + dayName(B.sched[B.sched.length - 1].next)) + " (" + C.FREQ[rep.value].toLowerCase() + ")");
        return;
      }
      change(function () { var saved = C.saveTx(B, o); if (o.clr === 2) saved.clr = 2; });
      S3.toast(t ? "Saved" : "Added " + f(v));
    }
    var btns = [];
    if (t) btns.push({ label: "Delete", cls: "danger left", run: function () { change(function () { C.deleteTx(B, t.id); }, "Transaction deleted. Ctrl+Z to undo."); } });
    if (!t) btns.push({ label: "Save and add another", cls: "ghost", run: function () {
      if (save() === false) return false;
      setTimeout(function () { txSheet(null, { kind: kind, d: date.value }); }, 0);
    } });
    btns.push({ label: t ? "Save" : "Add", cls: "primary", submit: true, run: save });
    sheet(t ? "Edit transaction" : "New transaction", body, btns, { focus: ".bud-amount" });
  }

  // ----- accounts -----
  function renderAccounts() {
    var bal = C.balances(B), worth = 0, assets = 0, debts = 0;
    B.accounts.forEach(function (a) { var v = bal[a.id].total; worth += v; if (v >= 0) assets += v; else debts += v; });
    var w = $("#worth"); w.textContent = "";
    [["Net worth", worth], ["Assets", assets], ["Debts", debts]].forEach(function (s) {
      w.appendChild(h("div", { "class": "stat" }, [h("b", { "class": s[1] < 0 ? "neg" : "", text: f(s[1]) }), h("span", { text: s[0] })]));
    });
    var box = $("#acctList"); box.textContent = "";
    if (!B.accounts.length) box.appendChild(h("div", { "class": "card empty", style: "grid-column:1/-1" }, [h("b", { text: "Add your first account" }),
      "Start with the bank account your salary goes into and the cash in your wallet. Use today's real balance."]));
    B.accounts.slice().sort(function (x, y) { return x.closed - y.closed; }).forEach(function (a) {
      var v = bal[a.id];
      box.appendChild(h("div", { "class": "card acct" + (a.closed ? " closed" : "") }, [
        h("div", { "class": "row between" }, [h("h3", { dir: "auto", text: a.name }), h("span", { "class": "chip", text: C.ACCOUNT_TYPES[a.type] + (a.closed ? " · closed" : "") })]),
        h("div", { "class": "acct-bal" + (v.total < 0 ? " neg" : ""), text: f(v.total) }),
        h("div", { "class": "faint", text: "Cleared " + f(v.cleared) + " · Uncleared " + f(v.uncleared) }),
        h("div", { "class": "row mt" }, [
          h("button", { "class": "btn small", type: "button", onclick: function () { txFilter = { acct: a.id, q: "", cat: null, month: null, limit: 150 }; setView("tx"); } }, ["Transactions"]),
          h("button", { "class": "btn ghost small", type: "button", onclick: function () { reconcileSheet(a); } }, ["Reconcile"]),
          h("button", { "class": "btn ghost small", type: "button", onclick: function () { acctSheet(a); } }, ["Edit"])])]));
    });
    var type = $("#afType");
    if (!type.options.length) Object.keys(C.ACCOUNT_TYPES).forEach(function (k) { type.appendChild(option(k, C.ACCOUNT_TYPES[k], k === "checking")); });
    if (!$("#afDate").value) $("#afDate").value = C.today();
    $("#afBal").placeholder = f(0);
  }
  function reconcileSheet(a) {
    var bal = C.balances(B)[a.id];
    var inp = h("input", { "class": "input bud-amount", inputmode: "decimal", autocomplete: "off", placeholder: C.toInput(bal.cleared, B.dec) || "0" });
    var body = h("div", { "class": "stack" }, [
      h("p", { "class": "muted", text: "Cleared balance here: " + f(bal.cleared) + ". Open your bank app or statement and type the balance it shows (only what has cleared). If it differs, an adjustment is added so both match." }),
      field("Balance at the bank", inp)]);
    sheet("Reconcile " + a.name, body, [
      { label: "Cancel", cls: "ghost", run: function () {} },
      { label: "Reconcile", cls: "primary", submit: true, run: function () {
        var v = inp.value.trim() ? amt(inp.value) : bal.cleared;
        if (isNaN(v)) { S3.toast("Type the balance as a number", "error"); return false; }
        if ((a.type === "credit" || a.type === "loan") && v > 0 && bal.cleared < 0) v = -v;
        var res; change(function () { res = C.reconcile(B, a.id, v); });
        S3.toast(res.diff ? "Added an adjustment of " + f(res.diff) + ". Cleared transactions are now locked." : "Balanced ✓ Cleared transactions are now locked.");
        S3.done();
      } }], { focus: ".bud-amount" });
  }
  function acctSheet(a) {
    var name = h("input", { "class": "input", maxlength: 80, dir: "auto", required: true }); name.value = a.name;
    var type = h("select", { "class": "select" }); Object.keys(C.ACCOUNT_TYPES).forEach(function (k) { type.appendChild(option(k, C.ACCOUNT_TYPES[k], k === a.type)); });
    var closed = h("input", { type: "checkbox" }); closed.checked = a.closed;
    var count = B.tx.filter(function (t) { return t.a === a.id; }).length;
    var bal = C.balances(B)[a.id].total;
    var body = h("div", { "class": "stack" }, [field("Name", name), field("Type", type), h("label", { "class": "check" }, [closed, "Closed (hide from new transactions)"]),
      h("p", { "class": "faint", text: count + " transaction" + (count === 1 ? "" : "s") + ". " + (bal ? "Close it only once the balance is zero." : "") })]);
    sheet("Edit account", body, [
      { label: "Delete", cls: "danger left", run: function () {
        ask("Delete " + a.name + "?", "This deletes the account and its " + count + " transactions (transfers become uncategorized in the other account). You can undo right after.", "Delete account", true).then(function (ok) {
          if (!ok) return;
          change(function () {
            var ids = {}; B.tx.forEach(function (t) { if (t.a === a.id) ids[t.id] = 1; });
            B.tx = B.tx.filter(function (t) { return !ids[t.id]; });
            B.tx.forEach(function (t) { if (t.xfer === a.id) { t.xfer = null; t.xid = null; t.c = null; } });
            B.sched = B.sched.filter(function (s) { return s.a !== a.id && s.xfer !== a.id; });
            B.accounts = B.accounts.filter(function (x) { return x !== a; });
          }, "Account deleted. Ctrl+Z to undo.");
        });
      } },
      { label: "Save", cls: "primary", submit: true, run: function () {
        var n = name.value.trim(); if (!n) return false;
        change(function () { a.name = n; a.type = type.value; a.closed = closed.checked; });
      } }]);
  }
  function wireAccountForm() {
    $("#afType").addEventListener("change", function () {
      var debt = $("#afType").value === "credit" || $("#afType").value === "loan";
      $("#afHint").textContent = debt ? "Enter what you owe as a negative number (for example -250). It is taken out of ready to assign, so the debt is covered." :
        "The balance becomes money ready to assign in the plan.";
    });
    $("#acctForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var n = $("#afName").value.trim(), v = amt($("#afBal").value), d = $("#afDate").value || C.today(), type = $("#afType").value;
      if (!n) return;
      if (isNaN(v)) { S3.toast("Balance must be a number", "error"); $("#afBal").focus(); return; }
      if ((type === "credit" || type === "loan") && v > 0) v = -v; // people type what they owe as a positive number
      if (!C.validDay(d)) d = C.today();
      change(function () { C.addAccount(B, n, type, v, d); }, "Account added");
      $("#afName").value = ""; $("#afBal").value = "";
      S3.done();
    });
  }

  // ----- reports -----
  var NS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs, kids) {
    var el = document.createElementNS(NS, tag);
    for (var k in attrs || {}) el.setAttribute(k, attrs[k]);
    (kids || []).forEach(function (c) { el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  var compactFmt = null;
  function compact(minor) {
    compactFmt = compactFmt || new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
    return compactFmt.format(minor / Math.pow(10, B.dec));
  }
  function repRange() {
    var v = $("#repRange").value, to = C.monthOf(C.today()), dr = C.dateRange(B), from;
    if (v === "all") { from = dr.first; if (dr.last > to) to = dr.last; }
    else if (v === "ytd") from = to.slice(0, 4) + "-01";
    else from = C.addMonths(to, -(+v - 1));
    return { from: from, to: to };
  }
  function renderReports() {
    var r = repRange(), months = C.monthly(B, r.from, r.to), cats = C.spendingByCategory(B, r.from, r.to);
    $("#repSpan").textContent = monthName(r.from, true) + (r.from !== r.to ? " – " + monthName(r.to, true) : "");
    var inc = 0, sp = 0;
    months.forEach(function (m) { inc += m.income; sp += m.spending; });
    var st = $("#repStats"); st.textContent = "";
    [["Income", inc], ["Spending", sp], [inc - sp >= 0 ? "Saved" : "Spent more than earned", inc - sp], ["Average spending a month", Math.round(sp / months.length)]].forEach(function (x) {
      st.appendChild(h("div", { "class": "stat" }, [h("b", { "class": x[1] < 0 ? "neg" : "", text: f(x[1]) }), h("span", { text: x[0] })]));
    });
    var box = $("#repCats"); box.textContent = "";
    if (!cats.length) box.appendChild(h("div", { "class": "empty" }, [h("b", { text: "No spending in this period" }), "Record transactions with a category and they show up here."]));
    var total = cats.reduce(function (a, c) { return a + c.amt; }, 0), top = cats.slice(0, 12), rest = cats.slice(12);
    if (rest.length) top.push({ name: "Other (" + rest.length + ")", group: "", amt: rest.reduce(function (a, c) { return a + c.amt; }, 0) });
    var max = top.length ? top[0].amt : 1;
    top.forEach(function (c) {
      box.appendChild(h("div", { "class": "rep-bar" }, [h("span", { dir: "auto", title: c.group ? c.group + " · " + c.name : c.name, text: c.name }),
        h("b", {}, [f(c.amt) + " ", h("small", { text: Math.round(100 * c.amt / total) + "%" })]),
        h("div", { "class": "track" }, [h("i", { style: "width:" + Math.max(1, Math.round(100 * c.amt / max)) + "%" })])]));
    });
    drawMonths($("#repMonths"), months);
    drawWorth($("#repWorth"), months);
  }
  function axis(g, W, padL, padT, ph, lo, hi) {
    for (var i = 0; i <= 4; i++) {
      var v = lo + (hi - lo) * i / 4, y = padT + ph - ph * i / 4;
      g.appendChild(svg("line", { "class": "grid", x1: padL, x2: W, y1: y, y2: y }));
      g.appendChild(svg("text", { x: padL - 6, y: y + 4, "text-anchor": "end" }, [compact(v)]));
    }
  }
  function monthLabels(g, months, x0, gw, y) {
    var every = Math.ceil(months.length / 8);
    months.forEach(function (m, i) {
      if (i % every) return;
      g.appendChild(svg("text", { x: x0 + gw * i + gw / 2, y: y, "text-anchor": "middle" }, [new Date(+m.month.slice(0, 4), +m.month.slice(5, 7) - 1, 1).toLocaleDateString("en", { month: "short" }) + (months.length > 12 || m.month.slice(5) === "01" ? " " + m.month.slice(2, 4) : "")]));
    });
  }
  // draw in real pixels so labels stay readable on phones
  function chartWidth(box) { return Math.max(280, Math.min(900, Math.round(box.clientWidth || 520))); }
  function drawMonths(box, months) {
    box.textContent = "";
    box.appendChild(h("div", { "class": "legend" }, [h("span", {}, [h("i", { style: "background:var(--ok)" }), "Income"]), h("span", {}, [h("i", { style: "background:var(--accent)" }), "Spending"])]));
    var W = chartWidth(box), H = 190, padL = 46, padT = 8, padB = 22, pw = W - padL, ph = H - padT - padB;
    var hi = Math.max(1, Math.max.apply(null, months.map(function (m) { return Math.max(m.income, m.spending); })));
    var s = svg("svg", { "class": "chart", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Income and spending by month" });
    axis(s, W, padL, padT, ph, 0, hi);
    var gw = pw / months.length, bw = Math.max(2, Math.min(18, gw * 0.36));
    months.forEach(function (m, i) {
      var x = padL + gw * i + gw / 2;
      [["inc", m.income, x - bw - 1], ["spd", Math.max(0, m.spending), x + 1]].forEach(function (b) {
        var hgt = ph * b[1] / hi;
        s.appendChild(svg("rect", { "class": b[0], x: b[2], y: padT + ph - hgt, width: bw, height: Math.max(0, hgt), rx: 2 },
          [svg("title", {}, [monthName(m.month, true) + ": " + (b[0] === "inc" ? "income " : "spending ") + f(b[1])])]));
      });
    });
    monthLabels(s, months, padL, gw, H - 6);
    box.appendChild(s);
  }
  function drawWorth(box, months) {
    box.textContent = "";
    var W = chartWidth(box), H = 170, padL = 46, padT = 8, padB = 22, pw = W - padL, ph = H - padT - padB;
    var vals = months.map(function (m) { return m.worth; });
    var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(1, Math.max.apply(null, vals));
    if (hi === lo) hi = lo + 1;
    var s = svg("svg", { "class": "chart", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Net worth at the end of each month" });
    axis(s, W, padL, padT, ph, lo, hi);
    var gw = pw / months.length, y = function (v) { return padT + ph - ph * (v - lo) / (hi - lo); };
    var pts = months.map(function (m, i) { return [padL + gw * i + gw / 2, y(m.worth)]; });
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    s.appendChild(svg("path", { "class": "area", d: line + " L" + pts[pts.length - 1][0].toFixed(1) + " " + y(0) + " L" + pts[0][0].toFixed(1) + " " + y(0) + " Z" }));
    s.appendChild(svg("path", { "class": "line", d: line }));
    pts.forEach(function (p, i) { s.appendChild(svg("circle", { "class": "dot", cx: p[0], cy: p[1], r: months.length > 24 ? 1.5 : 3 }, [svg("title", {}, [monthName(months[i].month, true) + ": " + f(months[i].worth)])])); });
    monthLabels(s, months, padL, gw, H - 6);
    box.appendChild(s);
  }

  function helpSheet() {
    var keys = [["N", "New transaction"], ["1 2 3 4", "Plan, Transactions, Accounts, Reports"], ["[ and ]", "Previous and next month"], ["/", "Search transactions"],
      ["Enter", "In the plan: save and go to the next category"], ["↑ ↓", "Move between categories in the plan"], ["Ctrl+Z", "Undo"], ["?", "This help"], ["Esc", "Close a window"]];
    var grid = h("div", { "class": "keys" });
    keys.forEach(function (k) { grid.appendChild(h("span", {}, k[0].split(" and ").join(" ").split(" ").map(function (x) { return h("kbd", { text: x }); }))); grid.appendChild(h("span", { text: k[1] })); });
    sheet("Keyboard shortcuts", h("div", { "class": "stack" }, [grid,
      h("p", { "class": "faint", text: "Amount fields accept simple maths (120+35.5) and Arabic digits (١٢٠)." })]), [{ label: "Close", cls: "primary", submit: true, run: function () {} }]);
  }

  // ----- settings -----
  function settingsSheet() {
    var name = h("input", { "class": "input", maxlength: 80, dir: "auto", required: true }); name.value = B.name;
    var cur = h("select", { "class": "select" });
    C.CURRENCIES.forEach(function (c) { cur.appendChild(option(c, c, c === B.cur)); });
    var others = list().filter(function (x) { return x.id !== B.id; });
    var switcher = h("div", { "class": "stack" });
    others.forEach(function (x) {
      switcher.appendChild(h("div", { "class": "row between" }, [h("span", { dir: "auto", text: x.name }),
        h("button", { "class": "btn small", type: "button", onclick: function () { var b = load(x.id); if (b) { s.close(); saveNow(); openBudget(b); } else S3.toast("Could not open that budget", "error"); } }, ["Open"])]));
    });
    var last = B.backedUp ? "Last backup: " + dayName(B.backedUp) + "." : "No backup downloaded yet.";
    var body = h("div", { "class": "stack" }, [
      h("div", { "class": "grid-2" }, [field("Budget name", name), field("Currency", cur)]),
      h("p", { "class": "faint", text: "Changing the currency only changes the symbol and decimals. It does not convert amounts." }),
      h("hr"),
      h("b", { text: "Backup" }),
      h("p", { "class": "faint", text: last + " Your budget lives in this browser only. A backup file lets you restore it or move it to another device." }),
      h("div", { "class": "row" }, [
        h("button", { "class": "btn primary small", type: "button", onclick: downloadBackup, html: S3.icon("download") + "Download backup" }),
        h("button", { "class": "btn small", type: "button", onclick: function () { s.close(); pickBackup(); }, html: S3.icon("upload") + "Open backup" }),
        h("button", { "class": "btn small", type: "button", onclick: function () { S3.download(C.exportCSV(B), fileBase() + "-transactions.csv", "text/csv"); S3.done(); } }, ["Export transactions CSV"])]),
      h("hr"),
      h("b", { text: "Budgets" }),
      others.length ? switcher : h("p", { "class": "faint", text: "Only this budget. Make another one for a second currency or a shared household." }),
      h("div", { "class": "row" }, [h("button", { "class": "btn small", type: "button", onclick: function () { s.close(); saveNow(); showWelcome(); }, html: S3.icon("plus") + "New budget" })])
    ]);
    var s = sheet("Budget settings", body, [
      { label: "Delete this budget", cls: "danger left", run: function () {
        ask("Delete “" + B.name + "”?", "This removes the budget from this browser. Download a backup first if you might want it back.", "Delete budget", true).then(function (ok) {
          if (!ok) return;
          S3.store("budget:b:" + B.id, undefined);
          S3.store("budget:list", list().filter(function (x) { return x.id !== B.id; }));
          var next = list()[0];
          B = null;
          if (next && load(next.id)) openBudget(load(next.id)); else { S3.store("budget:open", undefined); showWelcome(); }
          S3.toast("Budget deleted");
        });
      } },
      { label: "Save", cls: "primary", submit: true, run: function () {
        var n = name.value.trim(); if (!n) return false;
        change(function () { B.name = n; if (cur.value !== B.cur) C.setCurrency(B, cur.value); });
      } }]);
  }

  // ---------- wiring ----------
  function wire() {
    wireWelcome(); wireAccountForm();
    $$("#tabs button").forEach(function (b) { b.addEventListener("click", function () { if (b.dataset.view === "tx") txFilter.limit = 150; setView(b.dataset.view); }); });
    $("#prevMonth").addEventListener("click", function () { M = C.addMonths(M, -1); renderPlan(); });
    $("#nextMonth").addEventListener("click", function () { M = C.addMonths(M, 1); renderPlan(); });
    $("#thisMonth").addEventListener("click", function () { M = C.monthOf(C.today()); renderPlan(); });
    $("#addGroup").addEventListener("click", function () { groupSheet(null); });
    $("#addTxBtn").addEventListener("click", function () { txSheet(null); });
    $("#undoBtn").addEventListener("click", undo);
    $("#nameBtn").addEventListener("click", settingsSheet);
    $("#txAcct").addEventListener("change", function () { txFilter.acct = $("#txAcct").value; txFilter.limit = 150; renderTx(); });
    $("#importBtn").addEventListener("click", importSheet);
    $("#helpBtn").addEventListener("click", helpSheet);
    $("#repRange").addEventListener("change", renderReports);
    $("#txSearch").addEventListener("input", S3.debounce(function () { txFilter.q = $("#txSearch").value; txFilter.limit = 150; renderTx(); }, 150));
    document.addEventListener("keydown", function (e) {
      if (!B || $(".s3-modal")) return;
      var typing = /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || "");
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); undo(); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || $("#app").hidden) return;
      var k = e.key;
      if (k === "n" || k === "N") { e.preventDefault(); txSheet(null); }
      else if (k === "[" || k === "]") { if (view !== "plan") setView("plan"); M = C.addMonths(M, k === "[" ? -1 : 1); renderPlan(); }
      else if (k >= "1" && k <= "4") setView(["plan", "tx", "accounts", "reports"][+k - 1]);
      else if (k === "/") { e.preventDefault(); setView("tx"); $("#txSearch").focus(); }
      else if (k === "?") { e.preventDefault(); helpSheet(); }
    });
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") saveNow(); });
  }
  // Self-test used by the site's checks: maths, parsing and a backup round trip on a throwaway sample (never your data).
  window.S3_SELFTEST = function () {
    try {
      var b = C.sample("JOD"), M0 = C.monthOf(C.today()), r = C.compute(b, M0), bal = C.balances(b), tot = 0;
      Object.keys(bal).forEach(function (k) { tot += bal[k].total; });
      var ok = tot === r.rta + r.totals.available + r.futureAssigned;
      ok = ok && C.parseAmount("\u0663\u0665\u066B\u0665", 3) === 35500 && C.parseAmount("20+15.25", 2) === 3525;
      var p = C.parseCSV('Date,Description,Amount\n05/10/2026,Shop,"-12,50"\n');
      var rows = C.csvToTx(p.rows, { date: 0, payee: 1, memo: -1, amount: 2, out: -1, inn: -1, order: "dmy", header: true }, 2);
      ok = ok && rows[0].d === "2026-10-05" && rows[0].amt === -1250;
      ok = ok && JSON.stringify(C.compute(C.normalize(JSON.parse(JSON.stringify(b))), M0)) === JSON.stringify(r);
      return Promise.resolve(ok && !!$("#welcome") && !!$("#app"));
    } catch (e) { return Promise.resolve(false); }
  };

  function start() {
    wire();
    var id = S3.store("budget:open") || (list()[0] || {}).id;
    var b = id ? load(id) : null;
    if (b) openBudget(b); else showWelcome();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
