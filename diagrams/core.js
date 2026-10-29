/* Diagrams core: shapes, connection points, connector routing, text wrap, snapping, templates, file format,
   and a tiny PDF writer. No DOM, no network. Coordinates are canvas units (1 unit = 1 CSS px at 100% zoom). */
(function (root) {
  "use strict";

  function uid() {
    var a = new Uint8Array(6);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(a); else for (var i = 0; i < 6; i++) a[i] = Math.random() * 256;
    return Array.prototype.map.call(a, function (b) { return (b + 256).toString(16).slice(1); }).join("");
  }
  function r1(n) { return Math.round(n * 10) / 10; }

  // ---------- shapes ----------
  // path(w,h): outline; extra(w,h): stroke-only details; box(w,h): where text goes [x, y, w, h].
  var SHAPES = {
    rect: { name: "Rectangle", w: 140, h: 70, path: function (w, h) { return "M0 0H" + w + "V" + h + "H0Z"; } },
    rounded: { name: "Rounded rectangle", w: 140, h: 70, path: function (w, h) { var r = Math.min(12, w / 4, h / 4); return rrect(w, h, r); } },
    terminator: { name: "Start / end", w: 140, h: 56, path: function (w, h) { return rrect(w, h, Math.min(h, w) / 2); }, box: function (w, h) { var p = Math.min(h, w) / 4; return [p, 0, w - 2 * p, h]; } },
    ellipse: { name: "Ellipse", w: 140, h: 80, path: ellipse, box: function (w, h) { return [w * 0.15, h * 0.15, w * 0.7, h * 0.7]; } },
    circle: { name: "Circle", w: 90, h: 90, path: ellipse, box: function (w, h) { return [w * 0.15, h * 0.15, w * 0.7, h * 0.7]; } },
    diamond: { name: "Decision", w: 140, h: 90, path: function (w, h) { return "M" + w / 2 + " 0L" + w + " " + h / 2 + "L" + w / 2 + " " + h + "L0 " + h / 2 + "Z"; },
      box: function (w, h) { return [w / 4, h / 4, w / 2, h / 2]; } },
    parallelogram: { name: "Input / output", w: 150, h: 70, path: function (w, h) { var s = Math.min(w * 0.2, h * 0.5); return "M" + s + " 0H" + w + "L" + (w - s) + " " + h + "H0Z"; },
      box: function (w, h) { var s = Math.min(w * 0.2, h * 0.5); return [s * 0.8, 0, w - s * 1.6, h]; } },
    document: { name: "Document", w: 140, h: 80, path: function (w, h) {
      return "M0 0H" + w + "V" + r1(h * 0.84) + "C" + r1(w * 0.72) + " " + r1(h * 0.66) + " " + r1(w * 0.42) + " " + r1(h * 1.06) + " 0 " + r1(h * 0.9) + "Z"; },
      box: function (w, h) { return [0, 0, w, h * 0.82]; } },
    database: { name: "Database", w: 110, h: 90, path: function (w, h) { var ry = Math.min(h * 0.15, 14);
      return "M0 " + ry + "A" + w / 2 + " " + ry + " 0 0 1 " + w + " " + ry + "V" + (h - ry) + "A" + w / 2 + " " + ry + " 0 0 1 0 " + (h - ry) + "Z"; },
      extra: function (w, h) { var ry = Math.min(h * 0.15, 14); return "M0 " + ry + "A" + w / 2 + " " + ry + " 0 0 0 " + w + " " + ry; },
      box: function (w, h) { var ry = Math.min(h * 0.15, 14); return [0, ry * 2, w, h - ry * 3]; } },
    hexagon: { name: "Preparation", w: 140, h: 70, path: function (w, h) { var s = Math.min(w * 0.2, h / 2);
      return "M" + s + " 0H" + (w - s) + "L" + w + " " + h / 2 + "L" + (w - s) + " " + h + "H" + s + "L0 " + h / 2 + "Z"; },
      box: function (w, h) { var s = Math.min(w * 0.2, h / 2); return [s * 0.7, 0, w - s * 1.4, h]; } },
    triangle: { name: "Triangle", w: 110, h: 90, path: function (w, h) { return "M" + w / 2 + " 0L" + w + " " + h + "H0Z"; }, box: function (w, h) { return [w * 0.22, h * 0.45, w * 0.56, h * 0.5]; } },
    note: { name: "Note", w: 130, h: 100, path: function (w, h) { var f = Math.min(16, w / 4, h / 4); return "M0 0H" + (w - f) + "L" + w + " " + f + "V" + h + "H0Z"; },
      extra: function (w, h) { var f = Math.min(16, w / 4, h / 4); return "M" + (w - f) + " 0V" + f + "H" + w; } },
    text: { name: "Text", w: 140, h: 40, path: function (w, h) { return "M0 0H" + w + "V" + h + "H0Z"; } },
    entity: { name: "Entity (table)", w: 170, h: 120, path: function (w, h) { return rrect(w, h, 4); },
      extra: function (w, h) { return "M0 " + ENTITY_HEAD + "H" + w; } },
    actor: { name: "Actor", w: 50, h: 90, path: function (w, h) { return "M0 0H" + w + "V" + h + "H0Z"; },
      extra: function (w, h) {
        var r = Math.min(w, h) * 0.18, cx = w / 2, hy = r + 1, neck = hy + r, hip = h * 0.66, arm = neck + (hip - neck) * 0.3;
        return "M" + (cx - r) + " " + hy + "A" + r + " " + r + " 0 1 0 " + (cx + r) + " " + hy + "A" + r + " " + r + " 0 1 0 " + (cx - r) + " " + hy +
          "M" + cx + " " + neck + "V" + r1(hip) + "M" + w * 0.12 + " " + r1(arm) + "H" + w * 0.88 + "M" + cx + " " + r1(hip) + "L" + w * 0.15 + " " + (h - 1) + "M" + cx + " " + r1(hip) + "L" + w * 0.85 + " " + (h - 1);
      } }
  };
  var ENTITY_HEAD = 30;
  var ORDER = ["rect", "rounded", "terminator", "diamond", "parallelogram", "document", "database", "hexagon", "ellipse", "circle", "triangle", "note", "entity", "actor", "text"];
  function rrect(w, h, r) {
    return "M" + r + " 0H" + (w - r) + "A" + r + " " + r + " 0 0 1 " + w + " " + r + "V" + (h - r) + "A" + r + " " + r + " 0 0 1 " + (w - r) + " " + h +
      "H" + r + "A" + r + " " + r + " 0 0 1 0 " + (h - r) + "V" + r + "A" + r + " " + r + " 0 0 1 " + r + " 0Z";
  }
  function ellipse(w, h) { return "M0 " + h / 2 + "A" + w / 2 + " " + h / 2 + " 0 1 0 " + w + " " + h / 2 + "A" + w / 2 + " " + h / 2 + " 0 1 0 0 " + h / 2 + "Z"; }
  function textBox(s) {
    var d = SHAPES[s.type] || SHAPES.rect;
    if (s.type === "actor") return [-40, s.h + 2, s.w + 80, 40];
    var b = d.box ? d.box(s.w, s.h) : [0, 0, s.w, s.h];
    return [s.x + b[0] + 8, s.y + b[1] + 4, Math.max(10, b[2] - 16), Math.max(10, b[3] - 8)];
  }

  var DEFAULT_STYLE = { fill: "#ffffff", stroke: "#334155", sw: 2, dash: false, color: "#0f172a", fs: 15, bold: false, align: "center" };
  function newShape(type, x, y, over) {
    var d = SHAPES[type] || SHAPES.rect;
    var s = { id: uid(), type: SHAPES[type] ? type : "rect", x: Math.round(x), y: Math.round(y), w: d.w, h: d.h, text: "" };
    for (var k in DEFAULT_STYLE) s[k] = DEFAULT_STYLE[k];
    if (type === "text") { s.fill = "none"; s.stroke = "none"; s.text = "Text"; }
    if (type === "note") s.fill = "#fef3c7";
    if (type === "actor") { s.fill = "none"; s.text = "Actor"; }
    if (type === "entity") { s.text = "Entity\nid\nname"; s.align = "left"; }
    for (var o in over || {}) s[o] = over[o];
    return s;
  }
  function newLink(a, b, over) {
    var l = { id: uid(), a: a, b: b, style: "elbow", arrA: "none", arrB: "arrow", stroke: "#334155", sw: 2, dash: false, text: "", color: "#0f172a", fs: 13 };
    for (var o in over || {}) l[o] = over[o];
    return l;
  }

  // ---------- connection points ----------
  var DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  function port(s, side) {
    if (side === "n") return { x: s.x + s.w / 2, y: s.y };
    if (side === "s") return { x: s.x + s.w / 2, y: s.y + s.h };
    if (side === "e") return { x: s.x + s.w, y: s.y + s.h / 2 };
    return { x: s.x, y: s.y + s.h / 2 };
  }
  function center(s) { return { x: s.x + s.w / 2, y: s.y + s.h / 2 }; }
  // The side of shape s that faces point p.
  function facing(s, p) {
    var c = center(s), dx = (p.x - c.x) / Math.max(1, s.w), dy = (p.y - c.y) / Math.max(1, s.h);
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "e" : "w") : (dy > 0 ? "s" : "n");
  }
  function nearestPort(s, p, maxDist) {
    var best = null, bd = maxDist == null ? Infinity : maxDist;
    ["n", "e", "s", "w"].forEach(function (k) { var q = port(s, k), d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = k; } });
    return best;
  }

  // ---------- connector routing ----------
  function endPoint(doc, end, other, byId) {
    var s = end.id ? byId[end.id] : null;
    if (!s) return { p: { x: end.x || 0, y: end.y || 0 }, d: null, s: null };
    var target = other.id && byId[other.id] ? center(byId[other.id]) : { x: other.x || 0, y: other.y || 0 };
    var side = end.side && DIRS[end.side] ? end.side : facing(s, target);
    return { p: port(s, side), d: DIRS[side], s: s, side: side };
  }
  var GAP = 22;
  function route(doc, l, byId) {
    byId = byId || indexShapes(doc);
    var A = endPoint(doc, l.a, l.b, byId), Bp = endPoint(doc, l.b, l.a, byId);
    // a free end aims at the attached end's center so "auto" sides look natural
    var p1 = A.p, p2 = Bp.p, pts;
    if (l.style === "straight") pts = [p1, p2];
    else if (l.style === "curved") {
      var dist = Math.hypot(p2.x - p1.x, p2.y - p1.y), k = Math.max(30, dist / 2.5);
      var c1 = A.d ? { x: p1.x + A.d[0] * k, y: p1.y + A.d[1] * k } : { x: (p1.x * 2 + p2.x) / 3, y: (p1.y * 2 + p2.y) / 3 };
      var c2 = Bp.d ? { x: p2.x + Bp.d[0] * k, y: p2.y + Bp.d[1] * k } : { x: (p1.x + p2.x * 2) / 3, y: (p1.y + p2.y * 2) / 3 };
      return { pts: [p1, c1, c2, p2], curved: true, d: "M" + r1(p1.x) + " " + r1(p1.y) + "C" + r1(c1.x) + " " + r1(c1.y) + " " + r1(c2.x) + " " + r1(c2.y) + " " + r1(p2.x) + " " + r1(p2.y),
        endA: { at: p1, from: c1 }, endB: { at: p2, from: c2 }, mid: bez(p1, c1, c2, p2, 0.5) };
    } else pts = elbow(p1, A.d, p2, Bp.d);
    pts = simplify(pts);
    return { pts: pts, d: pts.map(function (p, i) { return (i ? "L" : "M") + r1(p.x) + " " + r1(p.y); }).join(""),
      endA: { at: pts[0], from: pts[1] }, endB: { at: pts[pts.length - 1], from: pts[pts.length - 2] }, mid: midOf(pts) };
  }
  function elbow(p1, d1, p2, d2) {
    var s = d1 ? { x: p1.x + d1[0] * GAP, y: p1.y + d1[1] * GAP } : p1;
    var e = d2 ? { x: p2.x + d2[0] * GAP, y: p2.y + d2[1] * GAP } : p2;
    var h1 = d1 ? d1[0] !== 0 : Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y);
    var h2 = d2 ? d2[0] !== 0 : !h1;
    var mid;
    if (h1 && h2) { var mx = (s.x + e.x) / 2; mid = [{ x: mx, y: s.y }, { x: mx, y: e.y }]; }
    else if (!h1 && !h2) { var my = (s.y + e.y) / 2; mid = [{ x: s.x, y: my }, { x: e.x, y: my }]; }
    else if (h1) mid = [{ x: e.x, y: s.y }];
    else mid = [{ x: s.x, y: e.y }];
    // facing ports with room between them: no stubs needed
    return [p1, s].concat(mid, [e, p2]);
  }
  function simplify(pts) {
    var out = [];
    pts.forEach(function (p) {
      var q = { x: r1(p.x), y: r1(p.y) };
      if (out.length && out[out.length - 1].x === q.x && out[out.length - 1].y === q.y) return;
      out.push(q);
    });
    // drop middle points that sit on a straight line
    for (var i = out.length - 2; i > 0; i--) {
      var a = out[i - 1], b = out[i], c = out[i + 1];
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) {
        // keep a point that reverses direction (a doubled-back stub) only if removing it changes the shape
        var back = (a.x === b.x && (b.y - a.y) * (c.y - b.y) < 0) || (a.y === b.y && (b.x - a.x) * (c.x - b.x) < 0);
        if (!back) out.splice(i, 1);
      }
    }
    if (out.length === 1) out.push({ x: out[0].x, y: out[0].y });
    return out;
  }
  function midOf(pts) {
    var len = 0, i, segs = [];
    for (i = 1; i < pts.length; i++) { var d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); segs.push(d); len += d; }
    var half = len / 2;
    for (i = 0; i < segs.length; i++) {
      if (half <= segs[i] || i === segs.length - 1) { var t = segs[i] ? half / segs[i] : 0; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }; }
      half -= segs[i];
    }
    return pts[0];
  }
  function bez(a, b, c, d, t) {
    var u = 1 - t;
    return { x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x, y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y };
  }
  // Arrowhead outline at `at`, pointing away from `from`. kind: arrow | open | diamond | circle | bar | crow (ER "many")
  function arrowHead(kind, at, from, sw) {
    if (!kind || kind === "none") return null;
    var dx = at.x - from.x, dy = at.y - from.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, size = 9 + sw * 1.5, half = size * 0.5;
    var bx = at.x - ux * size, by = at.y - uy * size, px = -uy, py = ux;
    var P = function (x, y) { return r1(x) + " " + r1(y); };
    if (kind === "arrow" || kind === "open")
      return { d: "M" + P(bx + px * half, by + py * half) + "L" + P(at.x, at.y) + "L" + P(bx - px * half, by - py * half) + (kind === "arrow" ? "Z" : ""), fill: kind === "arrow" };
    if (kind === "diamond") {
      var mx = at.x - ux * size, my = at.y - uy * size, ex = at.x - ux * size * 2, ey = at.y - uy * size * 2;
      return { d: "M" + P(at.x, at.y) + "L" + P(mx + px * half, my + py * half) + "L" + P(ex, ey) + "L" + P(mx - px * half, my - py * half) + "Z", fill: true };
    }
    if (kind === "circle") { var cx = at.x - ux * half, cy = at.y - uy * half; return { d: "M" + P(cx - half, cy) + "A" + half + " " + half + " 0 1 0 " + P(cx + half, cy) + "A" + half + " " + half + " 0 1 0 " + P(cx - half, cy), fill: false }; }
    if (kind === "crow") {
      var fx = at.x - ux * size * 1.3, fy = at.y - uy * size * 1.3;
      return { d: "M" + P(fx, fy) + "L" + P(at.x + px * half * 1.2, at.y + py * half * 1.2) + "M" + P(fx, fy) + "L" + P(at.x, at.y) + "M" + P(fx, fy) + "L" + P(at.x - px * half * 1.2, at.y - py * half * 1.2), fill: false };
    }
    if (kind === "bar") return { d: "M" + P(bx + px * half, by + py * half) + "L" + P(bx - px * half, by - py * half), fill: false };
    return null;
  }

  // ---------- text ----------
  // Wrap text into lines that fit maxW. measure(str) returns its width at the shape's font.
  function wrap(text, maxW, measure) {
    var out = [];
    String(text || "").split("\n").forEach(function (para) {
      var words = para.split(/(\s+)/), line = "";
      if (!para.trim()) { out.push(""); return; }
      words.forEach(function (w) {
        if (!w) return;
        var test = line + w;
        if (measure(test.trim()) <= maxW || !line.trim()) {
          if (measure(test.trim()) > maxW && !/\s/.test(w)) {
            // a single word longer than the line: break it by characters
            var chunk = line;
            for (var i = 0; i < w.length; i++) {
              if (measure((chunk + w[i]).trim()) > maxW && chunk.trim()) { out.push(chunk.trim()); chunk = ""; }
              chunk += w[i];
            }
            line = chunk;
          } else line = test;
        } else { out.push(line.trim()); line = /\s/.test(w) ? "" : w; }
      });
      out.push(line.trim());
    });
    return out;
  }

  // ---------- geometry helpers ----------
  function indexShapes(doc) { var m = {}; doc.shapes.forEach(function (s) { m[s.id] = s; }); return m; }
  function bbox(list) {
    if (!list.length) return null;
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    list.forEach(function (b) { x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  // Bounds of everything (shapes, connector paths, actor labels) for export and "fit".
  function contentBounds(doc) {
    var boxes = doc.shapes.map(function (s) { return s.type === "actor" ? { x: s.x - 40, y: s.y, w: s.w + 80, h: s.h + 44 } : s; });
    var byId = indexShapes(doc);
    doc.links.forEach(function (l) {
      var r = route(doc, l, byId);
      r.pts.forEach(function (p) { boxes.push({ x: p.x - 10, y: p.y - 10, w: 20, h: 20 }); });
      if (l.text) boxes.push({ x: r.mid.x - 60, y: r.mid.y - 14, w: 120, h: 28 });
    });
    return bbox(boxes);
  }
  function intersects(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  // Snap a moving box to other boxes' edges and centres (within tol). Returns {dx, dy, guides:[{x}|{y}]}.
  function snap(box, others, tol) {
    var xs = [box.x, box.x + box.w / 2, box.x + box.w], ys = [box.y, box.y + box.h / 2, box.y + box.h];
    var bestX = null, bestY = null;
    others.forEach(function (o) {
      [o.x, o.x + o.w / 2, o.x + o.w].forEach(function (t) {
        xs.forEach(function (v) { var d = t - v; if (Math.abs(d) <= tol && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d: d, at: t }; });
      });
      [o.y, o.y + o.h / 2, o.y + o.h].forEach(function (t) {
        ys.forEach(function (v) { var d = t - v; if (Math.abs(d) <= tol && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d: d, at: t }; });
      });
    });
    var guides = [];
    if (bestX) guides.push({ x: bestX.at });
    if (bestY) guides.push({ y: bestY.at });
    return { dx: bestX ? bestX.d : null, dy: bestY ? bestY.d : null, guides: guides };
  }
  // Align / distribute a list of shapes. how: left|center|right|top|middle|bottom|hspace|vspace
  function align(list, how) {
    if (list.length < 2) return;
    var b = bbox(list);
    if (how === "hspace" || how === "vspace") {
      if (list.length < 3) return;
      var hz = how === "hspace", sorted = list.slice().sort(function (p, q) { return hz ? p.x - q.x : p.y - q.y; });
      var total = sorted.reduce(function (a, s) { return a + (hz ? s.w : s.h); }, 0), gap = ((hz ? b.w : b.h) - total) / (sorted.length - 1), pos = hz ? b.x : b.y;
      sorted.forEach(function (s) { if (hz) s.x = Math.round(pos); else s.y = Math.round(pos); pos += (hz ? s.w : s.h) + gap; });
      return;
    }
    list.forEach(function (s) {
      if (how === "left") s.x = b.x; else if (how === "right") s.x = b.x + b.w - s.w; else if (how === "center") s.x = Math.round(b.x + b.w / 2 - s.w / 2);
      else if (how === "top") s.y = b.y; else if (how === "bottom") s.y = b.y + b.h - s.h; else if (how === "middle") s.y = Math.round(b.y + b.h / 2 - s.h / 2);
    });
  }

  // ---------- document ----------
  function newDoc(name) { return { app: "s3-diagrams", v: 1, id: uid(), name: name || "Untitled diagram", shapes: [], links: [], grid: true, updated: Date.now() }; }
  var COLOR = /^(#[0-9a-fA-F]{3,8}|none)$/;
  function normalize(o) {
    if (!o || o.app !== "s3-diagrams" || !Array.isArray(o.shapes)) throw new Error("Not a diagram file");
    var num = function (v, d, lo, hi) { v = Number(v); if (!isFinite(v)) v = d; return Math.min(hi, Math.max(lo, v)); };
    var str = function (v, max) { return String(v == null ? "" : v).slice(0, max); };
    var col = function (v, d) { return COLOR.test(String(v)) ? String(v) : d; };
    var d = newDoc(str(o.name, 120) || "Untitled diagram");
    d.id = str(o.id, 40) || d.id; d.grid = o.grid !== false; d.updated = num(o.updated, Date.now(), 0, 1e15);
    var ids = {};
    o.shapes.forEach(function (s) {
      if (!s || !SHAPES[s.type] || !s.id || ids[s.id]) return;
      ids[s.id] = 1;
      d.shapes.push({ id: str(s.id, 40), type: s.type, x: num(s.x, 0, -1e6, 1e6), y: num(s.y, 0, -1e6, 1e6), w: num(s.w, 100, 4, 1e5), h: num(s.h, 60, 4, 1e5),
        text: str(s.text, 5000), fill: col(s.fill, DEFAULT_STYLE.fill), stroke: col(s.stroke, DEFAULT_STYLE.stroke), sw: num(s.sw, 2, 0, 20), dash: !!s.dash,
        color: col(s.color, DEFAULT_STYLE.color), fs: num(s.fs, 15, 6, 120), bold: !!s.bold, align: ["left", "center", "right"].indexOf(s.align) >= 0 ? s.align : "center", locked: !!s.locked });
    });
    var end = function (e) {
      e = e || {};
      if (e.id && ids[e.id]) return { id: str(e.id, 40), side: DIRS[e.side] ? e.side : null };
      return { x: num(e.x, 0, -1e6, 1e6), y: num(e.y, 0, -1e6, 1e6) };
    };
    (o.links || []).forEach(function (l) {
      if (!l || !l.id) return;
      d.links.push({ id: str(l.id, 40), a: end(l.a), b: end(l.b), style: ["elbow", "straight", "curved"].indexOf(l.style) >= 0 ? l.style : "elbow",
        arrA: ARROWS.indexOf(l.arrA) >= 0 ? l.arrA : "none", arrB: ARROWS.indexOf(l.arrB) >= 0 ? l.arrB : "arrow",
        stroke: col(l.stroke, "#334155"), sw: num(l.sw, 2, 0.5, 20), dash: !!l.dash, text: str(l.text, 500), color: col(l.color, "#0f172a"), fs: num(l.fs, 13, 6, 80) });
    });
    return d;
  }
  var ARROWS = ["none", "arrow", "open", "diamond", "circle", "bar", "crow"];
  // Remove shapes (by id) and anything attached: links to them keep a free end where the shape was.
  function removeShapes(doc, ids) {
    var gone = {}; ids.forEach(function (i) { gone[i] = 1; });
    var byId = indexShapes(doc);
    // a link between two deleted shapes goes too; a link to one deleted shape keeps a loose end where it was
    doc.links = doc.links.filter(function (l) { return !(l.a.id && gone[l.a.id] && l.b.id && gone[l.b.id]); });
    doc.links.forEach(function (l) {
      ["a", "b"].forEach(function (k) {
        var e = l[k];
        if (e.id && gone[e.id]) { var s = byId[e.id], other = l[k === "a" ? "b" : "a"], o = other.id && byId[other.id] ? center(byId[other.id]) : other;
          var p = port(s, e.side || facing(s, o)); l[k] = { x: p.x, y: p.y }; }
      });
    });
    doc.shapes = doc.shapes.filter(function (s) { return !gone[s.id]; });
  }
  // Deep copy of shapes + links among them, with new ids, offset by (dx, dy).
  function cloneSelection(doc, shapeIds, linkIds, dx, dy) {
    var map = {}, shapes = [], links = [], sel = {}; shapeIds.forEach(function (i) { sel[i] = 1; });
    doc.shapes.forEach(function (s) { if (sel[s.id]) { var c = JSON.parse(JSON.stringify(s)); c.id = uid(); c.x += dx; c.y += dy; map[s.id] = c.id; shapes.push(c); } });
    doc.links.forEach(function (l) {
      var inSel = linkIds.indexOf(l.id) >= 0 || (l.a.id && sel[l.a.id] && l.b.id && sel[l.b.id]);
      if (!inSel) return;
      var c = JSON.parse(JSON.stringify(l)); c.id = uid();
      ["a", "b"].forEach(function (k) {
        if (c[k].id) { if (map[c[k].id]) c[k].id = map[c[k].id]; else { var s = indexShapes(doc)[c[k].id], p = port(s, c[k].side || "e"); c[k] = { x: p.x + dx, y: p.y + dy }; } }
        else { c[k].x += dx; c[k].y += dy; }
      });
      links.push(c);
    });
    return { shapes: shapes, links: links };
  }

  // ---------- templates ----------
  function templates() {
    return {
      flowchart: { name: "Flowchart", build: function () {
        var d = newDoc("Flowchart"), S = function (t, x, y, text, o) { var s = newShape(t, x, y, o); s.text = text; d.shapes.push(s); return s; };
        var a = S("terminator", 200, 20, "Start", { fill: "#dcfce7" }), b = S("parallelogram", 195, 120, "Get order"), c = S("diamond", 200, 230, "In stock?", { fill: "#fef9c3" });
        var e = S("rect", 200, 370, "Ship order"), f = S("rect", 420, 240, "Order from supplier"), g = S("terminator", 200, 480, "End", { fill: "#fee2e2" });
        var L = function (p, q, t, o) { d.links.push(newLink({ id: p.id }, { id: q.id }, Object.assign({ text: t || "" }, o || {}))); };
        L(a, b); L(b, c); L(c, e, "Yes"); L(c, f, "No"); L(e, g);
        d.links.push(newLink({ id: f.id, side: "n" }, { id: b.id, side: "e" }, { dash: true }));
        return d;
      } },
      org: { name: "Org chart", build: function () {
        var d = newDoc("Org chart"), S = function (x, y, text, fill) { var s = newShape("rounded", x, y, { fill: fill || "#ffffff", w: 160, h: 64 }); s.text = text; d.shapes.push(s); return s; };
        var ceo = S(0, 20, "Name\nDirector", "#e0f2fe");
        ["Operations", "Finance", "Sales"].forEach(function (team, k) {
          var m1 = S(20 + 2 * k * 140, 290, "Name\nTeam member", "#f8fafc"), m2 = S(20 + (2 * k + 1) * 140, 290, "Name\nTeam member", "#f8fafc");
          m1.w = m2.w = 125;
          var h = S((m1.x + m2.x + 125) / 2 - 80, 155, "Name\n" + team);
          d.links.push(newLink({ id: ceo.id, side: "s" }, { id: h.id, side: "n" }, { arrB: "none" }));
          [m1, m2].forEach(function (m) { d.links.push(newLink({ id: h.id, side: "s" }, { id: m.id, side: "n" }, { arrB: "none" })); });
        });
        ceo.x = 20 + (6 * 140 - 15) / 2 - 80;
        return d;
      } },
      er: { name: "ER diagram", build: function () {
        var d = newDoc("ER diagram"), S = function (x, y, text, h) { var s = newShape("entity", x, y, { h: h || 130, w: 180 }); s.text = text; d.shapes.push(s); return s; };
        var cu = S(20, 40, "Customer\nid  (PK)\nname\nemail\nphone"), or = S(320, 40, "Order\nid  (PK)\ncustomer_id  (FK)\ncreated_at\ntotal", 140),
          it = S(320, 250, "OrderItem\nid  (PK)\norder_id  (FK)\nproduct_id  (FK)\nquantity", 140), pr = S(620, 250, "Product\nid  (PK)\nname\nprice");
        var L = function (p, q, t) { d.links.push(newLink({ id: p.id }, { id: q.id }, { arrA: "bar", arrB: "crow", text: t, style: "elbow" })); };
        L(cu, or, "places"); L(or, it, "contains"); L(pr, it, "in");
        return d;
      } }
    };
  }

  // ---------- tiny PDF writer: one page with one JPEG image ----------
  function pdfWithJpeg(jpeg, imgW, imgH, pageW, pageH) {
    var enc = new TextEncoder(), parts = [], offsets = [], len = 0;
    function add(x) { var b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; }
    function obj(n, body) { offsets[n] = len; add(n + " 0 obj\n"); body(); add("\nendobj\n"); }
    var content = "q " + pageW.toFixed(2) + " 0 0 " + pageH.toFixed(2) + " 0 0 cm /Im0 Do Q";
    add("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    obj(1, function () { add("<< /Type /Catalog /Pages 2 0 R >>"); });
    obj(2, function () { add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"); });
    obj(3, function () { add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pageW.toFixed(2) + " " + pageH.toFixed(2) + "] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>"); });
    obj(4, function () { add("<< /Type /XObject /Subtype /Image /Width " + imgW + " /Height " + imgH + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n"); add(jpeg); add("\nendstream"); });
    obj(5, function () { add("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream"); });
    var xref = len, x = "xref\n0 6\n0000000000 65535 f \n";
    for (var i = 1; i <= 5; i++) x += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    add(x + "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
    var out = new Uint8Array(len), o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }

  var API = {
    uid: uid, SHAPES: SHAPES, ORDER: ORDER, ENTITY_HEAD: ENTITY_HEAD, DEFAULT_STYLE: DEFAULT_STYLE, ARROWS: ARROWS, DIRS: DIRS,
    newShape: newShape, newLink: newLink, textBox: textBox, port: port, center: center, facing: facing, nearestPort: nearestPort,
    route: route, arrowHead: arrowHead, wrap: wrap, indexShapes: indexShapes, bbox: bbox, contentBounds: contentBounds, intersects: intersects,
    snap: snap, align: align, newDoc: newDoc, normalize: normalize, removeShapes: removeShapes, cloneSelection: cloneSelection,
    templates: templates, pdfWithJpeg: pdfWithJpeg
  };
  root.DiagramCore = API;
  if (typeof module === "object" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
