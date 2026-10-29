/* Hub: search + category filter over the tool list built into the kit. Arabic page (lang=ar) uses window.S3_AR names. */
(function () {
  "use strict";
  var AR = document.documentElement.lang === "ar" && window.S3_AR;
  var CAT_AR = {
    "Audio & Video": "صوت وفيديو", "Calculators": "حاسبات", "Design": "تصميم", "Developer": "للمبرمجين",
    "Everyday": "يومية", "Images": "صور", "PDF & Docs": "PDF ومستندات", "Productivity": "إنتاجية",
    "QR & Codes": "QR وباركود", "Security & Privacy": "أمان وخصوصية", "Text": "نصوص"
  };
  function nm(t) { return AR && AR[t.slug] ? AR[t.slug][0] : t.name; }
  function tg(t) { return AR && AR[t.slug] ? AR[t.slug][1] : t.tagline; }
  function ct(c) { return AR ? CAT_AR[c] || c : c; }

  var tools = S3.tools.slice().sort(function (a, b) { return nm(a).localeCompare(nm(b), AR ? "ar" : "en"); });
  var grid = S3.$("#grid"), q = S3.$("#q"), cats = S3.$("#cats"), none = S3.$("#none");
  var ALL = AR ? "الكل" : "All", cat = ALL;

  S3.$("#count").textContent = AR ? tools.length.toLocaleString("ar-EG") : tools.length;
  var counts = {};
  tools.forEach(function (t) { counts[t.category] = (counts[t.category] || 0) + 1; });
  [ALL].concat(Object.keys(counts).sort(function (a, b) { return ct(a).localeCompare(ct(b)); })).forEach(function (c) {
    var b = S3.h("button", { type: "button", "aria-pressed": String(c === cat) }, [ct(c), S3.h("span", { text: c === ALL ? tools.length : counts[c] })]);
    b.addEventListener("click", function () {
      cat = c;
      S3.$$("button", cats).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      draw();
    });
    cats.appendChild(b);
  });

  // Latin: case and accents folded. Arabic: tashkeel/tatweel removed, alef/ya/ta-marbuta forms unified.
  function norm(s) {
    // NFD splits accented Latin and also alef-with-hamza (U+0623/0625/0622) into alef + U+0653..0655
    return s.toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u064B-\u0655\u0670\u0640]/g, "")
      .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
      .replace(/\u0649/g, "\u064A")
      .replace(/\u0629/g, "\u0647");
  }
  function draw() {
    var words = norm(q.value.trim()).split(/\s+/).filter(Boolean);
    var hits = tools.filter(function (t) {
      if (cat !== ALL && t.category !== cat) return false;
      var hay = norm([t.name, t.tagline, t.category, t.slug, nm(t), tg(t), ct(t.category)].join(" "));
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    });
    grid.innerHTML = "";
    hits.forEach(function (t) {
      grid.appendChild(S3.h("a", { "class": "hub-card", href: "/" + t.slug + "/" }, [
        S3.h("b", { text: nm(t) }), S3.h("span", { text: tg(t) }), S3.h("em", { text: ct(t.category) })
      ]));
    });
    none.hidden = hits.length > 0;
  }

  var bySlug = {};
  tools.forEach(function (t) { bySlug[t.slug] = t; });

  // Flagship apps: free versions of the big paid apps people use every day.
  var FLAGSHIP = [
    ["design-studio", "Canva"], ["pages", "Notion"], ["sheets", "Excel"], ["slides", "PowerPoint"],
    ["docs", "Word"], ["photo-editor", "Photoshop"], ["video-editor", "CapCut"], ["study-planner", "MyStudyLife"], ["budget", "YNAB"], ["storyboard", "Boords"], ["teleprompter", "PromptSmart"], ["diagrams", "Lucidchart"], ["logo-maker", "Looka"], ["time-tracker", "Toggl Track"], ["floor-plan", "RoomSketcher"], ["gantt", "Microsoft Project"], ["subtitle-editor", "Kapwing"], ["beat-maker", "FL Studio"], ["base", "Airtable"], ["crm", "HubSpot CRM"], ["email-builder", "Mailchimp"]
  ].filter(function (f) { return bySlug[f[0]]; });
  var flag = S3.$("#flagship-row");
  FLAGSHIP.forEach(function (f) {
    var t = bySlug[f[0]];
    flag.appendChild(S3.h("a", { "class": "hub-flag", href: "/" + t.slug + "/" }, [
      S3.h("b", { text: nm(t) }), S3.h("span", { text: tg(t) }),
      S3.h("em", { text: (AR ? "بديل مجاني لـ " : "Free alternative to ") + f[1] })
    ]));
  });
  S3.$("#flagship").hidden = !FLAGSHIP.length;
  var recent = (S3.store("recent") || []).filter(function (s) { return bySlug[s]; });
  recent.forEach(function (s) {
    S3.$("#recent-row").appendChild(S3.h("a", { href: "/" + s + "/" }, [nm(bySlug[s])]));
  });
  S3.$("#recent").hidden = !recent.length;

  q.addEventListener("input", draw);
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== q) { e.preventDefault(); q.focus(); }
  });
  draw();

  window.S3_SELFTEST = function () {
    return norm("إِسْتِخْرَاج") === norm("استخراج") && norm("صلاة") === norm("صلاه") && norm("Café") === "cafe";
  };
})();
