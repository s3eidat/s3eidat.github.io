/* Floor Plan — 2D walls, rooms with areas, doors, windows and furniture; PNG and PDF-to-scale export.
   World units are centimetres, y grows downwards. Everything stays in this browser. */
(function () {
  "use strict";
  var $ = S3.$, h = S3.h, esc = S3.esc;
  var KEY = "floor-plan";
  var svg = $("#fp-svg"), gWorld = $("#fp-world"), gGrid = $("#fp-grid"), gOver = $("#fp-over"), box = $("#fp-canvas");
  var ROOM_COLORS = ["#cfe8ff", "#d9f5e1", "#fff1c9", "#ffd9d4", "#e9dcff", "#d6f4f3", "#f1f1f1", "#ffe4f0"];
  // furniture: [key, label, width cm, depth cm, group]
  var FURN = [
    ["bed2", "Double bed", 160, 200, "Bedroom"], ["bed1", "Single bed", 90, 200, "Bedroom"], ["wardrobe", "Wardrobe", 120, 60, "Bedroom"], ["nightstand", "Bedside table", 45, 40, "Bedroom"],
    ["sofa", "Sofa", 200, 90, "Living"], ["armchair", "Armchair", 85, 85, "Living"], ["coffee", "Coffee table", 110, 60, "Living"], ["tv", "TV unit", 160, 40, "Living"], ["rug", "Rug", 200, 140, "Living"], ["plant", "Plant", 45, 45, "Living"],
    ["table", "Dining table", 160, 90, "Dining"], ["round", "Round table", 100, 100, "Dining"], ["chair", "Chair", 45, 45, "Dining"],
    ["counter", "Counter", 120, 60, "Kitchen"], ["sink", "Kitchen sink", 80, 60, "Kitchen"], ["stove", "Hob / stove", 60, 60, "Kitchen"], ["fridge", "Fridge", 70, 70, "Kitchen"], ["washer", "Washing machine", 60, 60, "Kitchen"],
    ["toilet", "Toilet", 40, 65, "Bathroom"], ["basin", "Washbasin", 55, 45, "Bathroom"], ["bath", "Bathtub", 170, 75, "Bathroom"], ["shower", "Shower", 90, 90, "Bathroom"],
    ["desk", "Desk", 140, 70, "Office"], ["office", "Office chair", 60, 60, "Office"], ["shelf", "Bookshelf", 100, 35, "Office"], ["stairs", "Stairs", 100, 300, "Other"]
  ];
  var FMAP = {}; FURN.forEach(function (f) { FMAP[f[0]] = f; });

  // ---------- plan data ----------
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function num(v, lo, hi, d) { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
  function blank() { return { v: 1, name: "", unit: "m", walls: [], rooms: [], items: [] }; }
  var BIG = 1e6;
  function clean(d) {
    if (!d || typeof d !== "object" || !Array.isArray(d.walls)) return null;
    var p = blank();
    p.name = typeof d.name === "string" ? d.name.slice(0, 80) : "";
    p.unit = d.unit === "ft" ? "ft" : "m";
    p.walls = d.walls.filter(function (w) { return w && isFinite(w.x1) && isFinite(w.y1) && isFinite(w.x2) && isFinite(w.y2); }).slice(0, 3000).map(function (w) {
      return { id: String(w.id || uid()).slice(0, 40), x1: num(w.x1, -BIG, BIG, 0), y1: num(w.y1, -BIG, BIG, 0), x2: num(w.x2, -BIG, BIG, 0), y2: num(w.y2, -BIG, BIG, 0), t: num(w.t, 5, 60, 15) };
    });
    p.rooms = (Array.isArray(d.rooms) ? d.rooms : []).filter(function (r) { return r && Array.isArray(r.pts) && r.pts.length >= 3; }).slice(0, 500).map(function (r) {
      return { id: String(r.id || uid()).slice(0, 40), name: typeof r.name === "string" ? r.name.slice(0, 40) : "Room", color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : ROOM_COLORS[0],
        pts: r.pts.slice(0, 200).map(function (q) { return [num(q[0], -BIG, BIG, 0), num(q[1], -BIG, BIG, 0)]; }) };
    });
    var wallIds = {}; p.walls.forEach(function (w) { wallIds[w.id] = 1; });
    p.items = (Array.isArray(d.items) ? d.items : []).filter(function (it) { return it && (it.kind === "door" || it.kind === "window" || it.kind === "label" || FMAP[it.kind]); }).slice(0, 3000).map(function (it) {
      var o = { id: String(it.id || uid()).slice(0, 40), kind: it.kind };
      if (it.kind === "door" || it.kind === "window") { o.wall = String(it.wall); o.t = num(it.t, 0, 1, .5); o.w = num(it.w, 30, 600, it.kind === "door" ? 80 : 120); o.flip = !!it.flip; o.hinge = !!it.hinge; }
      else if (it.kind === "label") { o.x = num(it.x, -BIG, BIG, 0); o.y = num(it.y, -BIG, BIG, 0); o.text = typeof it.text === "string" ? it.text.slice(0, 80) : "Label"; o.size = num(it.size, 8, 200, 24); }
      else { o.x = num(it.x, -BIG, BIG, 0); o.y = num(it.y, -BIG, BIG, 0); o.w = num(it.w, 10, 2000, FMAP[it.kind][2]); o.d = num(it.d, 10, 2000, FMAP[it.kind][3]); o.rot = ((Math.round(num(it.rot, -720, 720, 0) / 15) * 15) % 360 + 360) % 360; }
      return o;
    }).filter(function (o) { return (o.kind !== "door" && o.kind !== "window") || wallIds[o.wall]; });
    return p;
  }
  var plan = clean(S3.store(KEY)) || blank();
  var saveSoon = S3.debounce(function () { if (S3.store(KEY, plan) === undefined) S3.toast("Couldn't save in this browser. Export your plan so you don't lose it.", "error"); }, 300);

  // ---------- undo ----------
  var past = [], future = [];
  function snapshot() { return JSON.stringify(plan); }
  function commit(before) { if (before === snapshot()) return; past.push(before); if (past.length > 100) past.shift(); future = []; saveSoon(); }
  function change(fn) { var b = snapshot(); fn(); commit(b); render(); }
  function undo() { if (!past.length) return; future.push(snapshot()); plan = clean(JSON.parse(past.pop())); fixSel(); saveSoon(); render(); }
  function redo() { if (!future.length) return; past.push(snapshot()); plan = clean(JSON.parse(future.pop())); fixSel(); saveSoon(); render(); }

  // ---------- geometry ----------
  function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
  function wallLen(w) { return dist(w.x1, w.y1, w.x2, w.y2); }
  function area(pts) { var a = 0; for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); }
  function centroid(pts) {
    var a = 0, cx = 0, cy = 0;
    for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length], f = p[0] * q[1] - q[0] * p[1]; a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; }
    if (Math.abs(a) < 1e-6) return [pts[0][0], pts[0][1]];
    return [cx / (3 * a), cy / (3 * a)];
  }
  function project(px, py, w) {
    var dx = w.x2 - w.x1, dy = w.y2 - w.y1, L2 = dx * dx + dy * dy || 1, t = ((px - w.x1) * dx + (py - w.y1) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    return { t: t, x: w.x1 + dx * t, y: w.y1 + dy * t, d: dist(px, py, w.x1 + dx * t, w.y1 + dy * t) };
  }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function find(id) { return byId(plan.walls, id) || byId(plan.rooms, id) || byId(plan.items, id); }
  function kindOf(o) { return !o ? "" : o.x1 != null ? "wall" : o.pts ? "room" : o.kind; }
  function bounds(includeAll) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    function add(x, y) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    plan.walls.forEach(function (w) { add(w.x1, w.y1); add(w.x2, w.y2); });
    plan.rooms.forEach(function (r) { r.pts.forEach(function (p) { add(p[0], p[1]); }); });
    plan.items.forEach(function (it) { if (it.x != null) { var e = it.kind === "label" ? 60 : Math.max(it.w, it.d) / 2; add(it.x - e, it.y - e); add(it.x + e, it.y + e); } });
    if (!isFinite(x0)) return includeAll ? { x0: 0, y0: 0, x1: 500, y1: 400 } : null;
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  // ---------- units ----------
  function fmtLen(cm) {
    if (plan.unit === "ft") { var inch = Math.round(cm / 2.54), ft = Math.floor(inch / 12); return ft + "′ " + (inch - ft * 12) + "″"; }
    return (cm / 100).toFixed(2) + " m";
  }
  function fmtArea(cm2) { return plan.unit === "ft" ? Math.round(cm2 / 929.0304) + " ft²" : (cm2 / 10000).toFixed(1) + " m²"; }
  function toUnit(cm) { return plan.unit === "ft" ? Math.round(cm / 30.48 * 100) / 100 : Math.round(cm) / 100; }
  function fromUnit(v) { return plan.unit === "ft" ? v * 30.48 : v * 100; }
  function unitName() { return plan.unit === "ft" ? "ft" : "m"; }

  // ---------- view ----------
  var view = { ox: -100, oy: -100, s: 1 }; // s = screen pixels per cm
  function W() { return box.clientWidth; } function H() { return box.clientHeight; }
  function toWorld(cx, cy) { var r = svg.getBoundingClientRect(); return [(cx - r.left) / view.s + view.ox, (cy - r.top) / view.s + view.oy]; }
  function fit() {
    var b = bounds(true), m = 80, bw = b.x1 - b.x0 + 2 * m, bh = b.y1 - b.y0 + 2 * m;
    view.s = Math.max(.05, Math.min(6, Math.min(W() / bw, H() / bh)));
    view.ox = b.x0 - m - (W() / view.s - bw) / 2; view.oy = b.y0 - m - (H() / view.s - bh) / 2;
    render();
  }
  function zoomAt(f, cx, cy) {
    var r = svg.getBoundingClientRect(), wx = (cx - r.left) / view.s + view.ox, wy = (cy - r.top) / view.s + view.oy;
    view.s = Math.max(.05, Math.min(8, view.s * f));
    view.ox = wx - (cx - r.left) / view.s; view.oy = wy - (cy - r.top) / view.s;
    render();
  }

  // ---------- snapping ----------
  var GRID_SNAP = 5;
  function snapGrid(v) { return Math.round(v / GRID_SNAP) * GRID_SNAP; }
  function ends() { var e = []; plan.walls.forEach(function (w) { e.push([w.x1, w.y1]); e.push([w.x2, w.y2]); }); plan.rooms.forEach(function (r) { r.pts.forEach(function (p) { e.push(p); }); }); return e; }
  // free: no snapping (Alt held); anchor: previous point, for 15° angle and grid-length snapping
  function snap(x, y, anchor, free, skip) {
    if (free) return [x, y];
    var best = null, bd = 12 / view.s;
    ends().forEach(function (p) { if (skip && skip(p)) return; var d = dist(x, y, p[0], p[1]); if (d < bd) { bd = d; best = p; } });
    if (best) return [best[0], best[1]];
    if (anchor) {
      var a = Math.atan2(y - anchor[1], x - anchor[0]), L = dist(anchor[0], anchor[1], x, y);
      a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12); L = Math.round(L / GRID_SNAP) * GRID_SNAP;
      return [Math.round((anchor[0] + Math.cos(a) * L) * 10) / 10, Math.round((anchor[1] + Math.sin(a) * L) * 10) / 10];
    }
    return [snapGrid(x), snapGrid(y)];
  }

  // ---------- drawing (shared by the editor and the exports) ----------
  function n(v) { return Math.round(v * 10) / 10; }
  // furniture symbol in its own frame: centred on 0,0, width w along x, depth d along y
  function furnSvg(k, w, d) {
    var x = -w / 2, y = -d / 2, s = "", r = Math.min(w, d);
    function R(x0, y0, ww, hh, rr) { return '<rect x="' + n(x0) + '" y="' + n(y0) + '" width="' + n(ww) + '" height="' + n(hh) + '"' + (rr ? ' rx="' + n(rr) + '"' : "") + "/>"; }
    function L(a, b, c, e) { return '<line x1="' + n(a) + '" y1="' + n(b) + '" x2="' + n(c) + '" y2="' + n(e) + '"/>'; }
    function C(cx, cy, rr) { return '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(rr) + '"/>'; }
    function E(cx, cy, rx, ry) { return '<ellipse cx="' + n(cx) + '" cy="' + n(cy) + '" rx="' + n(rx) + '" ry="' + n(ry) + '"/>'; }
    switch (k) {
      case "bed2": case "bed1":
        s = R(x, y, w, d, 3) + (k === "bed2" ? R(x + w * .06, y + 6, w * .41, 24, 5) + R(x + w * .53, y + 6, w * .41, 24, 5) : R(x + w * .12, y + 6, w * .76, 24, 5)) + L(x, y + d * .3, x + w, y + d * .3) + L(x, y + d * .3, x + w * .3, y + d * .42); break;
      case "wardrobe": s = R(x, y, w, d) + L(0, y, 0, y + d) + L(x, y, x + w, y + d) + L(x + w, y, x, y + d); break;
      case "nightstand": case "coffee": case "counter": case "shelf": case "tv":
        s = R(x, y, w, d, k === "coffee" ? 4 : 0) + (k === "shelf" ? L(x, 0, x + w, 0) : k === "tv" ? R(x + w * .15, y + d * .25, w * .7, d * .25) : k === "counter" ? L(x, y + d - 5, x + w, y + d - 5) : ""); break;
      case "sofa": s = R(x, y, w, d, 6) + R(x, y, w, d * .28, 4) + R(x, y, w * .12, d, 4) + R(x + w * .88, y, w * .12, d, 4) + L(0, y + d * .28, 0, y + d); break;
      case "armchair": s = R(x, y, w, d, 8) + R(x, y, w, d * .3, 5) + R(x, y, w * .18, d, 5) + R(x + w * .82, y, w * .18, d, 5); break;
      case "rug": s = '<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(d) + '" stroke-dasharray="4 3"/>' + R(x + 8, y + 8, w - 16, d - 16); break;
      case "plant": s = C(0, 0, r / 2) + C(0, 0, r / 5) + L(-r / 2 * .7, -r / 2 * .7, r / 2 * .7, r / 2 * .7) + L(r / 2 * .7, -r / 2 * .7, -r / 2 * .7, r / 2 * .7); break;
      case "table": s = R(x, y, w, d, 3); break;
      case "round": s = E(0, 0, w / 2, d / 2); break;
      case "chair": s = R(x, y + d * .2, w, d * .8, 5) + R(x, y, w, d * .22, 3); break;
      case "office": s = C(0, d * .05, r * .4) + R(x + w * .15, y, w * .7, d * .2, 4); break;
      case "sink": s = R(x, y, w, d) + R(x + w * .12, y + d * .2, w * .76, d * .6, 6) + C(0, y + d * .12, 2.5); break;
      case "stove": s = R(x, y, w, d) + C(-w / 4, -d / 4, r * .16) + C(w / 4, -d / 4, r * .12) + C(-w / 4, d / 4, r * .12) + C(w / 4, d / 4, r * .16); break;
      case "fridge": s = R(x, y, w, d) + L(x, y + d * .82, x + w, y + d * .82) + L(x + w * .15, y + d * .82, x + w * .15, y + d); break;
      case "washer": s = R(x, y, w, d, 3) + C(0, d * .05, r * .32) + L(x, y + d * .15, x + w, y + d * .15); break;
      case "toilet": s = R(x + w * .05, y, w * .9, d * .28, 3) + E(0, y + d * .62, w * .42, d * .36); break;
      case "basin": s = R(x, y, w, d, 4) + E(0, d * .08, w * .34, d * .3) + C(0, y + d * .12, 2); break;
      case "bath": s = R(x, y, w, d, 6) + R(x + 7, y + 7, w - 14, d - 14, Math.min(w, d) * .3) + C(x + w * .14, 0, 3); break;
      case "shower": s = R(x, y, w, d) + L(x, y, x + w, y + d) + L(x + w, y, x, y + d) + C(0, 0, 4); break;
      case "desk": s = R(x, y, w, d) + R(x + w * .65, y + 4, w * .3, d - 8); break;
      case "stairs":
        s = R(x, y, w, d); var steps = Math.max(3, Math.round(d / 28));
        for (var i = 1; i < steps; i++) s += L(x, y + d * i / steps, x + w, y + d * i / steps);
        s += L(0, y + d - 10, 0, y + 14) + L(0, y + 14, -8, y + 26) + L(0, y + 14, 8, y + 26); break;
      default: s = R(x, y, w, d);
    }
    return s;
  }
  // The plan as SVG markup in world units. o.px = output pixels per cm (for text and line sizes), o.dims, o.sel
  function planSvg(o) {
    var px = o.px, out = [], fs = 12 / px, lw = 1 / px;
    // rooms
    plan.rooms.forEach(function (r) {
      out.push('<path data-id="' + r.id + '" d="M' + r.pts.map(function (p) { return n(p[0]) + " " + n(p[1]); }).join("L") + 'Z" fill="' + r.color + '" stroke="' + (o.sel === r.id ? "#0e9f9a" : "#9aa3ad") + '" stroke-width="' + n(lw * (o.sel === r.id ? 2.5 : 1) * 10) / 10 + '"/>');
    });
    // walls
    plan.walls.forEach(function (w) {
      out.push('<line data-id="' + w.id + '" x1="' + n(w.x1) + '" y1="' + n(w.y1) + '" x2="' + n(w.x2) + '" y2="' + n(w.y2) + '" stroke="' + (o.sel === w.id ? "#0e9f9a" : "#2b2f36") + '" stroke-width="' + w.t + '" stroke-linecap="square"/>');
    });
    // doors and windows
    plan.items.forEach(function (it) {
      if (it.kind !== "door" && it.kind !== "window") return;
      var w = byId(plan.walls, it.wall); if (!w) return;
      var a = Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180 / Math.PI, x = w.x1 + (w.x2 - w.x1) * it.t, y = w.y1 + (w.y2 - w.y1) * it.t, hw = it.w / 2, T = w.t;
      var col = o.sel === it.id ? "#0e9f9a" : "#2b2f36", g = '<g data-id="' + it.id + '" transform="translate(' + n(x) + " " + n(y) + ") rotate(" + n(a) + ')">';
      g += '<rect x="' + n(-hw) + '" y="' + n(-T / 2 - .5) + '" width="' + n(it.w) + '" height="' + n(T + 1) + '" fill="#ffffff"/>';
      if (it.kind === "door") {
        var hx = it.hinge ? hw : -hw, sy = it.flip ? 1 : -1, ex = it.hinge ? -hw : hw;
        g += '<g fill="none" stroke="' + col + '" stroke-width="' + n(lw * 1.4 * 10) / 10 + '">';
        g += '<line x1="' + n(hx) + '" y1="0" x2="' + n(hx) + '" y2="' + n(sy * it.w) + '"/>';
        g += '<path d="M' + n(hx) + " " + n(sy * it.w) + "A" + n(it.w) + " " + n(it.w) + " 0 0 " + ((it.hinge ? 1 : 0) ^ (it.flip ? 1 : 0) ? 0 : 1) + " " + n(ex) + ' 0" stroke-dasharray="' + n(4 / px) + " " + n(3 / px) + '"/>';
        g += '<line x1="' + n(-hw) + '" y1="' + n(-T / 2) + '" x2="' + n(-hw) + '" y2="' + n(T / 2) + '"/><line x1="' + n(hw) + '" y1="' + n(-T / 2) + '" x2="' + n(hw) + '" y2="' + n(T / 2) + '"/></g>';
      } else {
        g += '<g fill="none" stroke="' + col + '" stroke-width="' + n(lw * 1.2 * 10) / 10 + '"><rect x="' + n(-hw) + '" y="' + n(-T / 2) + '" width="' + n(it.w) + '" height="' + n(T) + '"/>' +
          '<line x1="' + n(-hw) + '" y1="0" x2="' + n(hw) + '" y2="0"/></g>';
      }
      g += '<rect x="' + n(-hw) + '" y="' + n(-Math.max(T, 20) / 2) + '" width="' + n(it.w) + '" height="' + n(Math.max(T, 20)) + '" fill="transparent"/></g>';
      out.push(g);
    });
    // furniture
    plan.items.forEach(function (it) {
      if (!FMAP[it.kind]) return;
      out.push('<g data-id="' + it.id + '" transform="translate(' + n(it.x) + " " + n(it.y) + ") rotate(" + it.rot + ')" fill="#ffffff" stroke="' + (o.sel === it.id ? "#0e9f9a" : "#3f4650") +
        '" stroke-width="' + n(lw * (o.sel === it.id ? 2 : 1.2) * 100) / 100 + '">' + furnSvg(it.kind, it.w, it.d) + "</g>");
    });
    // text: room names and areas, labels, wall lengths
    var tf = 'font-family="' + (o.font || "Inter, Arial, Helvetica, sans-serif") + '" text-anchor="middle"';
    plan.rooms.forEach(function (r) {
      var c = centroid(r.pts);
      out.push('<text ' + tf + ' x="' + n(c[0]) + '" y="' + n(c[1] - fs * .2) + '" font-size="' + n(fs * 1.15) + '" font-weight="600" fill="#1d232b" pointer-events="none">' + esc(r.name) + "</text>");
      out.push('<text ' + tf + ' x="' + n(c[0]) + '" y="' + n(c[1] + fs * 1.1) + '" font-size="' + n(fs) + '" fill="#4b5563" pointer-events="none">' + esc(fmtArea(area(r.pts))) + "</text>");
    });
    plan.items.forEach(function (it) {
      if (it.kind !== "label") return;
      out.push('<text data-id="' + it.id + '" ' + tf + ' x="' + n(it.x) + '" y="' + n(it.y) + '" font-size="' + n(it.size) + '" font-weight="600" fill="' + (o.sel === it.id ? "#0e9f9a" : "#1d232b") + '" dominant-baseline="middle">' + esc(it.text) + "</text>");
    });
    if (o.dims) plan.walls.forEach(function (w) {
      var L = wallLen(w); if (L < 1) return;
      var a = Math.atan2(w.y2 - w.y1, w.x2 - w.x1), deg = a * 180 / Math.PI, mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2, off = w.t / 2 + fs * .9;
      if (deg > 90 || deg <= -90) deg += 180;
      var nx = -Math.sin(a) * off, ny = Math.cos(a) * off;
      out.push('<text ' + tf + ' transform="translate(' + n(mx + nx) + " " + n(my + ny) + ") rotate(" + n(deg) + ')" font-size="' + n(fs * .9) + '" fill="#6b7280" dominant-baseline="middle" pointer-events="none">' + fmtLen(L) + "</text>");
    });
    return out.join("");
  }

  // ---------- editor rendering ----------
  var sel = null, tool = "select", place = null, draft = [], hover = null, roomWalls = true;
  function fixSel() { if (sel && !find(sel)) sel = null; }
  function drawGrid() {
    var w = W(), hh = H(), s = view.s, minor = s * 10 >= 9 ? 10 : s * 50 >= 9 ? 50 : 100, major = minor === 10 ? 100 : 500;
    var x0 = Math.floor(view.ox / minor) * minor, y0 = Math.floor(view.oy / minor) * minor, x1 = view.ox + w / s, y1 = view.oy + hh / s;
    var dMin = "", dMaj = "";
    for (var x = x0; x <= x1; x += minor) { var sx = n((x - view.ox) * s); if (Math.round(x / major) * major === Math.round(x)) dMaj += "M" + sx + " 0V" + hh; else dMin += "M" + sx + " 0V" + hh; }
    for (var y = y0; y <= y1; y += minor) { var sy = n((y - view.oy) * s); if (Math.round(y / major) * major === Math.round(y)) dMaj += "M0 " + sy + "H" + w; else dMin += "M0 " + sy + "H" + w; }
    gGrid.innerHTML = '<rect width="' + w + '" height="' + hh + '" class="fp-paper"/><path d="' + dMin + '" class="fp-gmin"/><path d="' + dMaj + '" class="fp-gmaj"/>';
  }
  function render() {
    drawGrid();
    gWorld.setAttribute("transform", "matrix(" + view.s + " 0 0 " + view.s + " " + n(-view.ox * view.s) + " " + n(-view.oy * view.s) + ")");
    gWorld.innerHTML = planSvg({ px: view.s, dims: true, sel: sel });
    gOver.innerHTML = overlay();
    var tot = plan.rooms.reduce(function (a, r) { return a + area(r.pts); }, 0);
    $("#fp-stats").textContent = plan.rooms.length + (plan.rooms.length === 1 ? " room" : " rooms") + " · " + fmtArea(tot) + " total · " + plan.walls.length + " walls";
    $("#fp-zoom").textContent = Math.round(view.s * 100) + "%";
    var empty = !plan.walls.length && !plan.rooms.length && !plan.items.length;
    $("#fp-hint").hidden = !(empty || tool !== "select" || place);
    $("#fp-hint").textContent = empty && tool === "select" ? "Start with Room: drag a rectangle (walls are added for you). Or press Example." : HINTS[place ? "place" : tool] || "";
    if (!dragging) side();
    syncTools();
  }
  var HINTS = {
    wall: "Click to start a wall, click again for each corner. Double-click, Enter or Esc to finish. Hold Alt to turn snapping off.",
    room: "Drag a rectangle, or click the corners of any shape and click the first corner again to close it.",
    door: "Click on a wall to put a door there.", window: "Click on a wall to put a window there.",
    label: "Click where the text should go.", measure: "Drag to measure a distance.", place: "Click to place it. Esc to cancel."
  };
  // screen-space overlay: handles, drafts, measuring
  var measure = null, cursor = null;
  function S(x, y) { return [n((x - view.ox) * view.s), n((y - view.oy) * view.s)]; }
  function overlay() {
    var o = "", o2 = sel && find(sel), k = kindOf(o2);
    function handle(x, y, id) { var p = S(x, y); return '<circle class="fp-h" data-h="' + id + '" cx="' + p[0] + '" cy="' + p[1] + '" r="7"/>'; }
    if (k === "wall") { o += handle(o2.x1, o2.y1, "w1") + handle(o2.x2, o2.y2, "w2"); }
    else if (k === "room") o2.pts.forEach(function (p, i) { o += handle(p[0], p[1], "r" + i); });
    else if (FMAP[k]) {
      var a = o2.rot * Math.PI / 180, cx = o2.x + Math.cos(a) * o2.w / 2 - Math.sin(a) * o2.d / 2, cy = o2.y + Math.sin(a) * o2.w / 2 + Math.cos(a) * o2.d / 2;
      o += handle(cx, cy, "size");
    }
    if (draft.length && cursor) {
      var pts = draft.concat([cursor]).map(function (p) { return S(p[0], p[1]).join(" "); });
      o += '<path class="fp-draft" d="M' + pts.join("L") + '"/>';
      var last = draft[draft.length - 1], c = S(cursor[0], cursor[1]);
      o += '<text class="fp-dlabel" x="' + (c[0] + 12) + '" y="' + (c[1] - 10) + '">' + fmtLen(dist(last[0], last[1], cursor[0], cursor[1])) + "</text>";
      draft.forEach(function (p) { var q = S(p[0], p[1]); o += '<circle class="fp-dot" cx="' + q[0] + '" cy="' + q[1] + '" r="4"/>'; });
    }
    if (rectDraft) {
      var a1 = S(rectDraft[0], rectDraft[1]), b1 = S(rectDraft[2], rectDraft[3]);
      o += '<rect class="fp-draft" x="' + Math.min(a1[0], b1[0]) + '" y="' + Math.min(a1[1], b1[1]) + '" width="' + Math.abs(b1[0] - a1[0]) + '" height="' + Math.abs(b1[1] - a1[1]) + '"/>';
      o += '<text class="fp-dlabel" x="' + (Math.max(a1[0], b1[0]) + 10) + '" y="' + (Math.max(a1[1], b1[1]) + 18) + '">' + fmtLen(Math.abs(rectDraft[2] - rectDraft[0])) + " × " + fmtLen(Math.abs(rectDraft[3] - rectDraft[1])) + "</text>";
    }
    if (measure) {
      var m1 = S(measure[0], measure[1]), m2 = S(measure[2], measure[3]);
      o += '<line class="fp-measure" x1="' + m1[0] + '" y1="' + m1[1] + '" x2="' + m2[0] + '" y2="' + m2[1] + '"/><text class="fp-dlabel" x="' + (m2[0] + 12) + '" y="' + (m2[1] - 10) + '">' + fmtLen(dist(measure[0], measure[1], measure[2], measure[3])) + "</text>";
    }
    if (place && cursor) {
      var f = FMAP[place], gp = S(cursor[0], cursor[1]);
      o += '<g class="fp-ghost" transform="translate(' + gp[0] + " " + gp[1] + ") scale(" + view.s + ')" stroke-width="' + n(1.2 / view.s * 100) / 100 + '">' + furnSvg(place, f[2], f[3]) + "</g>";
    }
    return o;
  }

  // ---------- pointer interaction ----------
  var pointers = {}, dragging = null, rectDraft = null, lastTap = { t: 0, x: 0, y: 0 };
  function nearestWall(x, y, maxPx) {
    var best = null, bd = maxPx / view.s;
    plan.walls.forEach(function (w) { var p = project(x, y, w); if (p.d < bd) { bd = p.d; best = { w: w, p: p }; } });
    return best;
  }
  function samePt(a, b) { return Math.abs(a[0] - b[0]) < .5 && Math.abs(a[1] - b[1]) < .5; }
  function addWall(a, b) { if (dist(a[0], a[1], b[0], b[1]) < 1) return; plan.walls.push({ id: uid(), x1: a[0], y1: a[1], x2: b[0], y2: b[1], t: 15 }); }
  function finishWall() { draft = []; cursor = null; render(); }
  function finishRoom() {
    if (draft.length >= 3) {
      var pts = draft.slice();
      change(function () {
        var r = { id: uid(), name: "Room " + (plan.rooms.length + 1), color: ROOM_COLORS[plan.rooms.length % ROOM_COLORS.length], pts: pts };
        plan.rooms.push(r); sel = r.id;
        if (roomWalls) pts.forEach(function (p, i) { addWall(p, pts[(i + 1) % pts.length]); });
      });
    }
    draft = []; cursor = null; setTool("select");
  }
  svg.addEventListener("contextmenu", function (e) { e.preventDefault(); if (tool === "wall") finishWall(); else if (tool === "room") finishRoom(); });
  svg.addEventListener("wheel", function (e) { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0015)), e.clientX, e.clientY); }, { passive: false });
  svg.addEventListener("pointerdown", function (e) {
    svg.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = [e.clientX, e.clientY];
    var ids = Object.keys(pointers);
    if (ids.length === 2) { // pinch
      var p1 = pointers[ids[0]], p2 = pointers[ids[1]];
      dragging = { type: "pinch", d: dist(p1[0], p1[1], p2[0], p2[1]), s: view.s, cx: (p1[0] + p2[0]) / 2, cy: (p1[1] + p2[1]) / 2, before: null };
      rectDraft = null; return;
    }
    if (e.button === 1 || (e.button === 0 && spaceDown)) { dragging = { type: "pan", x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy }; return; }
    if (e.button !== 0) return;
    var wpt = toWorld(e.clientX, e.clientY), free = e.altKey;
    if (place) {
      var f = FMAP[place], p = snap(wpt[0], wpt[1], null, free);
      change(function () { var it = { id: uid(), kind: place, x: p[0], y: p[1], w: f[2], d: f[3], rot: 0 }; plan.items.push(it); sel = it.id; });
      place = null; setTool("select"); return;
    }
    if (tool === "wall") {
      var anchor = draft.length ? draft[draft.length - 1] : null, q = snap(wpt[0], wpt[1], anchor, free);
      var now = Date.now(), dbl = now - lastTap.t < 350 && dist(lastTap.x, lastTap.y, e.clientX, e.clientY) < 8; lastTap = { t: now, x: e.clientX, y: e.clientY };
      if (draft.length && (dbl || samePt(q, anchor))) { finishWall(); return; }
      if (draft.length) { var b = snapshot(); addWall(anchor, q); commit(b); if (samePt(q, draft[0])) { finishWall(); return; } }
      draft.push(q); cursor = q; render(); return;
    }
    if (tool === "room") {
      var q2 = snap(wpt[0], wpt[1], draft.length ? draft[draft.length - 1] : null, free);
      if (draft.length) {
        if (draft.length >= 3 && samePt(q2, draft[0])) { finishRoom(); return; }
        if (!samePt(q2, draft[draft.length - 1])) draft.push(q2);
        render(); return;
      }
      dragging = { type: "roomstart", start: q2, sx: e.clientX, sy: e.clientY }; return;
    }
    if (tool === "door" || tool === "window") {
      var nw = nearestWall(wpt[0], wpt[1], 30);
      if (!nw) { S3.toast("Click on a wall", "error"); return; }
      var width = tool === "door" ? 80 : 120, L = wallLen(nw.w);
      if (L < width + 10) width = Math.max(30, L - 10);
      var half = width / 2 / L, t = Math.max(half, Math.min(1 - half, nw.p.t));
      change(function () { var it = { id: uid(), kind: tool, wall: nw.w.id, t: t, w: width, flip: false, hinge: false }; plan.items.push(it); sel = it.id; });
      setTool("select"); return;
    }
    if (tool === "label") {
      var lp = snap(wpt[0], wpt[1], null, true);
      change(function () { var it = { id: uid(), kind: "label", x: lp[0], y: lp[1], text: "Label", size: 24 }; plan.items.push(it); sel = it.id; });
      setTool("select");
      var li = $("#fp-label-text"); if (li) { li.focus(); li.select(); }
      return;
    }
    if (tool === "measure") { var mp = snap(wpt[0], wpt[1], null, free); measure = [mp[0], mp[1], mp[0], mp[1]]; dragging = { type: "measure" }; render(); return; }
    // select tool
    var hEl = e.target.closest && e.target.closest("[data-h]");
    var before = snapshot();
    if (hEl && sel) {
      var o = find(sel), hk = hEl.getAttribute("data-h");
      if (hk === "w1" || hk === "w2") {
        var old = hk === "w1" ? [o.x1, o.y1] : [o.x2, o.y2], linked = [];
        plan.walls.forEach(function (w) { if (w === o) return; if (samePt([w.x1, w.y1], old)) linked.push([w, 1]); if (samePt([w.x2, w.y2], old)) linked.push([w, 2]); });
        dragging = { type: "wallend", o: o, end: hk === "w1" ? 1 : 2, linked: linked, before: before };
      } else if (hk.charAt(0) === "r") dragging = { type: "roompt", o: o, i: +hk.slice(1), before: before };
      else if (hk === "size") dragging = { type: "size", o: o, before: before };
      return;
    }
    var t = e.target.closest && e.target.closest("[data-id]");
    if (t) {
      sel = t.getAttribute("data-id");
      var obj = find(sel);
      dragging = { type: "move", o: obj, start: wpt, copy: JSON.parse(JSON.stringify(obj)), before: before, moved: false };
      if (kindOf(obj) === "wall") {
        dragging.linked = [];
        plan.walls.forEach(function (w) {
          if (w === obj) return;
          [[obj.x1, obj.y1], [obj.x2, obj.y2]].forEach(function (pt) { if (samePt([w.x1, w.y1], pt)) dragging.linked.push([w, 1, w.x1, w.y1]); if (samePt([w.x2, w.y2], pt)) dragging.linked.push([w, 2, w.x2, w.y2]); });
        });
      }
      render(); return;
    }
    sel = null;
    dragging = { type: "pan", x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
    render();
  });
  svg.addEventListener("pointermove", function (e) {
    if (pointers[e.pointerId]) pointers[e.pointerId] = [e.clientX, e.clientY];
    var wpt = toWorld(e.clientX, e.clientY), free = e.altKey;
    if (dragging && dragging.type === "pinch") {
      var ids = Object.keys(pointers); if (ids.length < 2) return;
      var p1 = pointers[ids[0]], p2 = pointers[ids[1]], d = dist(p1[0], p1[1], p2[0], p2[1]);
      zoomAt(dragging.s * d / dragging.d / view.s, (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2); return;
    }
    if (!dragging) {
      if (tool === "wall" || tool === "room") { cursor = draft.length ? snap(wpt[0], wpt[1], draft[draft.length - 1], free) : snap(wpt[0], wpt[1], null, free); if (draft.length) gOver.innerHTML = overlay(); }
      else if (place) { cursor = snap(wpt[0], wpt[1], null, free); gOver.innerHTML = overlay(); }
      return;
    }
    var D = dragging;
    if (D.type === "pan") { view.ox = D.ox - (e.clientX - D.x) / view.s; view.oy = D.oy - (e.clientY - D.y) / view.s; render(); return; }
    if (D.type === "measure") { var mp = snap(wpt[0], wpt[1], [measure[0], measure[1]], free); measure[2] = mp[0]; measure[3] = mp[1]; gOver.innerHTML = overlay(); return; }
    if (D.type === "roomstart") {
      if (dist(D.sx, D.sy, e.clientX, e.clientY) > 8) { var q = snap(wpt[0], wpt[1], null, free); rectDraft = [D.start[0], D.start[1], q[0], q[1]]; gOver.innerHTML = overlay(); }
      return;
    }
    if (D.type === "wallend") {
      var o = D.o, other = D.end === 1 ? [o.x2, o.y2] : [o.x1, o.y1];
      var p = snap(wpt[0], wpt[1], other, free, function (pt) { return samePt(pt, D.end === 1 ? [o.x1, o.y1] : [o.x2, o.y2]); });
      if (D.end === 1) { o.x1 = p[0]; o.y1 = p[1]; } else { o.x2 = p[0]; o.y2 = p[1]; }
      D.linked.forEach(function (l) { if (l[1] === 1) { l[0].x1 = p[0]; l[0].y1 = p[1]; } else { l[0].x2 = p[0]; l[0].y2 = p[1]; } });
      render(); return;
    }
    if (D.type === "roompt") { var rp = snap(wpt[0], wpt[1], null, free, function (pt) { return pt === D.o.pts[D.i]; }); D.o.pts[D.i] = rp; render(); return; }
    if (D.type === "size") {
      var it = D.o, a = -it.rot * Math.PI / 180, dx = wpt[0] - it.x, dy = wpt[1] - it.y;
      var lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      it.w = Math.max(10, Math.round(Math.abs(lx) * 2 / GRID_SNAP) * GRID_SNAP); it.d = Math.max(10, Math.round(Math.abs(ly) * 2 / GRID_SNAP) * GRID_SNAP);
      render(); return;
    }
    if (D.type === "move") {
      var ddx = wpt[0] - D.start[0], ddy = wpt[1] - D.start[1], ob = D.o, c = D.copy, k = kindOf(ob);
      if (!D.moved && Math.hypot(ddx, ddy) * view.s < 4) return;
      D.moved = true;
      if (!free) { ddx = snapGrid(ddx); ddy = snapGrid(ddy); }
      if (k === "wall") {
        ob.x1 = c.x1 + ddx; ob.y1 = c.y1 + ddy; ob.x2 = c.x2 + ddx; ob.y2 = c.y2 + ddy;
        D.linked.forEach(function (l) { if (l[1] === 1) { l[0].x1 = l[2] + ddx; l[0].y1 = l[3] + ddy; } else { l[0].x2 = l[2] + ddx; l[0].y2 = l[3] + ddy; } });
      } else if (k === "room") ob.pts = c.pts.map(function (p) { return [p[0] + ddx, p[1] + ddy]; });
      else if (k === "door" || k === "window") {
        var w = byId(plan.walls, ob.wall), pr = project(wpt[0], wpt[1], w), half = ob.w / 2 / wallLen(w);
        ob.t = Math.max(half, Math.min(1 - half, pr.t));
      } else { ob.x = c.x + ddx; ob.y = c.y + ddy; }
      render(); return;
    }
  });
  function endPointer(e) {
    delete pointers[e.pointerId];
    var D = dragging; dragging = null;
    if (!D) return;
    if (D.type === "roomstart") {
      if (rectDraft && Math.abs(rectDraft[2] - rectDraft[0]) > 5 && Math.abs(rectDraft[3] - rectDraft[1]) > 5) {
        var x0 = Math.min(rectDraft[0], rectDraft[2]), x1 = Math.max(rectDraft[0], rectDraft[2]), y0 = Math.min(rectDraft[1], rectDraft[3]), y1 = Math.max(rectDraft[1], rectDraft[3]);
        rectDraft = null; draft = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; finishRoom(); return;
      }
      rectDraft = null; draft = [D.start]; cursor = D.start; render(); return;
    }
    if (D.type === "measure") { render(); return; }
    if (D.before) { commit(D.before); }
    render();
  }
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);
  svg.addEventListener("dblclick", function () { if (tool === "room" && draft.length >= 3) finishRoom(); });

  // ---------- keyboard ----------
  var spaceDown = false;
  document.addEventListener("keydown", function (e) {
    if ($(".s3-modal")) return;
    var tag = e.target && e.target.tagName, typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if ((e.ctrlKey || e.metaKey) && !typing) {
      if (e.key === "z" || e.key === "Z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (e.key === "y" || e.key === "Y") { e.preventDefault(); redo(); }
      else if ((e.key === "d" || e.key === "D") && sel) { e.preventDefault(); duplicate(); }
      return;
    }
    if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
    var k = e.key;
    if (k === " ") { spaceDown = true; e.preventDefault(); return; }
    if (k === "Escape") { if (tool === "room" && draft.length >= 3) finishRoom(); else { draft = []; rectDraft = null; place = null; measure = null; cursor = null; if (tool !== "select") setTool("select"); else { sel = null; render(); } } return; }
    if (k === "Enter") { if (tool === "wall") finishWall(); else if (tool === "room") finishRoom(); return; }
    if ((k === "Delete" || k === "Backspace") && sel) { e.preventDefault(); remove(); return; }
    if ((k === "r" || k === "R") && sel && FMAP[kindOf(find(sel))]) { rotate(); return; }
    var map = { v: "select", w: "wall", m: "room", d: "door", i: "window", t: "label", u: "measure" };
    if (map[k.toLowerCase()]) { setTool(map[k.toLowerCase()]); return; }
    if (k === "f" || k === "F") fit();
    else if (k === "+" || k === "=") zoomAt(1.25, box.getBoundingClientRect().left + W() / 2, box.getBoundingClientRect().top + H() / 2);
    else if (k === "-") zoomAt(.8, box.getBoundingClientRect().left + W() / 2, box.getBoundingClientRect().top + H() / 2);
    else if (k === "?") help();
  });
  document.addEventListener("keyup", function (e) { if (e.key === " ") spaceDown = false; });

  // ---------- actions ----------
  function remove() {
    var o = find(sel); if (!o) return;
    change(function () {
      var k = kindOf(o);
      if (k === "wall") { plan.walls = plan.walls.filter(function (w) { return w !== o; }); plan.items = plan.items.filter(function (it) { return it.wall !== o.id; }); }
      else if (k === "room") plan.rooms = plan.rooms.filter(function (r) { return r !== o; });
      else plan.items = plan.items.filter(function (it) { return it !== o; });
      sel = null;
    });
  }
  function rotate() { var o = find(sel); if (o) change(function () { o.rot = (o.rot + 90) % 360; }); }
  function duplicate() {
    var o = find(sel); if (!o) return;
    var k = kindOf(o), c = JSON.parse(JSON.stringify(o)); c.id = uid();
    change(function () {
      if (k === "wall") { c.x1 += 30; c.y1 += 30; c.x2 += 30; c.y2 += 30; plan.walls.push(c); }
      else if (k === "room") { c.pts = c.pts.map(function (p) { return [p[0] + 30, p[1] + 30]; }); c.name += " copy"; plan.rooms.push(c); }
      else if (k === "door" || k === "window") { var w = byId(plan.walls, c.wall), half = c.w / 2 / wallLen(w); c.t = Math.min(1 - half, c.t + half * 2.2); plan.items.push(c); }
      else { c.x += 30; c.y += 30; plan.items.push(c); }
      sel = c.id;
    });
  }
  function setTool(t) {
    tool = t; draft = []; rectDraft = null; measure = null; if (t !== "place") place = null;
    if (t !== "select") sel = null;
    box.setAttribute("data-tool", t);
    render();
  }

  // ---------- side panel ----------
  function icon(nm) { var s = h("span", { "class": "fp-ic", "aria-hidden": "true" }); s.innerHTML = S3.icon(nm); return s; }
  function btn(label, onclick, cls, ic, title) {
    return h("button", { type: "button", "class": "btn " + (cls || ""), onclick: onclick, title: title || null, "aria-label": title || null }, ic ? [icon(ic)].concat(label ? [label] : []) : [label]);
  }
  function numField(label, value, onset, step) {
    var inp = h("input", { "class": "input", type: "number", step: String(step || .01), value: String(value), inputmode: "decimal" });
    inp.addEventListener("change", function () { var v = parseFloat(inp.value); if (isFinite(v) && v > 0) onset(v); else render(); });
    return h("label", { "class": "field" }, [label, inp]);
  }
  function side() {
    var p = $("#fp-side"); p.textContent = "";
    var o = sel && find(sel), k = kindOf(o), card = h("div", { "class": "card fp-props" });
    if (!o) {
      card.appendChild(h("h2", { text: "Plan" }));
      var unit = h("select", { "class": "select", "aria-label": "Units" }, [h("option", { value: "m", text: "Metres (m, m²)" }), h("option", { value: "ft", text: "Feet (ft, ft²)" })]);
      unit.value = plan.unit; unit.addEventListener("change", function () { change(function () { plan.unit = unit.value; }); });
      var rw = h("input", { type: "checkbox" }); rw.checked = roomWalls; rw.addEventListener("change", function () { roomWalls = rw.checked; });
      card.appendChild(h("div", { "class": "stack" }, [h("label", { "class": "field" }, ["Units", unit]), h("label", { "class": "check" }, [rw, "Add walls around new rooms"]),
        h("p", { "class": "faint", text: "Select something to edit it. Drag empty space to move around, scroll or pinch to zoom. Hold Alt while drawing to turn snapping off." })]));
    } else if (k === "wall") {
      card.appendChild(h("h2", { text: "Wall" }));
      var th = h("select", { "class": "select" }, [5, 10, 12, 15, 20, 25, 30, 40].map(function (t) { return h("option", { value: String(t), text: t + " cm" }); }));
      th.value = String(o.t); th.addEventListener("change", function () { change(function () { o.t = +th.value; }); });
      card.appendChild(h("div", { "class": "fp-fields" }, [numField("Length (" + unitName() + ")", toUnit(wallLen(o)), function (v) {
        change(function () { var L = wallLen(o) || 1, f = fromUnit(v) / L, ox = o.x2, oy = o.y2; o.x2 = o.x1 + (o.x2 - o.x1) * f; o.y2 = o.y1 + (o.y2 - o.y1) * f;
          plan.walls.forEach(function (w) { if (w === o) return; if (samePt([w.x1, w.y1], [ox, oy])) { w.x1 = o.x2; w.y1 = o.y2; } if (samePt([w.x2, w.y2], [ox, oy])) { w.x2 = o.x2; w.y2 = o.y2; } }); });
      }), h("label", { "class": "field" }, ["Thickness", th])]));
    } else if (k === "room") {
      card.appendChild(h("h2", { text: "Room" }));
      var nm = h("input", { "class": "input", type: "text", maxlength: "40", value: o.name, dir: "auto" });
      var b0 = null;
      nm.addEventListener("focus", function () { b0 = snapshot(); });
      nm.addEventListener("input", function () { o.name = nm.value.slice(0, 40); gWorld.innerHTML = planSvg({ px: view.s, dims: true, sel: sel }); });
      nm.addEventListener("change", function () { if (b0) commit(b0); b0 = null; });
      var sw = h("div", { "class": "fp-swatches", role: "group", "aria-label": "Room colour" }, ROOM_COLORS.map(function (c) {
        return h("button", { type: "button", "class": "fp-sw", style: "background:" + c, "aria-label": "Colour " + c, "aria-pressed": String(c === o.color), onclick: function () { change(function () { o.color = c; }); } });
      }));
      card.appendChild(h("div", { "class": "stack" }, [h("label", { "class": "field" }, ["Name", nm]), h("div", { "class": "field" }, ["Colour", sw]),
        h("p", { "class": "fp-area", text: fmtArea(area(o.pts)) }), h("p", { "class": "faint", text: "Drag the corner dots to reshape the room." })]));
    } else if (k === "door" || k === "window") {
      card.appendChild(h("h2", { text: k === "door" ? "Door" : "Window" }));
      var flds = [numField("Width (" + unitName() + ")", toUnit(o.w), function (v) {
        change(function () { var w = byId(plan.walls, o.wall), L = wallLen(w); o.w = Math.max(30, Math.min(L - 4, fromUnit(v))); var half = o.w / 2 / L; o.t = Math.max(half, Math.min(1 - half, o.t)); });
      })];
      card.appendChild(h("div", { "class": "fp-fields" }, flds));
      if (k === "door") card.appendChild(h("div", { "class": "row" }, [btn("Flip in/out", function () { change(function () { o.flip = !o.flip; }); }, "small"), btn("Hinge side", function () { change(function () { o.hinge = !o.hinge; }); }, "small")]));
      card.appendChild(h("p", { "class": "faint", text: "Drag it along the wall to move it." }));
    } else if (k === "label") {
      card.appendChild(h("h2", { text: "Label" }));
      var tx = h("input", { "class": "input", type: "text", maxlength: "80", value: o.text, dir: "auto", id: "fp-label-text" }), b1 = null;
      tx.addEventListener("focus", function () { b1 = snapshot(); });
      tx.addEventListener("input", function () { o.text = tx.value.slice(0, 80) || " "; gWorld.innerHTML = planSvg({ px: view.s, dims: true, sel: sel }); });
      tx.addEventListener("change", function () { if (b1) commit(b1); b1 = null; });
      var sz = h("select", { "class": "select" }, [12, 18, 24, 36, 48, 72].map(function (v) { return h("option", { value: String(v), text: v + " cm tall" }); }));
      sz.value = String(o.size); sz.addEventListener("change", function () { change(function () { o.size = +sz.value; }); });
      card.appendChild(h("div", { "class": "stack" }, [h("label", { "class": "field" }, ["Text", tx]), h("label", { "class": "field" }, ["Size", sz])]));
    } else if (FMAP[k]) {
      card.appendChild(h("h2", { text: FMAP[k][1] }));
      card.appendChild(h("div", { "class": "fp-fields" }, [
        numField("Width (" + unitName() + ")", toUnit(o.w), function (v) { change(function () { o.w = Math.max(10, fromUnit(v)); }); }),
        numField("Depth (" + unitName() + ")", toUnit(o.d), function (v) { change(function () { o.d = Math.max(10, fromUnit(v)); }); })
      ]));
      card.appendChild(h("div", { "class": "row" }, [btn("Rotate 90°", rotate, "small", "refresh", "Rotate 90° (R)"), h("span", { "class": "faint", text: o.rot + "°" })]));
    }
    if (o) card.appendChild(h("div", { "class": "row fp-sel-actions" }, [btn("Duplicate", duplicate, "small", "copy", "Duplicate (Ctrl+D)"), btn("Delete", remove, "small danger", "trash", "Delete (Del)")]));
    p.appendChild(card);
    // furniture library
    var lib = h("details", { "class": "card fp-lib", open: true }, [h("summary", { text: "Furniture" })]), groups = {};
    FURN.forEach(function (f) {
      if (!groups[f[4]]) { groups[f[4]] = h("div", { "class": "fp-lib-grid" }); lib.appendChild(h("h3", { text: f[4] })); lib.appendChild(groups[f[4]]); }
      var s = Math.max(f[2], f[3]) * 1.15, b = h("button", { type: "button", "class": "fp-lib-item", title: f[1] + " (" + f[2] + "×" + f[3] + " cm)", "aria-label": "Place " + f[1], "aria-pressed": String(place === f[0]),
        onclick: function () { place = f[0]; tool = "select"; sel = null; draft = []; box.setAttribute("data-tool", "place"); render(); } });
      b.innerHTML = '<svg viewBox="' + n(-s / 2) + " " + n(-s / 2) + " " + n(s) + " " + n(s) + '" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="' + n(s / 40) + '">' + furnSvg(f[0], f[2], f[3]) + "</g></svg>";
      b.appendChild(h("span", { text: f[1] }));
      groups[f[4]].appendChild(b);
    });
    p.appendChild(lib);
  }

  // ---------- toolbar ----------
  var TOOLS = [["select", "Select", "V"], ["wall", "Wall", "W"], ["room", "Room", "M"], ["door", "Door", "D"], ["window", "Window", "I"], ["label", "Text", "T"], ["measure", "Measure", "U"]];
  function toolbar() {
    var tb = $("#fp-toolbar");
    var seg = h("div", { "class": "seg fp-tools", role: "group", "aria-label": "Tools" }, TOOLS.map(function (t) {
      return h("button", { type: "button", "data-t": t[0], title: t[1] + " (" + t[2] + ")", onclick: function () { setTool(t[0]); } }, [t[1]]);
    }));
    tb.appendChild(seg);
    tb.appendChild(h("div", { "class": "row fp-tb-right" }, [
      btn("↶", undo, "ghost icon small", "", "Undo (Ctrl+Z)"), btn("↷", redo, "ghost icon small", "", "Redo (Ctrl+Shift+Z)"),
      btn("−", function () { zoomAt(.8, box.getBoundingClientRect().left + W() / 2, box.getBoundingClientRect().top + H() / 2); }, "ghost icon small", "", "Zoom out (−)"),
      btn("+", function () { zoomAt(1.25, box.getBoundingClientRect().left + W() / 2, box.getBoundingClientRect().top + H() / 2); }, "ghost icon small", "", "Zoom in (+)"),
      btn("Fit", fit, "ghost small", "", "Fit the plan on screen (F)")
    ]));
    tb.lastChild.appendChild(btn("?", help, "ghost icon small", "", "Keyboard shortcuts (?)"));
    var a = $("#fp-actions");
    var menu = h("details", { "class": "fp-menu" }, [h("summary", { "class": "btn" }, [icon("file"), "File"])]);
    var list = h("div", { "class": "fp-menu-list", role: "menu" });
    [["New plan", newPlan], ["Open plan file…", openPlan], ["Save plan file", savePlan], ["Load example flat", example]].forEach(function (it) {
      list.appendChild(h("button", { type: "button", role: "menuitem", onclick: function () { menu.open = false; it[1](); } }, [it[0]]));
    });
    menu.appendChild(list);
    menu.addEventListener("toggle", function () { if (!menu.open) return; list.style.left = ""; list.style.right = ""; if (list.getBoundingClientRect().left < 8) { list.style.left = "0"; list.style.right = "auto"; } });
    document.addEventListener("click", function (e) { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    a.appendChild(menu);
    a.appendChild(btn("Export", exportDialog, "primary", "download"));
  }
  function syncTools() {
    S3.$$(".fp-tools button").forEach(function (b) { b.setAttribute("aria-pressed", String(!place && b.getAttribute("data-t") === tool)); });
  }

  // ---------- export ----------
  var PAPER = { a4: [29.7, 21], a3: [42, 29.7], letter: [27.94, 21.59] }; // landscape, cm
  var SCALES = [10, 20, 25, 50, 75, 100, 150, 200, 250, 500, 1000];
  // draw the plan into a canvas: area b (world cm) at k pixels per cm, white background
  function rasterize(b, k, opts) {
    var w = Math.round((b.x1 - b.x0) * k), hh = Math.round((b.y1 - b.y0) * k);
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + hh + '" viewBox="' + n(b.x0) + " " + n(b.y0) + " " + n(b.x1 - b.x0) + " " + n(b.y1 - b.y0) + '">' +
      '<rect x="' + n(b.x0) + '" y="' + n(b.y0) + '" width="' + n(b.x1 - b.x0) + '" height="' + n(b.y1 - b.y0) + '" fill="#ffffff"/>' +
      planSvg({ px: k * (opts.textScale || 1), dims: opts.dims, sel: null, font: "Arial, Helvetica, sans-serif" }) + "</svg>";
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml" })), im = new Image();
      im.onload = function () { var c = document.createElement("canvas"); c.width = w; c.height = hh; var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, hh); x.drawImage(im, 0, 0, w, hh); URL.revokeObjectURL(url); res(c); };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error("render")); };
      im.src = url;
    });
  }
  function padded(m) { var b = bounds(false); if (!b) return null; return { x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m }; }
  function fileBase() { return (plan.name || "").replace(/[^A-Za-z0-9 _.-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 50).replace(/ /g, "-") || "floor-plan"; }
  function exportPng(pxPerM, dims) {
    var b = padded(60); if (!b) return Promise.reject(new Error("empty"));
    var k = pxPerM / 100, big = Math.max(b.x1 - b.x0, b.y1 - b.y0) * k;
    if (big > 8000) k *= 8000 / big;
    return rasterize(b, k, { dims: dims, textScale: .75 }).then(function (c) { return new Promise(function (res) { c.toBlob(res, "image/png"); }); });
  }
  // PDF page to scale: paper (cm), 1:scale. Returns {canvas, pageW, pageH (pt), scale}
  function pdfPage(paperKey, orient, scaleChoice, dims) {
    var b = padded(30); if (!b) return Promise.reject(new Error("empty"));
    var pp = PAPER[paperKey], pw = orient === "portrait" ? pp[1] : pp[0], ph = orient === "portrait" ? pp[0] : pp[1];
    var margin = 1.2, head = 1.4, aw = pw - 2 * margin, ah = ph - 2 * margin - head, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    var scale = scaleChoice === "fit" ? (SCALES.filter(function (sc) { return bw / sc <= aw && bh / sc <= ah; })[0] || Math.ceil(Math.max(bw / aw, bh / ah))) : +scaleChoice;
    var dpcm = 150 / 2.54, k = dpcm / scale; // canvas pixels per world cm
    return rasterize(b, k, { dims: dims, textScale: .7 }).then(function (plc) {
      var c = document.createElement("canvas"); c.width = Math.round(pw * dpcm); c.height = Math.round(ph * dpcm);
      var x = c.getContext("2d"), m = margin * dpcm;
      x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = "#111"; x.font = "600 " + Math.round(.5 * dpcm) + "px Inter, Arial, sans-serif"; x.textBaseline = "top";
      x.fillText(plan.name || "Floor plan", m, m);
      x.font = Math.round(.32 * dpcm) + "px Inter, Arial, sans-serif"; x.fillStyle = "#555"; x.textAlign = "right";
      x.fillText("Scale 1:" + scale + " on " + paperKey.toUpperCase() + " · " + fmtArea(plan.rooms.reduce(function (a, r) { return a + area(r.pts); }, 0)), c.width - m, m + .1 * dpcm);
      x.textAlign = "left";
      var ox = m + Math.max(0, (aw * dpcm - plc.width) / 2), oy = m + head * dpcm + Math.max(0, (ah * dpcm - plc.height) / 2);
      x.save(); x.beginPath(); x.rect(m, m + head * dpcm, aw * dpcm, ah * dpcm); x.clip(); x.drawImage(plc, ox, oy); x.restore();
      // scale bar: a whole number of metres (or feet) close to 4 cm of paper
      var unitCm = plan.unit === "ft" ? 30.48 : 100, units = Math.max(1, Math.round(4 * scale / unitCm)), barW = units * unitCm * k, by = c.height - m * .55, bx = m;
      x.fillStyle = "#111"; x.fillRect(bx, by - 6, barW, 6); x.fillStyle = "#fff"; x.fillRect(bx + barW / 2, by - 5, barW / 2 - 1, 4);
      x.fillStyle = "#111"; x.font = Math.round(.28 * dpcm) + "px Inter, Arial, sans-serif"; x.textBaseline = "bottom";
      x.fillText("0", bx, by - 10); x.textAlign = "right"; x.fillText(units + (plan.unit === "ft" ? " ft" : " m"), bx + barW, by - 10); x.textAlign = "left";
      var fits = bw / scale <= aw + .01 && bh / scale <= ah + .01;
      return { canvas: c, pageW: pw / 2.54 * 72, pageH: ph / 2.54 * 72, scale: scale, fits: fits };
    });
  }
  function canvasJpeg(c) { return new Promise(function (res) { c.toBlob(function (b) { b.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); }); }, "image/jpeg", .92); }); }
  // Minimal PDF 1.4 writer: one full-page JPEG per page (same as the Storyboard tool).
  function buildPdf(pages) {
    var enc = new TextEncoder(), parts = [], len = 0, offs = [];
    function put(x) { var b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; }
    function obj(nn, body, stream) { offs[nn] = len; put(nn + " 0 obj\n" + body); if (stream) { put("\nstream\n"); put(stream); put("\nendstream"); } put("\nendobj\n"); }
    put("%PDF-1.4\n%S3FP\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [" + pages.map(function (_, i) { return (3 + i * 3) + " 0 R"; }).join(" ") + "] /Count " + pages.length + " >>");
    pages.forEach(function (pg, i) {
      var nn = 3 + i * 3, w = pg.w.toFixed(2), hh = pg.h.toFixed(2);
      obj(nn, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + w + " " + hh + "] /Resources << /XObject << /Im0 " + (nn + 1) + " 0 R >> >> /Contents " + (nn + 2) + " 0 R >>");
      obj(nn + 1, "<< /Type /XObject /Subtype /Image /Width " + pg.px[0] + " /Height " + pg.px[1] + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + pg.jpeg.length + " >>", pg.jpeg);
      var cs = "q " + w + " 0 0 " + hh + " 0 0 cm /Im0 Do Q";
      obj(nn + 2, "<< /Length " + cs.length + " >>", enc.encode(cs));
    });
    var count = 3 + pages.length * 3, xref = len, t = "xref\n0 " + count + "\n0000000000 65535 f \n";
    for (var i = 1; i < count; i++) t += String(offs[i]).padStart(10, "0") + " 00000 n \n";
    put(t + "trailer\n<< /Size " + count + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
    return new Blob(parts, { type: "application/pdf" });
  }
  function exportDialog() {
    if (!bounds(false)) return S3.toast("Draw something first", "error");
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Export" });
    function sel2(opts, v) { var s = h("select", { "class": "select" }, opts.map(function (o) { return h("option", { value: String(o[0]), text: o[1] }); })); s.value = String(v); return s; }
    var paper = sel2([["a4", "A4"], ["a3", "A3"], ["letter", "US Letter"]], "a4"), orient = sel2([["landscape", "Landscape"], ["portrait", "Portrait"]], "landscape");
    var scale = sel2([["fit", "Biggest that fits"]].concat(SCALES.map(function (s) { return [s, "1:" + s]; })), "fit");
    var res = sel2([[100, "100 px per metre"], [200, "200 px per metre"], [400, "400 px per metre"]], 200);
    var dims = h("input", { type: "checkbox" }); dims.checked = true;
    var note = h("p", { "class": "faint" });
    var pdfBtn = btn("Save PDF", function () {
      pdfBtn.disabled = true;
      pdfPage(paper.value, orient.value, scale.value, dims.checked).then(function (pg) {
        if (!pg.fits) S3.toast("At 1:" + pg.scale + " the plan is bigger than the page, so it was cut. Pick a smaller scale or Biggest that fits.", "error");
        return canvasJpeg(pg.canvas).then(function (j) { return buildPdf([{ w: pg.pageW, h: pg.pageH, px: [pg.canvas.width, pg.canvas.height], jpeg: j }]); });
      }).then(function (blob) { S3.download(blob, fileBase() + ".pdf"); S3.done(); pdfBtn.disabled = false; }, function () { S3.toast("Couldn't make the PDF", "error"); pdfBtn.disabled = false; });
    }, "primary", "download");
    var pngBtn = btn("Save PNG", function () {
      exportPng(+res.value, dims.checked).then(function (b) { S3.download(b, fileBase() + ".png"); S3.done(); }, function () { S3.toast("Couldn't make the image", "error"); });
    }, "", "download");
    var sheet = h("div", { "class": "s3-sheet" }, [
      h("div", { "class": "row between" }, [h("h2", { text: "Export" }), btn("", close, "ghost icon", "x", "Close")]),
      h("label", { "class": "check" }, [dims, "Show wall lengths"]),
      h("h3", { "class": "fp-h3", text: "PDF to scale" }),
      h("div", { "class": "fp-fields" }, [h("label", { "class": "field" }, ["Paper", paper]), h("label", { "class": "field" }, ["Orientation", orient]), h("label", { "class": "field" }, ["Scale", scale])]),
      note,
      h("div", { "class": "row end" }, [pdfBtn]),
      h("h3", { "class": "fp-h3", text: "Image" }),
      h("div", { "class": "fp-fields" }, [h("label", { "class": "field" }, ["Resolution", res])]),
      h("div", { "class": "row end" }, [pngBtn])
    ]);
    function upd() {
      var b = padded(30), pp = PAPER[paper.value], pw = orient.value === "portrait" ? pp[1] : pp[0], ph = orient.value === "portrait" ? pp[0] : pp[1];
      var aw = pw - 2.4, ah = ph - 3.8, bw = b.x1 - b.x0, bh = b.y1 - b.y0, best = SCALES.filter(function (sc) { return bw / sc <= aw && bh / sc <= ah; })[0];
      note.textContent = "Plan size " + fmtLen(bw) + " × " + fmtLen(bh) + ". " + (best ? "Biggest scale that fits: 1:" + best + "." : "Too big for 1:1000 on this paper.") + " Print at 100% (actual size) to keep the scale.";
    }
    [paper, orient].forEach(function (s) { s.addEventListener("change", upd); }); upd();
    m.appendChild(sheet);
    function close() { m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m); pdfBtn.focus();
  }

  function help() {
    var keys = [["V", "Select"], ["W", "Draw walls"], ["M", "Rooms"], ["D / I", "Door / window"], ["T", "Text label"], ["U", "Measure"], ["R", "Rotate furniture 90°"], ["Del", "Delete selection"],
      ["Ctrl+D", "Duplicate"], ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"], ["F", "Fit plan on screen"], ["+ / −", "Zoom"], ["Space + drag", "Move around"], ["Alt", "No snapping while held"], ["Enter / Esc", "Finish drawing / cancel"]];
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Keyboard shortcuts" });
    var sheet = h("div", { "class": "s3-sheet" }, [h("div", { "class": "row between" }, [h("h2", { text: "Keyboard shortcuts" }), btn("", close, "ghost icon", "x", "Close")]),
      h("div", { "class": "fp-keys" }, keys.map(function (k) { return h("div", { "class": "row" }, [h("kbd", { text: k[0] }), h("span", { "class": "muted", text: k[1] })]); }))]);
    m.appendChild(sheet);
    function close() { m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m); sheet.querySelector("button").focus();
  }


  // ---------- files and example ----------
  function replacePlan(p, msg) {
    var before = snapshot();
    plan = p; sel = null; past.push(before); future = []; saveSoon();
    $("#fp-name").value = plan.name; setTool("select"); fit();
    var t = S3.toast(msg + " ");
    t.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { undo(); $("#fp-name").value = plan.name; fit(); t.remove(); } }, ["Undo"]));
  }
  function newPlan() { replacePlan(blank(), "New plan"); }
  function savePlan() {
    S3.download(JSON.stringify(Object.assign({ app: "s3eidat-floor-plan", saved: new Date().toISOString() }, plan)), fileBase() + ".floorplan.json", "application/json");
    S3.done();
  }
  function openPlan() {
    var inp = h("input", { type: "file", accept: ".json,application/json", hidden: true });
    inp.addEventListener("change", function () {
      var f = inp.files[0]; inp.remove(); if (!f) return;
      S3.readFile(f, "text").then(function (txt) {
        var d; try { d = clean(JSON.parse(txt)); } catch (e) { d = null; }
        if (!d) return S3.toast("That isn't a Floor Plan file", "error");
        replacePlan(d, "Opened " + (d.name || "plan"));
      });
    });
    document.body.appendChild(inp); inp.click();
  }
  function example() {
    var W2 = function (x1, y1, x2, y2, t) { return { id: uid(), x1: x1, y1: y1, x2: x2, y2: y2, t: t }; };
    var walls = [W2(0, 0, 900, 0, 20), W2(900, 0, 900, 760, 20), W2(900, 760, 0, 760, 20), W2(0, 760, 0, 0, 20),
      W2(520, 0, 520, 420, 10), W2(520, 260, 900, 260, 10), W2(760, 260, 760, 420, 10), W2(0, 420, 900, 420, 10), W2(450, 420, 450, 760, 10)];
    function op(kind, wi, t, w, flip, hinge) { return { id: uid(), kind: kind, wall: walls[wi].id, t: t, w: w, flip: !!flip, hinge: !!hinge }; }
    function f(kind, x, y, rot) { return { id: uid(), kind: kind, x: x, y: y, w: FMAP[kind][2], d: FMAP[kind][3], rot: rot || 0 }; }
    function room(name, c, pts) { return { id: uid(), name: name, color: c, pts: pts }; }
    var p = clean({
      name: "Example flat", unit: plan.unit, walls: walls,
      rooms: [room("Living room", ROOM_COLORS[0], [[0, 0], [520, 0], [520, 420], [0, 420]]), room("Kitchen", ROOM_COLORS[2], [[520, 0], [900, 0], [900, 260], [520, 260]]),
        room("Bathroom", ROOM_COLORS[5], [[520, 260], [760, 260], [760, 420], [520, 420]]), room("Hall", ROOM_COLORS[6], [[760, 260], [900, 260], [900, 420], [760, 420]]),
        room("Bedroom", ROOM_COLORS[1], [[0, 420], [450, 420], [450, 760], [0, 760]]), room("Bedroom 2", ROOM_COLORS[4], [[450, 420], [900, 420], [900, 760], [450, 760]])],
      items: [op("door", 1, 340 / 760, 90, true), op("door", 7, 300 / 900, 80, true), op("door", 7, 610 / 900, 80, true, true), op("door", 6, .5, 70), op("door", 4, 150 / 420, 90),
        op("window", 0, 250 / 900, 160), op("window", 0, 700 / 900, 120), op("window", 3, 170 / 760, 140), op("window", 2, 250 / 900, 140), op("window", 2, 680 / 900, 140),
        f("sofa", 250, 360), f("coffee", 250, 260), f("tv", 250, 40), f("armchair", 90, 250, 90), f("round", 430, 110), f("chair", 430, 50), f("chair", 430, 170, 180),
        f("counter", 620, 40), f("sink", 720, 40), f("stove", 790, 40), f("fridge", 860, 45), f("toilet", 560, 300), f("basin", 640, 290), f("shower", 712, 372),
        f("bed2", 225, 650, 180), f("wardrobe", 380, 458), f("nightstand", 120, 728), f("bed1", 840, 650, 180), f("desk", 560, 718, 180), f("office", 560, 660), f("plant", 120, 40)]
    });
    replacePlan(p, "Example loaded");
  }

  // ---------- self-test (on copies; the real plan is put back) ----------
  window.S3_SELFTEST = async function () {
    var real = plan, ok = true;
    function expect(c) { if (!c) ok = false; }
    try {
      expect(clean(null) === null && clean({ walls: "x" }) === null);
      var c = clean({ walls: [{ id: "a", x1: 0, y1: 0, x2: 400, y2: 0, t: 999 }], items: [{ kind: "door", wall: "a", t: 2, w: 80 }, { kind: "door", wall: "gone" }, { kind: "spaceship" }, { kind: "label", x: 0, y: 0, text: "<b>x</b>" }],
        rooms: [{ pts: [[0, 0], [400, 0], [400, 300], [0, 300]], name: "R" }, { pts: [[0, 0]] }] });
      expect(c.walls[0].t === 60 && c.items.length === 2 && c.items[0].t === 1 && c.rooms.length === 1);
      expect(area(c.rooms[0].pts) === 120000 && centroid(c.rooms[0].pts)[0] === 200 && centroid(c.rooms[0].pts)[1] === 150);
      plan = c;
      var markup = '<svg xmlns="http://www.w3.org/2000/svg">' + planSvg({ px: 1, dims: true }) + "</svg>";
      var doc = new DOMParser().parseFromString(markup, "image/svg+xml");
      expect(!doc.getElementsByTagName("parsererror").length && markup.indexOf("<b>") < 0 && markup.indexOf("12.0 m²") > 0 && markup.indexOf("4.00 m") > 0);
      plan.unit = "ft"; expect(fmtLen(30.48 * 10) === "10′ 0″" && fmtArea(929.0304 * 50) === "50 ft²"); plan.unit = "m";
      // snapping: 15° steps and grid lengths from an anchor
      var sp = snap(103, 52, [0, 0], false);
      expect(Math.abs(Math.atan2(sp[1], sp[0]) * 180 / Math.PI - 30) < .05 && Math.abs(Math.hypot(sp[0], sp[1]) - 115) < .2);
      // PDF: one page with a valid cross-reference table
      var pg = await pdfPage("a4", "landscape", "fit", true);
      expect(pg.scale === 25 && pg.fits); // 460×360 cm with margins needs 1:25 on A4
      var small = document.createElement("canvas"); small.width = 40; small.height = 30;
      var j = await canvasJpeg(small), pdf = new Uint8Array(await buildPdf([{ w: 100, h: 80, px: [40, 30], jpeg: j }]).arrayBuffer()), txt = "";
      for (var i = 0; i < pdf.length; i++) txt += String.fromCharCode(pdf[i]);
      var sx = +/startxref\n(\d+)/.exec(txt)[1], xl = txt.slice(sx).split("\n"), cnt = +xl[1].split(" ")[1];
      for (var k = 1; k < cnt; k++) expect(txt.substr(+xl[2 + k].slice(0, 10), (k + " 0 obj").length) === k + " 0 obj");
    } catch (err) { ok = false; }
    plan = real;
    return ok;
  };

  // ---------- start ----------
  $("#fp-name").value = plan.name;
  $("#fp-name").addEventListener("input", function (e) { plan.name = e.target.value.slice(0, 80); saveSoon(); });
  toolbar();
  window.addEventListener("resize", S3.debounce(render, 100));
  requestAnimationFrame(function () { if (bounds(false)) fit(); else { view.s = Math.min(W() / 900, H() / 700); view.ox = -100; view.oy = -100; render(); } });
  window.FP = { plan: function () { return plan; }, clean: clean, area: area, planSvg: planSvg, pdfPage: pdfPage, buildPdf: buildPdf, fit: fit, view: view, setTool: setTool };
})();
