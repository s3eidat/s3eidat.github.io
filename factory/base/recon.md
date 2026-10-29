# Recon: Base (free alternative to Airtable)

Light recon, public pages only (run 2026-10-29). Nothing from Airtable (code, logo, colours, icons, copy) is
reused. Generic database terms only (base, table, field, record, view, filter, sort).

## What the paid app is
A spreadsheet-like database: bases with tables, typed fields (text, number, single/multiple select, date,
checkbox, attachment, link to another record, formula, rollup…), views (grid, kanban, calendar, gallery, form,
timeline), filters, sorts, grouping, record detail pages, CSV import/export, automations, interfaces, sharing.

## Pricing and limits (secondary sources; verify on the vendor page before quoting a number)
- Free plan: 1,000 records per base, 1 GB attachments per base, a few editors. Team about $20 and Business about
  $45 per user per month (annual). Sources: https://www.jetadmin.io/blog/airtable-pricing-in-2026-plans-real-costs-and-when-to-upgrade/ ,
  https://fast.io/resources/airtable-record-limit.md , https://costbench.com/software/project-management/airtable/free-plan/
- Guide copy rule: say "the free plan caps records per base", avoid exact numbers.

## What users complain about
- The record cap is reached quickly; splitting data across bases breaks linked records
  (https://www.usecarly.com/blog/airtable-record-limit/ , https://fast.io/resources/airtable-record-limit.md).
- Per-seat price adds up for small teams (https://www.usecarly.com/blog/airtable-pricing/ ,
  https://academy.techpresso.co/reviews/is-airtable-worth-it).
- Data lives on someone else's servers.

## Our angle
No record cap (bounded only by the browser's storage), no account, nothing uploaded, works offline. Typed fields
including links between tables and attachments kept on the device, grid/kanban/calendar/gallery views with
filters and sorts, CSV import that guesses field types, CSV export, a backup file you own.

## Honest limits (do not claim)
- One person, one browser: no sharing, comments, collaboration or sync (backup file to move it).
- No formulas, rollups, automations, forms or API in the first version.
- Attachments live in this browser's storage (IndexedDB); very large files depend on the browser's quota.
