# Features: teleprompter
No libraries. index.html + app.js + app.css + sw.js. Scripts + settings in localStorage (S3.store).

## Must (core stage)
- Script editor with word count and estimated read time; autosaved.
- Prompter view, full screen: smooth time-based scroll, speed control, font size, line height, text width,
  reading-line marker, mirror (horizontal / vertical), countdown (0/3/5/10 s), colour schemes (white on black,
  black on white, yellow on black). Paragraphs dir=auto, so Arabic scripts read right to left.
- Controls: Space play/pause, ↑/↓ speed, ←/→ or PageUp/PageDown jump (Bluetooth pedals/clickers), +/− size, M mirror,
  Home restart, Esc exit; on-screen buttons for touch; wheel/drag scrolls manually.
- Settings remembered.

## Should (full stage)
- Scripts library: several scripts, rename, delete (undo), open .txt/.md file, save .txt.
- Cues: lines in [square brackets] shown as stage cues (dim, smaller); **bold** for emphasis.
- Camera mode: camera behind the script (asked only on click), pick camera/mic, record to WebM, download; S3.done().
- Elapsed / remaining time while prompting; progress bar.
- Keyboard help, empty state, mobile 390px, light/dark app chrome, S3_SELFTEST, offline sw.js.

## Could
- Second-screen window, timer targets ("finish in 2:00" sets the speed), section markers jump list.
