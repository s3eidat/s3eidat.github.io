import * as pdfjsLib from "./lib/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf-editor/lib/pdf.worker.min.mjs";

const S3 = window.S3, PL = window.PDFLib;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- state
let srcs = [];            // {name, bytes, js}
let pages = [];           // {src, sp, rot0, rot, w, h, blank, objs[]}
let cur = 0, zoom = 1, fitMode = true, tool = "select", sel = null, dirty = false;
let docName = "document";
const imgs = new Map();   // id -> {bmp, bytes, mime, w, h}
let undoStack = [], redoStack = [];
let idSeq = 1;

const TOOL_COLORS = { text: "#111111", pen: "#d92d20", highlight: "#ffe14d", rect: "#d92d20", ellipse: "#d92d20", line: "#d92d20", arrow: "#d92d20" };
const cfg = { width: 3, font: "Helvetica", size: 16, bold: false, italic: false };
const DRAW_TOOLS = ["pen", "highlight", "rect", "ellipse", "line", "arrow", "whiteout"];

const pc = $("pc"), oc = $("oc"), pagebox = $("pagebox"), stage = $("stage"), ta = $("ta");
const octx = oc.getContext("2d");

// ---------------------------------------------------------------- fonts / text metrics
const FONT_NAMES = {
  Helvetica: ["Helvetica", "HelveticaBold", "HelveticaOblique", "HelveticaBoldOblique"],
  Times: ["TimesRoman", "TimesRomanBold", "TimesRomanItalic", "TimesRomanBoldItalic"],
  Courier: ["Courier", "CourierBold", "CourierOblique", "CourierBoldOblique"],
};
const CSS_FAMILY = {
  Helvetica: 'Helvetica, Arial, "Liberation Sans", sans-serif',
  Times: '"Times New Roman", Times, "Liberation Serif", serif',
  Courier: '"Courier New", Courier, "Liberation Mono", monospace',
};
const measureFonts = {};
async function loadMeasureFonts() {
  const d = await PL.PDFDocument.create();
  for (const fam in FONT_NAMES) for (let i = 0; i < 4; i++) measureFonts[fam + i] = await d.embedFont(PL.StandardFonts[FONT_NAMES[fam][i]]);
}
const fidx = (o) => (o.bold && o.italic ? 3 : o.bold ? 1 : o.italic ? 2 : 0);
const cssFont = (o, size) => `${o.italic ? "italic " : ""}${o.bold ? "bold " : ""}${size || o.size}px ${CSS_FAMILY[o.font]}`;
const mctx = document.createElement("canvas").getContext("2d");
function encodable(font, s) { try { font.encodeText(s); return true; } catch (e) { return false; } }
function textWidth(o, s) {
  const f = measureFonts[o.font + fidx(o)];
  if (f && encodable(f, s)) return f.widthOfTextAtSize(s, o.size);
  mctx.font = cssFont(o);
  return mctx.measureText(s).width;
}
const RTL = /[֐-ࣿ]/;
function wrapLines(o, uw) {
  const out = [];
  for (const para of String(o.text).split("\n")) {
    const words = para.split(" ");
    let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (textWidth(o, t) <= uw || !line) {
        if (textWidth(o, t) > uw && !line) { // break a long word
          let piece = "";
          for (const ch of t) { if (textWidth(o, piece + ch) > uw && piece) { out.push(piece); piece = ch; } else piece += ch; }
          line = piece;
        } else line = t;
      } else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}
const LH = 1.2, BASE = 0.92;
const updims = (o) => (o.q % 2 ? { uw: o.h, uh: o.w } : { uw: o.w, uh: o.h });
function fitText(o) {
  const { uw } = updims(o);
  const lines = wrapLines(o, uw);
  const uh = Math.max(1, lines.length) * o.size * LH;
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  if (o.q % 2) { o.w = uh; o.h = uw; } else { o.w = uw; o.h = uh; }
  o.x = cx - o.w / 2; o.y = cy - o.h / 2;
  return lines;
}

// ---------------------------------------------------------------- geometry helpers
const vd = (p) => (p.rot % 180 ? { W: p.h, H: p.w } : { W: p.w, H: p.h });
const isRect = (o) => ["rect", "ellipse", "whiteout", "highlight", "image", "text"].includes(o.t);
const isLine = (o) => o.t === "line" || o.t === "arrow";
function bbox(o) {
  if (isRect(o)) return { x: o.x, y: o.y, w: o.w, h: o.h };
  const pts = isLine(o) ? [[o.x1, o.y1], [o.x2, o.y2]] : o.pts;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function translate(o, dx, dy) {
  if (isRect(o)) { o.x += dx; o.y += dy; }
  else if (isLine(o)) { o.x1 += dx; o.x2 += dx; o.y1 += dy; o.y2 += dy; }
  else o.pts = o.pts.map(([x, y]) => [x + dx, y + dy]);
}
function rotObjCW(o, H) {
  if (isRect(o)) {
    const nx = H - (o.y + o.h), ny = o.x, nw = o.h, nh = o.w;
    o.x = nx; o.y = ny; o.w = nw; o.h = nh;
    if (o.t === "text" || o.t === "image") o.q = ((o.q || 0) + 1) % 4;
  } else if (isLine(o)) {
    const a = [H - o.y1, o.x1], b = [H - o.y2, o.x2];
    o.x1 = a[0]; o.y1 = a[1]; o.x2 = b[0]; o.y2 = b[1];
  } else o.pts = o.pts.map(([x, y]) => [H - y, x]);
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function hit(o, x, y) {
  const tol = 6 / zoom;
  if (isLine(o)) return distSeg(x, y, o.x1, o.y1, o.x2, o.y2) <= tol + o.width / 2;
  if (o.t === "pen") {
    for (let i = 1; i < o.pts.length; i++) if (distSeg(x, y, o.pts[i - 1][0], o.pts[i - 1][1], o.pts[i][0], o.pts[i][1]) <= tol + o.width / 2) return true;
    return o.pts.length === 1 && Math.hypot(x - o.pts[0][0], y - o.pts[0][1]) <= tol;
  }
  if ((o.t === "rect" || o.t === "ellipse") && Math.min(o.w, o.h) > 24 / zoom) {
    const b = Math.max(tol, o.width / 2 + tol);
    const inner = x > o.x + b && x < o.x + o.w - b && y > o.y + b && y < o.y + o.h - b;
    return x >= o.x - b && x <= o.x + o.w + b && y >= o.y - b && y <= o.y + o.h + b && !inner;
  }
  return x >= o.x - tol && x <= o.x + o.w + tol && y >= o.y - tol && y <= o.y + o.h + tol;
}
function handlesOf(o) {
  if (isLine(o)) return [{ id: "a", x: o.x1, y: o.y1 }, { id: "b", x: o.x2, y: o.y2 }];
  if (o.t === "text") return o.q % 2 ? [] : [{ id: "tw", x: o.x + o.w, y: o.y + o.h / 2 }];
  if (isRect(o)) return [{ id: "tl", x: o.x, y: o.y }, { id: "tr", x: o.x + o.w, y: o.y }, { id: "br", x: o.x + o.w, y: o.y + o.h }, { id: "bl", x: o.x, y: o.y + o.h }];
  return [];
}

// ---------------------------------------------------------------- undo / redo
const snapshot = () => JSON.stringify({ pages, cur });
function pushUndo(s) { undoStack.push(s || snapshot()); if (undoStack.length > 80) undoStack.shift(); redoStack = []; dirty = true; syncUI(); }
function restore(s) {
  const d = JSON.parse(s);
  pages = d.pages; cur = Math.min(d.cur, pages.length - 1); sel = null; endEdit(false);
  buildThumbs(); renderPage(); syncUI();
}
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); }

// ---------------------------------------------------------------- loading
async function makeSrc(bytes, name) {
  const js = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
  const metas = [];
  for (let i = 1; i <= js.numPages; i++) {
    const page = await js.getPage(i);
    const rot0 = ((page.rotate % 360) + 360) % 360;
    const vp = page.getViewport({ scale: 1, rotation: rot0 });
    metas.push({ sp: i - 1, rot0, rot: 0, w: vp.width, h: vp.height, blank: false, objs: [] });
  }
  return { src: { name, bytes, js }, metas };
}
async function readPdfFile(file) {
  const bytes = new Uint8Array(await S3.readFile(file));
  try { return await makeSrc(bytes, file.name); }
  catch (e) {
    const pw = e && (e.name === "PasswordException" || /password/i.test(e.message || ""));
    S3.toast(pw ? "This PDF is password-protected. Remove the password first." : "Couldn't read that file as a PDF.", "error");
    return null;
  }
}
async function openFile(file) {
  if (dirty && !confirm("Replace the current document? Unsaved edits will be lost.")) return;
  const r = await readPdfFile(file);
  if (!r) return;
  srcs = [r.src]; imgs.clear();
  pages = r.metas.map((m) => ({ ...m, src: 0 }));
  docName = file.name.replace(/\.pdf$/i, "") || "document";
  afterLoad();
}
function newBlank() {
  srcs = []; imgs.clear(); docName = "document";
  pages = [{ src: -1, sp: 0, rot0: 0, rot: 0, w: 595.28, h: 841.89, blank: true, objs: [] }];
  afterLoad();
}
function afterLoad() {
  undoStack = []; redoStack = []; dirty = false; cur = 0; sel = null; fitMode = true;
  $("empty").hidden = true; $("cwrap").hidden = false; $("status").hidden = false; $("side").hidden = false;
  buildThumbs(); renderPage(); syncUI();
}
async function mergeFile(file) {
  const r = await readPdfFile(file);
  if (!r) return;
  pushUndo();
  srcs.push(r.src);
  const si = srcs.length - 1;
  r.metas.forEach((m) => pages.push({ ...m, src: si }));
  S3.toast(`Added ${r.metas.length} page${r.metas.length === 1 ? "" : "s"}`);
  buildThumbs(); syncUI();
}

// ---------------------------------------------------------------- drawing (screen)
function dprFor(w, h) {
  let d = Math.min(window.devicePixelRatio || 1, 2.5);
  while (d > 1 && w * d * h * d > 16e6) d -= 0.25;
  return Math.max(d, 1);
}
function drawObj(ctx, o, editing) {
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  switch (o.t) {
    case "rect": ctx.strokeStyle = o.color; ctx.lineWidth = o.width; ctx.strokeRect(o.x, o.y, o.w, o.h); break;
    case "ellipse":
      ctx.strokeStyle = o.color; ctx.lineWidth = o.width; ctx.beginPath();
      ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.max(o.w / 2, 0.01), Math.max(o.h / 2, 0.01), 0, 0, Math.PI * 2); ctx.stroke(); break;
    case "whiteout": ctx.fillStyle = "#fff"; ctx.fillRect(o.x, o.y, o.w, o.h); break;
    case "highlight": ctx.globalAlpha = 0.4; ctx.fillStyle = o.color; ctx.fillRect(o.x, o.y, o.w, o.h); break;
    case "line": case "arrow": {
      ctx.strokeStyle = o.color; ctx.lineWidth = o.width; ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2);
      if (o.t === "arrow") for (const [x, y] of arrowHead(o)) { ctx.moveTo(o.x2, o.y2); ctx.lineTo(x, y); }
      ctx.stroke(); break;
    }
    case "pen":
      ctx.strokeStyle = o.color; ctx.lineWidth = o.width; ctx.beginPath(); ctx.moveTo(o.pts[0][0], o.pts[0][1]);
      if (o.pts.length === 1) ctx.lineTo(o.pts[0][0] + 0.01, o.pts[0][1]);
      for (let i = 1; i < o.pts.length; i++) ctx.lineTo(o.pts[i][0], o.pts[i][1]);
      ctx.stroke(); break;
    case "image": case "text": {
      const { uw, uh } = updims(o);
      ctx.translate(o.x + o.w / 2, o.y + o.h / 2); ctx.rotate((o.q || 0) * Math.PI / 2); ctx.translate(-uw / 2, -uh / 2);
      if (o.t === "image") { const im = imgs.get(o.img); if (im) ctx.drawImage(im.bmp, 0, 0, uw, uh); }
      else if (!editing) drawTextLines(ctx, o, uw);
    }
  }
  ctx.restore();
}
function drawTextLines(ctx, o, uw) {
  const lines = wrapLines(o, uw);
  ctx.font = cssFont(o); ctx.fillStyle = o.color; ctx.textBaseline = "alphabetic";
  lines.forEach((ln, i) => {
    const rtl = RTL.test(ln);
    ctx.direction = rtl ? "rtl" : "ltr"; ctx.textAlign = rtl ? "right" : "left";
    ctx.fillText(ln, rtl ? uw : 0, i * o.size * LH + o.size * BASE);
  });
}
function arrowHead(o) {
  const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), L = Math.max(9, o.width * 4.5), s = 0.5;
  return [[o.x2 - L * Math.cos(a - s), o.y2 - L * Math.sin(a - s)], [o.x2 - L * Math.cos(a + s), o.y2 - L * Math.sin(a + s)]];
}
let drag = null;
function drawOverlay() {
  const p = pages[cur]; if (!p) return;
  const { W, H } = vd(p), d = dprFor(W * zoom, H * zoom);
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, oc.width, oc.height);
  octx.setTransform(d * zoom, 0, 0, d * zoom, 0, 0);
  for (const o of p.objs) drawObj(octx, o, o === editing);
  if (drag && drag.obj && !p.objs.includes(drag.obj)) drawObj(octx, drag.obj);
  const so = editing || sel;
  if (so && p.objs.includes(so)) {
    const b = bbox(so), pad = 3 / zoom;
    octx.save();
    octx.strokeStyle = "#2f7df6"; octx.lineWidth = 1.2 / zoom; octx.setLineDash([5 / zoom, 3 / zoom]);
    if (!isLine(so)) octx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
    octx.setLineDash([]); octx.fillStyle = "#fff";
    for (const h of handlesOf(so)) { octx.beginPath(); octx.arc(h.x, h.y, 5 / zoom, 0, 7); octx.fill(); octx.stroke(); }
    octx.restore();
  }
}

// ---------------------------------------------------------------- page rendering
let renderTok = 0, renderTask = null;
function fitZoom() {
  const p = pages[cur]; if (!p) return 1;
  const { W, H } = vd(p), byW = (stage.clientWidth - 34) / W;
  const z = window.innerWidth > 760 ? Math.min(byW, (stage.clientHeight - 60) / H) : byW;
  return Math.max(0.2, Math.min(3, z));
}
async function renderPage() {
  const p = pages[cur]; if (!p) return;
  const tok = ++renderTok;
  if (renderTask) { try { renderTask.cancel(); } catch (e) { /* already done */ } }
  if (fitMode) zoom = fitZoom();
  const { W, H } = vd(p), cw = W * zoom, ch = H * zoom, d = dprFor(cw, ch);
  pagebox.style.width = cw + "px"; pagebox.style.height = ch + "px";
  for (const c of [pc, oc]) { c.style.width = cw + "px"; c.style.height = ch + "px"; c.width = Math.round(cw * d); c.height = Math.round(ch * d); }
  $("z-val").textContent = Math.round(zoom * 100) + "%";
  $("pg-info").textContent = `Page ${cur + 1} / ${pages.length}`;
  drawOverlay();
  const ctx = pc.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, pc.width, pc.height);
  if (p.blank) return;
  try {
    const page = await srcs[p.src].js.getPage(p.sp + 1);
    if (tok !== renderTok) return;
    const vp = page.getViewport({ scale: zoom * d * (pc.width / Math.round(cw * d)), rotation: (p.rot0 + p.rot) % 360 });
    renderTask = page.render({ canvasContext: ctx, viewport: vp });
    await renderTask.promise;
  } catch (e) { if (!(e && e.name === "RenderingCancelledException")) S3.toast("Couldn't render this page", "error"); }
}
function setPage(i) {
  if (i < 0 || i >= pages.length) return;
  endEdit(true); sel = null; cur = i;
  document.querySelectorAll(".pe-th").forEach((t, k) => t.classList.toggle("cur", k === i));
  renderPage(); syncUI();
  const t = document.querySelectorAll(".pe-th")[i]; if (t && t.scrollIntoView) t.scrollIntoView({ block: "nearest", inline: "nearest" });
}

// ---------------------------------------------------------------- thumbnails
const thumbCache = new Map();
let thumbTok = 0, dragFrom = -1;
const thumbKey = (p) => (p.blank ? `b:${p.w}:${p.h}` : `${p.src}:${p.sp}`) + ":" + ((p.rot0 + p.rot) % 360);
function buildThumbs() {
  const box = $("thumbs"); box.textContent = "";
  const tok = ++thumbTok;
  pages.forEach((p, i) => {
    const th = S3.h("div", { "class": "pe-th" + (i === cur ? " cur" : ""), draggable: "true", tabindex: "0", role: "button", "aria-label": "Page " + (i + 1) });
    const { W, H } = vd(p), c = document.createElement("canvas");
    c.width = 150; c.height = Math.max(1, Math.round(150 * H / W));
    th.appendChild(c); th.appendChild(S3.h("span", { text: String(i + 1) }));
    th.addEventListener("click", () => setPage(i));
    th.addEventListener("keydown", (e) => { if (e.key === "Enter") setPage(i); });
    th.addEventListener("dragstart", (e) => { dragFrom = i; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(i)); } catch (x) { /* ignore */ } });
    th.addEventListener("dragover", (e) => { e.preventDefault(); th.classList.add("over"); });
    th.addEventListener("dragleave", () => th.classList.remove("over"));
    th.addEventListener("drop", (e) => { e.preventDefault(); th.classList.remove("over"); if (dragFrom >= 0 && dragFrom !== i) movePage(dragFrom, i); dragFrom = -1; });
    box.appendChild(th);
  });
  (async () => {
    const els = box.querySelectorAll(".pe-th canvas");
    for (let i = 0; i < pages.length; i++) {
      if (tok !== thumbTok) return;
      const p = pages[i], c = els[i], ctx = c.getContext("2d"), key = thumbKey(p);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      if (p.blank) continue;
      let cached = thumbCache.get(key);
      if (!cached) {
        try {
          const page = await srcs[p.src].js.getPage(p.sp + 1);
          if (tok !== thumbTok) return;
          const vp = page.getViewport({ scale: c.width / vd(p).W, rotation: (p.rot0 + p.rot) % 360 });
          const tmp = document.createElement("canvas"); tmp.width = c.width; tmp.height = c.height;
          await page.render({ canvasContext: tmp.getContext("2d"), viewport: vp }).promise;
          cached = tmp; thumbCache.set(key, tmp);
        } catch (e) { continue; }
      }
      ctx.drawImage(cached, 0, 0, c.width, c.height);
    }
  })();
}

// ---------------------------------------------------------------- page operations
function rotatePage(dir) {
  const p = pages[cur]; if (!p) return;
  endEdit(true); pushUndo();
  const times = dir > 0 ? 1 : 3;
  for (let k = 0; k < times; k++) { const { H } = vd(p); p.objs.forEach((o) => rotObjCW(o, H)); p.rot = (p.rot + 90) % 360; }
  sel = null; buildThumbs(); renderPage(); syncUI();
}
function deletePage() {
  if (pages.length < 2) { S3.toast("A PDF needs at least one page", "error"); return; }
  endEdit(false); pushUndo(); pages.splice(cur, 1); cur = Math.min(cur, pages.length - 1); sel = null;
  buildThumbs(); renderPage(); syncUI();
}
function dupPage() {
  endEdit(true); pushUndo();
  const c = JSON.parse(JSON.stringify(pages[cur]));
  pages.splice(cur + 1, 0, c); cur++; sel = null; buildThumbs(); renderPage(); syncUI();
}
function blankAfter() {
  endEdit(true); pushUndo();
  const { W, H } = vd(pages[cur]);
  pages.splice(cur + 1, 0, { src: -1, sp: 0, rot0: 0, rot: 0, w: W, h: H, blank: true, objs: [] });
  cur++; sel = null; buildThumbs(); renderPage(); syncUI();
}
function movePage(from, to) {
  if (to < 0 || to >= pages.length || from === to) return;
  endEdit(true); pushUndo();
  const [p] = pages.splice(from, 1); pages.splice(to, 0, p); cur = to; sel = null;
  buildThumbs(); renderPage(); syncUI();
}

// ---------------------------------------------------------------- objects
function addObj(o) { pages[cur].objs.push(o); return o; }
function propsFromUI(kind) {
  const c = $("o-color").value;
  const base = { color: c, width: cfg.width };
  if (kind === "text") return { color: c, size: cfg.size, font: cfg.font, bold: cfg.bold, italic: cfg.italic };
  return base;
}
function placeImage(id, maxW) {
  const im = imgs.get(id), p = pages[cur], { W, H } = vd(p);
  let w = Math.min(im.w, maxW || W * 0.4), h = w * im.h / im.w;
  if (h > H * 0.6) { h = H * 0.6; w = h * im.w / im.h; }
  pushUndo();
  const o = addObj({ t: "image", img: id, x: (W - w) / 2, y: (H - h) / 2, w, h, q: 0 });
  sel = o; setTool("select"); drawOverlay(); syncUI();
}
async function addImageFile(file) {
  try {
    let bytes = new Uint8Array(await S3.readFile(file)), mime = file.type;
    const bmp = await createImageBitmap(file);
    if (mime !== "image/png" && mime !== "image/jpeg") {
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0);
      bytes = new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/png"))).arrayBuffer()); mime = "image/png";
    }
    const id = "i" + idSeq++;
    imgs.set(id, { bmp, bytes, mime, w: bmp.width * 0.75, h: bmp.height * 0.75 });
    placeImage(id);
  } catch (e) { S3.toast("Couldn't read that image", "error"); }
}

// ---- text editing
let editing = null, editStart = null, editNew = false;
function editText(o, isNew, before) {
  endEdit(true);
  editing = o; editNew = isNew; editStart = { snap: before || snapshot(), text: o.text };
  sel = o; layoutTA(); ta.hidden = false; ta.value = o.text; ta.focus();
  if (isNew) ta.select();
  setTimeout(() => { if (editing === o) { ta.focus(); if (isNew) ta.select(); } }, 40);
  drawOverlay(); syncUI();
}
function layoutTA() {
  const o = editing; if (!o) return;
  const { uw, uh } = updims(o), cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  Object.assign(ta.style, {
    left: (cx - uw / 2) * zoom + "px", top: (cy - uh / 2) * zoom + "px", width: uw * zoom + "px", height: uh * zoom + "px",
    fontSize: o.size * zoom + "px", fontFamily: CSS_FAMILY[o.font], color: o.color,
    fontWeight: o.bold ? "700" : "400", fontStyle: o.italic ? "italic" : "normal",
  });
}
ta.addEventListener("input", () => {
  if (!editing) return;
  editing.text = ta.value; fitText(editing); layoutTA(); drawOverlay();
});
ta.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); endEdit(true); } e.stopPropagation(); });
ta.addEventListener("blur", () => endEdit(true));
function endEdit(keep) {
  if (!editing) return;
  const o = editing, p = pages[cur];
  editing = null; ta.hidden = true;
  const empty = !o.text.trim();
  if (empty || !keep) {
    const i = p.objs.indexOf(o); if (i >= 0) p.objs.splice(i, 1);
    if (sel === o) sel = null;
    if (!empty && !keep) { /* discarded by caller */ }
    else if (!editNew) { undoStack.push(editStart.snap); redoStack = []; dirty = true; }
  } else if (editNew || o.text !== editStart.text) { undoStack.push(editStart.snap); redoStack = []; dirty = true; }
  drawOverlay(); syncUI();
}

// ---------------------------------------------------------------- pointer interaction
function ptr(e) {
  const r = oc.getBoundingClientRect();
  return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
}
function hitHandle(o, x, y) {
  const r = 9 / zoom;
  return handlesOf(o).find((h) => Math.hypot(x - h.x, y - h.y) <= r);
}
oc.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 && e.pointerType === "mouse") return;
  const p = pages[cur]; if (!p) return;
  endEdit(true);
  e.preventDefault();
  const pt = ptr(e);
  oc.setPointerCapture(e.pointerId);
  if (tool === "select") {
    if (sel && p.objs.includes(sel)) {
      const h = hitHandle(sel, pt.x, pt.y);
      if (h) { drag = { mode: "resize", h: h.id, obj: sel, orig: JSON.parse(JSON.stringify(sel)), snap: snapshot(), moved: false }; return; }
    }
    let found = null;
    for (let i = p.objs.length - 1; i >= 0; i--) if (hit(p.objs[i], pt.x, pt.y)) { found = p.objs[i]; break; }
    sel = found;
    if (found) {
      drag = { mode: "move", obj: found, start: pt, orig: JSON.parse(JSON.stringify(found)), snap: snapshot(), moved: false, t0: Date.now() };
      if (found.t === "text") drag.dbl = true;
    }
    syncOptsFromSel(); drawOverlay(); syncUI();
    return;
  }
  if (tool === "text") {
    const before = snapshot();
    const o = { t: "text", x: pt.x, y: pt.y, w: 200, h: 0, q: 0, text: "Text", ...propsFromUI("text") };
    if (pt.x + o.w > vd(p).W) o.x = Math.max(4, vd(p).W - o.w - 4);
    fitText(o); addObj(o); setTool("select"); editText(o, true, before);
    return;
  }
  const props = propsFromUI(tool);
  if (tool === "pen") drag = { mode: "draw", obj: { t: "pen", pts: [[pt.x, pt.y]], ...props } };
  else if (isLine({ t: tool })) drag = { mode: "draw", start: pt, obj: { t: tool, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, ...props } };
  else drag = { mode: "draw", start: pt, obj: { t: tool, x: pt.x, y: pt.y, w: 0, h: 0, ...props } };
  drag.snap = snapshot();
});
oc.addEventListener("pointermove", (e) => {
  const pt = ptr(e);
  if (!drag) {
    const p = pages[cur];
    if (tool === "select" && p) {
      let c = "default";
      if (sel && hitHandle(sel, pt.x, pt.y)) c = "nwse-resize";
      else for (let i = p.objs.length - 1; i >= 0; i--) if (hit(p.objs[i], pt.x, pt.y)) { c = "move"; break; }
      oc.style.cursor = c;
    } else oc.style.cursor = tool === "text" ? "text" : "crosshair";
    return;
  }
  const o = drag.obj;
  if (drag.mode === "draw") {
    if (o.t === "pen") o.pts.push([pt.x, pt.y]);
    else if (isLine(o)) { o.x2 = pt.x; o.y2 = pt.y; if (e.shiftKey) snapAxis(o); }
    else { o.x = Math.min(drag.start.x, pt.x); o.y = Math.min(drag.start.y, pt.y); o.w = Math.abs(pt.x - drag.start.x); o.h = Math.abs(pt.y - drag.start.y); }
  } else if (drag.mode === "move") {
    const dx = pt.x - drag.start.x, dy = pt.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) * zoom < 3) return;
    drag.moved = true;
    restoreGeom(o, drag.orig); translate(o, dx, dy);
  } else if (drag.mode === "resize") { drag.moved = true; resize(o, drag, pt, e.shiftKey); }
  drawOverlay();
});
function snapAxis(o) {
  const dx = o.x2 - o.x1, dy = o.y2 - o.y1;
  if (Math.abs(dx) > Math.abs(dy) * 2) o.y2 = o.y1; else if (Math.abs(dy) > Math.abs(dx) * 2) o.x2 = o.x1;
}
function restoreGeom(o, orig) { for (const k in orig) o[k] = Array.isArray(orig[k]) ? JSON.parse(JSON.stringify(orig[k])) : orig[k]; }
function resize(o, d, pt, shift) {
  const g = d.orig;
  if (isLine(o)) { if (d.h === "a") { o.x1 = pt.x; o.y1 = pt.y; } else { o.x2 = pt.x; o.y2 = pt.y; if (shift) snapAxis(o); } return; }
  if (o.t === "text") { const nw = Math.max(24, pt.x - g.x); o.w = nw; fitText(o); return; }
  const opp = { tl: [g.x + g.w, g.y + g.h], tr: [g.x, g.y + g.h], br: [g.x, g.y], bl: [g.x + g.w, g.y] }[d.h];
  let nx = pt.x, ny = pt.y;
  if (o.t === "image" || shift) {
    const ar = g.w / g.h, w = Math.max(8, Math.abs(nx - opp[0])), h = w / ar;
    nx = opp[0] + Math.sign(nx - opp[0] || 1) * w; ny = opp[1] + Math.sign(ny - opp[1] || 1) * h;
  }
  o.x = Math.min(opp[0], nx); o.y = Math.min(opp[1], ny); o.w = Math.max(2, Math.abs(nx - opp[0])); o.h = Math.max(2, Math.abs(ny - opp[1]));
}
function finishPointer(e) {
  if (!drag) return;
  const d = drag; drag = null;
  const o = d.obj, p = pages[cur];
  if (d.mode === "draw") {
    const tiny = o.t === "pen" ? o.pts.length < 2 : isLine(o) ? Math.hypot(o.x2 - o.x1, o.y2 - o.y1) * zoom < 4 : (o.w * zoom < 4 || o.h * zoom < 4);
    if (!tiny) { pushUndo(d.snap); p.objs.push(o); if (o.t === "pen" && o.pts.length > 3) o.pts = thin(o.pts); }
  } else if (d.moved) pushUndo(d.snap);
  else if (d.mode === "move" && d.dbl && e && e.type === "pointerup" && o.t === "text" && Date.now() - d.t0 < 400 && sel === o && lastClick && lastClick.o === o && Date.now() - lastClick.t < 450) {
    editText(o, false);
  }
  if (d.mode === "move") lastClick = { o, t: Date.now() };
  drawOverlay(); syncUI();
}
let lastClick = null;
function thin(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) { const l = out[out.length - 1]; if (Math.hypot(pts[i][0] - l[0], pts[i][1] - l[1]) >= 0.6) out.push(pts[i]); }
  out.push(pts[pts.length - 1]); return out;
}
oc.addEventListener("pointerup", finishPointer);
oc.addEventListener("pointercancel", () => { drag = null; drawOverlay(); });
oc.addEventListener("dblclick", (e) => {
  const p = pages[cur], pt = ptr(e);
  if (tool !== "select" || !p) return;
  for (let i = p.objs.length - 1; i >= 0; i--) if (p.objs[i].t === "text" && hit(p.objs[i], pt.x, pt.y)) { editText(p.objs[i], false); return; }
});

// ---------------------------------------------------------------- toolbar / options
function setTool(t) {
  tool = t; if (t !== "select") sel = null;
  document.querySelectorAll("#tools .tool").forEach((b) => b.classList.toggle("on", b.dataset.tool === t));
  if (TOOL_COLORS[t]) $("o-color").value = TOOL_COLORS[t];
  oc.style.cursor = t === "select" ? "default" : t === "text" ? "text" : "crosshair";
  drawOverlay(); syncUI();
}
function curKind() { return sel ? sel.t : tool; }
function syncOptsFromSel() {
  if (!sel) return;
  if (sel.color && sel.t !== "whiteout") $("o-color").value = sel.color;
  if (sel.width) $("o-width").value = sel.width;
  if (sel.t === "text") { $("o-font").value = sel.font; $("o-size").value = sel.size; $("o-bold").setAttribute("aria-pressed", sel.bold); $("o-italic").setAttribute("aria-pressed", sel.italic); }
}
function syncUI() {
  const has = pages.length > 0, k = curKind();
  $("b-export").disabled = !has;
  $("b-undo").disabled = !undoStack.length; $("b-redo").disabled = !redoStack.length;
  $("o-del").disabled = !sel;
  const shape = ["pen", "rect", "ellipse", "line", "arrow"].includes(k), txt = k === "text";
  $("w-wrap").hidden = !shape;
  for (const id of ["f-wrap", "s-wrap", "o-bold", "o-italic"]) $(id).hidden = !txt;
  $("o-color").parentElement.hidden = ["select", "whiteout", "image", "sign"].includes(k);
  $("o-bold").setAttribute("aria-pressed", String(txt ? (sel ? sel.bold : cfg.bold) : cfg.bold));
  $("o-italic").setAttribute("aria-pressed", String(txt ? (sel ? sel.italic : cfg.italic) : cfg.italic));
  $("pg-prev").disabled = cur <= 0; $("pg-next").disabled = cur >= pages.length - 1;
  $("pg-info").textContent = `Page ${cur + 1} / ${pages.length}`;
  for (const id of ["p-up"]) $(id).disabled = cur <= 0;
  $("p-down").disabled = cur >= pages.length - 1;
  document.querySelectorAll(".pe-th").forEach((t, i) => t.classList.toggle("cur", i === cur));
}
function applyProp(fn, text) {
  const target = editing || sel;
  if (!target) return;
  if (!editing) pushUndo();
  fn(target);
  if (target.t === "text") { fitText(target); if (editing) layoutTA(); }
  drawOverlay(); syncUI();
}
$("o-color").addEventListener("input", () => {
  const k = curKind(); if (TOOL_COLORS[k]) TOOL_COLORS[k] = $("o-color").value;
  const c = $("o-color").value;
  if (sel) applyProp((o) => { o.color = c; });
});
$("o-width").addEventListener("change", () => {
  cfg.width = Math.max(1, Math.min(40, +$("o-width").value || 3));
  if (sel && sel.width) applyProp((o) => { o.width = cfg.width; });
});
$("o-size").addEventListener("change", () => {
  cfg.size = Math.max(6, Math.min(144, +$("o-size").value || 16));
  if (sel && sel.t === "text") applyProp((o) => { o.size = cfg.size; });
});
$("o-font").addEventListener("change", () => {
  cfg.font = $("o-font").value;
  if (sel && sel.t === "text") applyProp((o) => { o.font = cfg.font; });
});
for (const [id, key] of [["o-bold", "bold"], ["o-italic", "italic"]]) {
  $(id).addEventListener("mousedown", (e) => e.preventDefault());
  $(id).addEventListener("click", () => {
    const v = !(sel && sel.t === "text" ? sel[key] : cfg[key]);
    cfg[key] = v;
    if (sel && sel.t === "text") applyProp((o) => { o[key] = v; });
    syncUI();
  });
}
function deleteSel() {
  if (!sel) return;
  const p = pages[cur], i = p.objs.indexOf(sel);
  if (i < 0) return;
  endEdit(true); pushUndo(); p.objs.splice(i, 1); sel = null; drawOverlay(); syncUI();
}
$("o-del").addEventListener("click", deleteSel);

document.querySelectorAll("#tools .tool").forEach((b) => b.addEventListener("click", () => {
  if (!pages.length) { S3.toast("Open a PDF first"); return; }
  const t = b.dataset.tool;
  if (t === "image") { setTool("select"); $("f-img").click(); }
  else if (t === "sign") { setTool("select"); openSig(); }
  else setTool(t);
}));

// zoom & nav
function setZoom(z) { fitMode = false; zoom = Math.max(0.2, Math.min(5, z)); endEdit(true); renderPage(); layoutTA(); }
$("z-in").addEventListener("click", () => setZoom(zoom * 1.2));
$("z-out").addEventListener("click", () => setZoom(zoom / 1.2));
$("z-fit").addEventListener("click", () => { fitMode = true; renderPage(); });
$("pg-prev").addEventListener("click", () => setPage(cur - 1));
$("pg-next").addEventListener("click", () => setPage(cur + 1));
let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (fitMode && pages.length) renderPage(); }, 150); });

// page ops
$("p-left").addEventListener("click", () => rotatePage(-1));
$("p-right").addEventListener("click", () => rotatePage(1));
$("p-up").addEventListener("click", () => movePage(cur, cur - 1));
$("p-down").addEventListener("click", () => movePage(cur, cur + 1));
$("p-dup").addEventListener("click", dupPage);
$("p-blank").addEventListener("click", blankAfter);
$("p-del").addEventListener("click", deletePage);
$("p-merge").addEventListener("click", () => $("f-merge").click());
$("f-merge").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) mergeFile(f); });
$("f-img").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) addImageFile(f); });
$("b-undo").addEventListener("click", undo);
$("b-redo").addEventListener("click", redo);

// open
const fpdf = $("f-pdf");
fpdf.addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) openFile(f); });
$("b-open").addEventListener("click", () => fpdf.click());
$("b-open2").addEventListener("click", (e) => { e.stopPropagation(); fpdf.click(); });
$("b-new").addEventListener("click", (e) => { e.stopPropagation(); newBlank(); });
const dz = $("drop");
dz.addEventListener("click", () => fpdf.click());
dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fpdf.click(); } });
for (const target of [dz, stage]) {
  ["dragenter", "dragover"].forEach((ev) => target.addEventListener(ev, (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); dz.classList.add("is-over"); } }));
  ["dragleave", "drop"].forEach((ev) => target.addEventListener(ev, () => dz.classList.remove("is-over")));
  target.addEventListener("drop", (e) => {
    const files = [...((e.dataTransfer && e.dataTransfer.files) || [])];
    if (!files.length) return;
    e.preventDefault();
    const f = files.find((x) => /pdf$/i.test(x.type) || /\.pdf$/i.test(x.name)), im = files.find((x) => /^image\//.test(x.type));
    if (f && pages.length && dz.offsetParent === null && e.currentTarget === stage && e.shiftKey) mergeFile(f);
    else if (f) openFile(f);
    else if (im && pages.length) addImageFile(im);
    else S3.toast("Drop a PDF file", "error");
  });
}

// keyboard
document.addEventListener("keydown", (e) => {
  if (!pages.length || e.target.closest("input, textarea, select") || document.querySelector("dialog[open]")) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k === "y") { e.preventDefault(); redo(); return; }
  if (mod && k === "s") { e.preventDefault(); exportPdf(); return; }
  if (mod || e.altKey) return;
  if ((k === "delete" || k === "backspace") && sel) { e.preventDefault(); deleteSel(); return; }
  if (k === "escape") { sel = null; setTool("select"); return; }
  if (k.startsWith("arrow") && sel) {
    e.preventDefault();
    const s = e.shiftKey ? 10 : 1, dx = k === "arrowleft" ? -s : k === "arrowright" ? s : 0, dy = k === "arrowup" ? -s : k === "arrowdown" ? s : 0;
    pushUndo(); translate(sel, dx, dy); drawOverlay(); return;
  }
  const map = { v: "select", t: "text", p: "pen", h: "highlight", r: "rect", e: "ellipse", l: "line", a: "arrow", w: "whiteout" };
  if (map[k]) { setTool(map[k]); return; }
  if (k === "i") { $("f-img").click(); return; }
  if (k === "g") { openSig(); return; }
  if (k === "+" || k === "=") { setZoom(zoom * 1.2); return; }
  if (k === "-") { setZoom(zoom / 1.2); return; }
  if (k === "0") { fitMode = true; renderPage(); return; }
  if (k === "pagedown") { setPage(cur + 1); return; }
  if (k === "pageup") { setPage(cur - 1); return; }
});
window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

// ---------------------------------------------------------------- signature
const sg = $("sig"), sgc = $("sg-c"), sgx = sgc.getContext("2d");
let sgMode = "draw", sgDown = false, sgInk = false;
function sgReset() { sgx.clearRect(0, 0, sgc.width, sgc.height); sgInk = false; $("sg-t").value = ""; }
function openSig() {
  if (!pages.length) { S3.toast("Open a PDF first"); return; }
  endEdit(true); sgReset(); sgSet("draw");
  $("sg-saved").hidden = !S3.store("pdf-editor-sig");
  sg.showModal();
}
function sgSet(m) {
  sgMode = m; $("sg-draw").classList.toggle("on", m === "draw"); $("sg-type").classList.toggle("on", m === "type");
  $("sg-t").hidden = m !== "type"; sgc.style.cursor = m === "draw" ? "crosshair" : "default";
  sgx.clearRect(0, 0, sgc.width, sgc.height); sgInk = false;
}
$("sg-draw").addEventListener("click", () => sgSet("draw"));
$("sg-type").addEventListener("click", () => { sgSet("type"); $("sg-t").focus(); });
$("sg-clear").addEventListener("click", () => { sgx.clearRect(0, 0, sgc.width, sgc.height); sgInk = false; $("sg-t").value = ""; });
$("sg-cancel").addEventListener("click", () => sg.close());
$("sg-t").addEventListener("input", () => {
  sgx.clearRect(0, 0, sgc.width, sgc.height);
  const t = $("sg-t").value; sgInk = !!t.trim();
  sgx.fillStyle = "#111"; sgx.textBaseline = "middle"; sgx.font = '84px "Brush Script MT", "Segoe Script", "Snell Roundhand", "URW Chancery L", cursive';
  let s = 84; while (sgx.measureText(t).width > sgc.width - 30 && s > 20) { s -= 4; sgx.font = sgx.font.replace(/\d+px/, s + "px"); }
  sgx.fillText(t, 15, sgc.height / 2);
});
function sgPt(e) { const r = sgc.getBoundingClientRect(); return [(e.clientX - r.left) * sgc.width / r.width, (e.clientY - r.top) * sgc.height / r.height]; }
sgc.addEventListener("pointerdown", (e) => {
  if (sgMode !== "draw") return;
  sgDown = true; sgc.setPointerCapture(e.pointerId);
  const [x, y] = sgPt(e); sgx.strokeStyle = "#111"; sgx.lineWidth = 3.2; sgx.lineCap = sgx.lineJoin = "round";
  sgx.beginPath(); sgx.moveTo(x, y); sgx.lineTo(x + 0.1, y); sgx.stroke(); sgInk = true;
});
sgc.addEventListener("pointermove", (e) => { if (!sgDown) return; const [x, y] = sgPt(e); sgx.lineTo(x, y); sgx.stroke(); sgx.beginPath(); sgx.moveTo(x, y); });
sgc.addEventListener("pointerup", () => { sgDown = false; });
async function placeDataUrl(url) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob), bytes = new Uint8Array(await blob.arrayBuffer());
  const id = "i" + idSeq++;
  imgs.set(id, { bmp, bytes, mime: "image/png", w: bmp.width / 2.4, h: bmp.height / 2.4 });
  placeImage(id, 170);
}
$("sg-ok").addEventListener("click", async () => {
  if (!sgInk) { S3.toast("Draw or type your signature first", "error"); return; }
  const w = sgc.width, h = sgc.height, d = sgx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 20) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 <= x0) { S3.toast("Nothing to place", "error"); return; }
  const pad = 6, c = document.createElement("canvas");
  c.width = x1 - x0 + pad * 2; c.height = y1 - y0 + pad * 2;
  c.getContext("2d").drawImage(sgc, x0 - pad, y0 - pad, c.width, c.height, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/png");
  if ($("sg-save").checked) S3.store("pdf-editor-sig", url);
  sg.close(); await placeDataUrl(url);
});
$("sg-saved").addEventListener("click", async () => { const u = S3.store("pdf-editor-sig"); if (u) { sg.close(); await placeDataUrl(u); } });

// ---------------------------------------------------------------- export
function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return PL.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
const ROT = { 0: [1, 0], 1: [0, 1], 2: [-1, 0], 3: [0, -1] }; // cos, sin for k * 90deg
function textToPng(o, uw, uh) {
  const k = 3, c = document.createElement("canvas");
  c.width = Math.ceil(uw * k); c.height = Math.ceil(uh * k);
  const ctx = c.getContext("2d"); ctx.scale(k, k); drawTextLines(ctx, o, uw);
  return new Promise((r) => c.toBlob(async (b) => r(new Uint8Array(await b.arrayBuffer())), "image/png"));
}
async function drawObjectsPdf(out, page, p, R, imgCache) {
  const box = page.getCropBox(), w = box.width, h = box.height;
  const M = { 0: [1, 0, 0, 1, box.x, box.y], 90: [0, 1, -1, 0, box.x + w, box.y], 180: [-1, 0, 0, -1, box.x + w, box.y + h], 270: [0, -1, 1, 0, box.x, box.y + h] }[R];
  const Hv = R % 180 ? w : h, Y = (y) => Hv - y;
  page.pushOperators(PL.pushGraphicsState(), PL.concatTransformationMatrix(...M));
  const line = (x1, y1, x2, y2, o) => page.drawLine({ start: { x: x1, y: Y(y1) }, end: { x: x2, y: Y(y2) }, thickness: o.width, color: hexRgb(o.color), lineCap: PL.LineCapStyle.Round });
  for (const o of p.objs) {
    switch (o.t) {
      case "rect": page.drawRectangle({ x: o.x, y: Y(o.y + o.h), width: o.w, height: o.h, borderColor: hexRgb(o.color), borderWidth: o.width, borderLineCap: PL.LineCapStyle.Round }); break;
      case "ellipse": page.drawEllipse({ x: o.x + o.w / 2, y: Y(o.y + o.h / 2), xScale: o.w / 2, yScale: o.h / 2, borderColor: hexRgb(o.color), borderWidth: o.width }); break;
      case "whiteout": page.drawRectangle({ x: o.x, y: Y(o.y + o.h), width: o.w, height: o.h, color: PL.rgb(1, 1, 1) }); break;
      case "highlight": page.drawRectangle({ x: o.x, y: Y(o.y + o.h), width: o.w, height: o.h, color: hexRgb(o.color), opacity: 0.4 }); break;
      case "line": line(o.x1, o.y1, o.x2, o.y2, o); break;
      case "arrow": line(o.x1, o.y1, o.x2, o.y2, o); for (const [x, y] of arrowHead(o)) line(o.x2, o.y2, x, y, o); break;
      case "pen":
        if (o.pts.length === 1) line(o.pts[0][0], o.pts[0][1], o.pts[0][0] + 0.01, o.pts[0][1], o);
        for (let i = 1; i < o.pts.length; i++) line(o.pts[i - 1][0], o.pts[i - 1][1], o.pts[i][0], o.pts[i][1], o);
        break;
      case "image": case "text": {
        const { uw, uh } = updims(o), [c, s] = ROT[(4 - (o.q || 0)) % 4];
        page.pushOperators(PL.pushGraphicsState(), PL.concatTransformationMatrix(c, s, -s, c, o.x + o.w / 2, Y(o.y + o.h / 2)));
        if (o.t === "image") {
          const im = imgs.get(o.img);
          if (im) {
            let emb = imgCache.get(o.img);
            if (!emb) { emb = im.mime === "image/jpeg" ? await out.embedJpg(im.bytes) : await out.embedPng(im.bytes); imgCache.set(o.img, emb); }
            page.drawImage(emb, { x: -uw / 2, y: -uh / 2, width: uw, height: uh });
          }
        } else {
          const lines = wrapLines(o, uw), f = await getFont(out, o);
          if (lines.every((ln) => encodable(f, ln))) {
            lines.forEach((ln, i) => { if (ln) page.drawText(ln, { x: -uw / 2, y: uh / 2 - (i * o.size * LH + o.size * BASE), size: o.size, font: f, color: hexRgb(o.color) }); });
          } else {
            const emb = await out.embedPng(await textToPng(o, uw, uh));
            page.drawImage(emb, { x: -uw / 2, y: -uh / 2, width: uw, height: uh });
          }
        }
        page.pushOperators(PL.popGraphicsState());
      }
    }
  }
  page.pushOperators(PL.popGraphicsState());
}
const fontCaches = new WeakMap();
async function getFont(out, o) {
  let m = fontCaches.get(out); if (!m) { m = {}; fontCaches.set(out, m); }
  const key = o.font + fidx(o);
  if (!m[key]) m[key] = await out.embedFont(PL.StandardFonts[FONT_NAMES[o.font][fidx(o)]]);
  return m[key];
}
async function buildPdf(pgs, sources) {
  const out = await PL.PDFDocument.create(), imgCache = new Map(), copied = new Map();
  for (let si = 0; si < sources.length; si++) {
    const idx = pgs.map((p, i) => [p, i]).filter(([p]) => !p.blank && p.src === si);
    if (!idx.length) continue;
    const lib = await PL.PDFDocument.load(sources[si].bytes, { updateMetadata: false });
    const cp = await out.copyPages(lib, idx.map(([p]) => p.sp));
    idx.forEach(([, i], k) => copied.set(i, cp[k]));
  }
  for (let i = 0; i < pgs.length; i++) {
    const p = pgs[i], R = (p.rot0 + p.rot) % 360;
    const page = p.blank ? out.addPage([p.w, p.h]) : out.addPage(copied.get(i));
    page.setRotation(PL.degrees(R));
    if (p.objs.length) await drawObjectsPdf(out, page, p, R, imgCache);
  }
  return out.save();
}
async function exportPdf() {
  if (!pages.length) return;
  endEdit(true);
  const btn = $("b-export"); btn.disabled = true; const label = btn.textContent; btn.textContent = "Saving…";
  try {
    const bytes = await buildPdf(pages, srcs);
    S3.download(new Blob([bytes], { type: "application/pdf" }), docName + (pages.some((p) => p.objs.length) || dirty ? "-edited" : "") + ".pdf");
    dirty = false; S3.done();
  } catch (e) { console.error(e); S3.toast("Couldn't save: " + (e && e.message ? e.message : "unknown error"), "error"); }
  btn.textContent = label; syncUI();
}
$("b-export").addEventListener("click", exportPdf);

// ---------------------------------------------------------------- self test
window.S3_SELFTEST = async function () {
  try {
    const d = await PL.PDFDocument.create();
    d.addPage([300, 400]); d.addPage([400, 300]);
    const bytes = await d.save();
    const { src, metas } = await makeSrc(bytes, "t.pdf");
    const pgs = metas.map((m) => ({ ...m, src: 0 }));
    const t = { t: "text", x: 20, y: 20, w: 150, h: 0, q: 0, text: "Hello world, selftest line that wraps", color: "#111111", size: 14, font: "Times", bold: true, italic: false };
    fitText(t);
    const ar = { t: "text", x: 20, y: 120, w: 150, h: 0, q: 0, text: "مرحبا", color: "#111111", size: 14, font: "Helvetica", bold: false, italic: false };
    fitText(ar);
    pgs[0].objs.push(t, ar, { t: "rect", x: 10, y: 200, w: 80, h: 40, color: "#d92d20", width: 2 },
      { t: "pen", pts: [[10, 300], [50, 320], [90, 300]], color: "#0000ff", width: 3 },
      { t: "arrow", x1: 100, y1: 100, x2: 200, y2: 200, color: "#00aa00", width: 2 },
      { t: "highlight", x: 20, y: 20, w: 100, h: 20, color: "#ffe14d" }, { t: "whiteout", x: 250, y: 350, w: 30, h: 30 });
    pgs[1].rot = 90; pgs[1].objs.push({ t: "ellipse", x: 20, y: 20, w: 60, h: 40, color: "#d92d20", width: 2 });
    const out = await buildPdf(pgs, [src]);
    const chk = await PL.PDFDocument.load(out);
    return chk.getPageCount() === 2 && chk.getPage(1).getRotation().angle === 90 && t.h > 14 * 1.2 * 1.5;
  } catch (e) { console.error("S3_SELFTEST", e); return false; }
};

// ---------------------------------------------------------------- boot
loadMeasureFonts().then(syncUI);
setTool("select");
