# Features: crm
No libraries. index.html + app.js + app.css + sw.js. Data in localStorage (S3.store), JSON backup.

## Must (core stage)
- Contacts (name, email, phone, company, job title, tags, notes) and companies (name, website, industry, phone,
  notes); tables with search and sorting.
- Deals: title, value, currency, stage, contact, company, expected close; pipeline board with drag between stages
  (and a stage select for touch/keyboard), stage totals; won/lost.
- Tasks with due date, linked to a contact or deal, done tick; overdue/today highlighted.
- Activity timeline (note, call, email, meeting) on contacts, companies and deals.
- Dashboard: open pipeline, weighted value, won this month, tasks due, recent activity.
- CSV import for contacts (header mapping) and CSV export for contacts, companies, deals; JSON backup/restore.

## Should (full stage)
- Editable stages with probabilities, currency setting (USD, EUR, GBP, JOD, SAR, AED, EGP…), example data,
  mailto/tel links, keyboard shortcuts and help, undo for deletes, mobile 390px, light/dark, S3_SELFTEST,
  offline sw.js, empty states.

## Could
- Duplicate detection and merge, custom fields, vCard import.
