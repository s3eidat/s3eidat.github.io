/* PDF Notes — handwrite on PDFs and paper notebooks; export the annotated PDF. Everything stays in this browser. */
import * as pdfjsLib from "./lib/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./lib/pdf.worker.min.mjs", import.meta.url).href;

const S3 = window.S3, PL = window.PDFLib, $ = S3.$, h = S3.h;
const SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
const PAPERS = [["plain", "Blank"], ["lined", "Lined"], ["grid", "Grid"], ["dots", "Dotted"]];
const INKS = ["#1b1f24", "#2f6fdb", "#d93a3a", "#1f9d61", "#8a4bd6", "#e07b00"];
const HIGHLIGHTS = ["#ffe14d", "#7ce8ff", "#9cf09a", "#ffa3d1"];
const COVERS = ["#2f6fdb", "#0e9f9a", "#d93a3a", "#8a4bd6", "#e07b00", "#1b1f24"];

// ---------- storage (IndexedDB: notebooks and the original PDF bytes) ----------
let DBP = null;
function idb() {
  if (DBP) return DBP;
  DBP = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error("no idb"));
    const r = indexedDB.open("s3-pdf-notes", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("books", { keyPath: "id" }); r.result.createObjectStore("pdfs"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return DBP;
}
function tx(store, mode, fn) {
  return idb().then((db) => new Promise((res, rej) => {
    const t = db.transaction(store, mode), s = t.objectStore(store), out = fn(s);
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
}
const allBooks = () => tx("books", "readonly", (s) => s.getAll());
const putBook = (b) => tx("books", "readwrite", (s) => s.put(b));
const delBook = (id) => Promise.all([tx("books", "readwrite", (s) => s.delete(id)), tx("pdfs", "readwrite", (s) => s.delete(id))]);
const getPdf = (id) => tx("pdfs", "readonly", (s) => s.get(id));
const putPdf = (id, buf) => tx("pdfs", "readwrite", (s) => s.put(buf, id));

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function icon(nm) { const s = h("span", { "class": "pn-ic", "aria-hidden": "true" }); s.innerHTML = S3.icon(nm); return s; }
function btn(label, onclick, cls, ic, title) {
  return h("button", { type: "button", "class": "btn " + (cls || ""), onclick, title: title || null, "aria-label": title || null }, ic ? [icon(ic)].concat(label ? [label] : []) : [label]);
}
function fileBase(t) { return (t || "").replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9 _.-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60).replace(/ /g, "-") || "notes"; }
function cleanStroke(s) {
  if (!s || !Array.isArray(s.pts) || s.pts.length < 3) return null;
  return { tool: s.tool === "hl" ? "hl" : "pen", color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : "#1b1f24", size: Math.max(.5, Math.min(40, +s.size || 2)), pts: s.pts.slice(0, 60000).map((v) => Math.round((+v || 0) * 10) / 10) };
}

// ---------- library ----------
let books = [];
async function showLibrary() {
  $("#pn-editor").hidden = true; $("#pn-library").hidden = false; closeEditor();
  try { books = (await allBooks()).sort((a, b) => b.updated - a.updated); } catch (e) { books = []; S3.toast("This browser can't store notebooks (private mode?). Export your PDF before closing.", "error"); }
  const v = $("#pn-library"); v.textContent = "";
  v.appendChild(h("div", { "class": "pn-head" }, [h("div", { "class": "grow" }, [h("h1", { text: "PDF Notes" }), h("p", { "class": "muted", text: "Handwrite on PDFs and notebooks with a pen, finger or mouse. Unlimited notebooks, saved in this browser only." })]),
    h("div", { "class": "row" }, [btn("New notebook", newDialog, "primary", "plus"), btn("Open a PDF", pickPdf, "", "upload")])]));
  const drop = h("label", { "class": "drop pn-drop" }, [h("input", { type: "file", accept: "application/pdf,.pdf", hidden: true }), icon("upload"), h("b", { text: "Drop a PDF here to write on it" }), h("span", { text: "Lecture slides, worksheets, forms. It stays on your device." })]);
  S3.drop(drop, (files) => importPdf(files[0]), { accept: ".pdf,application/pdf", multiple: false });
  v.appendChild(drop);
  if (!books.length) { v.appendChild(h("div", { "class": "empty" }, [h("b", { text: "No notebooks yet" }), h("span", { text: "Start a lined, grid, dotted or blank notebook, or open a PDF to write on." })])); return; }
  const grid = h("div", { "class": "pn-grid" });
  books.forEach((b) => {
    const card = h("div", { "class": "pn-book" }, [
      h("button", { type: "button", "class": "pn-cover", style: "--c:" + (b.cover || COVERS[0]), onclick: () => openBook(b.id), "aria-label": "Open " + (b.title || "notebook") }, [
        h("span", { "class": "pn-kind", text: b.kind === "pdf" ? "PDF" : (PAPERS.find((p) => p[0] === b.paper) || PAPERS[0])[1] }), h("b", { dir: "auto", text: b.title || "Untitled" })]),
      h("div", { "class": "row between pn-meta" }, [h("span", { "class": "faint", text: b.pages.length + (b.pages.length === 1 ? " page" : " pages") + " · " + new Date(b.updated).toLocaleDateString() }),
        h("div", { "class": "row" }, [btn("", () => rename(b), "ghost icon small", "settings", "Rename " + (b.title || "notebook")), btn("", () => remove(b), "ghost icon small pn-del", "trash", "Delete " + (b.title || "notebook"))])])
    ]);
    grid.appendChild(card);
  });
  v.appendChild(grid);
}
async function rename(b) { const t = prompt("Notebook name", b.title || ""); if (t == null) return; b.title = t.trim().slice(0, 80) || b.title; b.updated = Date.now(); await putBook(b); showLibrary(); }
async function remove(b) {
  const pdf = b.kind === "pdf" ? await getPdf(b.id) : null;
  await delBook(b.id); showLibrary();
  const t = S3.toast("Deleted " + (b.title || "notebook") + " ");
  t.appendChild(h("button", { "class": "btn small", type: "button", onclick: async () => { await putBook(b); if (pdf) await putPdf(b.id, pdf); showLibrary(); t.remove(); } }, ["Undo"]));
}
function newDialog() {
  const m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "New notebook" });
  const title = h("input", { "class": "input", type: "text", maxlength: "80", placeholder: "e.g. Physics lectures", dir: "auto" });
  let paper = "lined", size = "a4";
  const pseg = h("div", { "class": "seg", role: "group", "aria-label": "Paper" }, PAPERS.map((p) => h("button", { type: "button", "aria-pressed": String(p[0] === paper), onclick: (e) => { paper = p[0]; pseg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === e.currentTarget))); } }, [p[1]])));
  const sseg = h("div", { "class": "seg", role: "group", "aria-label": "Size" }, [["a4", "A4"], ["letter", "US Letter"]].map((p) => h("button", { type: "button", "aria-pressed": String(p[0] === size), onclick: (e) => { size = p[0]; sseg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === e.currentTarget))); } }, [p[1]])));
  const go = btn("Create", async () => {
    const [w, hh] = SIZES[size], b = { id: uid(), title: title.value.trim().slice(0, 80) || "Notebook", kind: "paper", paper, size, cover: COVERS[books.length % COVERS.length], created: Date.now(), updated: Date.now(), pages: [] };
    for (let i = 0; i < 3; i++) b.pages.push({ id: uid(), kind: "paper", paper, w, h: hh, strokes: [] });
    await putBook(b); close(); openBook(b.id);
  }, "primary", "plus");
  const sheet = h("div", { "class": "s3-sheet" }, [h("div", { "class": "row between" }, [h("h2", { text: "New notebook" }), btn("", close, "ghost icon", "x", "Close")]),
    h("div", { "class": "stack" }, [h("label", { "class": "field" }, ["Name", title]), h("div", { "class": "field" }, ["Paper", pseg]), h("div", { "class": "field" }, ["Page size", sseg])]),
    h("div", { "class": "row end mt" }, [btn("Cancel", close, "ghost"), go])]);
  m.appendChild(sheet);
  function close() { m.remove(); document.removeEventListener("keydown", onKey); }
  function onKey(e) { if (e.key === "Escape") close(); if (e.key === "Enter" && document.activeElement === title) go.click(); }
  m.addEventListener("click", (e) => { if (e.target === m) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(m); title.focus();
}
function pickPdf() {
  const inp = h("input", { type: "file", accept: "application/pdf,.pdf", hidden: true });
  inp.addEventListener("change", () => { if (inp.files[0]) importPdf(inp.files[0]); inp.remove(); });
  document.body.appendChild(inp); inp.click();
}
async function importPdf(file) {
  const t = S3.toast("Opening " + file.name + "…");
  try {
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf.slice(0), isEvalSupported: false }).promise;
    const b = { id: uid(), title: file.name.replace(/\.pdf$/i, "").slice(0, 80), kind: "pdf", paper: "lined", size: "a4", cover: COVERS[books.length % COVERS.length], created: Date.now(), updated: Date.now(), pages: [] };
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i), vp = pg.getViewport({ scale: 1 });
      b.pages.push({ id: uid(), kind: "pdf", src: i - 1, w: Math.round(vp.width * 100) / 100, h: Math.round(vp.height * 100) / 100, strokes: [] });
    }
    await putPdf(b.id, buf); await putBook(b); t.remove(); openBook(b.id);
  } catch (e) {
    t.remove();
    S3.toast(/password/i.test(e && e.name + e.message) ? "This PDF is password-protected. Remove the password first." : "Couldn't open that PDF", "error");
  }
}

// ---------- editor ----------
let book = null, pdfDoc = null, pdfBytes = null, zoom = 1, tool = "pen", ink = INKS[0], hl = HIGHLIGHTS[0], size = 2.2, penOnly = false;
let undoStack = [], redoStack = [], observer = null, current = 0;
const saveSoon = S3.debounce(() => { if (book) { book.updated = Date.now(); putBook(book).catch(() => S3.toast("Couldn't save. Export your PDF to be safe.", "error")); } }, 600);
function closeEditor() { if (observer) observer.disconnect(); observer = null; book = null; pdfDoc = null; pdfBytes = null; undoStack = []; redoStack = []; }
async function openBook(id) {
  const b = (await allBooks()).find((x) => x.id === id); if (!b) return showLibrary();
  b.pages.forEach((p) => { p.strokes = (p.strokes || []).map(cleanStroke).filter(Boolean); });
  closeEditor(); book = b;
  if (b.kind === "pdf" || b.pages.some((p) => p.kind === "pdf")) {
    pdfBytes = await getPdf(b.id);
    if (pdfBytes) pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0), isEvalSupported: false }).promise;
  }
  $("#pn-library").hidden = true; $("#pn-editor").hidden = false;
  buildEditor();
  window.scrollTo(0, 0);
}
function buildEditor() {
  const v = $("#pn-editor"); v.textContent = "";
  const title = h("input", { "class": "pn-title", type: "text", maxlength: "80", value: book.title, dir: "auto", "aria-label": "Notebook name" });
  title.addEventListener("input", () => { book.title = title.value.slice(0, 80); saveSoon(); });
  const bar = h("div", { "class": "pn-bar" }, [
    btn("Library", () => showLibrary(), "ghost small", "", "Back to the library"),
    h("div", { "class": "seg pn-tools", role: "group", "aria-label": "Tool" }, [["pen", "Pen", "P"], ["hl", "Highlighter", "H"], ["eraser", "Eraser", "E"]].map((t) =>
      h("button", { type: "button", "data-tool": t[0], "aria-pressed": String(tool === t[0]), title: t[1] + " (" + t[2] + ")", onclick: () => setTool(t[0]) }, [t[1]]))),
    h("div", { "class": "pn-swatches", id: "pn-swatches", role: "group", "aria-label": "Colour" }),
    h("label", { "class": "pn-size" }, [h("span", { "class": "faint", text: "Size" }), sizeInput()]),
    btn("↶", undo, "ghost icon small", "", "Undo (Ctrl+Z)"), btn("↷", redo, "ghost icon small", "", "Redo (Ctrl+Shift+Z)"),
    btn("−", () => setZoom(zoom / 1.2), "ghost icon small", "", "Zoom out"), btn("+", () => setZoom(zoom * 1.2), "ghost icon small", "", "Zoom in"),
    btn("Fit", () => setZoom(fitZoom()), "ghost small", "", "Fit width"),
    btn("Page", addPage, "small", "plus", "Add a page after this one"),
    btn("Export PDF", exportPdf, "primary small", "download")
  ]);
  v.appendChild(h("div", { "class": "pn-top" }, [title, h("span", { "class": "faint", id: "pn-pos" })]));
  v.appendChild(bar);
  const pages = h("div", { "class": "pn-pages", id: "pn-pages" });
  v.appendChild(pages);
  swatches();
  zoom = fitZoom();
  drawPages();
}
function sizeInput() {
  const r = h("input", { type: "range", min: "0.6", max: "12", step: "0.2", value: String(size), "aria-label": "Line size" });
  r.addEventListener("input", () => { size = +r.value; });
  return r;
}
function swatches() {
  const box = $("#pn-swatches"); if (!box) return; box.textContent = "";
  const list = tool === "hl" ? HIGHLIGHTS : INKS, cur = tool === "hl" ? hl : ink;
  if (tool === "eraser") { box.appendChild(h("span", { "class": "faint", text: "Touch a line to erase it" })); return; }
  list.forEach((c) => box.appendChild(h("button", { type: "button", "class": "pn-sw", style: "background:" + c, "aria-label": "Colour " + c, "aria-pressed": String(c === cur), onclick: () => { if (tool === "hl") hl = c; else ink = c; swatches(); } })));
}
function setTool(t) { tool = t; document.querySelectorAll(".pn-tools button").forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-tool") === t))); swatches(); $("#pn-pages").setAttribute("data-tool", t); }
function fitZoom() { const avail = Math.min(window.innerWidth, ($("#pn-editor").clientWidth || window.innerWidth)) - 24, maxW = Math.max(...book.pages.map((p) => p.w)); return Math.max(.3, Math.min(1.5, avail / maxW)); }
function setZoom(z) {
  const box = $("#pn-pages"), anchor = current;
  zoom = Math.max(.3, Math.min(4, z)); drawPages();
  const el = box.children[anchor]; if (el) el.scrollIntoView({ block: "start" });
}
function drawPages() {
  const box = $("#pn-pages"); box.textContent = "";
  if (observer) observer.disconnect();
  observer = new IntersectionObserver((entries) => entries.forEach((en) => {
    const i = +en.target.getAttribute("data-i");
    if (en.isIntersecting) { renderPage(i); if (en.intersectionRatio > .3) { current = i; pos(); } }
  }), { rootMargin: "400px 0px", threshold: [0, .3] });
  book.pages.forEach((p, i) => {
    const wrap = h("div", { "class": "pn-page", "data-i": String(i), style: "width:" + Math.round(p.w * zoom) + "px;height:" + Math.round(p.h * zoom) + "px" });
    const bg = h("canvas", { "class": "pn-bg", "aria-hidden": "true" }), inkC = h("canvas", { "class": "pn-ink", "aria-label": "Page " + (i + 1) + " of " + book.pages.length });
    wrap.appendChild(bg); wrap.appendChild(inkC);
    wrap.appendChild(h("div", { "class": "pn-pagebar" }, [h("span", { text: (i + 1) + " / " + book.pages.length }), btn("", () => deletePage(i), "ghost icon small pn-del", "trash", "Delete page " + (i + 1))]));
    attachInput(inkC, i);
    box.appendChild(wrap); observer.observe(wrap);
  });
  pos();
}
function pos() { const el = $("#pn-pos"); if (el && book) el.textContent = "Page " + (current + 1) + " of " + book.pages.length; }
const rendered = new WeakMap();
async function renderPage(i) {
  const wrap = $("#pn-pages").children[i]; if (!wrap) return;
  const key = zoom.toFixed(3); if (rendered.get(wrap) === key) return; rendered.set(wrap, key);
  const p = book.pages[i], dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(p.w * zoom * dpr), H = Math.round(p.h * zoom * dpr);
  const bg = wrap.querySelector(".pn-bg"), inkC = wrap.querySelector(".pn-ink");
  [bg, inkC].forEach((c) => { c.width = W; c.height = H; });
  const x = bg.getContext("2d");
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
  if (p.kind === "pdf" && pdfDoc) {
    try {
      const pg = await pdfDoc.getPage(p.src + 1), vp = pg.getViewport({ scale: zoom * dpr });
      await pg.render({ canvasContext: x, viewport: vp }).promise;
    } catch (e) { /* a page that fails to render stays white */ }
  } else drawPaper(x, p.paper || "plain", W, H, zoom * dpr);
  redrawInk(i);
}
function drawPaper(x, paper, W, H, k) {
  x.save(); x.strokeStyle = "#c9d6e6"; x.fillStyle = "#b9c4d2"; x.lineWidth = Math.max(1, .6 * k);
  const step = 24 * k;
  if (paper === "lined") { for (let y = 72 * k; y < H - 20 * k; y += step) { x.beginPath(); x.moveTo(36 * k, y); x.lineTo(W - 36 * k, y); x.stroke(); } x.strokeStyle = "#f2b6b6"; x.beginPath(); x.moveTo(64 * k, 0); x.lineTo(64 * k, H); x.stroke(); }
  if (paper === "grid") { x.strokeStyle = "#dbe4ef"; for (let gx = step / 2; gx < W; gx += step) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, H); x.stroke(); } for (let gy = step / 2; gy < H; gy += step) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); } }
  if (paper === "dots") for (let gx = step; gx < W; gx += step) for (let gy = step; gy < H; gy += step) { x.beginPath(); x.arc(gx, gy, Math.max(1, .9 * k), 0, 6.283); x.fill(); }
  x.restore();
}
function drawStroke(x, s, k) {
  const pts = s.pts; if (pts.length < 3) return;
  x.save();
  x.lineCap = "round"; x.lineJoin = "round"; x.strokeStyle = s.color;
  if (s.tool === "hl") { x.globalAlpha = .38; x.lineWidth = s.size * 5 * k; x.beginPath(); x.moveTo(pts[0] * k, pts[1] * k); for (let j = 3; j < pts.length; j += 3) x.lineTo(pts[j] * k, pts[j + 1] * k); x.stroke(); x.restore(); return; }
  if (pts.length === 3) { x.fillStyle = s.color; x.beginPath(); x.arc(pts[0] * k, pts[1] * k, s.size * k * .6, 0, 6.283); x.fill(); x.restore(); return; }
  // pressure-sensitive pen: short segments, each with its own width, smoothed through midpoints
  for (let j = 3; j < pts.length; j += 3) {
    const x0 = pts[j - 3], y0 = pts[j - 2], x1 = pts[j], y1 = pts[j + 1], pr = (pts[j - 1] + pts[j + 2]) / 2;
    x.lineWidth = Math.max(.4, s.size * (.35 + pr * 1.3)) * k;
    x.beginPath();
    if (j >= 6) { const mx = (pts[j - 6] + x0) / 2, my = (pts[j - 5] + y0) / 2; x.moveTo(mx * k, my * k); x.quadraticCurveTo(x0 * k, y0 * k, (x0 + x1) / 2 * k, (y0 + y1) / 2 * k); }
    else { x.moveTo(x0 * k, y0 * k); x.lineTo((x0 + x1) / 2 * k, (y0 + y1) / 2 * k); }
    x.stroke();
  }
  x.lineWidth = Math.max(.4, s.size * (.35 + pts[pts.length - 1] * 1.3)) * k;
  x.beginPath(); x.moveTo((pts[pts.length - 6] + pts[pts.length - 3]) / 2 * k, (pts[pts.length - 5] + pts[pts.length - 2]) / 2 * k); x.lineTo(pts[pts.length - 3] * k, pts[pts.length - 2] * k); x.stroke();
  x.restore();
}
function redrawInk(i) {
  const wrap = $("#pn-pages").children[i]; if (!wrap) return;
  const c = wrap.querySelector(".pn-ink"), x = c.getContext("2d"), k = c.width / book.pages[i].w;
  x.clearRect(0, 0, c.width, c.height);
  book.pages[i].strokes.forEach((s) => drawStroke(x, s, k));
}
function attachInput(c, i) {
  let live = null;
  function pt(e) { const r = c.getBoundingClientRect(), p = book.pages[i]; return [(e.clientX - r.left) / r.width * p.w, (e.clientY - r.top) / r.height * p.h, e.pointerType === "pen" ? (e.pressure || .5) : .5]; }
  c.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || (penOnly && e.pointerType === "touch")) return;
    e.preventDefault(); c.setPointerCapture(e.pointerId); current = i; pos();
    if (tool === "eraser") { live = { erase: [], page: i }; eraseAt(i, pt(e), live); return; }
    const p = pt(e);
    live = { page: i, s: { tool: tool === "hl" ? "hl" : "pen", color: tool === "hl" ? hl : ink, size, pts: [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(p[2] * 100) / 100] } };
    const x = c.getContext("2d"), k = c.width / book.pages[i].w; drawStroke(x, live.s, k);
  });
  c.addEventListener("pointermove", (e) => {
    if (!live) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (live.erase) { (evs.length ? evs : [e]).forEach((ev) => eraseAt(i, pt(ev), live)); return; }
    (evs.length ? evs : [e]).forEach((ev) => { const p = pt(ev), a = live.s.pts, n = a.length; if (Math.hypot(p[0] - a[n - 3], p[1] - a[n - 2]) < .4) return; a.push(Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(p[2] * 100) / 100); });
    // draw only the newest segment for speed; the full stroke is redrawn on release
    const x = c.getContext("2d"), k = c.width / book.pages[i].w, a = live.s.pts, n = a.length;
    if (n >= 6) { const seg = { tool: live.s.tool, color: live.s.color, size: live.s.size, pts: a.slice(Math.max(0, n - 9)) }; if (live.s.tool === "hl") { redrawInk(i); drawStroke(x, live.s, k); } else drawStroke(x, seg, k); }
  });
  const end = () => {
    if (!live) return;
    if (live.erase) { if (live.erase.length) { undoStack.push({ type: "erase", page: i, items: live.erase }); redoStack = []; saveSoon(); } }
    else { book.pages[i].strokes.push(live.s); undoStack.push({ type: "add", page: i, s: live.s }); redoStack = []; redrawInk(i); saveSoon(); }
    live = null;
  };
  c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
}
// is the point within w of any segment of the stroke?
function hits(a, px, py, w) {
  if (a.length === 3) return Math.hypot(a[0] - px, a[1] - py) < w;
  for (let q = 3; q < a.length; q += 3) {
    const x0 = a[q - 3], y0 = a[q - 2], dx = a[q] - x0, dy = a[q + 1] - y0, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L)) : 0;
    if (Math.hypot(x0 + dx * t - px, y0 + dy * t - py) < w) return true;
  }
  return false;
}
function eraseAt(i, p, live) {
  const list = book.pages[i].strokes, r = Math.max(6, size * 3);
  for (let j = list.length - 1; j >= 0; j--) {
    const s = list[j], a = s.pts, w = (s.tool === "hl" ? s.size * 2.5 : s.size) + r;
    if (hits(a, p[0], p[1], w)) { live.erase.push({ s, at: j }); list.splice(j, 1); redrawInk(i); }
  }
}
function undo() {
  const op = undoStack.pop(); if (!op) return;
  if (op.type === "add") { const l = book.pages[op.page].strokes, k = l.lastIndexOf(op.s); if (k >= 0) l.splice(k, 1); redrawInk(op.page); }
  else if (op.type === "erase") { const l = book.pages[op.page].strokes; op.items.slice().reverse().forEach((it) => l.splice(Math.min(it.at, l.length), 0, it.s)); redrawInk(op.page); }
  else if (op.type === "addpage") { book.pages.splice(op.at, 1); drawPages(); }
  else if (op.type === "delpage") { book.pages.splice(op.at, 0, op.page); drawPages(); }
  redoStack.push(op); saveSoon();
}
function redo() {
  const op = redoStack.pop(); if (!op) return;
  if (op.type === "add") { book.pages[op.page].strokes.push(op.s); redrawInk(op.page); }
  else if (op.type === "erase") { const l = book.pages[op.page].strokes; op.items.forEach((it) => { const k = l.indexOf(it.s); if (k >= 0) l.splice(k, 1); }); redrawInk(op.page); }
  else if (op.type === "addpage") { book.pages.splice(op.at, 0, op.page); drawPages(); }
  else if (op.type === "delpage") { book.pages.splice(op.at, 1); drawPages(); }
  undoStack.push(op); saveSoon();
}
function addPage() {
  const ref = book.pages[current] || book.pages[book.pages.length - 1] || { w: 595.28, h: 841.89 };
  const paper = ref.kind === "paper" ? ref.paper : (book.paper || "lined");
  const pg = { id: uid(), kind: "paper", paper, w: ref.w, h: ref.h, strokes: [] }, at = current + 1;
  book.pages.splice(at, 0, pg); undoStack.push({ type: "addpage", at, page: pg }); redoStack = []; saveSoon();
  drawPages(); const el = $("#pn-pages").children[at]; if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
  S3.toast("Page added");
}
function deletePage(i) {
  if (book.pages.length < 2) return S3.toast("A notebook needs at least one page", "error");
  const pg = book.pages.splice(i, 1)[0]; undoStack.push({ type: "delpage", at: i, page: pg }); redoStack = []; saveSoon(); drawPages();
  const t = S3.toast("Page deleted "); t.appendChild(h("button", { "class": "btn small", type: "button", onclick: () => { undo(); t.remove(); } }, ["Undo"]));
}

// ---------- export ----------
function hexRgb(c) { return PL.rgb(parseInt(c.substr(1, 2), 16) / 255, parseInt(c.substr(3, 2), 16) / 255, parseInt(c.substr(5, 2), 16) / 255); }
// Strokes are kept in the page as shown (rotation applied, origin top-left). PDF drawing happens in the unrotated
// page space with the origin bottom-left, so each point is mapped back through the page's rotation and crop box.
function mapper(rot, box) {
  const pw = box.width, ph = box.height, ox = box.x, oy = box.y;
  return (x, y) => {
    let u, v;
    if (rot === 90) { u = y; v = x; } else if (rot === 180) { u = pw - x; v = y; } else if (rot === 270) { u = pw - y; v = ph - x; } else { u = x; v = ph - y; }
    return [u + ox, v + oy];
  };
}
function strokePath(s, map) {
  const a = s.pts, out = [];
  for (let j = 0; j < a.length; j += 3) { const p = map(a[j], a[j + 1]); out.push((j ? "L" : "M") + p[0].toFixed(2) + " " + (-p[1]).toFixed(2)); }
  if (a.length === 3) { const p = map(a[0] + .2, a[1]); out.push("L" + p[0].toFixed(2) + " " + (-p[1]).toFixed(2)); }
  return out.join(" ");
}
function drawStrokes(page, strokes, map) {
  strokes.forEach((s) => {
    const avgP = s.tool === "hl" ? 0 : s.pts.reduce((m, v, k) => k % 3 === 2 ? m + v : m, 0) / (s.pts.length / 3);
    page.drawSvgPath(strokePath(s, map), { x: 0, y: 0, borderColor: hexRgb(s.color), borderWidth: s.tool === "hl" ? s.size * 5 : Math.max(.4, s.size * (.35 + avgP * 1.3)),
      borderOpacity: s.tool === "hl" ? .38 : 1, borderLineCap: PL.LineCapStyle.Round });
  });
}
function paperVectors(page, paper, w, hh) {
  const c = PL.rgb(.79, .84, .9), step = 24;
  if (paper === "lined") { for (let y = 72; y < hh - 20; y += step) page.drawLine({ start: { x: 36, y: hh - y }, end: { x: w - 36, y: hh - y }, thickness: .6, color: c }); page.drawLine({ start: { x: 64, y: 0 }, end: { x: 64, y: hh }, thickness: .6, color: PL.rgb(.95, .71, .71) }); }
  if (paper === "grid") { const g = PL.rgb(.86, .89, .94); for (let x = step / 2; x < w; x += step) page.drawLine({ start: { x, y: 0 }, end: { x, y: hh }, thickness: .6, color: g }); for (let y = step / 2; y < hh; y += step) page.drawLine({ start: { x: 0, y: hh - y }, end: { x: w, y: hh - y }, thickness: .6, color: g }); }
  if (paper === "dots") { const d = PL.rgb(.73, .77, .82); for (let x = step; x < w; x += step) for (let y = step; y < hh; y += step) page.drawCircle({ x, y: hh - y, size: .9, color: d }); }
}
async function buildPdf(b, bytes) {
  const out = await PL.PDFDocument.create();
  let src = null;
  if (bytes && b.pages.some((p) => p.kind === "pdf")) src = await PL.PDFDocument.load(bytes, { ignoreEncryption: true });
  for (const p of b.pages) {
    if (p.kind === "pdf" && src) {
      const [cp] = await out.copyPages(src, [p.src]); const page = out.addPage(cp);
      const rot = ((page.getRotation().angle % 360) + 360) % 360, box = page.getCropBox();
      drawStrokes(page, p.strokes, mapper(rot, box));
    } else {
      const page = out.addPage([p.w, p.h]);
      paperVectors(page, p.paper || "plain", p.w, p.h);
      drawStrokes(page, p.strokes, mapper(0, { x: 0, y: 0, width: p.w, height: p.h }));
    }
  }
  out.setTitle(b.title || "Notes"); out.setProducer("S3eidat Tools PDF Notes"); out.setCreator("S3eidat Tools PDF Notes");
  return out.save();
}
async function exportPdf() {
  const t = S3.toast("Making the PDF…");
  try {
    const bytes = await buildPdf(book, pdfBytes);
    S3.download(new Blob([bytes], { type: "application/pdf" }), fileBase(book.title) + "-notes.pdf"); S3.done();
  } catch (e) { S3.toast("Couldn't make the PDF", "error"); }
  t.remove();
}

// ---------- keyboard ----------
document.addEventListener("keydown", (e) => {
  if (!book || $(".s3-modal")) return;
  const tag = e.target && e.target.tagName; if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "z" || e.key === "Z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (e.key === "y" || e.key === "Y") { e.preventDefault(); redo(); }
    return;
  }
  const k = e.key.toLowerCase();
  if (k === "p") setTool("pen"); else if (k === "h") setTool("hl"); else if (k === "e") setTool("eraser");
  else if (k === "+" || k === "=") setZoom(zoom * 1.2); else if (k === "-") setZoom(zoom / 1.2);
});
window.addEventListener("resize", S3.debounce(() => { if (book) { const z = fitZoom(); if (Math.abs(z - zoom) / zoom > .15) setZoom(z); } }, 300));

window.PN = { buildPdf, mapper, cleanStroke, state: () => ({ book, zoom, tool }) };
showLibrary();
