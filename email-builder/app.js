/* Email Builder — blocks in, email-safe HTML out (tables + inline styles). Nothing is uploaded. */
(function () {
  "use strict";
  var $ = S3.$, h = S3.h, esc = S3.esc;
  var KEY = "email-builder";
  var FONTS = {
    arial: ["Arial / Helvetica", "Arial, Helvetica, sans-serif"], verdana: ["Verdana", "Verdana, Geneva, sans-serif"], tahoma: ["Tahoma (good for Arabic)", "Tahoma, Geneva, 'Segoe UI', sans-serif"],
    trebuchet: ["Trebuchet MS", "'Trebuchet MS', Helvetica, sans-serif"], georgia: ["Georgia (serif)", "Georgia, 'Times New Roman', serif"], times: ["Times New Roman", "'Times New Roman', Times, serif"]
  };
  var TYPES = [["heading", "Heading"], ["text", "Text"], ["image", "Image"], ["button", "Button"], ["columns", "Two columns"], ["divider", "Divider"], ["spacer", "Spacer"], ["social", "Social links"], ["footer", "Footer"]];
  var HEX = /^#[0-9a-f]{6}$/i;

  // ---------- safe rich text ----------
  // Keeps only b/strong/i/em/u/a(href)/br/p; everything else becomes plain text.
  function safeUrl(u) {
    u = String(u || "").trim();
    if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u)) return "https://" + u;
    return "";
  }
  function sanitize(html) {
    var doc = new DOMParser().parseFromString("<div>" + String(html || "") + "</div>", "text/html"), out = "";
    function walk(node) {
      node.childNodes.forEach(function (n) {
        if (n.nodeType === 3) { out += esc(n.nodeValue); return; }
        if (n.nodeType !== 1) return;
        var t = n.tagName.toLowerCase();
        if (t === "br") { out += "<br>"; return; }
        if (t === "script" || t === "style") return;
        var map = { b: "b", strong: "b", i: "i", em: "i", u: "u", p: "p", div: "p", a: "a" }, tag = map[t];
        if (tag === "a") { var href = safeUrl(n.getAttribute("href")); if (href) { out += '<a href="' + esc(href) + '">'; walk(n); out += "</a>"; } else walk(n); return; }
        if (tag) { out += "<" + tag + ">"; walk(n); out += "</" + tag + ">"; return; }
        walk(n);
      });
    }
    walk(doc.body.firstChild);
    return out.replace(/<p><\/p>/g, "").slice(0, 20000);
  }
  function plain(html) { var d = new DOMParser().parseFromString("<div>" + String(html || "").replace(/<br>/g, "\n").replace(/<\/p>/g, "\n\n") + "</div>", "text/html"); return d.body.textContent.replace(/\n{3,}/g, "\n\n").trim(); }

  // ---------- data ----------
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function num(v, lo, hi, d) { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
  function str(x, n) { return typeof x === "string" ? x.slice(0, n) : ""; }
  function img(x) { x = str(x, 3000000); return /^data:image\/(png|jpeg|gif|webp);base64,/.test(x) ? x : safeUrl(x) && /^https?:/.test(safeUrl(x)) ? safeUrl(x) : ""; }
  function align(a) { return ["left", "center", "right"].indexOf(a) >= 0 ? a : "left"; }
  function newBlock(t) {
    var b = { id: uid(), t: t };
    if (t === "heading") Object.assign(b, { html: "Your headline here", size: 28, align: "left" });
    if (t === "text") Object.assign(b, { html: "<p>Write something your readers care about. Keep paragraphs short, and link to the details.</p>", size: 16, align: "left" });
    if (t === "image") Object.assign(b, { src: "", alt: "", width: 100, link: "", align: "center" });
    if (t === "button") Object.assign(b, { label: "Read more", url: "https://", bg: "#0e7490", color: "#ffffff", align: "center", radius: 6 });
    if (t === "columns") Object.assign(b, { cols: [{ src: "", alt: "", html: "<p><b>First item</b><br>A short description.</p>" }, { src: "", alt: "", html: "<p><b>Second item</b><br>A short description.</p>" }] });
    if (t === "divider") Object.assign(b, { color: "#e5e7eb", thick: 1 });
    if (t === "spacer") Object.assign(b, { h: 24 });
    if (t === "social") Object.assign(b, { links: [{ label: "Instagram", url: "" }, { label: "Facebook", url: "" }, { label: "X", url: "" }, { label: "LinkedIn", url: "" }], align: "center" });
    if (t === "footer") Object.assign(b, { html: "<p>Your company · Street, City · Country<br>You are receiving this because you signed up on our website.</p>", size: 12, align: "center" });
    return b;
  }
  function cleanBlock(b) {
    if (!b || !TYPES.some(function (x) { return x[0] === b.t; })) return null;
    var o = newBlock(b.t); o.id = str(b.id, 40) || uid();
    if ("html" in o) o.html = sanitize(b.html);
    if ("size" in o) o.size = Math.round(num(b.size, 10, 48, o.size));
    if ("align" in o) o.align = align(b.align);
    if (b.t === "image") { o.src = img(b.src); o.alt = str(b.alt, 200); o.width = Math.round(num(b.width, 10, 100, 100)); o.link = safeUrl(b.link); }
    if (b.t === "button") { o.label = str(b.label, 80) || "Button"; o.url = safeUrl(b.url) || "https://"; o.bg = HEX.test(b.bg) ? b.bg : o.bg; o.color = HEX.test(b.color) ? b.color : o.color; o.radius = Math.round(num(b.radius, 0, 40, 6)); }
    if (b.t === "columns") o.cols = [0, 1].map(function (i) { var c = (b.cols || [])[i] || {}; return { src: img(c.src), alt: str(c.alt, 200), html: sanitize(c.html) }; });
    if (b.t === "divider") { o.color = HEX.test(b.color) ? b.color : o.color; o.thick = Math.round(num(b.thick, 1, 8, 1)); }
    if (b.t === "spacer") o.h = Math.round(num(b.h, 4, 120, 24));
    if (b.t === "social") o.links = (Array.isArray(b.links) ? b.links : []).slice(0, 8).map(function (l) { return { label: str((l || {}).label, 30), url: safeUrl((l || {}).url) }; });
    return o;
  }
  function blank() { return { v: 1, name: "", settings: { bg: "#f2f4f7", content: "#ffffff", width: 600, font: "arial", text: "#1f2933", link: "#0e7490", pre: "", dir: "ltr" }, blocks: [newBlock("heading"), newBlock("text"), newBlock("button"), newBlock("footer")] }; }
  function clean(d) {
    if (!d || typeof d !== "object" || !Array.isArray(d.blocks)) return null;
    var p = blank(), s = d.settings || {};
    p.name = str(d.name, 100);
    p.settings = { bg: HEX.test(s.bg) ? s.bg : "#f2f4f7", content: HEX.test(s.content) ? s.content : "#ffffff", width: Math.round(num(s.width, 480, 760, 600)), font: FONTS[s.font] ? s.font : "arial",
      text: HEX.test(s.text) ? s.text : "#1f2933", link: HEX.test(s.link) ? s.link : "#0e7490", pre: str(s.pre, 200), dir: s.dir === "rtl" ? "rtl" : "ltr" };
    p.blocks = d.blocks.slice(0, 200).map(cleanBlock).filter(Boolean);
    return p;
  }
  var D = clean(S3.store(KEY)) || blank();
  var save = S3.debounce(function () { if (S3.store(KEY, D) === undefined) S3.toast("Couldn't save in this browser (big uploaded images?). Save a project file.", "error"); }, 300);
  var sel = D.blocks[0] ? D.blocks[0].id : null;

  // ---------- undo ----------
  var past = [], future = [], lastPush = 0;
  function change(fn, opts) {
    var now = Date.now();
    if (!(opts && opts.group) || now - lastPush > 900) { past.push(JSON.stringify(D)); if (past.length > 100) past.shift(); future = []; }
    lastPush = now; fn(); save(); preview(); if (!(opts && opts.keepPanel)) { layers(); inspector(); }
  }
  function undo() { if (!past.length) return; future.push(JSON.stringify(D)); D = clean(JSON.parse(past.pop())); lastPush = 0; save(); renderAll(); }
  function redo() { if (!future.length) return; past.push(JSON.stringify(D)); D = clean(JSON.parse(future.pop())); lastPush = 0; save(); renderAll(); }

  // ---------- email HTML ----------
  function blockHtml(b, s, pad) {
    var font = FONTS[s.font][1], base = "font-family:" + font + ";color:" + s.text + ";";
    // in a right-to-left email, "left" means the start of the line, which is on the right
    function A(a) { return s.dir === "rtl" ? (a === "left" ? "right" : a === "right" ? "left" : a) : a; }
    var td = function (inner, extra) { return '<tr><td data-b="' + b.id + '" style="padding:' + pad + ';' + (extra || "") + '">' + inner + "</td></tr>"; };
    function rich(html, size, al) { return '<div style="' + base + "font-size:" + size + "px;line-height:1.55;text-align:" + A(al) + ';">' + html.replace(/<p>/g, '<p style="margin:0 0 12px;">').replace(/<a href=/g, '<a style="color:' + s.link + ';" href=') + "</div>"; }
    function image(src, alt, w, link, al, maxW) {
      if (!src) return PREVIEW ? '<div style="' + base + 'background:#eef1f4;color:#8a94a3;text-align:center;padding:36px 8px;font-size:13px;">Image: add a picture or its web address</div>' : "";
      al = A(al);
      var px = Math.round(maxW * w / 100);
      // the editor never loads pictures from the web (no network): it shows where they will be instead
      if (PREVIEW && /^https?:/i.test(src)) return '<div style="' + base + 'background:#e8f3f3;color:#2f6f6d;text-align:center;padding:30px 8px;font-size:12.5px;max-width:' + px + 'px;' + (al === "center" ? "margin:0 auto;" : al === "right" ? "margin-left:auto;" : "") + 'word-break:break-all;">Picture from the web, shown when the email is opened:<br>' + esc(src.replace(/^https?:\/\//, "").slice(0, 80)) + "</div>";
      var tag = '<img src="' + esc(src) + '" alt="' + esc(alt) + '" width="' + px + '" style="display:block;width:100%;max-width:' + px + 'px;height:auto;border:0;' + (al === "center" ? "margin:0 auto;" : al === "right" ? "margin-left:auto;" : "") + '">';
      return link ? '<a href="' + esc(link) + '">' + tag + "</a>" : tag;
    }
    var inner = s.width - 64;
    switch (b.t) {
      case "heading": return td('<h1 style="margin:0;' + base + "font-size:" + b.size + "px;line-height:1.25;font-weight:bold;text-align:" + A(b.align) + ';">' + b.html.replace(/<\/?p>/g, "") + "</h1>");
      case "text": return td(rich(b.html, b.size, b.align));
      case "footer": return td(rich(b.html, b.size, b.align), "color:#6b7280;");
      case "image": if (!b.src && !PREVIEW) return ""; return td(image(b.src, b.alt, b.width, b.link, b.align, inner), "text-align:" + A(b.align) + ";");
      case "button":
        return td('<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="' + A(b.align) + '" style="margin:0 ' + (b.align === "center" ? "auto" : "0") + ';"><tr><td bgcolor="' + b.bg + '" style="border-radius:' + b.radius + 'px;background:' + b.bg + ';">' +
          '<a href="' + esc(b.url) + '" style="display:inline-block;padding:13px 26px;font-family:' + font + ";font-size:16px;font-weight:bold;color:" + b.color + ";text-decoration:none;border-radius:" + b.radius + 'px;">' + esc(b.label) + "</a></td></tr></table>");
      case "divider": return td('<div style="border-top:' + b.thick + "px solid " + b.color + ';font-size:0;line-height:0;">&nbsp;</div>');
      case "spacer": return '<tr><td data-b="' + b.id + '" style="height:' + b.h + "px;font-size:0;line-height:0;\">&nbsp;</td></tr>";
      case "columns":
        var cw = Math.floor((inner - 24) / 2);
        return td('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' + b.cols.map(function (c, i) {
          return '<td class="eb-col" width="50%" valign="top" style="width:50%;padding-' + (i ? "left" : "right") + ':12px;">' + image(c.src, c.alt, 100, "", "left", cw) + '<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>' + rich(c.html, 15, "left") + "</td>";
        }).join("") + "</tr></table>");
      case "social":
        var ls = b.links.filter(function (l) { return l.label && l.url; });
        if (!ls.length) return PREVIEW ? td('<div style="' + base + 'font-size:13px;color:#8a94a3;text-align:' + A(b.align) + ';">Social links: add your profile addresses</div>') : "";
        return td('<div style="' + base + "font-size:14px;text-align:" + A(b.align) + ';">' + ls.map(function (l) { return '<a href="' + esc(l.url) + '" style="color:' + s.link + ';text-decoration:none;font-weight:bold;">' + esc(l.label) + "</a>"; }).join(' <span style="color:#c0c6cf;">&nbsp;·&nbsp;</span> ') + "</div>");
    }
    return "";
  }
  var RESP = ".eb-wrap{width:100% !important;max-width:100% !important}.eb-col{display:block !important;width:100% !important;padding-left:0 !important;padding-right:0 !important;padding-bottom:18px !important}.eb-pad{padding-left:20px !important;padding-right:20px !important}";
  function bodyHtml(opts) {
    var s = D.settings, pad = "12px 32px";
    var rows = D.blocks.map(function (b) { return blockHtml(b, s, pad).replace('style="padding:' + pad, 'class="eb-pad" style="padding:' + pad); }).join("");
    return '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">' + esc(s.pre) + "&#8202;</div>" +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + s.bg + '" style="background:' + s.bg + ';"><tr><td align="center" style="padding:24px 10px;">' +
      "<!--[if mso]><table role=\"presentation\" width=\"" + s.width + "\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td><![endif]-->" +
      '<table role="presentation" class="eb-wrap" width="' + s.width + '" cellpadding="0" cellspacing="0" border="0" dir="' + s.dir + '" style="width:' + s.width + "px;max-width:" + s.width + "px;background:" + s.content + ';border-radius:6px;">' +
      '<tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>' + rows + '<tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>' +
      "</table><!--[if mso]></td></tr></table><![endif]-->" +
      "</td></tr></table>";
  }
  function emailHtml() {
    var s = D.settings;
    return '<!doctype html>\n<html lang="' + (s.dir === "rtl" ? "ar" : "en") + '" dir="' + s.dir + '" xmlns="http://www.w3.org/1999/xhtml">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<meta http-equiv="X-UA-Compatible" content="IE=edge">\n<meta name="x-apple-disable-message-reformatting">\n<title>' + esc(D.name || "Email") + "</title>\n" +
      "<style>\nbody{margin:0;padding:0;width:100% !important;-webkit-text-size-adjust:100%;}\ntable{border-collapse:collapse;}\nimg{border:0;outline:none;text-decoration:none;}\na{color:" + s.link + ";}\n@media only screen and (max-width:" + (s.width + 20) + "px){" + RESP + "}\n</style>\n</head>\n" +
      '<body style="margin:0;padding:0;background:' + s.bg + ';">\n' + bodyHtml() + "\n</body>\n</html>\n";
  }
  function plainText() {
    var out = [];
    D.blocks.forEach(function (b) {
      if (b.t === "heading") out.push(plain(b.html).toUpperCase());
      else if (b.t === "text" || b.t === "footer") out.push(plain(b.html));
      else if (b.t === "button") out.push(b.label + ": " + b.url);
      else if (b.t === "image" && b.link) out.push((b.alt || "Image") + ": " + b.link);
      else if (b.t === "columns") b.cols.forEach(function (c) { out.push(plain(c.html)); });
      else if (b.t === "divider") out.push("----");
      else if (b.t === "social") out.push(b.links.filter(function (l) { return l.url; }).map(function (l) { return l.label + ": " + l.url; }).join("\n"));
    });
    return out.filter(Boolean).join("\n\n") + "\n";
  }

  // ---------- preview (shadow DOM keeps the email's styles away from the page) ----------
  var PREVIEW = false;
  var host = $("#eb-host"), shadow = host.attachShadow ? host.attachShadow({ mode: "open" }) : null, device = window.innerWidth < 700 ? "mobile" : "desktop";
  function preview() {
    var s = D.settings, root = shadow || host;
    var css = "<style>:host{display:block}*{box-sizing:border-box}img{max-width:100%}table{border-collapse:collapse}a{color:" + s.link + "}" +
      ".m " + RESP.replace(/}\./g, "}.m .") + "[data-b]{cursor:pointer;transition:box-shadow 120ms}[data-b]:hover{box-shadow:inset 0 0 0 1px rgba(14,159,154,.45)}[data-b].sel{box-shadow:inset 0 0 0 2px #0e9f9a}</style>";
    PREVIEW = true;
    root.innerHTML = css + '<div class="' + (device === "mobile" ? "m" : "") + '">' + bodyHtml() + "</div>"; // all user text inside is escaped or sanitised
    PREVIEW = false;
    var cur = root.querySelector('[data-b="' + sel + '"]'); if (cur) cur.classList.add("sel");
    $("#eb-stage").setAttribute("data-device", device);
    stats();
  }
  (shadow || host).addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-b]"); e.preventDefault();
    if (t) { sel = t.getAttribute("data-b"); preview(); layers(); inspector(); }
  });

  // ---------- UI helpers ----------
  function icon(nm) { var s = h("span", { "class": "eb-ic", "aria-hidden": "true" }); s.innerHTML = S3.icon(nm); return s; }
  function btn(label, onclick, cls, ic, title) {
    return h("button", { type: "button", "class": "btn " + (cls || ""), onclick: onclick, title: title || null, "aria-label": title || null }, ic ? [icon(ic)].concat(label ? [label] : []) : [label]);
  }
  function blk() { for (var i = 0; i < D.blocks.length; i++) if (D.blocks[i].id === sel) return D.blocks[i]; return null; }
  function field(label, el) { return h("label", { "class": "field" }, [label, el]); }
  function inputFor(o, key, type, ph, clean2) {
    var el = h("input", { "class": "input", type: type || "text", placeholder: ph || "", dir: type === "url" ? "ltr" : "auto" });
    el.value = o[key] == null ? "" : String(o[key]);
    el.addEventListener("input", function () { change(function () { o[key] = clean2 ? clean2(el.value) : el.value.slice(0, 200); }, { group: true, keepPanel: true }); });
    return el;
  }
  function colorFor(o, key, label) {
    var el = h("input", { type: "color", value: o[key], "aria-label": label });
    el.addEventListener("input", function () { change(function () { o[key] = el.value; }, { group: true, keepPanel: true }); });
    return h("label", { "class": "field eb-color" }, [label, el]);
  }
  function rangeFor(o, key, label, min, max, unit) {
    var out = h("output", { "class": "eb-val" }), el = h("input", { type: "range", min: String(min), max: String(max), value: String(o[key]), "aria-label": label });
    out.textContent = o[key] + (unit || "");
    el.addEventListener("input", function () { out.textContent = el.value + (unit || ""); change(function () { o[key] = +el.value; }, { group: true, keepPanel: true }); });
    return h("label", { "class": "field" }, [h("span", { "class": "row between" }, [label, out]), el]);
  }
  function alignFor(o) {
    var g = h("div", { "class": "seg", role: "group", "aria-label": "Alignment" });
    [["left", "Left"], ["center", "Centre"], ["right", "Right"]].forEach(function (a) {
      g.appendChild(h("button", { type: "button", "aria-pressed": String(o.align === a[0]), onclick: function () { change(function () { o.align = a[0]; }); } }, [a[1]]));
    });
    return h("div", { "class": "field" }, ["Alignment", g]);
  }
  // small rich text editor: contenteditable + bold/italic/link, saved through sanitize()
  function richFor(o, key, label) {
    var ed = h("div", { "class": "eb-rich", contenteditable: "true", role: "textbox", "aria-multiline": "true", "aria-label": label, dir: D.settings.dir });
    ed.innerHTML = o[key]; // already sanitised
    function cmd(c) { ed.focus(); document.execCommand(c, false, null); sync(); }
    function link() {
      var u = prompt("Link address (https://…)", "https://"); if (u == null) return;
      var su = safeUrl(u); if (!su) return S3.toast("That isn't a web, email or phone link", "error");
      ed.focus(); document.execCommand("createLink", false, su); sync();
    }
    function sync() { change(function () { o[key] = sanitize(ed.innerHTML); }, { group: true, keepPanel: true }); }
    ed.addEventListener("input", sync);
    ed.addEventListener("paste", function (e) { e.preventDefault(); var t = (e.clipboardData || window.clipboardData).getData("text/plain"); document.execCommand("insertText", false, t); });
    ed.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); link(); } });
    var bar = h("div", { "class": "row eb-rbar" }, [btn("B", function () { cmd("bold"); }, "small eb-b", "", "Bold (Ctrl+B)"), btn("I", function () { cmd("italic"); }, "small eb-i", "", "Italic (Ctrl+I)"),
      btn("Link", link, "small", "", "Link (Ctrl+K)"), btn("Clear", function () { cmd("removeFormat"); cmd("unlink"); }, "small ghost", "", "Remove formatting")]);
    return h("div", { "class": "field" }, [label, bar, ed]);
  }
  function imageFor(o, keySrc, keyAlt) {
    var url = h("input", { "class": "input", type: "url", placeholder: "https://example.com/picture.jpg", dir: "ltr" });
    url.value = /^data:/.test(o[keySrc]) ? "" : o[keySrc];
    url.addEventListener("change", function () { var v = url.value.trim(); if (v && !/^https?:\/\//i.test(safeUrl(v))) { S3.toast("Use a web address starting with https://", "error"); return; } change(function () { o[keySrc] = v ? safeUrl(v) : ""; }); });
    var up = btn("Upload", function () {
      var inp = h("input", { type: "file", accept: "image/*", hidden: true });
      inp.addEventListener("change", function () {
        var f = inp.files[0]; inp.remove(); if (!f) return;
        var u = URL.createObjectURL(f), im = new Image();
        im.onload = function () {
          var sc = Math.min(1, 1200 / im.naturalWidth), c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * sc); c.height = Math.round(im.naturalHeight * sc);
          var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
          var data = c.toDataURL(f.type === "image/png" ? "image/png" : "image/jpeg", .85);
          change(function () { o[keySrc] = data; });
          S3.toast("Added. Most email apps block uploaded images: put the picture online and paste its address for sending.");
        };
        im.onerror = function () { URL.revokeObjectURL(u); S3.toast("Couldn't read that image", "error"); };
        im.src = u;
      });
      document.body.appendChild(inp); inp.click();
    }, "small", "upload");
    return h("div", { "class": "stack" }, [field("Image web address", url), h("div", { "class": "row" }, [up, o[keySrc] ? btn("Remove", function () { change(function () { o[keySrc] = ""; }); }, "small ghost") : null]),
      field("Description (alt text)", inputFor(o, keyAlt, "text", "What the picture shows"))]);
  }

  // ---------- left panel: add blocks, layers, settings ----------
  var leftTab = "blocks";
  function left() {
    var p = $("#eb-left"); p.textContent = "";
    var tabs = h("div", { "class": "seg eb-ltabs", role: "group", "aria-label": "Panel" }, [["blocks", "Blocks"], ["settings", "Email settings"]].map(function (t) {
      return h("button", { type: "button", "aria-pressed": String(leftTab === t[0]), onclick: function () { leftTab = t[0]; left(); } }, [t[1]]);
    }));
    p.appendChild(tabs);
    var card = h("div", { "class": "card eb-lcard" }); p.appendChild(card);
    if (leftTab === "blocks") {
      card.appendChild(h("h2", { text: "Add a block" }));
      card.appendChild(h("div", { "class": "eb-palette" }, TYPES.map(function (t) {
        return h("button", { type: "button", "class": "eb-pal", "data-type": t[0], onclick: function () { add(t[0]); } }, [t[1]]);
      })));
      card.appendChild(h("h2", { "class": "eb-h2b", text: "Layers" }));
      card.appendChild(h("div", { id: "eb-layers", "class": "eb-layers" }));
      layers();
    } else {
      var s = D.settings;
      var font = h("select", { "class": "select" }, Object.keys(FONTS).map(function (k) { return h("option", { value: k, text: FONTS[k][0] }); })); font.value = s.font;
      font.addEventListener("change", function () { change(function () { s.font = font.value; }); });
      var dir = h("select", { "class": "select" }, [h("option", { value: "ltr", text: "Left to right" }), h("option", { value: "rtl", text: "Right to left (Arabic)" })]); dir.value = s.dir;
      dir.addEventListener("change", function () { change(function () { s.dir = dir.value; }); inspector(); });
      card.appendChild(h("div", { "class": "stack" }, [
        field("Preview text (shown after the subject in the inbox)", inputFor(s, "pre", "text", "A short summary of this email")),
        field("Font", font), field("Direction", dir), rangeFor(s, "width", "Content width", 480, 760, " px"),
        h("div", { "class": "eb-colors" }, [colorFor(s, "bg", "Page"), colorFor(s, "content", "Content"), colorFor(s, "text", "Text"), colorFor(s, "link", "Links")])
      ]));
    }
  }
  var dragId = null;
  function layers() {
    var box = $("#eb-layers"); if (!box) return; box.textContent = "";
    if (!D.blocks.length) box.appendChild(h("p", { "class": "faint", text: "No blocks yet. Add one above." }));
    D.blocks.forEach(function (b, i) {
      var label = (TYPES.filter(function (t) { return t[0] === b.t; })[0] || [0, b.t])[1], hint = b.html ? plain(b.html).slice(0, 34) : b.label || b.alt || "";
      var row = h("div", { "class": "eb-layer" + (b.id === sel ? " is-sel" : ""), draggable: "true", "data-id": b.id }, [
        h("button", { type: "button", "class": "eb-lname", onclick: function () { sel = b.id; preview(); layers(); inspector(); } }, [h("b", { text: label }), h("span", { "class": "faint", dir: "auto", text: hint })]),
        btn("↑", function () { move(i, -1); }, "ghost icon small", "", "Move up"), btn("↓", function () { move(i, 1); }, "ghost icon small", "", "Move down")
      ]);
      row.addEventListener("dragstart", function (e) { dragId = b.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", b.id); row.classList.add("is-drag"); });
      row.addEventListener("dragend", function () { dragId = null; row.classList.remove("is-drag"); });
      row.addEventListener("dragover", function (e) { if (dragId && dragId !== b.id) { e.preventDefault(); row.classList.add("is-over"); } });
      row.addEventListener("dragleave", function () { row.classList.remove("is-over"); });
      row.addEventListener("drop", function (e) {
        e.preventDefault(); row.classList.remove("is-over"); if (!dragId) return;
        var from = D.blocks.findIndex(function (x) { return x.id === dragId; }), to = D.blocks.indexOf(b);
        change(function () { var m = D.blocks.splice(from, 1)[0]; D.blocks.splice(to, 0, m); });
      });
      box.appendChild(row);
    });
  }
  function add(t) { var b = newBlock(t), i = D.blocks.findIndex(function (x) { return x.id === sel; }); change(function () { D.blocks.splice(i < 0 ? D.blocks.length : i + 1, 0, b); sel = b.id; }); scrollToSel(); }
  function move(i, d) { var j = i + d; if (j < 0 || j >= D.blocks.length) return; change(function () { var m = D.blocks.splice(i, 1)[0]; D.blocks.splice(j, 0, m); }); }
  function scrollToSel() { var root = shadow || host, el = root.querySelector('[data-b="' + sel + '"]'); if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" }); }

  // ---------- right panel: edit selected block ----------
  function inspector() {
    var p = $("#eb-right"); p.textContent = "";
    var b = blk();
    if (!b) { p.appendChild(h("div", { "class": "empty" }, [h("b", { text: "Nothing selected" }), h("span", { text: "Click a block in the preview, or add one from Blocks." })])); return; }
    var name = (TYPES.filter(function (t) { return t[0] === b.t; })[0] || [0, b.t])[1];
    p.appendChild(h("div", { "class": "row between eb-ihead" }, [h("h2", { text: name }), h("div", { "class": "row" }, [
      btn("", function () { var c = cleanBlock(JSON.parse(JSON.stringify(b))); c.id = uid(); var i = D.blocks.indexOf(b); change(function () { D.blocks.splice(i + 1, 0, c); sel = c.id; }); }, "ghost icon small", "copy", "Duplicate"),
      btn("", function () {
        var before = JSON.stringify(D), i = D.blocks.indexOf(b);
        change(function () { D.blocks.splice(i, 1); sel = D.blocks[Math.min(i, D.blocks.length - 1)] ? D.blocks[Math.min(i, D.blocks.length - 1)].id : null; });
        var t = S3.toast("Block deleted "); t.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { D = clean(JSON.parse(before)); save(); renderAll(); t.remove(); } }, ["Undo"]));
      }, "ghost icon small eb-del", "trash", "Delete")])]));
    var f = h("div", { "class": "stack" }); p.appendChild(f);
    if (b.t === "heading") { f.appendChild(richFor(b, "html", "Heading")); f.appendChild(rangeFor(b, "size", "Size", 18, 44, " px")); f.appendChild(alignFor(b)); }
    if (b.t === "text" || b.t === "footer") { f.appendChild(richFor(b, "html", "Text")); f.appendChild(rangeFor(b, "size", "Size", 10, 24, " px")); f.appendChild(alignFor(b)); }
    if (b.t === "image") { f.appendChild(imageFor(b, "src", "alt")); f.appendChild(field("Link when clicked (optional)", inputFor(b, "link", "url", "https://", safeUrl))); f.appendChild(rangeFor(b, "width", "Width", 10, 100, "%")); f.appendChild(alignFor(b)); }
    if (b.t === "button") {
      f.appendChild(field("Button text", inputFor(b, "label", "text", "Read more")));
      f.appendChild(field("Link", inputFor(b, "url", "url", "https://", function (v) { return safeUrl(v) || "https://"; })));
      f.appendChild(h("div", { "class": "eb-colors" }, [colorFor(b, "bg", "Button"), colorFor(b, "color", "Text")]));
      f.appendChild(rangeFor(b, "radius", "Rounded corners", 0, 30, " px")); f.appendChild(alignFor(b));
    }
    if (b.t === "columns") b.cols.forEach(function (c, i) { f.appendChild(h("h3", { "class": "eb-h3", text: (i ? "Right" : "Left") + " column" })); f.appendChild(imageFor(c, "src", "alt")); f.appendChild(richFor(c, "html", "Text")); });
    if (b.t === "divider") { f.appendChild(colorFor(b, "color", "Colour")); f.appendChild(rangeFor(b, "thick", "Thickness", 1, 8, " px")); }
    if (b.t === "spacer") f.appendChild(rangeFor(b, "h", "Height", 4, 120, " px"));
    if (b.t === "social") {
      b.links.forEach(function (l, i) {
        f.appendChild(h("div", { "class": "eb-social" }, [inputFor(l, "label", "text", "Name"), inputFor(l, "url", "url", "https://…", safeUrl),
          btn("", function () { change(function () { b.links.splice(i, 1); }); }, "ghost icon small", "x", "Remove link")]));
      });
      if (b.links.length < 8) f.appendChild(btn("Add link", function () { change(function () { b.links.push({ label: "", url: "" }); }); }, "small", "plus"));
      f.appendChild(alignFor(b));
    }
  }

  // ---------- export ----------
  function fileBase() { return (D.name || "").replace(/[^A-Za-z0-9 _.-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 50).replace(/ /g, "-").toLowerCase() || "email"; }
  function exportDialog() {
    var html = emailHtml(), hasData = /src="data:/.test(html);
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Export" });
    var sheet = h("div", { "class": "s3-sheet" }, [
      h("div", { "class": "row between" }, [h("h2", { text: "Export your email" }), btn("", close, "ghost icon", "x", "Close")]),
      h("p", { text: "Email-safe HTML (tables and inline styles) that works in Gmail, Outlook and Apple Mail. Paste it into Mailchimp, Brevo, MailerLite or any tool that accepts custom HTML. No limits." }),
      hasData ? h("p", { "class": "eb-warn", text: "This email contains uploaded images. Many email apps won't show them: put the pictures online and use their web addresses." }) : null,
      h("div", { "class": "row" }, [
        btn("Download .html", function () { S3.download(html, fileBase() + ".html", "text/html"); S3.done(); }, "primary", "download"),
        btn("Copy HTML", function () { S3.copy(html, "HTML copied"); S3.done(); }, "", "copy"),
        btn("Plain-text version", function () { S3.download(plainText(), fileBase() + ".txt", "text/plain"); }, "ghost", "file")
      ]),
      h("p", { "class": "faint", text: (Math.round(html.length / 102.4) / 10) + " KB. Gmail cuts off emails bigger than about 100 KB." })
    ]);
    m.appendChild(sheet);
    function close() { m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m); sheet.querySelector(".btn.primary").focus();
  }


  // ---------- files, templates, help ----------
  function replace(d2, msg) {
    var before = JSON.stringify(D);
    D = d2; sel = D.blocks[0] ? D.blocks[0].id : null; past.push(before); future = []; save(); renderAll();
    var t = S3.toast(msg + " "); t.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { undo(); t.remove(); } }, ["Undo"]));
  }
  function saveProject() { S3.download(JSON.stringify(Object.assign({ app: "s3eidat-email-builder", saved: new Date().toISOString() }, D)), fileBase() + ".email.json", "application/json"); S3.done(); }
  function openProject() {
    var inp = h("input", { type: "file", accept: ".json,application/json", hidden: true });
    inp.addEventListener("change", function () {
      var f = inp.files[0]; inp.remove(); if (!f) return;
      S3.readFile(f, "text").then(function (txt) { var d; try { d = clean(JSON.parse(txt)); } catch (e) { d = null; } if (!d) return S3.toast("That isn't an Email Builder project", "error"); replace(d, "Opened " + (d.name || "email")); });
    });
    document.body.appendChild(inp); inp.click();
  }
  function B(t, o) { return Object.assign(newBlock(t), o || {}); }
  function template(kind) {
    var d = blank(), st2 = d.settings;
    if (kind === "newsletter") {
      d.name = "Monthly newsletter"; st2.pre = "This month: three things worth your time"; st2.bg = "#eef2f6"; st2.link = "#2563eb";
      d.blocks = [B("heading", { html: "This month at Your Company", size: 30 }), B("text", { html: "<p>Hi there,</p><p>Here is a short round-up of what we worked on, what's coming next, and one thing we think you'll like.</p>" }),
        B("image", { alt: "Feature picture" }), B("heading", { html: "1. The big news", size: 22 }), B("text", { html: "<p>Describe the most important update in two or three sentences. Say why it matters to the reader.</p>" }),
        B("button", { label: "Read the full story", bg: "#2563eb" }), B("divider"),
        B("columns", { cols: [{ src: "", alt: "", html: "<p><b>2. Second story</b><br>A short teaser that makes people click.</p>" }, { src: "", alt: "", html: "<p><b>3. Third story</b><br>Another short teaser with a link.</p>" }] }),
        B("divider"), B("social", { links: [{ label: "Instagram", url: "" }, { label: "LinkedIn", url: "" }, { label: "Website", url: "" }] }), B("footer")];
    } else if (kind === "announce") {
      d.name = "Announcement"; st2.pre = "Something new is here"; st2.bg = "#111827"; st2.content = "#ffffff"; st2.link = "#db2777";
      d.blocks = [B("spacer", { h: 12 }), B("heading", { html: "Introducing something new", size: 34, align: "center" }), B("text", { html: "<p>One sentence that explains what it is and who it is for.</p>", size: 18, align: "center" }),
        B("image", { alt: "Product picture" }), B("button", { label: "See it now", bg: "#db2777", align: "center" }), B("text", { html: "<p>Questions? Just reply to this email.</p>", size: 14, align: "center" }), B("footer")];
    } else if (kind === "event") {
      d.name = "Event invitation"; st2.pre = "You're invited"; st2.bg = "#f4f1ea"; st2.link = "#b45309"; st2.font = "georgia";
      d.blocks = [B("heading", { html: "You're invited", size: 34, align: "center" }), B("text", { html: "<p>Join us for an evening of talks, food and good company.</p>", size: 18, align: "center" }), B("divider", { color: "#e2d8c3" }),
        B("text", { html: "<p><b>When:</b> Thursday, 20 November, 7:00 pm<br><b>Where:</b> Venue name, Street, City<br><b>Dress code:</b> Smart casual</p>", align: "center" }),
        B("button", { label: "RSVP", bg: "#b45309", align: "center" }), B("text", { html: "<p>Please let us know by 15 November.</p>", size: 14, align: "center" }), B("footer")];
    } else {
      d.name = "Welcome email"; st2.pre = "Thanks for joining. Here's how to get started"; st2.link = "#0e7490";
      d.blocks = [B("heading", { html: "Welcome aboard!", size: 30 }), B("text", { html: "<p>Thanks for signing up. Here are three quick ways to get the most out of it:</p><p><b>1.</b> Set up your profile.<br><b>2.</b> Try your first project.<br><b>3.</b> Invite a friend.</p>" }),
        B("button", { label: "Get started" }), B("text", { html: "<p>If you have any questions, just reply. A real person reads every message.</p>" }), B("footer")];
    }
    replace(clean(d), "Template loaded");
  }
  function help() {
    var keys = [["↑ ↓", "Select the block above / below"], ["Del", "Delete the selected block"], ["Ctrl+B / Ctrl+I", "Bold / italic in text"], ["Ctrl+K", "Add a link in text"], ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"], ["?", "Show this help"]];
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Keyboard shortcuts" });
    var sheet = h("div", { "class": "s3-sheet" }, [h("div", { "class": "row between" }, [h("h2", { text: "Keyboard shortcuts" }), btn("", close, "ghost icon", "x", "Close")]),
      h("div", { "class": "eb-keys" }, keys.map(function (k) { return h("div", { "class": "row" }, [h("kbd", { text: k[0] }), h("span", { "class": "muted", text: k[1] })]); }))]);
    m.appendChild(sheet);
    function close() { m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m); sheet.querySelector("button").focus();
  }

  // ---------- self-test (works on a copy; the real email is put back) ----------
  window.S3_SELFTEST = async function () {
    var real = D, ok = true;
    function expect(c) { if (!c) ok = false; }
    try {
      expect(sanitize('<p onclick="x()">Hi <b>there</b><script>alert(1)</script><img src=x onerror=y><a href="javascript:alert(1)">bad</a> <a href="https://a.com">ok</a></p>') === '<p>Hi <b>there</b>bad <a href="https://a.com">ok</a></p>');
      expect(sanitize("<div>a</div><strong>b</strong><em>c</em>&lt;tag&gt;") === "<p>a</p><b>b</b><i>c</i>&lt;tag&gt;");
      expect(safeUrl("example.com/x") === "https://example.com/x" && safeUrl("javascript:alert(1)") === "" && safeUrl("mailto:a@b.c") === "mailto:a@b.c");
      var c = clean({ blocks: [{ t: "image", src: "javascript:x" }, { t: "nope" }, { t: "button", url: "data:text/html,x", bg: "red" }], settings: { width: 9999, font: "comic" } });
      expect(c.blocks.length === 2 && c.blocks[0].src === "" && c.blocks[1].url === "https://" && c.blocks[1].bg === "#0e7490" && c.settings.width === 760 && c.settings.font === "arial");
      D = clean({ name: "T <x>", settings: { dir: "rtl", pre: "Pre & co" }, blocks: [{ t: "heading", html: "Hi", align: "left" }, { t: "image", src: "" }, { t: "button", label: "Go", url: "https://a.com" }, { t: "social", links: [] }] });
      var html = emailHtml();
      expect(/^<!doctype html>/.test(html) && html.indexOf("<title>T &lt;x&gt;</title>") > 0 && html.indexOf("Pre &amp; co") > 0 && html.indexOf('dir="rtl"') > 0);
      expect(html.indexOf("text-align:right") > 0 && html.indexOf("add a picture") < 0 && html.indexOf("Social links") < 0 && html.indexOf('href="https://a.com"') > 0);
      expect(new DOMParser().parseFromString(html, "text/html").querySelectorAll("table").length >= 3);
      expect(plainText().indexOf("HI") === 0 && plainText().indexOf("Go: https://a.com") > 0);
    } catch (e) { ok = false; }
    D = real;
    return ok;
  };

  // ---------- page ----------
  function stats() { var kb = Math.round(emailHtml().length / 102.4) / 10; $("#eb-stats").textContent = D.blocks.length + " blocks · " + kb + " KB of HTML · nothing is uploaded"; }
  function pbar() {
    var p = $("#eb-pbar"); p.textContent = "";
    var g = h("div", { "class": "seg", role: "group", "aria-label": "Preview size" }, [["desktop", "Desktop"], ["mobile", "Mobile"]].map(function (d) {
      return h("button", { type: "button", "aria-pressed": String(device === d[0]), onclick: function () { device = d[0]; pbar(); preview(); } }, [d[1]]);
    }));
    p.appendChild(g); p.appendChild(h("span", { "class": "faint", text: "Click a block to edit it" }));
  }
  function renderAll() { $("#eb-name").value = D.name; if (sel && !blk()) sel = D.blocks[0] ? D.blocks[0].id : null; left(); pbar(); preview(); inspector(); }
  function actions() {
    var a = $("#eb-actions");
    a.appendChild(btn("", undo, "ghost icon", "", "Undo (Ctrl+Z)")); a.lastChild.textContent = "↶";
    a.appendChild(btn("", redo, "ghost icon", "", "Redo (Ctrl+Shift+Z)")); a.lastChild.textContent = "↷";
    a.appendChild(btn("?", help, "ghost icon", "", "Keyboard shortcuts (?)"));
    var menu = h("details", { "class": "eb-menu" }, [h("summary", { "class": "btn" }, [icon("file"), "File"])]);
    var list = h("div", { "class": "eb-menu-list", role: "menu" });
    [["New blank email", function () { replace(blank(), "New email"); }], ["Open project file…", openProject], ["Save project file", saveProject], null,
     ["Template: Newsletter", function () { template("newsletter"); }], ["Template: Announcement", function () { template("announce"); }],
     ["Template: Event invitation", function () { template("event"); }], ["Template: Welcome email", function () { template("welcome"); }]].forEach(function (it) {
      if (!it) return list.appendChild(h("hr"));
      list.appendChild(h("button", { type: "button", role: "menuitem", onclick: function () { menu.open = false; it[1](); } }, [it[0]]));
    });
    menu.appendChild(list);
    menu.addEventListener("toggle", function () { if (!menu.open) return; list.style.left = ""; list.style.right = ""; if (list.getBoundingClientRect().left < 8) { list.style.left = "0"; list.style.right = "auto"; } });
    document.addEventListener("click", function (e) { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    a.appendChild(menu);
    a.appendChild(btn("Export", exportDialog, "primary", "download"));
  }
  $("#eb-name").addEventListener("input", function (e) { D.name = e.target.value.slice(0, 100); save(); });
  document.addEventListener("keydown", function (e) {
    if ($(".s3-modal")) return;
    var t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && !typing && !e.altKey) {
      if (e.key === "z" || e.key === "Z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (e.key === "y" || e.key === "Y") { e.preventDefault(); redo(); }
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    var i = D.blocks.findIndex(function (x) { return x.id === sel; });
    if (e.key === "ArrowDown" && i < D.blocks.length - 1) { e.preventDefault(); sel = D.blocks[i + 1].id; preview(); layers(); inspector(); scrollToSel(); }
    else if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); sel = D.blocks[i - 1].id; preview(); layers(); inspector(); scrollToSel(); }
    else if ((e.key === "Delete" || e.key === "Backspace") && i >= 0) { e.preventDefault(); var del = $("#eb-right .eb-del"); if (del) del.click(); }
    else if (e.key === "?") help();
  });
  actions();
  renderAll();
  window.EB = { doc: function () { return D; }, sanitize: sanitize, emailHtml: emailHtml, plainText: plainText, clean: clean, safeUrl: safeUrl };
})();
