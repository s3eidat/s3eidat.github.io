# Recon: Budget (free alternative to YNAB)

Light recon, public pages only (run 2026-10-29). Nothing from YNAB (code, logo, colours, copy, wording of
their "rules") is reused. Generic envelope-budgeting terms only (assign, available, target, ready to assign).

## What the paid app is
Envelope / zero-based budgeting: every unit of money you have gets a job (a category). Core loop:
add accounts → money in lands in "ready to assign" → assign it to categories for the month → spending
reduces the category's available amount → overspend = move money from another category.
Extras: targets (monthly amount / save by a date), credit card payment handling, scheduled transactions,
auto-assign, bank sync (US/CA/UK/EU via aggregators), reconcile, reports (spending, net worth, income vs expense).
Help docs: https://support.ynab.com/en_us/assigning-your-money-a-guide-SypgkrNJi ,
https://support.ynab.com/en_us/how-to-use-targets-rk5kkI9ks , https://support.ynab.com/en_us/auto-assign-a-guide-r1gBNbBJo ,
https://support.ynab.com/en_us/credit-card-payments-a-guide-r1_506Q1j

## Pricing (third-party summaries; verify on the vendor page before quoting a number)
- About $14.99/month or $109/year, free trial, no free tier.
  Sources: https://getfinny.app/blog/ynab-pricing-2026 , https://costbench.com/software/personal-finance/ynab ,
  https://pocketclear.app/blog/ynab-price-increases-history.html (price rose several times since launch).
- Guide copy rule: say "paid subscription", avoid exact prices.

## What users complain about
- Price, and repeated price rises (G2 reviews: https://www.g2.com/products/you-need-a-budget/reviews ;
  OzBargain thread on an increase: https://ozbargain.com.au/node/663471).
- Bank sync breaks / needs relinking; outside the US many banks are not supported, so people import CSV
  files by hand anyway (https://pocketclear.app/blog/ynab-complaints-problems.html ,
  https://freenance.io/products/ynab-review-2026-budgeting-app-worth-it-european-investors/).
- Steep learning curve, people quit during setup (same sources).
- Privacy: you hand bank credentials/data to a cloud service and an aggregator.
- Free alternatives people name: Goodbudget (limited envelopes on free), Actual Budget (open source,
  self-host or paid hosting), spreadsheets (old r/ynab list: https://lr.in.psf.lt/r/ynab/comments/qkvc7s/alternates_to_ynabheres_a_list).

## Our angle
Free, no account, no bank login, data never leaves the device (no network at all), works offline.
CSV import from any bank's export with a column mapper (works for Jordan/Arab banks too), JOD and other
3-decimal currencies done right, Arabic category names, a gentle "start here" setup and sample budget to
fight the learning curve. Backup file you own.

## Honest limits (do not claim)
- No automatic bank sync (impossible without a server; we say so up front, CSV import instead).
- Data lives in this browser only: clearing site data deletes it, so we nudge backups. No sync between devices
  except by moving the backup file.
- One currency per budget (several budgets for several currencies); no live exchange rates.
- No mobile app, no shared/partner budgets in real time.
