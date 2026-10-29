# Features: logo-maker
No libraries. Own icon set (simple geometric SVG paths written from scratch), palettes, layouts, type styles.
Fonts: Inter (kit, OFL) in weights 300–900 + system serif and mono stacks. index.html + app.js + icons.js + app.css + sw.js.

## Must (core stage)
- Start: business name, optional slogan, industry (12+) → grid of 24 logo ideas; "More ideas" re-rolls.
- Ideas combine: layout (icon left, icon above, badge/emblem, monogram in shape, wordmark only), shape (none, circle,
  rounded square, hexagon, shield, squircle), icon from the industry set, palette, type style (weight, case, tracking, font).
- Pick → editor: name/slogan text, font, weight, case, letter spacing, icon (searchable picker), icon shape, layout,
  colours (background, main, accent, text) with presets, icon size, gap. Live preview on light/dark/brand backgrounds.
- Export SVG and PNG (transparent or with background, 512/1024/2048). S3.done() after export.
- Saved logos list (favourites) in localStorage; current design autosaved.

## Should (full stage)
- Brand sheet PNG: logo on light/dark/brand colour, icon-only, palette with HEX/RGB, type info.
- Icon-only exports and favicon set (16/32/180/512 PNG + ZIP), social avatar (square) and banner sizes.
- Undo/redo, keyboard shortcuts, mobile 390px, light/dark, S3_SELFTEST, offline sw.js, empty states.
- Arabic business names render (system Arabic font fallback) with dir auto.

## Could
- Upload your own SVG icon, gradient fills, outline text style, business card mockup.
