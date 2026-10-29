# Guide writer — rules for the scheduled cloud agent

You write **one** guide page per run for S3eidat Tools (https://s3eidat.github.io/), a set of free tools
that run 100% in the browser (no sign-up, no uploads, no tracking). The goal is search traffic from people who
need the tool, so every guide must be genuinely useful on its own, not filler.

## Each run

1. `guides/queue.json` is the ordered list of tools; `guides/done.json` is the list of slugs already written.
   Pick the **first** queue entry whose slug is not in done.json. If none are left, stop.
2. Read the tool itself, `https://s3eidat.github.io/<slug>/` is the live page; the source is the public repo
   `https://github.com/s3eidat/<slug>` (`index.html`, `app.js`). Only describe buttons, options and
   limits that really exist in that code. Never invent a feature.
3. Pick the search query a real person types for this job (e.g. "merge pdf files free without uploading",
   "free alternative to Canva no sign up"). The page's `<title>`, `<h1>` and description target it naturally.
4. Write `guides/<slug>/index.html` (see "Page") and update the four shared files (see "Bookkeeping").
5. Commit with message `guide: <slug>` and push to `main`. If the push is rejected, `git pull --rebase` and push again.

## Page

- Start from `guides/index.html`'s `<head>`: copy the CSP `<meta>`, referrer, icon, kit.css, hub.css and kit.js
  lines **exactly**. Set your own `<title>` (≤ 60 chars), `<meta name="description">` (≤ 155 chars) and
  `<link rel="canonical" href="https://s3eidat.github.io/guides/<slug>/">`.
- Body: `<body data-more="off"><main class="s3-main prose"> … </main></body>`.
- Content, 600–1,100 words, plain friendly English, short paragraphs:
  1. `<h1>` the task in the reader's words; one-paragraph answer up front with a big link to the tool
     (`<a class="btn primary big" href="/<slug>/">Open <Name></a>`).
  2. "Step by step" as an `<ol>` that matches the real UI.
  3. Two to four real situations it helps with (who, why).
  4. "Why it's private": the file stays on the device (only claim this, it's true for every tool).
  5. Tips and limits that are true from the code (big files, formats, browser support).
  6. FAQ: 3–5 questions people actually search, as `<h2>`/`<h3>` + `<p>`.
  7. "Related tools": 3–4 links to other tools from queue.json that fit (`/<slug>/`), and `/guides/`.
- If the entry has `free_alternative_to`, frame it as "a free alternative to X" and be fair: say what it does
  not do. Never use the other brand's logo, colours, or the word "official".
- Add FAQPage JSON-LD in a `<script type="application/ld+json">` block (JSON only, allowed by the CSP as data).
  No other `<script>` except kit.js. No inline event handlers, no external URLs except github.com/s3eidat links.
- No images unless they already exist in the repo (you may use `/<slug>/screenshot.png` with good alt text).
- Never claim numbers you can't back (users, speed, rankings). No fake reviews or testimonials.

## Bookkeeping (same commit)

- `guides/done.json`: append the slug.
- `guides/index.html`: add `    <li><a href="/guides/<slug>/"><b>Title</b></a> <span class="muted">— one line</span></li>`
  directly above `<!--guides:list-->` (newest at the bottom is fine).
- `guides/sitemap.xml`: add `  <url><loc>https://s3eidat.github.io/guides/<slug>/</loc></url>` before `</urlset>`.

## Never

- Never edit anything outside `guides/`.
- Never write more than one guide per run, or rewrite an existing guide.
- Never open issues, PRs or touch other repos.
