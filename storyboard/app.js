/* Storyboard — frames with sketches or images, shot info, animatic player and PDF export. Nothing leaves the browser. */
(function () {
  "use strict";
  var $ = S3.$, h = S3.h;
  var ASPECTS = { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [1080, 1080], "4:3": [1280, 960], "2.39:1": [1280, 536] };
  var SHOTS = [["", "Shot"], ["EWS", "EWS · Extreme wide"], ["WS", "WS · Wide"], ["FS", "FS · Full"], ["MS", "MS · Medium"], ["MCU", "MCU · Medium close-up"],
    ["CU", "CU · Close-up"], ["ECU", "ECU · Extreme close-up"], ["OTS", "OTS · Over the shoulder"], ["POV", "POV · Point of view"], ["2S", "2S · Two shot"],
    ["INS", "INS · Insert"], ["AER", "AER · Aerial"]];
  var MOVES = ["", "Static", "Pan left", "Pan right", "Tilt up", "Tilt down", "Zoom in", "Zoom out", "Dolly in", "Dolly out", "Truck", "Tracking", "Crane", "Handheld", "Whip pan"];
  var INK = ["#111111", "#666666", "#b5b5b5", "#ffffff", "#e5484d", "#2f7cf6", "#2fbf71", "#f5a524"];

  // ---------- storage: IndexedDB (images are too big for localStorage) ----------
  var DB = null;
  function idb() {
    if (DB) return DB;
    DB = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error("no idb"));
      var r = indexedDB.open("s3-storyboard", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return DB;
  }
  function dbGet(k) { return idb().then(function (db) { return new Promise(function (res, rej) { var q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); }; }); }); }
  function dbPut(k, v) { return idb().then(function (db) { return new Promise(function (res, rej) { var t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = function () { res(); }; t.onerror = function () { rej(t.error); }; }); }); }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function blankFrame() { return { id: uid(), bg: "", ink: "", shot: "", move: "", action: "", dialogue: "", notes: "", dur: 3 }; }
  function blank() { return { v: 1, title: "", aspect: "16:9", frames: [blankFrame(), blankFrame(), blankFrame()], pdf: { paper: "a4", orient: "landscape", cols: 3, notes: true } }; }
  function str(x, max) { return typeof x === "string" ? x.slice(0, max) : ""; }
  function img(x) { return typeof x === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(x) ? x : ""; }
  // Accepts stored data or an opened project file; returns a well-formed project or null.
  function clean(d) {
    if (!d || typeof d !== "object" || !Array.isArray(d.frames)) return null;
    var p = blank(), pd = d.pdf || {};
    p.title = str(d.title, 120);
    p.aspect = ASPECTS[d.aspect] ? d.aspect : "16:9";
    p.frames = d.frames.slice(0, 500).filter(function (f) { return f && typeof f === "object"; }).map(function (f) {
      return { id: str(f.id, 40) || uid(), bg: img(f.bg), ink: img(f.ink), shot: SHOTS.some(function (s) { return s[0] === f.shot; }) ? f.shot : "",
        move: MOVES.indexOf(f.move) >= 0 ? f.move : "", action: str(f.action, 2000), dialogue: str(f.dialogue, 2000), notes: str(f.notes, 2000),
        dur: Math.max(0.5, Math.min(60, Math.round((+f.dur || 3) * 10) / 10)) };
    });
    p.pdf = { paper: pd.paper === "letter" ? "letter" : "a4", orient: pd.orient === "portrait" ? "portrait" : "landscape", cols: [1, 2, 3, 4].indexOf(+pd.cols) >= 0 ? +pd.cols : 3, notes: pd.notes !== false };
    return p;
  }

  var P = blank(), ready = false, saveFail = false;
  var saveSoon = S3.debounce(function () { save(); }, 400);
  function save() {
    if (!ready) return Promise.resolve();
    return dbPut("project", P).then(function () { saveFail = false; }, function () {
      if (!saveFail) S3.toast("Couldn't save in this browser. Export a PDF or project file so you don't lose work.", "error");
      saveFail = true;
    });
  }

  // ---------- helpers ----------
  function icon(n) { var s = h("span", { "class": "sb-ic", "aria-hidden": "true" }); s.innerHTML = S3.icon(n); return s; }
  function btn(label, onclick, cls, ic, title) {
    return h("button", { type: "button", "class": "btn " + (cls || ""), onclick: onclick, title: title || null, "aria-label": title || null }, ic ? [icon(ic)].concat(label ? [label] : []) : [label]);
  }
  function dims() { return ASPECTS[P.aspect]; }
  function fmtTime(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + (sec % 60 < 10 ? "0" : "") + (sec % 60); }
  function total() { return P.frames.reduce(function (n, f) { return n + f.dur; }, 0); }
  function idx(f) { return P.frames.indexOf(f); }
  function loadImage(src) {
    return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error("image")); }; i.src = src; });
  }
  // Fit a picked/dropped image file into the frame size and keep it as a JPEG data URL.
  function fileToFrameImage(file) {
    var url = URL.createObjectURL(file);
    return loadImage(url).then(function (im) {
      var d = dims(), c = document.createElement("canvas"), W = d[0] * 1.25, H = d[1] * 1.25;
      var s = Math.min(1, Math.max(W / im.naturalWidth, H / im.naturalHeight));
      c.width = Math.max(1, Math.round(im.naturalWidth * s)); c.height = Math.max(1, Math.round(im.naturalHeight * s));
      var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      return c.toDataURL("image/jpeg", 0.86);
    }, function (e) { URL.revokeObjectURL(url); throw e; });
  }
  // Draw a frame (white paper, image covering the box, ink on top) into ctx at x,y,w,h.
  // Images load first; the clip/draw/restore then runs in one go so parallel calls never nest clips.
  function drawFrame(ctx, f, x, y, w, hh) {
    function get(src) { return src ? loadImage(src).catch(function () { return null; }) : Promise.resolve(null); }
    return Promise.all([get(f.bg), get(f.ink)]).then(function (ims) {
      ctx.save();
      ctx.fillStyle = "#fff"; ctx.fillRect(x, y, w, hh);
      ctx.beginPath(); ctx.rect(x, y, w, hh); ctx.clip();
      var bg = ims[0], ink = ims[1];
      if (bg) {
        var s = Math.max(w / bg.naturalWidth, hh / bg.naturalHeight), iw = bg.naturalWidth * s, ih = bg.naturalHeight * s;
        ctx.drawImage(bg, x + (w - iw) / 2, y + (hh - ih) / 2, iw, ih);
      }
      if (ink) {
        var s2 = Math.min(w / ink.naturalWidth, hh / ink.naturalHeight), iw2 = ink.naturalWidth * s2, ih2 = ink.naturalHeight * s2;
        ctx.drawImage(ink, x + (w - iw2) / 2, y + (hh - ih2) / 2, iw2, ih2);
      }
      ctx.restore();
    });
  }

  // ---------- change + undo ----------
  function snapshot() { return JSON.stringify(P); }
  function change(fn, undoMsg) {
    var before = undoMsg ? snapshot() : null;
    fn(); saveSoon(); render();
    if (undoMsg) {
      var t = S3.toast(undoMsg + " ");
      t.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { P = clean(JSON.parse(before)) || P; saveSoon(); render(); t.remove(); } }, ["Undo"]));
    }
  }
  function addFrame(at, f) { change(function () { P.frames.splice(at == null ? P.frames.length : at, 0, f || blankFrame()); }); }
  function removeFrame(f) { change(function () { P.frames.splice(idx(f), 1); }, "Frame deleted"); }
  function duplicate(f) { var c = JSON.parse(JSON.stringify(f)); c.id = uid(); addFrame(idx(f) + 1, c); }
  function move(f, by) {
    var i = idx(f), j = i + by;
    if (j < 0 || j >= P.frames.length) return;
    change(function () { P.frames.splice(i, 1); P.frames.splice(j, 0, f); });
    var card = $('[data-id="' + f.id + '"] .sb-move-' + (by < 0 ? "l" : "r")) || $('[data-id="' + f.id + '"] .sb-pic');
    if (card) card.focus();
  }
  function addImages(files) {
    var list = Array.prototype.slice.call(files).filter(function (f) { return /^image\//.test(f.type); });
    if (!list.length) return S3.toast("Pick image files (JPG, PNG, WebP…)", "error");
    // fill empty frames first, then add new ones
    var empties = P.frames.filter(function (f) { return !f.bg && !f.ink; });
    Promise.all(list.map(function (file) { return fileToFrameImage(file).catch(function () { return ""; }); })).then(function (urls) {
      urls = urls.filter(Boolean);
      change(function () {
        urls.forEach(function (u) { var f = empties.shift(); if (f && idx(f) >= 0) f.bg = u; else { f = blankFrame(); f.bg = u; P.frames.push(f); } });
      });
      S3.toast(urls.length + (urls.length === 1 ? " image added" : " images added"));
    });
  }
  function pickFiles(multiple, cb) {
    var inp = h("input", { type: "file", accept: "image/*", hidden: true });
    inp.multiple = multiple;
    inp.addEventListener("change", function () { if (inp.files.length) cb(inp.files); inp.remove(); });
    document.body.appendChild(inp); inp.click();
  }

  // ---------- grid ----------
  function autoGrow(t) { t.style.height = "auto"; t.style.height = Math.min(240, t.scrollHeight + 2) + "px"; }
  function field(f, key, ph, cls) {
    var t = h("textarea", { "class": "sb-text " + (cls || ""), rows: "1", placeholder: ph, dir: "auto", "aria-label": ph + " (frame " + (idx(f) + 1) + ")" });
    t.value = f[key];
    t.addEventListener("input", function () { f[key] = t.value.slice(0, 2000); autoGrow(t); saveSoon(); if (key === "dialogue") stats(); });
    requestAnimationFrame(function () { autoGrow(t); });
    return t;
  }
  function pic(f, cls) {
    var d = dims(), box = h("div", { "class": "sb-frame " + (cls || ""), style: "aspect-ratio:" + d[0] + "/" + d[1] });
    if (f.bg) box.appendChild(h("img", { "class": "sb-bg", src: f.bg, alt: "" }));
    if (f.ink) box.appendChild(h("img", { "class": "sb-ink", src: f.ink, alt: "" }));
    return box;
  }
  var dragId = null;
  function card(f, i) {
    var empty = !f.bg && !f.ink;
    var picture = pic(f);
    var picBtn = h("button", { type: "button", "class": "sb-pic", "aria-label": "Draw in frame " + (i + 1), onclick: function () { sketch(f); } }, [picture]);
    if (empty) picture.appendChild(h("span", { "class": "sb-empty" }, [icon("plus"), "Draw"]));
    var shot = h("select", { "class": "select sb-sel", "aria-label": "Shot type" }, SHOTS.map(function (s) { return h("option", { value: s[0], text: s[1] }); }));
    shot.value = f.shot; shot.addEventListener("change", function () { f.shot = shot.value; saveSoon(); });
    var mv = h("select", { "class": "select sb-sel", "aria-label": "Camera move" }, MOVES.map(function (m) { return h("option", { value: m, text: m || "Move" }); }));
    mv.value = f.move; mv.addEventListener("change", function () { f.move = mv.value; saveSoon(); });
    var dur = h("input", { "class": "input sb-dur", type: "number", min: "0.5", max: "60", step: "0.5", "aria-label": "Duration in seconds", title: "Duration (seconds)" });
    dur.value = f.dur;
    dur.addEventListener("change", function () { var v = Math.max(0.5, Math.min(60, Math.round((+dur.value || 3) * 10) / 10)); f.dur = v; dur.value = v; saveSoon(); stats(); });
    var el = h("article", { "class": "sb-card card", "data-id": f.id, draggable: "true" }, [
      h("div", { "class": "sb-card-h" }, [
        h("b", { "class": "sb-num", text: String(i + 1) }),
        h("span", { "class": "grow" }),
        btn("", function () { pickFiles(false, function (fl) { fileToFrameImage(fl[0]).then(function (u) { change(function () { f.bg = u; }); }, function () { S3.toast("Couldn't read that image", "error"); }); }); }, "ghost icon small", "image", "Add image to frame " + (i + 1)),
        btn("", function () { duplicate(f); }, "ghost icon small", "copy", "Duplicate frame " + (i + 1)),
        btn("", function () { removeFrame(f); }, "ghost icon small sb-del", "trash", "Delete frame " + (i + 1))
      ]),
      picBtn,
      h("div", { "class": "sb-meta" }, [shot, mv, h("label", { "class": "sb-durbox" }, [dur, h("span", { "class": "faint", text: "s" })])]),
      field(f, "action", "Action"),
      field(f, "dialogue", "Dialogue / voice-over", "sb-dialogue"),
      field(f, "notes", "Notes (sound, lighting…)", "sb-notes"),
      h("div", { "class": "sb-card-f" }, [
        h("button", { type: "button", "class": "btn ghost small sb-move-l", disabled: i === 0, "aria-label": "Move frame " + (i + 1) + " earlier", onclick: function () { move(f, -1); } }, ["←"]),
        h("button", { type: "button", "class": "btn ghost small sb-move-r", disabled: i === P.frames.length - 1, "aria-label": "Move frame " + (i + 1) + " later", onclick: function () { move(f, 1); } }, ["→"]),
        h("span", { "class": "grow" }),
        btn("Insert after", function () { addFrame(i + 1); }, "ghost small", "plus")
      ])
    ]);
    // drag to reorder (mouse); the arrow buttons do the same on touch screens and keyboards
    el.addEventListener("dragstart", function (e) {
      if (e.target.closest && e.target.closest("textarea,input,select")) { e.preventDefault(); return; }
      dragId = f.id; el.classList.add("is-drag"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", f.id);
    });
    el.addEventListener("dragend", function () { dragId = null; el.classList.remove("is-drag"); S3.$$(".sb-card.is-over").forEach(function (c) { c.classList.remove("is-over"); }); });
    el.addEventListener("dragover", function (e) { if (dragId && dragId !== f.id) { e.preventDefault(); el.classList.add("is-over"); } });
    el.addEventListener("dragleave", function () { el.classList.remove("is-over"); });
    el.addEventListener("drop", function (e) {
      if (!dragId) return;
      e.preventDefault(); e.stopPropagation();
      var from = P.frames.filter(function (x) { return x.id === dragId; })[0];
      if (!from || from === f) return;
      change(function () { P.frames.splice(idx(from), 1); P.frames.splice(idx(f), 0, from); });
    });
    return el;
  }
  function stats() {
    var n = P.frames.length;
    $("#sb-stats").textContent = n + (n === 1 ? " frame" : " frames") + " · " + fmtTime(total()) + " animatic · " + P.aspect;
  }
  function render() {
    $("#sb-title").value = P.title;
    stats();
    var g = $("#sb-grid"); g.textContent = "";
    g.setAttribute("data-aspect", P.aspect);
    P.frames.forEach(function (f, i) { g.appendChild(card(f, i)); });
    g.appendChild(h("div", { "class": "sb-add" }, [
      btn("Add frame", function () { addFrame(); var c = S3.$$(".sb-card"); if (c.length) c[c.length - 1].scrollIntoView({ block: "nearest" }); }, "", "plus"),
      btn("Add images", function () { pickFiles(true, addImages); }, "ghost", "image"),
      h("span", { "class": "faint", text: "or drop images here" })
    ]));
  }
  function tools() {
    var t = $("#sb-tools"); t.textContent = "";
    var asp = h("select", { "class": "select sb-aspect", "aria-label": "Frame shape", title: "Frame shape" }, Object.keys(ASPECTS).map(function (k) { return h("option", { value: k, text: k }); }));
    asp.value = P.aspect;
    asp.addEventListener("change", function () { change(function () { P.aspect = asp.value; }); });
    t.appendChild(asp);
    t.appendChild(btn("Play", play, "", "play"));
    t.appendChild(btn("Export PDF", pdfDialog, "primary", "download"));
    var menu = h("details", { "class": "sb-menu" }, [h("summary", { "class": "btn", "aria-label": "More: file, video, shot list" }, [icon("file"), "More"])]);
    var list = h("div", { "class": "sb-menu-list", role: "menu" });
    [["New storyboard", newProject], ["Open project file…", openProject], ["Save project file", saveProject], null,
     ["Export video (WebM)", videoDialog], ["Export shot list (CSV)", exportCsv], ["Export frames (PNG, ZIP)", exportPngs], ["Print", function () { window.print(); }], null,
     ["Keyboard shortcuts", showHelp]].forEach(function (it) {
      if (!it) return list.appendChild(h("hr"));
      list.appendChild(h("button", { type: "button", role: "menuitem", onclick: function () { menu.open = false; it[1](); } }, [it[0]]));
    });
    menu.appendChild(list);
    // keep the open menu on screen whichever side of the toolbar the button wrapped to
    menu.addEventListener("toggle", function () {
      if (!menu.open) return;
      list.style.left = ""; list.style.right = "";
      var r = list.getBoundingClientRect();
      if (r.left < 8) { list.style.left = "0"; list.style.right = "auto"; }
    });
    document.addEventListener("click", function (e) { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    t.appendChild(menu);
  }

  // ---------- sketch editor ----------
  function sketch(f) {
    var d = dims(), W = d[0], H = d[1];
    var m = h("div", { "class": "s3-modal sb-modal", role: "dialog", "aria-modal": "true", "aria-label": "Draw frame " + (idx(f) + 1) });
    var stage = h("div", { "class": "sb-stage", style: "aspect-ratio:" + W + "/" + H });
    var bgImg = h("img", { "class": "sb-bg", alt: "" });
    if (f.bg) bgImg.src = f.bg; else bgImg.hidden = true;
    var cv = h("canvas", { "class": "sb-canvas", width: String(W), height: String(H), "aria-label": "Drawing area" });
    var grid = h("div", { "class": "sb-thirds", hidden: true });
    stage.appendChild(bgImg); stage.appendChild(cv); stage.appendChild(grid);
    var ctx = cv.getContext("2d", { willReadFrequently: true });
    var tool = "pen", color = INK[0], size = 5, undo = [], redo = [], bg = f.bg, dirty = false;
    if (f.ink) loadImage(f.ink).then(function (im) { ctx.drawImage(im, 0, 0, W, H); });

    function snap() { undo.push(ctx.getImageData(0, 0, W, H)); if (undo.length > 30) undo.shift(); redo = []; syncBtns(); }
    function doUndo() { if (!undo.length) return; redo.push(ctx.getImageData(0, 0, W, H)); ctx.putImageData(undo.pop(), 0, 0); dirty = true; syncBtns(); }
    function doRedo() { if (!redo.length) return; undo.push(ctx.getImageData(0, 0, W, H)); ctx.putImageData(redo.pop(), 0, 0); dirty = true; syncBtns(); }

    var drawing = null;
    function pt(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height, e.pointerType === "pen" && e.pressure ? e.pressure : 0.5]; }
    function seg(a, b) {
      var scale = W / 1280;
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = color; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(1, (tool === "eraser" ? size * 4 : size) * scale * (0.4 + b[2] * 1.2));
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }
    cv.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      e.preventDefault(); cv.setPointerCapture(e.pointerId); snap();
      drawing = pt(e); seg(drawing, drawing); dirty = true;
    });
    cv.addEventListener("pointermove", function (e) {
      if (!drawing) return;
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      (evs.length ? evs : [e]).forEach(function (ev) { var p = pt(ev); seg(drawing, p); drawing = p; });
    });
    function end() { drawing = null; }
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);

    var bUndo = btn("", doUndo, "ghost icon small", "undo", "Undo (Ctrl+Z)"), bRedo = btn("", doRedo, "ghost icon small", "redo", "Redo (Ctrl+Y)");
    bUndo.textContent = "↶"; bRedo.textContent = "↷";
    function syncBtns() { bUndo.disabled = !undo.length; bRedo.disabled = !redo.length; }
    var toolSeg = h("div", { "class": "seg", role: "group", "aria-label": "Tool" }, [["pen", "Pen"], ["eraser", "Eraser"]].map(function (t) {
      return h("button", { type: "button", "aria-pressed": String(t[0] === tool), onclick: function (e) { tool = t[0]; S3.$$("button", toolSeg).forEach(function (b) { b.setAttribute("aria-pressed", String(b === e.currentTarget)); }); } }, [t[1]]);
    }));
    var sw = h("div", { "class": "sb-swatches", role: "group", "aria-label": "Colour" }, INK.map(function (c) {
      return h("button", { type: "button", "class": "sb-sw", style: "background:" + c, "aria-label": "Colour " + c, "aria-pressed": String(c === color), onclick: function (e) {
        color = c; if (tool === "eraser") { tool = "pen"; S3.$$("button", toolSeg).forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === 0)); }); }
        S3.$$(".sb-sw", sw).forEach(function (b) { b.setAttribute("aria-pressed", String(b === e.currentTarget)); });
      } });
    }));
    var sz = h("input", { type: "range", min: "1", max: "24", value: String(size), "aria-label": "Brush size" });
    sz.addEventListener("input", function () { size = +sz.value; });
    var gridBtn = h("button", { type: "button", "class": "btn ghost small", "aria-pressed": "false", onclick: function () { grid.hidden = !grid.hidden; gridBtn.setAttribute("aria-pressed", String(!grid.hidden)); } }, ["Thirds"]);
    var imgBtn = btn("Image", function () {
      pickFiles(false, function (fl) { fileToFrameImage(fl[0]).then(function (u) { bg = u; bgImg.src = u; bgImg.hidden = false; dirty = true; rm.hidden = false; }, function () { S3.toast("Couldn't read that image", "error"); }); });
    }, "ghost small", "image");
    var rm = btn("Remove image", function () { bg = ""; bgImg.hidden = true; bgImg.removeAttribute("src"); dirty = true; rm.hidden = true; }, "ghost small");
    rm.hidden = !bg;
    var clear = btn("Clear ink", function () { snap(); ctx.clearRect(0, 0, W, H); dirty = true; }, "ghost small", "trash");

    var sheet = h("div", { "class": "sb-sheet" }, [
      h("div", { "class": "row between" }, [h("h2", { text: "Frame " + (idx(f) + 1) }), h("div", { "class": "row" }, [btn("Cancel", function () { close(false); }, "ghost"), btn("Done", function () { close(true); }, "primary", "check")])]),
      h("div", { "class": "sb-toolbar" }, [toolSeg, sw, h("label", { "class": "sb-size" }, [h("span", { "class": "faint", text: "Size" }), sz]), bUndo, bRedo, gridBtn, imgBtn, rm, clear]),
      stage
    ]);
    m.appendChild(sheet);
    syncBtns();
    function blankInk() { var a = ctx.getImageData(0, 0, W, H).data; for (var i = 3; i < a.length; i += 4) if (a[i]) return false; return true; }
    function close(keep) {
      if (keep && dirty) change(function () { f.ink = blankInk() ? "" : cv.toDataURL("image/png"); f.bg = bg; });
      m.remove(); document.removeEventListener("keydown", onKey);
      var b = $('[data-id="' + f.id + '"] .sb-pic'); if (b) b.focus();
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(true); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) { e.preventDefault(); doRedo(); }
      else if (!e.ctrlKey && !e.metaKey && (e.key === "e" || e.key === "b") && e.target.tagName !== "INPUT") {
        S3.$$("button", toolSeg)[e.key === "e" ? 1 : 0].click();
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m);
    S3.$$("button", toolSeg)[0].focus();
  }

  // ---------- animatic player ----------
  function play() {
    if (!P.frames.length) return S3.toast("Add a frame first", "error");
    var d = dims(), at = 0, i = 0, playing = true, last = performance.now(), raf = 0;
    var m = h("div", { "class": "s3-modal sb-modal sb-player", role: "dialog", "aria-modal": "true", "aria-label": "Animatic" });
    var screen = h("div", { "class": "sb-screen", style: "aspect-ratio:" + d[0] + "/" + d[1] });
    var cap = h("div", { "class": "sb-cap", dir: "auto" });
    var info = h("div", { "class": "faint sb-pinfo" });
    var time = h("span", { "class": "mono sb-time" });
    var bar = h("input", { type: "range", min: "0", max: String(Math.round(total() * 1000)), step: "10", value: "0", "aria-label": "Position" });
    var pp = btn("", toggle, "primary icon", "pause", "Play/pause (Space)");
    var starts = []; P.frames.reduce(function (n, f) { starts.push(n); return n + f.dur; }, 0);
    function frameAt(t) { for (var k = starts.length - 1; k >= 0; k--) if (t >= starts[k]) return k; return 0; }
    function show(k) {
      i = k; var f = P.frames[k];
      screen.textContent = "";
      var p = pic(f, "sb-big"); screen.appendChild(p); screen.appendChild(cap);
      cap.textContent = f.dialogue; cap.hidden = !f.dialogue;
      info.textContent = "Frame " + (k + 1) + " / " + P.frames.length + [f.shot, f.move].filter(Boolean).map(function (x) { return " · " + x; }).join("") + (f.action ? " — " + f.action : "");
    }
    function tick(now) {
      if (playing) {
        at += (now - last) / 1000;
        if (at >= total()) { at = total(); playing = false; setIcon(); }
      }
      last = now;
      var k = frameAt(Math.min(at, total() - 0.001));
      if (k !== i || !screen.firstChild) show(k);
      bar.value = String(Math.round(at * 1000));
      time.textContent = fmtTime(at) + " / " + fmtTime(total());
      raf = requestAnimationFrame(tick);
    }
    function setIcon() { pp.innerHTML = S3.icon(playing ? "pause" : "play"); }
    function toggle() { if (!playing && at >= total()) at = 0; playing = !playing; last = performance.now(); setIcon(); }
    function jump(k) { k = Math.max(0, Math.min(P.frames.length - 1, k)); at = starts[k]; show(k); }
    bar.addEventListener("input", function () { at = +bar.value / 1000; });
    var sheet = h("div", { "class": "sb-sheet sb-psheet" }, [
      h("div", { "class": "row between" }, [h("h2", { text: P.title || "Animatic" }), btn("", close, "ghost icon", "x", "Close (Esc)")]),
      screen, info,
      h("div", { "class": "sb-controls" }, [btn("", function () { jump(i - 1); }, "icon", "", "Previous frame (←)"), pp, btn("", function () { jump(i + 1); }, "icon", "", "Next frame (→)"), bar, time])
    ]);
    var ctl = S3.$$(".sb-controls .btn", sheet); ctl[0].textContent = "⏮"; ctl[2].textContent = "⏭";
    m.appendChild(sheet);
    function close() { cancelAnimationFrame(raf); m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) {
      if (e.key === "Escape") close();
      else if (e.key === " " && e.target.tagName !== "BUTTON") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); jump(i + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); jump(i - 1); }
    }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m);
    show(0); setIcon(); pp.focus();
    raf = requestAnimationFrame(tick);
  }

  // ---------- PDF ----------
  var PAPER = { a4: [595.28, 841.89], letter: [612, 792] };
  function isRtl(s) { var m = /[A-Za-z֐-ࣿ]/.exec(s || ""); return !!m && /[֐-ࣿ]/.test(m[0]); }
  // Wrap text to width; returns at most maxLines lines (last one ends with … if cut).
  function wrap(ctx, text, width, maxLines) {
    var out = [];
    String(text || "").split(/\n/).forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean), line = "";
      words.forEach(function (w) {
        var tryL = line ? line + " " + w : w;
        if (ctx.measureText(tryL).width <= width || !line) {
          if (!line && ctx.measureText(w).width > width) { // one very long word: hard break
            var cut = w; while (cut.length > 1 && ctx.measureText(cut).width > width) cut = cut.slice(0, -1);
            out.push(cut); line = w.slice(cut.length);
          } else line = tryL;
        } else { out.push(line); line = w; }
      });
      out.push(line);
    });
    while (out.length && !out[out.length - 1]) out.pop();
    if (out.length > maxLines) { out = out.slice(0, maxLines); var l = out[maxLines - 1]; while (l && ctx.measureText(l + "…").width > width) l = l.slice(0, -1); out[maxLines - 1] = l + "…"; }
    return out;
  }
  // Renders pages to canvases (any script, including Arabic, draws correctly) and returns them.
  function renderPages(opt) {
    var paper = PAPER[opt.paper], pw = paper[0], ph = paper[1];
    if (opt.orient === "landscape") { pw = paper[1]; ph = paper[0]; }
    var S = 2.2, W = Math.round(pw * S), H = Math.round(ph * S); // ~158 dpi
    var M = 30 * S, head = 26 * S, gap = 14 * S, cols = opt.cols, d = dims();
    var cw = (W - 2 * M - (cols - 1) * gap) / cols, ih = cw * d[1] / d[0];
    var fs = Math.max(8, Math.min(10, cw / S / 26)) * S, lh = fs * 1.25;
    var lines = opt.notes ? 6 : 4, th = lh * (lines + 1) + 6 * S;
    var rows = Math.max(1, Math.floor((H - 2 * M - head + gap) / (ih + th + gap)));
    if (ih + th > H - 2 * M - head) { ih = Math.max(40 * S, H - 2 * M - head - th); cw = ih * d[0] / d[1]; }
    var per = rows * cols, pages = [], n = Math.max(1, Math.ceil(P.frames.length / per));
    var chain = Promise.resolve();
    for (var p = 0; p < n; p++) (function (p) {
      chain = chain.then(function () {
        var c = document.createElement("canvas"); c.width = W; c.height = H;
        var x = c.getContext("2d");
        x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
        x.fillStyle = "#111"; x.textBaseline = "top";
        x.font = "600 " + (13 * S) + "px Inter, system-ui, sans-serif";
        var title = P.title || "Storyboard";
        x.direction = isRtl(title) ? "rtl" : "ltr"; x.textAlign = "left";
        if (x.direction === "rtl") { x.textAlign = "right"; x.fillText(title, W - M, M); x.textAlign = "left"; } else x.fillText(title, M, M);
        x.direction = "ltr";
        x.font = (9 * S) + "px Inter, system-ui, sans-serif"; x.fillStyle = "#777"; x.textAlign = "right";
        x.fillText((p + 1) + " / " + n, W - M, M + 3 * S);
        x.textAlign = "left";
        var jobs = [];
        P.frames.slice(p * per, p * per + per).forEach(function (f, k) {
          var r = Math.floor(k / cols), col = k % cols, fx = M + col * (cw + gap), fy = M + head + r * (ih + th + gap), num = p * per + k + 1;
          jobs.push(drawFrame(x, f, fx, fy, cw, ih).then(function () {
            x.strokeStyle = "#222"; x.lineWidth = 1.2 * S; x.strokeRect(fx, fy, cw, ih);
            var ty = fy + ih + 5 * S;
            x.fillStyle = "#111"; x.font = "700 " + fs + "px Inter, system-ui, sans-serif"; x.direction = "ltr"; x.textAlign = "left";
            var meta = [f.shot, f.move, f.dur + "s"].filter(Boolean).join(" · ");
            x.fillText(String(num), fx, ty);
            x.font = fs + "px Inter, system-ui, sans-serif"; x.fillStyle = "#555"; x.textAlign = "right";
            x.fillText(meta, fx + cw, ty); x.textAlign = "left";
            ty += lh;
            function block(txt, style, color, max) {
              if (!txt || max <= 0) return 0;
              x.font = style + fs + "px Inter, system-ui, sans-serif"; x.fillStyle = color;
              var rtl = isRtl(txt); x.direction = rtl ? "rtl" : "ltr"; x.textAlign = rtl ? "right" : "left";
              var ls = wrap(x, txt, cw, max);
              ls.forEach(function (l, j) { x.fillText(l, rtl ? fx + cw : fx, ty + j * lh); });
              x.direction = "ltr"; x.textAlign = "left"; ty += ls.length * lh; return ls.length;
            }
            var left = lines;
            left -= block(f.action, "", "#111", Math.min(left, 3));
            left -= block(f.dialogue && !isRtl(f.dialogue) ? "“" + f.dialogue + "”" : f.dialogue, isRtl(f.dialogue) ? "" : "italic ", "#333", Math.min(left, 3));
            if (opt.notes) block(f.notes, "", "#777", left);
          }));
        });
        return Promise.all(jobs).then(function () { pages.push({ canvas: c, w: pw, h: ph }); });
      });
    })(p);
    return chain.then(function () { return pages; });
  }
  function canvasJpeg(c) {
    return new Promise(function (res) { c.toBlob(function (b) { res(b.arrayBuffer()); }, "image/jpeg", 0.9); }).then(function (ab) { return new Uint8Array(ab); });
  }
  // Minimal PDF 1.4 writer: one full-page JPEG per page.
  function buildPdf(pages) {
    var enc = new TextEncoder(), parts = [], len = 0, offs = [];
    function put(x) { var b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; }
    function obj(n, body, stream) {
      offs[n] = len; put(n + " 0 obj\n" + body);
      if (stream) { put("\nstream\n"); put(stream); put("\nendstream"); }
      put("\nendobj\n");
    }
    put("%PDF-1.4\n%S3SB\n");
    var kids = pages.map(function (_, i) { return (3 + i * 3) + " 0 R"; }).join(" ");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [" + kids + "] /Count " + pages.length + " >>");
    pages.forEach(function (pg, i) {
      var n = 3 + i * 3, w = pg.w.toFixed(2), hh = pg.h.toFixed(2);
      obj(n, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + w + " " + hh + "] /Resources << /XObject << /Im0 " + (n + 1) + " 0 R >> >> /Contents " + (n + 2) + " 0 R >>");
      obj(n + 1, "<< /Type /XObject /Subtype /Image /Width " + pg.px[0] + " /Height " + pg.px[1] + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + pg.jpeg.length + " >>", pg.jpeg);
      var cs = "q " + w + " 0 0 " + hh + " 0 0 cm /Im0 Do Q";
      obj(n + 2, "<< /Length " + cs.length + " >>", enc.encode(cs));
    });
    var count = 3 + pages.length * 3, xref = len;
    var t = "xref\n0 " + count + "\n0000000000 65535 f \n";
    for (var i = 1; i < count; i++) t += String(offs[i]).padStart(10, "0") + " 00000 n \n";
    put(t + "trailer\n<< /Size " + count + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
    return new Blob(parts, { type: "application/pdf" });
  }
  function exportPdf(opt) {
    return renderPages(opt).then(function (pages) {
      return Promise.all(pages.map(function (pg) { return canvasJpeg(pg.canvas).then(function (j) { pg.jpeg = j; pg.px = [pg.canvas.width, pg.canvas.height]; return pg; }); }));
    }).then(buildPdf);
  }
  // ASCII only: some browsers drop a download name with other characters and save as "download".
  function fileBase() { return (P.title || "").replace(/[^A-Za-z0-9 _.-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60).replace(/ /g, "-") || "storyboard"; }
  function pdfDialog() {
    if (!P.frames.length) return S3.toast("Add a frame first", "error");
    var o = P.pdf;
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Export PDF" });
    function sel(label, key, opts) {
      var s = h("select", { "class": "select" }, opts.map(function (x) { return h("option", { value: String(x[0]), text: x[1] }); }));
      s.value = String(o[key]); s.addEventListener("change", function () { o[key] = key === "cols" ? +s.value : s.value; saveSoon(); });
      return h("label", { "class": "field" }, [label, s]);
    }
    var notes = h("input", { type: "checkbox" }); notes.checked = o.notes;
    notes.addEventListener("change", function () { o.notes = notes.checked; saveSoon(); });
    var go = btn("Save PDF", function () {
      go.disabled = true; go.lastChild.textContent = "Making PDF…";
      exportPdf(o).then(function (blob) {
        S3.download(blob, fileBase() + ".pdf"); S3.done(); close();
      }, function () { S3.toast("Couldn't make the PDF", "error"); go.disabled = false; go.lastChild.textContent = "Save PDF"; });
    }, "primary", "download");
    var sheet = h("div", { "class": "s3-sheet" }, [
      h("div", { "class": "row between" }, [h("h2", { text: "Export PDF" }), btn("", close, "ghost icon", "x", "Close")]),
      h("p", { text: P.frames.length + " frames. Pages are made in your browser; nothing is uploaded." }),
      h("div", { "class": "sb-fields" }, [
        sel("Paper", "paper", [["a4", "A4"], ["letter", "US Letter"]]),
        sel("Orientation", "orient", [["landscape", "Landscape"], ["portrait", "Portrait"]]),
        sel("Frames per row", "cols", [[1, "1"], [2, "2"], [3, "3"], [4, "4"]]),
        h("label", { "class": "check sb-check" }, [notes, "Include notes"])
      ]),
      h("div", { "class": "row end" }, [btn("Cancel", close, "ghost"), go])
    ]);
    m.appendChild(sheet);
    function close() { m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m);
    go.focus();
  }


  // ---------- files: project, CSV, PNGs ----------
  function newProject() {
    var before = snapshot();
    P = blank(); saveSoon(); tools(); render();
    var t = S3.toast("New storyboard ");
    t.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { P = clean(JSON.parse(before)) || P; saveSoon(); tools(); render(); t.remove(); } }, ["Undo"]));
  }
  function saveProject() {
    var data = JSON.stringify(Object.assign({ app: "s3eidat-storyboard", saved: new Date().toISOString() }, P));
    S3.download(data, fileBase() + ".storyboard.json", "application/json");
    S3.done();
  }
  function openProject() {
    var inp = h("input", { type: "file", accept: ".json,application/json", hidden: true });
    inp.addEventListener("change", function () {
      var f = inp.files[0]; inp.remove(); if (!f) return;
      S3.readFile(f, "text").then(function (txt) {
        var d; try { d = clean(JSON.parse(txt)); } catch (e) { d = null; }
        if (!d) return S3.toast("That isn't a Storyboard project file", "error");
        var before = snapshot();
        P = d; saveSoon(); tools(); render();
        var t = S3.toast("Opened " + (P.title || "storyboard") + " ");
        t.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { P = clean(JSON.parse(before)) || P; saveSoon(); tools(); render(); t.remove(); } }, ["Undo"]));
      });
    });
    document.body.appendChild(inp); inp.click();
  }
  function csvCell(v) {
    v = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; // keep spreadsheets from running it as a formula
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function shotListCsv() {
    var rows = [["Frame", "Start (s)", "Duration (s)", "Shot", "Camera move", "Action", "Dialogue", "Notes"]], at = 0;
    P.frames.forEach(function (f, i) { rows.push([i + 1, Math.round(at * 10) / 10, f.dur, f.shot, f.move, f.action, f.dialogue, f.notes]); at += f.dur; });
    return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n";
  }
  function exportCsv() { S3.download(shotListCsv(), fileBase() + "-shot-list.csv", "text/csv"); S3.done(); }
  function frameCanvas(f) {
    var d = dims(), c = document.createElement("canvas"); c.width = d[0]; c.height = d[1];
    return drawFrame(c.getContext("2d"), f, 0, 0, d[0], d[1]).then(function () { return c; });
  }
  function exportPngs() {
    if (!P.frames.length) return S3.toast("Add a frame first", "error");
    S3.toast("Making images…");
    var files = [];
    P.frames.reduce(function (chain, f, i) {
      return chain.then(function () { return frameCanvas(f); }).then(function (c) {
        return new Promise(function (res) { c.toBlob(function (b) { b.arrayBuffer().then(function (ab) { files.push({ name: "frame-" + String(i + 1).padStart(3, "0") + ".png", data: new Uint8Array(ab) }); res(); }); }, "image/png"); });
      });
    }, Promise.resolve()).then(function () {
      S3.download(S3.zip(files), fileBase() + "-frames.zip"); S3.done();
    }, function () { S3.toast("Couldn't make the images", "error"); });
  }

  // ---------- video (WebM, recorded in real time from a canvas) ----------
  function videoType() {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return "";
    return ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0] || "";
  }
  function drawCaption(x, text, W, H) {
    if (!text) return;
    var fs = Math.round(H * 0.045);
    x.font = "600 " + fs + "px Inter, system-ui, sans-serif";
    var rtl = isRtl(text); x.direction = rtl ? "rtl" : "ltr"; x.textAlign = "center"; x.textBaseline = "top";
    var lines = wrap(x, text, W * 0.82, 3), lh = fs * 1.3, bh = lines.length * lh + fs * 0.6, y = H - bh - H * 0.05;
    var bw = Math.max.apply(null, lines.map(function (l) { return x.measureText(l).width; })) + fs * 1.2;
    x.fillStyle = "rgba(0,0,0,.72)"; x.fillRect((W - bw) / 2, y, bw, bh);
    x.fillStyle = "#fff"; lines.forEach(function (l, i) { x.fillText(l, W / 2, y + fs * 0.3 + i * lh); });
    x.direction = "ltr"; x.textAlign = "left";
  }
  function videoDialog() {
    if (!P.frames.length) return S3.toast("Add a frame first", "error");
    var type = videoType();
    if (!type) return S3.toast("This browser can't record video. Try Chrome, Edge or Firefox.", "error");
    var d = dims(), W = d[0], H = d[1], caps = true, rec = null, stopped = false, timer = 0;
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Export video" });
    var capBox = h("input", { type: "checkbox" }); capBox.checked = true;
    capBox.addEventListener("change", function () { caps = capBox.checked; });
    var prog = h("div", { "class": "sb-prog", hidden: true }, [h("span")]);
    var note = h("p", { text: "Records the animatic in real time (" + fmtTime(total()) + ") as a WebM video, " + W + "×" + H + ". Keep this tab open while it records." });
    var go = btn("Record video", start, "primary", "play");
    var sheet = h("div", { "class": "s3-sheet" }, [
      h("div", { "class": "row between" }, [h("h2", { text: "Export video" }), btn("", close, "ghost icon", "x", "Close")]),
      note, h("label", { "class": "check" }, [capBox, "Show dialogue as captions"]), prog,
      h("div", { "class": "row end mt" }, [btn("Cancel", close, "ghost"), go])
    ]);
    m.appendChild(sheet);
    function close() { stopped = true; clearInterval(timer); if (rec && rec.state !== "inactive") rec.stop(); m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m); go.focus();
    function start() {
      go.disabled = true; capBox.disabled = true; prog.hidden = false;
      Promise.all(P.frames.map(frameCanvas)).then(function (frames) {
        if (stopped) return;
        var c = document.createElement("canvas"); c.width = W; c.height = H;
        var x = c.getContext("2d"), chunks = [], starts = [], end = 0;
        P.frames.forEach(function (f) { starts.push(end); end += f.dur; });
        function paint(t) {
          var k = 0; for (var i = starts.length - 1; i >= 0; i--) if (t >= starts[i]) { k = i; break; }
          x.drawImage(frames[k], 0, 0); if (caps) drawCaption(x, P.frames[k].dialogue, W, H);
        }
        paint(0);
        var stream = c.captureStream(30);
        rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4e6 });
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
          stream.getTracks().forEach(function (tr) { tr.stop(); });
          if (stopped && !done) return;
          S3.download(new Blob(chunks, { type: "video/webm" }), fileBase() + ".webm"); S3.done(); close();
        };
        var t0 = performance.now(), done = false;
        rec.start(500);
        timer = setInterval(function () {
          var t = (performance.now() - t0) / 1000;
          prog.firstChild.style.width = Math.min(100, t / end * 100) + "%";
          if (t >= end) { clearInterval(timer); paint(end - 0.001); done = true; setTimeout(function () { if (rec.state !== "inactive") rec.stop(); }, 150); return; }
          paint(t);
        }, 1000 / 30);
      }, function () { S3.toast("Couldn't prepare the frames", "error"); close(); });
    }
  }

  // ---------- keyboard ----------
  function showHelp() {
    var keys = [["N", "New frame at the end"], ["P", "Play the animatic"], ["?", "Show this help"], ["Space", "Play / pause (animatic)"], ["← →", "Previous / next frame (animatic)"],
      ["B / E", "Pen / eraser (drawing)"], ["Ctrl+Z / Ctrl+Y", "Undo / redo (drawing)"], ["Esc", "Close; in drawing, keep the drawing"]];
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Keyboard shortcuts" });
    var sheet = h("div", { "class": "s3-sheet" }, [h("div", { "class": "row between" }, [h("h2", { text: "Keyboard shortcuts" }), btn("", close, "ghost icon", "x", "Close")]),
      h("div", { "class": "sb-keys" }, keys.map(function (k) { return h("div", { "class": "row" }, [h("kbd", { text: k[0] }), h("span", { "class": "muted", text: k[1] })]); }))]);
    m.appendChild(sheet);
    function close() { m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m); sheet.querySelector("button").focus();
  }
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || $(".s3-modal")) return;
    var tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "n" || e.key === "N") { e.preventDefault(); addFrame(); var c = S3.$$(".sb-card"); if (c.length) { c[c.length - 1].scrollIntoView({ block: "nearest" }); c[c.length - 1].querySelector(".sb-pic").focus(); } }
    else if (e.key === "p" || e.key === "P") { e.preventDefault(); play(); }
    else if (e.key === "?") { e.preventDefault(); showHelp(); }
  });

  // ---------- self-test (works on copies, never touches the saved project) ----------
  window.S3_SELFTEST = async function () {
    var real = P, ok = true;
    function expect(c) { if (!c) ok = false; }
    try {
      expect(clean(null) === null && clean({ frames: "x" }) === null);
      var c = clean({ title: "T", aspect: "9:16", frames: [{ bg: "javascript:alert(1)", dur: 999, shot: "CU", move: "Nope" }, {}] });
      expect(c.aspect === "9:16" && c.frames.length === 2 && c.frames[0].bg === "" && c.frames[0].dur === 60 && c.frames[0].shot === "CU" && c.frames[0].move === "");
      var cv = document.createElement("canvas"), x = cv.getContext("2d"); x.font = "16px sans-serif";
      var w = wrap(x, "one two three four five six seven eight nine ten eleven twelve", 80, 2);
      expect(w.length === 2 && /…$/.test(w[1]));
      // a red frame drawn through the same path the PDF uses
      cv.width = 64; cv.height = 36; var r = document.createElement("canvas"); r.width = 64; r.height = 36;
      var rx = r.getContext("2d"); rx.fillStyle = "#f00"; rx.fillRect(0, 0, 64, 36);
      await drawFrame(cv.getContext("2d"), { bg: r.toDataURL("image/png"), ink: "" }, 0, 0, 64, 36);
      var px = cv.getContext("2d").getImageData(32, 18, 1, 1).data;
      expect(px[0] > 200 && px[1] < 40);
      // PDF: header, every xref offset points at its object
      var jpeg = await canvasJpeg(cv);
      var pdf = new Uint8Array(await buildPdf([{ w: 100, h: 50, px: [64, 36], jpeg: jpeg }, { w: 100, h: 50, px: [64, 36], jpeg: jpeg }]).arrayBuffer());
      var txt = ""; for (var i = 0; i < pdf.length; i++) txt += String.fromCharCode(pdf[i]);
      var sx = +/startxref\n(\d+)/.exec(txt)[1], xl = txt.slice(sx).split("\n"), n = +xl[1].split(" ")[1];
      expect(txt.indexOf("%PDF-1.4") === 0 && n === 9 && /%%EOF\n$/.test(txt));
      for (var k = 1; k < n; k++) expect(txt.substr(+xl[2 + k].slice(0, 10), (k + " 0 obj").length) === k + " 0 obj");
      // CSV escaping and formula guard
      P = clean({ frames: [{ action: '=HYPERLINK("x")', dialogue: 'He said "hi", then left', dur: 2 }, { dur: 1.5 }] });
      var csv = shotListCsv().split("\r\n");
      expect(csv[1] === '1,0,2,,,"\'=HYPERLINK(""x"")","He said ""hi"", then left",' && csv[2] === "2,2,1.5,,,,,");
    } catch (err) { ok = false; }
    P = real;
    return ok;
  };

  // ---------- page wiring ----------
  $("#sb-title").addEventListener("input", function (e) { P.title = e.target.value.slice(0, 120); saveSoon(); });
  // dropping image files anywhere on the grid adds them as frames
  var gridEl = $("#sb-grid");
  gridEl.addEventListener("dragover", function (e) { if (!dragId && e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); gridEl.classList.add("is-over"); } });
  gridEl.addEventListener("dragleave", function (e) { if (e.target === gridEl) gridEl.classList.remove("is-over"); });
  gridEl.addEventListener("drop", function (e) {
    gridEl.classList.remove("is-over");
    if (dragId || !e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault(); addImages(e.dataTransfer.files);
  });
  window.addEventListener("beforeunload", function () { save(); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) save(); });

  dbGet("project").then(function (d) { var c = clean(d); if (c) P = c; }, function () {
    S3.toast("This browser can't store the storyboard. Export a PDF before you close the page.", "error");
  }).then(function () { ready = true; tools(); render(); });

  window.SB = { project: function () { return P; }, clean: clean, buildPdf: buildPdf, exportPdf: exportPdf, wrap: wrap, save: save };
})();
