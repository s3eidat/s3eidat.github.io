# Features: pdf-editor
Libs: pdf.js (render) from s3eidat/pdf-to-images/lib/pdf.min.mjs (+worker), pdf-lib from s3eidat/pdf-merge/lib/pdf-lib.min.js. Vendor with LICENSE files.

## Must (core stage)
- Open PDF by drop/picker; page thumbnails sidebar; zoom/fit width; page nav.
- Add text box (font family std 14 fonts, size, colour, bold/italic via std fonts), move/resize/delete.
- Highlight, underline, strikethrough? (highlight rect + freehand draw), pen draw with colour/width.
- Shapes: rectangle, ellipse, line, arrow; whiteout/cover rectangle.
- Insert image (PNG/JPG), move/resize.
- Signature: draw (canvas) or type, place; remember in IndexedDB/local store optionally.
- Page ops: rotate, delete, reorder (drag), duplicate, insert blank, merge another PDF.
- Undo/redo; select/move objects; keyboard Delete.
- Export: flatten overlays into PDF via pdf-lib, download; S3.done() after.

## Should (full stage)
- Fill AcroForm fields (pdf-lib form API): text, checkbox, radio, dropdown.
- Checkmark/cross/date stamps; sticky text note.
- Extract pages / split to new PDF; export pages as PNG.
- Metadata edit, compress-lite (re-save with object streams).
- Search text (pdf.js text layer), copy text.
- Dark/light, Arabic UI (RTL), mobile touch (390px), shortcuts (Ctrl+Z/Y, +/-, Del), empty states, S3_SELFTEST.
- Save/open project (.json of overlay objects + reference to PDF? keep simple: reopen exported PDF).

## Could
- True redaction (rasterise page region), password open/protect, page numbers/watermark/Bates, crop pages, OCR-free text edit via cover+retype helper.
