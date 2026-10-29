# Features: email-builder
No libraries. index.html + app.js + app.css + sw.js. Project in localStorage; HTML generated from block data.

## Must (core stage)
- Blocks: heading, text, image (web address or upload), button, divider, spacer, two columns (image + text each),
  social links, footer. Add from a palette, select to edit, move up/down and drag to reorder, duplicate, delete (undo).
- Text formatting inline (bold, italic, link) via a small toolbar; pasted HTML is sanitised.
- Email settings: page and content background, width, font (email-safe stacks), text/link colours, preheader,
  left-to-right or right-to-left.
- Live preview at desktop and mobile width (the real generated HTML).
- Export: download .html, copy HTML; S3.done() after export.

## Should (full stage)
- Starter templates (newsletter, announcement, event invitation, welcome), project file save/open, undo/redo,
  keyboard shortcuts and help, plain-text version export, S3_SELFTEST, offline sw.js, mobile 390px editor.

## Could
- Saved custom blocks, dark-mode email variant, MJML export.
