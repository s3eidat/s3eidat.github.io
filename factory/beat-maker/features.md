# Features: beat-maker
No libraries. WebAudio synthesis for every sound. index.html + app.js + app.css + sw.js. Project in localStorage.

## Must (core stage)
- Drum step sequencer: 8 synthesized drums (kick, snare, clap, closed hat, open hat, low tom, high tom, rim),
  16 steps, accent (velocity) per step, per-track volume, mute and solo.
- Bass (mono) and lead (poly) synths with piano roll: click to add notes, drag to lengthen, octave shift; wave,
  filter cutoff and release per synth.
- Transport: play/stop (Space), BPM 60–200, swing, master volume; lookahead scheduler with a moving playhead.
- Patterns A–H (copy/clear), song arranger (chain of pattern slots), play pattern or song.
- Export WAV (OfflineAudioContext, 16-bit stereo) of the pattern loop or the whole song. S3.done().

## Should (full stage)
- Drum kits (punchy / lo-fi / 808-style parameter sets), example beats, project file save/open, undo/redo,
  keyboard shortcuts and help, mobile 390px, light/dark, S3_SELFTEST, offline sw.js, empty states.

## Could
- MIDI export, 32 steps, per-step pitch for drums, effects (delay/reverb), record from computer keyboard.
