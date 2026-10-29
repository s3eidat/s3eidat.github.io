# Features: storyboard
No libraries: own tiny PDF writer (JPEG pages), canvas sketching, IndexedDB storage. index.html + app.js + app.css + sw.js.

## Must (core stage)
- Project: title, aspect ratio (16:9, 9:16, 1:1, 4:3, 2.39:1). Autosave in IndexedDB.
- Frames grid: image, scene/shot number, shot type, camera move, action, dialogue, notes, duration (s).
- Sketch editor per frame: pen, eraser, colours, sizes, pressure, undo/redo, clear, thirds grid, draw over an uploaded image.
- Add frame, insert after, duplicate, delete (undo toast), reorder by drag and by move buttons.
- Drop/pick many images to create frames at once; replace a frame image.
- Animatic player: frames for their durations, dialogue as captions, play/pause, prev/next, scrubber, total time.
- Export PDF (A4/Letter landscape/portrait, 1–4 per row, with text), S3.done() after export.

## Should (full stage)
- Save/open project file (.storyboard.json with images), new project.
- Export animatic video (WebM via canvas + MediaRecorder), shot list CSV, frames as PNG ZIP.
- Keyboard: arrows/space in animatic, Del, Ctrl+D, Ctrl+Z/Y in sketch, N new frame, ? help.
- Grid density (S/M/L cards), empty states, mobile 390px, light/dark, text fields dir=auto (Arabic text renders in PDF),
  S3_SELFTEST, offline sw.js.

## Could
- Voiceover/audio track in animatic, multiple projects library, comments, cover page options, title cards.
