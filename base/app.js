/* Base UI. Bases and attachments stay in this browser (IndexedDB, with localStorage as a fallback). */
(function () {
  "use strict";
  var C = window.BaseCore, h = S3.h, $ = S3.$, $$ = S3.$$;
  var B = null, T = null, V = null, q = "", cur = null, undoStack = [], calMonth = null, limit = 500;
  var GLYPH = { text: "Aa", long: "¶", number: "#", currency: "$", percent: "%", select: "◉", multi: "☰", date: "▦", check: "☑", url: "↗", email: "@", phone: "✆", rating: "★", link: "⇄", file: "⎙" };
  var WIDTH = { text: 180, long: 240, number: 110, currency: 120, percent: 100, select: 150, multi: 200, date: 130, check: 80, url: 180, email: 200, phone: 150, rating: 120, link: 200, file: 160 };

  // ---------- storage: IndexedDB (bases + files), localStorage fallback ----------
  var db = null;
  function openDB() {
    return new Promise(function (res) {
      try {
        var rq = indexedDB.open("s3-base", 1);
        rq.onupgradeneeded = function () { var d = rq.result; if (!d.objectStoreNames.contains("bases")) d.createObjectStore("bases", { keyPath: "id" }); if (!d.objectStoreNames.contains("files")) d.createObjectStore("files"); };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { res(null); };
        rq.onblocked = function () { res(null); };
      } catch (e) { res(null); }
    });
  }
  function idb(store, mode, fn) {
    return new Promise(function (res, rej) {
      try {
        var tx = db.transaction(store, mode), st = tx.objectStore(store), out = fn(st);
        tx.oncomplete = function () { res(out && "result" in out ? out.result : undefined); };
        tx.onerror = function () { rej(tx.error); }; tx.onabort = function () { rej(tx.error); };
      } catch (e) { rej(e); }
    });
  }
  function allBases() {
    if (!db) { var m = S3.store("base:all") || {}; return Promise.resolve(Object.keys(m).map(function (k) { return m[k]; })); }
    return idb("bases", "readonly", function (s) { return s.getAll(); });
  }
  function putBase(b) {
    if (!db) { var m = S3.store("base:all") || {}; m[b.id] = b; return Promise.resolve(S3.store("base:all", m) !== undefined); }
    return idb("bases", "readwrite", function (s) { s.put(JSON.parse(JSON.stringify(b))); }).then(function () { return true; }, function () { return false; });
  }
  function delBase(id) {
    if (!db) { var m = S3.store("base:all") || {}; delete m[id]; S3.store("base:all", m); return Promise.resolve(); }
    return idb("bases", "readwrite", function (s) { s.delete(id); });
  }
  function putFile(id, rec) { return idb("files", "readwrite", function (s) { s.put(rec, id); }); }
  function getFile(id) { return db ? idb("files", "readonly", function (s) { return s.get(id); }) : Promise.resolve(null); }
  var urlCache = {};
  function fileURL(id) {
    if (urlCache[id]) return Promise.resolve(urlCache[id]);
    return getFile(id).then(function (f) { if (!f || !f.blob) return null; urlCache[id] = URL.createObjectURL(f.blob); return urlCache[id]; }).catch(function () { return null; });
  }
  function isImage(x) { return /^image\/(png|jpe?g|gif|webp|svg\+xml|avif|bmp)$/i.test(x.type || ""); }
  // drop attachments no base refers to any more
  function collectGarbage(bases) {
    if (!db) return;
    var used = {};
    bases.forEach(function (b) { b.tables.forEach(function (t) { t.fields.forEach(function (f) { if (f.type === "file") t.records.forEach(function (r) { (r.c[f.id] || []).forEach(function (x) { used[x.id] = 1; }); }); }); }); });
    idb("files", "readonly", function (s) { return s.getAllKeys(); }).then(function (keys) {
      var gone = (keys || []).filter(function (k) { return !used[k]; });
      if (gone.length) idb("files", "readwrite", function (s) { gone.forEach(function (k) { s.delete(k); }); });
    }).catch(function () {});
  }

  var saveTimer = null;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 300); }
  function saveNow() {
    clearTimeout(saveTimer);
    if (!B) return;
    B.updated = Date.now();
    putBase(B).then(function (ok) { if (!ok && !saveNow.warned) { saveNow.warned = true; S3.toast("Could not save in this browser (storage full or blocked). Download a backup.", "error"); } });
    S3.store("base:open", B.id);
  }
  function commit(msg) {
    var snap = commit.snap; commit.snap = JSON.stringify(B);
    if (snap && snap !== commit.snap) { undoStack.push(snap); if (undoStack.length > 60) undoStack.shift(); }
    saveSoon(); render();
    if (msg) S3.toast(msg);
  }
  function undo() {
    if (!undoStack.length) return;
    var s = undoStack.pop(); B = C.normalize(JSON.parse(s)); commit.snap = s;
    T = C.table(B, T && T.id) || B.tables[0]; V = view(T, V && V.id);
    saveSoon(); render(); S3.toast("Undone");
  }
  function view(t, id) { for (var i = 0; i < t.views.length; i++) if (t.views[i].id === id) return t.views[i]; return t.views[0]; }
  function openBase(b) {
    if (B) saveNow();
    B = b; T = B.tables[0]; V = T.views[0]; cur = null; limit = 500; q = ""; $("#search").value = ""; undoStack = []; commit.snap = JSON.stringify(B);
    saveNow(); render();
  }

  // ---------- helpers ----------
  function option(v, text, sel) { var o = h("option", { value: v }, [text]); if (sel) o.selected = true; return o; }
  function visibleFields() { return T.fields.filter(function (f, i) { return i === 0 || V.hidden.indexOf(f.id) < 0; }); }
  function currentRows() { return C.rows(B, T, V, q.trim()); }
  function tagEl(f, id) { var c = C.choiceById(f, id); return c ? h("span", { "class": "tag", dir: "auto", style: "background:" + c.color, text: c.name }) : null; }
  function cellContent(f, v, inCard) {
    var frag = document.createDocumentFragment();
    if (C.empty(v) && v !== 0 && f.type !== "check") return frag;
    switch (f.type) {
      case "select": var t1 = tagEl(f, v); if (t1) frag.appendChild(t1); break;
      case "multi": v.forEach(function (id) { var t = tagEl(f, id); if (t) frag.appendChild(t); }); break;
      case "check": frag.appendChild(h("span", { "class": "cb" + (v ? " on" : ""), text: "✓" })); break;
      case "rating": var mx = f.opts.max || 5, s = h("span", { "class": "stars" });
        for (var i = 1; i <= mx; i++) s.appendChild(h("span", { "class": i <= v ? "" : "off", text: "★" }));
        frag.appendChild(s); break;
      case "link": var lt = C.table(B, f.opts.table);
        if (lt) v.forEach(function (id) { var r = C.record(lt, id); if (r) frag.appendChild(h("span", { "class": "lnk", dir: "auto", text: C.title(B, lt, r) })); });
        break;
      case "file": var th = h("span", { "class": "thumbs" });
        v.slice(0, inCard ? 1 : 4).forEach(function (x) {
          if (isImage(x)) { var img = h("img", { alt: x.name }); th.appendChild(img); fileURL(x.id).then(function (u) { if (u) img.src = u; }); }
          else th.appendChild(h("span", { "class": "fi", text: (x.name.split(".").pop() || "file").slice(0, 5).toUpperCase() }));
        });
        frag.appendChild(th); break;
      case "url": frag.appendChild(h("span", { dir: "auto", text: v })); break;
      default: frag.appendChild(document.createTextNode(C.display(B, f, v)));
    }
    return frag;
  }

  // ---------- popovers and sheets ----------
  var popEl = null;
  function closePop() { if (popEl) { var p = popEl; popEl = null; p.remove(); document.removeEventListener("pointerdown", popOutside, true); if (p._onClose) p._onClose(); } }
  function popOutside(e) { if (popEl && !popEl.contains(e.target)) closePop(); }
  function pop(anchor, kids, onClose) {
    closePop();
    popEl = h("div", { "class": "bs-pop" }, kids); popEl._onClose = onClose;
    document.body.appendChild(popEl);
    var r = anchor.getBoundingClientRect(), w = popEl.offsetWidth, hh = popEl.offsetHeight;
    var top = r.bottom + 6; if (top + hh > window.innerHeight - 8 && r.top - hh - 6 > 8) top = r.top - hh - 6;
    popEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + "px";
    popEl.style.top = Math.max(8, top) + "px";
    setTimeout(function () { document.addEventListener("pointerdown", popOutside, true); }, 0);
    var f = popEl.querySelector("input:not([type=checkbox]),button.opt,select"); if (f) f.focus();
    return popEl;
  }
  function opt(label, run, hint) { return h("button", { "class": "opt", type: "button", onclick: function () { closePop(); run(); } }, [h("span", { dir: "auto", text: label })].concat(hint ? [h("small", { text: hint })] : [])); }
  function sheet(title, body, buttons, opts) {
    opts = opts || {};
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": title });
    var form = h("form", { "class": "s3-sheet bs-sheet" }), foot = h("div", { "class": "foot" }), submit = null;
    form.appendChild(h("div", { "class": "row between" }, [h("h2", { dir: "auto", text: title }), h("button", { "class": "btn ghost icon", type: "button", "aria-label": "Close", html: S3.icon("x"), onclick: close })]));
    form.appendChild(body);
    (buttons || []).forEach(function (b) {
      var x = h("button", { "class": "btn " + (b.cls || ""), type: b.submit ? "submit" : "button" }, [b.label]);
      if (b.submit) submit = b; else x.addEventListener("click", function () { if (b.run() !== false) close(); });
      foot.appendChild(x);
    });
    form.addEventListener("submit", function (e) { e.preventDefault(); if (submit && submit.run() !== false) close(); });
    form.appendChild(foot); m.appendChild(form);
    var opened = Date.now();
    function close() { closePop(); m.remove(); document.removeEventListener("keydown", onKey, true); if (opts.onClose) opts.onClose(); }
    function onKey(e) { if (e.key === "Escape" && !popEl) { e.stopPropagation(); close(); } }
    m.addEventListener("mousedown", function (e) { if (e.target === m && Date.now() - opened > 400) close(); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(m);
    if (opts.focus !== false) { var f = form.querySelector(opts.focus || "input:not([type=checkbox]):not([type=file]),textarea,select"); if (f) { f.focus(); if (f.select && f.tagName === "INPUT" && f.type === "text") f.select(); } }
    return { close: close, el: form };
  }
  function field(label, input) { return h("label", { "class": "field" }, [label, input]); }

  // ---------- render ----------
  function render() {
    if (!B) return;
    $("#baseName").textContent = B.name;
    $("#undoBtn").disabled = !undoStack.length;
    var tabs = $("#tabs"); tabs.textContent = "";
    B.tables.forEach(function (t) {
      var b = h("button", { type: "button", role: "tab", "aria-selected": String(t === T), dir: "auto", text: t.name });
      b.addEventListener("click", function () { if (t === T) tableMenu(b); else { T = t; V = T.views[0]; cur = null; render(); } });
      tabs.appendChild(b);
    });
    tabs.appendChild(h("button", { "class": "add", type: "button", title: "Add a table", text: "+", onclick: function (e) { addTableMenu(e.currentTarget); } }));
    $("#viewName").textContent = V.name + " · " + { grid: "Grid", kanban: "Kanban", calendar: "Calendar", gallery: "Gallery" }[V.type];
    var nf = V.filters.length, ns = V.sorts.length, nh = V.hidden.length;
    $("#filterBtn").textContent = nf ? "Filtered (" + nf + ")" : "Filter"; $("#filterBtn").classList.toggle("on", !!nf);
    $("#sortBtn").textContent = ns ? "Sorted (" + ns + ")" : "Sort"; $("#sortBtn").classList.toggle("on", !!ns);
    $("#hideBtn").textContent = nh ? nh + " hidden" : "Fields"; $("#hideBtn").classList.toggle("on", !!nh);
    var byF = V.by && C.field(T, V.by);
    $("#byBtn").hidden = V.type === "grid";
    $("#byBtn").textContent = (V.type === "kanban" ? "Stacked by: " : V.type === "calendar" ? "Dates from: " : "Cover: ") + (byF ? byF.name : "choose") + " ▾";
    var c = $("#content"); closeEditor(); c.textContent = "";
    if (V.type === "grid") renderGrid(c);
    else if (V.type === "kanban") renderKanban(c);
    else if (V.type === "calendar") renderCalendar(c);
    else renderGallery(c);
    var n = currentRows().length;
    $("#foot").textContent = n + " of " + T.records.length + " record" + (T.records.length === 1 ? "" : "s") + (db ? " · saved in this browser" : " · saved in this browser (attachments need IndexedDB, which is blocked here)");
  }

  // ----- grid -----
  function renderGrid(c) {
    var fs = visibleFields(), rows = currentRows();
    var wrap = h("div", { "class": "bs-gridwrap", tabindex: "-1" }), tbl = h("table", { "class": "bs-grid" }), cg = h("colgroup");
    cg.appendChild(h("col", { style: "width:" + (window.innerWidth < 640 ? 40 : 52) + "px" }));
    fs.forEach(function (f, i) { cg.appendChild(h("col", { style: "width:" + (V.widths[f.id] || (i === 0 ? 220 : WIDTH[f.type])) + "px" })); });
    cg.appendChild(h("col", { style: "width:44px" }));
    tbl.appendChild(cg);
    // fixed layout needs a real width, otherwise columns get squeezed and the sticky columns overlap
    var total = 0; $$("col", cg).forEach(function (c) { total += parseInt(c.style.width, 10); });
    tbl.style.width = total + "px";
    var hr = h("tr", {}, [h("th", { "class": "rn", text: "" })]);
    fs.forEach(function (f, i) {
      var th = h("th", { "class": i === 0 ? "pri" : "", title: C.TYPES[f.type] + " · click for options", "data-f": f.id }, [h("span", { "class": "ty", text: GLYPH[f.type] }), h("span", { dir: "auto", text: f.name })]);
      th.style.position = "sticky";
      th.addEventListener("click", function (e) { if (!e.target.classList.contains("grip")) fieldMenu(th, f); });
      var grip = h("span", { "class": "grip", title: "Drag to resize" }); th.appendChild(grip); wireResize(grip, f, cg.childNodes[i + 1]);
      hr.appendChild(th);
    });
    hr.appendChild(h("th", { "class": "addf", title: "Add a field", text: "+", onclick: function () { fieldSheet(null); } }));
    tbl.appendChild(h("thead", {}, [hr]));
    var tb = h("tbody"), all = rows.length;
    rows = rows.slice(0, limit); // big tables render in pages so the grid stays fast
    rows.forEach(function (r, k) {
      var tr = h("tr", { "data-r": r.id }, [h("td", { "class": "rn" }, [h("span", { text: String(k + 1) }), " ", h("button", { type: "button", title: "Open record (Space)", "aria-label": "Open record", text: "⤢", onclick: function () { recordSheet(r.id); } })])]);
      fs.forEach(function (f, i) {
        var td = h("td", { "data-f": f.id, "class": (i === 0 ? "pri " : "") + (/number|currency|percent/.test(f.type) ? "num" : "") + (cur && cur.r === r.id && cur.f === f.id ? " cur" : "") });
        td.appendChild(cellContent(f, r.c[f.id]));
        tr.appendChild(td);
      });
      tr.appendChild(h("td"));
      tb.appendChild(tr);
    });
    if (all > rows.length) tb.appendChild(h("tr", { "class": "addrow" }, [h("td", { "class": "rn", text: "…" }), h("td", { colspan: fs.length + 1, text: "Show " + Math.min(500, all - rows.length) + " more (" + (all - rows.length) + " not shown)", onclick: function () { limit += 500; render(); } })]));
    tb.appendChild(h("tr", { "class": "addrow" }, [h("td", { "class": "rn", text: "+" }), h("td", { colspan: fs.length + 1, text: "Add a record", onclick: function () { addRecord(); } })]));
    var sums = h("tr", { "class": "sumrow" }, [h("td", { "class": "rn", text: "" })]);
    fs.forEach(function (f, i) {
      var txt = i === 0 ? all + " record" + (all === 1 ? "" : "s") : "";
      if (/number|currency|percent/.test(f.type)) { var s = 0, n = 0; currentRows().forEach(function (r) { var v = r.c[f.id]; if (typeof v === "number") { s += v; n++; } }); if (n) txt = "Sum " + C.display(B, f, Math.round(s * 1e6) / 1e6); }
      if (f.type === "check") { var on = currentRows().filter(function (r) { return r.c[f.id]; }).length; txt = on + " checked"; }
      sums.appendChild(h("td", { "class": /number|currency|percent/.test(f.type) ? "num" : "", text: txt }));
    });
    sums.appendChild(h("td"));
    tb.appendChild(sums);
    tbl.appendChild(tb); wrap.appendChild(tbl); c.appendChild(wrap);
    if (!T.records.length) c.appendChild(h("div", { "class": "bs-empty" }, [h("b", { text: "No records yet" }), "Click “Add a record”, paste from a spreadsheet, or import a CSV file."]));
    tbl.addEventListener("click", onGridClick);
    tbl.addEventListener("dblclick", function (e) { var td = e.target.closest("td[data-f]"); if (td) { setCur(td); edit(); } });
  }
  function wireResize(grip, f, col) {
    grip.addEventListener("pointerdown", function (e) {
      e.preventDefault(); e.stopPropagation(); grip.setPointerCapture(e.pointerId);
      var x0 = e.clientX, w0 = parseInt(col.style.width, 10);
      var tbl = col.closest("table"), t0 = parseInt(tbl.style.width, 10);
      function mv(ev) { var w = Math.max(60, Math.min(800, w0 + ev.clientX - x0)); col.style.width = w + "px"; tbl.style.width = (t0 + w - w0) + "px"; }
      function up() { grip.removeEventListener("pointermove", mv); grip.removeEventListener("pointerup", up); V.widths[f.id] = parseInt(col.style.width, 10); commit(); }
      grip.addEventListener("pointermove", mv); grip.addEventListener("pointerup", up);
    });
  }
  function onGridClick(e) {
    var td = e.target.closest("td[data-f]"); if (!td) return;
    var was = cur && cur.r === td.parentNode.dataset.r && cur.f === td.dataset.f;
    setCur(td);
    var f = C.field(T, cur.f), r = C.record(T, cur.r);
    if (f.type === "check" && (was || e.target.closest(".cb"))) { C.setValue(B, T, f, r, !r.c[f.id]); commit(); return; }
    if (was && f.type !== "check") edit();
  }
  function setCur(td) {
    $$(".bs-grid td.cur").forEach(function (x) { x.classList.remove("cur"); });
    td.classList.add("cur");
    cur = { r: td.parentNode.dataset.r, f: td.dataset.f };
    td.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function curTd() { return cur ? $('.bs-grid tr[data-r="' + cur.r + '"] td[data-f="' + cur.f + '"]') : null; }
  function moveCur(dr, dc) {
    var rows = currentRows(), fs = visibleFields();
    if (!cur) { if (rows.length) { cur = { r: rows[0].id, f: fs[0].id }; var t0 = curTd(); if (t0) setCur(t0); } return; }
    var ri = rows.findIndex(function (r) { return r.id === cur.r; }), fi = fs.findIndex(function (f) { return f.id === cur.f; });
    ri = Math.max(0, Math.min(rows.length - 1, ri + dr)); fi = Math.max(0, Math.min(fs.length - 1, fi + dc));
    if (!rows[ri]) return;
    cur = { r: rows[ri].id, f: fs[fi].id }; var td = curTd(); if (td) setCur(td);
  }

  // ----- cell editing -----
  var edEl = null;
  function closeEditor() { if (edEl) { var e = edEl; edEl = null; e.remove(); } }
  function edit(initial) {
    var td = curTd(); if (!td) return;
    var f = C.field(T, cur.f), r = C.record(T, cur.r); if (!f || !r) return;
    var v = r.c[f.id];
    if (f.type === "check") { C.setValue(B, T, f, r, !v); commit(); return; }
    if (/select|multi|link|file|rating/.test(f.type)) { cellPicker(td, f, r); return; }
    closeEditor();
    var rect = td.getBoundingClientRect(), long = f.type === "long";
    var el = long ? h("textarea", { "class": "ed", dir: "auto" }) : h("input", { "class": "ed", type: f.type === "date" ? "date" : "text", dir: "auto",
      inputmode: /number|currency|percent/.test(f.type) ? "decimal" : f.type === "phone" ? "tel" : f.type === "email" ? "email" : null });
    el.style.position = "fixed"; el.style.left = rect.left + "px"; el.style.top = rect.top + "px";
    el.style.width = Math.max(rect.width, long ? 320 : 120) + "px"; el.style.height = (long ? 150 : rect.height) + "px";
    el.value = initial != null ? initial : C.empty(v) && v !== 0 ? "" : f.type === "date" ? v : /number|currency|percent/.test(f.type) ? String(v) : C.display(B, f, v);
    document.body.appendChild(el); edEl = el; el.focus();
    if (initial == null && el.select && f.type !== "date") el.select();
    var done = false;
    function save(move) {
      if (done) return; done = true;
      var nv = C.parse(B, f, el.value);
      if (/number|currency|percent/.test(f.type) && el.value.trim() && nv == null) { S3.toast("That's not a number", "error"); closeEditor(); return; }
      if (f.type === "date" && el.value && !nv) { S3.toast("That's not a date", "error"); closeEditor(); return; }
      closeEditor();
      if (JSON.stringify(nv) !== JSON.stringify(r.c[f.id] == null ? null : r.c[f.id]) && !(C.empty(nv) && C.empty(r.c[f.id]))) { if (C.empty(nv) && nv !== 0) delete r.c[f.id]; else C.setValue(B, T, f, r, nv); commit(); }
      if (move) moveCur(move[0], move[1]);
      var w = $(".bs-gridwrap"); if (w) w.focus({ preventScroll: true });
    }
    el.addEventListener("keydown", function (e) {
      e.stopPropagation();
      if (e.key === "Escape") { done = true; closeEditor(); var w = $(".bs-gridwrap"); if (w) w.focus({ preventScroll: true }); }
      else if (e.key === "Enter" && (!long || e.ctrlKey || e.metaKey)) { e.preventDefault(); save([1, 0]); }
      else if (e.key === "Tab") { e.preventDefault(); save([0, e.shiftKey ? -1 : 1]); }
    });
    el.addEventListener("blur", function () { save(null); });
  }
  // pickers for select / multi / link / file / rating cells
  function cellPicker(anchor, f, r, after) {
    var refresh = function () { commit(); if (after) after(); };
    if (f.type === "rating") {
      var row = h("div", { "class": "rate" });
      for (var i = 0; i <= (f.opts.max || 5); i++) (function (n) { row.appendChild(h("button", { type: "button", "class": n && n <= (r.c[f.id] || 0) ? "on" : "", "aria-label": n + " stars", text: n ? "★" : "✕", onclick: function () { if (n) r.c[f.id] = n; else delete r.c[f.id]; closePop(); refresh(); } })); })(i);
      pop(anchor, [h("div", { "class": "hd", text: f.name }), row]); return;
    }
    if (f.type === "file") { closePop(); recordSheet(r.id, f.id); return; }
    var search = h("input", { "class": "input", placeholder: f.type === "link" ? "Find or add a record" : "Find or add an option", dir: "auto" });
    var list = h("div", { "class": "list" });
    var multi = f.type !== "select";
    function selected() { var v = r.c[f.id]; return f.type === "select" ? (v ? [v] : []) : (v || []).slice(); }
    function items() {
      if (f.type === "link") { var lt = C.table(B, f.opts.table); return lt ? lt.records.map(function (x) { return { id: x.id, name: C.title(B, lt, x) }; }) : []; }
      return (f.opts.choices || []).map(function (c) { return { id: c.id, name: c.name, color: c.color }; });
    }
    function draw() {
      list.textContent = "";
      var s = search.value.trim().toLowerCase(), sel = selected(), shown = 0;
      items().forEach(function (it) {
        if (s && it.name.toLowerCase().indexOf(s) < 0) return;
        if (shown++ > 200) return;
        var on = sel.indexOf(it.id) >= 0;
        list.appendChild(h("button", { "class": "opt", type: "button", onclick: function () { toggle(it.id); } }, [
          h("span", { "class": "cb" + (on ? " on" : ""), text: "✓" }),
          it.color ? h("span", { "class": "tag", dir: "auto", style: "background:" + it.color, text: it.name }) : h("span", { dir: "auto", text: it.name })]));
      });
      if (s && !items().some(function (it) { return it.name.toLowerCase() === s; })) {
        list.appendChild(h("button", { "class": "opt", type: "button", onclick: addNew }, [h("span", { text: "+ Add “" + search.value.trim() + "”" })]));
      }
      if (!list.childNodes.length) list.appendChild(h("span", { "class": "faint", text: f.type === "link" ? "No records in the linked table yet. Type a name to add one." : "No options yet. Type to add one." }));
    }
    function toggle(id) {
      if (f.type === "select") { if (r.c[f.id] === id) delete r.c[f.id]; else r.c[f.id] = id; closePop(); refresh(); return; }
      var sel = selected(), i = sel.indexOf(id); if (i >= 0) sel.splice(i, 1); else sel.push(id);
      C.setValue(B, T, f, r, sel); refresh(); draw();
    }
    function addNew() {
      var name = search.value.trim(); if (!name) return;
      if (f.type === "link") { var lt = C.table(B, f.opts.table), nr = C.newRecord(lt); nr.c[C.primary(lt).id] = name; lt.records.push(nr); search.value = ""; toggle(nr.id); return; }
      var id = C.ensureChoice(f, name); search.value = ""; toggle(id);
    }
    search.addEventListener("input", draw);
    search.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); var first = list.querySelector("button.opt"); if (first) first.click(); }
      if (e.key === "Escape") { e.stopPropagation(); closePop(); }
    });
    draw();
    pop(anchor, [h("div", { "class": "hd", text: f.name + (multi ? " · pick any" : "") }), search, list], function () { var w = $(".bs-gridwrap"); if (w) w.focus({ preventScroll: true }); });
  }
  function addRecord(preset) {
    var r = C.newRecord(T);
    // a new record should show up in the current filtered view: fill simple "is" filters
    V.filters.forEach(function (c) { var f = C.field(T, c.f); if (!f) return; if (f.type === "select" && c.op === "is" && c.val) r.c[f.id] = c.val; if (f.type === "check" && c.op === "on") r.c[f.id] = true; });
    for (var k in preset || {}) r.c[k] = preset[k];
    T.records.push(r); commit();
    if (V.type === "grid") { cur = { r: r.id, f: T.fields[0].id }; var td = curTd(); if (td) { setCur(td); edit(); } }
    else recordSheet(r.id);
    return r;
  }

  // ----- kanban -----
  function renderKanban(c) {
    var f = V.by && C.field(T, V.by);
    if (!f || f.type !== "select") {
      var sf = T.fields.filter(function (x) { return x.type === "select"; })[0];
      if (sf) { V.by = sf.id; f = sf; }
      else { c.appendChild(h("div", { "class": "bs-empty" }, [h("b", { text: "Kanban needs a single select field" }), "Cards are stacked by its options (for example Status: To do, Doing, Done). ",
        h("div", { "class": "mt" }, [h("button", { "class": "btn primary small", type: "button", onclick: function () { fieldSheet(null, "select"); } }, ["Add a single select field"])])])); return; }
    }
    var rows = currentRows(), cols = [{ id: null, name: "No " + f.name, color: "#e2e8f0" }].concat(f.opts.choices || []);
    var wrap = h("div", { "class": "bs-kanban" }), fs = visibleFields().slice(1).filter(function (x) { return x.id !== f.id; }).slice(0, 4);
    var cover = T.fields.filter(function (x) { return x.type === "file"; })[0];
    cols.forEach(function (col) {
      var list = rows.filter(function (r) { return (r.c[f.id] || null) === col.id; });
      if (col.id === null && !list.length) return;
      var colEl = h("div", { "class": "kcol", "data-col": col.id || "" }, [h("h3", {}, [h("span", { "class": "tag", dir: "auto", style: "background:" + col.color, text: col.name }), h("span", { "class": "n", text: String(list.length) })])]);
      list.forEach(function (r) { colEl.appendChild(card(r, fs, cover)); });
      colEl.appendChild(h("button", { "class": "addc", type: "button", onclick: function () { var p = {}; if (col.id) p[f.id] = col.id; addRecord(p); } }, ["+ Add card"]));
      wrap.appendChild(colEl);
    });
    c.appendChild(wrap);
    wireCardDrag(wrap, function (target, rid) {
      var r = C.record(T, rid), cid = target.getAttribute("data-col") || null;
      if ((r.c[f.id] || null) === cid) return;
      if (cid) r.c[f.id] = cid; else delete r.c[f.id];
      commit();
    }, ".kcol");
  }
  function card(r, fs, cover) {
    var el = h("div", { "class": "kcard", "data-r": r.id, tabindex: "0" });
    if (cover && r.c[cover.id] && r.c[cover.id].length && isImage(r.c[cover.id][0])) { var img = h("img", { alt: "" }); el.appendChild(img); fileURL(r.c[cover.id][0].id).then(function (u) { if (u) img.src = u; }); }
    el.appendChild(h("b", { dir: "auto", text: C.title(B, T, r) }));
    fs.forEach(function (f) { var v = r.c[f.id]; if (C.empty(v) && v !== 0) return; var kv = h("div", { "class": "kv" }); kv.appendChild(cellContent(f, v, true)); el.appendChild(kv); });
    el.addEventListener("keydown", function (e) { if (e.key === "Enter") recordSheet(r.id); });
    return el;
  }
  // Drag cards (kanban) or events (calendar) between drop targets; a click opens the record.
  function wireCardDrag(root, onDrop, targetSel, itemSel) {
    itemSel = itemSel || ".kcard";
    root.addEventListener("pointerdown", function (e) {
      var item = e.target.closest(itemSel); if (!item || e.button > 0) return;
      var rid = item.getAttribute("data-r"), x0 = e.clientX, y0 = e.clientY, ghost = null, over = null;
      function mv(ev) {
        if (!ghost) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
          if (ev.pointerType === "touch" && Math.abs(ev.clientY - y0) > Math.abs(ev.clientX - x0)) { cleanup(); return; } // vertical swipe scrolls
          ghost = item.cloneNode(true); ghost.classList.add("kdrag"); ghost.style.width = item.offsetWidth + "px"; document.body.appendChild(ghost); item.classList.add("ghost");
          try { item.setPointerCapture(ev.pointerId); } catch (err) {}
        }
        ghost.style.left = (ev.clientX - 20) + "px"; ghost.style.top = (ev.clientY - 14) + "px";
        var under = document.elementFromPoint(ev.clientX, ev.clientY), t = under && under.closest(targetSel);
        if (t !== over) { if (over) over.classList.remove("over"); over = t; if (over) over.classList.add("over"); }
      }
      function up() {
        var was = !!ghost; cleanup();
        if (!was) { recordSheet(rid); return; }
        if (over) { over.classList.remove("over"); onDrop(over, rid); }
      }
      function cleanup() { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); if (ghost) ghost.remove(); item.classList.remove("ghost"); ghost = null; }
      document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
    });
  }

  // ----- calendar -----
  function renderCalendar(c) {
    var f = V.by && C.field(T, V.by);
    if (!f || f.type !== "date") {
      var df = T.fields.filter(function (x) { return x.type === "date"; })[0];
      if (df) { V.by = df.id; f = df; }
      else { c.appendChild(h("div", { "class": "bs-empty" }, [h("b", { text: "Calendar needs a date field" }), "Records appear on the day in that field. ",
        h("div", { "class": "mt" }, [h("button", { "class": "btn primary small", type: "button", onclick: function () { fieldSheet(null, "date"); } }, ["Add a date field"])])])); return; }
    }
    var td = C.today(); calMonth = calMonth || td.slice(0, 7);
    var y = +calMonth.slice(0, 4), m = +calMonth.slice(5, 7) - 1, first = new Date(Date.UTC(y, m, 1)), startDow = first.getUTCDay();
    var wrap = h("div", { "class": "bs-cal" });
    var label = first.toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });
    var shift = function (n) { var d = new Date(Date.UTC(y, m + n, 1)); calMonth = d.toISOString().slice(0, 7); render(); };
    wrap.appendChild(h("div", { "class": "calbar" }, [h("button", { "class": "btn icon small", type: "button", "aria-label": "Previous month", text: "‹", onclick: function () { shift(-1); } }),
      h("h2", { text: label }), h("button", { "class": "btn icon small", type: "button", "aria-label": "Next month", text: "›", onclick: function () { shift(1); } }),
      h("button", { "class": "btn ghost small", type: "button", text: "Today", onclick: function () { calMonth = td.slice(0, 7); render(); } })]));
    var grid = h("div", { "class": "calgrid" });
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(function (d) { grid.appendChild(h("div", { "class": "dow", text: d })); });
    var byDay = {};
    currentRows().forEach(function (r) { var d = r.c[f.id]; if (d) (byDay[d] = byDay[d] || []).push(r); });
    var weeks = Math.ceil((startDow + new Date(Date.UTC(y, m + 1, 0)).getUTCDate()) / 7);
    for (var i = 0; i < weeks * 7; i++) {
      var d = new Date(Date.UTC(y, m, 1 - startDow + i)), key = d.toISOString().slice(0, 10);
      var cell = h("div", { "class": "calday" + (d.getUTCMonth() !== m ? " other" : "") + (key === td ? " today" : ""), "data-day": key });
      (function (k) { cell.appendChild(h("span", { "class": "dn", title: "Add a record on this day", text: String(d.getUTCDate()), onclick: function () { var p = {}; p[f.id] = k; addRecord(p); } })); })(key);
      var evs = byDay[key] || [];
      evs.slice(0, 3).forEach(function (r) { cell.appendChild(h("div", { "class": "calev", "data-r": r.id, dir: "auto", title: C.title(B, T, r), text: C.title(B, T, r) })); });
      if (evs.length > 3) (function (list, k) {
        cell.appendChild(h("button", { "class": "calev more", type: "button", text: "+" + (list.length - 3) + " more", onclick: function (e) {
          pop(e.currentTarget, [h("div", { "class": "hd", text: k })].concat(list.map(function (r) { return opt(C.title(B, T, r), function () { recordSheet(r.id); }); })));
        } }));
      })(evs, key);
      grid.appendChild(cell);
    }
    wrap.appendChild(grid); c.appendChild(wrap);
    var undated = currentRows().filter(function (r) { return !r.c[f.id]; }).length;
    if (undated) wrap.appendChild(h("p", { "class": "faint", text: undated + " record" + (undated === 1 ? " has" : "s have") + " no " + f.name + " and are not shown." }));
    wireCardDrag(grid, function (target, rid) { var r = C.record(T, rid), k = target.getAttribute("data-day"); if (r.c[f.id] !== k) { r.c[f.id] = k; commit(); } }, ".calday", ".calev[data-r]");
  }

  // ----- gallery -----
  function renderGallery(c) {
    var rows = currentRows(), cover = V.by && C.field(T, V.by);
    if (!cover || cover.type !== "file") { cover = T.fields.filter(function (x) { return x.type === "file"; })[0] || null; if (cover) V.by = cover.id; }
    var fs = visibleFields().slice(1).filter(function (x) { return !cover || x.id !== cover.id; }).slice(0, 4);
    var g = h("div", { "class": "bs-gallery" });
    rows.forEach(function (r) {
      var cv = h("div", { "class": "cover" }), files = cover ? (r.c[cover.id] || []).filter(isImage) : [];
      if (files.length) { var img = h("img", { alt: "" }); cv.appendChild(img); fileURL(files[0].id).then(function (u) { if (u) img.src = u; }); }
      else cv.textContent = (C.title(B, T, r).trim()[0] || "·").toUpperCase();
      var body = h("div", { "class": "gb" }, [h("b", { dir: "auto", text: C.title(B, T, r) })]);
      fs.forEach(function (f) { var v = r.c[f.id]; if (C.empty(v) && v !== 0) return; var kv = h("div", { "class": "kv faint" }); kv.appendChild(cellContent(f, v, true)); body.appendChild(kv); });
      var el = h("div", { "class": "gcard", tabindex: "0", role: "button" }, [cv, body]);
      el.addEventListener("click", function () { recordSheet(r.id); });
      el.addEventListener("keydown", function (e) { if (e.key === "Enter") recordSheet(r.id); });
      g.appendChild(el);
    });
    c.appendChild(g);
    if (!rows.length) c.appendChild(h("div", { "class": "bs-empty" }, [h("b", { text: T.records.length ? "Nothing matches" : "No records yet" }), cover ? "" : "Add an attachment field to show pictures on the cards."]));
  }

  // ---------- record window ----------
  function recordSheet(id, focusField) {
    var r = C.record(T, id); if (!r) return;
    var body = h("div", { "class": "stack" });
    var s = sheet(C.title(B, T, r), body, [
      { label: "Delete", cls: "danger left", run: function () { C.deleteRecords(B, T, [r.id]); cur = null; commit("Record deleted. Ctrl+Z to undo."); } },
      { label: "Duplicate", cls: "ghost", run: function () {
        var d = C.newRecord(T); T.fields.forEach(function (f) { if (r.c[f.id] !== undefined) { if (f.type === "link") C.setLinks(B, T, f, d, r.c[f.id].slice()); else d.c[f.id] = JSON.parse(JSON.stringify(r.c[f.id])); } });
        T.records.splice(T.records.indexOf(r) + 1, 0, d); commit("Duplicated");
      } },
      { label: "Done", cls: "primary", submit: true, run: function () {} }], { focus: false });
    function draw() {
      body.textContent = "";
      T.fields.forEach(function (f) { body.appendChild(fieldEditor(f, r, draw, s)); });
      s.el.querySelector("h2").textContent = C.title(B, T, r);
    }
    draw();
    if (focusField) { var t = body.querySelector('[data-ff="' + focusField + '"] button, [data-ff="' + focusField + '"] input'); if (t) t.focus(); }
    else { var first = body.querySelector("input,textarea"); if (first) first.focus(); }
  }
  function fieldEditor(f, r, redraw, s) {
    var v = r.c[f.id], wrap = h("div", { "class": "field", "data-ff": f.id }, [h("span", {}, [h("span", { "class": "ty", style: "color:var(--text-3);margin-inline-end:6px", text: GLYPH[f.type] }), f.name])]);
    var set = function (nv) { if (C.empty(nv) && nv !== 0 && f.type !== "check") delete r.c[f.id]; else C.setValue(B, T, f, r, nv); commit(); };
    if (/^(text|url|email|phone|number|currency|percent|date)$/.test(f.type)) {
      var i = h("input", { "class": "input", type: f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "url" ? "url" : f.type === "phone" ? "tel" : "text", dir: "auto",
        inputmode: /number|currency|percent/.test(f.type) ? "decimal" : null });
      i.value = C.empty(v) && v !== 0 ? "" : f.type === "date" ? v : /number|currency|percent/.test(f.type) ? String(v) : C.display(B, f, v);
      i.addEventListener("change", function () {
        var nv = C.parse(B, f, i.value);
        if (/number|currency|percent/.test(f.type) && i.value.trim() && nv == null) { S3.toast("That's not a number", "error"); return; }
        set(nv); if (f === T.fields[0]) s.el.querySelector("h2").textContent = C.title(B, T, r);
      });
      var row = h("div", { "class": "row", style: "flex-wrap:nowrap" }, [i]);
      if (f.type === "url" && v) row.appendChild(h("a", { "class": "btn small", href: /^https?:\/\//i.test(v) ? v : "https://" + v, target: "_blank", rel: "noopener noreferrer", text: "Open" }));
      if (f.type === "email" && v) row.appendChild(h("a", { "class": "btn small", href: "mailto:" + v, text: "Email" }));
      wrap.appendChild(row);
    } else if (f.type === "long") {
      var ta = h("textarea", { "class": "textarea prose", rows: 4, dir: "auto", style: "min-height:90px" }); ta.value = v || "";
      ta.addEventListener("change", function () { set(ta.value); }); wrap.appendChild(ta);
    } else if (f.type === "check") {
      var cb = h("input", { type: "checkbox" }); cb.checked = !!v; cb.addEventListener("change", function () { set(cb.checked); });
      wrap.appendChild(h("label", { "class": "check" }, [cb, "Checked"]));
    } else if (f.type === "rating") {
      var rr = h("div", { "class": "rate" });
      for (var k = 1; k <= (f.opts.max || 5); k++) (function (n) { rr.appendChild(h("button", { type: "button", "class": n <= (v || 0) ? "on" : "", "aria-label": n + " stars", text: "★", onclick: function () { set(v === n ? null : n); redraw(); } })); })(k);
      wrap.appendChild(rr);
    } else if (f.type === "select" || f.type === "multi" || f.type === "link") {
      var chips = h("div", { "class": "chips" });
      var vals = f.type === "select" ? (v ? [v] : []) : (v || []);
      vals.forEach(function (id) {
        var label = f.type === "link" ? (function () { var lt = C.table(B, f.opts.table), x = lt && C.record(lt, id); return x ? C.title(B, lt, x) : "?"; })() : (C.choiceById(f, id) || {}).name;
        var color = f.type === "link" ? null : (C.choiceById(f, id) || {}).color;
        chips.appendChild(h("span", { "class": f.type === "link" ? "lnk" : "tag", dir: "auto", style: color ? "background:" + color : null }, [label + " ",
          h("button", { type: "button", "aria-label": "Remove " + label, text: "✕", style: "color:inherit", onclick: function () {
            if (f.type === "select") set(null); else set(vals.filter(function (x) { return x !== id; })); redraw();
          } })]));
      });
      var pick = h("button", { "class": "btn small", type: "button", text: f.type === "link" ? "+ Link a record" : vals.length && f.type === "select" ? "Change" : "+ Choose", onclick: function (e) { cellPicker(e.currentTarget, f, r, redraw); } });
      chips.appendChild(pick);
      wrap.appendChild(chips);
    } else if (f.type === "file") {
      var list = h("div", { "class": "files" });
      (v || []).forEach(function (x) {
        var thumb = isImage(x) ? h("img", { alt: x.name }) : h("span", { "class": "chip", text: (x.name.split(".").pop() || "file").slice(0, 5).toUpperCase() });
        if (isImage(x)) fileURL(x.id).then(function (u) { if (u) thumb.src = u; });
        list.appendChild(h("div", { "class": "file" }, [thumb, h("span", { "class": "grow", dir: "auto", title: x.name, text: x.name + " · " + S3.fmtBytes(x.size) }),
          h("button", { "class": "btn ghost small", type: "button", text: "Open", onclick: function () { getFile(x.id).then(function (fr) { if (fr && fr.blob) S3.download(fr.blob, x.name); else S3.toast("This file is not in this browser any more", "error"); }); } }),
          h("button", { "class": "btn ghost small danger", type: "button", text: "Remove", onclick: function () { set((r.c[f.id] || []).filter(function (y) { return y.id !== x.id; })); redraw(); } })]));
      });
      var inp = h("input", { type: "file", multiple: true, hidden: true });
      inp.addEventListener("change", function () {
        if (!db) { S3.toast("Attachments need IndexedDB, which this browser blocks here", "error"); return; }
        var fl = Array.prototype.slice.call(inp.files); inp.value = "";
        Promise.all(fl.map(function (file) {
          var id = C.uid() + C.uid();
          return putFile(id, { blob: file, name: file.name, type: file.type }).then(function () { return { id: id, name: file.name.slice(0, 200), type: file.type, size: file.size }; });
        })).then(function (added) { set((r.c[f.id] || []).concat(added)); redraw(); S3.toast("Added " + added.length + " file" + (added.length === 1 ? "" : "s")); })
          .catch(function () { S3.toast("Could not store the file (browser storage full?)", "error"); });
      });
      list.appendChild(h("div", { "class": "row" }, [h("button", { "class": "btn small", type: "button", text: "+ Add files", onclick: function () { inp.click(); } }), inp]));
      wrap.appendChild(list);
    }
    return wrap;
  }

  // ---------- fields ----------
  function fieldMenu(anchor, f) {
    var i = T.fields.indexOf(f);
    pop(anchor, [h("div", { "class": "hd", text: f.name + " · " + C.TYPES[f.type] }),
      opt("Edit field", function () { fieldSheet(f); }),
      opt("Sort A → Z", function () { V.sorts = [{ f: f.id, desc: false }]; commit(); }),
      opt("Sort Z → A", function () { V.sorts = [{ f: f.id, desc: true }]; commit(); }),
      opt("Filter by this field", function () { V.filters.push({ f: f.id, op: C.opsFor(f)[0][0], val: "" }); commit(); filterPop(); }),
      i > 0 ? opt("Hide in this view", function () { V.hidden.push(f.id); commit(); }) : null,
      i > 1 ? opt("Move left", function () { T.fields.splice(i, 1); T.fields.splice(i - 1, 0, f); commit(); }) : null,
      i > 0 && i < T.fields.length - 1 ? opt("Move right", function () { T.fields.splice(i, 1); T.fields.splice(i + 1, 0, f); commit(); }) : null,
      i > 0 ? h("div", { "class": "sep" }) : null,
      i > 0 ? opt("Delete field", function () { C.deleteField(B, T, f.id); commit("Field deleted. Ctrl+Z to undo."); }) : null].filter(Boolean));
  }
  function fieldSheet(f, presetType) {
    var isNew = !f;
    var name = h("input", { "class": "input", maxlength: 100, dir: "auto", required: true }); name.value = f ? f.name : presetType === "select" ? "Status" : presetType === "date" ? "Date" : "";
    var type = h("select", { "class": "select" });
    Object.keys(C.TYPES).forEach(function (k) { if (!isNew && T.fields.indexOf(f) === 0 && (k === "link" || k === "file")) return; type.appendChild(option(k, C.TYPES[k], (f ? f.type : presetType || "text") === k)); });
    var optsBox = h("div", { "class": "stack" });
    var work = { choices: f && f.opts.choices ? JSON.parse(JSON.stringify(f.opts.choices)) : [], dec: f && f.opts.dec != null ? f.opts.dec : null, sym: f && f.opts.sym != null ? f.opts.sym : "$", table: f ? f.opts.table : null, max: f ? f.opts.max || 5 : 5 };
    function drawOpts() {
      optsBox.textContent = "";
      var t = type.value;
      if (t === "number" || t === "percent" || t === "currency") {
        var dec = h("select", { "class": "select" }); [0, 1, 2, 3, 4].forEach(function (d) { dec.appendChild(option(String(d), d ? "1." + "0".repeat(d) : "1 (whole)", (work.dec == null ? (t === "currency" ? 2 : 0) : work.dec) === d)); });
        dec.addEventListener("change", function () { work.dec = +dec.value; });
        var row = [field("Decimals", dec)];
        if (t === "currency") { var sym = h("input", { "class": "input", maxlength: 6, value: work.sym }); sym.addEventListener("input", function () { work.sym = sym.value; }); row.unshift(field("Symbol (e.g. $, €, JOD )", sym)); }
        optsBox.appendChild(h("div", { "class": "grid-2" }, row));
      }
      if (t === "rating") { var mx = h("select", { "class": "select" }); [3, 4, 5, 6, 7, 8, 9, 10].forEach(function (n) { mx.appendChild(option(String(n), n + " stars", work.max === n)); }); mx.addEventListener("change", function () { work.max = +mx.value; }); optsBox.appendChild(field("Maximum", mx)); }
      if (t === "select" || t === "multi") {
        var box = h("div", { "class": "choices" });
        work.choices.forEach(function (c, i) {
          var nm = h("input", { "class": "input", maxlength: 100, dir: "auto", value: c.name }); nm.addEventListener("input", function () { c.name = nm.value; });
          var col = h("input", { type: "color", value: c.color }); col.addEventListener("input", function () { c.color = col.value; });
          box.appendChild(h("div", { "class": "row" }, [col, h("div", { "class": "grow" }, [nm]),
            h("button", { "class": "btn ghost icon small", type: "button", "aria-label": "Remove option", html: S3.icon("x"), onclick: function () { work.choices.splice(i, 1); drawOpts(); } })]));
        });
        box.appendChild(h("button", { "class": "btn small", type: "button", text: "+ Add option", onclick: function () { work.choices.push(C.choice("Option " + (work.choices.length + 1), work.choices.length)); drawOpts(); var ins = $$("input.input", box); if (ins.length) { ins[ins.length - 1].focus(); ins[ins.length - 1].select(); } } }));
        optsBox.appendChild(h("div", { "class": "field" }, ["Options", box]));
      }
      if (t === "link") {
        if (!isNew && f.type === "link") optsBox.appendChild(h("p", { "class": "faint", text: "Links to the table “" + ((C.table(B, f.opts.table) || {}).name || "?") + "”. Each side shows the other." }));
        else {
          var ts = h("select", { "class": "select" });
          B.tables.forEach(function (x) { if (x !== T) ts.appendChild(option(x.id, x.name, x.id === work.table)); });
          ts.appendChild(option("__new", "A new table…", false));
          if (!work.table) work.table = ts.value;
          ts.addEventListener("change", function () { work.table = ts.value; });
          optsBox.appendChild(field("Link to table", ts));
          optsBox.appendChild(h("p", { "class": "faint", text: "A matching field is added to the other table, so links show on both sides." }));
        }
      }
      if (!isNew && t !== f.type) optsBox.appendChild(h("p", { "class": "faint", text: "Changing the type converts the existing values through their text. You can undo it." }));
    }
    type.addEventListener("change", drawOpts); drawOpts();
    var btns = [];
    if (!isNew && T.fields.indexOf(f) > 0) btns.push({ label: "Delete field", cls: "danger left", run: function () { C.deleteField(B, T, f.id); commit("Field deleted. Ctrl+Z to undo."); } });
    btns.push({ label: isNew ? "Add field" : "Save", cls: "primary", submit: true, run: function () {
      var nm = name.value.trim(); if (!nm) { name.focus(); return false; }
      if (T.fields.some(function (x) { return x !== f && x.name.toLowerCase() === nm.toLowerCase(); })) { S3.toast("There's already a field with that name", "error"); return false; }
      var t = type.value, opts = {};
      if (work.dec != null) opts.dec = work.dec;
      if (t === "currency") opts.sym = work.sym;
      if (t === "rating") opts.max = work.max;
      if (t === "link") {
        if (work.table === "__new" || !work.table) { var nt = C.newTable(C.uniqueTableName(B, nm), [C.newField("Name", "text")]); B.tables.push(nt); work.table = nt.id; }
        opts.table = work.table;
      }
      if (isNew) {
        if (t === "link") { C.addLinkField(B, T, nm, opts.table); }
        else { var nf = C.newField(nm, t, opts); if (t === "select" || t === "multi") nf.opts.choices = work.choices.filter(function (c) { return c.name.trim(); }); T.fields.push(nf); if (V.type === "kanban" && t === "select" && !V.by) V.by = nf.id; if (V.type === "calendar" && t === "date" && !V.by) V.by = nf.id; }
        commit("Field added");
      } else {
        f.name = nm;
        if (t !== f.type) C.convertField(B, T, f, t, opts);
        else {
          Object.assign(f.opts, opts);
          if (t === "select" || t === "multi") {
            var keep = {}; work.choices.forEach(function (c) { if (c.name.trim()) keep[c.id] = 1; });
            f.opts.choices = work.choices.filter(function (c) { return c.name.trim(); });
            T.records.forEach(function (r) { var v = r.c[f.id]; if (t === "select" && v && !keep[v]) delete r.c[f.id]; if (t === "multi" && v) r.c[f.id] = v.filter(function (x) { return keep[x]; }); });
          }
        }
        T.views.forEach(function (vw) { C.cleanView(T, vw); });
        commit();
      }
    } });
    sheet(isNew ? "Add a field" : "Edit field", h("div", { "class": "stack" }, [h("div", { "class": "grid-2" }, [field("Name", name), field("Type", type)]), optsBox]), btns);
  }

  // ---------- view controls ----------
  function filterPop() {
    var box = h("div", { "class": "stack", style: "gap:8px" });
    function draw() {
      box.textContent = "";
      if (!V.filters.length) box.appendChild(h("p", { "class": "faint", style: "margin:0", text: "No filters. Records must match every condition you add." }));
      V.filters.forEach(function (c, i) {
        var f = C.field(T, c.f);
        var fs = h("select", { "class": "select", "aria-label": "Field" }); T.fields.forEach(function (x) { fs.appendChild(option(x.id, x.name, x.id === c.f)); });
        fs.addEventListener("change", function () { c.f = fs.value; c.op = C.opsFor(C.field(T, c.f))[0][0]; c.val = ""; commit(); draw(); });
        var os = h("select", { "class": "select", "aria-label": "Condition" }); C.opsFor(f).forEach(function (o) { os.appendChild(option(o[0], o[1], o[0] === c.op)); });
        os.addEventListener("change", function () { c.op = os.value; commit(); draw(); });
        var val;
        if (/^(empty|filled|on|off|past|future)$/.test(c.op)) val = h("span");
        else if (f.type === "select" || f.type === "multi") {
          val = h("select", { "class": "select", "aria-label": "Value" }, [option("", "Choose…", !c.val)]);
          (f.opts.choices || []).forEach(function (ch) { val.appendChild(option(ch.id, ch.name, (Array.isArray(c.val) ? c.val[0] : c.val) === ch.id)); });
          val.addEventListener("change", function () { c.val = f.type === "multi" ? (val.value ? [val.value] : []) : val.value; commit(); });
        } else {
          val = h("input", { "class": "input", type: f.type === "date" ? "date" : "text", "aria-label": "Value", dir: "auto" }); val.value = c.val || "";
          val.addEventListener("input", S3.debounce(function () { c.val = val.value; commit(); }, 250));
        }
        box.appendChild(h("div", { "class": "cond" }, [fs, os, val, h("button", { "class": "btn ghost icon small", type: "button", "aria-label": "Remove condition", html: S3.icon("x"), onclick: function () { V.filters.splice(i, 1); commit(); draw(); } })]));
      });
      box.appendChild(h("div", { "class": "row" }, [h("button", { "class": "btn small", type: "button", text: "+ Add condition", onclick: function () { var f0 = T.fields[0]; V.filters.push({ f: f0.id, op: C.opsFor(f0)[0][0], val: "" }); commit(); draw(); } })]));
    }
    draw();
    pop($("#filterBtn"), [h("div", { "class": "hd", text: "Filter " + V.name }), box]);
  }
  function sortPop() {
    var box = h("div", { "class": "stack", style: "gap:8px" });
    function draw() {
      box.textContent = "";
      if (!V.sorts.length) box.appendChild(h("p", { "class": "faint", style: "margin:0", text: "No sorting: records keep the order you added them." }));
      V.sorts.forEach(function (s, i) {
        var fs = h("select", { "class": "select" }); T.fields.forEach(function (x) { fs.appendChild(option(x.id, x.name, x.id === s.f)); });
        fs.addEventListener("change", function () { s.f = fs.value; commit(); });
        var ds = h("select", { "class": "select" }, [option("0", "A → Z, 1 → 9", !s.desc), option("1", "Z → A, 9 → 1", s.desc)]);
        ds.addEventListener("change", function () { s.desc = ds.value === "1"; commit(); });
        box.appendChild(h("div", { "class": "cond", style: "grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 28px" }, [fs, ds, h("button", { "class": "btn ghost icon small", type: "button", "aria-label": "Remove sort", html: S3.icon("x"), onclick: function () { V.sorts.splice(i, 1); commit(); draw(); } })]));
      });
      box.appendChild(h("div", { "class": "row" }, [h("button", { "class": "btn small", type: "button", text: "+ Add sort", onclick: function () { V.sorts.push({ f: T.fields[0].id, desc: false }); commit(); draw(); } })]));
    }
    draw();
    pop($("#sortBtn"), [h("div", { "class": "hd", text: "Sort " + V.name }), box]);
  }
  function hidePop() {
    var list = h("div", { "class": "list" });
    T.fields.forEach(function (f, i) {
      var cb = h("input", { type: "checkbox", disabled: i === 0 }); cb.checked = i === 0 || V.hidden.indexOf(f.id) < 0;
      cb.addEventListener("change", function () { V.hidden = V.hidden.filter(function (x) { return x !== f.id; }); if (!cb.checked) V.hidden.push(f.id); commit(); });
      list.appendChild(h("label", { "class": "check opt" }, [cb, h("span", { "class": "ty", style: "color:var(--text-3)", text: GLYPH[f.type] }), h("span", { dir: "auto", text: f.name })]));
    });
    pop($("#hideBtn"), [h("div", { "class": "hd", text: "Fields shown in " + V.name }), list, h("button", { "class": "btn small", type: "button", text: "+ Add a field", onclick: function () { closePop(); fieldSheet(null); } })]);
  }
  function byPop() {
    var want = V.type === "kanban" ? "select" : V.type === "calendar" ? "date" : "file";
    var list = T.fields.filter(function (f) { return f.type === want; });
    var items = [h("div", { "class": "hd", text: V.type === "kanban" ? "Stack cards by" : V.type === "calendar" ? "Show records on" : "Cover image from" })];
    list.forEach(function (f) { items.push(opt(f.name, function () { V.by = f.id; commit(); }, f.id === V.by ? "✓" : null)); });
    items.push(opt("+ New " + C.TYPES[want].toLowerCase() + " field", function () { fieldSheet(null, want); }));
    pop($("#byBtn"), items);
  }
  function viewMenu() {
    var items = [h("div", { "class": "hd", text: "Views of " + T.name })];
    T.views.forEach(function (v) { items.push(opt(v.name, function () { V = v; cur = null; render(); }, v === V ? "✓" : { grid: "Grid", kanban: "Kanban", calendar: "Calendar", gallery: "Gallery" }[v.type])); });
    items.push(h("div", { "class": "sep" }));
    [["grid", "Grid"], ["kanban", "Kanban"], ["calendar", "Calendar"], ["gallery", "Gallery"]].forEach(function (k) {
      items.push(opt("+ New " + k[1].toLowerCase() + " view", function () { var nv = C.newView(k[1] + " " + (T.views.filter(function (v) { return v.type === k[0]; }).length + 1), k[0]); T.views.push(nv); V = nv; commit(); }));
    });
    items.push(h("div", { "class": "sep" }));
    items.push(opt("Rename this view", function () {
      var i = h("input", { "class": "input", maxlength: 80, dir: "auto" }); i.value = V.name;
      sheet("Rename view", field("Name", i), [{ label: "Save", cls: "primary", submit: true, run: function () { if (i.value.trim()) { V.name = i.value.trim(); commit(); } } }]);
    }));
    if (T.views.length > 1) items.push(opt("Delete this view", function () { T.views = T.views.filter(function (v) { return v !== V; }); V = T.views[0]; commit("View deleted"); }));
    pop($("#viewBtn"), items);
  }
  function tableMenu(anchor) {
    pop(anchor, [h("div", { "class": "hd", text: T.name }),
      opt("Rename table", function () {
        var i = h("input", { "class": "input", maxlength: 120, dir: "auto" }); i.value = T.name;
        sheet("Rename table", field("Name", i), [{ label: "Save", cls: "primary", submit: true, run: function () { if (i.value.trim()) { T.name = i.value.trim(); commit(); } } }]);
      }),
      opt("Export as CSV", exportCSV),
      B.tables.length > 1 ? opt("Delete table", function () {
        sheet("Delete “" + T.name + "”?", h("p", { "class": "muted", text: "This deletes the table and its " + T.records.length + " records. Links to it from other tables become plain text. You can undo right after." }), [
          { label: "Cancel", cls: "ghost", run: function () {} },
          { label: "Delete table", cls: "danger", run: function () { C.deleteTable(B, T.id); T = B.tables[0]; V = T.views[0]; commit("Table deleted. Ctrl+Z to undo."); } }]);
      }) : null].filter(Boolean));
  }
  function addTableMenu(anchor) {
    pop(anchor, [opt("Blank table", function () { var t = C.newTable(C.uniqueTableName(B, "Table " + (B.tables.length + 1))); B.tables.push(t); T = t; V = t.views[0]; commit(); }),
      opt("Import a CSV file…", importCSV)]);
  }
  function baseMenu() {
    allBases().then(function (list) {
      list.sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
      var items = [h("div", { "class": "hd", text: "Your bases (in this browser)" })];
      list.forEach(function (x) { items.push(opt(x.name, function () { if (x.id !== B.id) { try { openBase(C.normalize(x)); } catch (e) { S3.toast("Could not open it", "error"); } } }, x.id === B.id ? "✓" : x.tables.length + " table" + (x.tables.length === 1 ? "" : "s"))); });
      items.push(h("div", { "class": "sep" }), h("div", { "class": "hd", text: "New" }),
        opt("Blank base", function () { openBase(C.newBase("Untitled base")); renameBase(); }),
        opt("Contacts (template)", function () { openBase(C.template("contacts")); }),
        opt("Content calendar (template)", function () { openBase(C.template("content")); }),
        opt("Inventory (template)", function () { openBase(C.template("inventory")); }),
        h("div", { "class": "sep" }),
        opt("Rename this base", renameBase),
        opt("Open a backup file…", openBackup),
        opt("Delete this base…", function () {
          sheet("Delete “" + B.name + "”?", h("p", { "class": "muted", text: "This removes the base and its attachments from this browser. Download a backup first if you might want it back." }), [
            { label: "Cancel", cls: "ghost", run: function () {} },
            { label: "Delete base", cls: "danger", run: function () {
              var id = B.id; B = null;
              delBase(id).then(allBases).then(function (rest) { collectGarbage(rest); openBase(rest[0] ? C.normalize(rest[0]) : C.template("contacts")); S3.toast("Base deleted"); });
            } }]);
        }));
      pop($("#baseBtn"), items);
    });
  }
  function renameBase() {
    var i = h("input", { "class": "input", maxlength: 120, dir: "auto" }); i.value = B.name;
    sheet("Name this base", field("Name", i), [{ label: "Save", cls: "primary", submit: true, run: function () { if (i.value.trim()) { B.name = i.value.trim(); commit(); } } }]);
  }

  // ---------- import / export ----------
  function fileBase(s) { return (s || "base").replace(/[^\w\u0600-\u06FF\- ]+/g, "").trim().replace(/\s+/g, "-") || "base"; }
  function exportCSV() { S3.download(C.exportCSV(B, T, V, currentRows()), fileBase(B.name + "-" + T.name) + ".csv", "text/csv"); S3.done(); }
  function importCSV() {
    var inp = h("input", { type: "file", accept: ".csv,.tsv,.txt,text/csv" });
    inp.addEventListener("change", function () {
      var f = inp.files[0]; if (!f) return;
      if (f.size > 30e6) { S3.toast("That CSV is over 30 MB, too big to handle comfortably in a browser", "error"); return; }
      S3.readFile(f, "text").then(function (txt) {
        var t = C.importCSV(B, txt, f.name.replace(/\.(csv|tsv|txt)$/i, ""));
        T = t; V = t.views[0]; commit("Imported " + t.records.length + " records into “" + t.name + "”. Check the field types (click a column name).");
        S3.done();
      }).catch(function () { S3.toast("Could not read that CSV", "error"); });
    });
    inp.click();
  }
  function blobToB64(blob) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1] || ""); }; r.onerror = function () { res(""); }; r.readAsDataURL(blob); }); }
  function backup() {
    saveNow();
    var ids = [];
    B.tables.forEach(function (t) { t.fields.forEach(function (f) { if (f.type === "file") t.records.forEach(function (r) { (r.c[f.id] || []).forEach(function (x) { ids.push(x); }); }); }); });
    var files = {};
    Promise.all(ids.map(function (x) { return getFile(x.id).then(function (fr) { if (fr && fr.blob) return blobToB64(fr.blob).then(function (b64) { files[x.id] = { name: x.name, type: x.type, data: b64 }; }); }); }))
      .then(function () {
        S3.download(JSON.stringify({ app: "s3-base-backup", v: 1, saved: new Date().toISOString(), base: B, files: files }), fileBase(B.name) + ".base.json", "application/json");
        S3.done();
      });
  }
  function openBackup() {
    var inp = h("input", { type: "file", accept: ".json,application/json" });
    inp.addEventListener("change", function () {
      var f = inp.files[0]; if (!f) return;
      S3.readFile(f, "text").then(function (txt) {
        var o = JSON.parse(txt), base = C.normalize(o.app === "s3-base-backup" ? o.base : o), files = o.files || {};
        return allBases().then(function (list) {
          if (list.some(function (x) { return x.id === base.id; })) { base.id = C.uid(); base.name += " (backup)"; }
          var jobs = Object.keys(files).map(function (id) {
            var x = files[id]; if (!db || !x || !x.data) return null;
            var bin = atob(x.data), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return putFile(id, { blob: new Blob([arr], { type: x.type || "" }), name: x.name, type: x.type });
          });
          return Promise.all(jobs).then(function () { openBase(base); S3.toast("Opened " + base.name); });
        });
      }).catch(function () { S3.toast("That file is not a Base backup", "error"); });
    });
    inp.click();
  }
  function helpSheet() {
    var keys = [["Arrows / Tab", "Move between cells"], ["Enter", "Edit the cell (Enter again saves)"], ["Type", "Start typing to replace a cell"], ["Space", "Open the whole record"],
      ["Delete", "Clear the cell"], ["Ctrl+C / Ctrl+V", "Copy and paste cells, also from spreadsheets"], ["Ctrl+Z", "Undo"], ["N", "New record"], ["/", "Search"], ["?", "This help"]];
    var grid = h("div", { "class": "keys" });
    keys.forEach(function (k) { grid.appendChild(h("kbd", { text: k[0] })); grid.appendChild(h("span", { text: k[1] })); });
    sheet("Shortcuts and tips", h("div", { "class": "stack" }, [grid, h("p", { "class": "faint", text: "Click a column name to sort, filter, change its type or delete it. Each view keeps its own filters, sorts and hidden fields. Everything is saved in this browser; download a backup now and then." })]),
      [{ label: "Close", cls: "primary", submit: true, run: function () {} }]);
  }

  // ---------- keyboard and clipboard in the grid ----------
  function typing(e) { var t = e.target; return t && /INPUT|TEXTAREA|SELECT/.test(t.tagName); }
  function onKey(e) {
    if (!B || $(".s3-modal") || edEl) return;
    if (popEl) { if (e.key === "Escape") closePop(); return; }
    var mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z" && !typing(e)) { e.preventDefault(); undo(); return; }
    if (typing(e) || mod || e.altKey) return;
    if (e.key === "?") { helpSheet(); return; }
    if (e.key === "/") { e.preventDefault(); $("#search").focus(); return; }
    if (V.type !== "grid" || !cur) { if (e.key === "n" || e.key === "N") { e.preventDefault(); addRecord(); } return; }
    var k = e.key;
    if (k === "ArrowDown") { e.preventDefault(); moveCur(1, 0); }
    else if (k === "ArrowUp") { e.preventDefault(); moveCur(-1, 0); }
    else if (k === "ArrowRight" || (k === "Tab" && !e.shiftKey)) { e.preventDefault(); moveCur(0, 1); }
    else if (k === "ArrowLeft" || (k === "Tab" && e.shiftKey)) { e.preventDefault(); moveCur(0, -1); }
    else if (k === "Enter") { e.preventDefault(); edit(); }
    else if (k === " ") { e.preventDefault(); recordSheet(cur.r); }
    else if (k === "Escape") { cur = null; $$(".bs-grid td.cur").forEach(function (x) { x.classList.remove("cur"); }); }
    else if (k === "Delete" || k === "Backspace") {
      e.preventDefault(); var f = C.field(T, cur.f), r = C.record(T, cur.r);
      if (f && r && !C.empty(r.c[f.id])) { if (f.type === "link") C.setLinks(B, T, f, r, []); else delete r.c[f.id]; commit(); }
    } else if (k.length === 1) {
      var ff = C.field(T, cur.f);
      if (ff && /^(text|long|number|currency|percent|url|email|phone)$/.test(ff.type)) { e.preventDefault(); edit(k); }
      else if (ff && /select|multi|link/.test(ff.type)) { e.preventDefault(); edit(); if (popEl) { var s = $("input", popEl); if (s) { s.value = k; s.dispatchEvent(new Event("input")); } } }
    }
  }
  function onCopy(e) {
    if (!B || typing(e) || V.type !== "grid" || !cur || $(".s3-modal")) return;
    var f = C.field(T, cur.f), r = C.record(T, cur.r); if (!f || !r) return;
    e.preventDefault(); e.clipboardData.setData("text/plain", f.type === "check" ? (r.c[f.id] ? "true" : "false") : C.display(B, f, r.c[f.id]));
  }
  function onPaste(e) {
    if (!B || typing(e) || V.type !== "grid" || !cur || $(".s3-modal")) return;
    var txt = e.clipboardData ? e.clipboardData.getData("text/plain") : ""; if (!txt) return;
    e.preventDefault();
    // a block from a spreadsheet: tab-separated rows; extra rows become new records
    var lines = txt.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map(function (l) { return l.split("\t"); });
    var rows = currentRows(), fs = visibleFields(), ri = rows.findIndex(function (r) { return r.id === cur.r; }), fi = fs.findIndex(function (f) { return f.id === cur.f; });
    lines.forEach(function (cells, i) {
      var r = rows[ri + i]; if (!r) { r = C.newRecord(T); T.records.push(r); }
      cells.forEach(function (cell, j) { var f = fs[fi + j]; if (!f || f.type === "file") return; var v = C.parse(B, f, cell); if (C.empty(v) && v !== 0 && v !== false) delete r.c[f.id]; else C.setValue(B, T, f, r, v); });
    });
    commit(lines.length > 1 || lines[0].length > 1 ? "Pasted " + lines.length + " row" + (lines.length === 1 ? "" : "s") : null);
  }

  // ---------- self-test ----------
  window.S3_SELFTEST = function () {
    try {
      var b = C.template("inventory"), t = b.tables[0], v = C.newView("x", "grid"), price = t.fields[2];
      v.filters = [{ f: price.id, op: "gt", val: "5" }]; v.sorts = [{ f: price.id, desc: true }];
      var rs = C.rows(b, t, v), ok = rs.length === 3 && rs[0].c[price.id] === 15;
      var t2 = C.importCSV(b, "Name,When,Count\nA,2026-01-02,3\nB,2026-01-03,4\n", "x");
      ok = ok && t2.fields[1].type === "date" && t2.fields[2].type === "number" && C.exportCSV(b, t2, t2.views[0]).indexOf("A,2026-01-02,3") >= 0;
      var lf = t.fields.filter(function (f) { return f.type === "link"; })[0], sup = C.table(b, lf.opts.table), inv = C.field(sup, lf.opts.inv);
      ok = ok && sup.records.every(function (s) { return (s.c[inv.id] || []).length === 2; });
      ok = ok && C.normalize(JSON.parse(JSON.stringify(b))).tables.length === b.tables.length;
      return Promise.resolve(ok && !!$("#content"));
    } catch (e) { return Promise.resolve(false); }
  };

  // ---------- start ----------
  function start() {
    $("#baseBtn").addEventListener("click", baseMenu);
    $("#undoBtn").addEventListener("click", undo);
    $("#helpBtn").addEventListener("click", helpSheet);
    $("#backupBtn").addEventListener("click", backup);
    $("#viewBtn").addEventListener("click", viewMenu);
    $("#filterBtn").addEventListener("click", filterPop);
    $("#sortBtn").addEventListener("click", sortPop);
    $("#hideBtn").addEventListener("click", hidePop);
    $("#byBtn").addEventListener("click", byPop);
    $("#addBtn").addEventListener("click", function () { addRecord(); });
    $("#importBtn").addEventListener("click", importCSV);
    $("#exportBtn").addEventListener("click", exportCSV);
    $("#search").addEventListener("input", S3.debounce(function () { q = $("#search").value; render(); }, 150));
    document.addEventListener("keydown", onKey);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") saveNow(); });
    window.addEventListener("resize", S3.debounce(function () { closeEditor(); }, 100));
    openDB().then(function (d) {
      db = d;
      return allBases();
    }).then(function (list) {
      collectGarbage(list);
      var want = S3.store("base:open"), raw = list.filter(function (x) { return x.id === want; })[0] || list.sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); })[0];
      var b = null; if (raw) { try { b = C.normalize(raw); } catch (e) {} }
      openBase(b || C.template("contacts"));
      if (!raw) S3.toast("This is a sample base. Make your own from the base menu (top left).");
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
