# Features: subtitle-editor
No libraries. index.html + app.js + app.css + sw.js. Video stays as an object URL; cues autosaved in localStorage.

## Must (core stage)
- Open a video or audio file (drop/pick); player with play/pause, seek, speed.
- Cue list: add at playhead, edit text (multi-line, dir=auto), start/end fields, set start/end from playhead,
  split at playhead, merge with next, delete (undo); active cue highlighted and followed.
- Timeline under the player: cue blocks, playhead, click to seek, drag blocks to move, drag edges to trim, zoom.
- Captions shown over the video while editing.
- Import SRT/VTT, export SRT/VTT. S3.done() after export.
- Burn-in export: video + styled captions + original audio recorded to WebM.

## Should (full stage)
- Caption style: size, colour, background box, outline, position; used in preview and burn-in.
- Waveform on the timeline (decoded audio), "Type then tap" mode (paste text, press a key at each line's start),
  shift all timings, find and replace, reading-speed warnings (characters per second), keyboard shortcuts, help,
  undo/redo, S3_SELFTEST, offline sw.js, mobile 390px, empty state.

## Could
- Translate side-by-side columns, multiple tracks, ASS export.
