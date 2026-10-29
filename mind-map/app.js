/* Mind Map UI. Maps stay in this browser (localStorage via S3.store). Tree and layout live in core.js. */
(function () {
  "use strict";
  var M = window.MindCore, h = S3.h, $ = S3.$, $$ = S3.$$;
  var NS = "http://www.w3.org/2000/svg", FONT = "Arial, Helvetica, 'Noto Sans Arabic', sans-serif";
  var map = null, sel = null, view = { x: 0, y: 0, z: 1 }, L = null, undoStack = [], redoStack = [], lastJSON = "";
  var drag = null, pointers = {}, pinch = null, lastTap = { t: 0, id: null }, editing = null;
  var svg, world, linksG, nodesG, overG, stage, editor;
  var THEMES = {
    light: { bg: "#fbfcfd", text: "#0f172a", rootFill: "#0e9f9a", rootText: "#ffffff", nodeFill: "#ffffff", sub: "#475569" },
    dark: { bg: "#11161c", text: "#e8edf3", rootFill: "#e8edf3", rootText: "#0f172a", nodeFill: "#1b222a", sub: "#94a3b8" },
    color: { bg: "#fff9f0", text: "#1f2937", rootFill: "#1f2937", rootText: "#ffffff", nodeFill: "#ffffff", sub: "#475569" }
  };

  function el(tag, attrs, kids) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs || {}) if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  var mctx = null;
  function measure(fs, bold) { mctx = mctx || document.createElement("canvas").getContext("2d"); var f = (bold ? "bold " : "") + fs + "px " + FONT; return function (s) { mctx.font = f; return mctx.measureText(s).width; }; }
  function style(depth) { return depth === 0 ? { fs: 20, bold: true, px: 18, py: 12, max: 260 } : depth === 1 ? { fs: 16, bold: true, px: 14, py: 9, max: 230 } : { fs: 14, bold: false, px: 11, py: 7, max: 210 }; }
  var depthOf = {};
  function sizeOf(n) {
    var st = style(depthOf[n.id] || 0), m = measure(st.fs, st.bold);
    var text = (n.icon ? n.icon + " " : "") + (n.text || " ");
    var lines = M.wrap(text, st.max, m), w = Math.max.apply(null, lines.map(m));
    n._lines = lines;
    return { w: Math.max((depthOf[n.id] || 0) === 0 ? 120 : 40, Math.ceil(w) + st.px * 2 + (n.note ? 14 : 0)), h: Math.ceil(lines.length * st.fs * 1.3 + st.py * 2) };
  }
  function relayout() { var ix = M.index(map); depthOf = ix.dep; L = M.layout(map, sizeOf); }

  // ---------- drawing (screen and export) ----------
  function hexA(c, a) { return c + Math.round(a * 255).toString(16).padStart(2, "0"); }
  function drawInto(gLinks, gNodes, forExport) {
    var th = THEMES[map.theme] || THEMES.light, pos = L.pos;
    M.walk(map.root, function (n, p, d) {
      var q = pos[n.id]; if (!q) return;
      if (p && pos[p.id]) {
        var pp = pos[p.id], s = q.side === "r" ? 1 : -1;
        var x1 = pp.x + s * pp.w / 2, y1 = pp.y, x2 = q.x - s * q.w / 2, y2 = q.y, mx = (x1 + x2) / 2;
        if (d === 1) { x1 = pp.x + s * pp.w * 0.38; }
        gLinks.appendChild(el("path", { d: "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "C" + mx.toFixed(1) + " " + y1.toFixed(1) + " " + mx.toFixed(1) + " " + y2.toFixed(1) + " " + x2.toFixed(1) + " " + y2.toFixed(1),
          fill: "none", stroke: q.color, "stroke-width": d === 1 ? 3.2 : 2, "stroke-linecap": "round", opacity: 0.9 }));
      }
      var st = style(d), g = el("g", forExport ? {} : { "data-id": n.id });
      var fill, stroke, color = th.text, sw = 2;
      if (d === 0) { fill = th.rootFill; stroke = th.rootFill; color = th.rootText; }
      else if (d === 1) { fill = map.theme === "color" ? q.color : hexA(q.color, map.theme === "dark" ? 0.28 : 0.14); stroke = q.color; color = map.theme === "color" ? "#ffffff" : th.text; }
      else { fill = map.theme === "color" ? hexA(q.color, 0.12) : th.nodeFill; stroke = hexA(q.color, 0.75); sw = 1.5; }
      g.appendChild(el("rect", { x: q.x - q.w / 2, y: q.y - q.h / 2, width: q.w, height: q.h, rx: d === 0 ? q.h / 2 : 10, fill: fill, stroke: stroke, "stroke-width": sw }));
      var lines = n._lines || [n.text], lh = st.fs * 1.3, top = q.y - (lines.length * lh) / 2 + lh / 2;
      lines.forEach(function (ln, i) {
        g.appendChild(el("text", { x: q.x - (n.note ? 7 : 0), y: top + i * lh, "text-anchor": "middle", "dominant-baseline": "central", "font-family": FONT, "font-size": st.fs, "font-weight": st.bold ? "bold" : null, fill: color, direction: /[\u0590-\u08FF]/.test(ln) ? "rtl" : null, "unicode-bidi": /[\u0590-\u08FF]/.test(ln) ? "plaintext" : null }, [ln]));
      });
      if (n.note) g.appendChild(el("circle", { cx: q.x + q.w / 2 - 10, cy: q.y - q.h / 2 + 10, r: 3.5, fill: d === 0 || (d === 1 && map.theme === "color") ? color : q.color }, [el("title", {}, ["Has a note"])]));
      if (n.col && n.children.length) {
        var cx = q.x + (q.side === "l" ? -1 : 1) * (q.w / 2 + 11);
        g.appendChild(el("circle", { cx: cx, cy: q.y, r: 10, fill: th.nodeFill, stroke: q.color || th.text, "stroke-width": 1.5 }));
        g.appendChild(el("text", { x: cx, y: q.y, "text-anchor": "middle", "dominant-baseline": "central", "font-family": FONT, "font-size": 10.5, "font-weight": "bold", fill: q.color || th.text }, [String(M.count(n) - 1)]));
      }
      gNodes.appendChild(g);
    });
  }
  function render() {
    if (!map) return;
    relayout();
    var th = THEMES[map.theme] || THEMES.light;
    stage.style.background = th.bg;
    world.setAttribute("transform", "translate(" + view.x + " " + view.y + ") scale(" + view.z + ")");
    linksG.textContent = ""; nodesG.textContent = "";
    drawInto(linksG, nodesG, false);
    drawOverlay();
    $("#zoomFit").textContent = Math.round(view.z * 100) + "%";
    $("#undoBtn").disabled = !undoStack.length; $("#redoBtn").disabled = !redoStack.length;
    var n = sel && M.find(map, sel);
    $("#colBtn").textContent = n && n.col ? "Expand" : "Collapse";
    $("#colBtn").disabled = !n || !n.children.length;
    ["#sibBtn", "#delBtn"].forEach(function (b) { $(b).disabled = !n || n === map.root; });
    ["#childBtn", "#editBtn", "#colorBtn", "#iconBtn", "#noteBtn"].forEach(function (b) { $(b).disabled = !n; });
    placeEditor();
  }
  function drawOverlay() {
    overG.textContent = "";
    var q = sel && L.pos[sel];
    if (q) overG.appendChild(el("rect", { x: q.x - q.w / 2 - 4, y: q.y - q.h / 2 - 4, width: q.w + 8, height: q.h + 8, rx: 13, fill: "none", stroke: "#0e9f9a", "stroke-width": 2.5 / Math.max(0.5, view.z) * Math.min(1, view.z) + 0.5, "stroke-dasharray": null, "pointer-events": "none" }));
    if (drag && drag.target) {
      var t = L.pos[drag.target];
      if (t) overG.appendChild(el("rect", { x: t.x - t.w / 2 - 6, y: t.y - t.h / 2 - 6, width: t.w + 12, height: t.h + 12, rx: 14, fill: "rgba(14,159,154,.12)", stroke: "#0e9f9a", "stroke-width": 2, "stroke-dasharray": "6 4", "pointer-events": "none" }));
    }
    if (drag && drag.ghost) overG.appendChild(drag.ghost);
  }

  // ---------- model, undo, storage ----------
  function list() { return S3.store("mm:list") || []; }
  function saveNow() {
    if (!map) return;
    var ok = S3.store("mm:m:" + map.id, strip(map)) !== undefined;
    var l = list().filter(function (x) { return x.id !== map.id; });
    l.unshift({ id: map.id, name: map.name, updated: map.updated, n: M.count(map.root) });
    S3.store("mm:list", l.slice(0, 200)); S3.store("mm:open", map.id);
    if (!ok && !saveNow.warned) { saveNow.warned = true; S3.toast("Could not save in this browser (storage full or blocked). Use Save file.", "error"); }
  }
  // the layout cache (_lines) is never saved
  function strip(m) { return JSON.parse(JSON.stringify(m, function (k, v) { return k === "_lines" ? undefined : v; })); }
  var saveSoon = S3.debounce(saveNow, 300);
  function commit() {
    var now = JSON.stringify(strip(map));
    if (now !== lastJSON) { undoStack.push(lastJSON); if (undoStack.length > 100) undoStack.shift(); redoStack = []; lastJSON = now; map.updated = Date.now(); saveSoon(); }
    render();
  }
  function restore(json) { map = M.normalize(JSON.parse(json)); lastJSON = JSON.stringify(strip(map)); if (sel && !M.find(map, sel)) sel = map.root.id; saveSoon(); render(); }
  function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(strip(map))); restore(undoStack.pop()); }
  function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(strip(map))); restore(redoStack.pop()); }
  function openMap(m, edit) {
    if (map) saveNow();
    map = m; sel = map.root.id; undoStack = []; redoStack = []; lastJSON = JSON.stringify(strip(map));
    $("#mapName").value = map.name;
    render(); fit(); saveNow();
    if (edit) startEdit(map.root.id, true);
  }
  function loadMap(id) { var raw = S3.store("mm:m:" + id); if (!raw) return null; try { return M.normalize(raw); } catch (e) { return null; } }

  // ---------- view ----------
  function fit() {
    relayout();
    var b = L.bounds, r = svg.getBoundingClientRect(); if (!r.width) return;
    var z = Math.min(1.4, Math.max(0.2, Math.min((r.width - 60) / b.w, (r.height - 60) / b.h)));
    view = { z: z, x: r.width / 2 - (b.x + b.w / 2) * z, y: r.height / 2 - (b.y + b.h / 2) * z };
    render();
  }
  function zoomAt(z, cx, cy) {
    z = Math.min(3, Math.max(0.15, z));
    var r = svg.getBoundingClientRect(), px = cx == null ? r.width / 2 : cx - r.left, py = cy == null ? r.height / 2 : cy - r.top;
    var wx = (px - view.x) / view.z, wy = (py - view.y) / view.z;
    view.z = z; view.x = px - wx * z; view.y = py - wy * z; render();
  }
  function toWorld(cx, cy) { var r = svg.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z }; }
  function ensureVisible(id) {
    var q = L.pos[id]; if (!q) return;
    var r = svg.getBoundingClientRect(), sx = q.x * view.z + view.x, sy = q.y * view.z + view.y, pad = 60;
    var dx = sx < pad ? pad - sx : sx > r.width - pad ? r.width - pad - sx : 0, dy = sy < pad ? pad - sy : sy > r.height - pad ? r.height - pad - sy : 0;
    if (dx || dy) { view.x += dx; view.y += dy; render(); }
  }
  function nodeAt(p) {
    var hit = null;
    Object.keys(L.pos).forEach(function (id) { var q = L.pos[id]; if (Math.abs(p.x - q.x) <= q.w / 2 + 4 && Math.abs(p.y - q.y) <= q.h / 2 + 4) hit = id; });
    return hit;
  }
  function select(id) { sel = id; render(); ensureVisible(id); }

  // ---------- editing ----------
  function startEdit(id, selectAll, initial) {
    var n = M.find(map, id); if (!n) return;
    sel = id; editing = { id: id, before: n.text };
    editor.value = initial != null ? initial : n.text;
    editor.hidden = false; render();
    editor.focus();
    if (initial != null) editor.setSelectionRange(editor.value.length, editor.value.length); else if (selectAll !== false) editor.select();
  }
  function placeEditor() {
    if (!editing || editor.hidden) return;
    var q = L.pos[editing.id]; if (!q) return;
    var st = style(depthOf[editing.id] || 0), w = Math.max(160, q.w + 40) * view.z;
    editor.style.width = w + "px"; editor.style.left = (q.x * view.z + view.x - w / 2) + "px";
    var hh = Math.max(q.h, st.fs * 1.3 * Math.max(1, editor.value.split("\n").length) + st.py * 2) * view.z + 8;
    editor.style.height = hh + "px"; editor.style.top = (q.y * view.z + view.y - hh / 2) + "px";
    editor.style.fontSize = Math.max(12, st.fs * view.z) + "px"; editor.style.fontWeight = st.bold ? "bold" : "normal";
  }
  function finishEdit(cancel) {
    if (!editing) return;
    var n = M.find(map, editing.id), ed = editing; editing = null; editor.hidden = true;
    if (n && !cancel) n.text = editor.value.replace(/\r/g, "").slice(0, 2000).trim();
    if (n && cancel && ed.isNew && !n.text) { var nx = M.remove(map, n.id); sel = nx ? nx.id : map.root.id; }
    else if (n && !n.text && n !== map.root && ed.isNew) { var nx2 = M.remove(map, n.id); sel = nx2 ? nx2.id : map.root.id; }
    if (n === map.root && !map.root.text) map.root.text = "Central topic";
    // a map named after its centre topic follows it
    if (n === map.root && (map.name === "Untitled map" || map.name === ed.before)) { map.name = map.root.text.split("\n")[0].slice(0, 120); $("#mapName").value = map.name; }
    commit();
    svg.focus({ preventScroll: true });
  }
  function addChild() {
    if (!sel) return;
    var n = M.addChild(map, sel, ""); commit(); startEdit(n.id); editing.isNew = true; ensureVisible(n.id);
  }
  function addSibling() {
    if (!sel) return;
    if (sel === map.root.id) { addChild(); return; }
    var n = M.addSibling(map, sel, ""); commit(); startEdit(n.id); editing.isNew = true; ensureVisible(n.id);
  }
  function del() {
    if (!sel || sel === map.root.id) return;
    var n = M.find(map, sel), k = M.count(n) - 1;
    var next = M.remove(map, sel); sel = next ? next.id : map.root.id; commit();
    if (k) S3.toast("Deleted with " + k + " subtopic" + (k === 1 ? "" : "s") + ". Ctrl+Z to undo.");
  }
  function toggle() { var n = sel && M.find(map, sel); if (n && n.children.length) { n.col = !n.col; commit(); } }

  // keyboard navigation follows the picture: left/right toward parent or children, up/down between neighbours
  function nav(key) {
    if (!sel) { select(map.root.id); return; }
    var ix = M.index(map), n = ix.by[sel], q = L.pos[sel], par = ix.par[sel];
    var visible = function (k) { return !!L.pos[k.id]; };
    if (key === "ArrowLeft" || key === "ArrowRight") {
      var dir = key === "ArrowRight" ? "r" : "l";
      if (sel === map.root.id) { var first = map.root.children.filter(function (c) { return L.pos[c.id] && L.pos[c.id].side === dir; })[0]; if (first) select(first.id); return; }
      if (q.side === dir) { if (n.col && n.children.length) { n.col = false; commit(); } var c = n.children.filter(visible)[0] || (n.col ? null : null); if (c) select(c.id); else if (n.children[0]) select(n.children[0].id); }
      else if (par) select(par);
      return;
    }
    // up/down: nearest visible topic above/below on the same side, preferring siblings
    var p = par ? ix.by[par] : null, sib = p ? p.children : [];
    var i = sib.indexOf(n), cand = key === "ArrowUp" ? sib.slice(0, i).reverse() : sib.slice(i + 1);
    cand = cand.filter(function (c) { return L.pos[c.id] && L.pos[c.id].side === q.side; });
    if (cand.length) { select(cand[0].id); return; }
    var best = null, bd = Infinity;
    Object.keys(L.pos).forEach(function (id) {
      var o = L.pos[id]; if (id === sel || o.side !== q.side) return;
      var dy = o.y - q.y; if (key === "ArrowUp" ? dy >= 0 : dy <= 0) return;
      var dist = Math.abs(dy) + Math.abs(o.x - q.x) * 0.6; if (dist < bd) { bd = dist; best = id; }
    });
    if (best) select(best);
  }

  // ---------- pointer ----------
  function onDown(e) {
    if (editing) finishEdit();
    closePop();
    svg.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      drag = null; var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.z, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vx: view.x, vy: view.y }; return;
    }
    var p = toWorld(e.clientX, e.clientY), g = e.target.closest("[data-id]"), id = g ? g.getAttribute("data-id") : null;
    if (id) {
      var now = Date.now();
      if (lastTap.id === id && now - lastTap.t < 380) {
        // open the editor on the click that ends this tap, so that click doesn't blur it
        lastTap = { t: 0, id: null }; pendingEdit = id;
        setTimeout(function () { if (pendingEdit === id) { pendingEdit = null; startEdit(id); } }, 700);
        return;
      }
      lastTap = { t: now, id: id };
      sel = id; render();
      drag = { mode: "node", id: id, x0: e.clientX, y0: e.clientY, p0: p, moved: false };
    } else {
      drag = { mode: "pan", x0: e.clientX, y0: e.clientY, vx: view.x, vy: view.y, moved: false };
    }
  }
  var pendingEdit = null;
  function onMove(e) {
    if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pinch) {
      var ids = Object.keys(pointers); if (ids.length < 2) return;
      var a = pointers[ids[0]], b = pointers[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y), r = svg.getBoundingClientRect();
      var z = Math.min(3, Math.max(0.15, pinch.z * d / Math.max(1, pinch.d))), wx = (pinch.cx - r.left - pinch.vx) / pinch.z, wy = (pinch.cy - r.top - pinch.vy) / pinch.z;
      view.z = z; view.x = (a.x + b.x) / 2 - r.left - wx * z; view.y = (a.y + b.y) / 2 - r.top - wy * z; render(); return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
    drag.moved = true;
    if (drag.mode === "pan") { stage.classList.add("panning"); view.x = drag.vx + e.clientX - drag.x0; view.y = drag.vy + e.clientY - drag.y0; render(); return; }
    if (drag.id === map.root.id) return;
    var p = toWorld(e.clientX, e.clientY), q = L.pos[drag.id];
    var t = nodeAt(p); drag.target = t && t !== drag.id && !M.isAncestor(map, drag.id, t) ? t : null;
    drag.ghost = el("rect", { x: p.x - q.w / 2, y: p.y - q.h / 2, width: q.w, height: q.h, rx: 10, fill: "rgba(14,159,154,.18)", stroke: "#0e9f9a", "stroke-width": 1.5, "pointer-events": "none" });
    drag.p = p;
    drawOverlay();
  }
  function onUp(e) {
    delete pointers[e.pointerId];
    if (pinch) { if (Object.keys(pointers).length < 2) pinch = null; return; }
    stage.classList.remove("panning");
    var dg = drag; drag = null;
    if (pendingEdit) return;
    if (!dg) return;
    if (dg.mode === "node" && dg.moved && dg.id !== map.root.id) {
      var n = M.find(map, dg.id), par = M.parentOf(map, dg.id);
      if (dg.target) {
        if (dg.target === map.root.id) { // onto the centre: becomes a main branch on the side it was dropped
          M.moveTo(map, dg.id, map.root.id); n.side = dg.p.x < 0 ? "l" : "r";
        } else M.moveTo(map, dg.id, dg.target);
        commit(); select(dg.id); return;
      }
      if (par === map.root) { n.side = dg.p.x < 0 ? "l" : "r"; // a main branch dropped in space: switch sides / reorder by height
        var sibs = map.root.children.filter(function (c) { return c !== n && L.pos[c.id] && L.pos[c.id].side === n.side; });
        var before = sibs.filter(function (c) { return L.pos[c.id].y < dg.p.y; }).length;
        map.root.children.splice(map.root.children.indexOf(n), 1);
        var anchor = sibs[before]; map.root.children.splice(anchor ? map.root.children.indexOf(anchor) : map.root.children.length, 0, n);
        commit(); return;
      }
      if (par) { // reorder among siblings by where it was dropped
        var others = par.children.filter(function (c) { return c !== n; }), at = others.filter(function (c) { return L.pos[c.id] && L.pos[c.id].y < dg.p.y; }).length;
        par.children = others; par.children.splice(at, 0, n); commit(); return;
      }
    }
    render();
  }

  // ---------- popovers, sheets ----------
  var popEl = null;
  function closePop() { if (popEl) { popEl.remove(); popEl = null; document.removeEventListener("pointerdown", popOut, true); } }
  function popOut(e) { if (popEl && !popEl.contains(e.target)) closePop(); }
  function pop(anchor, kids) {
    closePop(); popEl = h("div", { "class": "mm-pop" }, kids); document.body.appendChild(popEl);
    var r = anchor.getBoundingClientRect();
    popEl.style.left = Math.max(8, Math.min(window.innerWidth - popEl.offsetWidth - 8, r.left)) + "px";
    popEl.style.top = Math.min(window.innerHeight - popEl.offsetHeight - 8, r.bottom + 6) + "px";
    setTimeout(function () { document.addEventListener("pointerdown", popOut, true); }, 0);
    var f = popEl.querySelector("input,button"); if (f) f.focus();
  }
  function opt(label, run, hint) { return h("button", { "class": "opt", type: "button", onclick: function () { closePop(); run(); } }, [h("span", { dir: "auto", text: label })].concat(hint ? [h("small", { text: hint })] : [])); }
  function sheet(title, body, buttons) {
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": title });
    var box = h("div", { "class": "s3-sheet mm-sheet" }), foot = h("div", { "class": "foot" });
    box.appendChild(h("div", { "class": "row between" }, [h("h2", { text: title }), h("button", { "class": "btn ghost icon", type: "button", "aria-label": "Close", html: S3.icon("x"), onclick: close })]));
    box.appendChild(body);
    buttons.forEach(function (b) { foot.appendChild(h("button", { "class": "btn " + (b.cls || ""), type: "button", onclick: function () { if (b.run() !== false) close(); } }, [b.label])); });
    box.appendChild(foot); m.appendChild(box);
    var opened = Date.now();
    function close() { m.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    m.addEventListener("mousedown", function (e) { if (e.target === m && Date.now() - opened > 400) close(); });
    document.addEventListener("keydown", onKey, true); document.body.appendChild(m);
    var f = box.querySelector("textarea,input") || box.querySelector(".foot .primary"); if (f) f.focus();
  }
  function colorPop() {
    var n = sel && M.find(map, sel); if (!n) return;
    var grid = h("div", { "class": "grid" });
    M.BRANCH.concat(["#0f172a", "#64748b"]).forEach(function (c) { var b = h("button", { "class": "sw", type: "button", "aria-label": "Colour " + c, onclick: function () { n.color = c; closePop(); commit(); } }); b.style.background = c; grid.appendChild(b); });
    pop($("#colorBtn"), [h("div", { "class": "hd", text: n === map.root ? "Colour (main branches use their own)" : "Branch colour" }), grid, opt("Automatic colour", function () { delete n.color; commit(); })]);
  }
  function iconPop() {
    var n = sel && M.find(map, sel); if (!n) return;
    var grid = h("div", { "class": "grid" });
    M.ICONS.forEach(function (ic) { grid.appendChild(h("button", { type: "button", "aria-label": "Icon " + ic, text: ic, onclick: function () { n.icon = ic; closePop(); commit(); } })); });
    pop($("#iconBtn"), [h("div", { "class": "hd", text: "Icon" }), grid, opt("No icon", function () { delete n.icon; commit(); })]);
  }
  function noteSheet() {
    var n = sel && M.find(map, sel); if (!n) return;
    var ta = h("textarea", { "class": "textarea prose", rows: 6, dir: "auto", maxlength: 5000, placeholder: "Details, links, reminders…", style: "min-height:140px" }); ta.value = n.note || "";
    sheet("Note: " + (n.text || "topic").slice(0, 40), ta, [
      { label: "Remove note", cls: "ghost", run: function () { delete n.note; commit(); } },
      { label: "Save", cls: "primary", run: function () { var v = ta.value.trim(); if (v) n.note = v; else delete n.note; commit(); } }]);
  }
  function findPop() {
    var inp = h("input", { "class": "input", placeholder: "Find a topic", dir: "auto" }), list = h("div", { "class": "stack", style: "gap:2px" });
    function draw() {
      list.textContent = ""; var s = inp.value.trim().toLowerCase(); if (!s) return;
      var found = 0;
      M.walk(map.root, function (n) {
        if (found > 30 || (n.text || "").toLowerCase().indexOf(s) < 0) return; found++;
        list.appendChild(opt(n.text, function () {
          // open collapsed parents so the topic is visible
          var ix = M.index(map), p = ix.par[n.id]; while (p) { ix.by[p].col = false; p = ix.par[p]; }
          commit(); select(n.id);
        }));
      });
      if (!found) list.appendChild(h("span", { "class": "faint", text: "Nothing found" }));
    }
    inp.addEventListener("input", draw);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { var b = list.querySelector("button"); if (b) b.click(); } if (e.key === "Escape") closePop(); });
    pop($("#findBtn"), [inp, list]);
  }
  function themePop() {
    pop($("#themeBtn"), [h("div", { "class": "hd", text: "Map style" }),
      opt("Light", function () { map.theme = "light"; commit(); }, map.theme === "light" ? "✓" : null),
      opt("Dark", function () { map.theme = "dark"; commit(); }, map.theme === "dark" ? "✓" : null),
      opt("Colourful", function () { map.theme = "color"; commit(); }, map.theme === "color" ? "✓" : null),
      h("div", { "class": "sep" }),
      opt("Balance branches left and right", function () { map.root.children.forEach(function (c) { delete c.side; }); commit(); }),
      opt("Expand everything", function () { M.walk(map.root, function (n) { n.col = false; }); commit(); fit(); }),
      opt("Collapse to main branches", function () { map.root.children.forEach(function (c) { if (c.children.length) c.col = true; }); commit(); fit(); })]);
  }
  function newPop() {
    pop($("#newBtn"), [opt("Blank map", function () { openMap(M.newMap(), true); }), h("div", { "class": "sep" }), h("div", { "class": "hd", text: "Templates" }),
      opt("Brainstorm (5 W's)", function () { openMap(M.template("brain")); }),
      opt("Exam revision", function () { openMap(M.template("study")); }),
      opt("Project plan", function () { openMap(M.template("project")); })]);
  }
  function openPop() {
    var items = [opt("Open a file…", function () { pick(".json,.mm,.md,.markdown,.txt,.opml,application/json,text/plain,text/markdown", openFile); }, ".mindmap.json, .mm, .md, .txt"),
      h("div", { "class": "sep" }), h("div", { "class": "hd", text: "Saved in this browser" })];
    list().forEach(function (x) { items.push(opt((x.id === map.id ? "• " : "") + (x.name || "Mind map"), function () { if (x.id !== map.id) { var m = loadMap(x.id); if (m) openMap(m); } }, (x.n || 1) + " topics")); });
    items.push(h("div", { "class": "sep" }), opt("Delete this map…", function () {
      sheet("Delete “" + map.name + "”?", h("p", { "class": "muted", text: "This removes it from this browser. Save a file first if you might want it back." }), [
        { label: "Cancel", cls: "ghost", run: function () {} },
        { label: "Delete", cls: "danger", run: function () {
          S3.store("mm:m:" + map.id, undefined); S3.store("mm:list", list().filter(function (x) { return x.id !== map.id; }));
          var nx = list()[0], m = nx && loadMap(nx.id); map = null; openMap(m || M.template("brain")); S3.toast("Map deleted");
        } }]);
    }));
    pop($("#openBtn"), items);
  }
  function pick(accept, fn) {
    var i = h("input", { type: "file", accept: accept });
    i.addEventListener("change", function () { var f = i.files[0]; if (f) S3.readFile(f, "text").then(function (t) { fn(t, f); }).catch(function () { S3.toast("Could not read that file", "error"); }); });
    i.click();
  }
  function openFile(txt, f) {
    var m = null;
    try {
      if (/^\s*\{/.test(txt)) { m = M.normalize(JSON.parse(txt)); if (list().some(function (x) { return x.id === m.id; })) m.id = M.uid(); }
      else if (/<map[\s>]/i.test(txt)) m = M.fromFreeMind(txt);
      else m = M.fromOutline(txt, f.name.replace(/\.[^.]+$/, ""));
    } catch (e) { S3.toast("Could not read a mind map from that file", "error"); return; }
    openMap(m); S3.toast("Opened " + m.name + " (" + M.count(m.root) + " topics)"); S3.done();
  }
  function exportPop() {
    pop($("#exportBtn"), [opt("PNG image", function () { exp("png"); }, "2× sharp"), opt("SVG (vector)", function () { exp("svg"); }), opt("PDF", function () { exp("pdf"); }, "image in PDF"),
      opt("Markdown outline", function () { S3.download(M.toMarkdown(map), fileBase() + ".md", "text/markdown"); S3.done(); }, ".md"),
      opt("Copy outline", function () { S3.copy(M.toMarkdown(map), "Outline copied"); })]);
  }
  function fileBase() { return (map.name || "mind-map").replace(/[^\w\u0600-\u06FF\- ]+/g, "").trim().replace(/\s+/g, "-") || "mind-map"; }
  function exportSVG() {
    relayout();
    var b = L.bounds, pad = 30, x = Math.floor(b.x - pad), y = Math.floor(b.y - pad), w = Math.ceil(b.w + pad * 2), hh = Math.ceil(b.h + pad * 2), th = THEMES[map.theme] || THEMES.light;
    var root = el("svg", { xmlns: NS, width: w, height: hh, viewBox: x + " " + y + " " + w + " " + hh, "font-family": FONT });
    root.appendChild(el("rect", { x: x, y: y, width: w, height: hh, fill: th.bg }));
    var gl = el("g"), gn = el("g"); root.appendChild(gl); root.appendChild(gn);
    drawInto(gl, gn, true);
    return { str: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(root), w: w, h: hh };
  }
  function exp(kind) {
    var out = exportSVG();
    if (kind === "svg") { S3.download(new Blob([out.str], { type: "image/svg+xml" }), fileBase() + ".svg"); S3.done(); return; }
    var url = URL.createObjectURL(new Blob([out.str], { type: "image/svg+xml" })), img = new Image();
    img.onload = function () {
      var k = Math.min(2, 8000 / Math.max(out.w, out.h)), c = document.createElement("canvas"); c.width = Math.round(out.w * k); c.height = Math.round(out.h * k);
      var ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(function (bl) {
        if (kind === "png") { S3.download(bl, fileBase() + ".png"); S3.done(); return; }
        bl.arrayBuffer().then(function (buf) { S3.download(new Blob([pdfWithJpeg(new Uint8Array(buf), c.width, c.height, out.w * 0.75, out.h * 0.75)], { type: "application/pdf" }), fileBase() + ".pdf"); S3.done(); });
      }, kind === "png" ? "image/png" : "image/jpeg", 0.92);
    };
    img.onerror = function () { URL.revokeObjectURL(url); S3.toast("Export failed in this browser", "error"); };
    img.src = url;
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
    var o = new Uint8Array(len), p = 0; parts.forEach(function (b) { o.set(b, p); p += b.length; }); return o;
  }
  function helpSheet() {
    var keys = [["Tab", "Add a subtopic"], ["Enter", "Add a topic below (on the centre: a subtopic)"], ["F2 or type", "Edit the selected topic"], ["Shift+Enter", "New line while editing"],
      ["Delete", "Delete the topic and its subtopics"], ["Arrows", "Move around the map"], ["Space", "Collapse / expand"], ["Alt+↑ / Alt+↓", "Move the topic up or down"],
      ["Ctrl+Z / Ctrl+Y", "Undo / redo"], ["Ctrl+F", "Find a topic"], ["F", "Fit the map"], ["+ / −", "Zoom"], ["Ctrl+S", "Save file"], ["F1", "This help"]];
    var grid = h("div", { "class": "keys" });
    keys.forEach(function (k) { grid.appendChild(h("kbd", { text: k[0] })); grid.appendChild(h("span", { text: k[1] })); });
    sheet("Shortcuts", h("div", { "class": "stack" }, [grid, h("p", { "class": "faint", text: "Drag a topic onto another to move it there, or drag a main branch to the other side. Drag empty space to move around; pinch or Ctrl + scroll to zoom." })]),
      [{ label: "Close", cls: "primary", run: function () {} }]);
  }

  // ---------- keyboard ----------
  function onKey(e) {
    if (!map || $(".s3-modal")) return;
    if (popEl) { if (e.key === "Escape") closePop(); return; }
    var mod = e.ctrlKey || e.metaKey, k = e.key;
    if (mod && k.toLowerCase() === "s") { e.preventDefault(); if (editing) finishEdit(); saveFile(); return; }
    if (editing) return;
    if (/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || "")) return;
    if (mod && k.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (mod && k.toLowerCase() === "f") { e.preventDefault(); findPop(); return; }
    if (mod) return;
    if (k === "F1") { e.preventDefault(); helpSheet(); return; }
    if (e.altKey && (k === "ArrowUp" || k === "ArrowDown")) { e.preventDefault(); if (sel && M.reorder(map, sel, k === "ArrowUp" ? -1 : 1)) commit(); return; }
    if (k === "Tab") { e.preventDefault(); addChild(); return; }
    if (k === "Enter") { e.preventDefault(); addSibling(); return; }
    if (k === "F2") { e.preventDefault(); if (sel) startEdit(sel); return; }
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); del(); return; }
    if (k.indexOf("Arrow") === 0) { e.preventDefault(); nav(k); return; }
    if (k === " ") { e.preventDefault(); toggle(); return; }
    if (k === "Escape") { sel = null; render(); return; }
    if (!sel && (k === "f" || k === "F")) { fit(); return; }
    if (!sel && (k === "+" || k === "=")) { zoomAt(view.z * 1.2); return; }
    if (!sel && k === "-") { zoomAt(view.z / 1.2); return; }
    if (sel && k.length === 1 && !e.altKey) { e.preventDefault(); startEdit(sel, false, k); }
  }
  function saveFile() { saveNow(); S3.download(JSON.stringify(strip(map), null, 1), fileBase() + ".mindmap.json", "application/json"); S3.done(); }

  // ---------- self-test ----------
  window.S3_SELFTEST = function () {
    try {
      var m = M.template("project"), keep = map; map = m;
      var out = exportSVG(); map = keep;
      var ok = out.str.indexOf("<svg") > 0 && (out.str.match(/<rect/g) || []).length >= M.count(m.root) && out.w > 200;
      var md = M.toMarkdown(m), back = M.fromOutline(md);
      ok = ok && M.count(back.root) === M.count(m.root) && back.root.text === m.root.text;
      ok = ok && M.count(M.normalize(JSON.parse(JSON.stringify(strip(m)))).root) === M.count(m.root);
      return Promise.resolve(ok);
    } catch (e) { return Promise.resolve(false); }
  };

  // ---------- start ----------
  function start() {
    svg = $("#svg"); world = $("#world"); linksG = $("#links"); nodesG = $("#nodes"); overG = $("#over"); stage = $("#stage"); editor = $("#editor");
    svg.setAttribute("tabindex", "0");
    svg.addEventListener("pointerdown", onDown); svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp); svg.addEventListener("pointercancel", onUp);
    svg.addEventListener("wheel", function (e) { e.preventDefault(); if (e.ctrlKey || e.metaKey) zoomAt(view.z * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY); else { view.x -= e.deltaX; view.y -= e.deltaY; render(); } }, { passive: false });
    svg.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    svg.addEventListener("click", function () { if (pendingEdit) { var id = pendingEdit; pendingEdit = null; startEdit(id); } });
    editor.addEventListener("keydown", function (e) {
      e.stopPropagation();
      // Enter on a topic you just added keeps the flow going with the next one (an empty one stops it)
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); var wasNew = editing && editing.isNew, txt = editor.value.trim(); finishEdit(); if (wasNew && txt && sel && sel !== map.root.id) addSibling(); return; }
      if (e.key === "Tab") { e.preventDefault(); finishEdit(); addChild(); return; }
      // Escape keeps what you typed in a new topic, and undoes the edit of an existing one
      if (e.key === "Escape") { e.preventDefault(); finishEdit(!(editing && editing.isNew)); }
    });
    editor.addEventListener("input", placeEditor);
    editor.addEventListener("blur", function () { if (editing) finishEdit(); });
    document.addEventListener("keydown", onKey);
    $("#mapName").addEventListener("change", function () { map.name = $("#mapName").value.trim() || "Mind map"; $("#mapName").value = map.name; commit(); });
    $("#newBtn").addEventListener("click", newPop); $("#openBtn").addEventListener("click", openPop);
    $("#saveBtn").addEventListener("click", saveFile); $("#exportBtn").addEventListener("click", exportPop);
    $("#undoBtn").addEventListener("click", undo); $("#redoBtn").addEventListener("click", redo);
    $("#zoomIn").addEventListener("click", function () { zoomAt(view.z * 1.2); }); $("#zoomOut").addEventListener("click", function () { zoomAt(view.z / 1.2); });
    $("#zoomFit").addEventListener("click", fit); $("#themeBtn").addEventListener("click", themePop); $("#findBtn").addEventListener("click", findPop);
    $("#helpBtn").addEventListener("click", helpSheet);
    $("#childBtn").addEventListener("click", addChild); $("#sibBtn").addEventListener("click", addSibling);
    $("#editBtn").addEventListener("click", function () { if (sel) startEdit(sel); }); $("#colBtn").addEventListener("click", toggle);
    $("#colorBtn").addEventListener("click", colorPop); $("#iconBtn").addEventListener("click", iconPop); $("#noteBtn").addEventListener("click", noteSheet);
    $("#delBtn").addEventListener("click", del);
    window.addEventListener("resize", S3.debounce(render, 100));
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") saveNow(); });
    var id = S3.store("mm:open"), m = (id && loadMap(id)) || (list()[0] && loadMap(list()[0].id));
    openMap(m || M.template("brain"));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
