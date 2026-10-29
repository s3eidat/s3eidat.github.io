/* Teleprompter — script editor and a full-screen prompter. Scripts and settings stay in this browser. */
(function () {
  "use strict";
  var $ = S3.$, h = S3.h;
  var KEY = "teleprompter";
  var WPM = 140; // typical speaking pace, for the time estimate
  var SCHEMES = { dark: ["#000000", "#ffffff"], light: ["#ffffff", "#111111"], yellow: ["#000000", "#ffd84d"], green: ["#04140b", "#7dffb0"] };
  var SAMPLE = "Welcome to the teleprompter.\n\nPaste or type your script here. Press Start, and the text scrolls up past the reading line at the speed you choose.\n\nSpace pauses. The up and down arrows change the speed. Left and right jump back and forward, and so do most Bluetooth clickers and foot pedals.\n\nLook at the line, not the whole page, and speak at your own pace. Good luck!";
  var DEF = { speed: 6, size: 56, line: 1.45, width: 80, marker: 38, mirrorX: false, mirrorY: false, countdown: 3, scheme: "dark", showMarker: true };

  function num(v, lo, hi, d) { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
  function cleanSet(s) {
    s = s || {};
    return { speed: num(s.speed, 1, 30, DEF.speed), size: num(s.size, 20, 160, DEF.size), line: num(s.line, 1, 2.4, DEF.line), width: num(s.width, 40, 100, DEF.width),
      marker: num(s.marker, 10, 80, DEF.marker), mirrorX: !!s.mirrorX, mirrorY: !!s.mirrorY, countdown: [0, 3, 5, 10].indexOf(+s.countdown) >= 0 ? +s.countdown : 3,
      scheme: SCHEMES[s.scheme] ? s.scheme : "dark", showMarker: s.showMarker !== false };
  }
  var saved = S3.store(KEY) || {};
  if (!saved.set && window.innerWidth < 600) saved.set = { size: 34 }; // first visit on a phone: smaller text
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function cleanDoc(d) { return { id: typeof d.id === "string" && d.id ? d.id.slice(0, 40) : uid(), title: typeof d.title === "string" ? d.title.slice(0, 120) : "", text: typeof d.text === "string" ? d.text.slice(0, 500000) : "" }; }
  // Accepts stored data in either the old one-script format or the library format.
  function load(d) {
    d = d && typeof d === "object" ? d : {};
    var list = Array.isArray(d.scripts) ? d.scripts.filter(function (x) { return x && typeof x === "object"; }).slice(0, 200).map(cleanDoc)
      : typeof d.text === "string" ? [cleanDoc(d)] : [];
    if (!list.length) list = [{ id: uid(), title: "", text: SAMPLE }];
    var cur = list.some(function (x) { return x.id === d.cur; }) ? d.cur : list[0].id;
    return { scripts: list, cur: cur, set: cleanSet(d.set) };
  }
  var st = load(saved);
  function doc() { for (var i = 0; i < st.scripts.length; i++) if (st.scripts[i].id === st.cur) return st.scripts[i]; return st.scripts[0]; }
  var save = S3.debounce(function () { if (S3.store(KEY, st) === undefined) S3.toast("Couldn't save in this browser. Copy your script somewhere safe.", "error"); }, 300);

  function words(t) { var m = String(t).match(/[^\s]+/g); return m ? m.length : 0; }
  function fmt(sec) { sec = Math.max(0, Math.round(sec)); var m = Math.floor(sec / 60), s = sec % 60; return m + ":" + (s < 10 ? "0" : "") + s; }
  function icon(n) { var s = h("span", { "class": "tp-ic", "aria-hidden": "true" }); s.innerHTML = S3.icon(n); return s; }
  function btn(label, onclick, cls, ic, title) {
    return h("button", { type: "button", "class": "btn " + (cls || ""), onclick: onclick, title: title || null, "aria-label": title || null }, ic ? [icon(ic)].concat(label ? [label] : []) : [label]);
  }

  // Script text -> paragraphs. Each paragraph picks its own direction, so Arabic and English can mix.
  function paragraphs(text) {
    return String(text).replace(/\r\n?/g, "\n").split(/\n/).map(function (l) { return l.trim(); });
  }
  // A line in [square brackets] is a cue for you (shown dim and small); **text** is shown bold.
  function line(l) {
    var p = h("p", { dir: "auto", "class": /^\[[^\]]*\]$/.test(l) ? "tp-cue" : null });
    var parts = l.split("**");
    if (parts.length % 2 === 0) { parts[parts.length - 2] += "**" + parts.pop(); } // unclosed ** stays as typed
    parts.forEach(function (t, i) { if (t) p.appendChild(i % 2 ? h("b", { text: t }) : document.createTextNode(t)); });
    return p;
  }
  function renderScript(el, text) {
    el.textContent = "";
    paragraphs(text).forEach(function (l) {
      el.appendChild(l ? line(l) : h("p", { "class": "tp-gap", "aria-hidden": "true" }));
    });
  }

  // ---------- editor page ----------
  var ta, stats;
  function updateStats() {
    var w = words(doc().text);
    stats.textContent = w + (w === 1 ? " word" : " words") + " · about " + fmt(w / WPM * 60) + " to read aloud";
  }
  function slider(label, key, min, max, step, unit) {
    var out = h("output", { "class": "tp-val" });
    var r = h("input", { type: "range", min: String(min), max: String(max), step: String(step), "aria-label": label });
    r.value = st.set[key];
    function show() { out.textContent = (key === "line" ? (+st.set[key]).toFixed(2) : st.set[key]) + (unit || ""); }
    r.addEventListener("input", function () { st.set[key] = +r.value; show(); save(); });
    show();
    return h("label", { "class": "field tp-field" }, [h("span", { "class": "row between" }, [label, out]), r]);
  }
  function check(label, key) {
    var c = h("input", { type: "checkbox" }); c.checked = st.set[key];
    c.addEventListener("change", function () { st.set[key] = c.checked; save(); });
    return h("label", { "class": "check" }, [c, label]);
  }
  function select(label, key, opts) {
    var s = h("select", { "class": "select" }, opts.map(function (o) { return h("option", { value: String(o[0]), text: o[1] }); }));
    s.value = String(st.set[key]);
    s.addEventListener("change", function () { st.set[key] = key === "countdown" ? +s.value : s.value; save(); });
    return h("label", { "class": "field" }, [label, s]);
  }
  function build() {
    stats = $("#tp-stats");
    var title = $("#tp-title");
    title.value = doc().title;
    title.addEventListener("input", function () { doc().title = title.value.slice(0, 120); save(); var o = $("#tp-lib option[value=\"" + st.cur + "\"]"); if (o) o.textContent = doc().title || firstWords(doc().text) || "Untitled script"; });
    $("#tp-actions").appendChild(btn("Start prompter", function () { prompt(0); }, "primary big", "play"));

    ta = h("textarea", { "class": "textarea prose tp-text", dir: "auto", spellcheck: "true", placeholder: "Paste or type your script…", "aria-label": "Script" });
    ta.value = doc().text;
    ta.addEventListener("input", function () { doc().text = ta.value; updateStats(); save(); });
    var ed = $("#tp-editor");
    ed.appendChild(ta);
    ed.appendChild(h("div", { "class": "row between tp-edfoot" }, [
      h("span", { "class": "faint", text: "Blank lines become pauses. Start from the cursor with Ctrl+Enter." }),
      btn("Clear", function () {
        var d = doc(), before = d.text;
        ta.value = ""; d.text = ""; updateStats(); save(); ta.focus();
        var t = S3.toast("Script cleared ");
        t.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { d.text = before; if (doc() === d) ta.value = before; updateStats(); save(); t.remove(); } }, ["Undo"]));
      }, "ghost small", "trash")
    ]));
    ta.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); prompt(startFraction()); }
    });

    $("#tp-side").appendChild(h("div", { "class": "card stack", id: "tp-lib" }));
    library();
    $("#tp-actions").insertBefore(btn("?", help, "ghost tp-help", "", "Keyboard shortcuts (?)"), $("#tp-actions").firstChild);
    $("#tp-side").appendChild(h("div", { "class": "card stack" }, [
      h("h2", { text: "Prompter" }),
      slider("Speed", "speed", 1, 30, 1, ""),
      slider("Text size", "size", 20, 160, 2, " px"),
      slider("Line spacing", "line", 1, 2.4, 0.05, ""),
      slider("Text width", "width", 40, 100, 5, "%"),
      slider("Reading line", "marker", 10, 80, 1, "% from top"),
      select("Colours", "scheme", [["dark", "White on black"], ["light", "Black on white"], ["yellow", "Yellow on black"], ["green", "Green on dark"]]),
      select("Countdown", "countdown", [[0, "None"], [3, "3 seconds"], [5, "5 seconds"], [10, "10 seconds"]]),
      h("div", { "class": "stack tp-checks" }, [check("Mirror left–right (for prompter glass)", "mirrorX"), check("Flip upside down", "mirrorY"), check("Show reading line", "showMarker")])
    ]));
    updateStats();
  }
  // ---------- script library ----------
  function fileBase(t) { return (t || "").replace(/[^A-Za-z0-9 _.-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60).replace(/ /g, "-") || "script"; }
  function show() { $("#tp-title").value = doc().title; ta.value = doc().text; updateStats(); library(); }
  function pick(id) { st.cur = id; save(); show(); }
  function library() {
    var box = $("#tp-lib"); box.textContent = "";
    var sel = h("select", { "class": "select", "aria-label": "Script" }, st.scripts.map(function (x) { return h("option", { value: x.id, text: x.title || firstWords(x.text) || "Untitled script" }); }));
    sel.value = st.cur;
    sel.addEventListener("change", function () { pick(sel.value); });
    var file = h("input", { type: "file", accept: ".txt,.md,.text,text/plain,text/markdown", hidden: true });
    file.addEventListener("change", function () {
      var f = file.files[0]; file.value = ""; if (!f) return;
      if (f.size > 2e6) return S3.toast("That file is too big for a script", "error");
      S3.readFile(f, "text").then(function (txt) {
        var d = { id: uid(), title: f.name.replace(/\.[^.]+$/, "").slice(0, 120), text: txt.slice(0, 500000) };
        st.scripts.unshift(d); pick(d.id); S3.toast("Opened " + f.name);
      });
    });
    box.appendChild(h("h2", { text: "Scripts" }));
    box.appendChild(sel);
    box.appendChild(h("div", { "class": "row tp-lib-btns" }, [
      btn("New", function () { var d = { id: uid(), title: "", text: "" }; st.scripts.unshift(d); pick(d.id); ta.focus(); }, "small", "plus"),
      btn("Open .txt", function () { file.click(); }, "small", "upload"),
      btn("Save .txt", function () { S3.download(doc().text, fileBase(doc().title || firstWords(doc().text)) + ".txt", "text/plain;charset=utf-8"); S3.done(); }, "small", "download"),
      btn("", function () {
        var d = doc(), at = st.scripts.indexOf(d);
        st.scripts.splice(at, 1);
        if (!st.scripts.length) st.scripts.push({ id: uid(), title: "", text: "" });
        pick(st.scripts[Math.min(at, st.scripts.length - 1)].id);
        var t = S3.toast("Script deleted ");
        t.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { st.scripts.splice(at, 0, d); pick(d.id); t.remove(); } }, ["Undo"]));
      }, "small ghost tp-del", "trash", "Delete this script"),
      file
    ]));
  }
  function firstWords(t) { return String(t || "").trim().split(/\s+/).slice(0, 6).join(" ").slice(0, 50); }
  function help() {
    var keys = [["Ctrl+Enter", "Start from the cursor (in the editor)"], ["Space / Enter / tap", "Play or pause"], ["↑ ↓", "Faster / slower"], ["← → / Page Up, Page Down", "Back / forward (clickers and pedals)"],
      ["+ −", "Bigger / smaller text"], ["M", "Mirror left–right"], ["C", "Camera on/off"], ["R", "Start / stop recording"], ["Home / End", "Start / end of the script"], ["Esc", "Close the prompter"]];
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Keyboard shortcuts" });
    var sheet = h("div", { "class": "s3-sheet" }, [h("div", { "class": "row between" }, [h("h2", { text: "Keyboard shortcuts" }), btn("", close, "ghost icon", "x", "Close")]),
      h("div", { "class": "tp-keys" }, keys.map(function (k) { return h("div", { "class": "row" }, [h("kbd", { text: k[0] }), h("span", { "class": "muted", text: k[1] })]); })),
      h("p", { "class": "faint", text: "Write a line in [square brackets] for a cue to yourself, like [smile] or [pause]; it shows small and dim. Put **two stars** around words to show them bold." })]);
    m.appendChild(sheet);
    function close() { m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m); sheet.querySelector("button").focus();
  }
  document.addEventListener("keydown", function (e) {
    var tag = e.target && e.target.tagName;
    if (P || e.ctrlKey || e.metaKey || e.altKey || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || $(".s3-modal")) return;
    if (e.key === "?") { e.preventDefault(); help(); }
  });

  // Where the cursor is in the script, as a fraction of the text, so Ctrl+Enter starts from there.
  function startFraction() {
    var t = ta.value, at = ta.selectionStart || 0;
    var lineStart = t.lastIndexOf("\n", at - 1) + 1;
    return t.length ? lineStart / t.length : 0;
  }

  // ---------- prompter ----------
  var P = null; // the open prompter, if any
  function prompt(fromFraction) {
    if (P) return;
    if (!doc().text.trim()) { S3.toast("Write or paste a script first", "error"); ta.focus(); return; }
    var s = st.set, colors = SCHEMES[s.scheme];
    var ov = h("div", { "class": "tp-ov", role: "dialog", "aria-modal": "true", "aria-label": "Prompter", style: "background:" + colors[0] + ";color:" + colors[1] });
    var mirror = h("div", { "class": "tp-mirror" });
    var roll = h("div", { "class": "tp-roll" });
    var script = h("div", { "class": "tp-script" });
    renderScript(script, doc().text);
    roll.appendChild(script); mirror.appendChild(roll); ov.appendChild(mirror);
    var marker = h("div", { "class": "tp-marker" }, [h("span", { "class": "tp-arrow" }, ["▶"])]);
    ov.appendChild(marker);
    var bar = h("div", { "class": "tp-progress" }, [h("span")]);
    ov.appendChild(bar);
    var cd = h("div", { "class": "tp-count", hidden: true, "aria-live": "assertive" });
    ov.appendChild(cd);
    var time = h("span", { "class": "tp-time mono" });
    var spd = h("span", { "class": "tp-spd" });
    var pp = btn("", toggle, "primary icon", "play", "Play / pause (Space)");
    var camBtn = btn("Camera", camToggle, "small", "", "Camera on/off (C)");
    var recBtn = btn("Record", recToggle, "small tp-rec", "", "Start/stop recording (R)"); recBtn.hidden = true;
    var mBtn = btn("Mirror", function () { s.mirrorX = !s.mirrorX; apply(); save(); }, "small", "", "Mirror (M)");
    var ctl = h("div", { "class": "tp-ctl" }, [
      btn("", close, "icon", "x", "Close (Esc)"),
      btn("", function () { jump(-1); }, "icon", "", "Back (←)"), pp, btn("", function () { jump(1); }, "icon", "", "Forward (→)"),
      h("span", { "class": "tp-grp" }, [btn("−", function () { speed(-1); }, "small", "", "Slower (↓)"), spd, btn("+", function () { speed(1); }, "small", "", "Faster (↑)")]),
      h("span", { "class": "tp-grp" }, [btn("A−", function () { size(-4); }, "small", "", "Smaller text (−)"), btn("A+", function () { size(4); }, "small", "", "Bigger text (+)")]),
      mBtn, btn("", restart, "small icon", "refresh", "Back to start (Home)"), camBtn, recBtn, time
    ]);
    var ctlBtns = S3.$$(".btn", ctl); ctlBtns[1].textContent = "«"; ctlBtns[3].textContent = "»";
    ov.appendChild(ctl);

    var pos = 0, max = 0, playing = false, last = 0, raf = 0, hideT = 0, count = 0, countT = 0, lock = null;
    P = { ov: ov };
    function pxPerSec() { return s.speed * s.size * 0.09; }
    function apply() {
      script.style.fontSize = s.size + "px"; script.style.lineHeight = String(s.line); script.style.width = s.width + "%";
      var vh = ov.clientHeight, mk = vh * s.marker / 100, lh = s.size * s.line;
      // the first line is centred on the reading line; the band marks one line
      roll.style.paddingTop = (mk - lh / 2) + "px"; roll.style.paddingBottom = (vh - mk) + "px";
      marker.style.height = lh + "px"; marker.style.top = (mk - lh / 2) + "px"; marker.hidden = !s.showMarker;
      mirror.style.transform = "scale(" + (s.mirrorX ? -1 : 1) + "," + (s.mirrorY ? -1 : 1) + ")";
      // the reading line has to be where the reader sees it: flip it too when upside down
      if (s.mirrorY) marker.style.top = (vh - mk - lh / 2) + "px";
      mBtn.setAttribute("aria-pressed", String(s.mirrorX));
      marker.classList.toggle("is-flip", s.mirrorX);
      max = Math.max(0, script.offsetHeight - lh);
      pos = Math.min(pos, max);
      draw();
    }
    function draw() {
      roll.style.transform = "translate3d(0," + (-pos) + "px,0)";
      var rate = pxPerSec();
      time.textContent = fmt(pos / rate) + " / -" + fmt((max - pos) / rate);
      spd.textContent = String(s.speed);
      bar.firstChild.style.width = (max ? pos / max * 100 : 0) + "%";
    }
    function frame(now) {
      if (playing) {
        pos += pxPerSec() * Math.min(0.1, (now - last) / 1000);
        if (pos >= max) { pos = max; setPlaying(false); }
        draw();
      }
      last = now;
      raf = requestAnimationFrame(frame);
    }
    function setPlaying(on) {
      playing = on; last = performance.now();
      pp.innerHTML = S3.icon(on ? "pause" : "play");
      ov.classList.toggle("is-playing", on);
      if (on) { wake(); idle(); } else showCtl();
    }
    function toggle() {
      if (count) { stopCount(); return; }
      if (playing) return setPlaying(false);
      if (pos >= max) pos = 0;
      if (s.countdown) startCount(); else setPlaying(true);
    }
    function startCount() {
      count = s.countdown; cd.hidden = false; cd.textContent = String(count);
      countT = setInterval(function () {
        count--;
        if (count <= 0) { stopCount(); setPlaying(true); } else cd.textContent = String(count);
      }, 1000);
    }
    function stopCount() { clearInterval(countT); count = 0; cd.hidden = true; }
    function speed(d) { s.speed = num(s.speed + d, 1, 30, 6); draw(); save(); }
    function size(d) {
      var frac = max ? pos / max : 0;
      s.size = num(s.size + d, 20, 160, 56); apply(); pos = frac * max; draw(); save();
    }
    // jump about two lines; Bluetooth clickers and pedals send these keys
    function jump(dir) { pos = Math.max(0, Math.min(max, pos + dir * s.size * s.line * 2)); draw(); showCtl(); }
    function restart() { stopCount(); setPlaying(false); pos = 0; draw(); }
    function showCtl() { ov.classList.remove("tp-hide"); clearTimeout(hideT); if (playing) idle(); }
    function idle() { clearTimeout(hideT); hideT = setTimeout(function () { if (playing) ov.classList.add("tp-hide"); }, 2500); }
    function wake() {
      if (lock || !navigator.wakeLock) return;
      navigator.wakeLock.request("screen").then(function (l) { lock = l; l.addEventListener("release", function () { lock = null; }); }, function () {});
    }
    // ---- camera: shown behind the script; the recording is the camera video only ----
    var cam = null, rec = null, recT = 0;
    function camToggle() { if (cam) camOff(); else camOn(); }
    function camOn() {
      var md = navigator.mediaDevices;
      if (!md || !md.getUserMedia || !window.isSecureContext) return S3.toast("This browser can't use the camera here", "error");
      camBtn.disabled = true;
      var want = { video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true };
      md.getUserMedia(want).catch(function () { return md.getUserMedia({ video: true, audio: false }); }).then(function (stream) {
        if (!P) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
        var v = h("video", { "class": "tp-cam", autoplay: true, playsinline: true });
        v.muted = true; v.srcObject = stream;
        ov.insertBefore(v, mirror); ov.classList.add("has-cam");
        cam = { stream: stream, video: v };
        camBtn.setAttribute("aria-pressed", "true"); recBtn.hidden = false;
        if (!stream.getAudioTracks().length) S3.toast("Camera on, without microphone");
      }, function () { S3.toast("Camera permission was not given", "error"); }).then(function () { camBtn.disabled = false; });
    }
    function camOff() {
      if (rec) recStop();
      if (cam) { cam.stream.getTracks().forEach(function (t) { t.stop(); }); cam.video.remove(); cam = null; }
      ov.classList.remove("has-cam"); camBtn.setAttribute("aria-pressed", "false"); recBtn.hidden = true;
    }
    function recType() {
      if (!window.MediaRecorder) return null;
      return ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0] || "";
    }
    function recToggle() { if (rec) recStop(); else recStart(); }
    function recStart() {
      var type = recType();
      if (!cam || type === null) return S3.toast("This browser can't record video", "error");
      var chunks = [], r;
      try { r = type ? new MediaRecorder(cam.stream, { mimeType: type }) : new MediaRecorder(cam.stream); } catch (e) { return S3.toast("This browser can't record video", "error"); }
      r.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      r.onstop = function () {
        var mime = r.mimeType || type || "video/webm", ext = /mp4/.test(mime) ? "mp4" : "webm", d = new Date();
        var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + "-" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
        S3.download(new Blob(chunks, { type: mime.split(";")[0] }), fileBase(doc().title || "recording") + "-" + stamp + "." + ext);
        S3.toast("Recording saved"); S3.done();
      };
      r.start(1000); rec = r;
      var t0 = Date.now();
      recBtn.classList.add("is-on"); recBtn.textContent = "● 0:00";
      recT = setInterval(function () { recBtn.textContent = "● " + fmt((Date.now() - t0) / 1000); }, 500);
      if (!playing && !count) toggle(); // recording starts the countdown and the scroll
    }
    function recStop() {
      clearInterval(recT);
      if (rec && rec.state !== "inactive") rec.stop();
      rec = null; recBtn.classList.remove("is-on"); recBtn.textContent = "Record";
      if (playing) setPlaying(false);
    }

    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key, handled = true;
      if (k === " " || k === "Enter" || k === "k" || k === "K") toggle();
      else if (k === "ArrowUp") speed(s.mirrorY ? -1 : 1);
      else if (k === "ArrowDown") speed(s.mirrorY ? 1 : -1);
      else if (k === "ArrowLeft" || k === "PageUp") jump(-1);
      else if (k === "ArrowRight" || k === "PageDown") jump(1);
      else if (k === "+" || k === "=") size(4);
      else if (k === "-" || k === "_") size(-4);
      else if (k === "m" || k === "M") { s.mirrorX = !s.mirrorX; apply(); save(); }
      else if (k === "Home") restart();
      else if (k === "c" || k === "C") camToggle();
      else if ((k === "r" || k === "R") && cam) recToggle();
      else if (k === "End") { pos = max; draw(); }
      else if (k === "Escape") close();
      else handled = false;
      if (handled) { e.preventDefault(); showCtl(); }
    }
    // wheel and drag scroll by hand; a tap without movement plays/pauses
    var drag = null;
    mirror.addEventListener("wheel", function (e) { e.preventDefault(); pos = Math.max(0, Math.min(max, pos + e.deltaY * (s.mirrorY ? -1 : 1))); draw(); showCtl(); }, { passive: false });
    mirror.addEventListener("pointerdown", function (e) { drag = { y: e.clientY, p: pos, moved: false }; mirror.setPointerCapture(e.pointerId); });
    mirror.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dy = (drag.y - e.clientY) * (s.mirrorY ? -1 : 1);
      if (Math.abs(dy) > 6) drag.moved = true;
      if (drag.moved) { pos = Math.max(0, Math.min(max, drag.p + dy)); draw(); }
    });
    mirror.addEventListener("pointerup", function () { if (drag && !drag.moved) toggle(); drag = null; showCtl(); });
    ov.addEventListener("mousemove", showCtl);
    var onResize = S3.debounce(function () { var frac = max ? pos / max : 0; apply(); pos = frac * max; draw(); }, 100);
    window.addEventListener("resize", onResize);
    function close() {
      camOff(); stopCount(); cancelAnimationFrame(raf); clearTimeout(hideT);
      document.removeEventListener("keydown", onKey, true); window.removeEventListener("resize", onResize);
      if (lock) lock.release().catch(function () {});
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
      ov.remove(); P = null; document.body.classList.remove("tp-open");
      S3.done();
    }
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(ov); document.body.classList.add("tp-open");
    if (ov.requestFullscreen) ov.requestFullscreen().catch(function () {});
    apply();
    pos = Math.max(0, Math.min(max, (fromFraction || 0) * script.offsetHeight));
    if (fromFraction) {
      // snap to the paragraph that holds the cursor
      var target = Math.round(fromFraction * doc().text.length), seen = 0, ps = S3.$$("p", script), lines = paragraphs(doc().text);
      for (var i = 0; i < lines.length; i++) { if (seen + lines[i].length >= target) { pos = Math.min(max, ps[i].offsetTop); break; } seen += lines[i].length + 1; }
    }
    draw(); setPlaying(false); pp.focus();
    raf = requestAnimationFrame(frame);
    setTimeout(apply, 300); // fullscreen changes the size
  }

  build();
  window.S3_SELFTEST = async function () {
    try {
      var a = load({ title: "Old", text: "Hello there" }), b = load(null), c = load({ scripts: [{ id: "x", text: "1" }, { id: "y", title: "Two", text: "2" }], cur: "y", set: { speed: 999, scheme: "nope" } });
      var ok = a.scripts.length === 1 && a.scripts[0].title === "Old" && a.scripts[0].text === "Hello there" && b.scripts[0].text === SAMPLE &&
        c.cur === "y" && c.scripts.length === 2 && c.set.speed === 30 && c.set.scheme === "dark";
      ok = ok && words("  one two\n three ") === 3 && paragraphs("a\r\nb\rc").length === 3;
      var cue = line("[smile]"), bold = line("say **this** now"), open = line("a ** b"), ar = line("مرحبا **بكم**");
      ok = ok && cue.className === "tp-cue" && bold.querySelector("b").textContent === "this" && bold.textContent === "say this now" &&
        !open.querySelector("b") && open.textContent === "a ** b" && ar.querySelector("b").textContent === "بكم" && ar.getAttribute("dir") === "auto";
      var el = document.createElement("div"); renderScript(el, "One\n\n<b>x</b>");
      ok = ok && el.children.length === 3 && el.children[1].className === "tp-gap" && el.children[2].textContent === "<b>x</b>" && !el.querySelector("b");
      return ok;
    } catch (e) { return false; }
  };
  window.TP = { state: function () { return st; }, paragraphs: paragraphs, words: words };
})();
