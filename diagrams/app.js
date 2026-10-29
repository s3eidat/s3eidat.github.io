/* Diagrams editor UI. Everything stays in this browser (localStorage via S3.store). Geometry lives in core.js. */
(function () {
  "use strict";
  var D = window.DiagramCore, h = S3.h, $ = S3.$, $$ = S3.$$;
  var NS = "http://www.w3.org/2000/svg";
  var FONT = "Arial, Helvetica, 'Noto Sans Arabic', sans-serif";
  var doc = null, sel = { s: [], l: [] }, view = { x: 40, y: 40, z: 1 };
  var undoStack = [], redoStack = [], lastJSON = "";
  var hover = null, drag = null, guides = [], marquee = null, tempLink = null, clip = null, space = false;
  var svg, world, shapesG, linksG, overlay, stage, editor;

  // ---------- svg helpers ----------
  function el(tag, attrs, kids) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs || {}) if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  var mctx = null;
  function measurer(fs, bold) {
    mctx = mctx || document.createElement("canvas").getContext("2d");
    var font = (bold ? "bold " : "") + fs + "px " + FONT;
    return function (s) { mctx.font = font; return mctx.measureText(s).width; };
  }
  function dashFor(sw) { return (sw * 3 + 2) + " " + (sw * 2 + 2); }

  // ---------- drawing (shared by the screen and exports) ----------
  function drawShape(s) {
    var def = D.SHAPES[s.type], g = el("g", { "data-id": s.id });
    var stroke = s.stroke === "none" || !s.sw ? "none" : s.stroke;
    g.appendChild(el("path", { d: def.path(s.w, s.h), transform: "translate(" + s.x + " " + s.y + ")", fill: s.type === "actor" ? "none" : s.fill,
      stroke: s.type === "actor" || s.type === "text" ? "none" : stroke, "stroke-width": s.sw, "stroke-dasharray": s.dash ? dashFor(s.sw) : null,
      "stroke-linejoin": "round", "pointer-events": "all" }));
    if (def.extra) g.appendChild(el("path", { d: def.extra(s.w, s.h), transform: "translate(" + s.x + " " + s.y + ")", fill: "none",
      stroke: s.type === "actor" ? (s.stroke === "none" ? "#334155" : s.stroke) : stroke, "stroke-width": s.type === "actor" ? Math.max(1.5, s.sw) : s.sw, "stroke-linecap": "round" }));
    drawText(g, s);
    return g;
  }
  function textEl(x, y, str, s, anchor, bold) {
    return el("text", { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, "font-family": FONT, "font-size": s.fs, "font-weight": bold ? "bold" : null,
      fill: s.color, "text-anchor": anchor, "dominant-baseline": "central", "pointer-events": "none" }, [str]);
  }
  function drawText(g, s) {
    if (!s.text) return;
    var lh = s.fs * 1.25;
    if (s.type === "entity") {
      var lines = String(s.text).split("\n"), head = lines.shift() || "";
      var mh = measurer(s.fs, true), hl = D.wrap(head, s.w - 16, mh).slice(0, 1)[0] || "";
      g.appendChild(textEl(s.x + s.w / 2, s.y + D.ENTITY_HEAD / 2, hl, s, "middle", true));
      var mb = measurer(s.fs - 1, s.bold), y = s.y + D.ENTITY_HEAD + 6 + lh / 2, fs = s.fs - 1;
      var sub = { fs: fs, color: s.color };
      lines.forEach(function (ln) {
        D.wrap(ln, s.w - 18, mb).forEach(function (part) {
          if (y > s.y + s.h - 4) return;
          g.appendChild(textEl(s.align === "right" ? s.x + s.w - 9 : s.align === "center" ? s.x + s.w / 2 : s.x + 9, y, part, sub, s.align === "right" ? "end" : s.align === "center" ? "middle" : "start", s.bold));
          y += fs * 1.25;
        });
      });
      return;
    }
    var b = D.textBox(s), m = measurer(s.fs, s.bold);
    var wrapped = D.wrap(s.text, s.type === "actor" ? b[2] : b[2], m);
    var max = s.type === "actor" ? 3 : Math.max(1, Math.floor((b[3] + lh * 0.6) / lh));
    if (s.type !== "text" && wrapped.length > max) { wrapped = wrapped.slice(0, max); wrapped[max - 1] = wrapped[max - 1].replace(/.?$/, "…"); }
    var bx = s.type === "actor" ? s.x + b[0] : b[0], by = s.type === "actor" ? s.y + b[1] : b[1];
    var top = s.type === "actor" ? by + lh / 2 : by + b[3] / 2 - (wrapped.length * lh) / 2 + lh / 2;
    var anchor = s.align === "left" ? "start" : s.align === "right" ? "end" : "middle";
    var x = s.align === "left" ? bx : s.align === "right" ? bx + b[2] : bx + b[2] / 2;
    wrapped.forEach(function (ln, i) { g.appendChild(textEl(x, top + i * lh, ln, s, anchor, s.bold)); });
  }
  function drawLink(l, byId, forExport) {
    var r = D.route(doc, l, byId), g = el("g", { "data-link": l.id });
    if (!forExport) g.appendChild(el("path", { d: r.d, fill: "none", stroke: "transparent", "stroke-width": 14, "pointer-events": "stroke" }));
    g.appendChild(el("path", { d: r.d, fill: "none", stroke: l.stroke, "stroke-width": l.sw, "stroke-dasharray": l.dash ? dashFor(l.sw) : null,
      "stroke-linejoin": "round", "stroke-linecap": "round", "pointer-events": "none" }));
    [["arrA", r.endA], ["arrB", r.endB]].forEach(function (k) {
      var a = D.arrowHead(l[k[0]], k[1].at, k[1].from, l.sw);
      if (a) g.appendChild(el("path", { d: a.d, fill: a.fill ? l.stroke : "#ffffff", stroke: l.stroke, "stroke-width": Math.max(1, l.sw * 0.8), "stroke-linejoin": "round", "pointer-events": "none" }));
    });
    if (l.text) {
      var m = measurer(l.fs, false), lines = String(l.text).split("\n"), lh = l.fs * 1.25;
      var w = Math.max.apply(null, lines.map(m)) + 10, hh = lines.length * lh + 4;
      g.appendChild(el("rect", { x: r.mid.x - w / 2, y: r.mid.y - hh / 2, width: w, height: hh, rx: 4, fill: "#ffffff", "fill-opacity": 0.92, "pointer-events": "none" }));
      lines.forEach(function (ln, i) { g.appendChild(textEl(r.mid.x, r.mid.y - hh / 2 + 2 + lh / 2 + i * lh, ln, l, "middle", false)); });
    }
    return g;
  }

  // ---------- screen render ----------
  function render() {
    if (!doc) return;
    world.setAttribute("transform", "translate(" + view.x + " " + view.y + ") scale(" + view.z + ")");
    stage.style.backgroundSize = 20 * view.z + "px " + 20 * view.z + "px";
    stage.style.backgroundPosition = view.x + "px " + view.y + "px";
    stage.classList.toggle("nogrid", !doc.grid);
    $("#zoomFit").textContent = Math.round(view.z * 100) + "%";
    $("#gridBtn").setAttribute("aria-pressed", String(!!doc.grid));
    shapesG.textContent = ""; linksG.textContent = "";
    var byId = D.indexShapes(doc);
    doc.shapes.forEach(function (s) { shapesG.appendChild(drawShape(s)); });
    doc.links.forEach(function (l) { linksG.appendChild(drawLink(l, byId)); });
    drawOverlay(byId);
    $("#empty").hidden = doc.shapes.length > 0 || doc.links.length > 0;
    $("#undoBtn").disabled = !undoStack.length; $("#redoBtn").disabled = !redoStack.length;
  }
  function drawOverlay(byId) {
    overlay.textContent = "";
    var k = 1 / view.z, ACC = "#0e9f9a";
    sel.s.forEach(function (id) {
      var s = byId[id]; if (!s) return;
      overlay.appendChild(el("rect", { x: s.x - 3 * k, y: s.y - 3 * k, width: s.w + 6 * k, height: s.h + 6 * k, fill: "none", stroke: ACC, "stroke-width": 1.5 * k, "stroke-dasharray": s.locked ? 4 * k + " " + 3 * k : null, "pointer-events": "none" }));
    });
    if (sel.s.length > 1) {
      var bb = D.bbox(sel.s.map(function (i) { return byId[i]; }).filter(Boolean));
      if (bb) overlay.appendChild(el("rect", { x: bb.x - 8 * k, y: bb.y - 8 * k, width: bb.w + 16 * k, height: bb.h + 16 * k, fill: "none", stroke: ACC, "stroke-width": k, "stroke-dasharray": 5 * k + " " + 4 * k, "pointer-events": "none" }));
    }
    var one = sel.s.length === 1 && !sel.l.length ? byId[sel.s[0]] : null;
    if (one && !one.locked && !drag) {
      var hs = 8 * k, pts = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };
      Object.keys(pts).forEach(function (key) {
        var p = pts[key];
        overlay.appendChild(el("rect", { "data-handle": key, x: one.x + one.w * p[0] - hs / 2, y: one.y + one.h * p[1] - hs / 2, width: hs, height: hs, rx: 2 * k, fill: "#ffffff", stroke: ACC, "stroke-width": 1.5 * k }));
      });
      // quick-add arrows: make a connected copy in that direction
      ["n", "e", "s", "w"].forEach(function (side) {
        var p = D.port(one, side), d = D.DIRS[side], cx = p.x + d[0] * 30 * k, cy = p.y + d[1] * 30 * k, a = 6 * k;
        var path = side === "e" ? [[-a, -a], [a, 0], [-a, a]] : side === "w" ? [[a, -a], [-a, 0], [a, a]] : side === "n" ? [[-a, a], [0, -a], [a, a]] : [[-a, -a], [0, a], [a, -a]];
        var g = el("g", { "data-quick": side }, [el("circle", { cx: cx, cy: cy, r: 10 * k, fill: "#ffffff", stroke: "#cbd5e1", "stroke-width": k }),
          el("path", { d: "M" + path.map(function (q) { return (cx + q[0]) + " " + (cy + q[1]); }).join("L"), fill: "none", stroke: ACC, "stroke-width": 1.8 * k, "stroke-linecap": "round", "stroke-linejoin": "round" }),
          el("title", {}, ["Add a connected shape"])]);
        overlay.appendChild(g);
      });
    }
    // connection dots on the hovered shape (and the selected one)
    var portShapes = {};
    if (hover && byId[hover]) portShapes[hover] = 1;
    if (one) portShapes[one.id] = 1;
    if (tempLink && tempLink.over) portShapes[tempLink.over] = 1;
    Object.keys(portShapes).forEach(function (id) {
      var s = byId[id];
      ["n", "e", "s", "w"].forEach(function (side) {
        var p = D.port(s, side), on = tempLink && tempLink.over === id && tempLink.side === side;
        overlay.appendChild(el("circle", { "data-port": side, "data-sid": id, cx: p.x, cy: p.y, r: (on ? 7 : 5) * k, fill: on ? ACC : "#ffffff", stroke: ACC, "stroke-width": 1.8 * k }));
      });
    });
    sel.l.forEach(function (id) {
      var l = doc.links.filter(function (x) { return x.id === id; })[0]; if (!l) return;
      var r = D.route(doc, l, byId);
      overlay.appendChild(el("path", { d: r.d, fill: "none", stroke: ACC, "stroke-width": 1.5 * k, "stroke-dasharray": 5 * k + " " + 4 * k, "pointer-events": "none" }));
      [["a", r.endA.at], ["b", r.endB.at]].forEach(function (e) {
        overlay.appendChild(el("circle", { "data-lend": e[0], "data-lid": id, cx: e[1].x, cy: e[1].y, r: 6 * k, fill: ACC, stroke: "#ffffff", "stroke-width": 1.5 * k }));
      });
    });
    if (tempLink) {
      var from = tempLink.fromPoint, to = tempLink.to;
      overlay.appendChild(el("path", { d: "M" + from.x + " " + from.y + "L" + to.x + " " + to.y, stroke: ACC, "stroke-width": 2 * k, "stroke-dasharray": 6 * k + " " + 4 * k, fill: "none", "pointer-events": "none" }));
    }
    guides.forEach(function (gd) {
      var big = 1e5;
      var at = gd.x != null ? { x1: gd.x, x2: gd.x, y1: -big, y2: big } : { x1: -big, x2: big, y1: gd.y, y2: gd.y };
      at.stroke = "#ec4899"; at["stroke-width"] = k; at["pointer-events"] = "none";
      overlay.appendChild(el("line", at));
    });
    if (marquee) overlay.appendChild(el("rect", { x: Math.min(marquee.x1, marquee.x2), y: Math.min(marquee.y1, marquee.y2), width: Math.abs(marquee.x2 - marquee.x1),
      height: Math.abs(marquee.y2 - marquee.y1), fill: "rgba(14,159,154,.08)", stroke: ACC, "stroke-width": k, "pointer-events": "none" }));
  }

  // ---------- model changes, undo, save ----------
  function snapshot() { return JSON.stringify(doc); }
  function commit() {
    var now = snapshot();
    if (now === lastJSON) return;
    undoStack.push(lastJSON); if (undoStack.length > 80) undoStack.shift();
    redoStack = []; lastJSON = now;
    doc.updated = Date.now();
    saveSoon(); render(); renderProps();
  }
  function restore(json) {
    doc = D.normalize(JSON.parse(json)); lastJSON = snapshot();
    var byId = D.indexShapes(doc), lids = {}; doc.links.forEach(function (l) { lids[l.id] = 1; });
    sel = { s: sel.s.filter(function (i) { return byId[i]; }), l: sel.l.filter(function (i) { return lids[i]; }) };
    saveSoon(); render(); renderProps();
  }
  function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); }
  function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); }
  function list() { return S3.store("diagrams:list") || []; }
  function saveNow() {
    if (!doc) return;
    var ok = S3.store("diagrams:d:" + doc.id, doc) !== undefined;
    var l = list().filter(function (x) { return x.id !== doc.id; });
    l.unshift({ id: doc.id, name: doc.name, updated: doc.updated, n: doc.shapes.length });
    S3.store("diagrams:list", l.slice(0, 200));
    S3.store("diagrams:open", doc.id);
    if (!ok && !saveNow.warned) { saveNow.warned = true; S3.toast("Could not save in this browser (storage full or blocked). Use Save file.", "error"); }
  }
  var saveSoon = S3.debounce(saveNow, 400);
  function openDoc(d, fit) {
    if (doc) saveNow();
    doc = d; sel = { s: [], l: [] }; undoStack = []; redoStack = []; lastJSON = snapshot();
    $("#docName").value = doc.name;
    render(); renderProps();
    if (fit) fitView(); else { view = { x: 40, y: 40, z: 1 }; render(); }
    saveNow();
  }
  function loadDoc(id) { var raw = S3.store("diagrams:d:" + id); if (!raw) return null; try { return D.normalize(raw); } catch (e) { return null; } }

  // ---------- coordinates ----------
  function toWorld(cx, cy) { var r = svg.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z }; }
  function zoomAt(z, cx, cy) {
    z = Math.min(4, Math.max(0.15, z));
    var r = svg.getBoundingClientRect(), px = cx == null ? r.width / 2 : cx - r.left, py = cy == null ? r.height / 2 : cy - r.top;
    var wx = (px - view.x) / view.z, wy = (py - view.y) / view.z;
    view.z = z; view.x = px - wx * z; view.y = py - wy * z;
    render(); placeEditor();
  }
  function fitView() {
    var b = D.contentBounds(doc), r = svg.getBoundingClientRect();
    if (!b || !r.width) { view = { x: 40, y: 40, z: 1 }; render(); return; }
    var z = Math.min(1.5, Math.max(0.15, Math.min((r.width - 60) / b.w, (r.height - 60) / b.h)));
    view = { z: z, x: r.width / 2 - (b.x + b.w / 2) * z, y: r.height / 2 - (b.y + b.h / 2) * z };
    render();
  }
  function viewCenter() { var r = svg.getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); }
  function shapeAt(p, except) {
    var m = 4 / view.z;
    for (var i = doc.shapes.length - 1; i >= 0; i--) {
      var s = doc.shapes[i];
      if (s.id !== except && p.x >= s.x - m && p.x <= s.x + s.w + m && p.y >= s.y - m && p.y <= s.y + s.h + m) return s;
    }
    return null;
  }

  // ---------- adding things ----------
  function addShape(type, at, opts) {
    var s = D.newShape(type, 0, 0);
    s.x = Math.round(at.x - s.w / 2); s.y = Math.round(at.y - s.h / 2);
    if (doc.grid) { s.x = Math.round(s.x / 10) * 10; s.y = Math.round(s.y / 10) * 10; }
    if (opts && opts.avoid) {
      // don't stack new shapes exactly on top of each other when clicking the library repeatedly
      var guard = 0;
      while (doc.shapes.some(function (o) { return Math.abs(o.x - s.x) < 8 && Math.abs(o.y - s.y) < 8; }) && guard++ < 40) { s.x += 24; s.y += 24; }
    }
    doc.shapes.push(s);
    sel = { s: [s.id], l: [] };
    commit();
    return s;
  }
  function quickAdd(src, side) {
    var d = D.DIRS[side], gap = 70;
    var s = JSON.parse(JSON.stringify(src)); s.id = D.uid(); s.text = ""; s.locked = false;
    s.x = src.x + d[0] * (src.w + gap); s.y = src.y + d[1] * (src.h + gap);
    var guard = 0;
    while (doc.shapes.some(function (o) { return D.intersects(o, { x: s.x + 2, y: s.y + 2, w: s.w - 4, h: s.h - 4 }); }) && guard++ < 20) {
      if (d[0]) s.y += src.h + 30; else s.x += src.w + 30;
    }
    doc.shapes.push(s);
    var opp = { n: "s", s: "n", e: "w", w: "e" }[side];
    doc.links.push(D.newLink({ id: src.id, side: guard ? null : side }, { id: s.id, side: guard ? null : opp }));
    sel = { s: [s.id], l: [] };
    commit();
    startEdit(s.id);
  }
  function applyTemplate(key) {
    var t = D.templates()[key]; if (!t) return;
    var nd = t.build();
    if (!doc.shapes.length && !doc.links.length) {
      // empty canvas: fill this diagram
      doc.shapes = nd.shapes; doc.links = nd.links; if (doc.name === "Untitled diagram") { doc.name = nd.name; $("#docName").value = doc.name; }
      sel = { s: [], l: [] }; commit(); fitView();
    } else { openDoc(nd, true); S3.toast(t.name + " opened as a new diagram. Your other diagram is saved (Open)."); }
  }

  // ---------- pointer interactions ----------
  var pointers = {}, pinch = null, lastTap = { t: 0, key: "" };
  function onDown(e) {
    if (!doc) return;
    if (!editor.hidden) commitEdit();
    closeMenu();
    svg.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      // two fingers: pinch zoom + pan; cancel anything else
      drag = null; marquee = null; tempLink = null; guides = [];
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.z, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vx: view.x, vy: view.y };
      render(); return;
    }
    var p = toWorld(e.clientX, e.clientY), t = e.target, multi = e.shiftKey || e.metaKey || e.ctrlKey;
    var handle = t.closest("[data-handle]"), portEl = t.closest("[data-port]"), quick = t.closest("[data-quick]"), lend = t.closest("[data-lend]");
    var shapeEl = t.closest("[data-id]"), linkEl = t.closest("[data-link]");
    var byId = D.indexShapes(doc);
    var start = { x: e.clientX, y: e.clientY, p: p, moved: false, snap: snapshot() };
    if (e.button === 1 || e.button === 2 || space || (e.pointerType === "touch" && !shapeEl && !linkEl && !handle && !portEl && !quick && !lend)) {
      drag = { mode: "pan", start: start, vx: view.x, vy: view.y }; stage.classList.add("panning"); return;
    }
    if (handle) { var s0 = byId[sel.s[0]]; drag = { mode: "resize", h: handle.getAttribute("data-handle"), s: s0, box: { x: s0.x, y: s0.y, w: s0.w, h: s0.h }, start: start }; return; }
    if (quick) { drag = { mode: "quick", side: quick.getAttribute("data-quick"), start: start }; return; }
    if (portEl) {
      var sid = portEl.getAttribute("data-sid"), side = portEl.getAttribute("data-port");
      tempLink = { from: { id: sid, side: side }, fromPoint: D.port(byId[sid], side), to: p, over: null, side: null };
      drag = { mode: "connect", start: start }; render(); return;
    }
    if (lend) {
      var lid = lend.getAttribute("data-lid"), which = lend.getAttribute("data-lend"), L = linkById(lid);
      var other = L[which === "a" ? "b" : "a"], r = D.route(doc, L, byId);
      tempLink = { relink: lid, which: which, fromPoint: which === "a" ? r.endB.at : r.endA.at, to: p, over: null, side: null, other: other };
      drag = { mode: "connect", start: start }; render(); return;
    }
    if (shapeEl) {
      var id = shapeEl.getAttribute("data-id");
      if (multi) {
        if (sel.s.indexOf(id) >= 0) sel.s = sel.s.filter(function (x) { return x !== id; }); else sel.s.push(id);
      } else if (sel.s.indexOf(id) < 0) sel = { s: [id], l: [] };
      var moving = sel.s.map(function (i) { return byId[i]; }).filter(function (s) { return s && !s.locked; });
      drag = { mode: "move", start: start, items: moving.map(function (s) { return { s: s, x: s.x, y: s.y }; }), tap: id,
        freeLinks: doc.links.filter(function (l) { return sel.l.indexOf(l.id) >= 0; }).map(function (l) { return { l: l, a: Object.assign({}, l.a), b: Object.assign({}, l.b) }; }) };
      render(); renderProps(); return;
    }
    if (linkEl) {
      var lid2 = linkEl.getAttribute("data-link");
      if (multi) { if (sel.l.indexOf(lid2) >= 0) sel.l = sel.l.filter(function (x) { return x !== lid2; }); else sel.l.push(lid2); }
      else sel = { s: [], l: [lid2] };
      var LL = linkById(lid2);
      drag = { mode: "link", start: start, tap: "l:" + lid2, l: LL, a: Object.assign({}, LL.a), b: Object.assign({}, LL.b) };
      render(); renderProps(); return;
    }
    // empty canvas: marquee select
    if (!multi) sel = { s: [], l: [] };
    marquee = { x1: p.x, y1: p.y, x2: p.x, y2: p.y, add: multi, base: { s: sel.s.slice(), l: sel.l.slice() } };
    drag = { mode: "marquee", start: start, tap: "bg" };
    render(); renderProps();
  }
  function onMove(e) {
    if (!doc) return;
    if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pinch) {
      var ids = Object.keys(pointers); if (ids.length < 2) return;
      var a = pointers[ids[0]], b = pointers[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      var r = svg.getBoundingClientRect(), z = Math.min(4, Math.max(0.15, pinch.z * d / Math.max(1, pinch.d)));
      var wx = (pinch.cx - r.left - pinch.vx) / pinch.z, wy = (pinch.cy - r.top - pinch.vy) / pinch.z;
      view.z = z; view.x = cx - r.left - wx * z; view.y = cy - r.top - wy * z;
      render(); return;
    }
    var p = toWorld(e.clientX, e.clientY);
    if (!drag) {
      var t = e.target.closest && e.target.closest("[data-id],[data-port]");
      var nh = t ? (t.getAttribute("data-id") || t.getAttribute("data-sid")) : null;
      if (nh !== hover) { hover = nh; drawOverlay(D.indexShapes(doc)); }
      return;
    }
    var st = drag.start;
    if (!st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) < 4) return;
    st.moved = true;
    var dx = p.x - st.p.x, dy = p.y - st.p.y, byId = D.indexShapes(doc);
    if (drag.mode === "pan") { view.x = drag.vx + (e.clientX - st.x); view.y = drag.vy + (e.clientY - st.y); render(); placeEditor(); return; }
    if (drag.mode === "move" && drag.items.length) {
      var box = D.bbox(drag.items.map(function (it) { return { x: it.x + dx, y: it.y + dy, w: it.s.w, h: it.s.h }; }));
      var moving = {}; drag.items.forEach(function (it) { moving[it.s.id] = 1; });
      var others = doc.shapes.filter(function (s) { return !moving[s.id] && s.x < box.x + box.w + 600 && s.x + s.w > box.x - 600; });
      var sn = e.altKey ? { dx: null, dy: null, guides: [] } : D.snap(box, others, 6 / view.z);
      guides = sn.guides;
      var ox = sn.dx != null ? sn.dx : doc.grid && !e.altKey ? Math.round(box.x / 10) * 10 - box.x : 0;
      var oy = sn.dy != null ? sn.dy : doc.grid && !e.altKey ? Math.round(box.y / 10) * 10 - box.y : 0;
      drag.items.forEach(function (it) { it.s.x = Math.round(it.x + dx + ox); it.s.y = Math.round(it.y + dy + oy); });
      drag.freeLinks.forEach(function (f) { ["a", "b"].forEach(function (k) { if (!f[k].id) { f.l[k].x = f[k].x + dx; f.l[k].y = f[k].y + dy; } }); });
      render(); return;
    }
    if (drag.mode === "link") {
      // a loose connector (no attached ends) can be dragged as a whole
      if (!drag.a.id && !drag.b.id) { drag.l.a = { x: drag.a.x + dx, y: drag.a.y + dy }; drag.l.b = { x: drag.b.x + dx, y: drag.b.y + dy }; render(); }
      return;
    }
    if (drag.mode === "resize") { resize(drag, p, e.shiftKey); render(); return; }
    if (drag.mode === "connect") {
      var src = tempLink.from ? tempLink.from.id : tempLink.other && tempLink.other.id;
      var over = shapeAt(p, src);
      tempLink.to = p; tempLink.over = over ? over.id : null;
      tempLink.side = over ? D.nearestPort(over, p, 18 / view.z) : null;
      if (over && tempLink.side) tempLink.to = D.port(over, tempLink.side);
      render(); return;
    }
    if (drag.mode === "marquee") {
      marquee.x2 = p.x; marquee.y2 = p.y;
      var r2 = { x: Math.min(marquee.x1, marquee.x2), y: Math.min(marquee.y1, marquee.y2), w: Math.abs(marquee.x2 - marquee.x1), h: Math.abs(marquee.y2 - marquee.y1) };
      var inS = doc.shapes.filter(function (s) { return D.intersects(s, r2); }).map(function (s) { return s.id; });
      var inL = doc.links.filter(function (l) { var pts = D.route(doc, l, byId).pts; return pts.every(function (q) { return q.x >= r2.x && q.x <= r2.x + r2.w && q.y >= r2.y && q.y <= r2.y + r2.h; }); }).map(function (l) { return l.id; });
      sel = { s: uniq(marquee.base.s.concat(inS)), l: uniq(marquee.base.l.concat(inL)) };
      render(); return;
    }
  }
  function uniq(a) { var seen = {}; return a.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; }); }
  function resize(dg, p, keep) {
    var b = dg.box, s = dg.s, hnd = dg.h, x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h, min = 12;
    var px = doc.grid ? Math.round(p.x / 10) * 10 : Math.round(p.x), py = doc.grid ? Math.round(p.y / 10) * 10 : Math.round(p.y);
    if (hnd.indexOf("w") >= 0) x1 = Math.min(px, x2 - min);
    if (hnd.indexOf("e") >= 0) x2 = Math.max(px, x1 + min);
    if (hnd.indexOf("n") >= 0) y1 = Math.min(py, y2 - min);
    if (hnd.indexOf("s") >= 0) y2 = Math.max(py, y1 + min);
    if ((keep || s.type === "circle") && hnd.length === 2) {
      var ratio = b.w / b.h, w = x2 - x1, hh = y2 - y1;
      if (w / hh > ratio) { hh = w / ratio; if (hnd.indexOf("n") >= 0) y1 = y2 - hh; else y2 = y1 + hh; }
      else { w = hh * ratio; if (hnd.indexOf("w") >= 0) x1 = x2 - w; else x2 = x1 + w; }
    }
    s.x = Math.round(x1); s.y = Math.round(y1); s.w = Math.round(x2 - x1); s.h = Math.round(y2 - y1);
  }
  function onUp(e) {
    delete pointers[e.pointerId];
    if (pinch) { if (Object.keys(pointers).length < 2) pinch = null; return; }
    stage.classList.remove("panning");
    if (!drag) return;
    var dg = drag; drag = null; guides = [];
    var p = toWorld(e.clientX, e.clientY);
    if (dg.mode === "quick") {
      var src = D.indexShapes(doc)[sel.s[0]];
      if (src) quickAdd(src, dg.side);
      return;
    }
    if (dg.mode === "connect") {
      var tl = tempLink; tempLink = null;
      if (!dg.start.moved) { render(); return; }
      var target = tl.over ? { id: tl.over, side: tl.side || null } : { x: Math.round(p.x), y: Math.round(p.y) };
      if (tl.relink) {
        var L = linkById(tl.relink); if (L) L[tl.which] = target;
        commit();
      } else {
        var nl = D.newLink(tl.from, target);
        doc.links.push(nl); sel = { s: [], l: [nl.id] };
        commit();
      }
      return;
    }
    if (dg.mode === "marquee") { marquee = null; render(); renderProps(); }
    if (dg.start.moved) commit();
    else {
      // a tap: double tap opens the text editor
      var now = Date.now(), key = dg.tap || "";
      if (key && key === lastTap.key && now - lastTap.t < 380) {
        lastTap = { t: 0, key: "" };
        if (key === "bg") { var s = addShape("text", p); startEdit(s.id); }
        else if (key.indexOf("l:") === 0) startEditLink(key.slice(2));
        else startEdit(key);
        return;
      }
      lastTap = { t: now, key: key };
      render(); renderProps();
    }
  }
  function linkById(id) { for (var i = 0; i < doc.links.length; i++) if (doc.links[i].id === id) return doc.links[i]; return null; }

  // ---------- text editing ----------
  var editing = null;
  function startEdit(id) {
    var s = D.indexShapes(doc)[id]; if (!s) return;
    editing = { kind: "shape", id: id, before: s.text };
    sel = { s: [id], l: [] };
    editor.value = s.text;
    editor.hidden = false; placeEditor(); render(); renderProps();
    editor.focus(); editor.select();
  }
  function startEditLink(id) {
    var l = linkById(id); if (!l) return;
    editing = { kind: "link", id: id };
    sel = { s: [], l: [id] };
    editor.value = l.text;
    editor.hidden = false; placeEditor(); render(); renderProps();
    editor.focus(); editor.select();
  }
  function placeEditor() {
    if (!editing || editor.hidden) return;
    var z = view.z, x, y, w, hh, fs, align = "center", color = "#0f172a";
    if (editing.kind === "shape") {
      var s = D.indexShapes(doc)[editing.id]; if (!s) return;
      var b = s.type === "actor" ? [s.x - 40, s.y + s.h + 2, s.w + 80, 44] : s.type === "entity" ? [s.x + 4, s.y + 4, s.w - 8, s.h - 8] : D.textBox(s);
      x = b[0]; y = b[1]; w = b[2]; hh = b[3]; fs = s.fs; align = s.type === "entity" ? "left" : s.align; color = s.color;
    } else {
      var l = linkById(editing.id); if (!l) return;
      var r = D.route(doc, l); x = r.mid.x - 80; y = r.mid.y - 18; w = 160; hh = 36; fs = l.fs;
    }
    var pad = 6;
    editor.style.left = (x * z + view.x - pad) + "px"; editor.style.top = (y * z + view.y - pad) + "px";
    editor.style.width = Math.max(80, w * z + pad * 2) + "px"; editor.style.height = Math.max(32, hh * z + pad * 2) + "px";
    editor.style.fontSize = Math.max(10, fs * z) + "px"; editor.style.textAlign = align; editor.style.color = color === "#ffffff" ? "#0f172a" : color;
  }
  function commitEdit() {
    if (!editing) return;
    var v = editor.value.replace(/\r/g, "").slice(0, 5000);
    if (editing.kind === "shape") {
      var s = D.indexShapes(doc)[editing.id];
      if (s && s.type === "text" && !v.trim()) { D.removeShapes(doc, [s.id]); sel = { s: [], l: [] }; } // an emptied text box goes away
      else if (s) s.text = v;
    }
    else { var l = linkById(editing.id); if (l) l.text = v.slice(0, 500); }
    editing = null; editor.hidden = true;
    commit(); render();
  }

  // ---------- selection actions ----------
  function selectedShapes() { var byId = D.indexShapes(doc); return sel.s.map(function (i) { return byId[i]; }).filter(Boolean); }
  function selectedLinks() { return sel.l.map(linkById).filter(Boolean); }
  function deleteSel() {
    if (!sel.s.length && !sel.l.length) return;
    var ls = {}; sel.l.forEach(function (i) { ls[i] = 1; });
    doc.links = doc.links.filter(function (l) { return !ls[l.id]; });
    D.removeShapes(doc, sel.s);
    sel = { s: [], l: [] }; commit();
  }
  function copySel() {
    if (!sel.s.length && !sel.l.length) return null;
    clip = D.cloneSelection(doc, sel.s, sel.l, 0, 0);
    return clip;
  }
  var pasteN = 0;
  function pasteClip(c) {
    if (!c || (!c.shapes.length && !c.links.length)) return;
    pasteN++;
    var tmp = { shapes: c.shapes, links: c.links };
    var again = D.cloneSelection({ shapes: tmp.shapes, links: tmp.links }, tmp.shapes.map(function (s) { return s.id; }), tmp.links.map(function (l) { return l.id; }), 20 * pasteN, 20 * pasteN);
    doc.shapes = doc.shapes.concat(again.shapes); doc.links = doc.links.concat(again.links);
    sel = { s: again.shapes.map(function (s) { return s.id; }), l: again.links.map(function (l) { return l.id; }) };
    commit();
  }
  function duplicate() { var c = copySel(); if (c) { pasteN = 0; pasteClip(c); } }
  function order(front) {
    var ids = {}; sel.s.forEach(function (i) { ids[i] = 1; });
    var picked = doc.shapes.filter(function (s) { return ids[s.id]; }), rest = doc.shapes.filter(function (s) { return !ids[s.id]; });
    doc.shapes = front ? rest.concat(picked) : picked.concat(rest);
    commit();
  }
  function nudge(dx, dy) {
    selectedShapes().forEach(function (s) { if (!s.locked) { s.x += dx; s.y += dy; } });
    selectedLinks().forEach(function (l) { ["a", "b"].forEach(function (k) { if (!l[k].id) { l[k].x += dx; l[k].y += dy; } }); });
    commit();
  }

  // ---------- properties panel ----------
  var FILLS = ["#ffffff", "#f1f5f9", "#dbeafe", "#dcfce7", "#fef9c3", "#ffedd5", "#fee2e2", "#ede9fe", "#ccfbf1", "#334155", "none"];
  var LINES = ["#334155", "#0f172a", "#2563eb", "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#7c3aed", "#0d9488", "#94a3b8", "#ffffff"];
  function swatches(values, current, onPick, allowNone) {
    var row = h("div", { "class": "sw-row" });
    values.forEach(function (c) {
      if (c === "none" && !allowNone) return;
      var b = h("button", { "class": "sw" + (c === "none" ? " none" : ""), type: "button", title: c === "none" ? "No colour" : c, "aria-label": c === "none" ? "No colour" : "Colour " + c,
        "aria-pressed": String(current === c), onclick: function () { onPick(c); } });
      if (c !== "none") b.style.background = c;
      row.appendChild(b);
    });
    var custom = h("input", { type: "color", title: "Custom colour", "aria-label": "Custom colour" });
    custom.value = /^#[0-9a-f]{6}$/i.test(current) ? current : "#888888";
    custom.addEventListener("change", function () { onPick(custom.value); });
    row.appendChild(custom);
    return row;
  }
  function sec(title, kids) { return h("div", { "class": "sec" }, [h("h3", { text: title })].concat(kids)); }
  function seg(options, current, onPick) {
    var g = h("div", { "class": "seg" });
    options.forEach(function (o) { g.appendChild(h("button", { type: "button", "aria-pressed": String(o[0] === current), title: o[2] || o[1], onclick: function () { onPick(o[0]); } }, [o[1]])); });
    return g;
  }
  function setAll(list, key, val) { list.forEach(function (x) { x[key] = val; }); commit(); }
  function numInput(val, onSet, label, min, max) {
    var i = h("input", { "class": "input", type: "number", min: min, max: max, step: 1, "aria-label": label }); i.value = Math.round(val);
    i.addEventListener("change", function () { var v = Number(i.value); if (isFinite(v)) onSet(Math.min(max, Math.max(min, v))); });
    return i;
  }
  function renderProps() {
    var box = $("#props"); box.textContent = "";
    if (!doc) return;
    var S = selectedShapes(), L = selectedLinks();
    if (!S.length && !L.length) {
      box.appendChild(sec("Diagram", [
        h("p", { "class": "tip", text: doc.shapes.length + " shape" + (doc.shapes.length === 1 ? "" : "s") + ", " + doc.links.length + " connector" + (doc.links.length === 1 ? "" : "s") + ". Saved in this browser as you work." }),
        h("p", { "class": "tip", text: "Click a shape to style it. Double-click to type. Drag from a blue dot to connect two shapes. Drag empty space to select several." }),
        h("label", { "class": "check" }, [(function () { var c = h("input", { type: "checkbox" }); c.checked = !!doc.grid; c.addEventListener("change", function () { doc.grid = c.checked; commit(); }); return c; })(), "Snap to grid"])]));
      box.appendChild(sec("Keyboard", [h("p", { "class": "tip", text: "Press ? for all shortcuts. Hold Space and drag, or use two fingers, to move around. Ctrl + wheel or pinch to zoom." })]));
      return;
    }
    if (S.length) {
      var f = S[0];
      box.appendChild(sec(S.length > 1 ? S.length + " shapes" : D.SHAPES[f.type].name, [
        h("div", { "class": "field" }, ["Fill", swatches(FILLS, f.fill, function (c) { setAll(S, "fill", c); }, true)]),
        h("div", { "class": "field" }, ["Line", swatches(LINES, f.stroke, function (c) { setAll(S, "stroke", c); }, true)]),
        h("div", { "class": "p-grid" }, [
          h("label", { "class": "field" }, ["Line width", (function () {
            var s = h("select", { "class": "select" }); [0, 1, 2, 3, 4, 6].forEach(function (w) { var o = h("option", { value: w }, [w ? w + " px" : "None"]); if (w === f.sw) o.selected = true; s.appendChild(o); });
            s.addEventListener("change", function () { setAll(S, "sw", Number(s.value)); }); return s; })()]),
          h("label", { "class": "field" }, ["Line style", (function () {
            var s = h("select", { "class": "select" }, [h("option", { value: "0" }, ["Solid"]), h("option", { value: "1" }, ["Dashed"])]); s.value = f.dash ? "1" : "0";
            s.addEventListener("change", function () { setAll(S, "dash", s.value === "1"); }); return s; })()])])
      ]));
      box.appendChild(sec("Text", [
        h("div", { "class": "p-grid" }, [h("label", { "class": "field" }, ["Size", numInput(f.fs, function (v) { setAll(S, "fs", v); }, "Text size", 6, 120)]),
          h("div", { "class": "field" }, ["Weight", seg([[false, "Normal"], [true, "Bold"]], f.bold, function (v) { setAll(S, "bold", v); })])]),
        h("div", { "class": "field" }, ["Align", seg([["left", "Left"], ["center", "Center"], ["right", "Right"]], f.align, function (v) { setAll(S, "align", v); })]),
        h("div", { "class": "field" }, ["Colour", swatches(LINES, f.color, function (c) { setAll(S, "color", c); }, false)]),
        S.length === 1 ? h("button", { "class": "btn small", type: "button", onclick: function () { startEdit(f.id); } }, ["Edit text"]) : null
      ]));
      var arrange = [h("div", { "class": "p-grid" }, [
        h("button", { "class": "btn small", type: "button", onclick: function () { order(true); } }, ["To front"]),
        h("button", { "class": "btn small", type: "button", onclick: function () { order(false); } }, ["To back"]),
        h("button", { "class": "btn small", type: "button", onclick: duplicate }, ["Duplicate"]),
        h("button", { "class": "btn small danger", type: "button", onclick: deleteSel }, ["Delete"])])];
      if (S.length === 1) {
        var typeSel = h("select", { "class": "select", "aria-label": "Shape type" });
        D.ORDER.forEach(function (k) { var o = h("option", { value: k }, [D.SHAPES[k].name]); if (k === f.type) o.selected = true; typeSel.appendChild(o); });
        typeSel.addEventListener("change", function () { f.type = typeSel.value; commit(); });
        arrange.unshift(h("div", { "class": "p-grid4 mt", style: "margin-top:0;margin-bottom:8px" }, [
          h("label", { "class": "field tb" }, ["X", numInput(f.x, function (v) { f.x = v; commit(); }, "X", -1e6, 1e6)]),
          h("label", { "class": "field tb" }, ["Y", numInput(f.y, function (v) { f.y = v; commit(); }, "Y", -1e6, 1e6)]),
          h("label", { "class": "field tb" }, ["W", numInput(f.w, function (v) { f.w = v; commit(); }, "Width", 4, 1e5)]),
          h("label", { "class": "field tb" }, ["H", numInput(f.h, function (v) { f.h = v; commit(); }, "Height", 4, 1e5)])]));
        arrange.unshift(h("label", { "class": "field" }, ["Shape", typeSel]));
        arrange.push(h("label", { "class": "check mt" }, [(function () { var c = h("input", { type: "checkbox" }); c.checked = !!f.locked; c.addEventListener("change", function () { f.locked = c.checked; commit(); }); return c; })(), "Lock position and size"]));
      }
      box.appendChild(sec("Arrange", arrange));
      if (S.length > 1) {
        var al = function (how, label) { return h("button", { "class": "btn small", type: "button", onclick: function () { D.align(S.filter(function (s) { return !s.locked; }), how); commit(); } }, [label]); };
        box.appendChild(sec("Align", [h("div", { "class": "p-grid" }, [al("left", "Left"), al("center", "Centre"), al("right", "Right"), al("top", "Top"), al("middle", "Middle"), al("bottom", "Bottom"),
          al("hspace", "Space across"), al("vspace", "Space down")])]));
      }
    }
    if (L.length) {
      var l = L[0];
      var arrowSel = function (key) {
        var s = h("select", { "class": "select" });
        [["none", "None"], ["arrow", "Arrow"], ["open", "Open arrow"], ["diamond", "Diamond"], ["circle", "Circle"], ["bar", "Bar (one)"], ["crow", "Crow's foot (many)"]].forEach(function (o) { var op = h("option", { value: o[0] }, [o[1]]); if (o[0] === l[key]) op.selected = true; s.appendChild(op); });
        s.addEventListener("change", function () { setAll(L, key, s.value); }); return s;
      };
      var label = h("input", { "class": "input", maxlength: 500, dir: "auto", placeholder: "Label (optional)" }); label.value = l.text;
      label.addEventListener("change", function () { setAll(L, "text", label.value); });
      box.appendChild(sec(L.length > 1 ? L.length + " connectors" : "Connector", [
        h("div", { "class": "field" }, ["Route", seg([["elbow", "Elbow"], ["straight", "Straight"], ["curved", "Curved"]], l.style, function (v) { setAll(L, "style", v); })]),
        h("div", { "class": "p-grid" }, [h("label", { "class": "field" }, ["Start", arrowSel("arrA")]), h("label", { "class": "field" }, ["End", arrowSel("arrB")])]),
        h("div", { "class": "field" }, ["Colour", swatches(LINES, l.stroke, function (c) { setAll(L, "stroke", c); }, false)]),
        h("div", { "class": "p-grid" }, [
          h("label", { "class": "field" }, ["Width", (function () {
            var s = h("select", { "class": "select" }); [1, 1.5, 2, 3, 4, 6].forEach(function (w) { var o = h("option", { value: w }, [w + " px"]); if (w === l.sw) o.selected = true; s.appendChild(o); });
            s.addEventListener("change", function () { setAll(L, "sw", Number(s.value)); }); return s; })()]),
          h("label", { "class": "field" }, ["Style", (function () {
            var s = h("select", { "class": "select" }, [h("option", { value: "0" }, ["Solid"]), h("option", { value: "1" }, ["Dashed"])]); s.value = l.dash ? "1" : "0";
            s.addEventListener("change", function () { setAll(L, "dash", s.value === "1"); }); return s; })()])]),
        h("label", { "class": "field" }, ["Label", label]),
        h("div", { "class": "p-grid" }, [
          h("button", { "class": "btn small", type: "button", onclick: function () { L.forEach(function (x) { var t = x.a; x.a = x.b; x.b = t; var ar = x.arrA; x.arrA = x.arrB; x.arrB = ar; }); commit(); } }, ["Reverse"]),
          h("button", { "class": "btn small danger", type: "button", onclick: deleteSel }, ["Delete"])])
      ]));
    }
  }

  // ---------- menus and sheets ----------
  var menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; document.removeEventListener("pointerdown", outside, true); } }
  function outside(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
  function menu(anchor, items) {
    closeMenu();
    menuEl = h("div", { "class": "dg-menu", role: "menu" });
    items.forEach(function (it) {
      if (it === "-") { menuEl.appendChild(h("div", { "class": "sep" })); return; }
      if (it.head) { menuEl.appendChild(h("div", { "class": "hd", text: it.head })); return; }
      if (it.node) { menuEl.appendChild(it.node); return; }
      menuEl.appendChild(h("button", { type: "button", role: "menuitem", onclick: function () { closeMenu(); it.run(); } }, [h("span", { dir: "auto", text: it.label })].concat(it.hint ? [h("small", { text: it.hint })] : [])));
    });
    document.body.appendChild(menuEl);
    var r = anchor.getBoundingClientRect(), mw = menuEl.offsetWidth;
    menuEl.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.left)) + "px";
    menuEl.style.top = (r.bottom + 6) + "px";
    setTimeout(function () { document.addEventListener("pointerdown", outside, true); }, 0);
    var first = menuEl.querySelector("button"); if (first) first.focus();
  }
  function sheet(title, body, buttons) {
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": title });
    var box = h("div", { "class": "s3-sheet dg-sheet" });
    var foot = h("div", { "class": "foot" });
    box.appendChild(h("div", { "class": "row between" }, [h("h2", { text: title }), h("button", { "class": "btn ghost icon", type: "button", "aria-label": "Close", html: S3.icon("x"), onclick: close })]));
    box.appendChild(body);
    (buttons || []).forEach(function (b) { foot.appendChild(h("button", { "class": "btn " + (b.cls || ""), type: "button", onclick: function () { if (b.run() !== false) close(); } }, [b.label])); });
    box.appendChild(foot); m.appendChild(box);
    function close() { m.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    m.addEventListener("mousedown", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(m);
    var f = box.querySelector(".foot .btn.primary") || box.querySelector("button"); if (f) f.focus();
    return close;
  }
  function helpSheet() {
    var keys = [["Double-click", "Type in a shape or on a connector (empty space: new text)"], ["Drag a blue dot", "Connect to another shape"], ["Arrows around a shape", "Add a connected shape"],
      ["Shift + click", "Select more"], ["Space + drag", "Move around (or two fingers)"], ["Ctrl + wheel", "Zoom (or pinch)"], ["F", "Fit diagram to screen"], ["+ −", "Zoom in and out"],
      ["Delete", "Delete selection"], ["Ctrl+C / X / V", "Copy, cut, paste"], ["Ctrl+D", "Duplicate"], ["Ctrl+A", "Select all"], ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"],
      ["Arrow keys", "Nudge (Shift: 10)"], ["Enter", "Edit text of the selected shape"], ["Alt while dragging", "No snapping"], ["Ctrl+S", "Save file"], ["Esc", "Clear selection"]];
    var grid = h("div", { "class": "keys" });
    keys.forEach(function (k) { grid.appendChild(h("kbd", { text: k[0] })); grid.appendChild(h("span", { text: k[1] })); });
    sheet("Shortcuts and tips", h("div", { "class": "stack" }, [grid, h("p", { "class": "faint", text: "Your diagrams are saved in this browser only. Use Save file to keep a copy or move it to another device." })]),
      [{ label: "Close", cls: "primary", run: function () {} }]);
  }

  // ---------- files ----------
  function fileBase() { return (doc.name || "diagram").replace(/[^\w؀-ۿ\- ]+/g, "").trim().replace(/\s+/g, "-") || "diagram"; }
  function saveFile() {
    saveNow();
    S3.download(JSON.stringify(doc, null, 1), fileBase() + ".diagram.json", "application/json");
    S3.done();
  }
  function openFile() {
    var inp = h("input", { type: "file", accept: ".json,application/json" });
    inp.addEventListener("change", function () {
      var f = inp.files[0]; if (!f) return;
      S3.readFile(f, "text").then(function (txt) {
        var d = D.normalize(JSON.parse(txt));
        if (list().some(function (x) { return x.id === d.id; }) && (!doc || doc.id !== d.id)) d.id = D.uid();
        if (doc && doc.id === d.id) d.id = D.uid(); // opening a file never overwrites what's on screen
        openDoc(d, true); S3.toast("Opened " + d.name);
      }).catch(function () { S3.toast("That file is not a diagram from this tool", "error"); });
    });
    inp.click();
  }
  function openMenu() {
    var items = [{ label: "Open a file…", hint: ".diagram.json", run: openFile }, "-", { head: "Saved in this browser" }];
    var l = list();
    l.forEach(function (x) {
      items.push({ label: (x.id === doc.id ? "• " : "") + (x.name || "Untitled diagram"), hint: new Date(x.updated || 0).toLocaleDateString("en", { day: "numeric", month: "short" }),
        run: function () { if (x.id === doc.id) return; var d = loadDoc(x.id); if (d) openDoc(d, true); else S3.toast("Could not open it", "error"); } });
    });
    items.push("-", { label: "Delete this diagram…", run: function () {
      sheet("Delete “" + doc.name + "”?", h("p", { "class": "muted", text: "This removes it from this browser. Save a file first if you might want it back." }), [
        { label: "Cancel", cls: "ghost", run: function () {} },
        { label: "Delete", cls: "danger", run: function () {
          S3.store("diagrams:d:" + doc.id, undefined);
          S3.store("diagrams:list", list().filter(function (x) { return x.id !== doc.id; }));
          var next = list()[0], d = next && loadDoc(next.id);
          doc = null; openDoc(d || D.newDoc(), true); S3.toast("Diagram deleted");
        } }]);
    } });
    menu($("#openBtn"), items);
  }
  function newMenu() {
    var T = D.templates();
    var items = [{ label: "Blank diagram", run: function () { openDoc(D.newDoc(), false); } }, "-", { head: "Templates" }];
    Object.keys(T).forEach(function (k) { items.push({ label: T[k].name, run: function () { openDoc(T[k].build(), true); } }); });
    menu($("#newBtn"), items);
  }

  // ---------- export ----------
  function exportSVG(opts) {
    opts = opts || {};
    var only = opts.selection && (sel.s.length || sel.l.length);
    var shapes = only ? selectedShapes() : doc.shapes;
    var ids = {}; shapes.forEach(function (s) { ids[s.id] = 1; });
    var links = only ? doc.links.filter(function (l) { return sel.l.indexOf(l.id) >= 0 || (l.a.id && ids[l.a.id] && l.b.id && ids[l.b.id]); }) : doc.links;
    var b = D.contentBounds({ shapes: shapes, links: links }) || { x: 0, y: 0, w: 100, h: 100 };
    var pad = 20, x = Math.floor(b.x - pad), y = Math.floor(b.y - pad), w = Math.ceil(b.w + pad * 2), hh = Math.ceil(b.h + pad * 2);
    var root = el("svg", { xmlns: NS, width: w, height: hh, viewBox: x + " " + y + " " + w + " " + hh, "font-family": FONT });
    if (!opts.transparent) root.appendChild(el("rect", { x: x, y: y, width: w, height: hh, fill: "#ffffff" }));
    var byId = D.indexShapes(doc);
    shapes.forEach(function (s) { var g = drawShape(s); g.removeAttribute("data-id"); root.appendChild(g); });
    links.forEach(function (l) { var g = drawLink(l, byId, true); g.removeAttribute("data-link"); root.appendChild(g); });
    $$("[pointer-events]", root).forEach(function (n) { n.removeAttribute("pointer-events"); });
    return { str: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(root), w: w, h: hh };
  }
  function toCanvas(svgOut, scale, bg) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(new Blob([svgOut.str], { type: "image/svg+xml" })), img = new Image();
      img.onload = function () {
        var k = Math.min(scale, 8000 / Math.max(svgOut.w, svgOut.h));
        var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(svgOut.w * k)); c.height = Math.max(1, Math.round(svgOut.h * k));
        var ctx = c.getContext("2d");
        if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("render failed")); };
      img.src = url;
    });
  }
  function blobOf(c, type, q) { return new Promise(function (res) { c.toBlob(res, type, q); }); }
  function doExport(kind, opts) {
    if (!doc.shapes.length && !doc.links.length) { S3.toast("Nothing to export yet"); return; }
    var out = exportSVG({ selection: opts.selection, transparent: kind === "png" && opts.transparent });
    if (kind === "svg") { S3.download(new Blob([out.str], { type: "image/svg+xml" }), fileBase() + ".svg"); S3.done(); return; }
    toCanvas(out, kind === "pdf" ? 2 : opts.scale || 2, kind === "pdf" ? "#ffffff" : null).then(function (c) {
      if (kind === "png") return blobOf(c, "image/png").then(function (bl) { S3.download(bl, fileBase() + ".png"); S3.done(); });
      return blobOf(c, "image/jpeg", 0.92).then(function (bl) { return bl.arrayBuffer(); }).then(function (buf) {
        var pdf = D.pdfWithJpeg(new Uint8Array(buf), c.width, c.height, out.w * 0.75, out.h * 0.75);
        S3.download(new Blob([pdf], { type: "application/pdf" }), fileBase() + ".pdf"); S3.done();
      });
    }).catch(function () { S3.toast("Export failed in this browser", "error"); });
  }
  var expOpts = { selection: false, transparent: false, scale: 2 };
  function exportMenu() {
    var cb = function (key, label) {
      var c = h("input", { type: "checkbox" }); c.checked = expOpts[key];
      c.addEventListener("change", function () { expOpts[key] = c.checked; });
      return { node: h("label", {}, [c, label]) };
    };
    var items = [{ label: "PNG image", hint: "2× sharp", run: function () { doExport("png", expOpts); } },
      { label: "SVG (vector)", hint: "scalable", run: function () { doExport("svg", expOpts); } },
      { label: "PDF", hint: "image in PDF", run: function () { doExport("pdf", expOpts); } }, "-"];
    items.push(cb("transparent", "Transparent background (PNG)"));
    if (sel.s.length || sel.l.length) items.push(cb("selection", "Only the selection"));
    menu($("#exportBtn"), items);
  }

  // ---------- library ----------
  function libIcon(type) {
    var d = D.SHAPES[type], w = type === "actor" ? 16 : type === "circle" ? 26 : 38, hh = type === "actor" ? 28 : type === "circle" ? 26 : 26;
    var s = el("svg", { viewBox: (-(40 - w) / 2) + " " + (-(28 - hh) / 2) + " 40 28", "aria-hidden": "true" });
    s.appendChild(el("path", { d: d.path(w, hh), "class": type === "actor" || type === "text" ? "x" : null, style: type === "text" ? "stroke-dasharray:2 2" : null }));
    if (d.extra) s.appendChild(el("path", { d: d.extra(w, hh), "class": "x" }));
    if (type === "text") s.appendChild(el("text", { x: w / 2, y: hh / 2 + 4, "text-anchor": "middle", "font-size": 12, fill: "currentColor" }, ["T"]));
    return s;
  }
  function buildLibrary() {
    var grid = $("#libGrid");
    D.ORDER.forEach(function (type) {
      var b = h("button", { type: "button", title: "Add " + D.SHAPES[type].name.toLowerCase() + " (click, or drag onto the canvas)" }, [libIcon(type), h("span", { text: D.SHAPES[type].name })]);
      var st = null, ghost = null;
      b.addEventListener("pointerdown", function (e) { st = { x: e.clientX, y: e.clientY }; b.setPointerCapture(e.pointerId); });
      b.addEventListener("pointermove", function (e) {
        if (!st) return;
        if (!ghost && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 6) { ghost = libIcon(type); ghost.setAttribute("class", "dg-ghost"); document.body.appendChild(ghost); }
        if (ghost) { ghost.style.left = e.clientX + "px"; ghost.style.top = e.clientY + "px"; }
      });
      b.addEventListener("pointerup", function (e) {
        var was = ghost; if (ghost) { ghost.remove(); ghost = null; }
        if (!st) return; st = null;
        if (was) {
          var r = stage.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) addShape(type, toWorld(e.clientX, e.clientY));
        } else { addShape(type, viewCenter(), { avoid: true }); }
      });
      b.addEventListener("pointercancel", function () { st = null; if (ghost) { ghost.remove(); ghost = null; } });
      b.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addShape(type, viewCenter(), { avoid: true }); } });
      grid.appendChild(b);
    });
    var T = D.templates();
    Object.keys(T).forEach(function (k) {
      $("#libTpl").appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { applyTemplate(k); } }, [T[k].name]));
      $("#emptyTpl").appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { applyTemplate(k); } }, [T[k].name]));
    });
  }

  // ---------- keyboard and clipboard ----------
  function typing(e) { var t = e.target; return t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable); }
  function onKey(e) {
    if (!doc || $(".s3-modal")) return;
    var mod = e.ctrlKey || e.metaKey, k = e.key;
    if (mod && k.toLowerCase() === "s") { e.preventDefault(); if (!editor.hidden) commitEdit(); saveFile(); return; }
    if (typing(e)) return;
    if (k === " " && !space) { space = true; stage.classList.add("space"); e.preventDefault(); return; }
    if (mod && k.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (mod && k.toLowerCase() === "d") { e.preventDefault(); duplicate(); return; }
    if (mod && k.toLowerCase() === "a") { e.preventDefault(); sel = { s: doc.shapes.map(function (s) { return s.id; }), l: doc.links.map(function (l) { return l.id; }) }; render(); renderProps(); return; }
    if (mod) return; // copy/cut/paste are handled by the clipboard events
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); deleteSel(); return; }
    if (k === "Escape") { sel = { s: [], l: [] }; render(); renderProps(); return; }
    if (k.indexOf("Arrow") === 0 && (sel.s.length || sel.l.length)) {
      e.preventDefault(); var n = e.shiftKey ? 10 : 1;
      nudge(k === "ArrowLeft" ? -n : k === "ArrowRight" ? n : 0, k === "ArrowUp" ? -n : k === "ArrowDown" ? n : 0); return;
    }
    if ((k === "Enter" || k === "F2") && sel.s.length === 1) { e.preventDefault(); startEdit(sel.s[0]); return; }
    if ((k === "Enter" || k === "F2") && sel.l.length === 1 && !sel.s.length) { e.preventDefault(); startEditLink(sel.l[0]); return; }
    // typing with one shape selected starts editing it
    if (k.length === 1 && sel.s.length === 1 && !e.altKey) { e.preventDefault(); startEdit(sel.s[0]); editor.value = k; editor.setSelectionRange(1, 1); return; }
    if (k === "+" || k === "=") { zoomAt(view.z * 1.2); return; }
    if (k === "-" || k === "_") { zoomAt(view.z / 1.2); return; }
    if (k === "f" || k === "F") { fitView(); return; }
    if (k === "0") { zoomAt(1); return; }
    if (k === "?") { helpSheet(); return; }
  }
  function onCopy(e, cut) {
    if (!doc || typing(e) || $(".s3-modal")) return;
    var c = copySel(); if (!c) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", JSON.stringify({ app: "s3-diagrams-clip", shapes: c.shapes, links: c.links }));
    pasteN = 0;
    if (cut) deleteSel();
  }
  function onPaste(e) {
    if (!doc || typing(e) || $(".s3-modal")) return;
    var txt = e.clipboardData ? e.clipboardData.getData("text/plain") : "";
    e.preventDefault();
    var data = null;
    try { data = JSON.parse(txt); } catch (err) {}
    if (data && data.app === "s3-diagrams-clip") {
      // run through the file checks before trusting it
      var safe = D.normalize({ app: "s3-diagrams", shapes: data.shapes || [], links: data.links || [] });
      pasteClip({ shapes: safe.shapes, links: safe.links }); return;
    }
    if (txt && txt.trim()) { var s = addShape("text", viewCenter(), { avoid: true }); s.text = txt.slice(0, 5000); var m = measurer(s.fs, false); s.w = Math.min(400, Math.max(60, Math.ceil(Math.max.apply(null, txt.split("\n").map(m))) + 24)); s.h = Math.max(30, Math.min(600, txt.split("\n").length * s.fs * 1.3 + 12)); commit(); return; }
    if (clip) pasteClip(clip);
  }

  // ---------- self-test ----------
  window.S3_SELFTEST = function () {
    try {
      var T = D.templates(), d = T.flowchart.build();
      var ok = d.shapes.length > 4 && d.links.length > 4;
      d.links.forEach(function (l) { var r = D.route(d, l); ok = ok && r.pts.length >= 2 && /^M[\d.\- ]+/.test(r.d); });
      ok = ok && JSON.stringify(D.normalize(JSON.parse(JSON.stringify(d)))) === JSON.stringify(D.normalize(d));
      var keep = doc; doc = d;
      var out = exportSVG({});
      doc = keep;
      ok = ok && out.str.indexOf("<svg") > 0 && (out.str.match(/<path/g) || []).length >= d.shapes.length && out.w > 100;
      var pdf = D.pdfWithJpeg(new Uint8Array([255, 216, 255, 217]), 1, 1, 10, 10);
      ok = ok && pdf.length > 300 && D.wrap("one two three", 30, function (s) { return s.length * 10; }).length === 3;
      return Promise.resolve(ok);
    } catch (e) { return Promise.resolve(false); }
  };

  // ---------- start ----------
  function start() {
    svg = $("#svg"); world = $("#world"); shapesG = $("#shapesG"); linksG = $("#linksG"); overlay = $("#overlay"); stage = $("#stage"); editor = $("#editor");
    buildLibrary();
    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    svg.addEventListener("pointerleave", function () { if (!drag && hover) { hover = null; drawOverlay(D.indexShapes(doc)); } });
    svg.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    svg.addEventListener("wheel", function (e) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomAt(view.z * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
      else { view.x -= e.deltaX; view.y -= e.deltaY; render(); placeEditor(); }
    }, { passive: false });
    editor.addEventListener("keydown", function (e) {
      if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); commitEdit(); }
      e.stopPropagation();
    });
    editor.addEventListener("blur", function () { if (editing) commitEdit(); });
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", function (e) { if (e.key === " ") { space = false; stage.classList.remove("space"); } });
    document.addEventListener("copy", function (e) { onCopy(e, false); });
    document.addEventListener("cut", function (e) { onCopy(e, true); });
    document.addEventListener("paste", onPaste);
    $("#docName").addEventListener("change", function () { doc.name = $("#docName").value.trim() || "Untitled diagram"; $("#docName").value = doc.name; commit(); });
    $("#newBtn").addEventListener("click", newMenu);
    $("#openBtn").addEventListener("click", openMenu);
    $("#saveBtn").addEventListener("click", saveFile);
    $("#exportBtn").addEventListener("click", exportMenu);
    $("#undoBtn").addEventListener("click", undo);
    $("#redoBtn").addEventListener("click", redo);
    $("#zoomIn").addEventListener("click", function () { zoomAt(view.z * 1.2); });
    $("#zoomOut").addEventListener("click", function () { zoomAt(view.z / 1.2); });
    $("#zoomFit").addEventListener("click", fitView);
    $("#gridBtn").addEventListener("click", function () { doc.grid = !doc.grid; commit(); });
    $("#helpBtn").addEventListener("click", helpSheet);
    window.addEventListener("resize", S3.debounce(function () { render(); placeEditor(); }, 100));
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") saveNow(); });
    var id = S3.store("diagrams:open"), d = id ? loadDoc(id) : null;
    openDoc(d || D.newDoc(), !!d);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
