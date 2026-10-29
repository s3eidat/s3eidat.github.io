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
    h("div", { "class": "row" }, [btn("New notebook", newDialog, "primary", "plus"), btn("Open a PDF", pickPdf, "", "upload"), btn("Open notebook file", pickNotes, "ghost", "file", "Open a .pdfnotes file saved from PDF Notes")])]));
  const drop = h("label", { "class": "drop pn-drop" }, [h("input", { type: "file", hidden: true }), icon("upload"), h("b", { text: "Drop a PDF here to write on it" }), h("span", { text: "Lecture slides, worksheets, forms. It stays on your device." })]);
  S3.drop(drop, (files) => /\.pdfnotes$/i.test(files[0].name) ? importNotes(files[0]) : importPdf(files[0]), { accept: ".pdf,application/pdf,.pdfnotes", multiple: false });
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
function pickNotes() {
  const inp = h("input", { type: "file", accept: ".pdfnotes,application/json", hidden: true });
  inp.addEventListener("change", () => { if (inp.files[0]) importNotes(inp.files[0]); inp.remove(); });
  document.body.appendChild(inp); inp.click();
}
// ---------- notebook file (.pdfnotes: JSON with the strokes and, for PDFs, the original file as base64) ----------
function b64(bytes) {
  const u = new Uint8Array(bytes); let out = "";
  for (let i = 0; i < u.length; i += 0x8000) out += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(out);
}
function unb64(str) { const bin = atob(str), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
function cleanBook(raw) {
  if (!raw || !Array.isArray(raw.pages) || !raw.pages.length) return null;
  const num = (v, d) => { v = +v; return isFinite(v) && v >= 30 && v <= 5000 ? v : d; };
  const pages = raw.pages.slice(0, 2000).map((p) => {
    const pg = { id: uid(), kind: p && p.kind === "pdf" ? "pdf" : "paper", w: num(p && p.w, 595.28), h: num(p && p.h, 841.89), strokes: ((p && p.strokes) || []).map(cleanStroke).filter(Boolean) };
    if (pg.kind === "pdf") pg.src = Math.max(0, Math.floor(+p.src || 0)); else pg.paper = PAPERS.some((x) => x[0] === p.paper) ? p.paper : "plain";
    return pg;
  });
  return { id: uid(), title: String(raw.title || "Notebook").slice(0, 80), kind: raw.kind === "pdf" ? "pdf" : "paper", paper: PAPERS.some((x) => x[0] === raw.paper) ? raw.paper : "lined",
    size: raw.size === "letter" ? "letter" : "a4", cover: COVERS.indexOf(raw.cover) >= 0 ? raw.cover : COVERS[0], created: Date.now(), updated: Date.now(), pages };
}
async function importNotes(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || data.app !== "s3-pdf-notes") throw new Error("not ours");
    const b = cleanBook(data.book); if (!b) throw new Error("empty");
    let buf = null;
    if (b.pages.some((p) => p.kind === "pdf")) {
      if (typeof data.pdf !== "string") throw new Error("pdf missing");
      buf = unb64(data.pdf);
      const doc = await pdfjsLib.getDocument({ data: buf.slice(0), isEvalSupported: false }).promise;
      b.pages = b.pages.filter((p) => p.kind !== "pdf" || p.src < doc.numPages);
      await putPdf(b.id, buf);
    }
    await putBook(b); openBook(b.id); S3.toast("Opened " + b.title);
  } catch (e) { S3.toast("That isn't a PDF Notes file", "error"); }
}
async function saveNotes() {
  const t = S3.toast("Saving the notebook file…");
  try {
    const data = { app: "s3-pdf-notes", v: 1, book: { title: book.title, kind: book.kind, paper: book.paper, size: book.size, cover: book.cover, pages: book.pages.map((p) => Object.assign({}, p)) }, pdf: pdfBytes ? b64(pdfBytes) : null };
    S3.download(new Blob([JSON.stringify(data)], { type: "application/json" }), fileBase(book.title) + ".pdfnotes"); S3.done();
  } catch (e) { S3.toast("Couldn't save the file", "error"); }
  t.remove();
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
let undoStack = [], redoStack = [], observer = null, current = 0, sel = null;
penOnly = S3.store("pn-pen-only") === true;
const saveSoon = S3.debounce(() => { if (book) { book.updated = Date.now(); putBook(book).catch(() => S3.toast("Couldn't save. Export your PDF to be safe.", "error")); } }, 600);
function closeEditor() { if (observer) observer.disconnect(); observer = null; book = null; sel = null; pdfDoc = null; pdfBytes = null; undoStack = []; redoStack = []; }
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
    h("div", { "class": "seg pn-tools", role: "group", "aria-label": "Tool" }, [["pen", "Pen", "P"], ["hl", "Highlighter", "H"], ["eraser", "Eraser", "E"], ["lasso", "Select", "L"]].map((t) =>
      h("button", { type: "button", "data-tool": t[0], "aria-pressed": String(tool === t[0]), title: t[1] + " (" + t[2] + ")", onclick: () => setTool(t[0]) }, [t[1]]))),
    h("div", { "class": "pn-swatches", id: "pn-swatches", role: "group", "aria-label": "Colour" }),
    h("label", { "class": "pn-size" }, [h("span", { "class": "faint", text: "Size" }), sizeInput()]),
    btn("↶", undo, "ghost icon small", "", "Undo (Ctrl+Z)"), btn("↷", redo, "ghost icon small", "", "Redo (Ctrl+Shift+Z)"),
    btn("−", () => setZoom(zoom / 1.2), "ghost icon small", "", "Zoom out"), btn("+", () => setZoom(zoom * 1.2), "ghost icon small", "", "Zoom in"),
    btn("Fit", () => setZoom(fitZoom()), "ghost small", "", "Fit width (0)"),
    btn("Pages", pagesSheet, "ghost small", "grid", "All pages (G)"),
    btn("Page", addPage, "small", "plus", "Add a page after this one"),
    moreMenu(),
    btn("Export PDF", exportPdf, "primary small", "download")
  ]);
  v.appendChild(h("div", { "class": "pn-top" }, [title, h("span", { "class": "faint", id: "pn-pos" })]));
  v.appendChild(bar);
  const pages = h("div", { "class": "pn-pages" + (penOnly ? " pen-only" : ""), id: "pn-pages", "data-tool": tool });
  v.appendChild(pages);
  swatches();
  zoom = fitZoom();
  drawPages();
}
function moreMenu() {
  const menu = h("details", { "class": "pn-menu" }, [h("summary", { "class": "btn ghost small", title: "More" }, ["More"])]);
  const list = h("div", { "class": "pn-menu-list", role: "menu" });
  const pen = h("button", { type: "button", role: "menuitemcheckbox", "aria-checked": String(penOnly), onclick: () => { menu.open = false; setPenOnly(!penOnly, true); } }, ["Draw with a stylus only (fingers scroll)"]);
  [["Save this page as PNG", () => pagePng(current)], ["Save notebook file (.pdfnotes)", saveNotes], null, pen, null, ["Keyboard shortcuts and help", help]].forEach((it) => {
    if (!it) return list.appendChild(h("hr"));
    if (it.nodeType) return list.appendChild(it);
    list.appendChild(h("button", { type: "button", role: "menuitem", onclick: () => { menu.open = false; it[1](); } }, [it[0]]));
  });
  menu.appendChild(list);
  menu.addEventListener("toggle", () => { if (!menu.open) return; pen.setAttribute("aria-checked", String(penOnly)); list.style.left = ""; list.style.right = ""; if (list.getBoundingClientRect().left < 8) { list.style.left = "0"; list.style.right = "auto"; } });
  document.addEventListener("click", (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  return menu;
}
function setPenOnly(on, user) {
  penOnly = on; if (user !== false) S3.store("pn-pen-only", on);
  const box = $("#pn-pages"); if (box) box.classList.toggle("pen-only", on);
  S3.toast(user === false ? "Stylus found: now only the stylus draws and fingers scroll. Change it in More." : on ? "Stylus only: fingers scroll the pages" : "Fingers draw again");
}
function help() {
  const m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Help" });
  const keys = [["P", "Pen"], ["H", "Highlighter"], ["E", "Eraser (touch a line to remove it)"], ["L", "Select: draw round lines, then drag them or press Delete"], ["Ctrl+Z / Ctrl+Y", "Undo / redo"], ["+ / − / 0", "Zoom in / out / fit width"], ["G", "All pages"], ["Esc", "Clear the selection"], ["?", "This help"]];
  const sheet = h("div", { "class": "s3-sheet" }, [h("div", { "class": "row between" }, [h("h2", { text: "Shortcuts and tips" }), btn("", close, "ghost icon", "x", "Close")]),
    h("dl", { "class": "pn-keys" }, keys.reduce((a, k) => a.concat([h("dt", {}, [h("kbd", { text: k[0] })]), h("dd", { text: k[1] })]), [])),
    h("ul", { "class": "pn-tips" }, ["On a tablet with a stylus, turn on More → Draw with a stylus only, so your hand and fingers scroll instead of drawing. It turns on by itself the first time you use a stylus.",
      "Pressure from an Apple Pencil, Surface Pen or Wacom pen changes the line width.",
      "Your notebooks are saved in this browser. Save a notebook file (More menu) to back it up or move it to another device.",
      "Export PDF keeps the original PDF pages and adds your writing as sharp vector lines."].map((t) => h("li", { text: t })))]);
  m.appendChild(sheet);
  function close() { m.remove(); document.removeEventListener("keydown", onKey); }
  function onKey(e) { if (e.key === "Escape") close(); }
  m.addEventListener("click", (e) => { if (e.target === m) close(); });
  document.addEventListener("keydown", onKey); document.body.appendChild(m);
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
  if (tool === "lasso") {
    if (!sel) { box.appendChild(h("span", { "class": "faint", text: "Draw round lines to select them" })); return; }
    box.appendChild(h("span", { "class": "faint", text: sel.items.length + " selected" }));
    INKS.forEach((c) => box.appendChild(h("button", { type: "button", "class": "pn-sw", style: "background:" + c, "aria-label": "Recolour to " + c, onclick: () => recolour(c) })));
    box.appendChild(btn("", deleteSel, "ghost icon small pn-del", "trash", "Delete selection (Delete)"));
    return;
  }
  list.forEach((c) => box.appendChild(h("button", { type: "button", "class": "pn-sw", style: "background:" + c, "aria-label": "Colour " + c, "aria-pressed": String(c === cur), onclick: () => { if (tool === "hl") hl = c; else ink = c; swatches(); } })));
}
function setTool(t) { if (t !== "lasso") clearSel(); tool = t; document.querySelectorAll(".pn-tools button").forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-tool") === t))); swatches(); $("#pn-pages").setAttribute("data-tool", t); }
function fitZoom() { const avail = Math.min(window.innerWidth, ($("#pn-editor").clientWidth || window.innerWidth)) - 24, maxW = Math.max(...book.pages.map((p) => p.w)); return Math.max(.3, Math.min(1.5, avail / maxW)); }
function setZoom(z) {
  const box = $("#pn-pages"), anchor = current;
  zoom = Math.max(.3, Math.min(4, z)); drawPages();
  const el = box.children[anchor]; if (el) el.scrollIntoView({ block: "start" });
}
function drawPages() {
  const box = $("#pn-pages"); box.textContent = "";
  if (observer) observer.disconnect();
  sel = null; swatches();
  observer = new IntersectionObserver((entries) => entries.forEach((en) => {
    const i = +en.target.getAttribute("data-i");
    if (en.isIntersecting) { renderPage(i); if (en.intersectionRatio > .3) { current = i; pos(); } }
  }), { rootMargin: "400px 0px", threshold: [0, .3] });
  book.pages.forEach((p, i) => {
    const wrap = h("div", { "class": "pn-page", "data-i": String(i), style: "width:" + Math.round(p.w * zoom) + "px;height:" + Math.round(p.h * zoom) + "px" });
    const bg = h("canvas", { "class": "pn-bg", "aria-hidden": "true" }), inkC = h("canvas", { "class": "pn-ink", "aria-label": "Page " + (i + 1) + " of " + book.pages.length });
    wrap.appendChild(bg); wrap.appendChild(inkC);
    const bar = h("div", { "class": "pn-pagebar" }, [h("span", { text: (i + 1) + " / " + book.pages.length })]);
    if (p.kind === "paper") {
      const ps = h("select", { "class": "pn-paper", "aria-label": "Paper of page " + (i + 1) }, PAPERS.map((x) => h("option", { value: x[0], text: x[1] })));
      ps.value = p.paper || "plain"; ps.addEventListener("change", () => setPaper(i, ps.value, true));
      bar.appendChild(ps);
    }
    bar.appendChild(btn("", () => pagePng(i), "ghost icon small", "image", "Save page " + (i + 1) + " as PNG"));
    bar.appendChild(btn("", () => deletePage(i), "ghost icon small pn-del", "trash", "Delete page " + (i + 1)));
    wrap.appendChild(bar);
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
  if (s.tool === "hl") { x.globalAlpha = .38; x.globalCompositeOperation = "multiply"; x.lineWidth = s.size * 5 * k; x.beginPath(); x.moveTo(pts[0] * k, pts[1] * k); for (let j = 3; j < pts.length; j += 3) x.lineTo(pts[j] * k, pts[j + 1] * k); x.stroke(); x.restore(); return; }
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
  if (sel && sel.page === i) {
    const b = selBox(); x.save(); x.setLineDash([6, 4]); x.strokeStyle = "#2f6fdb"; x.lineWidth = 1.5; x.fillStyle = "rgba(47,111,219,.06)";
    x.fillRect(b[0] * k, b[1] * k, (b[2] - b[0]) * k, (b[3] - b[1]) * k); x.strokeRect(b[0] * k, b[1] * k, (b[2] - b[0]) * k, (b[3] - b[1]) * k); x.restore();
  }
}
// ---------- selection (lasso) ----------
function selBox() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  sel.items.forEach((s) => { const pad = (s.tool === "hl" ? s.size * 2.5 : s.size) + 4; for (let j = 0; j < s.pts.length; j += 3) { x0 = Math.min(x0, s.pts[j] - pad); y0 = Math.min(y0, s.pts[j + 1] - pad); x1 = Math.max(x1, s.pts[j] + pad); y1 = Math.max(y1, s.pts[j + 1] + pad); } });
  return [x0, y0, x1, y1];
}
function inPoly(poly, px, py) {
  let inside = false;
  for (let a = 0, b = poly.length - 2; a < poly.length; b = a, a += 2) {
    const xa = poly[a], ya = poly[a + 1], xb = poly[b], yb = poly[b + 1];
    if ((ya > py) !== (yb > py) && px < (xb - xa) * (py - ya) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
}
// strokes with at least half their points inside the lasso
function lassoPick(strokes, poly) {
  return strokes.filter((s) => { let n = 0; for (let j = 0; j < s.pts.length; j += 3) if (inPoly(poly, s.pts[j], s.pts[j + 1])) n++; return n * 2 >= s.pts.length / 3; });
}
function clearSel() { if (!sel) return; const pg = sel.page; sel = null; if (book) { redrawInk(pg); swatches(); } }
function shift(items, dx, dy) { items.forEach((s) => { for (let j = 0; j < s.pts.length; j += 3) { s.pts[j] = Math.round((s.pts[j] + dx) * 10) / 10; s.pts[j + 1] = Math.round((s.pts[j + 1] + dy) * 10) / 10; } }); }
function deleteSel() {
  if (!sel) return;
  const list = book.pages[sel.page].strokes, items = [];
  for (let j = list.length - 1; j >= 0; j--) if (sel.items.indexOf(list[j]) >= 0) { items.push({ s: list[j], at: j }); list.splice(j, 1); }
  const pg = sel.page; sel = null; undoStack.push({ type: "erase", page: pg, items }); redoStack = []; saveSoon(); redrawInk(pg); swatches();
}
function recolour(c) {
  if (!sel) return;
  const items = sel.items.filter((s) => s.tool === "pen"); if (!items.length) return;
  const from = items.map((s) => s.color); items.forEach((s) => { s.color = c; });
  undoStack.push({ type: "colour", page: sel.page, items, from, to: c }); redoStack = []; saveSoon(); redrawInk(sel.page);
}
function attachInput(c, i) {
  let live = null;
  function pt(e) { const r = c.getBoundingClientRect(), p = book.pages[i]; return [(e.clientX - r.left) / r.width * p.w, (e.clientY - r.top) / r.height * p.h, e.pointerType === "pen" ? (e.pressure || .5) : .5]; }
  c.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || (penOnly && e.pointerType === "touch")) return;
    if (e.pointerType === "pen" && !penOnly && S3.store("pn-pen-only") === undefined) { S3.store("pn-pen-only", true); setPenOnly(true, false); }
    e.preventDefault(); c.setPointerCapture(e.pointerId); current = i; pos();
    if (tool === "lasso") {
      const p = pt(e);
      if (sel && sel.page === i) { const b = selBox(); if (p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]) { live = { move: true, start: p, dx: 0, dy: 0 }; return; } }
      clearSel(); live = { lasso: [p[0], p[1]] }; return;
    }
    if (tool === "eraser") { live = { erase: [], page: i }; eraseAt(i, pt(e), live); return; }
    const p = pt(e);
    live = { page: i, s: { tool: tool === "hl" ? "hl" : "pen", color: tool === "hl" ? hl : ink, size, pts: [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(p[2] * 100) / 100] } };
    const x = c.getContext("2d"), k = c.width / book.pages[i].w; drawStroke(x, live.s, k);
  });
  c.addEventListener("pointermove", (e) => {
    if (!live) return;
    if (live.lasso) {
      const p = pt(e), L = live.lasso; if (Math.hypot(p[0] - L[L.length - 2], p[1] - L[L.length - 1]) < 2) return;
      L.push(p[0], p[1]); redrawInk(i);
      const x = c.getContext("2d"), k = c.width / book.pages[i].w;
      x.save(); x.setLineDash([5, 4]); x.strokeStyle = "#2f6fdb"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(L[0] * k, L[1] * k);
      for (let j = 2; j < L.length; j += 2) x.lineTo(L[j] * k, L[j + 1] * k); x.closePath(); x.stroke(); x.restore();
      return;
    }
    if (live.move) {
      const p = pt(e), dx = Math.round((p[0] - live.start[0]) * 10) / 10, dy = Math.round((p[1] - live.start[1]) * 10) / 10;
      shift(sel.items, dx - live.dx, dy - live.dy); live.dx = dx; live.dy = dy; redrawInk(i); return;
    }
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (live.erase) { (evs.length ? evs : [e]).forEach((ev) => eraseAt(i, pt(ev), live)); return; }
    (evs.length ? evs : [e]).forEach((ev) => { const p = pt(ev), a = live.s.pts, n = a.length; if (Math.hypot(p[0] - a[n - 3], p[1] - a[n - 2]) < .4) return; a.push(Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(p[2] * 100) / 100); });
    // draw only the newest segment for speed; the full stroke is redrawn on release
    const x = c.getContext("2d"), k = c.width / book.pages[i].w, a = live.s.pts, n = a.length;
    if (n >= 6) { const seg = { tool: live.s.tool, color: live.s.color, size: live.s.size, pts: a.slice(Math.max(0, n - 9)) }; if (live.s.tool === "hl") { redrawInk(i); drawStroke(x, live.s, k); } else drawStroke(x, seg, k); }
  });
  const end = () => {
    if (!live) return;
    if (live.lasso) { const items = live.lasso.length >= 6 ? lassoPick(book.pages[i].strokes, live.lasso) : []; sel = items.length ? { page: i, items } : null; redrawInk(i); swatches(); }
    else if (live.move) { if (live.dx || live.dy) { undoStack.push({ type: "move", page: i, items: sel.items.slice(), dx: live.dx, dy: live.dy }); redoStack = []; saveSoon(); } }
    else if (live.erase) { if (live.erase.length) { undoStack.push({ type: "erase", page: i, items: live.erase }); redoStack = []; saveSoon(); } }
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
  clearSel();
  if (op.type === "move") { shift(op.items, -op.dx, -op.dy); redrawInk(op.page); }
  else if (op.type === "colour") { op.items.forEach((s, n) => { s.color = op.from[n]; }); redrawInk(op.page); }
  else if (op.type === "paper") setPaper(op.page, op.from);
  else if (op.type === "add") { const l = book.pages[op.page].strokes, k = l.lastIndexOf(op.s); if (k >= 0) l.splice(k, 1); redrawInk(op.page); }
  else if (op.type === "erase") { const l = book.pages[op.page].strokes; op.items.slice().reverse().forEach((it) => l.splice(Math.min(it.at, l.length), 0, it.s)); redrawInk(op.page); }
  else if (op.type === "addpage") { book.pages.splice(op.at, 1); drawPages(); }
  else if (op.type === "delpage") { book.pages.splice(op.at, 0, op.page); drawPages(); }
  redoStack.push(op); saveSoon();
}
function redo() {
  const op = redoStack.pop(); if (!op) return;
  clearSel();
  if (op.type === "move") { shift(op.items, op.dx, op.dy); redrawInk(op.page); }
  else if (op.type === "colour") { op.items.forEach((s) => { s.color = op.to; }); redrawInk(op.page); }
  else if (op.type === "paper") setPaper(op.page, op.to);
  else if (op.type === "add") { book.pages[op.page].strokes.push(op.s); redrawInk(op.page); }
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
function setPaper(i, paper, user) {
  const p = book.pages[i]; if (!p || p.kind !== "paper" || p.paper === paper) return;
  if (user) { undoStack.push({ type: "paper", page: i, from: p.paper, to: paper }); redoStack = []; }
  p.paper = paper; saveSoon();
  const wrap = $("#pn-pages").children[i]; if (!wrap) return;
  const ps = wrap.querySelector(".pn-paper"); if (ps) ps.value = paper;
  rendered.delete(wrap); renderPage(i);
}
// draw a whole page (background and writing) into a new canvas, k pixels per pt
async function pageCanvas(i, k) {
  const p = book.pages[i], c = document.createElement("canvas"); c.width = Math.max(1, Math.round(p.w * k)); c.height = Math.max(1, Math.round(p.h * k));
  const x = c.getContext("2d"); x.fillStyle = "#ffffff"; x.fillRect(0, 0, c.width, c.height);
  if (p.kind === "pdf" && pdfDoc) { try { const pg = await pdfDoc.getPage(p.src + 1); await pg.render({ canvasContext: x, viewport: pg.getViewport({ scale: k }) }).promise; } catch (e) { /* stays white */ } }
  else drawPaper(x, p.paper || "plain", c.width, c.height, k);
  p.strokes.forEach((s) => drawStroke(x, s, k));
  return c;
}
async function pagePng(i) {
  if (!book || !book.pages[i]) return;
  const c = await pageCanvas(i, Math.min(3, 2400 / Math.max(book.pages[i].w, book.pages[i].h)));
  c.toBlob((blob) => { if (!blob) return S3.toast("Couldn't make the picture", "error"); S3.download(blob, fileBase(book.title) + "-page-" + (i + 1) + ".png"); S3.done(); }, "image/png");
}
function goPage(i) { const el = $("#pn-pages").children[i]; if (el) { current = i; pos(); el.scrollIntoView({ block: "start" }); window.scrollBy(0, -120); } }
function pagesSheet() {
  const m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "All pages" });
  const grid = h("div", { "class": "pn-thumbs" });
  const sheet = h("div", { "class": "s3-sheet pn-navsheet" }, [h("div", { "class": "row between" }, [h("h2", { text: "Pages (" + book.pages.length + ")" }), btn("", close, "ghost icon", "x", "Close")]), grid]);
  const io = new IntersectionObserver((en) => en.forEach(async (e) => {
    if (!e.isIntersecting || e.target.getAttribute("data-done")) return; e.target.setAttribute("data-done", "1"); io.unobserve(e.target);
    const i = +e.target.getAttribute("data-i"), c = await pageCanvas(i, 110 / book.pages[i].w); c.setAttribute("aria-hidden", "true");
    e.target.querySelector(".pn-thumb-img").appendChild(c);
  }), { root: sheet, rootMargin: "200px" });
  book.pages.forEach((p, i) => {
    const b = h("button", { type: "button", "class": "pn-thumb" + (i === current ? " on" : ""), "data-i": String(i), "aria-label": "Go to page " + (i + 1), onclick: () => { close(); goPage(i); } },
      [h("span", { "class": "pn-thumb-img", style: "aspect-ratio:" + p.w + "/" + p.h }), h("span", { text: String(i + 1) })]);
    grid.appendChild(b); io.observe(b);
  });
  m.appendChild(sheet);
  function close() { io.disconnect(); m.remove(); document.removeEventListener("keydown", onKey); }
  function onKey(e) { if (e.key === "Escape") close(); }
  m.addEventListener("click", (e) => { if (e.target === m) close(); });
  document.addEventListener("keydown", onKey); document.body.appendChild(m);
  const on = grid.children[current]; if (on) on.scrollIntoView({ block: "nearest" });
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
  if (e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "p") setTool("pen"); else if (k === "h") setTool("hl"); else if (k === "e") setTool("eraser"); else if (k === "l") setTool("lasso");
  else if (k === "+" || k === "=") setZoom(zoom * 1.2); else if (k === "-") setZoom(zoom / 1.2); else if (k === "0") setZoom(fitZoom());
  else if (k === "g") pagesSheet(); else if (e.key === "?") help(); else if (e.key === "Escape") clearSel();
  else if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); deleteSel(); }
});
window.addEventListener("resize", S3.debounce(() => { if (book) { const z = fitZoom(); if (Math.abs(z - zoom) / zoom > .15) setZoom(z); } }, 300));

window.PN = { buildPdf, mapper, cleanStroke, cleanBook, state: () => ({ book, zoom, tool, sel }) };
window.S3_SELFTEST = async function () {
  let ok = true; const expect = (c) => { if (!c) ok = false; };
  try {
    const box = { x: 0, y: 0, width: 600, height: 800 }, near = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
    expect(near(mapper(0, box)(10, 20), [10, 780]));
    expect(near(mapper(90, box)(10, 20), [20, 10]));
    expect(near(mapper(180, box)(10, 20), [590, 20]));
    expect(near(mapper(270, box)(10, 20), [580, 790]));
    expect(near(mapper(0, { x: 5, y: 7, width: 100, height: 100 })(0, 0), [5, 107]));
    expect(cleanStroke({ pts: [1, 2] }) === null);
    const cs = cleanStroke({ tool: "x", color: "red", size: 999, pts: [1.234, 2, .5, 3, 4, .5] });
    expect(cs.tool === "pen" && cs.color === "#1b1f24" && cs.size === 40 && cs.pts[0] === 1.2);
    expect(hits([0, 0, .5, 100, 0, .5], 50, 3, 4) && !hits([0, 0, .5, 100, 0, .5], 50, 9, 4));
    const sq = [0, 0, 10, 0, 10, 10, 0, 10];
    expect(inPoly(sq, 5, 5) && !inPoly(sq, 15, 5));
    expect(lassoPick([{ pts: [2, 2, .5, 8, 8, .5] }, { pts: [20, 20, .5, 30, 30, .5] }], sq).length === 1);
    const bk = cleanBook({ title: "T", pages: [{ kind: "paper", paper: "grid", w: 200, h: 300, strokes: [{ pts: [10, 10, .5, 50, 50, .5] }, { pts: [] }] }, { kind: "weird", paper: "no", w: -1 }] });
    expect(bk.pages.length === 2 && bk.pages[0].strokes.length === 1 && bk.pages[1].paper === "plain" && bk.pages[1].w === 595.28);
    expect(new Uint8Array(unb64(b64(new Uint8Array([0, 1, 254, 255]).buffer)))[2] === 254);
    const bytes = await buildPdf(bk, null), back = await PL.PDFDocument.load(bytes);
    expect(back.getPageCount() === 2 && back.getPage(0).getWidth() === 200);
    expect(fileBase("Ünits: week 1.pdf") === "nits-week-1");
  } catch (e) { ok = false; }
  return ok;
};
showLibrary();
