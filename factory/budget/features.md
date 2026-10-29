# Budget — features (browser-only)

## Must (core)
- Budgets: create with a name and currency (USD, EUR, GBP, JOD, SAR, AED, EGP, KWD, … correct decimals,
  JOD/KWD/BHD/OMR 3 decimals), starter categories (English or Arabic), sample budget to try.
- Accounts: checking, savings, cash, credit card; starting balance; balances; close/rename.
- Plan (monthly): category groups and categories; Assigned (editable) / Activity / Available per month;
  Ready to assign; month navigation; available rolls over; overspending shown red and taken from next
  month's ready to assign.
- Move money between categories.
- Transactions: add/edit/delete, date, account, payee (remembered, auto-suggest category), category or
  "Ready to assign" for income, memo, outflow/inflow, cleared; transfers between accounts; filter by
  account and search; running balance per account.
- Amount fields accept simple maths (12.5+3) and Arabic-Indic digits.
- Saved automatically in this browser; export/import backup file (.json).

## Should (full)
- Targets: monthly amount, or save X by a date → "needs N more" + "Assign what targets need" for the month.
- Scheduled / recurring transactions (weekly, every 2 weeks, monthly, yearly), auto-entered when due.
- CSV import from bank exports: column mapping (date, payee, amount or debit/credit, memo), date format
  and decimal comma detection, preview, duplicate skip, payee → category memory.
- Reports: spending by category (bar), income vs spending by month, net worth over time (SVG charts).
- Reconcile an account against the bank balance (adjustment transaction).
- Export transactions CSV. Multiple budgets (switch, rename, delete).
- Polish: mobile 390px, light/dark, keyboard shortcuts (n new, [ ] months, 1-4 tabs, / search, ? help),
  empty states, undo for delete, S3_SELFTEST, offline service worker, backup reminder.

## Could (later)
- Per-account foreign currency with a manual rate; OFX/QIF import; split transactions; hide categories;
  age of money; print monthly summary.
