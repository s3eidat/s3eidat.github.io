/* Subtitle Editor — cues on a timeline synced to a local video, SRT/VTT in and out, burn-in export.
   The video never leaves the browser; subtitle lines are autosaved in localStorage. */
(function () {
  "use strict";
  var $ = S3.$, h = S3.h;
  var KEY = "subtitle-editor";
  var DEF_STYLE = { size: 5.5, color: "#ffffff", bg: "box", pos: "bottom", bold: true };

  // ---------- data ----------
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function num(v, lo, hi, d) { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
  function cleanCues(list) {
    return (Array.isArray(list) ? list : []).filter(function (c) { return c && isFinite(c.start) && isFinite(c.end); }).slice(0, 20000).map(function (c) {
      var s = num(c.start, 0, 864000, 0), e = num(c.end, 0, 864000, s + 2);
      return { id: typeof c.id === "string" && c.id ? c.id.slice(0, 40) : uid(), start: Math.round(s * 1000) / 1000, end: Math.round(Math.max(e, s + .05) * 1000) / 1000, text: typeof c.text === "string" ? c.text.slice(0, 1000) : "" };
    }).sort(function (a, b) { return a.start - b.start; });
  }
  function cleanStyle(s) {
    s = s || {};
    return { size: num(s.size, 2, 12, DEF_STYLE.size), color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : DEF_STYLE.color, bg: ["box", "outline", "none"].indexOf(s.bg) >= 0 ? s.bg : "box",
      pos: s.pos === "top" ? "top" : "bottom", bold: s.bold !== false };
  }
  var saved = S3.store(KEY) || {};
  var st = { name: typeof saved.name === "string" ? saved.name.slice(0, 120) : "", cues: cleanCues(saved.cues), style: cleanStyle(saved.style) };
  var save = S3.debounce(function () { if (S3.store(KEY, st) === undefined) S3.toast("Couldn't save in this browser. Export an SRT so you don't lose work.", "error"); }, 300);

  // ---------- time formats ----------
  function pad(n, w) { n = String(n); while (n.length < w) n = "0" + n; return n; }
  function fmt(t, sep) {
    t = Math.max(0, t); var ms = Math.round(t * 1000), hh = Math.floor(ms / 3600000), mm = Math.floor(ms / 60000) % 60, ss = Math.floor(ms / 1000) % 60;
    return pad(hh, 2) + ":" + pad(mm, 2) + ":" + pad(ss, 2) + (sep || ",") + pad(ms % 1000, 3);
  }
  // compact time for the edit fields: m:ss.mmm (h:mm:ss.mmm past an hour)
  function fmtIn(t) { var f = fmt(t, "."); return f.slice(0, 3) === "00:" ? f.slice(3).replace(/^0(\d:)/, "$1") : f; }
  function short(t) { t = Math.max(0, t); var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); }
  // accepts 01:02:03,456 · 02:03.4 · 3.5 · 1:02
  function parseTime(s) {
    s = String(s).trim().replace(",", ".");
    var m = /^(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(s);
    if (!m) return NaN;
    var a = m[1], b = m[2], c = +m[3];
    if (a != null && b != null) return +a * 3600 + +b * 60 + c;
    if (a != null) return +a * 60 + c;
    return c;
  }
  // ---------- SRT / VTT ----------
  function parseSubs(text) {
    var out = [], blocks = String(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
    blocks.forEach(function (b) {
      var lines = b.split("\n"), i = 0;
      while (i < lines.length && lines[i].indexOf("-->") < 0) i++;
      if (i >= lines.length) return;
      var m = /^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)/.exec(lines[i]);
      if (!m) return;
      var s = parseTime(m[1]), e = parseTime(m[2]);
      if (!isFinite(s) || !isFinite(e)) return;
      var txt = lines.slice(i + 1).join("\n").replace(/<\/?(?:i|b|u|c|v|lang|ruby|rt)(?:[.\s][^>]*)?>/g, "").trim();
      out.push({ start: s, end: e, text: txt });
    });
    return cleanCues(out);
  }
  function toSrt(cues) { return cues.map(function (c, i) { return (i + 1) + "\n" + fmt(c.start) + " --> " + fmt(c.end) + "\n" + (c.text || " "); }).join("\n\n") + "\n"; }
  function toVtt(cues) { return "WEBVTT\n\n" + cues.map(function (c) { return fmt(c.start, ".") + " --> " + fmt(c.end, ".") + "\n" + (c.text || " "); }).join("\n\n") + "\n"; }

  // ---------- undo ----------
  var past = [], future = [], lastPush = 0;
  function change(fn, opts) {
    var now = Date.now(), snap = JSON.stringify(st.cues);
    if (!(opts && opts.typing) || now - lastPush > 900) { past.push(snap); if (past.length > 150) past.shift(); future = []; }
    lastPush = now;
    fn(); st.cues.sort(function (a, b) { return a.start - b.start; }); save();
    if (!(opts && opts.quiet)) renderAll(); else { drawTimeline(); stats(); updateOverlay(); }
  }
  function undo() { if (!past.length) return; future.push(JSON.stringify(st.cues)); st.cues = cleanCues(JSON.parse(past.pop())); lastPush = 0; save(); renderAll(); }
  function redo() { if (!future.length) return; past.push(JSON.stringify(st.cues)); st.cues = cleanCues(JSON.parse(future.pop())); lastPush = 0; save(); renderAll(); }

  // ---------- media ----------
  var video = h("video", { "class": "se-video", playsinline: true, preload: "metadata" });
  var mediaURL = null, hasMedia = false, sel = null;
  function duration() { var d = hasMedia && isFinite(video.duration) ? video.duration : 0; var last = st.cues.reduce(function (m, c) { return Math.max(m, c.end); }, 0); return Math.max(d, last + 5, 30); }
  function now() { return video.currentTime || 0; }
  function seek(t) { t = Math.max(0, Math.min(duration(), t)); if (hasMedia) video.currentTime = t; else fakeT = t; tick(); }
  var fakeT = 0; // playhead when there's no media yet
  function cur() { return hasMedia ? now() : fakeT; }
  function openMedia(file) {
    if (!/^(video|audio)\//.test(file.type) && !/\.(mp4|m4v|mov|webm|mkv|ogg|ogv|mp3|wav|m4a|aac|flac)$/i.test(file.name)) return S3.toast("Pick a video or audio file", "error");
    if (mediaURL) URL.revokeObjectURL(mediaURL);
    mediaURL = URL.createObjectURL(file);
    video.src = mediaURL; hasMedia = true;
    if (!st.name || !st.cues.length) st.name = file.name.slice(0, 120);
    save();
    video.addEventListener("loadedmetadata", function once() { video.removeEventListener("loadedmetadata", once); renderAll(); }, { once: true });
    video.addEventListener("error", function once() { video.removeEventListener("error", once); S3.toast("This browser can't play that file. Try MP4 (H.264) or WebM.", "error"); }, { once: true });
    renderAll();
  }
  function pickMedia() {
    var inp = h("input", { type: "file", accept: "video/*,audio/*,.mkv", hidden: true });
    inp.addEventListener("change", function () { if (inp.files[0]) openMedia(inp.files[0]); inp.remove(); });
    document.body.appendChild(inp); inp.click();
  }
  function pickSubs() {
    var inp = h("input", { type: "file", accept: ".srt,.vtt,text/vtt,application/x-subrip,text/plain", hidden: true });
    inp.addEventListener("change", function () {
      var f = inp.files[0]; inp.remove(); if (!f) return;
      S3.readFile(f, "text").then(function (txt) {
        var cues = parseSubs(txt);
        if (!cues.length) return S3.toast("No subtitle lines found in that file", "error");
        var go = function () { change(function () { st.cues = cues; }); S3.toast(cues.length + " lines imported"); };
        if (st.cues.length && !confirm("Replace the " + st.cues.length + " lines you have with this file?")) return;
        go();
      });
    });
    document.body.appendChild(inp); inp.click();
  }

  // ---------- helpers ----------
  function icon(nm) { var s = h("span", { "class": "se-ic", "aria-hidden": "true" }); s.innerHTML = S3.icon(nm); return s; }
  function btn(label, onclick, cls, ic, title) {
    return h("button", { type: "button", "class": "btn " + (cls || ""), onclick: onclick, title: title || null, "aria-label": title || null }, ic ? [icon(ic)].concat(label ? [label] : []) : [label]);
  }
  function byId(id) { for (var i = 0; i < st.cues.length; i++) if (st.cues[i].id === id) return st.cues[i]; return null; }
  function activeAt(t) { for (var i = 0; i < st.cues.length; i++) { var c = st.cues[i]; if (t >= c.start && t < c.end) return c; } return null; }
  function fileBase() { return (st.name || "subtitles").replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9 _.-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60).replace(/ /g, "-") || "subtitles"; }

  // ---------- editing actions ----------
  function addCue() {
    var t = cur(), c = { id: uid(), start: Math.round(t * 1000) / 1000, end: Math.round((t + 2) * 1000) / 1000, text: "" };
    var next = st.cues.filter(function (x) { return x.start > t; })[0];
    if (next && next.start - t > .3) c.end = Math.min(c.end, next.start);
    change(function () { st.cues.push(c); sel = c.id; });
    focusText(c.id);
  }
  function removeCue(c) {
    change(function () { st.cues = st.cues.filter(function (x) { return x !== c; }); if (sel === c.id) sel = null; });
    var t = S3.toast("Line deleted "); t.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { undo(); t.remove(); } }, ["Undo"]));
  }
  function split(c) {
    var t = cur(); if (t <= c.start + .05 || t >= c.end - .05) t = (c.start + c.end) / 2;
    var words = c.text.split(/(\s+)/), half = Math.ceil(words.length / 2), a = words.slice(0, half).join("").trim(), b = words.slice(half).join("").trim();
    change(function () { var n2 = { id: uid(), start: t, end: c.end, text: b }; c.end = t; c.text = a; st.cues.push(n2); sel = n2.id; });
  }
  function mergeNext(c) {
    var i = st.cues.indexOf(c), n2 = st.cues[i + 1]; if (!n2) return S3.toast("There's no next line to merge with", "error");
    change(function () { c.end = Math.max(c.end, n2.end); c.text = (c.text + "\n" + n2.text).trim(); st.cues.splice(i + 1, 1); sel = c.id; });
  }
  function setEdge(c, which) {
    var t = Math.round(cur() * 1000) / 1000;
    change(function () { if (which === "start") { c.start = Math.min(t, c.end - .05); } else { c.end = Math.max(t, c.start + .05); } });
  }
  function focusText(id) { var r = $('[data-cue="' + id + '"]'); if (r) { intoList(r); r.querySelector("textarea").focus({ preventScroll: true }); } }

  // ---------- player ----------
  var overlay = h("div", { "class": "se-cap", "aria-live": "off" });
  var timeEl, playBtn;
  function updateOverlay() {
    var c = activeAt(cur()), s = st.style;
    overlay.textContent = c ? c.text : "";
    overlay.hidden = !c || !c.text;
    overlay.className = "se-cap se-" + s.bg + " se-" + s.pos;
    var vh = video.clientHeight || 240;
    overlay.style.fontSize = (vh * s.size / 100) + "px";
    overlay.style.color = s.color; overlay.style.fontWeight = s.bold ? "700" : "500";
  }
  // rebuilding the player would detach (and pause) the video, so it is only built when media first appears
  function renderPlayer() {
    var p = $("#se-player");
    if (hasMedia && p.contains(video)) { tick(); return; }
    p.textContent = "";
    var stage = h("div", { "class": "se-stage" + (hasMedia ? "" : " is-empty") });
    if (hasMedia) { stage.appendChild(video); stage.appendChild(overlay); }
    else {
      var drop = h("label", { "class": "drop se-drop" }, [h("input", { type: "file", accept: "video/*,audio/*,.mkv", hidden: true }), icon("upload"),
        h("b", { text: st.cues.length ? "Open the video again to keep editing" : "Drop a video or audio file" }), h("span", { text: "MP4, WebM, MOV, MP3, WAV… It stays on your device." })]);
      S3.drop(drop, function (files) { openMedia(files[0]); }, { multiple: false });
      stage.appendChild(drop);
    }
    p.appendChild(stage);
    timeEl = h("span", { "class": "mono se-time" });
    playBtn = btn("", togglePlay, "primary icon", "play", "Play / pause (Space)");
    var speed = h("select", { "class": "select se-speed", "aria-label": "Playback speed" }, [.5, .75, 1, 1.25, 1.5, 2].map(function (r) { return h("option", { value: String(r), text: r + "×" }); }));
    speed.value = String(video.playbackRate || 1); speed.addEventListener("change", function () { video.playbackRate = +speed.value; });
    p.appendChild(h("div", { "class": "row se-controls" }, [
      btn("−2s", function () { seek(cur() - 2); }, "small", "", "Back 2 seconds (←)"), playBtn, btn("+2s", function () { seek(cur() + 2); }, "small", "", "Forward 2 seconds (→)"),
      timeEl, h("span", { "class": "grow" }), speed,
      btn(hasMedia ? "Change video" : "Open video", pickMedia, "small", "upload")
    ]));
    tick();
  }
  function togglePlay() { if (!hasMedia) return S3.toast("Open a video or audio file first", "error"); if (video.paused) video.play(); else video.pause(); }
  video.addEventListener("play", function () { if (playBtn) playBtn.innerHTML = S3.icon("pause"); loop(); });
  video.addEventListener("pause", function () { if (playBtn) playBtn.innerHTML = S3.icon("play"); tick(); });
  video.addEventListener("seeked", tick);
  var raf = 0;
  function loop() { cancelAnimationFrame(raf); tick(true); if (!video.paused) raf = requestAnimationFrame(loop); }
  var lastActive = null;
  function tick(follow) {
    var t = cur();
    if (timeEl) timeEl.textContent = short(t) + " / " + short(hasMedia && isFinite(video.duration) ? video.duration : duration());
    updateOverlay();
    var ph = $("#se-playhead"); if (ph) ph.style.transform = "translateX(" + (t * pps) + "px)";
    if (follow) { var tl = $("#se-tlscroll"); if (tl) { var x = t * pps; if (x < tl.scrollLeft + 40 || x > tl.scrollLeft + tl.clientWidth - 60) tl.scrollLeft = x - 60; } }
    var a = activeAt(t), id = a ? a.id : null;
    if (id !== lastActive) {
      lastActive = id;
      S3.$$(".se-cue.is-now").forEach(function (e) { e.classList.remove("is-now"); });
      S3.$$(".se-block.is-now").forEach(function (e) { e.classList.remove("is-now"); });
      if (id) {
        var row = $('[data-cue="' + id + '"]'), blk = $('[data-block="' + id + '"]');
        if (row) { row.classList.add("is-now"); if (follow && !video.paused && !(document.activeElement && row.contains(document.activeElement))) intoList(row); }
        if (blk) blk.classList.add("is-now");
      }
    }
  }
  window.addEventListener("resize", S3.debounce(function () { updateOverlay(); }, 100));

  // ---------- timeline ----------
  var pps = 60; // pixels per second
  function drawTimeline() {
    var p = $("#se-timeline"); if (!p) return;
    var keepScroll = $("#se-tlscroll") ? $("#se-tlscroll").scrollLeft : 0;
    p.textContent = "";
    var D = duration(), W = Math.ceil(D * pps) + 40;
    var step = pps >= 120 ? 1 : pps >= 40 ? 5 : pps >= 15 ? 10 : 30;
    var ruler = h("div", { "class": "se-ruler", style: "width:" + W + "px" });
    for (var s = 0; s <= D; s += step) ruler.appendChild(h("span", { style: "left:" + (s * pps) + "px", text: short(s).replace(/\.0$/, "") }));
    var track = h("div", { "class": "se-track", style: "width:" + W + "px" });
    st.cues.forEach(function (c, i) {
      var b = h("div", { "class": "se-block" + (c.id === sel ? " is-sel" : ""), "data-block": c.id, style: "left:" + (c.start * pps) + "px;width:" + Math.max(4, (c.end - c.start) * pps) + "px", title: (i + 1) + ". " + c.text },
        [h("span", { "class": "se-edge se-l", "data-edge": "start" }), h("span", { "class": "se-btext", dir: "auto", text: c.text || "…" }), h("span", { "class": "se-edge se-r", "data-edge": "end" })]);
      track.appendChild(b);
    });
    track.appendChild(h("div", { "class": "se-playhead", id: "se-playhead" }));
    var scroller = h("div", { "class": "se-tlscroll", id: "se-tlscroll" }, [ruler, track]);
    p.appendChild(h("div", { "class": "row between se-tlbar" }, [h("b", { text: "Timeline" }), h("div", { "class": "row" }, [
      btn("−", function () { zoom(.7); }, "ghost icon small", "", "Zoom out"), btn("+", function () { zoom(1.4); }, "ghost icon small", "", "Zoom in")])]));
    p.appendChild(scroller);
    scroller.scrollLeft = keepScroll;
    lastActive = null; tick();
    scroller.addEventListener("pointerdown", tlDown);
  }
  function zoom(f) {
    var sc = $("#se-tlscroll"), centerT = sc ? (sc.scrollLeft + sc.clientWidth / 2) / pps : cur();
    pps = Math.max(8, Math.min(400, pps * f)); drawTimeline();
    sc = $("#se-tlscroll"); if (sc) sc.scrollLeft = centerT * pps - sc.clientWidth / 2;
  }
  var tdrag = null;
  function tlDown(e) {
    if (e.button !== 0) return;
    var sc = $("#se-tlscroll"), r = sc.getBoundingClientRect(), x = e.clientX - r.left + sc.scrollLeft, t = x / pps;
    var blk = e.target.closest(".se-block");
    if (!blk) { seek(t); tdrag = { type: "scrub" }; sc.setPointerCapture(e.pointerId); return; }
    var c = byId(blk.getAttribute("data-block")), edge = e.target.getAttribute("data-edge");
    sel = c.id;
    S3.$$(".se-block.is-sel").forEach(function (b) { b.classList.remove("is-sel"); }); blk.classList.add("is-sel");
    S3.$$(".se-cue.is-sel").forEach(function (b) { b.classList.remove("is-sel"); }); var row = $('[data-cue="' + c.id + '"]'); if (row) { row.classList.add("is-sel"); intoList(row); }
    tdrag = { type: edge || "move", c: c, t0: t, s0: c.start, e0: c.end, before: JSON.stringify(st.cues), moved: false, blk: blk };
    sc.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  document.addEventListener("pointermove", function (e) {
    if (!tdrag) return;
    var sc = $("#se-tlscroll"), r = sc.getBoundingClientRect(), t = (e.clientX - r.left + sc.scrollLeft) / pps;
    if (tdrag.type === "scrub") { seek(t); return; }
    var c = tdrag.c, d = t - tdrag.t0;
    if (!tdrag.moved && Math.abs(d * pps) < 3) return;
    tdrag.moved = true;
    function q(v) { return Math.round(v * 100) / 100; }
    if (tdrag.type === "move") { var len = tdrag.e0 - tdrag.s0; c.start = q(Math.max(0, tdrag.s0 + d)); c.end = q(c.start + len); }
    else if (tdrag.type === "start") c.start = q(Math.max(0, Math.min(tdrag.e0 - .05, tdrag.s0 + d)));
    else c.end = q(Math.max(tdrag.s0 + .05, tdrag.e0 + d));
    tdrag.blk.style.left = c.start * pps + "px"; tdrag.blk.style.width = Math.max(4, (c.end - c.start) * pps) + "px";
    var row = $('[data-cue="' + c.id + '"]');
    if (row) { var ins = row.querySelectorAll(".se-tin"); ins[0].value = fmtIn(c.start); ins[1].value = fmtIn(c.end); }
    updateOverlay();
  });
  document.addEventListener("pointerup", function () {
    var d = tdrag; tdrag = null;
    if (!d || d.type === "scrub") return;
    if (!d.moved) { seek(d.c.start); return; }
    past.push(d.before); future = []; st.cues.sort(function (a, b) { return a.start - b.start; }); save(); renderAll();
  });

  // ---------- cue list ----------
  function cps(c) { var n = c.text.replace(/\s+/g, " ").trim().length, d = c.end - c.start; return d > 0 ? n / d : 0; }
  function renderList() {
    var p = $("#se-list"); p.textContent = "";
    p.appendChild(h("div", { "class": "row between se-listbar" }, [h("b", { text: "Lines" }), btn("Add line", addCue, "primary small", "plus", "Add a line at the playhead (N)")]));
    if (!st.cues.length) {
      p.appendChild(h("div", { "class": "empty" }, [h("b", { text: "No subtitles yet" }), h("span", { text: "Play the video and press Add line (or N) where someone starts speaking, or import an SRT/VTT file. For automatic subtitles, use the free Transcribe tool and import its SRT here." }),
        h("div", { "class": "row se-center" }, [btn("Import SRT/VTT", pickSubs, "small", "upload"), h("a", { "class": "btn small ghost", href: "/transcribe/", target: "_blank", rel: "noopener" }, ["Open Transcribe"])])]));
      return;
    }
    var box = h("div", { "class": "se-cues" });
    st.cues.forEach(function (c, i) {
      var tin = function (which) {
        var inp = h("input", { "class": "input se-tin", type: "text", value: fmtIn(c[which]), "aria-label": (which === "start" ? "Start" : "End") + " of line " + (i + 1), inputmode: "decimal" });
        inp.addEventListener("change", function () {
          var v = parseTime(inp.value);
          if (!isFinite(v)) { inp.value = fmtIn(c[which]); return S3.toast("Use a time like 00:01:02.500", "error"); }
          change(function () { if (which === "start") c.start = Math.min(v, c.end - .05); else c.end = Math.max(v, c.start + .05); });
        });
        return inp;
      };
      var ta = h("textarea", { "class": "textarea se-text", rows: "2", dir: "auto", placeholder: "Type the subtitle…", "aria-label": "Text of line " + (i + 1) });
      ta.value = c.text;
      ta.addEventListener("input", function () { change(function () { c.text = ta.value.slice(0, 1000); }, { typing: true, quiet: true }); warn(); });
      ta.addEventListener("focus", function () { sel = c.id; markSel(); });
      ta.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); seek(c.end); addCue(); }
        else if (e.key === "Escape") { ta.blur(); }
      });
      var w = h("span", { "class": "se-warn" });
      function warn() { var r = cps(c); w.textContent = r > 20 ? Math.round(r) + " chars/s — hard to read" : ""; }
      warn();
      var row = h("div", { "class": "se-cue" + (c.id === sel ? " is-sel" : ""), "data-cue": c.id }, [
        h("div", { "class": "se-cue-h" }, [
          h("button", { type: "button", "class": "se-num", title: "Play from here", "aria-label": "Play line " + (i + 1), onclick: function () { sel = c.id; markSel(); seek(c.start); if (hasMedia && video.paused) video.play(); } }, [String(i + 1)]),
          tin("start"), h("span", { "class": "faint", text: "→" }), tin("end"),
          h("span", { "class": "grow" }),
          btn("[", function () { setEdge(c, "start"); }, "ghost icon small", "", "Start at playhead ([)"),
          btn("]", function () { setEdge(c, "end"); }, "ghost icon small", "", "End at playhead (])"),
          btn("", function () { removeCue(c); }, "ghost icon small se-del", "trash", "Delete line")
        ]),
        ta,
        h("div", { "class": "row se-cue-f" }, [btn("Split", function () { split(c); }, "ghost small", "", "Split at the playhead (S)"), btn("Merge next", function () { mergeNext(c); }, "ghost small", "", "Merge with the next line"), h("span", { "class": "grow" }), w])
      ]);
      box.appendChild(row);
    });
    p.appendChild(box);
  }
  // scroll only the list box, never the page
  function intoList(row) {
    var box = row.parentNode; if (!box) return;
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop - 6;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight + 6;
  }
  function markSel() {
    S3.$$(".se-cue.is-sel,.se-block.is-sel").forEach(function (e) { e.classList.remove("is-sel"); });
    if (!sel) return;
    var r = $('[data-cue="' + sel + '"]'), b = $('[data-block="' + sel + '"]');
    if (r) r.classList.add("is-sel"); if (b) b.classList.add("is-sel");
  }

  // ---------- export ----------
  function exportDialog() {
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Export" });
    var sheet = h("div", { "class": "s3-sheet" }, [
      h("div", { "class": "row between" }, [h("h2", { text: "Export" }), btn("", close, "ghost icon", "x", "Close")]),
      h("p", { text: st.cues.length + " lines. Subtitle files work in YouTube, VLC, video editors and most players." }),
      h("div", { "class": "row" }, [
        btn("SRT file", function () { if (!st.cues.length) return S3.toast("No lines to export", "error"); S3.download(toSrt(st.cues), fileBase() + ".srt", "application/x-subrip"); S3.done(); }, "primary", "download"),
        btn("VTT file", function () { if (!st.cues.length) return S3.toast("No lines to export", "error"); S3.download(toVtt(st.cues), fileBase() + ".vtt", "text/vtt"); S3.done(); }, "", "download")
      ]),
      h("h3", { "class": "se-h3", text: "Video with subtitles burned in" }),
      h("p", { "class": "faint", text: "Plays the video once and records it with the subtitles drawn on, in real time. No watermark. The file is WebM (MP4 in Safari)." }),
      h("div", { "class": "row" }, [btn("Make video", function () { close(); burn(); }, "", "play")])
    ]);
    m.appendChild(sheet);
    function close() { m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m); sheet.querySelector(".btn.primary").focus();
  }
  // draw one caption on a canvas the way the preview shows it
  function wrapLines(x, text, maxW) {
    var out = [];
    String(text).split("\n").forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean), line = "";
      words.forEach(function (w) { var t = line ? line + " " + w : w; if (x.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; });
      if (line) out.push(line);
    });
    return out;
  }
  function drawCaption(x, text, W, H, s) {
    if (!text) return;
    var fs = Math.round(H * s.size / 100), lh = fs * 1.25;
    x.font = (s.bold ? "700 " : "500 ") + fs + "px Inter, 'Noto Sans Arabic', Arial, sans-serif";
    var rtl = /[֐-ࣿ]/.test(text); x.direction = rtl ? "rtl" : "ltr";
    x.textAlign = "center"; x.textBaseline = "middle";
    var lines = wrapLines(x, text, W * .88), total = lines.length * lh, pad = fs * .35;
    var y0 = s.pos === "top" ? H * .06 + pad : H - H * .07 - total - pad;
    lines.forEach(function (l, i) {
      var y = y0 + i * lh + lh / 2, tw = x.measureText(l).width;
      if (s.bg === "box") { x.fillStyle = "rgba(0,0,0,.72)"; x.fillRect(W / 2 - tw / 2 - pad, y - lh / 2, tw + 2 * pad, lh); }
      if (s.bg === "outline") { x.lineJoin = "round"; x.lineWidth = Math.max(2, fs * .14); x.strokeStyle = "#000"; x.strokeText(l, W / 2, y); }
      x.fillStyle = s.color; x.fillText(l, W / 2, y);
    });
    x.direction = "ltr";
  }
  var audioCtx = null, audioSrc = null;
  function burn() {
    if (!hasMedia || !video.videoWidth) return S3.toast("Open a video first (audio-only files can't be burned in)", "error");
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return S3.toast("This browser can't record video. Try Chrome, Edge or Firefox.", "error");
    var type = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0] || "";
    var scale = Math.min(1, 1920 / video.videoWidth), W = Math.round(video.videoWidth * scale / 2) * 2, H = Math.round(video.videoHeight * scale / 2) * 2;
    var c = document.createElement("canvas"); c.width = W; c.height = H; var x = c.getContext("2d");
    var stream = c.captureStream(30);
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (!audioSrc) { audioSrc = audioCtx.createMediaElementSource(video); audioSrc.connect(audioCtx.destination); }
      var dest = audioCtx.createMediaStreamDestination(); audioSrc.connect(dest);
      dest.stream.getAudioTracks().forEach(function (tr) { stream.addTrack(tr); });
      audioCtx.resume();
    } catch (e) { /* no audio track: the video is still recorded */ }
    var chunks = [], rec = type ? new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6e6 }) : new MediaRecorder(stream), stopped = false;
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Making video" });
    var bar = h("div", { "class": "se-prog" }, [h("span")]), lbl = h("p", { "class": "faint", text: "Recording… keep this tab open." });
    var sheet = h("div", { "class": "s3-sheet" }, [h("h2", { text: "Making your video" }), bar, lbl, h("div", { "class": "row end" }, [btn("Cancel", function () { stopped = true; finish(); }, "ghost")])]);
    m.appendChild(sheet); document.body.appendChild(m);
    var rate = video.playbackRate; video.playbackRate = 1; video.pause(); video.currentTime = 0;
    function draw() {
      if (stopped) return;
      x.drawImage(video, 0, 0, W, H);
      var a = activeAt(video.currentTime); if (a) drawCaption(x, a.text, W, H, st.style);
      bar.firstChild.style.width = Math.min(100, video.currentTime / video.duration * 100) + "%";
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(draw); else requestAnimationFrame(draw);
    }
    function finish() {
      video.removeEventListener("ended", finish);
      video.pause(); video.playbackRate = rate;
      if (rec.state !== "inactive") rec.stop();
      try { audioSrc.disconnect(); audioSrc.connect(audioCtx.destination); } catch (e) { }
      m.remove();
    }
    rec.onstop = function () {
      stream.getTracks().forEach(function (tr) { if (tr.kind === "video") tr.stop(); });
      if (stopped) return S3.toast("Cancelled");
      var mime = (rec.mimeType || type || "video/webm").split(";")[0];
      S3.download(new Blob(chunks, { type: mime }), fileBase() + "-subtitled." + (/mp4/.test(mime) ? "mp4" : "webm")); S3.done();
    };
    video.addEventListener("seeked", function go() {
      video.removeEventListener("seeked", go);
      video.addEventListener("ended", finish);
      rec.start(1000); video.play(); draw();
    });
  }

  // ---------- page ----------
  function stats() {
    var n = st.cues.length, last = st.cues.reduce(function (m, c) { return Math.max(m, c.end); }, 0);
    $("#se-stats").textContent = (st.name ? st.name + " · " : "") + n + (n === 1 ? " line" : " lines") + (n ? " · up to " + short(last) : "") + " · nothing is uploaded";
  }
  function renderAll() { renderPlayer(); drawTimeline(); renderList(); stats(); markSel(); }
  function actions() {
    var a = $("#se-actions");
    a.appendChild(btn("", undo, "ghost icon", "", "Undo (Ctrl+Z)")); a.lastChild.textContent = "↶";
    a.appendChild(btn("", redo, "ghost icon", "", "Redo (Ctrl+Shift+Z)")); a.lastChild.textContent = "↷";
    a.appendChild(btn("Import", pickSubs, "", "upload", "Import an SRT or VTT file"));
    a.appendChild(btn("Export", exportDialog, "primary", "download"));
  }
  document.addEventListener("keydown", function (e) {
    if ($(".s3-modal")) return;
    var tag = e.target && e.target.tagName, typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if ((e.ctrlKey || e.metaKey) && !typing && !e.altKey) {
      if (e.key === "z" || e.key === "Z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (e.key === "y" || e.key === "Y") { e.preventDefault(); redo(); }
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    var c = sel && byId(sel), k = e.key;
    if (k === " " || k === "k" || k === "K") { e.preventDefault(); togglePlay(); }
    else if (k === "ArrowLeft") { e.preventDefault(); seek(cur() - (e.shiftKey ? 5 : 1)); }
    else if (k === "ArrowRight") { e.preventDefault(); seek(cur() + (e.shiftKey ? 5 : 1)); }
    else if (k === "n" || k === "N") { e.preventDefault(); addCue(); }
    else if (k === "[" && c) setEdge(c, "start");
    else if (k === "]" && c) setEdge(c, "end");
    else if ((k === "s" || k === "S") && c) split(c);
    else if ((k === "Delete" || k === "Backspace") && c) { e.preventDefault(); removeCue(c); }
    else if (k === "+" || k === "=") zoom(1.4);
    else if (k === "-") zoom(.7);
  });
  // dropping a file anywhere: subtitles are imported, media is opened
  document.addEventListener("dragover", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) e.preventDefault(); });
  document.addEventListener("drop", function (e) {
    if (!e.dataTransfer || !e.dataTransfer.files.length || e.defaultPrevented) return;
    e.preventDefault();
    var f = e.dataTransfer.files[0];
    if (/\.(srt|vtt)$/i.test(f.name)) S3.readFile(f, "text").then(function (txt) { var cues = parseSubs(txt); if (!cues.length) return S3.toast("No subtitle lines found", "error"); change(function () { st.cues = cues; }); S3.toast(cues.length + " lines imported"); });
    else openMedia(f);
  });

  actions();
  renderAll();
  window.SE = { state: function () { return st; }, parseSubs: parseSubs, toSrt: toSrt, toVtt: toVtt, parseTime: parseTime, video: video, drawCaption: drawCaption };
})();
