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
    video.src = mediaURL; hasMedia = true; loadWave(file);
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
    track.insertBefore(h("canvas", { "class": "se-wave", id: "se-wave", "aria-hidden": "true" }), track.firstChild);
    track.appendChild(h("div", { "class": "se-playhead", id: "se-playhead" }));
    var scroller = h("div", { "class": "se-tlscroll", id: "se-tlscroll" }, [ruler, track]);
    p.appendChild(h("div", { "class": "row between se-tlbar" }, [h("b", { text: "Timeline" }), h("div", { "class": "row" }, [
      btn("−", function () { zoom(.7); }, "ghost icon small", "", "Zoom out"), btn("+", function () { zoom(1.4); }, "ghost icon small", "", "Zoom in")])]));
    p.appendChild(scroller);
    scroller.scrollLeft = keepScroll;
    lastActive = null; tick();
    scroller.addEventListener("pointerdown", tlDown);
    scroller.addEventListener("scroll", function () { requestAnimationFrame(drawWave); });
    drawWave();
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
  function renderAll() { renderPlayer(); drawTimeline(); renderList(); stats(); markSel(); styleCard(); }
  // ---------- caption style ----------
  var styleBuilt = false;
  function styleCard() {
    if (styleBuilt) return; styleBuilt = true;
    var s = st.style, card = h("details", { "class": "card se-style" }, [h("summary", { text: "Caption style (preview and burned-in video)" })]);
    function set(k, v) { s[k] = v; st.style = cleanStyle(s); s = st.style; save(); updateOverlay(); }
    var size = h("input", { type: "range", min: "2", max: "12", step: "0.5", value: String(s.size), "aria-label": "Text size" });
    size.addEventListener("input", function () { set("size", +size.value); });
    var color = h("input", { type: "color", value: s.color, "aria-label": "Text colour" });
    color.addEventListener("input", function () { set("color", color.value); });
    function sel3(opts, v, k) { var e = h("select", { "class": "select" }, opts.map(function (o) { return h("option", { value: o[0], text: o[1] }); })); e.value = v; e.addEventListener("change", function () { set(k, e.value); }); return e; }
    var bold = h("input", { type: "checkbox" }); bold.checked = s.bold; bold.addEventListener("change", function () { set("bold", bold.checked); });
    card.appendChild(h("div", { "class": "se-style-grid" }, [
      h("label", { "class": "field" }, ["Size", size]), h("label", { "class": "field" }, ["Colour", color]),
      h("label", { "class": "field" }, ["Background", sel3([["box", "Dark box"], ["outline", "Outline"], ["none", "None"]], s.bg, "bg")]),
      h("label", { "class": "field" }, ["Position", sel3([["bottom", "Bottom"], ["top", "Top"]], s.pos, "pos")]),
      h("label", { "class": "check" }, [bold, "Bold"])
    ]));
    $("#se-player").parentNode.insertBefore(card, $("#se-timeline").nextSibling);
  }

  // ---------- waveform (decoded once per file; drawn only for the visible part of the timeline) ----------
  var peaks = null, peaksRate = 100; // peak values per second
  function loadWave(file) {
    peaks = null;
    if (file.size > 300 * 1024 * 1024) return; // too heavy to decode in memory
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    S3.readFile(file).then(function (buf) {
      var ac = new AC();
      return ac.decodeAudioData(buf).then(function (ab) {
        var ch = ab.getChannelData(0), per = Math.max(1, Math.floor(ab.sampleRate / peaksRate)), n = Math.ceil(ch.length / per), out = new Float32Array(n);
        for (var i = 0; i < n; i++) { var m = 0, e = Math.min(ch.length, (i + 1) * per); for (var j = i * per; j < e; j += 4) { var v = Math.abs(ch[j]); if (v > m) m = v; } out[i] = m; }
        var max = 0; for (var k = 0; k < n; k++) if (out[k] > max) max = out[k];
        if (max > 0) for (var q = 0; q < n; q++) out[q] /= max;
        peaks = out; if (ac.close) ac.close(); drawWave();
      });
    }).catch(function () { peaks = null; });
  }
  function drawWave() {
    var sc = $("#se-tlscroll"), cv = $("#se-wave"); if (!sc || !cv) return;
    var w = sc.clientWidth, hh = 64, dpr = window.devicePixelRatio || 1;
    cv.style.left = sc.scrollLeft + "px"; cv.style.width = w + "px";
    cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr);
    var x = cv.getContext("2d"); x.clearRect(0, 0, cv.width, cv.height);
    if (!peaks) return;
    x.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text-3") || "#888"; x.globalAlpha = .3;
    for (var px = 0; px < w; px++) {
      var t0 = (sc.scrollLeft + px) / pps, t1 = (sc.scrollLeft + px + 1) / pps, a = Math.floor(t0 * peaksRate), b = Math.max(a + 1, Math.floor(t1 * peaksRate)), m = 0;
      for (var i = a; i < b && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
      var bh = m * hh * .9; x.fillRect(px * dpr, (hh - bh) / 2 * dpr, dpr, Math.max(dpr, bh * dpr));
    }
  }

  // ---------- tools: type then tap, shift, find and replace, help ----------
  function modal(title, body, focusSel) {
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": title });
    var sheet = h("div", { "class": "s3-sheet se-sheet" }, [h("div", { "class": "row between" }, [h("h2", { text: title }), btn("", close, "ghost icon", "x", "Close")])].concat(body));
    m.appendChild(sheet);
    function close() { m.remove(); document.removeEventListener("keydown", onKey); if (m.onclose) m.onclose(); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m);
    var f = sheet.querySelector(focusSel || "textarea,input,select,.btn.primary"); if (f) f.focus();
    m.close = close; return m;
  }
  function tapTool() {
    if (!hasMedia) return S3.toast("Open the video first", "error");
    var ta = h("textarea", { "class": "textarea prose", rows: "8", dir: "auto", placeholder: "Paste the script here, one subtitle per line." });
    var m = modal("Type then tap", [h("p", { "class": "faint", text: "Paste the words, one subtitle per line. Then press Start: the video plays and you press Space (or the big button) each time the next line begins. Press Done at the end." }), ta,
      h("div", { "class": "row end mt" }, [btn("Start tapping", start, "primary", "play")])]);
    function start() {
      var lines = ta.value.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) return S3.toast("Paste some lines first", "error");
      m.close();
      var made = [], i = 0, open = null, before = JSON.stringify(st.cues);
      var next = h("p", { "class": "se-tapnext", dir: "auto" }), count = h("p", { "class": "faint" });
      var tapBtn = btn("Tap — next line starts", tap, "primary big se-tapbtn");
      var mm = modal("Tapping", [count, next, tapBtn, h("div", { "class": "row end mt" }, [btn("Done", done, "")])], ".se-tapbtn");
      mm.onclose = function () { video.pause(); document.removeEventListener("keydown", onSpace, true); };
      function show() { next.textContent = i < lines.length ? lines[i] : "All lines placed. Press Done."; count.textContent = "Line " + Math.min(i + 1, lines.length) + " of " + lines.length; }
      function tap() {
        var t = Math.round(video.currentTime * 1000) / 1000;
        if (open) { open.end = Math.max(open.start + .3, t - .04); open = null; }
        if (i < lines.length) { open = { id: uid(), start: t, end: t + 2, text: lines[i] }; made.push(open); i++; }
        show();
      }
      function done() {
        if (open) open.end = Math.max(open.start + .3, Math.min(video.currentTime, open.start + 4));
        if (made.length) { past.push(before); future = []; st.cues = cleanCues(st.cues.concat(made)); save(); renderAll(); S3.toast(made.length + " lines timed"); }
        mm.close();
      }
      function onSpace(e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); tap(); } }
      document.addEventListener("keydown", onSpace, true);
      show(); video.play();
    }
  }
  function shiftTool() {
    var amt = h("input", { "class": "input", type: "number", step: "0.1", value: "0.5", "aria-label": "Seconds" });
    var from = h("select", { "class": "select" }, [h("option", { value: "all", text: "All lines" }), h("option", { value: "sel", text: "Selected line and after" })]);
    modal("Shift timings", [h("p", { "class": "faint", text: "Move lines later (positive) or earlier (negative) when the subtitles are out of sync." }),
      h("div", { "class": "se-style-grid" }, [h("label", { "class": "field" }, ["Seconds", amt]), h("label", { "class": "field" }, ["Which lines", from])]),
      h("div", { "class": "row end mt" }, [btn("Shift", function () {
        var d = parseFloat(amt.value); if (!isFinite(d) || !d) return S3.toast("Type a number of seconds, like 1.5 or -0.4", "error");
        var startAt = from.value === "sel" && sel && byId(sel) ? byId(sel).start : -1;
        change(function () { st.cues.forEach(function (c) { if (c.start >= startAt) { var len = c.end - c.start; c.start = Math.max(0, Math.round((c.start + d) * 1000) / 1000); c.end = c.start + len; } }); });
        S3.toast("Timings shifted");
      }, "primary")])]);
  }
  function findTool() {
    var f = h("input", { "class": "input", type: "text", dir: "auto", "aria-label": "Find" }), r = h("input", { "class": "input", type: "text", dir: "auto", "aria-label": "Replace with" });
    var cs = h("input", { type: "checkbox" });
    modal("Find and replace", [h("div", { "class": "se-style-grid" }, [h("label", { "class": "field" }, ["Find", f]), h("label", { "class": "field" }, ["Replace with", r])]), h("label", { "class": "check" }, [cs, "Match case"]),
      h("div", { "class": "row end mt" }, [btn("Replace all", function () {
        if (!f.value) return S3.toast("Type what to find", "error");
        var re = new RegExp(f.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), cs.checked ? "g" : "gi"), n = 0;
        st.cues.forEach(function (c) { var m2 = c.text.match(re); if (m2) n += m2.length; });
        if (!n) return S3.toast("Not found", "error");
        change(function () { st.cues.forEach(function (c) { c.text = c.text.replace(re, function () { return r.value; }); }); });
        S3.toast(n + (n === 1 ? " replacement" : " replacements"));
      }, "primary")])]);
  }
  function help() {
    var keys = [["Space / K", "Play / pause"], ["← →", "Back / forward 1 s (Shift: 5 s)"], ["N", "New line at the playhead"], ["[ ]", "Start / end of the selected line at the playhead"],
      ["S", "Split the selected line"], ["Del", "Delete the selected line"], ["Ctrl+Enter", "In a line: next line after this one"], ["+ / −", "Zoom the timeline"], ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"]];
    modal("Keyboard shortcuts", [h("div", { "class": "se-keys" }, keys.map(function (k) { return h("div", { "class": "row" }, [h("kbd", { text: k[0] }), h("span", { "class": "muted", text: k[1] })]); }))], "button");
  }
  function actions() {
    var a = $("#se-actions");
    a.appendChild(btn("", undo, "ghost icon", "", "Undo (Ctrl+Z)")); a.lastChild.textContent = "↶";
    a.appendChild(btn("", redo, "ghost icon", "", "Redo (Ctrl+Shift+Z)")); a.lastChild.textContent = "↷";
    var menu = h("details", { "class": "se-menu" }, [h("summary", { "class": "btn" }, [icon("settings"), "Tools"])]);
    var list = h("div", { "class": "se-menu-list", role: "menu" });
    [["Type then tap…", tapTool], ["Shift timings…", shiftTool], ["Find and replace…", findTool], ["Keyboard shortcuts", help]].forEach(function (it) {
      list.appendChild(h("button", { type: "button", role: "menuitem", onclick: function () { menu.open = false; it[1](); } }, [it[0]]));
    });
    menu.appendChild(list);
    menu.addEventListener("toggle", function () { if (!menu.open) return; list.style.left = ""; list.style.right = ""; if (list.getBoundingClientRect().left < 8) { list.style.left = "0"; list.style.right = "auto"; } });
    document.addEventListener("click", function (e) { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    a.appendChild(menu);
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
    else if (k === "?") help();
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

  window.S3_SELFTEST = async function () {
    try {
      var ok = true;
      var vtt = "\uFEFFWEBVTT\r\n\r\nNOTE hi\r\n\r\n00:01.000 --> 00:02.500 align:start\r\n<v Bob><i>Hi</i> there</v>\r\n\r\n1:00:00.000 --> 1:00:01.250\r\nLate";
      var a = parseSubs(vtt);
      ok = ok && a.length === 2 && a[0].start === 1 && a[0].end === 2.5 && a[0].text === "<v Bob>Hi there</v>".replace(/<\/?v[^>]*>/g, "") && a[1].start === 3600 && a[1].end === 3601.25;
      var srt = toSrt([{ start: 3.2, end: 5.05, text: "One\ntwo" }, { start: 1, end: 2, text: "Zero" }].map(function (c) { return c; }).sort(function (x, y) { return x.start - y.start; }));
      ok = ok && srt === "1\n00:00:01,000 --> 00:00:02,000\nZero\n\n2\n00:00:03,200 --> 00:00:05,050\nOne\ntwo\n";
      var back = parseSubs(srt); ok = ok && back.length === 2 && back[1].text === "One\ntwo" && back[1].end === 5.05;
      ok = ok && toVtt(back).indexOf("WEBVTT\n\n00:00:01.000 --> 00:00:02.000") === 0;
      ok = ok && parseTime("1:02.5") === 62.5 && parseTime("01:00:00,5") === 3600.5 && isNaN(parseTime("abc")) && fmtIn(62.5) === "1:02.500" && fmtIn(3700) === "01:01:40.000";
      var cl = cleanCues([{ start: 5, end: 4, text: 1 }, { start: 1, end: 2, text: "a" }, null]);
      ok = ok && cl.length === 2 && cl[0].start === 1 && cl[1].end > cl[1].start && cl[1].text === "";
      var cv = document.createElement("canvas"); cv.width = 320; cv.height = 180; var x = cv.getContext("2d", { willReadFrequently: true });
      drawCaption(x, "Hello", 320, 180, cleanStyle({ bg: "box", color: "#ffffff" }));
      var px = x.getImageData(0, 150, 320, 25).data, dark = 0, white = 0;
      for (var i = 0; i < px.length; i += 4) { if (px[i + 3] > 150 && px[i] < 40) dark++; if (px[i] > 230 && px[i + 1] > 230 && px[i + 3] > 200) white++; }
      ok = ok && dark > 50 && white > 20;
      return ok;
    } catch (e) { return false; }
  };

  actions();
  renderAll();
  window.SE = { state: function () { return st; }, fmtIn: fmtIn, cleanCues: cleanCues, cleanStyle: cleanStyle, parseSubs: parseSubs, toSrt: toSrt, toVtt: toVtt, parseTime: parseTime, video: video, drawCaption: drawCaption };
})();
