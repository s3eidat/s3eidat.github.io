# Features: pdf-notes
Libraries: pdf.js 4.10.38 (render) and pdf-lib (write), copied from this repo's pdf-editor/lib (vendored there from
s3eidat repos), with correct upstream license notices. index.html + app.js (ES module) + app.css + sw.js.
Storage: IndexedDB (notebooks, strokes, original PDF bytes).

## Must (core stage)
- Library: notebooks grid with covers, new notebook (blank, lined, grid, dotted; A4/Letter), import PDF, rename,
  delete (undo). Unlimited.
- Editor: pages in a scrolling column, pen (colours, sizes, pressure), highlighter, stroke eraser, undo/redo, add
  page after current (same paper), delete page, page count/position.
- Export annotated PDF (original PDF pages kept, strokes as vector paths; blank papers drawn as vectors). S3.done().

## Should (full stage)
- Lasso select and move strokes, "draw with pen only" (fingers scroll) for tablets, zoom (fit width, +/−),
  page thumbnails navigator, change paper of a page, keyboard shortcuts and help, export page as PNG,
  S3_SELFTEST, offline sw.js, mobile/tablet layout, empty states.

## Could
- Text boxes, shapes recognition, stickers, search in PDF text, backup file of all notebooks.
