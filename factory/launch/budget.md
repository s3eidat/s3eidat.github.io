# Launch posts: Budget (free alternative to YNAB)

App: https://s3eidat.github.io/budget/
Guide: https://s3eidat.github.io/guides/budget/

Facts you can say (all true in the code): free, no account, no bank login, data saved only in the browser, works
offline after first load, envelope budgeting (assign / activity / available per month, ready to assign, overspending
rolls into next month's ready to assign), move money, targets (monthly, keep available, save by a date) with a
one-click "assign what targets need", recurring transactions, bank CSV import with column mapping and duplicate
skip (day/month/year dates, decimal commas, debit/credit columns, Windows-1256 Arabic files), reconcile, reports
(spending by category, income vs spending, net worth), 3-decimal dinars (JOD, KWD…), English or Arabic starter
categories, Arabic digits in amount fields, backup file, CSV export, undo, keyboard shortcuts.
Not true / don't claim: bank sync, sync between devices, shared budgets, multi-currency inside one budget,
exchange rates, mobile app, AI, Arabic interface (only Arabic category names and digits).

## AlternativeTo (suggest as alternative to YNAB)

**Name:** S3eidat Budget
**Short description:** Free, private envelope budget in the browser: plan every month, track spending, import bank CSV files.
**Description:**
Budget is an envelope / zero-based budgeting app that runs entirely in your browser. Add your accounts, assign the
money you have to categories for the month, record spending (or import your bank's CSV export) and every category
shows what is still available. Overspend and it turns red; move money from another category. Targets tell you how
much to set aside each month for a goal or a bill. Recurring transactions, reconcile, and reports for spending by
category, income vs spending and net worth. Works with 3-decimal currencies such as the Jordanian dinar. No account,
no bank login and no uploads: data stays in your browser, works offline, backup file to move it. No bank sync.
**Tags:** budgeting, personal-finance, envelope-budgeting, zero-based-budgeting, privacy, offline, no-signup
**License:** Free. **Platforms:** Web (any modern browser, desktop and mobile).

## Show HN

**Title:** Show HN: An envelope budget (YNAB-style) that runs entirely in the browser, no bank login

**First comment:**
I wanted the envelope method without a subscription and without handing my bank login to an aggregator, which
doesn't work for most banks where I live anyway. So this is a static page: accounts, a monthly plan (assigned /
activity / available), ready to assign, targets, recurring items, reconcile and a few reports.

Instead of bank sync there's a CSV importer: you map the columns, it guesses the date order and decimal commas,
falls back to Windows-1256 for older Arabic bank exports, and skips rows you already have (same date, amount and
payee), so re-importing an overlapping statement is safe. Money is stored as integers in the currency's minor unit,
so 3-decimal currencies like JOD and KWD work. Overspending isn't carried as a negative balance: the category
resets to zero next month and the amount comes out of next month's ready to assign.

No accounts and no network calls (CSP connect-src 'self'); data lives in localStorage with a JSON backup file.
Plain JS, no build step. Known gaps: no sync between devices, one currency per budget, no split transactions.
I'd love feedback on the import heuristics from people with odd bank exports.

## Reddit

**Subreddit:** r/SideProject — sharing projects you made is the point of the sub; say you built it and reply to
comments. Check the current sidebar rules before posting. (Avoid r/personalfinance and r/ynab: no self-promotion.)

**Title:** I built a free envelope budget that runs in your browser: no account, no bank login, imports bank CSV

**Body:**
Disclosure: I made this. It's free and everything stays on your device.

It's the envelope method: add your accounts, give every bit of money a job in a monthly plan, and each category
shows what's left. Overspent? It goes red and you move money from another category. Targets tell you how much to
put aside each month for things like rent or a holiday by a date.

There's no bank sync (it has no server). Instead you import your bank's CSV export: match the columns, check the
preview, and duplicates are skipped. Also: recurring transactions, reconcile, reports (spending by category,
income vs spending, net worth), backup file, works offline. Dinars with three decimals work properly.

What it doesn't do: sync between phone and laptop (backup file instead), shared budgets, or more than one currency
in the same budget.

Link: https://s3eidat.github.io/budget/ — feedback welcome, especially on the CSV import with your bank's file.

## X (Twitter)

Free envelope budget that runs in your browser: give every dollar or dinar a job, track spending, import your
bank's CSV, set targets, see reports. No sign-up, no bank login, nothing uploaded. https://s3eidat.github.io/budget/

## Arabic post (Jordanian / Arab student groups)

تطبيق ميزانية مجاني بالكامل وبدون تسجيل 💰
بتضيف حساباتك (البنك، الكاش، البطاقة) وبتوزّع راتبك على بنود الشهر: إيجار، فواتير، بقالة، مواصلات، توفير…
كل ما تصرف بتسجّل المصروف، وكل بند بيورجيك كم ضايل فيه. إذا صرفت أكثر من المخطط بيصير أحمر وبتنقل له من بند ثاني.
بتقدر تستورد كشف حسابك من البنك كملف CSV، وفيه أهداف توفير (مثلاً ٥٠٠ دينار للصيف) ومصاريف متكررة وتقارير.
بيدعم الدينار الأردني بثلاث خانات عشرية، وأسماء البنود بالعربي، والأرقام العربية.
بياناتك بتضل على جهازك وما بتنرفع لأي مكان، وما بيطلب كلمة سر البنك. (ما في مزامنة بين الأجهزة، بس في ملف نسخة احتياطية)
الرابط: https://s3eidat.github.io/budget/
