# Launch posts: Subtitle Editor (free alternative to Kapwing's subtitle editor)

App: https://s3eidat.github.io/subtitle-editor/
Guide: https://s3eidat.github.io/guides/subtitle-editor/

Facts you can say (all true in the code): free, no watermark, no length cap, video never uploaded; timeline with
draggable/trimmable blocks and waveform, lines list with times, split/merge, Type-then-tap timing, shift timings,
find and replace, reading-speed warning, SRT/VTT import and export, caption style, burn-in export (WebM, MP4 in
Safari) in real time, Arabic RTL. Not true / don't claim: automatic speech recognition inside this tool (point to
/transcribe/), translation, MP4 everywhere, faster-than-real-time export.

## AlternativeTo (suggest as alternative to Kapwing)

**Name:** S3eidat Subtitle Editor
**Short description:** Free browser subtitle editor: SRT/VTT, timeline, burned-in captions, no upload or watermark.
**Description:**
Open a video from your device and edit subtitles on a timeline synced to playback: drag and trim lines, set times
from the playhead, split and merge, shift all timings, find and replace, and time a pasted script by tapping a key.
Import and export SRT and VTT, style the captions, and export a new video with them burned in. No account, no
watermark, nothing uploaded. Pairs with the free Transcribe tool for automatic first drafts.
**Tags:** subtitles, captions, srt, vtt, video, accessibility, privacy, open-source
**License:** Free, open source. **Platforms:** Web.

## Show HN

**Title:** Show HN: Subtitle editor that burns captions into your video, entirely client-side

**First comment:**
Online subtitle editors tend to want your video on their servers and put a watermark on free exports. This one plays
the file from an object URL, keeps cues in localStorage, and for burn-in draws each video frame plus the caption
onto a canvas (requestVideoFrameCallback) while MediaRecorder records the canvas stream with the original audio
routed through WebAudio. The waveform comes from decodeAudioData and is drawn only for the visible window of the
timeline. There's a "type then tap" mode for timing a script you already have. Export is real-time and WebM.

## Reddit

**Subreddit:** r/VideoEditing — self-promo only in their weekly/stickied threads; check the current rules. Or answer
"free subtitle editor without watermark" questions with a disclosure.

**Title:** Free subtitle editor in the browser — SRT/VTT, timeline, burn-in, no watermark, no upload

**Body:**
Disclosure: I made this. You open your video (it stays on your computer), fix lines on a timeline, and export SRT/VTT
or a copy with the subtitles burned in. No watermark or length limit. It doesn't do speech-to-text itself; the
site's Transcribe tool does that locally and its SRT imports here. Burn-in is real-time and outputs WebM.
https://s3eidat.github.io/subtitle-editor/

## X (Twitter)

Free subtitle editor: open your video, fix lines on a timeline, export SRT/VTT or burn the captions in. No upload,
no watermark, no length limit. Arabic works too. https://s3eidat.github.io/subtitle-editor/

## Arabic post (Jordanian / Arab student groups)

محرر ترجمة (سبتايتل) مجاني من المتصفح 🎬
افتح الفيديو من جهازك، وعدّل الجمل وتوقيتها على خط زمني متزامن مع الفيديو، وصدّر ملف SRT أو VTT،
أو اطلع فيديو جديد والترجمة محروقة عليه — بدون علامة مائية وبدون حد للمدة، والفيديو ما بنرفع لأي مكان.
بدعم العربي من اليمين لليسار، وفيه طريقة "الصق النص واضغط" عشان تزبط التوقيت بسرعة.
للترجمة التلقائية استخدم أداة Transcribe بنفس الموقع وبعدين استورد الملف هون.
الرابط: https://s3eidat.github.io/subtitle-editor/
