/* Link Page: build a link-in-bio page with a live phone preview, export one self-contained HTML file + a QR code.
   Everything stays in this browser (localStorage). User text only ever reaches the DOM through textContent/value,
   and the exported HTML is escaped in core.js before it goes into the sandboxed preview frame. */
(function () {
  "use strict";
  var L = window.LinkCore, $ = S3.$, h = S3.h;
  var page = null, undoStack = [], redoStack = [], lastSnap = 0, popEl = null, tab = "content";
  var EMOJI = ["🔗", "⭐", "🔥", "🎬", "🎧", "📺", "📷", "🛍️", "🛒", "💬", "📩", "✉️", "📞", "📍", "🗓️", "🎟️", "📗", "📄", "✍️", "🎨", "💼", "🎓", "🍳", "☕", "💡", "🎁", "❤️", "👕", "🏷️", "💰", "🌐", "👋"];

  // ---------- storage ----------
  function list() { return S3.store("lp:list") || []; }
  function titleOf(p) { return (p.profile.name || "").trim() || "Untitled page"; }
  function save() {
    page.updated = Date.now();
    var ok = S3.store("lp:p:" + page.id, page) !== undefined;
    var l = list().filter(function (x) { return x.id !== page.id; });
    l.unshift({ id: page.id, name: titleOf(page), n: page.blocks.length, updated: page.updated });
    S3.store("lp:list", l.slice(0, 200)); S3.store("lp:open", page.id);
    if (!ok) S3.toast("Couldn't save in this browser (storage full or blocked). Use Save file.", "error");
  }
  var saveSoon = S3.debounce(save, 400);
  function load(id) { var o = S3.store("lp:p:" + id); try { return o ? L.normalize(o) : null; } catch (e) { return null; } }

  // ---------- undo ----------
  function snap(force) {
    var now = Date.now();
    if (!force && now - lastSnap < 1000) return;
    lastSnap = force ? 0 : now;
    undoStack.push(JSON.stringify(page)); if (undoStack.length > 80) undoStack.shift();
    redoStack = []; syncUndo();
  }
  function syncUndo() { $("#undoBtn").disabled = !undoStack.length; $("#redoBtn").disabled = !redoStack.length; }
  function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(page)); page = L.normalize(JSON.parse(undoStack.pop())); lastSnap = 0; afterLoad(); saveSoon(); }
  function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(page)); page = L.normalize(JSON.parse(redoStack.pop())); lastSnap = 0; afterLoad(); saveSoon(); }

  // structural change: snapshot, change, redraw editor + preview
  function edit(fn, keepEditor) { snap(true); fn(); if (!keepEditor) renderPane(); changed(); }
  // typing change: snapshot at most once a second, no editor redraw
  function typed(fn) { snap(false); fn(); changed(); }
  function changed() { saveSoon(); previewSoon(); $("#pageName").textContent = titleOf(page); if (tab === "publish") renderPublish(); }

  // ---------- small UI helpers ----------
  function closePop() { if (popEl) { popEl.remove(); popEl = null; document.removeEventListener("pointerdown", popOut, true); } }
  function popOut(e) { if (popEl && !popEl.contains(e.target)) closePop(); }
  function pop(anchor, kids) {
    closePop(); popEl = h("div", { "class": "lp-pop" }, kids); document.body.appendChild(popEl);
    var r = anchor.getBoundingClientRect();
    popEl.style.left = Math.max(8, Math.min(window.innerWidth - popEl.offsetWidth - 8, r.left)) + "px";
    var top = r.bottom + 6; if (top + popEl.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - popEl.offsetHeight - 6);
    popEl.style.top = top + "px";
    setTimeout(function () { document.addEventListener("pointerdown", popOut, true); }, 0);
    var f = popEl.querySelector("button"); if (f) f.focus();
  }
  function opt(label, run, hint, cls) { return h("button", { "class": "opt " + (cls || ""), type: "button", onclick: function () { closePop(); run(); } }, [h("span", { dir: "auto", text: label })].concat(hint ? [h("small", { text: hint })] : [])); }
  function sheet(title, body, buttons) {
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": title });
    var box = h("div", { "class": "s3-sheet lp-sheet" }), foot = h("div", { "class": "foot" });
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
    return close;
  }
  function seg(options, value, onPick, label) {
    var s = h("div", { "class": "seg", role: "group", "aria-label": label || "" });
    options.forEach(function (o) {
      s.appendChild(h("button", { type: "button", "aria-pressed": String(o[0] === value), onclick: function () {
        S3.$$("button", s).forEach(function (b) { b.setAttribute("aria-pressed", "false"); }); this.setAttribute("aria-pressed", "true"); onPick(o[0]);
      } }, [o[1]]));
    });
    return s;
  }
  function field(label, control) { return h("label", { "class": "field" }, [label, control]); }
  function colorField(label, value, onInput) {
    var code = h("code", { text: value });
    var inp = h("input", { type: "color", value: value, "aria-label": label });
    inp.addEventListener("input", function () { code.textContent = inp.value; onInput(inp.value); });
    return h("div", { "class": "field" }, [label, h("div", { "class": "lp-color" }, [inp, code])]);
  }
  function sw(on, label, onToggle) {
    var b = h("button", { "class": "lp-sw", type: "button", role: "switch", "aria-checked": String(!!on), "aria-label": label, title: label });
    b.addEventListener("click", function () { var v = b.getAttribute("aria-checked") !== "true"; b.setAttribute("aria-checked", String(v)); onToggle(v); });
    return b;
  }

  // ---------- images ----------
  function loadImage(file) {
    return S3.readFile(file, "dataurl").then(function (url) {
      return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error("bad image")); }; im.src = url; });
    });
  }
  function avatarFrom(file) {
    return loadImage(file).then(function (im) {
      var s = Math.min(im.naturalWidth, im.naturalHeight), n = Math.min(320, s), c = document.createElement("canvas"); c.width = c.height = n;
      var x = c.getContext("2d"); x.drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, n, n);
      var d = x.getImageData(0, 0, n, n).data, alpha = false;
      for (var i = 3; i < d.length; i += 16) if (d[i] < 250) { alpha = true; break; }
      return alpha ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.86);
    });
  }
  function backgroundFrom(file) {
    return loadImage(file).then(function (im) {
      var k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      var x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.8);
    });
  }

  // ---------- preview ----------
  var frame;
  function preview() {
    var y = 0; try { y = frame.contentWindow ? frame.contentWindow.scrollY : 0; } catch (e) {}
    frame.style.background = page.theme.bg.c1;
    frame.onload = function () { try { if (y) frame.contentWindow.scrollTo(0, y); } catch (e) {} };
    frame.srcdoc = L.toHTML(page, { preview: true });
  }
  var previewSoon = S3.debounce(preview, 120);

  // ---------- tabs ----------
  function setTab(t) {
    tab = t; closePop();
    S3.$$("#tabs button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-tab") === t)); });
    $("main.lp").classList.toggle("show-preview", t === "preview");
    ["content", "design", "publish"].forEach(function (k) { $("#pane-" + k).hidden = k !== t; });
    if (t === "preview") { if (window.innerWidth > 960) { setTab("content"); return; } preview(); }
    renderPane();
  }
  function renderPane() { if (tab === "content") renderContent(); else if (tab === "design") renderDesign(); else if (tab === "publish") renderPublish(); }

  // ---------- content tab ----------
  function renderContent() {
    var pane = $("#pane-content"), keep = document.activeElement && document.activeElement.getAttribute("data-k");
    pane.textContent = "";
    pane.appendChild(profileCard());
    pane.appendChild(blocksCard());
    pane.appendChild(socialCard());
    if (keep) { var el = pane.querySelector('[data-k="' + keep + '"]'); if (el) el.focus(); }
  }
  function profileCard() {
    var pr = page.profile;
    var av = h("div", { "class": "lp-av" + (pr.shape === "rounded" ? " rounded" : "") + (pr.avatar ? " has" : ""), role: "button", "aria-label": "Choose a profile picture", title: "Click or drop a photo" });
    if (pr.avatar) av.appendChild(h("img", { src: pr.avatar, alt: "" })); else av.appendChild(h("span", { text: "Add photo" }));
    S3.drop(av, function (files) {
      avatarFrom(files[0]).then(function (url) { edit(function () { page.profile.avatar = url; }); }).catch(function () { S3.toast("Couldn't read that image", "error"); });
    }, { accept: "image/*", multiple: false });
    var name = h("input", { "class": "input", "data-k": "pname", maxlength: "120", dir: "auto", placeholder: "Your name or brand", "aria-label": "Name", value: pr.name });
    name.addEventListener("input", function () { typed(function () { page.profile.name = name.value; }); });
    var bio = h("textarea", { "class": "textarea", "data-k": "pbio", rows: "3", maxlength: "600", dir: "auto", placeholder: "A short line about you", "aria-label": "Bio" });
    bio.value = pr.bio;
    bio.addEventListener("input", function () { typed(function () { page.profile.bio = bio.value; }); });
    var tools = h("div", { "class": "lp-row" }, [
      seg([["circle", "Circle"], ["rounded", "Rounded"]], pr.shape, function (v) { edit(function () { page.profile.shape = v; }); }, "Photo shape"),
      pr.avatar ? h("button", { "class": "btn ghost small", type: "button", onclick: function () { edit(function () { page.profile.avatar = ""; }); } }, ["Remove photo"]) : null
    ]);
    return h("section", { "class": "lp-card" }, [h("h2", { text: "Profile" }),
      h("div", { "class": "lp-prof" }, [av, h("div", { "class": "stack", style: "display:grid;gap:8px" }, [name, bio, tools])])]);
  }
  function blocksCard() {
    var box = h("div", { "class": "lp-blocks", id: "blocks" });
    page.blocks.forEach(function (b, i) { box.appendChild(blockRow(b, i)); });
    if (!page.blocks.length) box.appendChild(h("div", { "class": "empty" }, [h("b", { text: "No links yet" }), "Add your first link below, or paste a list of links."]));
    var add = h("div", { "class": "lp-row" }, [
      h("button", { "class": "btn primary small", type: "button", id: "addLink", onclick: function () { addBlock("link"); } }, [h("span", { html: S3.icon("plus") }), "Link"]),
      h("button", { "class": "btn small", type: "button", onclick: function () { addBlock("header"); } }, ["+ Header"]),
      h("button", { "class": "btn small", type: "button", onclick: function () { addBlock("text"); } }, ["+ Text"]),
      h("button", { "class": "btn ghost small", type: "button", id: "pasteBtn", onclick: pasteSheet }, ["Paste links…"])
    ]);
    var n = page.blocks.filter(function (b) { return b.type === "link"; }).length;
    return h("section", { "class": "lp-card" }, [h("h2", {}, ["Links", h("span", { "class": "faint", style: "font-weight:500;font-size:12.5px", text: n ? n + " link" + (n === 1 ? "" : "s") : "" })]), box, add]);
  }
  function blockRow(b, i) {
    var cls = "lp-blk" + (b.type === "header" ? " hdr" : b.type === "text" ? " txt" : "") + (b.on ? "" : " off") + (b.feat ? " feat" : "");
    var row = h("div", { "class": cls, "data-id": b.id });
    var handle = h("div", { "class": "lp-handle", title: "Drag to reorder", "aria-hidden": "true", text: "⋮⋮" });
    dragWire(handle, row);
    row.appendChild(handle);
    if (b.type === "link") {
      var em = h("button", { "class": "lp-emoji", type: "button", title: "Icon", "aria-label": "Choose an icon", text: b.emoji || "＋" });
      em.addEventListener("click", function () { emojiPop(em, b); });
      row.appendChild(em);
    }
    var f = h("div", { "class": "lp-fields" });
    if (b.type === "text") {
      var ta = h("textarea", { "class": "textarea", rows: "2", maxlength: "1000", dir: "auto", placeholder: "Some text", "aria-label": "Text", "data-k": "t" + b.id });
      ta.value = b.title; ta.addEventListener("input", function () { typed(function () { b.title = ta.value; }); });
      f.appendChild(h("span", { "class": "lp-kind", text: "Text" })); f.appendChild(ta);
    } else {
      if (b.type === "header") f.appendChild(h("span", { "class": "lp-kind", text: "Header" }));
      var t = h("input", { "class": "input t", maxlength: "200", dir: "auto", placeholder: b.type === "header" ? "Section title" : "Button text", "aria-label": b.type === "header" ? "Header text" : "Link title", value: b.title, "data-k": "t" + b.id });
      t.addEventListener("input", function () { typed(function () { b.title = t.value; }); });
      f.appendChild(t);
      if (b.type === "link") {
        var warn = h("div", { "class": "lp-warn", "aria-live": "polite" });
        var u = h("input", { "class": "input u", type: "url", inputmode: "url", maxlength: "2000", dir: "ltr", placeholder: "https://…", "aria-label": "Link address", value: b.url, "data-k": "u" + b.id, autocomplete: "off", spellcheck: "false" });
        var showWarn = function () { warn.textContent = b.url.trim() || b.title.trim() ? L.urlProblem(b.url) : ""; };
        u.addEventListener("input", function () { typed(function () { b.url = u.value; }); if (warn.textContent) showWarn(); });
        u.addEventListener("change", function () { var fx = L.fixUrl(u.value); if (fx && fx !== u.value.trim()) { typed(function () { b.url = fx; }); u.value = fx; } showWarn(); });
        f.appendChild(u); f.appendChild(warn); showWarn();
      }
    }
    row.appendChild(f);
    var more = h("button", { "class": "btn ghost icon small", type: "button", "aria-label": "More actions", title: "More", text: "⋯" });
    more.addEventListener("click", function () { blockMenu(more, b, i); });
    row.appendChild(h("div", { "class": "lp-acts" }, [sw(b.on, b.on ? "Shown on the page" : "Hidden from the page", function (v) { edit(function () { b.on = v; }); }), more]));
    return row;
  }
  function addBlock(type, at) {
    var b = L.block(type, type === "header" ? { title: "" } : {});
    edit(function () { if (at == null) page.blocks.push(b); else page.blocks.splice(at, 0, b); });
    var el = $('[data-k="t' + b.id + '"]'); if (el) { el.focus(); el.scrollIntoView({ block: "nearest" }); }
  }
  function moveBlock(i, d) {
    var j = i + d; if (j < 0 || j >= page.blocks.length) return;
    edit(function () { var x = page.blocks.splice(i, 1)[0]; page.blocks.splice(j, 0, x); });
  }
  function blockMenu(anchor, b, i) {
    var items = [];
    if (b.type === "link") items.push(opt(b.feat ? "Stop highlighting" : "Highlight this link", function () { edit(function () { b.feat = !b.feat; }); }, "stands out"),
      opt("Make it a WhatsApp, email or call link…", function () { contactSheet(b); }));
    items.push(opt("Move up", function () { moveBlock(i, -1); }, "Alt+↑"), opt("Move down", function () { moveBlock(i, 1); }, "Alt+↓"),
      opt("Duplicate", function () { var c = L.block(b.type, b); edit(function () { page.blocks.splice(i + 1, 0, c); }); }),
      opt("Add a link below", function () { addBlock("link", i + 1); }),
      h("div", { "class": "sep" }),
      opt("Delete", function () { edit(function () { page.blocks.splice(i, 1); }); S3.toast("Deleted · Ctrl+Z to undo"); }, null, "danger"));
    pop(anchor, items);
  }
  function emojiPop(anchor, b) {
    var grid = h("div", { "class": "emo" });
    EMOJI.forEach(function (e) { grid.appendChild(h("button", { type: "button", text: e, "aria-label": e, onclick: function () { closePop(); edit(function () { b.emoji = e; }); } })); });
    var own = h("input", { "class": "input", maxlength: "16", placeholder: "Or type / paste an emoji", "aria-label": "Your own emoji", style: "min-height:34px;padding:4px 10px" });
    own.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var v = own.value.trim(); closePop(); edit(function () { b.emoji = v; }); } });
    pop(anchor, [h("div", { "class": "hd", text: "Icon" }), grid, own, b.emoji ? opt("No icon", function () { edit(function () { b.emoji = ""; }); }) : null].filter(Boolean));
  }
  // Builds wa.me / mailto: / tel: / sms: addresses so people don't have to know the formats.
  function contactSheet(b) {
    var kind = "whatsapp";
    var val = h("input", { "class": "input", dir: "ltr", maxlength: "200", "aria-label": "Number or email", autocomplete: "off" });
    var msg = h("textarea", { "class": "textarea", rows: "2", maxlength: "500", dir: "auto", "aria-label": "Message", placeholder: "Hi! I'd like to order…", style: "min-height:0;font-family:var(--font);font-size:14px" });
    var msgField = field("Ready-made message (optional)", msg), hint = h("p", { "class": "faint", style: "margin:0;font-size:12.5px" });
    function sync() {
      var em = kind === "email";
      val.placeholder = em ? "you@example.com" : "+962 79 123 4567";
      val.type = em ? "email" : "tel";
      msgField.hidden = kind === "phone";
      hint.textContent = kind === "whatsapp" ? "Use the full number with the country code, for example 962 for Jordan." : kind === "email" ? "Opens the visitor's email app." : kind === "sms" ? "Opens the text messages app on phones." : "Starts a call on phones.";
    }
    var kinds = seg([["whatsapp", "WhatsApp"], ["email", "Email"], ["phone", "Call"], ["sms", "Text message"]], kind, function (v) { kind = v; sync(); }, "Link type");
    sync();
    sheet("Contact link", h("div", { style: "display:grid;gap:12px" }, [kinds, field(kind === "email" ? "Email" : "Number or email", val), hint, msgField]), [
      { label: "Cancel", cls: "ghost", run: function () {} },
      { label: "Use this", cls: "primary", run: function () {
        var v = val.value.trim(), m = msg.value.trim(), url = "", digits = v.replace(/\D/g, "").replace(/^00/, "");
        if (kind === "whatsapp" && digits.length >= 6) url = "https://wa.me/" + digits + (m ? "?text=" + encodeURIComponent(m) : "");
        else if (kind === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) url = "mailto:" + v + (m ? "?body=" + encodeURIComponent(m) : "");
        else if (kind === "phone" && digits.length >= 3) url = "tel:" + (v.charAt(0) === "+" ? "+" : "") + v.replace(/\D/g, "");
        else if (kind === "sms" && digits.length >= 3) url = "sms:" + (v.charAt(0) === "+" ? "+" : "") + v.replace(/\D/g, "") + (m ? "?body=" + encodeURIComponent(m) : "");
        if (!url) { S3.toast(kind === "email" ? "Check the email address" : "Check the number", "error"); val.focus(); return false; }
        edit(function () { b.url = url; if (!b.title.trim()) b.title = kind === "whatsapp" ? "Message me on WhatsApp" : kind === "email" ? "Email me" : kind === "sms" ? "Text me" : "Call me"; if (!b.emoji) b.emoji = kind === "email" ? "✉️" : kind === "phone" ? "📞" : "💬"; });
      } }]);
  }
  function pasteSheet() {
    var ta = h("textarea", { "class": "textarea", rows: "8", dir: "auto", placeholder: "One link per line, for example:\nMy shop | myshop.com\nYouTube - https://youtube.com/@me\nhttps://example.com/blog", "aria-label": "Links to add" });
    var info = h("p", { "class": "faint", style: "margin:8px 0 0", text: "Titles are optional: a line with only an address uses the site name." });
    ta.addEventListener("input", function () { var n = L.parseLinks(ta.value).length; info.textContent = n ? n + " link" + (n === 1 ? "" : "s") + " found" : "Titles are optional: a line with only an address uses the site name."; });
    sheet("Paste links", h("div", {}, [ta, info]), [{ label: "Cancel", cls: "ghost", run: function () {} }, { label: "Add links", cls: "primary", run: function () {
      var got = L.parseLinks(ta.value);
      if (!got.length) { S3.toast("No links found in that text", "error"); return false; }
      edit(function () { got.forEach(function (g) { page.blocks.push(L.block("link", g)); }); });
      S3.toast("Added " + got.length + " link" + (got.length === 1 ? "" : "s"));
    } }]);
  }
  // drag to reorder (mouse, pen and touch) by the handle
  function dragWire(handle, row) {
    handle.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      e.preventDefault();
      // listen on the document: moving the row in the DOM would drop pointer capture
      var box = row.parentNode, startY = e.clientY, moved = false, pid = e.pointerId;
      function move(ev) {
        if (ev.pointerId !== pid) return;
        var dy = ev.clientY - startY;
        if (!moved && Math.abs(dy) < 4) return;
        moved = true; row.classList.add("dragging");
        if (ev.clientY < 50) window.scrollBy(0, -14); else if (ev.clientY > window.innerHeight - 50) window.scrollBy(0, 14);
        var rows = S3.$$(".lp-blk", box).filter(function (r) { return r !== row; }), before = null;
        for (var k = 0; k < rows.length; k++) { var rr = rows[k].getBoundingClientRect(); if (ev.clientY < rr.top + rr.height / 2) { before = rows[k]; break; } }
        if (before !== row.nextSibling) box.insertBefore(row, before);
      }
      function up(ev) {
        if (ev.pointerId !== pid) return;
        document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
        row.classList.remove("dragging");
        if (!moved) return;
        var order = S3.$$(".lp-blk", box).map(function (r) { return r.getAttribute("data-id"); });
        var from = page.blocks.map(function (b) { return b.id; }).join(",");
        if (order.join(",") === from) return;
        edit(function () { var by = {}; page.blocks.forEach(function (b) { by[b.id] = b; }); page.blocks = order.map(function (k) { return by[k]; }).filter(Boolean); });
      }
      document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
    });
  }
  function socialCard() {
    var box = h("div", { "class": "stack", style: "display:grid;gap:8px" });
    page.socials.forEach(function (s, i) {
      var sel = h("select", { "class": "select", "aria-label": "Network" });
      L.SOCIALS.forEach(function (n) { var o = h("option", { value: n.id, text: n.name }); if (n.id === s.net) o.selected = true; sel.appendChild(o); });
      var inp = h("input", { "class": "input", dir: "ltr", maxlength: "300", placeholder: (L.social(s.net) || {}).ph || "", "aria-label": "Username or link", value: s.val, "data-k": "s" + s.id, autocomplete: "off", spellcheck: "false" });
      var warn = h("div", { "class": "lp-warn" });
      function check() { warn.textContent = s.val.trim() && !L.socialUrl(s.net, s.val) ? "Check this " + (s.net === "email" ? "email address" : s.net === "phone" || s.net === "whatsapp" ? "number" : "username or link") : ""; }
      sel.addEventListener("change", function () { edit(function () { s.net = sel.value; }, true); inp.placeholder = L.social(s.net).ph; check(); });
      inp.addEventListener("input", function () { typed(function () { s.val = inp.value; }); });
      inp.addEventListener("change", check);
      var del = h("button", { "class": "btn ghost icon small", type: "button", "aria-label": "Remove", title: "Remove", html: S3.icon("x"), onclick: function () { edit(function () { page.socials.splice(i, 1); }); } });
      box.appendChild(h("div", {}, [h("div", { "class": "lp-soc" }, [sel, inp, del]), warn]));
      check();
    });
    var add = h("button", { "class": "btn small", type: "button", id: "addSocial", onclick: function () {
      var used = page.socials.map(function (s) { return s.net; }), next = L.SOCIALS.filter(function (n) { return used.indexOf(n.id) < 0; })[0] || L.SOCIALS[0];
      var s = { id: L.uid(), net: next.id, val: "" };
      edit(function () { page.socials.push(s); });
      var el = $('[data-k="s' + s.id + '"]'); if (el) el.focus();
    } }, ["+ Add icon"]);
    return h("section", { "class": "lp-card" }, [h("h2", { text: "Social icons" }),
      page.socials.length ? box : h("p", { "class": "faint", style: "margin:0", text: "Small round icons for Instagram, TikTok, WhatsApp, email and more. Type a username or paste a link." }),
      h("div", { "class": "lp-row" }, [add, h("span", { "class": "grow" }), h("span", { "class": "faint", style: "font-size:12.5px", text: "Show icons" }),
        seg([["top", "Above links"], ["bottom", "Below links"]], page.socialPos, function (v) { edit(function () { page.socialPos = v; }, true); }, "Icon position")])]);
  }

  // ---------- design tab ----------
  function custom(fn) { return function (v) { typed(function () { fn(v); page.themeId = "custom"; }); markTheme(); warnTheme(); }; }
  function markTheme() { S3.$$(".lp-th").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-id") === page.themeId)); }); }
  var warnBox;
  function warnTheme() { if (!warnBox) return; warnBox.textContent = ""; L.themeWarnings(page).forEach(function (w) { warnBox.appendChild(h("div", { "class": "lp-warn", text: "⚠ " + w })); }); }
  function renderDesign() {
    var pane = $("#pane-design"), t = page.theme; pane.textContent = "";
    var grid = h("div", { "class": "lp-themes" });
    L.THEMES.forEach(function (th) {
      var tt = th.t, b = h("button", { "class": "lp-th", type: "button", "data-id": th.id, "aria-pressed": String(page.themeId === th.id), "aria-label": "Theme " + th.name });
      b.style.background = tt.bg.type === "gradient" ? "linear-gradient(" + tt.bg.angle + "deg," + tt.bg.c1 + "," + tt.bg.c2 + ")" : tt.bg.c1;
      b.style.color = tt.text;
      for (var k = 0; k < 2; k++) {
        var bar = h("i"); bar.style.borderRadius = tt.btn.shape === "pill" ? "99px" : tt.btn.shape === "square" ? "2px" : "5px";
        if (tt.btn.style === "outline") bar.style.border = "2px solid " + tt.btn.bg;
        else if (tt.btn.style === "soft") bar.style.background = "rgba(255,255,255,.2)";
        else { bar.style.background = tt.btn.bg; if (tt.btn.style === "hard") bar.style.boxShadow = "2px 2px 0 " + tt.text; }
        b.appendChild(bar);
      }
      b.appendChild(h("span", { text: th.name }));
      b.addEventListener("click", function () { edit(function () { var bgImg = page.theme.bg.img; page.themeId = th.id; page.theme = L.copyTheme(th.id); page.theme.bg.img = bgImg || ""; }); });
      grid.appendChild(b);
    });
    pane.appendChild(h("section", { "class": "lp-card" }, [h("h2", { text: "Theme" }), grid]));

    // background
    var bgBox = h("div", { "class": "lp-grid2" });
    if (t.bg.type !== "image") bgBox.appendChild(colorField(t.bg.type === "gradient" ? "Top colour" : "Colour", t.bg.c1, custom(function (v) { page.theme.bg.c1 = v; })));
    if (t.bg.type === "gradient") {
      bgBox.appendChild(colorField("Bottom colour", t.bg.c2, custom(function (v) { page.theme.bg.c2 = v; })));
      var ang = h("input", { type: "range", "class": "lp-range", min: "0", max: "360", step: "5", value: String(t.bg.angle), "aria-label": "Gradient angle" });
      ang.addEventListener("input", function () { custom(function (v) { page.theme.bg.angle = +v; })(ang.value); });
      bgBox.appendChild(field("Angle", ang));
    }
    if (t.bg.type === "image") {
      var dz = h("div", { "class": "drop", style: "padding:14px;min-height:0" }, [h("b", { text: t.bg.img ? "Replace image" : "Choose an image" }), h("span", { "class": "faint", text: "JPG or PNG, resized to 1600 px" })]);
      S3.drop(dz, function (files) { backgroundFrom(files[0]).then(function (url) { edit(function () { page.theme.bg.img = url; page.theme.bg.type = "image"; page.themeId = "custom"; }); }).catch(function () { S3.toast("Couldn't read that image", "error"); }); }, { accept: "image/*", multiple: false });
      bgBox.appendChild(dz);
      var dim = h("input", { type: "range", "class": "lp-range", min: "0", max: "0.8", step: "0.05", value: String(t.bg.dim), "aria-label": "Darken image" });
      dim.addEventListener("input", function () { custom(function (v) { page.theme.bg.dim = +v; })(dim.value); });
      bgBox.appendChild(field("Darken the image", dim));
      bgBox.appendChild(colorField("Colour while loading", t.bg.c1, custom(function (v) { page.theme.bg.c1 = v; })));
    }
    pane.appendChild(h("section", { "class": "lp-card" }, [h("h2", { text: "Background" }),
      seg([["solid", "Colour"], ["gradient", "Gradient"], ["image", "Image"]], t.bg.type, function (v) {
        if (v === "image" && !page.theme.bg.img) {
          var inp = h("input", { type: "file", accept: "image/*" });
          inp.addEventListener("change", function () { if (inp.files[0]) backgroundFrom(inp.files[0]).then(function (url) { edit(function () { page.theme.bg.img = url; page.theme.bg.type = "image"; page.themeId = "custom"; }); }).catch(function () { S3.toast("Couldn't read that image", "error"); renderDesign(); }); });
          inp.click(); return;
        }
        edit(function () { page.theme.bg.type = v; page.themeId = "custom"; });
      }, "Background type"), bgBox]));

    // buttons + text
    pane.appendChild(h("section", { "class": "lp-card" }, [h("h2", { text: "Buttons and text" }),
      h("div", { "class": "lp-row" }, [seg([["fill", "Filled"], ["outline", "Outline"], ["soft", "Soft"], ["hard", "Shadow"]], t.btn.style, function (v) { edit(function () { page.theme.btn.style = v; page.themeId = "custom"; }, true); markTheme(); warnTheme(); }, "Button style")]),
      h("div", { "class": "lp-row" }, [seg([["square", "Square"], ["round", "Rounded"], ["pill", "Pill"]], t.btn.shape, function (v) { edit(function () { page.theme.btn.shape = v; page.themeId = "custom"; }, true); markTheme(); }, "Button shape")]),
      h("div", { "class": "lp-grid2" }, [
        colorField(t.btn.style === "outline" ? "Border colour" : "Button colour", t.btn.bg, custom(function (v) { page.theme.btn.bg = v; })),
        colorField("Button text", t.btn.fg, custom(function (v) { page.theme.btn.fg = v; })),
        colorField("Page text", t.text, custom(function (v) { page.theme.text = v; })),
        field("Font", (function () {
          var s = h("select", { "class": "select", "aria-label": "Font" });
          Object.keys(L.FONTS).forEach(function (k) { var o = h("option", { value: k, text: L.FONTS[k].name }); if (k === t.font) o.selected = true; s.appendChild(o); });
          s.addEventListener("change", function () { custom(function (v) { page.theme.font = v; })(s.value); });
          return s;
        })())
      ]),
      (warnBox = h("div", { "class": "stack", style: "display:grid;gap:4px" }))]));
    warnTheme();

    pane.appendChild(h("section", { "class": "lp-card" }, [h("h2", { text: "Text direction" }),
      h("p", { "class": "faint", style: "margin:0", text: "Automatic follows each line's language. Choose right-to-left for a page mostly in Arabic." }),
      seg([["auto", "Automatic"], ["ltr", "Left to right"], ["rtl", "Right to left"]], page.dir, function (v) { edit(function () { page.dir = v; }, true); }, "Text direction")]));
  }

  // ---------- publish tab ----------
  var qrCanvas = null;
  function renderPublish() {
    var pane = $("#pane-publish"), keepFocus = document.activeElement && document.activeElement.id;
    pane.textContent = "";
    var html = L.toHTML(page), links = page.blocks.filter(function (b) { return b.type === "link"; });
    var shown = L.visibleBlocks(L.normalize(page)).filter(function (b) { return b.type === "link"; }).length;
    var checks = h("ul", { "class": "lp-checks" });
    function check(ok, text) { checks.appendChild(h("li", {}, [h("span", { "class": ok ? "ok" : "w", text: ok ? "✓" : "⚠" }), h("span", { text: text })])); }
    check(!!page.profile.name.trim(), page.profile.name.trim() ? "Name: " + page.profile.name.trim() : "Add your name in Content, it's the page title too");
    check(shown > 0, shown + " of " + links.length + " link" + (links.length === 1 ? "" : "s") + " will be on the page");
    var noAddr = links.filter(function (b) { return b.on && b.title.trim() && L.urlProblem(b.url); });
    if (noAddr.length) check(false, noAddr.length + " link" + (noAddr.length === 1 ? " needs" : "s need") + " a proper address: " + noAddr.map(function (b) { return "“" + b.title.trim() + "”"; }).slice(0, 4).join(", "));
    var badSoc = page.socials.filter(function (s) { return !L.socialUrl(s.net, s.val); });
    if (badSoc.length) check(false, badSoc.length + " social icon" + (badSoc.length === 1 ? " is" : "s are") + " missing a username or link and won't show");
    L.themeWarnings(page).forEach(function (w) { check(false, w); });
    pane.appendChild(h("section", { "class": "lp-card" }, [h("h2", { text: "1. Check" }), checks]));

    pane.appendChild(h("section", { "class": "lp-card" }, [h("h2", { text: "2. Download your page" }),
      h("p", { "class": "faint", style: "margin:0", text: "One file called index.html with your photos built in. It has no scripts, no trackers and no ads. " + S3.fmtBytes(new Blob([html]).size) + "." }),
      h("div", { "class": "lp-row" }, [
        h("button", { "class": "btn primary", type: "button", id: "dlHtml", onclick: function () { S3.download(L.toHTML(page), "index.html", "text/html"); S3.toast("Downloaded index.html"); S3.done(); } }, [h("span", { html: S3.icon("download") }), "Download index.html"]),
        h("button", { "class": "btn", type: "button", onclick: function () { S3.copy(L.toHTML(page), "HTML copied"); } }, ["Copy HTML"])
      ]),
      h("label", { "class": "check" }, [(function () { var c = h("input", { type: "checkbox" }); c.checked = page.credit; c.addEventListener("change", function () { edit(function () { page.credit = c.checked; }, true); }); return c; })(),
        "Add a small “Made with a free link page maker” line at the bottom (optional, off by default)"])]));

    var host = h("div", { "class": "lp-host" }, [
      hostCard("Netlify Drop (fastest, no Git)", [
        "Make a new folder on your computer and put index.html in it.",
        "Open app.netlify.com/drop and sign up for a free account (that keeps the site online).",
        "Drag the folder onto the page. In a few seconds you get an address like something.netlify.app.",
        "Under Site configuration you can change the site name to make the address nicer.",
        "To update later: open the site, go to Deploys, and drag the folder with your new index.html again."]),
      hostCard("GitHub Pages (free address yourname.github.io)", [
        "Create a free account at github.com.",
        "Create a new public repository named exactly yourname.github.io (your username).",
        "Choose “uploading an existing file”, drop index.html, and press Commit changes.",
        "Wait a minute, then open https://yourname.github.io/. If it doesn't show, check Settings → Pages.",
        "To update later: upload the new index.html to the same repository."]),
      hostCard("Cloudflare Pages", [
        "Create a free Cloudflare account and open Workers & Pages.",
        "Create a new Pages project and choose to upload your files directly (no Git needed).",
        "Give it a project name, then drop the folder with index.html.",
        "Your page is at projectname.pages.dev. Upload a new version the same way.",
        "Menu names change from time to time; look for “Upload assets” or “Direct upload”."]),
      hostCard("Your own website", [
        "Upload index.html into a folder such as /links/ on your site with your host's file manager or FTP.",
        "Your page is then at yoursite.com/links/."])
    ]);
    pane.appendChild(h("section", { "class": "lp-card" }, [h("h2", { text: "3. Put it online for free" }),
      h("p", { "class": "faint", style: "margin:0", text: "Pick one. These are other companies' free services; we don't host your page and don't get your file." }), host,
      h("p", { "class": "faint", style: "margin:0", text: "Then paste your new address into the website field of your Instagram, TikTok or YouTube profile." })]));

    var site = h("input", { "class": "input", id: "siteUrl", type: "url", dir: "ltr", inputmode: "url", placeholder: "https://yourname.github.io/", value: page.site, "aria-label": "Your page's address", autocomplete: "off", spellcheck: "false" });
    qrCanvas = h("canvas", { width: "360", height: "360", "aria-label": "QR code" });
    var qrBtns = h("div", { "class": "lp-row" }, [
      h("button", { "class": "btn small", type: "button", id: "qrPng", onclick: function () { qrDownload("png"); } }, ["PNG"]),
      h("button", { "class": "btn small", type: "button", id: "qrSvg", onclick: function () { qrDownload("svg"); } }, ["SVG"])]);
    var qrInfo = h("p", { "class": "faint", style: "margin:0;font-size:12.5px" });
    function drawQR() {
      var u = L.fixUrl(page.site), x = qrCanvas.getContext("2d");
      x.fillStyle = "#fff"; x.fillRect(0, 0, 360, 360);
      qrBtns.hidden = !u;
      if (!u) { qrInfo.textContent = page.site.trim() ? "That doesn't look like a web address yet." : "Type the address once your page is online to get a QR code for posters, cards and shop windows."; return; }
      var q = L.qr(u), n = q.size + 8, s = 360 / n;
      x.fillStyle = "#000";
      for (var y = 0; y < q.size; y++) for (var xx = 0; xx < q.size; xx++) if (q.modules[y][xx]) x.fillRect(Math.floor((xx + 4) * s), Math.floor((y + 4) * s), Math.ceil(s), Math.ceil(s));
      qrInfo.textContent = "Points to " + u + ". Test it with your phone camera before printing.";
    }
    site.addEventListener("input", function () { snap(false); page.site = site.value; saveSoon(); previewSoon(); drawQR(); });
    pane.appendChild(h("section", { "class": "lp-card" }, [h("h2", { text: "4. QR code" }),
      h("div", { "class": "lp-qr" }, [qrCanvas, h("div", { "class": "stack", style: "display:grid;gap:10px" }, [field("Your page's address", site), qrInfo, qrBtns])])]));
    drawQR();
    if (keepFocus) { var el = document.getElementById(keepFocus); if (el) { el.focus(); if (el.setSelectionRange && el.type !== "url") el.setSelectionRange(el.value.length, el.value.length); } }
  }
  function hostCard(title, steps) {
    var ol = h("ol"); steps.forEach(function (s) { ol.appendChild(h("li", { text: s })); });
    return h("details", {}, [h("summary", { text: title }), ol]);
  }
  function fileBase() { return (page.profile.name || "link-page").trim().toLowerCase().replace(/[^\w؀-ۿ]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "link-page"; }
  function qrDownload(kind) {
    var u = L.fixUrl(page.site); if (!u) return;
    var q = L.qr(u);
    if (kind === "svg") { S3.download(L.qrSVG(q), fileBase() + "-qr.svg", "image/svg+xml"); S3.done(); return; }
    var sc = 16, n = (q.size + 8) * sc, c = document.createElement("canvas"); c.width = c.height = n;
    var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, n, n); x.fillStyle = "#000";
    for (var y = 0; y < q.size; y++) for (var xx = 0; xx < q.size; xx++) if (q.modules[y][xx]) x.fillRect((xx + 4) * sc, (y + 4) * sc, sc, sc);
    c.toBlob(function (b) { if (b) { S3.download(b, fileBase() + "-qr.png"); S3.done(); } else S3.toast("Export failed in this browser", "error"); }, "image/png");
  }

  // ---------- pages menu, files ----------
  function openPage(p, fresh) {
    closePop();
    if (page) save();
    page = p; undoStack = []; redoStack = []; lastSnap = 0;
    afterLoad(); save();
    if (fresh) setTimeout(function () { var el = $('[data-k="pname"]'); if (el) el.focus(); }, 30);
  }
  function afterLoad() { syncUndo(); $("#pageName").textContent = titleOf(page); renderPane(); preview(); }
  function pagesPop() {
    var items = [h("div", { "class": "hd", text: "New" }), opt("Blank page", function () { openPage(L.newPage(), true); setTab("content"); })];
    Object.keys(L.TEMPLATES).forEach(function (k) { items.push(opt(L.TEMPLATES[k].name + " template", function () { openPage(L.template(k)); setTab("content"); })); });
    items.push(opt("Open a file…", openFile, ".json"), h("div", { "class": "sep" }), h("div", { "class": "hd", text: "Saved in this browser" }));
    list().forEach(function (x) { items.push(opt((x.id === page.id ? "• " : "") + (x.name || "Untitled page"), function () { if (x.id !== page.id) { var p = load(x.id); if (p) openPage(p); else S3.toast("That page couldn't be loaded", "error"); } }, (x.n || 0) + " blocks")); });
    items.push(h("div", { "class": "sep" }), opt("Delete this page…", function () {
      sheet("Delete “" + titleOf(page) + "”?", h("p", { "class": "muted", text: "This removes it from this browser. Pages you already put online stay online. Save a file first if you might want to edit it again." }), [
        { label: "Cancel", cls: "ghost", run: function () {} },
        { label: "Delete", cls: "danger", run: function () {
          S3.store("lp:p:" + page.id, undefined); S3.store("lp:list", list().filter(function (x) { return x.id !== page.id; }));
          var nx = list()[0], p = nx && load(nx.id); page = null; openPage(p || L.template("creator")); S3.toast("Page deleted");
        } }]);
    }, null, "danger"));
    pop($("#pageBtn"), items);
  }
  function openFile() {
    var i = h("input", { type: "file", accept: ".json,application/json" });
    i.addEventListener("change", function () {
      var f = i.files[0]; if (!f) return;
      S3.readFile(f, "text").then(function (t) {
        var p; try { p = L.normalize(JSON.parse(t)); } catch (e) { S3.toast("That isn't a Link Page project file", "error"); return; }
        if (list().some(function (x) { return x.id === p.id; })) p.id = L.uid();
        openPage(p); S3.toast("Opened " + titleOf(p)); S3.done();
      }).catch(function () { S3.toast("Couldn't read that file", "error"); });
    });
    i.click();
  }
  function saveFile() { S3.download(JSON.stringify(page), fileBase() + ".linkpage.json", "application/json"); S3.toast("Project saved as a file"); S3.done(); }
  function helpSheet() {
    var g = h("div", { "class": "keys" });
    [["Ctrl+Z / Ctrl+Y", "Undo / redo (outside text boxes)"], ["Ctrl+S", "Save the project as a file"], ["Alt+↑ / Alt+↓", "Move the link you're editing"],
      ["Alt+Enter", "Add a link below the one you're editing"], ["?", "This help"]].forEach(function (r) { g.appendChild(h("kbd", { text: r[0] })); g.appendChild(h("span", { text: r[1] })); });
    sheet("Shortcuts", h("div", { "class": "stack", style: "display:grid;gap:12px" }, [g,
      h("p", { "class": "faint", style: "margin:0", text: "Drag the ⋮⋮ handle to reorder. Your pages are saved in this browser as you type; use Save file to keep a copy or move to another device." })]), []);
  }

  function typingTarget(el) { return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable); }
  document.addEventListener("keydown", function (e) {
    var mod = e.ctrlKey || e.metaKey, k = e.key;
    if (mod && k.toLowerCase() === "s") { e.preventDefault(); saveFile(); return; }
    if (e.altKey && (k === "ArrowUp" || k === "ArrowDown" || k === "Enter")) {
      var row = document.activeElement && document.activeElement.closest && document.activeElement.closest(".lp-blk");
      if (!row) return;
      e.preventDefault();
      var i = page.blocks.map(function (b) { return b.id; }).indexOf(row.getAttribute("data-id")), key = document.activeElement.getAttribute("data-k");
      if (k === "Enter") { addBlock("link", i + 1); return; }
      moveBlock(i, k === "ArrowUp" ? -1 : 1);
      if (key) { var el = $('[data-k="' + key + '"]'); if (el) el.focus(); }
      return;
    }
    if (typingTarget(e.target) || document.querySelector(".s3-modal")) return;
    if (mod && !e.shiftKey && k.toLowerCase() === "z") { e.preventDefault(); undo(); }
    else if (mod && (k.toLowerCase() === "y" || (e.shiftKey && k.toLowerCase() === "z"))) { e.preventDefault(); redo(); }
    else if (k === "?" && !mod) { e.preventDefault(); helpSheet(); }
    else if (k === "Escape") closePop();
  });

  window.S3_SELFTEST = function () {
    try {
      var p = L.template("shop");
      p.profile.name = 'Tom & "Jerry" <script>';
      p.blocks[0].url = "wa.me/962790000000"; p.blocks[1].url = "javascript:alert(1)";
      p.socials[0].val = "@my.shop";
      var html = L.toHTML(p);
      var ok = html.indexOf("<script") < 0 && html.indexOf("javascript:") < 0 && html.indexOf("Tom &amp; &quot;Jerry&quot; &lt;script&gt;") > 0;
      ok = ok && html.indexOf('href="https://wa.me/962790000000"') > 0 && html.indexOf("https://instagram.com/my.shop") > 0;
      ok = ok && L.normalize(JSON.parse(JSON.stringify(p))).blocks.length === p.blocks.length;
      var q = L.qr("https://s3eidat.github.io/link-page/");
      ok = ok && q.size === 29 && q.modules[0][0] === true && q.modules[7][7] === false && q.modules[q.size - 8][8] === true;
      return Promise.resolve(!!ok);
    } catch (e) { return Promise.resolve(false); }
  };

  // ---------- start ----------
  frame = $("#preview");
  S3.$$("#tabs button").forEach(function (b) { b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); }); });
  $("#pageBtn").addEventListener("click", pagesPop);
  $("#undoBtn").addEventListener("click", undo); $("#redoBtn").addEventListener("click", redo);
  $("#helpBtn").addEventListener("click", helpSheet); $("#saveBtn").addEventListener("click", saveFile);
  window.addEventListener("resize", S3.debounce(function () { if (tab === "preview" && window.innerWidth > 960) setTab("content"); }, 150));
  window.addEventListener("pagehide", function () { if (page) save(); });
  var openId = S3.store("lp:open"), first = openId && load(openId);
  if (!first && list()[0]) first = load(list()[0].id);
  openPage(first || L.template("creator"));
})();
