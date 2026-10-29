# App factory — rules for the scheduled cloud agent

S3eidat Tools (https://s3eidat.github.io/) gives away free, private, browser-only versions of big paid apps
(Canva → design-studio, Notion → pages, Excel → sheets…). Each run you move **one app one stage forward**.
Money comes from traffic: every app carries the kit's coffee button and house ads for the owner's paid
products (s3eidatGPT, Spark), and every launched app gets a search-friendly "free alternative to X" guide.
So quality and honesty matter more than speed: one great app beats three broken ones.

## Files

- `factory/queue.json` — apps to build, in order (slug, name, alt = the paid app, category, idea).
- `factory/state.json` — `{ "<slug>": "recon" | "core" | "full" | "launched" }` = the last finished stage.
- `factory/apps.json` — registry of launched apps (`slug, name, tagline, category, alt`).
- `factory/<slug>/` — your working notes for that app (recon, feature list, TODO).
- `factory/launch/<slug>.md` — ready-to-paste launch posts for the owner.
- `replica/<slug>/` in the owner's local workspace holds earlier recon maps (recon.md, features.csv,
  opportunities.md) for the first 7 flagships; follow the same shape. Static site, no backend, no deploy step:
  pushing to `main` is the deploy.

## Pick the work

1. Find the first app in queue.json whose state is not `launched`. Only one app is "open" at a time.
2. Do its next stage:
   - **recon** (state missing): replica-recon + replica-entrepreneur, light. Public pages, help docs, pricing,
     and what users complain about (cite sources). Write `factory/<slug>/recon.md` and `factory/<slug>/features.md`
     (must / should / could, browser-feasible only). Must-haves = what people actually use daily + the top
     complaints we fix for free.
   - **core** (state `recon`): build `/<slug>/` with every must-have working end to end. Not listed anywhere yet.
   - **full** (state `core`): the shoulds, polish, mobile, light/dark, Arabic where natural, keyboard shortcuts,
     empty states, save/open file, `S3_SELFTEST`. Test it (see Test). Fix what fails.
   - **launched** (state `full`): final test, then list it (see Launch).
3. Update state.json, commit `factory: <slug> <stage>`, push to `main` (on rejection: `git pull --rebase`, push).
   If a stage is too big for one run, commit what works with state unchanged and a TODO in
   `factory/<slug>/TODO.md`; the next run continues. Never leave `/<slug>/` broken on `main`.

## How an app is built

- Copy `/privacy/index.html`'s `<head>` exactly (CSP meta incl. any `wasm-unsafe-eval` only if you ship wasm,
  referrer, icon, `/kit/kit.css`, `/kit/kit.js`); own title/description/canonical
  `https://s3eidat.github.io/<slug>/`. `<body data-tool="<slug>">`. Read `/kit/kit.js` and `/kit/kit.css` first:
  it gives the header, footer, coffee button, house ad and helpers (`S3.$ S3.h S3.esc S3.toast S3.copy
  S3.download S3.drop S3.readFile S3.store S3.zip S3.done`). Call `S3.done()` after each successful export.
- Study the existing flagship `design-studio/` or `sheets/` code (public repos github.com/s3eidat/<name>) for style.
- Libraries: only files you vendor into `/<slug>/lib/` from an existing s3eidat repo
  (e.g. github.com/s3eidat/pdf-merge/lib/pdf-lib.min.js, github.com/s3eidat/pdf-to-images/lib/pdf.min.mjs,
  github.com/s3eidat/sheets/lib/exceljs.min.js) with their LICENSE files. No CDN, no npm build step.
- Hard rules: no network at all (no fetch/XHR/WebSocket/CDN/fonts/remote images), no inline `<script>` code
  (JSON-LD data blocks are fine), no `on*=` attributes, no `eval`/`new Function`/`document.write`, user input
  never into `innerHTML` unescaped, ask for camera/mic only on a click. 390px wide with no horizontal scroll.
- Write every line fresh. Never copy the paid app's code, logos, icons, illustrations, copy or fonts. Fair
  wording only: "free alternative to X", never "official", never their branding.
- Only claim what the app really does.

## Test (required for full and launched)

`python3 -m http.server 8000` at the repo root, then Playwright (`pip install playwright && python3 -m
playwright install --with-deps chromium`): load `/<slug>/`, no console errors, `await S3_SELFTEST()` is
true, the main flow works (create → edit → export), 390px has no horizontal scroll. If Playwright can't install,
`node --check` every JS file and say so in the commit message.

## Launch (stage `launched`, same commit)

- `factory/apps.json`: append `{slug, name, tagline (≤ 50 chars), category, alt}`.
- `/kit/kit.js`: add `{"slug","name","tagline","category"}` to the JSON array between `/*@@TOOLS@@*/` and
  `/*@@END@@*/` (keep it valid one-line JSON).
- `/hub.js`: add `["<slug>", "<alt>"]` to the `FLAGSHIP` array.
- `guides/<slug>/index.html`: a "free alternative to <alt>" guide following `guides/RULES.md` (page format,
  FAQ JSON-LD, related tools), plus its line in `guides/index.html` and `guides/sitemap.xml`.
- `guides/sitemap.xml`: also add `https://s3eidat.github.io/<slug>/`.
- `factory/launch/<slug>.md`: ready-to-paste posts the owner can publish in 2 minutes: AlternativeTo listing
  text, a Show HN title + first comment, one Reddit post for a sub where self-promo is allowed (name the sub and
  its rule), one X post, and one Arabic post for Jordanian/Arab student groups. Honest, no hype, no fake numbers.

## Never

- Never post anywhere, open issues/PRs, or touch any repo except this one.
- Never edit other tools' folders, `coffee/`, `privacy/`, or the CONFIG block in kit.js.
- Never add payments, accounts, trackers, analytics or ads scripts.
- Only one app, one stage per run.
