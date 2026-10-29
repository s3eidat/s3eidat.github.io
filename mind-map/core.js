/* Mind Map core: tree model and edits, balanced left/right layout, outline (Markdown / indented text) and
   FreeMind import, Markdown export. No DOM needed (FreeMind import uses DOMParser when present). */
(function (root) {
  "use strict";

  function uid() {
    var a = new Uint8Array(6);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(a); else for (var i = 0; i < 6; i++) a[i] = Math.random() * 256;
    return Array.prototype.map.call(a, function (b) { return (b + 256).toString(16).slice(1); }).join("");
  }
  var BRANCH = ["#0e9f9a", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#dc2626", "#4f46e5"];
  var ICONS = ["✅", "⭐", "❗", "❓", "💡", "🔥", "📅", "📌", "👍", "👎", "⚠️", "🎯", "💰", "📞", "📝", "🚀", "❤️", "🙂"];

  function node(text, kids) { return { id: uid(), text: text == null ? "" : String(text), children: kids || [], col: false }; }
  function newMap(title) { return { app: "s3-mindmap", v: 1, id: uid(), name: title || "Untitled map", theme: "light", root: node(title || "Central topic"), updated: Date.now() }; }

  // ---------- walking ----------
  function walk(n, fn, parent, depth) { fn(n, parent || null, depth || 0); n.children.forEach(function (c) { walk(c, fn, n, (depth || 0) + 1); }); }
  function index(m) { var by = {}, par = {}, dep = {}; walk(m.root, function (n, p, d) { by[n.id] = n; par[n.id] = p ? p.id : null; dep[n.id] = d; }); return { by: by, par: par, dep: dep }; }
  function find(m, id) { return index(m).by[id] || null; }
  function parentOf(m, id) { var ix = index(m); return ix.par[id] ? ix.by[ix.par[id]] : null; }
  function isAncestor(m, a, b) { var ix = index(m), p = ix.par[b]; while (p) { if (p === a) return true; p = ix.par[p]; } return false; }
  function count(n) { var c = 1; n.children.forEach(function (k) { c += count(k); }); return c; }
  // main branch (child of root) a node belongs to
  function branchOf(m, id) { var ix = index(m), cur = id; while (ix.par[cur] && ix.par[cur] !== m.root.id) cur = ix.par[cur]; return ix.par[cur] ? cur : null; }

  // ---------- edits ----------
  function addChild(m, pid, text) {
    var p = find(m, pid); if (!p) return null;
    var n = node(text || ""); p.children.push(n); p.col = false;
    return n;
  }
  function addSibling(m, id, text) {
    var p = parentOf(m, id); if (!p) return addChild(m, id, text);
    var n = node(text || ""), i = p.children.findIndex(function (c) { return c.id === id; });
    var me = p.children[i]; if (p === m.root && me.side) n.side = me.side;
    p.children.splice(i + 1, 0, n);
    return n;
  }
  function remove(m, id) {
    var p = parentOf(m, id); if (!p) return null;
    var i = p.children.findIndex(function (c) { return c.id === id; });
    p.children.splice(i, 1);
    return p.children[i] || p.children[i - 1] || p;
  }
  function moveTo(m, id, newParent, at) {
    if (id === m.root.id || id === newParent || isAncestor(m, id, newParent)) return false;
    var p = parentOf(m, id), np = find(m, newParent); if (!p || !np) return false;
    var i = p.children.findIndex(function (c) { return c.id === id; }), n = p.children.splice(i, 1)[0];
    if (np !== m.root) delete n.side;
    if (at == null || at > np.children.length) np.children.push(n); else np.children.splice(at, 0, n);
    np.col = false;
    return true;
  }
  function reorder(m, id, dir) {
    var p = parentOf(m, id); if (!p) return false;
    var i = p.children.findIndex(function (c) { return c.id === id; }), j = i + dir;
    if (j < 0 || j >= p.children.length) return false;
    var t = p.children[i]; p.children[i] = p.children[j]; p.children[j] = t;
    return true;
  }

  // ---------- layout ----------
  // size(n) returns {w, h} for a node's box. Returns positions {id: {x, y, w, h, side, depth, color}} with the root
  // at (0, 0) (box centres), plus overall bounds.
  function layout(m, size, opt) {
    opt = opt || {};
    var HG = opt.hgap || 46, VG = opt.vgap || 12, out = {}, sizes = {};
    walk(m.root, function (n) { sizes[n.id] = size(n); });
    function visKids(n) { return n.col ? [] : n.children; }
    var heights = {};
    function sub(n) {
      var kids = visKids(n), s = sizes[n.id];
      if (!kids.length) return (heights[n.id] = s.h);
      var t = kids.reduce(function (a, k) { return a + sub(k); }, 0) + VG * (kids.length - 1);
      return (heights[n.id] = Math.max(s.h, t));
    }
    // main branches: an explicit side wins, others go where there is less height so far (right first)
    var left = [], right = [], lh = 0, rh = 0;
    visKids(m.root).forEach(function (k) { sub(k); });
    visKids(m.root).forEach(function (k, i) {
      var side = k.side === "l" || k.side === "r" ? k.side : (rh <= lh ? "r" : "l");
      if (side === "r") { right.push(k); rh += heights[k.id] + VG * 2; } else { left.push(k); lh += heights[k.id] + VG * 2; }
    });
    var rs = sizes[m.root.id];
    out[m.root.id] = { x: 0, y: 0, w: rs.w, h: rs.h, side: null, depth: 0, color: null };
    function place(list, side) {
      var total = list.reduce(function (a, k) { return a + heights[k.id]; }, 0) + VG * 2 * Math.max(0, list.length - 1);
      var y = -total / 2;
      list.forEach(function (k, i) {
        var color = k.color || BRANCH[m.root.children.indexOf(k) % BRANCH.length];
        put(k, side, y + heights[k.id] / 2, rs.w / 2 + HG * 1.4, 1, color);
        y += heights[k.id] + VG * 2;
      });
    }
    function put(n, side, cy, dxFromParentEdge, depth, color, parentPos) {
      var s = sizes[n.id], px = parentPos ? parentPos.x + (side === "r" ? parentPos.w / 2 : -parentPos.w / 2) : 0;
      var cx = side === "r" ? px + dxFromParentEdge + s.w / 2 : px - dxFromParentEdge - s.w / 2;
      if (!parentPos) cx = side === "r" ? dxFromParentEdge + s.w / 2 : -dxFromParentEdge - s.w / 2;
      var pos = out[n.id] = { x: cx, y: cy, w: s.w, h: s.h, side: side, depth: depth, color: n.color || color };
      var kids = visKids(n); if (!kids.length) return;
      var total = kids.reduce(function (a, k) { return a + heights[k.id]; }, 0) + VG * (kids.length - 1), y = cy - total / 2;
      kids.forEach(function (k) { put(k, side, y + heights[k.id] / 2, HG, depth + 1, k.color || pos.color, pos); y += heights[k.id] + VG; });
    }
    place(right, "r"); place(left, "l");
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    Object.keys(out).forEach(function (k) { var p = out[k]; x1 = Math.min(x1, p.x - p.w / 2); x2 = Math.max(x2, p.x + p.w / 2); y1 = Math.min(y1, p.y - p.h / 2); y2 = Math.max(y2, p.y + p.h / 2); });
    return { pos: out, bounds: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } };
  }
  // Wrap text into lines no wider than maxW (measure(str) gives a width).
  function wrap(text, maxW, measure) {
    var out = [];
    String(text || "").split("\n").forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean), line = "";
      if (!words.length) { out.push(""); return; }
      words.forEach(function (w) {
        var t = line ? line + " " + w : w;
        if (measure(t) <= maxW || !line) {
          if (!line && measure(w) > maxW) { // break a long word
            var chunk = ""; for (var i = 0; i < w.length; i++) { if (measure(chunk + w[i]) > maxW && chunk) { out.push(chunk); chunk = ""; } chunk += w[i]; }
            line = chunk;
          } else line = t;
        } else { out.push(line); line = w; }
      });
      out.push(line);
    });
    return out;
  }

  // ---------- outline import / export ----------
  function toMarkdown(m) {
    var lines = ["# " + oneLine(m.root.text)];
    function rec(n, d) { n.children.forEach(function (c) { lines.push(new Array(d + 1).join("  ") + "- " + (c.icon ? c.icon + " " : "") + oneLine(c.text) + (c.note ? "\n" + new Array(d + 2).join("  ") + "> " + oneLine(c.note) : "")); rec(c, d + 1); }); }
    rec(m.root, 0);
    return lines.join("\n") + "\n";
  }
  function oneLine(s) { return String(s || "").replace(/\s*\n\s*/g, " ").trim(); }
  // Markdown headings / bullets / numbered lists, or plain text indented with tabs or spaces.
  function fromOutline(text, name) {
    var raw = String(text || "").replace(/\r\n?/g, "\n").split("\n").filter(function (l) { return l.trim(); });
    if (!raw.length) throw new Error("empty");
    // "> text" lines are the note of the topic above them
    var notes = {};
    raw = raw.filter(function (l, i) { var m2 = /^\s*>\s?(.*)$/.exec(l); if (m2 && i > 0) { var k = i - 1; while (notes[k] === null) k--; notes[k] = (notes[k] ? notes[k] + " " : "") + m2[1]; notes[i] = null; return true; } return true; });
    var items = raw.map(function (l, i) {
      if (notes[i] === null) return null;
      var exp = l.replace(/\t/g, "    "), ind = exp.match(/^ */)[0].length, t = exp.trim();
      var h = /^(#{1,6})\s+(.*)$/.exec(t);
      if (h) return { head: h[1].length, text: h[2], note: notes[i] };
      return { ind: ind, text: t.replace(/^([-*+\u2022]|\d+[.)])\s+/, ""), note: notes[i] };
    }).filter(Boolean);
    // indentation unit: the smallest indent used (2 or 4 spaces usually)
    var unit = items.reduce(function (u, it) { return it.ind > 0 ? Math.min(u, it.ind) : u; }, Infinity); if (!isFinite(unit)) unit = 2;
    var lastHead = 0;
    items.forEach(function (it) {
      if (it.head) { it.lvl = it.head; lastHead = it.head; }
      else it.lvl = lastHead + 1 + Math.round(it.ind / unit);
    });
    var minL = Math.min.apply(null, items.map(function (it) { return it.lvl; }));
    var tops = items.filter(function (it) { return it.lvl === minL; }).length;
    var m = newMap(name || "Imported map"), stack;
    if (tops === 1 && items[0].lvl === minL) { m.root = node(items[0].text.slice(0, 2000)); if (items[0].note) m.root.note = items[0].note; stack = [{ lvl: minL, n: m.root }]; items = items.slice(1); }
    else { m.root = node(name || "Imported map"); stack = [{ lvl: minL - 1, n: m.root }]; }
    items.forEach(function (it) {
      var n = node(it.text.slice(0, 2000)); if (it.note) n.note = it.note.slice(0, 5000);
      while (stack.length > 1 && stack[stack.length - 1].lvl >= it.lvl) stack.pop();
      stack[stack.length - 1].n.children.push(n);
      stack.push({ lvl: it.lvl, n: n });
    });
    // a leading icon from our own export goes back into the icon slot
    walk(m.root, function (n) { for (var i = 0; i < ICONS.length; i++) if (n.text.indexOf(ICONS[i] + " ") === 0) { n.icon = ICONS[i]; n.text = n.text.slice(ICONS[i].length + 1); break; } });
    m.name = oneLine(m.root.text).slice(0, 120) || m.name;
    return m;
  }
  // FreeMind / Freeplane .mm files
  function fromFreeMind(xml) {
    if (!root.DOMParser) throw new Error("no parser");
    var doc = new root.DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("bad xml");
    var top = doc.documentElement && doc.documentElement.localName === "map" ? firstNode(doc.documentElement) : null;
    if (!top) throw new Error("not freemind");
    function firstNode(el) { for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === "node") return c; return null; }
    function conv(el, depth) {
      var text = el.getAttribute("TEXT");
      if (text == null) { var rc = el.getElementsByTagName("richcontent")[0]; text = rc ? rc.textContent.trim() : ""; }
      var n = node(String(text).slice(0, 2000));
      if (depth === 1) { var pos = el.getAttribute("POSITION"); if (pos === "left") n.side = "l"; else if (pos === "right") n.side = "r"; }
      if (el.getAttribute("FOLDED") === "true") n.col = true;
      if (depth < 40) for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === "node") n.children.push(conv(c, depth + 1));
      return n;
    }
    var m = newMap(); m.root = conv(top, 0); m.name = oneLine(m.root.text).slice(0, 120) || "Imported map";
    return m;
  }

  // ---------- file checks ----------
  function normalize(o) {
    if (!o || o.app !== "s3-mindmap" || !o.root) throw new Error("Not a mind map file");
    var seen = {}, total = 0;
    function cl(n, depth) {
      if (!n || typeof n !== "object" || total++ > 20000 || depth > 60) return null;
      var id = String(n.id || "").slice(0, 40); if (!id || seen[id]) id = uid(); seen[id] = 1;
      var out = { id: id, text: String(n.text == null ? "" : n.text).slice(0, 2000), children: [], col: !!n.col };
      if (/^#[0-9a-fA-F]{6}$/.test(n.color)) out.color = n.color;
      if (ICONS.indexOf(n.icon) >= 0) out.icon = n.icon;
      if (n.note) out.note = String(n.note).slice(0, 5000);
      if (depth === 1 && (n.side === "l" || n.side === "r")) out.side = n.side;
      (Array.isArray(n.children) ? n.children : []).forEach(function (c) { var k = cl(c, depth + 1); if (k) out.children.push(k); });
      return out;
    }
    var m = newMap(); m.id = String(o.id || "").slice(0, 40) || m.id; m.name = String(o.name || "Mind map").slice(0, 120);
    m.theme = ["light", "dark", "color"].indexOf(o.theme) >= 0 ? o.theme : "light";
    m.updated = Number(o.updated) || Date.now();
    m.root = cl(o.root, 0) || node("Central topic");
    delete m.root.side;
    return m;
  }

  function template(kind) {
    var m;
    if (kind === "study") {
      m = fromOutline("# Exam revision\n- Topics\n  - Chapter 1\n  - Chapter 2\n  - Chapter 3\n- Resources\n  - Lecture slides\n  - Past papers\n  - Study group\n- Schedule\n  - Week 1: read\n  - Week 2: practise\n  - Week 3: review\n- Exam day\n  - Sleep well\n  - Bring ID and pens");
    } else if (kind === "project") {
      m = fromOutline("# New project\n- Goals\n  - What success looks like\n  - Deadline\n- People\n  - Owner\n  - Team\n  - Stakeholders\n- Tasks\n  - Research\n  - Build\n  - Test\n  - Launch\n- Risks\n  - Budget\n  - Time\n- Ideas");
      m.root.children[3].children[0].icon = "💡";
    } else {
      m = fromOutline("# Brainstorm\n- Why\n- Who\n- What\n- How\n- When");
    }
    m.name = m.root.text;
    return m;
  }

  var API = { uid: uid, BRANCH: BRANCH, ICONS: ICONS, node: node, newMap: newMap, walk: walk, index: index, find: find, parentOf: parentOf, isAncestor: isAncestor, count: count, branchOf: branchOf,
    addChild: addChild, addSibling: addSibling, remove: remove, moveTo: moveTo, reorder: reorder, layout: layout, wrap: wrap,
    toMarkdown: toMarkdown, fromOutline: fromOutline, fromFreeMind: fromFreeMind, normalize: normalize, template: template };
  root.MindCore = API;
  if (typeof module === "object" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
