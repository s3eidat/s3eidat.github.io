# Features: floor-plan
No libraries. SVG editor (world units = cm), own PDF writer (JPEG pages, as in storyboard). index.html + app.js + app.css + sw.js.

## Must (core stage)
- Grid with pan/zoom (wheel, drag, pinch), snapping to grid, wall ends and 15° angles.
- Walls: draw chains, live length labels, thickness; select, move, drag ends (joined ends move together), delete.
- Rooms: polygon or drag-a-rectangle (optionally with walls around), name, colour, area label in m².
- Doors and windows placed on walls (follow the wall), width, swing side.
- Furniture library (bed, sofa, table, chairs, desk, wardrobe, kitchen, bathroom…): place, move, rotate 90°, resize.
- Properties panel for the selection; undo/redo; autosave in localStorage.
- Export PNG and PDF at scale (A4/A3, 1:20/1:50/1:100/1:200 or fit) with scale bar. S3.done().

## Should (full stage)
- Save/open project file; metric/imperial units; text labels; measure tool; example plan; keyboard shortcuts
  and help; print; light/dark; mobile 390px; S3_SELFTEST; offline sw.js; empty state.

## Could
- Stairs, columns, dimension lines, background image tracing (scale from a known length), 3D preview.
