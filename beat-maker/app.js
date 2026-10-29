/* Beat Maker — drum step sequencer, bass and lead synths with a piano roll, patterns, song mode, WAV export.
   Every sound is synthesised with the Web Audio API; nothing is downloaded or uploaded. */
(function () {
  "use strict";
  var $ = S3.$, h = S3.h;
  var KEY = "beat-maker", STEPS = 16, NPAT = 8, LETTERS = "ABCDEFGH";
  var DRUMS = [["kick", "Kick"], ["snare", "Snare"], ["clap", "Clap"], ["hat", "Closed hat"], ["open", "Open hat"], ["tomlo", "Low tom"], ["tomhi", "High tom"], ["rim", "Rim"]];
  var WAVES = ["sawtooth", "square", "triangle", "sine"];
  var NOTE = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

  // ---------- project ----------
  function num(v, lo, hi, d) { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
  function emptyPattern() { return { drums: DRUMS.map(function () { return new Array(STEPS).fill(0); }), bass: [], lead: [] }; }
  function blank() {
    return { v: 1, name: "", bpm: 96, swing: 0, vol: .8, kit: "punchy", cur: 0, mode: "pattern", song: [0],
      tracks: DRUMS.map(function () { return { vol: .8, mute: false, solo: false }; }),
      synths: { bass: { wave: "sawtooth", cutoff: 700, release: .12, vol: .7, oct: 1 }, lead: { wave: "square", cutoff: 2600, release: .25, vol: .45, oct: 4 } },
      patterns: Array.from({ length: NPAT }, emptyPattern) };
  }
  function cleanNotes(list) {
    return (Array.isArray(list) ? list : []).filter(function (n) { return n && isFinite(n.s) && isFinite(n.n); }).slice(0, 512).map(function (n) {
      return { s: Math.round(num(n.s, 0, STEPS - 1, 0)), n: Math.round(num(n.n, 12, 108, 48)), l: Math.round(num(n.l, 1, STEPS, 1)) };
    });
  }
  function cleanSynth(s, d) { s = s || {}; return { wave: WAVES.indexOf(s.wave) >= 0 ? s.wave : d.wave, cutoff: num(s.cutoff, 80, 12000, d.cutoff), release: num(s.release, .02, 2, d.release), vol: num(s.vol, 0, 1, d.vol), oct: Math.round(num(s.oct, 0, 6, d.oct)) }; }
  function clean(d) {
    if (!d || typeof d !== "object" || !Array.isArray(d.patterns)) return null;
    var p = blank();
    p.name = typeof d.name === "string" ? d.name.slice(0, 80) : "";
    p.bpm = Math.round(num(d.bpm, 50, 220, 96)); p.swing = Math.round(num(d.swing, 0, 60, 0)); p.vol = num(d.vol, 0, 1, .8);
    p.kit = ["punchy", "lofi", "boom"].indexOf(d.kit) >= 0 ? d.kit : "punchy";
    p.mode = d.mode === "song" ? "song" : "pattern";
    p.cur = Math.round(num(d.cur, 0, NPAT - 1, 0));
    p.song = (Array.isArray(d.song) ? d.song : [0]).slice(0, 128).map(function (x) { return Math.round(num(x, 0, NPAT - 1, 0)); });
    if (!p.song.length) p.song = [0];
    p.tracks = DRUMS.map(function (_, i) { var t = (d.tracks || [])[i] || {}; return { vol: num(t.vol, 0, 1, .8), mute: !!t.mute, solo: !!t.solo }; });
    var ds = d.synths || {};
    p.synths = { bass: cleanSynth(ds.bass, p.synths.bass), lead: cleanSynth(ds.lead, p.synths.lead) };
    p.patterns = Array.from({ length: NPAT }, function (_, i) {
      var src = d.patterns[i] || {}, pt = emptyPattern();
      DRUMS.forEach(function (_, r) { var row = (src.drums || [])[r] || []; for (var s = 0; s < STEPS; s++) pt.drums[r][s] = [0, 1, 2].indexOf(row[s]) >= 0 ? row[s] : 0; });
      pt.bass = cleanNotes(src.bass); pt.lead = cleanNotes(src.lead);
      return pt;
    });
    return p;
  }
  var P = clean(S3.store(KEY)) || blank();
  var save = S3.debounce(function () { if (S3.store(KEY, P) === undefined) S3.toast("Couldn't save in this browser. Export a WAV or project file so you don't lose work.", "error"); }, 300);
  function pat() { return P.patterns[P.cur]; }

  // ---------- sounds ----------
  var KITS = { // tune, decay and brightness multipliers per kit
    punchy: { tune: 1, decay: 1, bright: 1, drive: 0 },
    lofi: { tune: .92, decay: .8, bright: .45, drive: 0 },
    boom: { tune: .8, decay: 1.9, bright: .8, drive: .3 }
  };
  var noiseCache = new WeakMap();
  function noise(ctx) {
    var b = noiseCache.get(ctx);
    if (!b) { b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); var d = b.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noiseCache.set(ctx, b); }
    return b;
  }
  function env(ctx, out, t, peak, dec) { var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), t + .002); g.gain.exponentialRampToValueAtTime(.0001, t + dec); g.connect(out); return g; }
  function osc(ctx, type, f, t, stop) { var o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(stop); return o; }
  function noiseSrc(ctx, t, stop) { var s = ctx.createBufferSource(); s.buffer = noise(ctx); s.start(t, Math.random() * .5); s.stop(stop); return s; }
  function filt(ctx, type, f, q) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; }
  function drum(ctx, out, key, t, vel, kitName) {
    var k = KITS[kitName] || KITS.punchy, v = vel, g, o, n, f;
    switch (key) {
      case "kick":
        g = env(ctx, out, t, v, .45 * k.decay); o = osc(ctx, "sine", 150 * k.tune, t, t + .6 * k.decay);
        o.frequency.exponentialRampToValueAtTime(42 * k.tune, t + .12 * k.decay); o.connect(g);
        var c = env(ctx, out, t, v * .4, .02); var co = osc(ctx, "square", 900, t, t + .03); co.connect(c); break;
      case "snare":
        g = env(ctx, out, t, v * .8, .2 * k.decay); n = noiseSrc(ctx, t, t + .3 * k.decay); f = filt(ctx, "highpass", 1400 * k.bright); n.connect(f); f.connect(g);
        var tg = env(ctx, out, t, v * .5, .09); o = osc(ctx, "triangle", 185 * k.tune, t, t + .12); o.connect(tg); break;
      case "clap":
        f = filt(ctx, "bandpass", 1300 * (.6 + .4 * k.bright), 1.2); f.connect(out);
        [0, .011, .022].forEach(function (d) { var gg = env(ctx, f, t + d, v * .9, .03); var nn = noiseSrc(ctx, t + d, t + d + .05); nn.connect(gg); });
        var tail = env(ctx, f, t + .03, v * .7, .18 * k.decay); var nt = noiseSrc(ctx, t + .03, t + .3); nt.connect(tail); break;
      case "hat": case "open":
        var dec = key === "hat" ? .05 : .32 * k.decay;
        g = env(ctx, out, t, v * .45, dec); n = noiseSrc(ctx, t, t + dec + .05); f = filt(ctx, "highpass", 7000 * (.5 + .5 * k.bright)); n.connect(f); f.connect(g);
        if (key === "open") openHats.push({ g: g, t: t, ctx: ctx }); else chokeOpen(ctx, t); break;
      case "tomlo": case "tomhi":
        var base = (key === "tomlo" ? 140 : 220) * k.tune;
        g = env(ctx, out, t, v * .8, .35 * k.decay); o = osc(ctx, "sine", base * 1.4, t, t + .45 * k.decay); o.frequency.exponentialRampToValueAtTime(base, t + .15); o.connect(g); break;
      case "rim":
        g = env(ctx, out, t, v * .5, .035); o = osc(ctx, "square", 1700 * k.tune, t, t + .05); f = filt(ctx, "bandpass", 1700, 4); o.connect(f); f.connect(g);
        var rn = env(ctx, out, t, v * .25, .02); var nr = noiseSrc(ctx, t, t + .03); nr.connect(rn); break;
    }
  }
  var openHats = [];
  // a closed hat cuts a ringing open hat, like on a drum machine
  function chokeOpen(ctx, t) {
    openHats = openHats.filter(function (o) { return o.ctx === ctx && o.t > t - 1; });
    openHats.forEach(function (o) {
      if (o.t >= t) return;
      var g = o.g.gain;
      if (g.cancelAndHoldAtTime) { g.cancelAndHoldAtTime(t); g.exponentialRampToValueAtTime(.0001, t + .02); } else g.setTargetAtTime(.0001, t, .008);
    });
  }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function synth(ctx, out, s, kind, midi, t, dur, vel) {
    var f = filt(ctx, "lowpass", s.cutoff * 3, kind === "bass" ? 8 : 3);
    f.frequency.setValueAtTime(s.cutoff * 3, t); f.frequency.exponentialRampToValueAtTime(Math.max(60, s.cutoff), t + .18);
    var g = ctx.createGain(), peak = (kind === "bass" ? .55 : .3) * vel, end = t + dur;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + .006);
    g.gain.setValueAtTime(peak * .8, Math.max(t + .007, end - .005)); g.gain.exponentialRampToValueAtTime(.0001, end + s.release);
    f.connect(g); g.connect(out);
    var o1 = osc(ctx, s.wave, hz(midi), t, end + s.release + .05); o1.connect(f);
    if (kind === "lead") { var o2 = osc(ctx, s.wave, hz(midi), t, end + s.release + .05); o2.detune.value = 9; o2.connect(f); }
    else { var sub = osc(ctx, "sine", hz(midi - 12), t, end + s.release + .05), sg = ctx.createGain(); sg.gain.value = .5; sub.connect(sg); sg.connect(g); }
  }
  // the mixer: one gain per drum track and per synth, into a master gain and a soft limiter
  function graph(ctx) {
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 6; comp.attack.value = .003; comp.release.value = .15; comp.connect(ctx.destination);
    var master = ctx.createGain(); master.gain.value = P.vol; master.connect(comp);
    var gr = { master: master, drums: DRUMS.map(function (_, i) { var g = ctx.createGain(); g.gain.value = P.tracks[i].vol; g.connect(master); return g; }) };
    gr.bass = ctx.createGain(); gr.bass.gain.value = P.synths.bass.vol; gr.bass.connect(master);
    gr.lead = ctx.createGain(); gr.lead.gain.value = P.synths.lead.vol; gr.lead.connect(master);
    return gr;
  }
  function audible(i) { var anySolo = P.tracks.some(function (t) { return t.solo; }); return anySolo ? P.tracks[i].solo : !P.tracks[i].mute; }
  function stepDur() { return 60 / P.bpm / 4; }
  // play one step of a pattern at time t (swing already applied by the caller)
  function playStep(ctx, gr, pt, step, t) {
    DRUMS.forEach(function (d, i) { var v = pt.drums[i][step]; if (v && audible(i)) drum(ctx, gr.drums[i], d[0], t, v === 2 ? 1 : .7, P.kit); });
    var sd = stepDur();
    pt.bass.forEach(function (n) { if (n.s === step) synth(ctx, gr.bass, P.synths.bass, "bass", n.n, t, n.l * sd * .95, .9); });
    pt.lead.forEach(function (n) { if (n.s === step) synth(ctx, gr.lead, P.synths.lead, "lead", n.n, t, n.l * sd * .95, .9); });
  }
  function swingAt(step) { return step % 2 ? P.swing / 100 * stepDur() * .5 : 0; }

  // ---------- live playback (lookahead scheduler) ----------
  var ctx = null, gr = null, playing = false, timer = 0, nextT = 0, pos = { slot: 0, step: 0 }, queue = [], raf = 0;
  function ensureAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { S3.toast("This browser can't play audio", "error"); return false; }
    if (!ctx) { ctx = new AC(); gr = graph(ctx); }
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }
  function liveGains() { if (!gr) return; gr.master.gain.value = P.vol; DRUMS.forEach(function (_, i) { gr.drums[i].gain.value = P.tracks[i].vol; }); gr.bass.gain.value = P.synths.bass.vol; gr.lead.gain.value = P.synths.lead.vol; }
  function play() {
    if (playing) return stop();
    if (!ensureAudio()) return;
    playing = true; pos = { slot: 0, step: 0 }; nextT = ctx.currentTime + .06; queue = [];
    timer = setInterval(sched, 25); sched(); draw();
    syncTransport();
  }
  function stop() { playing = false; clearInterval(timer); cancelAnimationFrame(raf); queue = []; S3.$$(".is-play").forEach(function (e) { e.classList.remove("is-play"); }); syncTransport(); }
  function sched() {
    while (nextT < ctx.currentTime + .12) {
      var pi = P.mode === "song" ? P.song[pos.slot % P.song.length] : P.cur;
      playStep(ctx, gr, P.patterns[pi], pos.step, nextT + swingAt(pos.step));
      queue.push({ t: nextT + swingAt(pos.step), step: pos.step, slot: pos.slot, pat: pi });
      nextT += stepDur();
      pos.step++;
      if (pos.step >= STEPS) { pos.step = 0; if (P.mode === "song") pos.slot = (pos.slot + 1) % P.song.length; }
    }
  }
  var shown = { step: -1, slot: -1 };
  function draw() {
    var now = ctx.currentTime, cur = null;
    while (queue.length && queue[0].t <= now) cur = queue.shift();
    if (cur && (cur.step !== shown.step || cur.slot !== shown.slot)) {
      shown = cur;
      S3.$$(".is-play").forEach(function (e) { e.classList.remove("is-play"); });
      if (cur.pat === P.cur) S3.$$('[data-col="' + cur.step + '"]').forEach(function (e) { e.classList.add("is-play"); });
      if (P.mode === "song") { var sl = $('[data-slot="' + cur.slot + '"]'); if (sl) sl.classList.add("is-play"); var pb = $('[data-pat="' + cur.pat + '"]'); if (pb) pb.classList.add("is-play"); }
    }
    if (playing) raf = requestAnimationFrame(draw);
  }
  function preview(fn) { if (!ensureAudio()) return; fn(ctx, gr, ctx.currentTime + .01); }

  // ---------- WAV export ----------
  function render(what, loops) {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return Promise.reject(new Error("no offline"));
    var list = what === "song" ? P.song.slice() : Array.from({ length: loops }, function () { return P.cur; });
    var sd = stepDur(), len = list.length * STEPS * sd + 2, sr = 44100;
    var oc = new OAC(2, Math.ceil(len * sr), sr), g2 = graph(oc), t = .02;
    list.forEach(function (pi) { for (var s = 0; s < STEPS; s++) { playStep(oc, g2, P.patterns[pi], s, t + swingAt(s)); t += sd; } });
    return oc.startRendering();
  }
  function wav(buf) {
    var ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, dv = new DataView(new ArrayBuffer(44 + n * ch * 2));
    function str(o, s) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); }
    str(0, "RIFF"); dv.setUint32(4, 36 + n * ch * 2, true); str(8, "WAVE"); str(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); str(36, "data"); dv.setUint32(40, n * ch * 2, true);
    var data = []; for (var c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    var o = 44; for (var i = 0; i < n; i++) for (c = 0; c < ch; c++) { var v = Math.max(-1, Math.min(1, data[c][i])); dv.setInt16(o, v < 0 ? v * 32768 : v * 32767, true); o += 2; }
    return new Blob([dv.buffer], { type: "audio/wav" });
  }
  function fileBase() { return (P.name || "").replace(/[^A-Za-z0-9 _.-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 50).replace(/ /g, "-") || "beat"; }
  function exportDialog() {
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Export WAV" });
    var what = h("select", { "class": "select" }, [h("option", { value: "pattern", text: "Pattern " + LETTERS[P.cur] }), h("option", { value: "song", text: "Whole song (" + P.song.length + " patterns)" })]);
    what.value = P.mode;
    var loops = h("select", { "class": "select" }, [1, 2, 4, 8, 16].map(function (n2) { return h("option", { value: String(n2), text: n2 + (n2 === 1 ? " time" : " times") }); })); loops.value = "4";
    var go = btn("Save WAV", function () {
      go.disabled = true; go.lastChild.textContent = "Rendering…";
      render(what.value, +loops.value).then(function (buf) { S3.download(wav(buf), fileBase() + ".wav"); S3.done(); close(); },
        function () { S3.toast("Couldn't render the audio", "error"); go.disabled = false; go.lastChild.textContent = "Save WAV"; });
    }, "primary", "download");
    var sheet = h("div", { "class": "s3-sheet" }, [
      h("div", { "class": "row between" }, [h("h2", { text: "Export WAV" }), btn("", close, "ghost icon", "x", "Close")]),
      h("p", { text: "Renders faster than real time in your browser. 44.1 kHz, 16-bit stereo." }),
      h("div", { "class": "bm-fields" }, [h("label", { "class": "field" }, ["What", what]), h("label", { "class": "field" }, ["Repeat the pattern", loops])]),
      h("div", { "class": "row end" }, [btn("Cancel", close, "ghost"), go])
    ]);
    what.addEventListener("change", function () { loops.parentNode.hidden = what.value === "song"; }); loops.parentNode.hidden = what.value === "song";
    m.appendChild(sheet);
    function close() { m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m); go.focus();
  }

  // ---------- undo ----------
  var past = [], future = [], lastPush = 0;
  function change(fn, opts) {
    var now = Date.now();
    if (!(opts && opts.group) || now - lastPush > 800) { past.push(JSON.stringify(P)); if (past.length > 120) past.shift(); future = []; }
    lastPush = now; fn(); save();
    if (!(opts && opts.quiet)) renderAll();
  }
  function undo() { if (!past.length) return; future.push(JSON.stringify(P)); P = clean(JSON.parse(past.pop())); lastPush = 0; liveGains(); save(); renderAll(); }
  function redo() { if (!future.length) return; past.push(JSON.stringify(P)); P = clean(JSON.parse(future.pop())); lastPush = 0; liveGains(); save(); renderAll(); }

  // ---------- UI helpers ----------
  function icon(nm) { var s = h("span", { "class": "bm-ic", "aria-hidden": "true" }); s.innerHTML = S3.icon(nm); return s; }
  function btn(label, onclick, cls, ic, title) {
    return h("button", { type: "button", "class": "btn " + (cls || ""), onclick: onclick, title: title || null, "aria-label": title || null }, ic ? [icon(ic)].concat(label ? [label] : []) : [label]);
  }
  function slider(label, value, min, max, step, oninput, fmt) {
    var out = h("output", { "class": "bm-val" }), r = h("input", { type: "range", min: String(min), max: String(max), step: String(step), value: String(value), "aria-label": label });
    function show() { out.textContent = fmt ? fmt(+r.value) : r.value; }
    r.addEventListener("input", function () { show(); oninput(+r.value); }); show();
    return h("label", { "class": "field bm-slider" }, [h("span", { "class": "row between" }, [label, out]), r]);
  }

  // ---------- transport ----------
  var playBtn;
  function renderTransport() {
    var t = $("#bm-transport"); t.textContent = "";
    playBtn = btn("Play", play, "primary bm-play", "play", "Play / stop (Space)");
    var bpm = h("input", { "class": "input bm-bpm", type: "number", min: "50", max: "220", value: String(P.bpm), "aria-label": "Tempo in BPM" });
    bpm.addEventListener("change", function () { var v = Math.round(num(bpm.value, 50, 220, P.bpm)); bpm.value = v; change(function () { P.bpm = v; }, { quiet: true }); });
    var mode = h("div", { "class": "seg", role: "group", "aria-label": "Play mode" }, [["pattern", "Pattern"], ["song", "Song"]].map(function (m2) {
      return h("button", { type: "button", "aria-pressed": String(P.mode === m2[0]), onclick: function () { change(function () { P.mode = m2[0]; }); } }, [m2[1]]);
    }));
    var kit = h("select", { "class": "select bm-kit", "aria-label": "Drum kit" }, [["punchy", "Punchy kit"], ["lofi", "Lo-fi kit"], ["boom", "Boom kit"]].map(function (k) { return h("option", { value: k[0], text: k[1] }); }));
    kit.value = P.kit; kit.addEventListener("change", function () { change(function () { P.kit = kit.value; }, { quiet: true }); });
    t.appendChild(h("div", { "class": "bm-tgrid" }, [
      playBtn,
      h("label", { "class": "field bm-bpmf" }, ["BPM", bpm]),
      slider("Swing", P.swing, 0, 60, 1, function (v) { change(function () { P.swing = v; }, { group: true, quiet: true }); }, function (v) { return v + "%"; }),
      slider("Volume", P.vol, 0, 1, .01, function (v) { change(function () { P.vol = v; }, { group: true, quiet: true }); liveGains(); }, function (v) { return Math.round(v * 100) + "%"; }),
      h("div", { "class": "field" }, ["Play", mode]),
      h("label", { "class": "field" }, ["Sound", kit])
    ]));
    var pats = h("div", { "class": "bm-pats", role: "group", "aria-label": "Patterns" });
    P.patterns.forEach(function (pt, i) {
      var used = pt.drums.some(function (r) { return r.some(Boolean); }) || pt.bass.length || pt.lead.length;
      pats.appendChild(h("button", { type: "button", "class": "bm-pat" + (used ? " is-used" : ""), "data-pat": String(i), "aria-pressed": String(i === P.cur), title: "Pattern " + LETTERS[i],
        onclick: function () { P.cur = i; save(); renderAll(); } }, [LETTERS[i]]));
    });
    t.appendChild(h("div", { "class": "row bm-patrow" }, [h("b", { text: "Pattern" }), pats,
      btn("Copy to next empty", copyPattern, "ghost small", "copy", "Copy this pattern into the next empty one"),
      btn("Clear", function () { change(function () { P.patterns[P.cur] = emptyPattern(); }); }, "ghost small", "trash", "Clear this pattern")]));
    syncTransport();
  }
  function syncTransport() {
    if (!playBtn) return;
    playBtn.innerHTML = S3.icon(playing ? "pause" : "play") + (playing ? "Stop" : "Play");
    playBtn.setAttribute("aria-pressed", String(playing));
  }
  function copyPattern() {
    var to = -1; for (var i = 1; i < NPAT; i++) { var k = (P.cur + i) % NPAT, pt = P.patterns[k]; if (!pt.drums.some(function (r) { return r.some(Boolean); }) && !pt.bass.length && !pt.lead.length) { to = k; break; } }
    if (to < 0) return S3.toast("All patterns are in use. Clear one first.", "error");
    change(function () { P.patterns[to] = JSON.parse(JSON.stringify(pat())); P.cur = to; });
    S3.toast("Copied to pattern " + LETTERS[to]);
  }

  // ---------- drum grid ----------
  var paint = null;
  function renderDrums() {
    var box = $("#bm-drums"); box.textContent = "";
    box.appendChild(h("div", { "class": "row between bm-sechead" }, [h("h2", { text: "Drums · pattern " + LETTERS[P.cur] }), h("span", { "class": "faint", text: "Click or drag to add hits. Shift-click (or long-press) for a louder accent." })]));
    var grid = h("div", { "class": "bm-dgrid", role: "grid", "aria-label": "Drum steps" });
    DRUMS.forEach(function (d, r) {
      var tr = P.tracks[r];
      var mute = h("button", { type: "button", "class": "bm-ms", "aria-pressed": String(tr.mute), title: "Mute " + d[1], onclick: function () { change(function () { tr.mute = !tr.mute; }); } }, ["M"]);
      var solo = h("button", { type: "button", "class": "bm-ms", "aria-pressed": String(tr.solo), title: "Solo " + d[1], onclick: function () { change(function () { tr.solo = !tr.solo; }); } }, ["S"]);
      var vol = h("input", { type: "range", min: "0", max: "1", step: ".01", value: String(tr.vol), "aria-label": d[1] + " volume", "class": "bm-tvol" });
      vol.addEventListener("input", function () { change(function () { tr.vol = +vol.value; }, { group: true, quiet: true }); liveGains(); });
      var name = h("button", { type: "button", "class": "bm-dname", title: "Hear " + d[1], onclick: function () { preview(function (c, g, t) { drum(c, g.drums[r], d[0], t, .9, P.kit); }); } }, [d[1]]);
      var row = h("div", { "class": "bm-drow", role: "row" }, [h("div", { "class": "bm-dhead" }, [name, mute, solo, vol])]);
      var steps = h("div", { "class": "bm-steps" });
      for (var s = 0; s < STEPS; s++) (function (s) {
        var v = pat().drums[r][s];
        var b = h("button", { type: "button", "class": "bm-step" + (s % 4 === 0 ? " is-beat" : ""), "data-col": String(s), "data-v": String(v), role: "gridcell",
          "aria-label": d[1] + " step " + (s + 1) + (v ? v === 2 ? ", accent" : ", on" : ", off"), "aria-pressed": String(!!v) });
        b.addEventListener("pointerdown", function (e) {
          e.preventDefault();
          var cur = pat().drums[r][s], nv = e.shiftKey ? (cur === 2 ? 1 : 2) : (cur ? 0 : 1);
          paint = { v: nv, r: r, before: JSON.stringify(P) };
          set(b, r, s, nv);
          if (nv) preview(function (c, g, t) { drum(c, g.drums[r], d[0], t, nv === 2 ? 1 : .7, P.kit); });
          // long press = accent (touch screens have no shift key)
          paint.lp = setTimeout(function () { if (paint && pat().drums[r][s]) { paint.v = 2; set(b, r, s, 2); } }, 450);
        });
        b.addEventListener("pointerenter", function () { if (paint && paint.r === r) { clearTimeout(paint.lp); set(b, r, s, paint.v); } });
        b.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); var cur = pat().drums[r][s]; change(function () { pat().drums[r][s] = e.shiftKey ? (cur === 2 ? 1 : 2) : (cur ? 0 : 1); }); var nb = $('.bm-drow:nth-child(' + (r + 1) + ') [data-col="' + s + '"]'); if (nb) nb.focus(); } });
        steps.appendChild(b);
      })(s);
      row.appendChild(steps);
      grid.appendChild(row);
    });
    box.appendChild(grid);
  }
  function set(b, r, s, v) {
    pat().drums[r][s] = v; b.setAttribute("data-v", String(v)); b.setAttribute("aria-pressed", String(!!v));
  }
  document.addEventListener("pointerup", function () {
    if (!paint) return; clearTimeout(paint.lp);
    var before = paint.before; paint = null;
    if (before !== JSON.stringify(P)) { past.push(before); future = []; save(); renderTransport(); }
  });

  // ---------- synths + piano roll ----------
  var synthTab = "bass", rollDrag = null;
  function renderSynths() {
    var box = $("#bm-synths"); box.textContent = "";
    var s = P.synths[synthTab];
    var tabs = h("div", { "class": "seg", role: "group", "aria-label": "Synth" }, [["bass", "Bass"], ["lead", "Lead"]].map(function (x) {
      return h("button", { type: "button", "aria-pressed": String(synthTab === x[0]), onclick: function () { synthTab = x[0]; renderSynths(); } }, [x[1]]);
    }));
    box.appendChild(h("div", { "class": "row between bm-sechead" }, [h("div", { "class": "row" }, [h("h2", { text: "Synths · pattern " + LETTERS[P.cur] }), tabs]),
      h("span", { "class": "faint", text: "Click a cell to add a note, drag right to make it longer, click a note to remove it." })]));
    var wave = h("select", { "class": "select" }, [["sawtooth", "Saw"], ["square", "Square"], ["triangle", "Triangle"], ["sine", "Sine"]].map(function (w) { return h("option", { value: w[0], text: w[1] }); }));
    wave.value = s.wave; wave.addEventListener("change", function () { change(function () { s.wave = wave.value; }, { quiet: true }); });
    box.appendChild(h("div", { "class": "bm-sgrid" }, [
      h("label", { "class": "field" }, ["Wave", wave]),
      slider("Brightness", Math.round(Math.log(s.cutoff / 80) / Math.log(150) * 100), 0, 100, 1, function (v) { change(function () { s.cutoff = Math.round(80 * Math.pow(150, v / 100)); }, { group: true, quiet: true }); }, function (v) { return v + "%"; }),
      slider("Release", s.release, .02, 1.5, .01, function (v) { change(function () { s.release = v; }, { group: true, quiet: true }); }, function (v) { return v.toFixed(2) + " s"; }),
      slider("Volume", s.vol, 0, 1, .01, function (v) { change(function () { s.vol = v; }, { group: true, quiet: true }); liveGains(); }, function (v) { return Math.round(v * 100) + "%"; }),
      h("div", { "class": "field" }, ["Octave", h("div", { "class": "row" }, [btn("−", function () { change(function () { s.oct = Math.max(0, s.oct - 1); }); }, "small", "", "Octave down"), h("b", { text: "C" + s.oct + "–B" + (s.oct + 1) }),
        btn("+", function () { change(function () { s.oct = Math.min(6, s.oct + 1); }); }, "small", "", "Octave up")])])
    ]));
    box.appendChild(roll());
  }
  function roll() {
    var s = P.synths[synthTab], notes = pat()[synthTab], low = 12 * (s.oct + 1), rows = 24;
    var wrap = h("div", { "class": "bm-roll" });
    var keys = h("div", { "class": "bm-keys" }), grid = h("div", { "class": "bm-rgrid", style: "--rows:" + rows });
    for (var i = rows - 1; i >= 0; i--) {
      var m = low + i, black = [1, 3, 6, 8, 10].indexOf(m % 12) >= 0;
      (function (m) {
        keys.appendChild(h("button", { type: "button", "class": "bm-key" + (black ? " is-black" : ""), "aria-label": "Play " + NOTE[m % 12] + (Math.floor(m / 12) - 1),
          onclick: function () { preview(function (c, g, t) { synth(c, g[synthTab], s, synthTab, m, t, .25, .9); }); } }, [m % 12 === 0 ? "C" + (Math.floor(m / 12) - 1) : ""]));
      })(m);
      var line = h("div", { "class": "bm-rrow" + (black ? " is-black" : ""), "data-m": String(m) });
      for (var c = 0; c < STEPS; c++) line.appendChild(h("div", { "class": "bm-cell" + (c % 4 === 0 ? " is-beat" : ""), "data-col": String(c) }));
      grid.appendChild(line);
    }
    notes.forEach(function (n) {
      if (n.n < low || n.n >= low + rows) return;
      grid.appendChild(h("div", { "class": "bm-note", style: "left:calc(" + n.s + " * var(--cw));width:calc(" + n.l + " * var(--cw) - 2px);top:calc(" + (low + rows - 1 - n.n) + " * var(--rh))" }));
    });
    var hidden = notes.filter(function (n) { return n.n < low || n.n >= low + rows; }).length;
    grid.addEventListener("pointerdown", function (e) {
      var r = grid.getBoundingClientRect(), col = Math.floor((e.clientX - r.left) / (r.width / STEPS)), row = Math.floor((e.clientY - r.top) / (r.height / rows));
      if (col < 0 || col >= STEPS || row < 0 || row >= rows) return;
      var m2 = low + rows - 1 - row, list = pat()[synthTab];
      var hit = list.filter(function (n) { return n.n === m2 && col >= n.s && col < n.s + n.l; })[0];
      if (hit) { change(function () { pat()[synthTab] = list.filter(function (n) { return n !== hit; }); }); return; }
      var before = JSON.stringify(P), nn = { s: col, n: m2, l: 1 };
      list.push(nn); save(); renderSynths();
      preview(function (c, g, t) { synth(c, g[synthTab], s, synthTab, m2, t, .2, .9); });
      rollDrag = { n: nn, before: before, grid: $(".bm-rgrid") };
      e.preventDefault();
    });
    wrap.appendChild(keys); wrap.appendChild(grid);
    var outer = h("div", {}, [wrap]);
    if (hidden) outer.appendChild(h("p", { "class": "faint", text: hidden + " note(s) are outside this octave range. Use the Octave buttons to see them." }));
    return outer;
  }
  document.addEventListener("pointermove", function (e) {
    if (!rollDrag) return;
    var g = $(".bm-rgrid"); if (!g) return;
    var r = g.getBoundingClientRect(), col = Math.floor((e.clientX - r.left) / (r.width / STEPS));
    var l = Math.max(1, Math.min(STEPS - rollDrag.n.s, col - rollDrag.n.s + 1));
    if (l !== rollDrag.n.l) { rollDrag.n.l = l; var el = g.querySelectorAll(".bm-note"); var last = el[el.length - 1]; if (last) last.style.width = "calc(" + l + " * var(--cw) - 2px)"; }
  });
  document.addEventListener("pointerup", function () {
    if (!rollDrag) return;
    past.push(rollDrag.before); future = []; rollDrag = null; save(); renderSynths(); renderTransport();
  });

  // ---------- song ----------
  function renderSong() {
    var box = $("#bm-song"); box.textContent = "";
    box.appendChild(h("div", { "class": "row between bm-sechead" }, [h("h2", { text: "Song" }), h("span", { "class": "faint", text: "Chain patterns in order. Switch Play to Song to hear it." })]));
    var list = h("div", { "class": "bm-slots" });
    P.song.forEach(function (pi, i) {
      var sel = h("select", { "class": "select bm-slot", "data-slot": String(i), "aria-label": "Song part " + (i + 1) }, LETTERS.split("").map(function (L, k) { return h("option", { value: String(k), text: L }); }));
      sel.value = String(pi);
      sel.addEventListener("change", function () { change(function () { P.song[i] = +sel.value; }); });
      list.appendChild(h("div", { "class": "bm-slotbox" }, [h("span", { "class": "faint", text: String(i + 1) }), sel,
        btn("", function () { if (P.song.length > 1) change(function () { P.song.splice(i, 1); }); }, "ghost icon small", "x", "Remove part " + (i + 1))]));
    });
    list.appendChild(btn("Add", function () { change(function () { P.song.push(P.cur); }); }, "small", "plus", "Add the current pattern to the song"));
    box.appendChild(list);
    var bars = P.song.length, secs = bars * STEPS * stepDur();
    box.appendChild(h("p", { "class": "faint", text: bars + (bars === 1 ? " part" : " parts") + " · " + Math.floor(secs / 60) + ":" + String(Math.round(secs % 60)).padStart(2, "0") + " at " + P.bpm + " BPM" }));
  }

  // ---------- page ----------
  function renderAll() { renderTransport(); renderDrums(); renderSynths(); renderSong(); }
  function actions() {
    var a = $("#bm-actions");
    a.appendChild(btn("", undo, "ghost icon", "", "Undo (Ctrl+Z)")); a.lastChild.textContent = "↶";
    a.appendChild(btn("", redo, "ghost icon", "", "Redo (Ctrl+Shift+Z)")); a.lastChild.textContent = "↷";
    a.appendChild(btn("Export WAV", exportDialog, "primary", "download"));
  }
  $("#bm-name").value = P.name;
  $("#bm-name").addEventListener("input", function (e) { P.name = e.target.value.slice(0, 80); save(); });
  document.addEventListener("keydown", function (e) {
    if ($(".s3-modal")) return;
    var tag = e.target && e.target.tagName, typing = tag === "INPUT" && e.target.type !== "range" && e.target.type !== "checkbox" || tag === "TEXTAREA" || tag === "SELECT";
    if ((e.ctrlKey || e.metaKey) && !typing && !e.altKey) {
      if (e.key === "z" || e.key === "Z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (e.key === "y" || e.key === "Y") { e.preventDefault(); redo(); }
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === " " && !(tag === "BUTTON" && e.target.classList.contains("bm-step"))) { e.preventDefault(); play(); }
    else if (/^[1-8]$/.test(e.key)) { P.cur = +e.key - 1; save(); renderAll(); }
  });
  document.addEventListener("visibilitychange", function () { /* keep playing in background tabs; timers may slow down there */ });
  actions();
  renderAll();
  window.BM = { state: function () { return P; }, clean: clean, render: render, wav: wav, play: play, stop: stop, isPlaying: function () { return playing; } };
})();
