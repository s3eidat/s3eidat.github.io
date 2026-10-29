/* Link Page core: page model, safe HTML export, social links, link paste parser and a QR code encoder.
   Pure functions (no DOM), so it also runs under node for tests. */
(function (root) {
  "use strict";

  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clip(s, n) { return String(s == null ? "" : s).slice(0, n); }

  // ---------- colours, fonts, themes ----------
  function color(c, def) { return /^#[0-9a-f]{6}$/i.test(String(c || "")) ? String(c).toLowerCase() : def; }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function rgba(hex, a) { var c = rgb(hex); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function luma(hex) { var c = rgb(hex).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function contrast(a, b) { var x = luma(a), y = luma(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

  var FONTS = {
    sans: { name: "Clean", css: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", Tahoma, Arial, sans-serif' },
    serif: { name: "Classic serif", css: 'Georgia, "Iowan Old Style", "Times New Roman", "Noto Naskh Arabic", serif' },
    rounded: { name: "Rounded", css: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", "Arial Rounded MT Bold", system-ui, sans-serif' },
    mono: { name: "Typewriter", css: 'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace' },
    narrow: { name: "Condensed", css: '"Avenir Next Condensed", "Roboto Condensed", "Arial Narrow", sans-serif-condensed, sans-serif' }
  };

  // bg: {type: solid|gradient|image, c1, c2, angle, img, dim}; btn: {style: fill|outline|soft|hard, shape: square|round|pill, bg, fg}
  var THEMES = [
    { id: "paper", name: "Paper", t: { bg: { type: "solid", c1: "#f6f1e9" }, text: "#2b2622", btn: { style: "fill", shape: "round", bg: "#2b2622", fg: "#f6f1e9" }, font: "sans" } },
    { id: "midnight", name: "Midnight", t: { bg: { type: "solid", c1: "#0f1115" }, text: "#f2f4f7", btn: { style: "soft", shape: "round", bg: "#ffffff", fg: "#f2f4f7" }, font: "sans" } },
    { id: "ocean", name: "Ocean", t: { bg: { type: "gradient", c1: "#0f4c81", c2: "#1b8aa0", angle: 160 }, text: "#ffffff", btn: { style: "fill", shape: "pill", bg: "#ffffff", fg: "#0f4c81" }, font: "sans" } },
    { id: "sunset", name: "Sunset", t: { bg: { type: "gradient", c1: "#e0533a", c2: "#c2338a", angle: 170 }, text: "#ffffff", btn: { style: "outline", shape: "pill", bg: "#ffffff", fg: "#ffffff" }, font: "rounded" } },
    { id: "forest", name: "Forest", t: { bg: { type: "solid", c1: "#1f3b2d" }, text: "#eef5ec", btn: { style: "fill", shape: "round", bg: "#cfe8b8", fg: "#1f3b2d" }, font: "serif" } },
    { id: "mono", name: "Ink", t: { bg: { type: "solid", c1: "#ffffff" }, text: "#111111", btn: { style: "outline", shape: "square", bg: "#111111", fg: "#111111" }, font: "mono" } },
    { id: "candy", name: "Candy", t: { bg: { type: "gradient", c1: "#ffd6e8", c2: "#d9e4ff", angle: 135 }, text: "#3b2147", btn: { style: "fill", shape: "pill", bg: "#ffffff", fg: "#3b2147" }, font: "rounded" } },
    { id: "neon", name: "Neon", t: { bg: { type: "solid", c1: "#08080c" }, text: "#e9fdff", btn: { style: "outline", shape: "round", bg: "#3ef0e6", fg: "#3ef0e6" }, font: "mono" } },
    { id: "sand", name: "Sand", t: { bg: { type: "solid", c1: "#ead9c0" }, text: "#4a3424", btn: { style: "hard", shape: "square", bg: "#fffaf2", fg: "#4a3424" }, font: "serif" } },
    { id: "grape", name: "Grape", t: { bg: { type: "gradient", c1: "#2a1b4d", c2: "#6c3fc4", angle: 180 }, text: "#f4efff", btn: { style: "soft", shape: "pill", bg: "#ffffff", fg: "#f4efff" }, font: "sans" } },
    { id: "mint", name: "Mint", t: { bg: { type: "solid", c1: "#dff5ec" }, text: "#123c33", btn: { style: "hard", shape: "round", bg: "#ffffff", fg: "#123c33" }, font: "narrow" } },
    { id: "sun", name: "Sunny", t: { bg: { type: "solid", c1: "#ffd23f" }, text: "#1d1a14", btn: { style: "fill", shape: "square", bg: "#1d1a14", fg: "#ffd23f" }, font: "narrow" } }
  ];
  function themeById(id) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i]; return THEMES[0]; }
  function copyTheme(id) { return JSON.parse(JSON.stringify(themeById(id).t)); }

  // ---------- social networks (own simple line glyphs, 24×24, stroke = currentColor) ----------
  var G = {
    instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6" fill="currentColor"/>',
    tiktok: '<path d="M14 3.5v11a3.75 3.75 0 1 1-3.75-3.75"/><path d="M14 3.5c.6 2.6 2.6 4.5 5.5 4.8"/>',
    youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.2 9.3l4.6 2.7-4.6 2.7z" fill="currentColor"/>',
    x: '<path d="M4.5 4.5l15 15M19.5 4.5l-15 15"/>',
    facebook: '<path d="M15.5 3.5h-2.3a3.7 3.7 0 0 0-3.7 3.7V20.5M6.5 10.5h8"/>',
    linkedin: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 10.5v6M8 7.6v.1M11.5 16.5v-6M11.5 13a2.5 2.5 0 0 1 5 0v3.5"/>',
    whatsapp: '<path d="M4 20l1.3-3.8A8.2 8.2 0 1 1 8 18.8z"/><path d="M9.2 8.8c0 3 2.7 5.8 5.9 5.9l1-1.4-1.9-1-.8.8a4 4 0 0 1-2.5-2.5l.8-.8-1-1.9z" fill="currentColor" stroke-width="1"/>',
    telegram: '<path d="M20.5 4.2L3.6 10.8l5.6 2 2 6 3.2-4 4.6 3.4z"/><path d="M9.2 12.8l11.3-8.6"/>',
    snapchat: '<path d="M12 3.6c3 0 4.9 2.1 4.9 5v2.3l1.9.8-.9 1.2c.5 1.5 1.5 2.4 2.6 2.8-.8.8-2 1-3.1 1.1L16.8 18.3c-1.5-.5-3-.1-4.8 1.1-1.8-1.2-3.3-1.6-4.8-1.1l-.6-1.5c-1.1-.1-2.3-.3-3.1-1.1 1.1-.4 2.1-1.3 2.6-2.8l-.9-1.2 1.9-.8V8.6c0-2.9 1.9-5 4.9-5z"/>',
    pinterest: '<circle cx="12" cy="12" r="8.5"/><path d="M10.6 20.2l2-8.2M10 13.2a2.9 2.9 0 1 1 4.6 1.4c-1 .9-2.3.9-2.9.4"/>',
    threads: '<circle cx="12" cy="12" r="3.3"/><path d="M15.3 12v1.4a2.6 2.6 0 0 0 5.2 0V12a8.5 8.5 0 1 0-3.4 6.8"/>',
    github: '<path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.2 5.5l-2.4 13"/>',
    spotify: '<circle cx="12" cy="12" r="8.5"/><path d="M7.6 9.6c3-1 6.4-.7 8.9.8M8.1 12.6c2.4-.7 5.1-.5 7.2.7M8.6 15.4c1.9-.5 3.9-.3 5.5.5"/>',
    twitch: '<path d="M5 3.5h15.5v10l-4 4h-3.5l-3 3v-3H5z"/><path d="M11 8v4M15.5 8v4"/>',
    discord: '<path d="M7.5 6.5c3-1.3 6-1.3 9 0 1.6 2.4 2.5 5.1 2.5 8.4-1.5 1.3-3 2-4.5 2.3l-1-1.7M7.5 6.5C5.9 8.9 5 11.6 5 14.9c1.5 1.3 3 2 4.5 2.3l1-1.7"/><circle cx="9.5" cy="12.3" r=".9" fill="currentColor"/><circle cx="14.5" cy="12.3" r=".9" fill="currentColor"/>',
    email: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',
    phone: '<path d="M5.5 3.5h3.5l1.8 4.6-2.3 1.4a10.5 10.5 0 0 0 6 6l1.4-2.3 4.6 1.8v3.5a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3.5 5.5a2 2 0 0 1 2-2z"/>',
    website: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.4 3.6 5.2 3.6 8.5s-1.1 6.1-3.6 8.5c-2.5-2.4-3.6-5.2-3.6-8.5S9.5 5.9 12 3.5z"/>'
  };
  var SOCIALS = [
    { id: "instagram", name: "Instagram", ph: "yourname", url: "https://instagram.com/" },
    { id: "tiktok", name: "TikTok", ph: "yourname", url: "https://www.tiktok.com/@" },
    { id: "youtube", name: "YouTube", ph: "yourchannel", url: "https://www.youtube.com/@" },
    { id: "x", name: "X", ph: "yourname", url: "https://x.com/" },
    { id: "facebook", name: "Facebook", ph: "yourpage", url: "https://www.facebook.com/" },
    { id: "linkedin", name: "LinkedIn", ph: "your-profile", url: "https://www.linkedin.com/in/" },
    { id: "whatsapp", name: "WhatsApp", ph: "+962 7x xxx xxxx", url: "https://wa.me/" },
    { id: "telegram", name: "Telegram", ph: "yourname", url: "https://t.me/" },
    { id: "snapchat", name: "Snapchat", ph: "yourname", url: "https://www.snapchat.com/add/" },
    { id: "pinterest", name: "Pinterest", ph: "yourname", url: "https://www.pinterest.com/" },
    { id: "threads", name: "Threads", ph: "yourname", url: "https://www.threads.net/@" },
    { id: "github", name: "GitHub", ph: "yourname", url: "https://github.com/" },
    { id: "spotify", name: "Spotify", ph: "Paste your artist or playlist link", url: "" },
    { id: "twitch", name: "Twitch", ph: "yourname", url: "https://www.twitch.tv/" },
    { id: "discord", name: "Discord", ph: "Paste your invite link", url: "" },
    { id: "email", name: "Email", ph: "you@example.com", url: "mailto:" },
    { id: "phone", name: "Phone", ph: "+962 7x xxx xxxx", url: "tel:" },
    { id: "website", name: "Website", ph: "yoursite.com", url: "" }
  ];
  function social(id) { for (var i = 0; i < SOCIALS.length; i++) if (SOCIALS[i].id === id) return SOCIALS[i]; return null; }
  function glyph(id, size) { return '<svg viewBox="0 0 24 24" width="' + (size || 24) + '" height="' + (size || 24) + '" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (G[id] || G.website) + "</svg>"; }

  // ---------- URLs ----------
  // Accepts what people type ("instagram.com/x", "www.site.com", "mailto:…") and returns a safe absolute URL or "".
  function fixUrl(s) {
    s = String(s || "").trim().replace(/\s+/g, "");
    if (!s) return "";
    if (/^(https?:|mailto:|tel:|sms:)/i.test(s)) return /^(https?:\/\/[^\/?#]+|mailto:.+|tel:\+?[0-9()\-.]+|sms:\+?[0-9()\-.]+)/i.test(s) ? s : "";
    if (/^[a-z][a-z0-9+.\-]*:/i.test(s) && !/^[^:\/]+\.[a-z]{2,}:\d+/i.test(s)) return ""; // javascript:, data:, etc.
    if (/^\/\//.test(s)) s = s.slice(2);
    if (/^[^\s@\/]+@[^\s@\/]+\.[a-z]{2,}$/i.test(s)) return "mailto:" + s;
    if (/^[^\/?#]+\.[a-z]{2,}([\/?#:].*)?$/i.test(s) || /^localhost/i.test(s)) return "https://" + s;
    return "";
  }
  function urlProblem(raw) {
    var s = String(raw || "").trim();
    if (!s) return "Add an address";
    var u = fixUrl(s);
    if (!u) return "This doesn't look like a web address";
    if (/^https?:\/\/(www\.)?example\.(com|org|net)\b/i.test(u)) return "Still the example address";
    return "";
  }
  function socialUrl(net, val) {
    var s = social(net), v = String(val || "").trim();
    if (!s || !v) return "";
    if (net === "email") { v = v.replace(/^mailto:/i, ""); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "mailto:" + v : ""; }
    if (net === "phone") { var p = v.replace(/^tel:/i, "").replace(/[^\d+]/g, ""); return p.replace(/\+/g, "").length >= 3 ? "tel:" + p : ""; }
    if (net === "whatsapp") {
      if (/^(https?:\/\/)?(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)/i.test(v)) return fixUrl(v);
      var d = v.replace(/\D/g, "").replace(/^00/, ""); return d.length >= 6 ? "https://wa.me/" + d : "";
    }
    if (/^(https?:)?\/\//i.test(v) || /^[^\/@\s]+\.[a-z]{2,}\//i.test(v) || /^www\./i.test(v) || !s.url) return fixUrl(v);
    var hdl = v.replace(/^@+/, "").replace(/[^\w.\-]/g, "");
    return hdl ? s.url + hdl : "";
  }
  function hostOf(u) { var m = /^https?:\/\/(?:www\.)?([^\/?#:]+)/i.exec(u || ""); return m ? m[1].toLowerCase() : ""; }

  var HOSTS = { "instagram.com": "Instagram", "tiktok.com": "TikTok", "youtube.com": "YouTube", "youtu.be": "YouTube", "x.com": "X", "twitter.com": "X",
    "facebook.com": "Facebook", "fb.com": "Facebook", "linkedin.com": "LinkedIn", "wa.me": "WhatsApp", "whatsapp.com": "WhatsApp", "t.me": "Telegram",
    "snapchat.com": "Snapchat", "pinterest.com": "Pinterest", "threads.net": "Threads", "github.com": "GitHub", "spotify.com": "Spotify",
    "twitch.tv": "Twitch", "discord.gg": "Discord", "discord.com": "Discord", "soundcloud.com": "SoundCloud", "behance.net": "Behance", "etsy.com": "Etsy" };
  function siteName(url) {
    if (/^mailto:/i.test(url)) return "Email";
    if (/^(tel|sms):/i.test(url)) return "Call";
    var host = hostOf(url), parts = host.split(".");
    for (var i = 0; i < parts.length - 1; i++) { var hk = parts.slice(i).join("."); if (HOSTS[hk]) return HOSTS[hk]; }
    return host || url;
  }
  // Paste a list of links: "Title | url", "Title - url", "Title: url", "url" (one per line).
  function parseLinks(text) {
    var out = [];
    String(text || "").replace(/\r\n?/g, "\n").split("\n").forEach(function (line) {
      line = line.trim().replace(/^([-*•]|\d+[.)])\s+/, "");
      if (!line) return;
      var md = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(line);
      if (md) { var u0 = fixUrl(md[2]); if (u0) out.push({ title: md[1].trim(), url: u0 }); return; }
      var m = /(https?:\/\/\S+|mailto:\S+|tel:\S+|(?:www\.)?[a-z0-9\-]+(?:\.[a-z0-9\-]+)*\.[a-z]{2,}(?:\/\S*)?)\s*$/i.exec(line);
      if (!m) return;
      var url = fixUrl(m[1]); if (!url) return;
      var title = line.slice(0, m.index).replace(/[\s|:—–\-→>]+$/, "").trim();
      if (!title) title = siteName(url);
      out.push({ title: clip(title, 120), url: url });
    });
    return out;
  }

  // ---------- page model ----------
  function block(type, o) { o = o || {}; return { id: uid(), type: type, title: clip(o.title || "", 200), url: o.url || "", emoji: clip(o.emoji || "", 16), on: o.on !== false, feat: !!o.feat }; }
  function newPage() {
    return { app: "s3-linkpage", v: 1, id: uid(), profile: { name: "", bio: "", avatar: "", shape: "circle" }, blocks: [], socials: [], socialPos: "top",
      themeId: "paper", theme: copyTheme("paper"), dir: "auto", credit: false, site: "", updated: Date.now() };
  }
  var TEMPLATES = {
    creator: { name: "Creator", themeId: "sunset", profile: { name: "Your Name", bio: "Videos about cooking on a budget.\nNew recipe every Friday." },
      blocks: [["link", "Watch my latest video", "", "🎬", true], ["link", "Free recipe e-book", "", "📗"], ["link", "My kitchen gear", "", "🍳"], ["header", "Work with me"], ["link", "Brand collaborations", "", "✉️"]],
      socials: [["instagram", ""], ["tiktok", ""], ["youtube", ""]] },
    shop: { name: "Small shop", themeId: "sand", profile: { name: "Your Shop", bio: "Handmade candles and gifts.\nDelivery across the city." },
      blocks: [["link", "Order on WhatsApp", "", "💬", true], ["link", "Price list", "", "🏷️"], ["link", "Find us on the map", "", "📍"], ["header", "Opening hours"], ["text", "Sat–Thu 10:00–20:00"]],
      socials: [["instagram", ""], ["whatsapp", ""], ["phone", ""]] },
    musician: { name: "Musician", themeId: "neon", profile: { name: "Band Name", bio: "New single out now." },
      blocks: [["link", "Listen to the new single", "", "🎧", true], ["link", "Tour dates", "", "🎟️"], ["link", "Merch", "", "👕"], ["link", "Booking", "", "📩"]],
      socials: [["spotify", ""], ["youtube", ""], ["instagram", ""]] },
    personal: { name: "Personal", themeId: "ocean", profile: { name: "Your Name", bio: "Designer and student. Say hi!" },
      blocks: [["link", "My portfolio", "", "🎨", true], ["link", "My CV (PDF)", "", "📄"], ["link", "Read my blog", "", "✍️"]],
      socials: [["linkedin", ""], ["github", ""], ["email", ""]] }
  };
  function template(key) {
    var t = TEMPLATES[key], p = newPage();
    if (!t) return p;
    p.themeId = t.themeId; p.theme = copyTheme(t.themeId);
    p.profile.name = t.profile.name; p.profile.bio = t.profile.bio;
    p.blocks = t.blocks.map(function (b) { return block(b[0], { title: b[1], url: b[2], emoji: b[3], feat: b[4] }); });
    p.socials = t.socials.map(function (s) { return { id: uid(), net: s[0], val: s[1] }; });
    return p;
  }

  var IMG_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+\/]+=*$/;
  function img(s) { return typeof s === "string" && s.length < 6e6 && IMG_RE.test(s) ? s : ""; }
  // Clean any loaded object into a valid page (files may come from anywhere).
  function normalize(o) {
    if (!o || o.app !== "s3-linkpage" || typeof o !== "object") throw new Error("Not a link page file");
    var p = newPage(), pr = o.profile || {};
    p.id = typeof o.id === "string" && /^[\w-]{1,40}$/.test(o.id) ? o.id : uid();
    p.profile = { name: clip(pr.name, 120), bio: clip(pr.bio, 600), avatar: img(pr.avatar), shape: pr.shape === "rounded" ? "rounded" : "circle" };
    p.blocks = (Array.isArray(o.blocks) ? o.blocks : []).slice(0, 300).filter(function (b) { return b && /^(link|header|text)$/.test(b.type); }).map(function (b) {
      var n = block(b.type, { title: clip(b.title, b.type === "text" ? 1000 : 200), url: clip(b.url, 2000), emoji: b.emoji, on: b.on, feat: b.feat });
      if (typeof b.id === "string" && /^[\w-]{1,40}$/.test(b.id)) n.id = b.id;
      return n;
    });
    p.socials = (Array.isArray(o.socials) ? o.socials : []).slice(0, 40).filter(function (s) { return s && social(s.net); }).map(function (s) { return { id: uid(), net: s.net, val: clip(s.val, 300) }; });
    p.socialPos = o.socialPos === "bottom" ? "bottom" : "top";
    p.themeId = typeof o.themeId === "string" ? clip(o.themeId, 20) : "custom";
    var t = o.theme || {}, d = copyTheme("paper"), bg = t.bg || {}, b = t.btn || {};
    p.theme = {
      bg: { type: /^(solid|gradient|image)$/.test(bg.type) ? bg.type : "solid", c1: color(bg.c1, d.bg.c1), c2: color(bg.c2, "#ffffff"), angle: Math.max(0, Math.min(360, +bg.angle || 160)), img: img(bg.img), dim: Math.max(0, Math.min(0.8, +bg.dim || 0)) },
      text: color(t.text, d.text),
      btn: { style: /^(fill|outline|soft|hard)$/.test(b.style) ? b.style : "fill", shape: /^(square|round|pill)$/.test(b.shape) ? b.shape : "round", bg: color(b.bg, d.btn.bg), fg: color(b.fg, d.btn.fg) },
      font: FONTS[t.font] ? t.font : "sans"
    };
    if (p.theme.bg.type === "image" && !p.theme.bg.img) p.theme.bg.type = "solid";
    p.dir = /^(auto|ltr|rtl)$/.test(o.dir) ? o.dir : "auto";
    p.credit = !!o.credit;
    p.site = clip(o.site, 300);
    p.updated = +o.updated || Date.now();
    return p;
  }

  // ---------- export: one self-contained HTML file, no scripts ----------
  function bgCss(t) {
    var bg = t.bg;
    if (bg.type === "gradient") return "background:" + bg.c1 + ";background-image:linear-gradient(" + (bg.angle | 0) + "deg," + bg.c1 + "," + bg.c2 + ")";
    return "background:" + bg.c1;
  }
  function btnCss(t) {
    var b = t.btn, r = b.shape === "pill" ? "999px" : b.shape === "square" ? "4px" : "14px", s = "border-radius:" + r + ";";
    if (b.style === "outline") s += "background:transparent;color:" + b.fg + ";border:2px solid " + b.bg;
    else if (b.style === "soft") s += "background:" + rgba(b.bg, 0.16) + ";color:" + b.fg + ";border:2px solid " + rgba(b.bg, 0.1) + ";-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)";
    else if (b.style === "hard") s += "background:" + b.bg + ";color:" + b.fg + ";border:2px solid " + t.text + ";box-shadow:4px 4px 0 " + t.text;
    else s += "background:" + b.bg + ";color:" + b.fg + ";border:2px solid " + b.bg;
    return s;
  }
  function linkHref(b) { return fixUrl(b.url); }
  // In the export a link needs a title and a valid address; the preview also shows links still missing an address.
  function visibleBlocks(p, preview) {
    return p.blocks.filter(function (b) { return b.on && String(b.title).trim() && (b.type !== "link" || preview || linkHref(b)); });
  }
  function toHTML(page, opt) {
    opt = opt || {};
    var p = normalize(page), t = p.theme, pr = p.profile, dirAttr = p.dir === "auto" ? "" : ' dir="' + p.dir + '"';
    var lang = p.dir === "rtl" || /[؀-ۿ]/.test(pr.name + pr.bio) ? "ar" : "en";
    var title = pr.name.trim() || "Links", desc = pr.bio.trim().replace(/\s+/g, " ").slice(0, 160);
    var tgt = opt.preview ? ' target="_blank" rel="noopener"' : ' rel="noopener"';
    var site = fixUrl(p.site);
    var focus = luma(t.text) > 0.4 ? "#ffffff" : "#000000";
    var css = [
      "*{box-sizing:border-box}",
      "html{-webkit-text-size-adjust:100%;" + bgCss(t) + "}",
      "body{margin:0;min-height:100vh;font-family:" + FONTS[t.font].css + ";color:" + t.text + ";" + (t.font === "narrow" ? "font-stretch:condensed;" : "") + "}",
      t.bg.type === "image" ? ".bg{position:fixed;inset:0;z-index:-1;background:" + t.bg.c1 + " url(" + t.bg.img + ") center/cover no-repeat}.bg::after{content:\"\";position:absolute;inset:0;background:rgba(0,0,0," + t.bg.dim + ")}" : "",
      "main{max-width:580px;margin:0 auto;padding:48px 20px 40px;text-align:center}",
      ".av{display:block;width:96px;height:96px;margin:0 auto 14px;object-fit:cover;border-radius:" + (pr.shape === "rounded" ? "24px" : "50%") + "}",
      "h1{font-size:21px;line-height:1.3;margin:0 0 6px;font-weight:700;overflow-wrap:anywhere}",
      ".bio{max-width:440px;margin:0 auto 18px;line-height:1.5;opacity:.88;white-space:pre-line;overflow-wrap:anywhere}",
      ".so{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:0 0 20px;padding:0;list-style:none}",
      ".so.b{margin:22px 0 0}",
      ".so a{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;color:inherit}",
      ".so a:hover{background:" + rgba(t.text, 0.1) + "}",
      ".l{display:flex;align-items:center;justify-content:center;gap:10px;min-height:56px;padding:14px 22px;margin:0 0 14px;font-weight:600;line-height:1.3;text-decoration:none;overflow-wrap:anywhere;transition:transform .15s ease;" + btnCss(t) + "}",
      ".l:hover{transform:translateY(-2px)}",
      ".l.f{min-height:66px;font-size:1.06em;box-shadow:0 0 0 3px " + rgba(t.text, 0.35) + (t.btn.style === "hard" ? ",4px 4px 0 3px " + t.text : "") + "}",
      ".e{font-size:1.2em;line-height:1}",
      "a:focus-visible{outline:3px solid " + focus + ";outline-offset:3px}",
      "h2{font-size:15px;font-weight:700;margin:26px 0 12px;opacity:.9;overflow-wrap:anywhere}",
      ".t{margin:0 0 14px;line-height:1.55;white-space:pre-line;opacity:.9;overflow-wrap:anywhere}",
      "footer{margin-top:30px;font-size:12px;opacity:.65}footer a{color:inherit}",
      "@media (prefers-reduced-motion:reduce){.l{transition:none}.l:hover{transform:none}}"
    ].join("");
    var so = p.socials.map(function (s) { var u = socialUrl(s.net, s.val); return u ? '<li><a href="' + esc(u) + '"' + tgt + ' aria-label="' + esc(social(s.net).name) + '" title="' + esc(social(s.net).name) + '">' + glyph(s.net) + "</a></li>" : ""; }).join("");
    var soHtml = so ? '<ul class="so' + (p.socialPos === "bottom" ? " b" : "") + '">' + so + "</ul>" : "";
    var body = visibleBlocks(p, opt.preview).map(function (b) {
      if (b.type === "header") return '<h2 dir="auto">' + esc(b.title) + "</h2>";
      if (b.type === "text") return '<p class="t" dir="auto">' + esc(b.title) + "</p>";
      var href = linkHref(b);
      return '<a class="l' + (b.feat ? " f" : "") + '"' + (href ? ' href="' + esc(href) + '"' + tgt : "") + ">" + (b.emoji ? '<span class="e" aria-hidden="true">' + esc(b.emoji) + "</span>" : "") + '<span dir="auto">' + esc(b.title) + "</span></a>";
    }).join("\n");
    var head = [
      "<!doctype html>",
      '<html lang="' + lang + '"' + dirAttr + ">",
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      "<title>" + esc(title) + "</title>",
      desc ? '<meta name="description" content="' + esc(desc) + '">' : "",
      '<meta property="og:title" content="' + esc(title) + '">',
      desc ? '<meta property="og:description" content="' + esc(desc) + '">' : "",
      site ? '<meta property="og:url" content="' + esc(site) + '">\n<link rel="canonical" href="' + esc(site) + '">' : "",
      '<meta name="theme-color" content="' + t.bg.c1 + '">',
      pr.avatar && pr.avatar.length < 200000 ? '<link rel="icon" href="' + pr.avatar + '">' : "",
      "<style>" + css + "</style>",
      "</head>"
    ].filter(Boolean).join("\n");
    var html = head + "\n<body>\n" + (t.bg.type === "image" ? '<div class="bg"></div>\n' : "") + "<main>\n" +
      (pr.avatar ? '<img class="av" src="' + pr.avatar + '" alt="' + esc(pr.name) + '" width="96" height="96">\n' : "") +
      (pr.name.trim() ? '<h1 dir="auto">' + esc(pr.name) + "</h1>\n" : "") +
      (pr.bio.trim() ? '<p class="bio" dir="auto">' + esc(pr.bio.trim()) + "</p>\n" : "") +
      (p.socialPos === "top" ? soHtml + "\n" : "") + body + "\n" + (p.socialPos === "bottom" ? soHtml + "\n" : "") +
      (p.credit ? '<footer><a href="https://s3eidat.github.io/link-page/"' + tgt + ">Made with a free link page maker</a></footer>\n" : "") +
      "</main>\n<!-- Made with S3eidat Link Page (free, no scripts): https://s3eidat.github.io/link-page/ -->\n</body>\n</html>\n";
    return html;
  }
  // Accessibility hints about the chosen colours.
  function themeWarnings(page) {
    var t = page.theme, out = [], bgs = t.bg.type === "image" ? [] : t.bg.type === "gradient" ? [t.bg.c1, t.bg.c2] : [t.bg.c1];
    function worst(fg, list) { return list.reduce(function (m, c) { return Math.min(m, contrast(fg, c)); }, 99); }
    if (worst(t.text, bgs) < 3) out.push("The text colour is hard to read on this background.");
    var btnBgs = t.btn.style === "fill" || t.btn.style === "hard" ? [t.btn.bg] : bgs;
    if (worst(t.btn.fg, btnBgs) < 3) out.push("The button text is hard to read on the button.");
    return out;
  }

  // ---------- QR code (byte mode, error correction level M, versions 1–40) ----------
  var ECC_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
  var BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
  function rawModules(v) {
    var r = (16 * v + 128) * v + 64;
    if (v >= 2) { var na = Math.floor(v / 7) + 2; r -= (25 * na - 10) * na - 55; if (v >= 7) r -= 36; }
    return r;
  }
  function dataCodewords(v) { return Math.floor(rawModules(v) / 8) - ECC_M[v] * BLOCKS_M[v]; }
  function gfMul(x, y) { var z = 0; for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 255; }
  function rsDivisor(deg) {
    var r = []; for (var i = 0; i < deg - 1; i++) r.push(0); r.push(1);
    var root = 1;
    for (i = 0; i < deg; i++) { for (var j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gfMul(root, 2); }
    return r;
  }
  function rsRemainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) { var f = b ^ r.shift(); r.push(0); for (var i = 0; i < div.length; i++) r[i] ^= gfMul(div[i], f); });
    return r;
  }
  function utf8(s) {
    if (typeof TextEncoder !== "undefined") return Array.prototype.slice.call(new TextEncoder().encode(s));
    return Array.prototype.slice.call(Buffer.from(s, "utf8"));
  }
  function alignPos(v, size) {
    if (v === 1) return [];
    var n = Math.floor(v / 7) + 2, step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, out = [6];
    for (var pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
    return out;
  }
  function qr(text, forceMask) {
    var bytes = utf8(String(text)), v, cap;
    for (v = 1; v <= 40; v++) { cap = dataCodewords(v) * 8; if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= cap) break; }
    if (v > 40) throw new Error("Too long for a QR code");
    // bit stream
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
    var data = []; for (var i = 0; i < bits.length; i += 8) { var b = 0; for (var j = 0; j < 8; j++) b = b << 1 | bits[i + j]; data.push(b); }
    // error correction + interleave
    var nb = BLOCKS_M[v], ecl = ECC_M[v], raw = Math.floor(rawModules(v) / 8), nShort = nb - raw % nb, shortLen = Math.floor(raw / nb);
    var blocks = [], div = rsDivisor(ecl), k = 0;
    for (i = 0; i < nb; i++) {
      var d = data.slice(k, k + shortLen - ecl + (i < nShort ? 0 : 1)); k += d.length;
      var e = rsRemainder(d, div); if (i < nShort) d.push(0); blocks.push(d.concat(e));
    }
    var cw = [];
    for (i = 0; i < blocks[0].length; i++) for (j = 0; j < blocks.length; j++) if (i !== shortLen - ecl || j >= nShort) cw.push(blocks[j][i]);
    // matrix
    var size = v * 4 + 17, mod = [], fn = [];
    for (i = 0; i < size; i++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function set(x, y, dark) { mod[y][x] = dark; fn[y][x] = true; }
    for (i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var ap = alignPos(v, size);
    ap.forEach(function (ax, ia) { ap.forEach(function (ay, ib) {
      if ((ia === 0 && ib === 0) || (ia === 0 && ib === ap.length - 1) || (ia === ap.length - 1 && ib === 0)) return;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }); });
    function format(mask) {
      var dat = (0 << 3) | mask, rem = dat; // level M = 00
      for (var q = 0; q < 10; q++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var fb = ((dat << 10) | rem) ^ 0x5412;
      function bit(n) { return ((fb >>> n) & 1) !== 0; }
      for (q = 0; q <= 5; q++) set(8, q, bit(q));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (q = 9; q < 15; q++) set(14 - q, 8, bit(q));
      for (q = 0; q < 8; q++) set(size - 1 - q, 8, bit(q));
      for (q = 8; q < 15; q++) set(8, size - 15 + q, bit(q));
      set(8, size - 8, true);
    }
    format(0);
    if (v >= 7) {
      var rem = v; for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      var vb = v << 12 | rem;
      for (i = 0; i < 18; i++) { var bt = ((vb >>> i) & 1) !== 0, a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, bt); set(c, a, bt); }
    }
    // place data
    var bi = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (j = 0; j < 2; j++) {
        var x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && bi < cw.length * 8) { mod[y][x] = ((cw[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
      }
    }
    function applyMask(m) {
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        if (fn[y][x]) continue;
        var inv;
        switch (m) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = x * y % 2 + x * y % 3 === 0; break;
          case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break;
          default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0;
        }
        if (inv) mod[y][x] = !mod[y][x];
      }
    }
    function penalty() {
      var pen = 0, dark = 0, x, y, run, prev;
      function lines(get) {
        for (var a = 0; a < size; a++) {
          run = 0; prev = null; var seq = [];
          for (var b2 = 0; b2 < size; b2++) {
            var c = get(a, b2); seq.push(c ? 1 : 0);
            if (c === prev) { run++; if (run === 5) pen += 3; else if (run > 5) pen++; } else { run = 1; prev = c; }
          }
          var s = "0000" + seq.join("") + "0000"; // the quiet zone counts as light
          for (var at = s.indexOf("1011101"); at >= 0; at = s.indexOf("1011101", at + 1)) {
            if (s.slice(at - 4, at) === "0000" || s.slice(at + 7, at + 11) === "0000") pen += 40;
          }
        }
      }
      lines(function (a, b2) { return mod[a][b2]; });
      lines(function (a, b2) { return mod[b2][a]; });
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) { var c0 = mod[y][x]; if (c0 === mod[y][x + 1] && c0 === mod[y + 1][x] && c0 === mod[y + 1][x + 1]) pen += 3; }
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mod[y][x]) dark++;
      var total = size * size;
      pen += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return pen;
    }
    var best = forceMask, bestPen = Infinity;
    if (best == null) {
      for (var m = 0; m < 8; m++) { applyMask(m); format(m); var pp = penalty(); if (pp < bestPen) { bestPen = pp; best = m; } applyMask(m); }
    }
    applyMask(best); format(best);
    return { size: size, version: v, mask: best, modules: mod };
  }
  function qrSVG(q, fg, bg, margin) {
    margin = margin == null ? 4 : margin; fg = color(fg, "#000000"); bg = color(bg, "#ffffff");
    var n = q.size + margin * 2, d = [];
    for (var y = 0; y < q.size; y++) for (var x = 0; x < q.size; x++) if (q.modules[y][x]) d.push("M" + (x + margin) + "," + (y + margin) + "h1v1h-1z");
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + " " + n + '" shape-rendering="crispEdges"><rect width="' + n + '" height="' + n + '" fill="' + bg + '"/><path fill="' + fg + '" d="' + d.join("") + '"/></svg>';
  }

  var api = { uid: uid, esc: esc, FONTS: FONTS, THEMES: THEMES, themeById: themeById, copyTheme: copyTheme, SOCIALS: SOCIALS, social: social, glyph: glyph,
    fixUrl: fixUrl, urlProblem: urlProblem, socialUrl: socialUrl, hostOf: hostOf, parseLinks: parseLinks, block: block, newPage: newPage, TEMPLATES: TEMPLATES,
    template: template, normalize: normalize, toHTML: toHTML, visibleBlocks: visibleBlocks, themeWarnings: themeWarnings, contrast: contrast, color: color, img: img,
    qr: qr, qrSVG: qrSVG, dataCodewords: dataCodewords };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LinkCore = api;
})(typeof window !== "undefined" ? window : this);
