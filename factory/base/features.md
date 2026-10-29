# Base — features (browser-only)

## Must (core)
- Bases with several tables; rename, delete; templates (contacts, content calendar, inventory) and blank.
- Field types: single line text, long text, number, currency, percent, single select, multiple select, date,
  checkbox, URL, email, phone, rating, link to another table, attachment (files kept in IndexedDB).
- Grid view: inline cell editing, keyboard navigation, add/delete records, add/edit/delete fields,
  expand a record into a detail window.
- Kanban view (by a single-select field, drag cards between columns), calendar view (month, by a date field),
  gallery view (cards with the first image attachment).
- Views keep their own filters (all conditions must match), sorts and hidden fields; search.
- CSV import (new table, field types guessed) and CSV export of a view.
- Saved in this browser; backup file (JSON, attachments included) export/import.

## Should (full)
- Undo, duplicate record, record count and summary row (sum/avg for numbers), column width, keyboard shortcuts,
  empty states, mobile 390px (list layout), light/dark, S3_SELFTEST, offline service worker.

## Could (later)
- Formulas, rollups and lookups, group by in grid, forms, timeline view, print.
