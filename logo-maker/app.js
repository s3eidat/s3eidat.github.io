/* Logo Maker — ideas from a name and an industry, a simple editor, and SVG/PNG export. Nothing leaves the browser. */
(function () {
  "use strict";
  var $ = S3.$, h = S3.h, esc = S3.esc;
  var KEY = "logo-maker";
  var ICONS = window.LOGO_ICONS.icons, INDUSTRIES = window.LOGO_ICONS.industries;
  var FONTS = {
    inter: { label: "Inter (sans-serif)", css: "Inter, 'Noto Sans Arabic', 'Segoe UI', system-ui, sans-serif", weights: [300, 400, 500, 600, 700, 800, 900] },
    serif: { label: "Serif", css: "Georgia, 'Times New Roman', 'Noto Serif', serif", weights: [400, 700] },
    mono: { label: "Monospace", css: "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace", weights: [400, 700] }
  };
  // [name, background, symbol, accent, text]
  var PALETTES = [
    ["Ocean", "#ffffff", "#0e7490", "#22d3ee", "#0f172a"], ["Forest", "#ffffff", "#166534", "#84cc16", "#14261a"], ["Sunset", "#fffaf5", "#ea580c", "#f59e0b", "#2b1a0f"],
    ["Berry", "#ffffff", "#9d174d", "#f472b6", "#2a0f1c"], ["Royal", "#ffffff", "#3730a3", "#818cf8", "#111033"], ["Mint", "#f6fffb", "#059669", "#34d399", "#0b2a20"],
    ["Charcoal", "#ffffff", "#111827", "#6b7280", "#111827"], ["Coffee", "#fbf7f2", "#6f4e37", "#c08552", "#2b1d14"], ["Gold", "#121212", "#d4a72c", "#f3d27a", "#f5f0e6"],
    ["Midnight", "#0b1020", "#60a5fa", "#a78bfa", "#e5e7eb"], ["Coral", "#ffffff", "#f43f5e", "#fb923c", "#1f2937"], ["Teal", "#ffffff", "#0d9488", "#5eead4", "#10302d"],
    ["Plum", "#faf5ff", "#7e22ce", "#c084fc", "#1e1028"], ["Sky", "#ffffff", "#0284c7", "#38bdf8", "#0c1a2b"], ["Clay", "#fdf6f0", "#b45309", "#fbbf24", "#2a1a0a"],
    ["Ink", "#ffffff", "#000000", "#000000", "#000000"], ["Neon", "#0a0a0a", "#a3e635", "#22d3ee", "#fafafa"], ["Rose", "#fff7f7", "#e11d48", "#fda4af", "#2b0f15"],
    ["Olive", "#fbfbf3", "#4d7c0f", "#a16207", "#1f2610"], ["Navy", "#ffffff", "#1e3a8a", "#f59e0b", "#0f1b3d"]
  ];
  var PAL_BY = {
    food: ["Coffee", "Sunset", "Clay", "Forest", "Coral", "Olive"], tech: ["Royal", "Sky", "Midnight", "Neon", "Teal", "Charcoal"],
    health: ["Mint", "Teal", "Sky", "Coral", "Forest", "Ocean"], beauty: ["Rose", "Plum", "Berry", "Gold", "Mint", "Charcoal"],
    education: ["Navy", "Royal", "Sky", "Sunset", "Forest", "Ink"], realestate: ["Navy", "Charcoal", "Gold", "Teal", "Forest", "Clay"],
    finance: ["Navy", "Charcoal", "Gold", "Forest", "Royal", "Ink"], travel: ["Ocean", "Sky", "Sunset", "Teal", "Forest", "Clay"],
    creative: ["Coral", "Plum", "Neon", "Midnight", "Ink", "Sunset"], retail: ["Berry", "Coral", "Ink", "Gold", "Rose", "Royal"],
    nature: ["Forest", "Olive", "Mint", "Clay", "Teal", "Sunset"], build: ["Clay", "Charcoal", "Navy", "Sunset", "Ink", "Gold"],
    services: ["Navy", "Teal", "Royal", "Charcoal", "Ocean", "Plum"], events: ["Midnight", "Plum", "Neon", "Gold", "Coral", "Berry"],
    auto: ["Charcoal", "Ink", "Navy", "Coral", "Gold", "Midnight"], other: ["Ocean", "Royal", "Coral", "Forest", "Ink", "Plum"]
  };
  var TYPE_STYLES = [
    { font: "inter", weight: 800, kase: "none", track: -2 }, { font: "inter", weight: 600, kase: "upper", track: 12 }, { font: "inter", weight: 300, kase: "lower", track: 0 },
    { font: "inter", weight: 900, kase: "upper", track: 3 }, { font: "serif", weight: 700, kase: "none", track: 0 }, { font: "serif", weight: 400, kase: "upper", track: 16 },
    { font: "mono", weight: 700, kase: "lower", track: -2 }, { font: "inter", weight: 500, kase: "title", track: 2 }, { font: "inter", weight: 700, kase: "lower", track: -3 }
  ];
  var LAYOUTS = [["left", "Symbol left"], ["top", "Symbol above"], ["badge", "Badge"], ["mono", "Initials"], ["text", "Text only"]];
  var SHAPES = [["none", "No shape"], ["circle", "Circle"], ["rounded", "Rounded square"], ["hex", "Hexagon"], ["shield", "Shield"], ["diamond", "Diamond"]];

  // ---------- state ----------
  function pal(name) { for (var i = 0; i < PALETTES.length; i++) if (PALETTES[i][0] === name) return PALETTES[i]; return PALETTES[0]; }
  var HEX = /^#[0-9a-f]{6}$/i;
  function str(x, n) { return typeof x === "string" ? x.slice(0, n) : ""; }
  function pick(v, list, d) { return list.indexOf(v) >= 0 ? v : d; }
  function cleanDesign(d) {
    if (!d || typeof d !== "object") return null;
    var c = d.colors || {};
    var font = FONTS[d.font] ? d.font : "inter";
    return {
      name: str(d.name, 60) || "Brand", slogan: str(d.slogan, 80),
      layout: pick(d.layout, LAYOUTS.map(function (l) { return l[0]; }), "left"), shape: pick(d.shape, SHAPES.map(function (s) { return s[0]; }), "none"),
      fill: d.fill === "outline" ? "outline" : "solid", icon: ICONS[d.icon] ? d.icon : "star",
      stroke: Math.max(1, Math.min(3.2, +d.stroke || 2)), iconScale: Math.max(.6, Math.min(1.5, +d.iconScale || 1)),
      font: font, weight: pick(+d.weight, FONTS[font].weights, FONTS[font].weights[FONTS[font].weights.length > 2 ? 4 : 1]),
      kase: pick(d.kase, ["none", "upper", "lower", "title"], "none"), track: Math.max(-10, Math.min(40, Math.round(+d.track || 0))),
      accent: pick(d.accent, ["none", "dot", "line"], "none"), gap: Math.max(.4, Math.min(2.5, +d.gap || 1)),
      colors: { bg: HEX.test(c.bg) ? c.bg : "#ffffff", main: HEX.test(c.main) ? c.main : "#0e7490", accent: HEX.test(c.accent) ? c.accent : "#22d3ee", text: HEX.test(c.text) ? c.text : "#0f172a" }
    };
  }
  var saved = S3.store(KEY) || {};
  var st = {
    form: { name: str((saved.form || {}).name, 60), slogan: str((saved.form || {}).slogan, 80), industry: INDUSTRIES.some(function (x) { return x[0] === (saved.form || {}).industry; }) ? saved.form.industry : "other" },
    seed: +saved.seed || 1, cur: cleanDesign(saved.cur), saved: (Array.isArray(saved.saved) ? saved.saved : []).map(cleanDesign).filter(Boolean).slice(0, 60),
    mode: saved.mode === "edit" && saved.cur ? "edit" : "ideas"
  };
  var save = S3.debounce(function () { S3.store(KEY, { form: st.form, seed: st.seed, cur: st.cur, saved: st.saved, mode: st.mode }); }, 250);

  // ---------- measuring + layout ----------
  var mctx = document.createElement("canvas").getContext("2d");
  function isRtl(s) { var m = /[A-Za-z֐-ࣿ]/.exec(s || ""); return !!m && /[֐-ࣿ]/.test(m[0]); }
  function applyCase(t, k) {
    if (k === "upper") return t.toLocaleUpperCase();
    if (k === "lower") return t.toLocaleLowerCase();
    if (k === "title") return t.replace(/\S+/g, function (w) { return w.charAt(0).toLocaleUpperCase() + w.slice(1).toLocaleLowerCase(); });
    return t;
  }
  function fontStr(weight, size, font) { return weight + " " + size + "px " + FONTS[font].css; }
  function textWidth(text, size, weight, font, ls) {
    mctx.font = fontStr(weight, size, font);
    return mctx.measureText(text).width + (isRtl(text) ? 0 : ls * text.length);
  }
  function initials(name) {
    var w = name.trim().split(/\s+/).filter(Boolean);
    var s = w.length > 1 ? w[0].charAt(0) + w[1].charAt(0) : (w[0] || "B").slice(0, isRtl(w[0]) ? 1 : 2);
    return s.toLocaleUpperCase();
  }
  // Shape outline in a box of size s (top-left at 0,0).
  function shapePath(kind, s) {
    var r = s / 2, f = function (n) { return Math.round(n * 100) / 100; };
    if (kind === "circle") return "M0 " + f(r) + "a" + f(r) + " " + f(r) + " 0 1 0 " + f(s) + " 0a" + f(r) + " " + f(r) + " 0 1 0 " + f(-s) + " 0Z";
    if (kind === "rounded") { var k = s * .24; return "M" + f(k) + " 0H" + f(s - k) + "Q" + f(s) + " 0 " + f(s) + " " + f(k) + "V" + f(s - k) + "Q" + f(s) + " " + f(s) + " " + f(s - k) + " " + f(s) + "H" + f(k) + "Q0 " + f(s) + " 0 " + f(s - k) + "V" + f(k) + "Q0 0 " + f(k) + " 0Z"; }
    if (kind === "hex") { var pts = []; for (var i = 0; i < 6; i++) { var a = Math.PI / 3 * i - Math.PI / 2; pts.push(f(r + r * Math.cos(a)) + " " + f(r + r * Math.sin(a))); } return "M" + pts.join("L") + "Z"; }
    if (kind === "shield") return "M" + f(r) + " 0L" + f(s) + " " + f(s * .16) + "V" + f(s * .5) + "C" + f(s) + " " + f(s * .8) + " " + f(s * .76) + " " + f(s * .94) + " " + f(r) + " " + f(s) + "C" + f(s * .24) + " " + f(s * .94) + " 0 " + f(s * .8) + " 0 " + f(s * .5) + "V" + f(s * .16) + "Z";
    if (kind === "diamond") { var q = s * .1; return "M" + f(r - q) + " " + f(q) + "Q" + f(r) + " 0 " + f(r + q) + " " + f(q) + "L" + f(s - q) + " " + f(r - q) + "Q" + f(s) + " " + f(r) + " " + f(s - q) + " " + f(r + q) + "L" + f(r + q) + " " + f(s - q) + "Q" + f(r) + " " + f(s) + " " + f(r - q) + " " + f(s - q) + "L" + f(q) + " " + f(r + q) + "Q0 " + f(r) + " " + f(q) + " " + f(r - q) + "Z"; }
    return "";
  }
  // Lays a design out as drawing items; the same items become SVG or canvas drawing.
  function layout(d) {
    var F = 64, P = F * .55, items = [], c = d.colors;
    var name = applyCase(d.name, d.kase), slogan = d.slogan ? d.slogan.toLocaleUpperCase() : "";
    var ls = d.track / 100 * F, Fs = F * .28, lss = Fs * .16, fw = d.weight;
    var nameW = textWidth(name, F, fw, d.font, ls), slW = slogan ? textWidth(slogan, Fs, 500, "inter", lss) : 0;
    var cap = F * .72, gapT = F * .38 * d.gap;
    var textH = cap + (slogan ? gapT + Fs * .75 : 0);
    function texts(cx, top, align, color, sizeMul) {
      // align: "left" = start at cx; "center" = centred on cx
      var m = sizeMul || 1, nW = nameW * m, sW = slW * m;
      var nx = align === "left" ? cx + nW / 2 : cx, sx = align === "left" ? cx + sW / 2 : cx;
      items.push({ t: "text", text: name, x: nx, y: top + cap * m, size: F * m, weight: fw, font: d.font, fill: color || c.text, ls: isRtl(name) ? 0 : ls * m });
      if (slogan) items.push({ t: "text", text: slogan, x: sx, y: top + (cap + gapT + Fs * .75) * m, size: Fs * m, weight: 500, font: "inter", fill: color || c.text, ls: isRtl(slogan) ? 0 : lss * m, alpha: .78 });
      if (d.accent === "dot" && !isRtl(name)) items.push({ t: "path", d: dotPath(nx + nW / 2 + F * .12 * m, top + cap * m - F * .09 * m, F * .09 * m), fill: c.accent });
      if (d.accent === "line") items.push({ t: "path", d: rectPath(align === "left" ? cx : cx - nW * .2, top + cap * m + F * .14 * m, nW * (align === "left" ? .35 : .4), F * .07 * m), fill: c.accent });
      return { w: Math.max(nW, sW) + (d.accent === "dot" ? F * .3 * m : 0), h: textH * m };
    }
    function symbol(x, y, s, inner) {
      // a shape (or none) with the icon or initials inside, size s, top-left x,y
      var has = d.shape !== "none", solid = d.fill === "solid" && has;
      if (has) items.push({ t: "path", d: shapePath(d.shape, s), x: x, y: y, fill: solid ? c.main : "none", stroke: solid ? null : c.main, sw: s * .045 });
      var ink = solid ? c.bg : c.main;
      if (inner === "initials") {
        var txt = initials(d.name), fs = s * (txt.length > 1 ? .42 : .5) * d.iconScale;
        items.push({ t: "text", text: txt, x: x + s / 2, y: y + s / 2 + fs * .36, size: fs, weight: d.font === "inter" ? 800 : 700, font: d.font, fill: ink, ls: 0 });
      } else {
        var k = (has ? (d.shape === "shield" ? .5 : .56) : .92) * d.iconScale, is = s * k;
        var dy = d.shape === "shield" ? -s * .04 : 0;
        items.push({ t: "icon", name: d.icon, x: x + (s - is) / 2, y: y + (s - is) / 2 + dy, s: is, color: ink, sw: d.stroke });
      }
    }
    var W, H;
    if (d.layout === "text") {
      var tb = texts(0, 0, "center");
      W = tb.w; H = tb.h;
      items.forEach(function (it) { if (it.t === "text") it.x += W / 2; else if (it.t === "path") it.d = shift(it.d, W / 2, 0); });
    } else if (d.layout === "top") {
      var S = F * 1.7, tb2 = { w: Math.max(nameW, slW), h: textH };
      W = Math.max(S, tb2.w); H = S + gapT * 1.2 + tb2.h;
      symbol((W - S) / 2, 0, S);
      texts(W / 2, S + gapT * 1.2, "center");
    } else if (d.layout === "badge") {
      var shape = d.shape === "none" ? "circle" : d.shape, D = F * 3.6;
      var solid = d.fill === "solid";
      items.push({ t: "path", d: shapePath(shape, D), x: 0, y: 0, fill: solid ? c.main : "none", stroke: solid ? null : c.main, sw: D * .03 });
      var ink = solid ? c.bg : c.main, is = D * .26 * d.iconScale;
      // the name shrinks to fit inside the badge
      var inner = D * (shape === "circle" ? .7 : .76), m = Math.min(inner / Math.max(nameW, slW, 1), D * .19 / F);
      // icon and text sit together in the middle of the badge (a shield's visual middle is a little higher)
      var gapB = D * .06, block = is + gapB + textH * m, y0 = (D - block) / 2 - (shape === "shield" ? D * .04 : 0);
      items.push({ t: "icon", name: d.icon, x: (D - is) / 2, y: y0, s: is, color: ink, sw: d.stroke });
      texts(D / 2, y0 + is + gapB, "center", ink, m);
      W = D; H = D;
    } else {
      var S2 = F * 1.45, gx = F * .38 * d.gap + (d.shape === "none" ? 0 : F * .05);
      symbol(0, 0, S2, d.layout === "mono" ? "initials" : null);
      var tb3 = { w: Math.max(nameW, slW) + (d.accent === "dot" ? F * .3 : 0), h: textH };
      H = Math.max(S2, tb3.h);
      var ty = (H - tb3.h) / 2, sy = (H - S2) / 2;
      items.forEach(function (it) { if (it.y != null) it.y += sy; });
      texts(S2 + gx, ty, "left");
      W = S2 + gx + tb3.w;
    }
    // padding around everything
    items.forEach(function (it) { if (it.x != null) it.x += P; if (it.y != null) it.y += P; if (it.t === "path" && it.x == null) it.d = shift(it.d, P, P); });
    return { w: Math.ceil(W + 2 * P), h: Math.ceil(H + 2 * P), items: items, bg: c.bg };
  }
  function dotPath(cx, cy, r) { return "M" + (cx - r) + " " + cy + "a" + r + " " + r + " 0 1 0 " + 2 * r + " 0a" + r + " " + r + " 0 1 0 " + -2 * r + " 0Z"; }
  function rectPath(x, y, w, hh) { return "M" + x + " " + y + "h" + w + "v" + hh + "h" + -w + "Z"; }
  // move an absolute "M x y …" path made by dotPath/rectPath
  function shift(dStr, dx, dy) { return dStr.replace(/^M([-\d.]+) ([-\d.]+)/, function (_, x, y) { return "M" + (+x + dx) + " " + (+y + dy); }); }

  // ---------- output: SVG and canvas ----------
  function n(v) { return Math.round(v * 100) / 100; }
  function toSvg(d, opts) {
    opts = opts || {};
    var L = layout(d), out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + L.w + " " + L.h + '" width="' + L.w + '" height="' + L.h + '">');
    if (opts.title !== false) out.push("<title>" + esc(d.name) + "</title>");
    if (!opts.transparent) out.push('<rect width="' + L.w + '" height="' + L.h + '" fill="' + L.bg + '"/>');
    L.items.forEach(function (it) {
      if (it.t === "path") {
        out.push('<path d="' + it.d + '"' + (it.x != null ? ' transform="translate(' + n(it.x) + " " + n(it.y) + ')"' : "") + ' fill="' + it.fill + '"' +
          (it.stroke ? ' stroke="' + it.stroke + '" stroke-width="' + n(it.sw) + '" stroke-linejoin="round"' : "") + "/>");
      } else if (it.t === "icon") {
        out.push('<path d="' + ICONS[it.name] + '" transform="translate(' + n(it.x) + " " + n(it.y) + ") scale(" + n(it.s / 24 * 1000) / 1000 + ')" fill="none" stroke="' + it.color +
          '" stroke-width="' + it.sw + '" stroke-linecap="round" stroke-linejoin="round"/>');
      } else if (it.t === "text") {
        out.push('<text x="' + n(it.x + it.ls / 2) + '" y="' + n(it.y) + '" text-anchor="middle" font-family="' + esc(FONTS[it.font].css) + '" font-size="' + n(it.size) +
          '" font-weight="' + it.weight + '"' + (it.ls ? ' letter-spacing="' + n(it.ls) + '"' : "") + ' fill="' + it.fill + '"' + (it.alpha ? ' fill-opacity="' + it.alpha + '"' : "") +
          (isRtl(it.text) ? ' direction="rtl"' : "") + ">" + esc(it.text) + "</text>");
      }
    });
    out.push("</svg>");
    return out.join("");
  }
  var hasLS = "letterSpacing" in CanvasRenderingContext2D.prototype;
  function drawItems(ctx, L, scale, transparent) {
    ctx.save(); ctx.scale(scale, scale);
    if (!transparent) { ctx.fillStyle = L.bg; ctx.fillRect(0, 0, L.w, L.h); }
    L.items.forEach(function (it) {
      ctx.save();
      if (it.t === "path") {
        if (it.x != null) ctx.translate(it.x, it.y);
        var p = new Path2D(it.d);
        if (it.fill && it.fill !== "none") { ctx.fillStyle = it.fill; ctx.fill(p); }
        if (it.stroke) { ctx.strokeStyle = it.stroke; ctx.lineWidth = it.sw; ctx.lineJoin = "round"; ctx.stroke(p); }
      } else if (it.t === "icon") {
        ctx.translate(it.x, it.y); ctx.scale(it.s / 24, it.s / 24);
        ctx.strokeStyle = it.color; ctx.lineWidth = it.sw; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.stroke(new Path2D(ICONS[it.name]));
      } else if (it.t === "text") {
        ctx.font = fontStr(it.weight, it.size, it.font); ctx.fillStyle = it.fill; ctx.globalAlpha = it.alpha || 1;
        ctx.textBaseline = "alphabetic";
        var rtl = isRtl(it.text);
        ctx.direction = rtl ? "rtl" : "ltr";
        if (!it.ls || rtl) { ctx.textAlign = "center"; ctx.fillText(it.text, it.x, it.y); }
        else if (hasLS) { ctx.letterSpacing = it.ls + "px"; ctx.textAlign = "center"; ctx.fillText(it.text, it.x + it.ls / 2, it.y); }
        else { // older browsers: place each character by hand
          var chars = Array.from(it.text), total = chars.reduce(function (s, ch) { return s + ctx.measureText(ch).width + it.ls; }, 0), x = it.x + it.ls / 2 - total / 2;
          ctx.textAlign = "left"; chars.forEach(function (ch) { ctx.fillText(ch, x, it.y); x += ctx.measureText(ch).width + it.ls; });
        }
      }
      ctx.restore();
    });
    ctx.restore();
  }
  function toCanvas(d, width, transparent) {
    var L = layout(d), s = width / L.w, c = document.createElement("canvas");
    c.width = Math.round(L.w * s); c.height = Math.round(L.h * s);
    drawItems(c.getContext("2d"), L, s, transparent);
    return c;
  }
  function svgEl(d, opts) {
    var wrap = h("div", { "class": "lm-svg" });
    wrap.innerHTML = toSvg(d, opts); // every user string inside is escaped by toSvg
    if (!opts || !opts.transparent) wrap.style.background = d.colors.bg;
    return wrap;
  }

  // ---------- idea generator ----------
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function choose(r, list) { return list[Math.floor(r() * list.length)]; }
  function weighted(r, pairs) { var tot = pairs.reduce(function (s, p) { return s + p[1]; }, 0), x = r() * tot; for (var i = 0; i < pairs.length; i++) { x -= pairs[i][1]; if (x <= 0) return pairs[i][0]; } return pairs[0][0]; }
  function ideas(form, seed, count) {
    var r = rng(seed * 7919 + 13), ind = INDUSTRIES.filter(function (x) { return x[0] === form.industry; })[0] || INDUSTRIES[INDUSTRIES.length - 1];
    var pals = PAL_BY[ind[0]] || PAL_BY.other, out = [], seen = {};
    for (var tries = 0; out.length < count && tries < count * 20; tries++) {
      var lay = weighted(r, [["left", 30], ["top", 24], ["badge", 12], ["mono", 14], ["text", 14]]);
      var shape = lay === "text" ? "none" : weighted(r, [["none", lay === "badge" ? 0 : 26], ["circle", 18], ["rounded", 18], ["hex", 10], ["shield", 8], ["diamond", 6]]);
      var ts = choose(r, TYPE_STYLES), p = pal(r() < .8 ? choose(r, pals) : choose(r, PALETTES)[0]);
      var d = cleanDesign({
        name: form.name || "Brand", slogan: form.slogan, layout: lay, shape: shape, fill: r() < .62 ? "solid" : "outline", icon: choose(r, ind[2]),
        stroke: shape !== "none" && r() < .5 ? 2.4 : 2, font: ts.font, weight: ts.weight, kase: ts.kase, track: ts.track,
        accent: lay === "text" ? choose(r, ["dot", "line", "none"]) : r() < .15 ? "dot" : "none",
        colors: { bg: p[1], main: p[2], accent: p[3], text: p[4] }
      });
      var key = [d.layout, d.shape, d.icon, d.font, d.weight, d.kase, p[0]].join("|");
      if (seen[key]) continue;
      seen[key] = 1; out.push(d);
    }
    return out;
  }

  // ---------- UI helpers ----------
  function icon(nm) { var s = h("span", { "class": "lm-ic", "aria-hidden": "true" }); s.innerHTML = S3.icon(nm); return s; }
  function btn(label, onclick, cls, ic, title) {
    return h("button", { type: "button", "class": "btn " + (cls || ""), onclick: onclick, title: title || null, "aria-label": title || null }, ic ? [icon(ic)].concat(label ? [label] : []) : [label]);
  }
  function seg(options, value, onpick, label) {
    var g = h("div", { "class": "seg lm-seg", role: "group", "aria-label": label });
    options.forEach(function (o) {
      g.appendChild(h("button", { type: "button", "aria-pressed": String(o[0] === value), onclick: function () { onpick(o[0]); } }, [o[1]]));
    });
    return g;
  }
  function field(label, el) { return h("label", { "class": "field" }, [label, el]); }
  function fileBase(t) { return (t || "").replace(/[^A-Za-z0-9 _.-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 50).replace(/ /g, "-").toLowerCase() || "logo"; }

  // ---------- ideas screen ----------
  var list = [];
  function renderIdeas() {
    var v = $("#lm-view"); v.textContent = "";
    var name = h("input", { "class": "input", type: "text", maxlength: "60", placeholder: "e.g. Bloom Bakery", dir: "auto", autocomplete: "off" });
    name.value = st.form.name;
    var slogan = h("input", { "class": "input", type: "text", maxlength: "80", placeholder: "Optional, e.g. Fresh every morning", dir: "auto", autocomplete: "off" });
    slogan.value = st.form.slogan;
    var ind = h("select", { "class": "select" }, INDUSTRIES.map(function (x) { return h("option", { value: x[0], text: x[1] }); }));
    ind.value = st.form.industry;
    function sync() { st.form.name = name.value.trim().slice(0, 60); st.form.slogan = slogan.value.trim().slice(0, 80); st.form.industry = ind.value; save(); }
    var form = h("form", { "class": "card lm-form", novalidate: true }, [
      h("div", { "class": "lm-form-grid" }, [field("Business name", name), field("Slogan", slogan), field("Industry", ind)]),
      h("div", { "class": "row" }, [h("button", { type: "submit", "class": "btn primary big" }, ["Show logo ideas"])])
    ]);
    form.addEventListener("submit", function (e) {
      e.preventDefault(); sync();
      if (!st.form.name) { S3.toast("Type your business name first", "error"); name.focus(); return; }
      st.seed++; save(); showIdeas(true);
    });
    [name, slogan].forEach(function (i) { i.addEventListener("input", function () { sync(); retitle(); }); });
    ind.addEventListener("change", function () { sync(); st.seed++; save(); if (st.form.name) showIdeas(); });
    v.appendChild(form);
    v.appendChild(h("div", { id: "lm-ideas" }));
    if (st.form.name) showIdeas(); else $("#lm-ideas").appendChild(h("div", { "class": "empty" }, [h("b", { text: "Your logo ideas appear here" }), h("span", { text: "Type a name, pick an industry and press Show logo ideas." })]));
    if (st.saved.length) {
      v.appendChild(h("h2", { "class": "lm-h", text: "My logos" }));
      var g = h("div", { "class": "lm-grid" });
      st.saved.forEach(function (d, i) {
        g.appendChild(h("div", { "class": "lm-saved" }, [
          h("button", { type: "button", "class": "lm-card", "aria-label": "Edit " + d.name, onclick: function () { edit(cleanDesign(JSON.parse(JSON.stringify(d)))); } }, [svgEl(d)]),
          btn("", function () {
            var gone = st.saved.splice(i, 1)[0]; save(); renderIdeas();
            var t = S3.toast("Removed from My logos ");
            t.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { st.saved.splice(i, 0, gone); save(); renderIdeas(); t.remove(); } }, ["Undo"]));
          }, "ghost icon small lm-rm", "trash", "Remove " + d.name)
        ]));
      });
      v.appendChild(g);
    }
  }
  // typing in the form re-labels the ideas already shown without re-rolling them
  var retitle = S3.debounce(function () { if (list.length && st.form.name) showIdeas(); }, 250);
  function showIdeas(scroll) {
    list = ideas(st.form, st.seed, 24);
    var box = $("#lm-ideas"); box.textContent = "";
    var g = h("div", { "class": "lm-grid" });
    list.forEach(function (d, i) {
      g.appendChild(h("button", { type: "button", "class": "lm-card", "aria-label": "Logo idea " + (i + 1) + ", edit it", onclick: function () { edit(d); } }, [svgEl(d)]));
    });
    box.appendChild(h("div", { "class": "row between lm-bar" }, [h("h2", { "class": "lm-h", text: "Pick one to edit" }), btn("More ideas", function () { st.seed++; save(); showIdeas(); }, "", "refresh")]));
    box.appendChild(g);
    if (scroll) box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- editor ----------
  var view = "design"; // preview background
  function edit(d) { st.cur = cleanDesign(d); st.mode = "edit"; save(); render(); window.scrollTo(0, 0); }
  function setD(fn) { fn(st.cur); st.cur = cleanDesign(st.cur); save(); draw(); }
  function draw() {
    var p = $("#lm-preview"); if (!p) return;
    p.textContent = "";
    p.setAttribute("data-bg", view);
    p.style.background = view === "design" ? st.cur.colors.bg : "";
    p.appendChild(svgEl(st.cur, { transparent: view !== "design" }));
  }
  function renderEditor() {
    var d = st.cur, v = $("#lm-view"); v.textContent = "";
    var top = h("div", { "class": "row between lm-bar" }, [
      btn("Ideas", function () { st.mode = "ideas"; save(); render(); }, "ghost", "", "Back to ideas"),
      h("div", { "class": "row" }, [btn("Save to My logos", function () {
        st.saved.unshift(cleanDesign(JSON.parse(JSON.stringify(st.cur)))); st.saved = st.saved.slice(0, 60); save(); S3.toast("Saved to My logos");
      }, "", "heart"), btn("Download", exportDialog, "primary", "download")])
    ]);
    top.firstChild.textContent = "← Ideas";
    v.appendChild(top);
    var bgSeg = seg([["design", "Design"], ["light", "Light"], ["dark", "Dark"], ["checker", "Transparent"]], view, function (k) { view = k; S3.$$("button", bgSeg).forEach(function (b, i) { b.setAttribute("aria-pressed", String(["design", "light", "dark", "checker"][i] === k)); }); draw(); }, "Preview background");
    var stage = h("div", { "class": "lm-stage card" }, [h("div", { "class": "lm-preview", id: "lm-preview" }), h("div", { "class": "row lm-under" }, [bgSeg])]);
    var panel = h("div", { "class": "lm-panel" });
    v.appendChild(h("div", { "class": "lm-editor" }, [stage, panel]));

    // text
    var nm = h("input", { "class": "input", type: "text", maxlength: "60", dir: "auto", value: d.name });
    nm.addEventListener("input", function () { setD(function (x) { x.name = nm.value || " "; }); });
    var sl = h("input", { "class": "input", type: "text", maxlength: "80", dir: "auto", value: d.slogan, placeholder: "Optional" });
    sl.addEventListener("input", function () { setD(function (x) { x.slogan = sl.value; }); });
    var fontSel = h("select", { "class": "select" }, Object.keys(FONTS).map(function (k) { return h("option", { value: k, text: FONTS[k].label }); }));
    fontSel.value = d.font;
    var wt = h("select", { "class": "select" });
    function weights() {
      wt.textContent = "";
      FONTS[st.cur.font].weights.forEach(function (w) { wt.appendChild(h("option", { value: String(w), text: { 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold", 900: "Black" }[w] })); });
      wt.value = String(st.cur.weight);
    }
    fontSel.addEventListener("change", function () { setD(function (x) { x.font = fontSel.value; if (FONTS[x.font].weights.indexOf(x.weight) < 0) x.weight = x.weight >= 600 ? 700 : 400; }); weights(); });
    wt.addEventListener("change", function () { setD(function (x) { x.weight = +wt.value; }); });
    weights();
    var tr = h("input", { type: "range", min: "-10", max: "40", step: "1", value: String(d.track), "aria-label": "Letter spacing" });
    tr.addEventListener("input", function () { setD(function (x) { x.track = +tr.value; }); });
    var gp = h("input", { type: "range", min: "0.4", max: "2.5", step: "0.05", value: String(d.gap), "aria-label": "Spacing" });
    gp.addEventListener("input", function () { setD(function (x) { x.gap = +gp.value; }); });
    var caseSeg = seg([["none", "Aa"], ["upper", "AA"], ["lower", "aa"], ["title", "Title"]], d.kase, function (k) { setD(function (x) { x.kase = k; }); S3.$$("button", caseSeg).forEach(function (b, i) { b.setAttribute("aria-pressed", String(["none", "upper", "lower", "title"][i] === k)); }); }, "Letter case");
    panel.appendChild(h("details", { "class": "card lm-group", open: true }, [h("summary", { text: "Text" }),
      h("div", { "class": "lm-fields" }, [field("Name", nm), field("Slogan", sl), field("Font", fontSel), field("Weight", wt)]),
      h("div", { "class": "field" }, ["Letter case", caseSeg]),
      h("div", { "class": "lm-fields" }, [field("Letter spacing", tr), field("Spacing", gp)])]));

    // symbol
    var laySel = h("select", { "class": "select" }, LAYOUTS.map(function (l) { return h("option", { value: l[0], text: l[1] }); }));
    laySel.value = d.layout; laySel.addEventListener("change", function () { setD(function (x) { x.layout = laySel.value; }); });
    var shSel = h("select", { "class": "select" }, SHAPES.map(function (s) { return h("option", { value: s[0], text: s[1] }); }));
    shSel.value = d.shape; shSel.addEventListener("change", function () { setD(function (x) { x.shape = shSel.value; }); });
    var fillSel = h("select", { "class": "select" }, [h("option", { value: "solid", text: "Filled shape" }), h("option", { value: "outline", text: "Outline shape" })]);
    fillSel.value = d.fill; fillSel.addEventListener("change", function () { setD(function (x) { x.fill = fillSel.value; }); });
    var acSel = h("select", { "class": "select" }, [h("option", { value: "none", text: "None" }), h("option", { value: "dot", text: "Dot after name" }), h("option", { value: "line", text: "Underline" })]);
    acSel.value = d.accent; acSel.addEventListener("change", function () { setD(function (x) { x.accent = acSel.value; }); });
    var sw = h("input", { type: "range", min: "1", max: "3.2", step: "0.1", value: String(d.stroke), "aria-label": "Line weight" });
    sw.addEventListener("input", function () { setD(function (x) { x.stroke = +sw.value; }); });
    var isz = h("input", { type: "range", min: "0.6", max: "1.5", step: "0.05", value: String(d.iconScale), "aria-label": "Symbol size" });
    isz.addEventListener("input", function () { setD(function (x) { x.iconScale = +isz.value; }); });
    var grid = h("div", { "class": "lm-icons", role: "group", "aria-label": "Symbol" });
    var indIcons = (INDUSTRIES.filter(function (x) { return x[0] === st.form.industry; })[0] || [0, 0, []])[2];
    indIcons.concat(Object.keys(ICONS).filter(function (k) { return indIcons.indexOf(k) < 0; })).forEach(function (k) {
      var b = h("button", { type: "button", "class": "lm-icon", title: k, "aria-label": k, "aria-pressed": String(k === d.icon), onclick: function () {
        setD(function (x) { x.icon = k; if (x.layout === "text" || x.layout === "mono") x.layout = "left"; laySel.value = x.layout; });
        S3.$$(".lm-icon", grid).forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      } });
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONS[k] + '"/></svg>';
      grid.appendChild(b);
    });
    panel.appendChild(h("details", { "class": "card lm-group", open: true }, [h("summary", { text: "Symbol" }),
      h("div", { "class": "lm-fields" }, [field("Layout", laySel), field("Shape", shSel), field("Shape style", fillSel), field("Accent", acSel), field("Line weight", sw), field("Symbol size", isz)]),
      grid]));

    // colours
    var cols = h("div", { "class": "lm-fields" });
    [["bg", "Background"], ["main", "Symbol"], ["accent", "Accent"], ["text", "Text"]].forEach(function (k) {
      var inp = h("input", { type: "color", value: d.colors[k[0]], "aria-label": k[1] });
      inp.addEventListener("input", function () { setD(function (x) { x.colors[k[0]] = inp.value; }); });
      cols.appendChild(h("label", { "class": "field lm-color" }, [k[1], inp]));
    });
    var pals = h("div", { "class": "lm-pals", role: "group", "aria-label": "Colour palettes" });
    PALETTES.forEach(function (p) {
      var b = h("button", { type: "button", "class": "lm-pal", title: p[0], "aria-label": p[0] + " palette", onclick: function () {
        setD(function (x) { x.colors = { bg: p[1], main: p[2], accent: p[3], text: p[4] }; });
        S3.$$("input[type=color]", cols).forEach(function (inp, i) { inp.value = [p[1], p[2], p[3], p[4]][i]; });
      } }, [1, 2, 3].map(function (i) { return h("span", { style: "background:" + p[i] }); }));
      pals.appendChild(b);
    });
    panel.appendChild(h("details", { "class": "card lm-group", open: true }, [h("summary", { text: "Colours" }), pals, cols]));
    draw();
  }

  // ---------- export ----------
  function exportDialog() {
    var d = st.cur;
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Download logo" });
    var size = h("select", { "class": "select" }, [512, 1024, 2048, 4096].map(function (w) { return h("option", { value: String(w), text: w + " px wide" }); }));
    size.value = "2048";
    var tr = h("input", { type: "checkbox" }); tr.checked = true;
    function png() {
      toCanvas(d, +size.value, tr.checked).toBlob(function (b) { S3.download(b, fileBase(d.name) + "-" + size.value + ".png"); S3.done(); }, "image/png");
    }
    function svg() { S3.download(toSvg(d, { transparent: tr.checked }), fileBase(d.name) + ".svg", "image/svg+xml"); S3.done(); }
    var sheet = h("div", { "class": "s3-sheet" }, [
      h("div", { "class": "row between" }, [h("h2", { text: "Download your logo" }), btn("", close, "ghost icon", "x", "Close")]),
      h("p", { text: "Free, full size, no watermark. Made in your browser." }),
      h("div", { "class": "stack" }, [
        field("PNG size", size),
        h("label", { "class": "check" }, [tr, "Transparent background"]),
        h("div", { "class": "row" }, [btn("PNG", png, "primary", "download"), btn("SVG (vector)", svg, "", "download")]),
        h("p", { "class": "faint", text: "SVG keeps the name as editable text. It looks the same anywhere Inter is installed (a free font); other fonts use the system's serif or monospace. PNG always looks exactly like the preview." })
      ])
    ]);
    m.appendChild(sheet);
    function close() { m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m); sheet.querySelector(".btn.primary").focus();
  }

  function render() {
    if (st.mode === "edit" && st.cur) renderEditor(); else { st.mode = "ideas"; renderIdeas(); }
  }
  // wait for Inter so measurements match what is drawn
  var ready = document.fonts && document.fonts.load ? Promise.all([300, 500, 700, 900].map(function (w) { return document.fonts.load(w + " 64px Inter"); })).catch(function () {}) : Promise.resolve();
  ready.then(render);
  window.LM = { layout: layout, toSvg: toSvg, toCanvas: toCanvas, ideas: ideas, cleanDesign: cleanDesign, state: function () { return st; } };
})();
