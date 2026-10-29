/* CRM — contacts, companies, deal pipeline, tasks and an activity timeline. Everything stays in this browser. */
(function () {
  "use strict";
  var $ = S3.$, h = S3.h;
  var KEY = "crm";
  var CURRENCIES = ["USD", "EUR", "GBP", "JOD", "SAR", "AED", "EGP", "KWD", "QAR", "TRY", "INR", "CAD", "AUD"];
  var ACT = { note: "Note", call: "Call", email: "Email", meeting: "Meeting" };
  var DEF_STAGES = [["Lead", 10], ["Contacted", 25], ["Proposal", 50], ["Negotiation", 75], ["Won", 100], ["Lost", 0]];

  // ---------- data ----------
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function str(x, n) { return typeof x === "string" ? x.slice(0, n) : ""; }
  function num(v, lo, hi, d) { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
  var DATE = /^\d{4}-\d{2}-\d{2}$/;
  function blank() {
    return { v: 1, currency: "USD", stages: DEF_STAGES.map(function (s, i) { return { id: "s" + i, name: s[0], prob: s[1], won: s[0] === "Won", lost: s[0] === "Lost" }; }),
      contacts: [], companies: [], deals: [], tasks: [], acts: [] };
  }
  function clean(d) {
    if (!d || typeof d !== "object" || !Array.isArray(d.contacts)) return null;
    var b = blank(), arr = function (x) { return Array.isArray(x) ? x.filter(function (o) { return o && typeof o === "object"; }).slice(0, 50000) : []; };
    b.currency = CURRENCIES.indexOf(d.currency) >= 0 ? d.currency : "USD";
    if (Array.isArray(d.stages) && d.stages.length) b.stages = d.stages.slice(0, 20).filter(function (s) { return s && s.id; }).map(function (s) {
      return { id: str(s.id, 40), name: str(s.name, 40) || "Stage", prob: Math.round(num(s.prob, 0, 100, 0)), won: !!s.won, lost: !!s.lost };
    });
    if (!b.stages.length) b.stages = blank().stages;
    b.companies = arr(d.companies).map(function (c) { return { id: str(c.id, 40) || uid(), name: str(c.name, 120), website: str(c.website, 200), industry: str(c.industry, 80), phone: str(c.phone, 40), notes: str(c.notes, 5000), created: num(c.created, 0, 9e15, Date.now()) }; });
    var compIds = {}; b.companies.forEach(function (c) { compIds[c.id] = 1; });
    b.contacts = arr(d.contacts).map(function (c) {
      return { id: str(c.id, 40) || uid(), name: str(c.name, 120), email: str(c.email, 200), phone: str(c.phone, 40), company: compIds[c.company] ? c.company : "", title: str(c.title, 120),
        tags: (Array.isArray(c.tags) ? c.tags : []).map(function (t) { return str(t, 30).trim(); }).filter(Boolean).slice(0, 20), notes: str(c.notes, 5000), created: num(c.created, 0, 9e15, Date.now()) };
    });
    var conIds = {}; b.contacts.forEach(function (c) { conIds[c.id] = 1; });
    var stageIds = {}; b.stages.forEach(function (s) { stageIds[s.id] = 1; });
    b.deals = arr(d.deals).map(function (x) {
      return { id: str(x.id, 40) || uid(), title: str(x.title, 160), value: num(x.value, 0, 1e13, 0), stage: stageIds[x.stage] ? x.stage : b.stages[0].id, contact: conIds[x.contact] ? x.contact : "",
        company: compIds[x.company] ? x.company : "", close: DATE.test(x.close) ? x.close : "", created: num(x.created, 0, 9e15, Date.now()), notes: str(x.notes, 5000) };
    });
    var dealIds = {}; b.deals.forEach(function (x) { dealIds[x.id] = 1; });
    b.tasks = arr(d.tasks).map(function (t) { return { id: str(t.id, 40) || uid(), title: str(t.title, 200), due: DATE.test(t.due) ? t.due : "", contact: conIds[t.contact] ? t.contact : "", deal: dealIds[t.deal] ? t.deal : "", done: !!t.done, created: num(t.created, 0, 9e15, Date.now()) }; });
    b.acts = arr(d.acts).map(function (a) {
      return { id: str(a.id, 40) || uid(), type: ACT[a.type] ? a.type : "note", text: str(a.text, 5000), at: num(a.at, 0, 9e15, Date.now()),
        contact: conIds[a.contact] ? a.contact : "", deal: dealIds[a.deal] ? a.deal : "", company: compIds[a.company] ? a.company : "" };
    });
    return b;
  }
  var db = clean(S3.store(KEY)) || blank();
  var save = S3.debounce(function () { if (S3.store(KEY, db) === undefined) S3.toast("Couldn't save in this browser. Make a backup file so you don't lose data.", "error"); }, 250);
  var view = S3.store(KEY + ":view") || "dash", q = "";
  function snapshot() { return JSON.stringify(db); }
  function undoToast(msg, before) {
    var t = S3.toast(msg + " ");
    t.appendChild(h("button", { "class": "btn small", type: "button", onclick: function () { db = clean(JSON.parse(before)) || db; save(); render(); t.remove(); } }, ["Undo"]));
  }

  // ---------- helpers ----------
  function byId(list, id) { if (!id) return null; for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function stage(id) { return byId(db.stages, id) || db.stages[0]; }
  function money(v) {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: db.currency, maximumFractionDigits: v % 1 ? 2 : 0, minimumFractionDigits: 0 }).format(v); }
    catch (e) { return db.currency + " " + Math.round(v); }
  }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function fmtDate(s) { if (!s) return ""; try { var p = s.split("-"); return new Date(+p[0], p[1] - 1, +p[2]).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return s; } }
  function ago(ms) {
    var s = (Date.now() - ms) / 1000;
    if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago"; if (s < 86400) return Math.floor(s / 3600) + " h ago";
    if (s < 86400 * 7) return Math.floor(s / 86400) + " d ago";
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function icon(nm) { var s = h("span", { "class": "crm-ic", "aria-hidden": "true" }); s.innerHTML = S3.icon(nm); return s; }
  function btn(label, onclick, cls, ic, title) {
    return h("button", { type: "button", "class": "btn " + (cls || ""), onclick: onclick, title: title || null, "aria-label": title || null }, ic ? [icon(ic)].concat(label ? [label] : []) : [label]);
  }
  function companyName(id) { var c = byId(db.companies, id); return c ? c.name || "Unnamed company" : ""; }
  function contactName(id) { var c = byId(db.contacts, id); return c ? c.name || "Unnamed contact" : ""; }
  function matches(o, fields) { if (!q) return true; var s = fields.map(function (f) { return typeof f === "function" ? f(o) : o[f]; }).join(" ").toLowerCase(); return q.toLowerCase().split(/\s+/).every(function (w) { return s.indexOf(w) >= 0; }); }
  function initials(n) { var w = (n || "?").trim().split(/\s+/); return ((w[0] || "?").charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : "")).toUpperCase(); }
  function empty(title, text, actions) { return h("div", { "class": "empty card" }, [h("b", { text: title }), h("p", { "class": "muted", text: text })].concat(actions ? [h("div", { "class": "row crm-center" }, actions)] : [])); }
  function lastAct(field, id) { var t = 0; db.acts.forEach(function (a) { if (a[field] === id && a.at > t) t = a.at; }); return t; }
  function isOpen(dl) { var s = stage(dl.stage); return !s.won && !s.lost; }

  // ---------- create ----------
  function newContact(pre) { var c = Object.assign({ id: uid(), name: "", email: "", phone: "", company: "", title: "", tags: [], notes: "", created: Date.now() }, pre || {}); db.contacts.unshift(c); save(); open("contact", c.id, true); }
  function newCompany() { var c = { id: uid(), name: "", website: "", industry: "", phone: "", notes: "", created: Date.now() }; db.companies.unshift(c); save(); open("company", c.id, true); }
  function newDeal(pre) { var d = Object.assign({ id: uid(), title: "", value: 0, stage: db.stages[0].id, contact: "", company: "", close: "", notes: "", created: Date.now() }, pre || {}); db.deals.unshift(d); save(); open("deal", d.id, true); }
  function newTask(pre) { var t = Object.assign({ id: uid(), title: "", due: today(), contact: "", deal: "", done: false, created: Date.now() }, pre || {}); db.tasks.unshift(t); save(); open("task", t.id, true); }

  // ---------- drawer (record detail + edit) ----------
  var drawer = null;
  function field(label, el, wide) { return h("label", { "class": "field" + (wide ? " crm-wide" : "") }, [label, el]); }
  function input(o, key, type, ph, onset) {
    var el = type === "textarea" ? h("textarea", { "class": "textarea prose", rows: "3", dir: "auto", placeholder: ph || "" }) : h("input", { "class": "input", type: type || "text", placeholder: ph || "", dir: type === "email" || type === "tel" || type === "url" ? "ltr" : "auto" });
    el.value = o[key] == null ? "" : String(o[key]);
    el.addEventListener("input", function () { o[key] = onset ? onset(el.value) : el.value.slice(0, type === "textarea" ? 5000 : 200); save(); renderBehind(); });
    return el;
  }
  function select(o, key, options, onchange) {
    var el = h("select", { "class": "select" }, options.map(function (x) { return h("option", { value: x[0], text: x[1] }); }));
    el.value = o[key] || ""; el.addEventListener("change", function () { o[key] = el.value; save(); renderBehind(); if (onchange) onchange(); });
    return el;
  }
  function companyOptions() { return [["", "— none —"]].concat(db.companies.slice().sort(byName).map(function (c) { return [c.id, c.name || "Unnamed company"]; })); }
  function contactOptions() { return [["", "— none —"]].concat(db.contacts.slice().sort(byName).map(function (c) { return [c.id, c.name || "Unnamed contact"]; })); }
  function dealOptions() { return [["", "— none —"]].concat(db.deals.map(function (d) { return [d.id, d.title || "Untitled deal"]; })); }
  function byName(a, b) { return (a.name || "").localeCompare(b.name || ""); }
  var renderBehind = S3.debounce(function () { renderView(); stats(); }, 200);
  function open(kind, id, isNew) {
    if (drawer) drawer.close(true);
    var o = byId({ contact: db.contacts, company: db.companies, deal: db.deals, task: db.tasks }[kind], id); if (!o) return;
    var m = h("div", { "class": "s3-modal crm-drawer-wrap", role: "dialog", "aria-modal": "true", "aria-label": kind });
    var sheet = h("div", { "class": "crm-drawer" });
    m.appendChild(sheet);
    var head = h("div", { "class": "row between crm-dhead" }, [h("span", { "class": "chip", text: { contact: "Contact", company: "Company", deal: "Deal", task: "Task" }[kind] }),
      h("div", { "class": "row" }, [btn("", remove, "ghost icon crm-del", "trash", "Delete"), btn("", function () { close(); }, "ghost icon", "x", "Close (Esc)")])]);
    sheet.appendChild(head);
    var body = h("div", { "class": "crm-dbody" }); sheet.appendChild(body);
    var first;
    if (kind === "contact") {
      first = input(o, "name", "text", "Full name");
      var tags = h("input", { "class": "input", type: "text", placeholder: "customer, vip", dir: "auto" }); tags.value = o.tags.join(", ");
      tags.addEventListener("input", function () { o.tags = tags.value.split(",").map(function (t) { return t.trim().slice(0, 30); }).filter(Boolean).slice(0, 20); save(); renderBehind(); });
      body.appendChild(h("div", { "class": "crm-fields" }, [field("Name", first, true), field("Email", input(o, "email", "email", "name@example.com")), field("Phone", input(o, "phone", "tel", "+962 7…")),
        field("Company", select(o, "company", companyOptions())), field("Job title", input(o, "title", "text")), field("Tags (comma separated)", tags, true), field("Notes", input(o, "notes", "textarea"), true)]));
      body.appendChild(links(o));
      body.appendChild(related("Deals", db.deals.filter(function (d) { return d.contact === o.id; }), function (d) { return [d.title || "Untitled deal", money(d.value) + " · " + stage(d.stage).name, function () { open("deal", d.id); }]; },
        btn("Add deal", function () { newDeal({ contact: o.id, company: o.company }); }, "small", "plus")));
      body.appendChild(related("Tasks", db.tasks.filter(function (t) { return t.contact === o.id && !t.done; }), function (t) { return [t.title || "Untitled task", fmtDate(t.due), function () { open("task", t.id); }]; },
        btn("Add task", function () { newTask({ contact: o.id }); }, "small", "plus")));
      body.appendChild(timeline({ contact: o.id }, { contact: o.id, company: o.company }));
    } else if (kind === "company") {
      first = input(o, "name", "text", "Company name");
      body.appendChild(h("div", { "class": "crm-fields" }, [field("Name", first, true), field("Website", input(o, "website", "url", "example.com")), field("Phone", input(o, "phone", "tel")),
        field("Industry", input(o, "industry", "text"), true), field("Notes", input(o, "notes", "textarea"), true)]));
      if (o.website) body.appendChild(h("div", { "class": "row crm-links" }, [h("a", { "class": "btn small", href: /^https?:\/\//i.test(o.website) ? o.website : "https://" + o.website, target: "_blank", rel: "noopener noreferrer" }, ["Open website"])]));
      body.appendChild(related("People", db.contacts.filter(function (c) { return c.company === o.id; }), function (c) { return [c.name || "Unnamed contact", c.title || c.email, function () { open("contact", c.id); }]; },
        btn("Add person", function () { newContact({ company: o.id }); }, "small", "plus")));
      body.appendChild(related("Deals", db.deals.filter(function (d) { return d.company === o.id; }), function (d) { return [d.title || "Untitled deal", money(d.value) + " · " + stage(d.stage).name, function () { open("deal", d.id); }]; },
        btn("Add deal", function () { newDeal({ company: o.id }); }, "small", "plus")));
      body.appendChild(timeline({ company: o.id }, { company: o.id }));
    } else if (kind === "deal") {
      first = input(o, "title", "text", "e.g. Website redesign for Acme");
      var val = h("input", { "class": "input", type: "number", min: "0", step: "any", inputmode: "decimal" }); val.value = o.value || "";
      val.addEventListener("input", function () { o.value = num(val.value, 0, 1e13, 0); save(); renderBehind(); });
      body.appendChild(h("div", { "class": "crm-fields" }, [field("Deal", first, true), field("Value (" + db.currency + ")", val), field("Stage", select(o, "stage", db.stages.map(function (s) { return [s.id, s.name]; }))),
        field("Contact", select(o, "contact", contactOptions(), function () { var c = byId(db.contacts, o.contact); if (c && c.company && !o.company) { o.company = c.company; save(); } })),
        field("Company", select(o, "company", companyOptions())), field("Expected close", input(o, "close", "date")), field("Notes", input(o, "notes", "textarea"), true)]));
      body.appendChild(related("Tasks", db.tasks.filter(function (t) { return t.deal === o.id && !t.done; }), function (t) { return [t.title || "Untitled task", fmtDate(t.due), function () { open("task", t.id); }]; },
        btn("Add task", function () { newTask({ deal: o.id, contact: o.contact }); }, "small", "plus")));
      body.appendChild(timeline({ deal: o.id }, { deal: o.id, contact: o.contact, company: o.company }));
    } else {
      first = input(o, "title", "text", "e.g. Call back about the quote");
      var done = h("input", { type: "checkbox" }); done.checked = o.done; done.addEventListener("change", function () { o.done = done.checked; save(); renderBehind(); });
      body.appendChild(h("div", { "class": "crm-fields" }, [field("Task", first, true), field("Due", input(o, "due", "date")), h("label", { "class": "check crm-done" }, [done, "Done"]),
        field("Contact", select(o, "contact", contactOptions())), field("Deal", select(o, "deal", dealOptions()))]));
    }
    function remove() {
      var before = snapshot();
      if (kind === "contact") { db.contacts = db.contacts.filter(function (x) { return x !== o; }); db.deals.forEach(function (d) { if (d.contact === o.id) d.contact = ""; }); db.tasks.forEach(function (t) { if (t.contact === o.id) t.contact = ""; }); db.acts = db.acts.filter(function (a) { return a.contact !== o.id || a.deal || a.company; }); }
      else if (kind === "company") { db.companies = db.companies.filter(function (x) { return x !== o; }); db.contacts.forEach(function (c) { if (c.company === o.id) c.company = ""; }); db.deals.forEach(function (d) { if (d.company === o.id) d.company = ""; }); }
      else if (kind === "deal") { db.deals = db.deals.filter(function (x) { return x !== o; }); db.tasks.forEach(function (t) { if (t.deal === o.id) t.deal = ""; }); db.acts = db.acts.filter(function (a) { return a.deal !== o.id; }); }
      else db.tasks = db.tasks.filter(function (x) { return x !== o; });
      save(); close(true); render(); undoToast("Deleted", before);
    }
    function close(silent) {
      // a new record left without a name is thrown away
      var nameKey = kind === "deal" || kind === "task" ? "title" : "name";
      if (isNew && !String(o[nameKey] || "").trim() && !silent) {
        var list = { contact: "contacts", company: "companies", deal: "deals", task: "tasks" }[kind];
        db[list] = db[list].filter(function (x) { return x !== o; }); save();
      }
      m.remove(); document.removeEventListener("keydown", onKey); drawer = null; render();
    }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m);
    drawer = { close: close };
    if (first) { first.focus(); if (!isNew) first.setSelectionRange && first.setSelectionRange(0, 0); }
  }
  function links(o) {
    var r = h("div", { "class": "row crm-links" });
    if (o.email) r.appendChild(h("a", { "class": "btn small", href: "mailto:" + encodeURIComponent(o.email).replace(/%40/g, "@") }, ["Email"]));
    if (o.phone) { var tel = o.phone.replace(/[^\d+]/g, ""); r.appendChild(h("a", { "class": "btn small", href: "tel:" + tel }, ["Call"])); r.appendChild(h("a", { "class": "btn small ghost", href: "https://wa.me/" + tel.replace(/^\+/, ""), target: "_blank", rel: "noopener noreferrer" }, ["WhatsApp"])); }
    return r;
  }
  function related(title, list, row, addBtn) {
    var box = h("div", { "class": "crm-rel" }, [h("div", { "class": "row between" }, [h("h3", { text: title + (list.length ? " (" + list.length + ")" : "") }), addBtn])]);
    list.slice(0, 50).forEach(function (x) { var r = row(x); box.appendChild(h("button", { type: "button", "class": "crm-relrow", onclick: r[2] }, [h("b", { text: r[0], dir: "auto" }), h("span", { "class": "faint", text: r[1] || "" })])); });
    return box;
  }
  function timeline(filter, links2) {
    var box = h("div", { "class": "crm-rel" }, [h("h3", { text: "Activity" })]);
    var type = h("select", { "class": "select crm-acttype", "aria-label": "Activity type" }, Object.keys(ACT).map(function (k) { return h("option", { value: k, text: ACT[k] }); }));
    var txt = h("textarea", { "class": "textarea prose", rows: "2", dir: "auto", placeholder: "What happened? e.g. Called, wants a quote by Friday" });
    var list = h("div", { "class": "crm-tl" });
    function draw() {
      list.textContent = "";
      var key = Object.keys(filter)[0], items = db.acts.filter(function (a) { return a[key] === filter[key]; }).sort(function (a, b) { return b.at - a.at; });
      if (!items.length) list.appendChild(h("p", { "class": "faint", text: "Nothing logged yet." }));
      items.forEach(function (a) {
        list.appendChild(h("div", { "class": "crm-act" }, [h("span", { "class": "chip crm-t-" + a.type, text: ACT[a.type] }), h("div", { "class": "grow" }, [h("p", { dir: "auto", text: a.text }), h("span", { "class": "faint", text: ago(a.at) + (a.deal && !filter.deal ? " · " + (byId(db.deals, a.deal) || {}).title : "") })]),
          btn("", function () { var before = snapshot(); db.acts = db.acts.filter(function (x) { return x !== a; }); save(); draw(); undoToast("Removed", before); }, "ghost icon small crm-del", "x", "Remove")]));
      });
    }
    var add = btn("Log", function () {
      var t = txt.value.trim(); if (!t) { txt.focus(); return; }
      db.acts.push(Object.assign({ id: uid(), type: type.value, text: t.slice(0, 5000), at: Date.now(), contact: "", deal: "", company: "" }, links2));
      txt.value = ""; save(); draw(); renderBehind();
    }, "primary small", "plus");
    txt.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add.click(); } });
    box.appendChild(h("div", { "class": "crm-logform" }, [type, txt, add]));
    box.appendChild(list); draw();
    return box;
  }

  // ---------- views ----------
  var VIEWS = [["dash", "Dashboard"], ["deals", "Deals"], ["contacts", "Contacts"], ["companies", "Companies"], ["tasks", "Tasks"]];
  function render() {
    var tabs = $("#crm-tabs"); tabs.textContent = "";
    VIEWS.forEach(function (v) { tabs.appendChild(h("button", { type: "button", "aria-pressed": String(view === v[0]), "data-view": v[0], onclick: function () { go(v[0]); } }, [v[1]])); });
    renderView(); stats();
  }
  function go(v) { view = v; S3.store(KEY + ":view", v); render(); }
  function stats() {
    var open2 = db.deals.filter(isOpen);
    $("#crm-stats").textContent = db.contacts.length + " contacts · " + db.companies.length + " companies · " + open2.length + " open deals worth " + money(open2.reduce(function (s, d) { return s + d.value; }, 0));
  }
  function renderView() {
    var v = $("#crm-view"); v.textContent = "";
    ({ dash: dash, deals: deals, contacts: contacts, companies: companies, tasks: tasks }[view] || dash)(v);
  }
  function dash(v) {
    if (!db.contacts.length && !db.deals.length && !db.companies.length) {
      v.appendChild(h("div", { "class": "card crm-welcome" }, [h("h2", { text: "Your customers, deals and follow-ups in one place" }),
        h("p", { "class": "muted", text: "Add the people you work with, track each deal from first contact to won, and never forget a follow-up. Import a CSV from your phone or email contacts, or try the example." }),
        h("div", { "class": "row" }, [btn("Add a contact", function () { newContact(); }, "primary", "plus"), btn("Import contacts (CSV)", importCsv, "", "upload"), btn("Try with an example", example)])]));
      return;
    }
    var open2 = db.deals.filter(isOpen), month = today().slice(0, 7);
    var won = db.deals.filter(function (d) { var s = stage(d.stage); return s.won && (d.close || new Date(d.created).toISOString()).slice(0, 7) === month; });
    var due = db.tasks.filter(function (t) { return !t.done && t.due && t.due <= today(); });
    v.appendChild(h("div", { "class": "stats crm-stats" }, [
      tile(money(open2.reduce(function (s, d) { return s + d.value; }, 0)), "Open pipeline (" + open2.length + " deals)"),
      tile(money(open2.reduce(function (s, d) { return s + d.value * stage(d.stage).prob / 100; }, 0)), "Weighted by stage"),
      tile(money(won.reduce(function (s, d) { return s + d.value; }, 0)), "Won this month"),
      tile(String(due.length), "Tasks due or overdue")
    ]));
    var g = h("div", { "class": "grid-2 crm-dash" });
    // pipeline bars
    var max = 1, sums = db.stages.map(function (s) { var list = db.deals.filter(function (d) { return d.stage === s.id; }), v2 = list.reduce(function (a, d) { return a + d.value; }, 0); max = Math.max(max, v2); return [s, list.length, v2]; });
    g.appendChild(h("div", { "class": "card" }, [h("h2", { text: "Pipeline" })].concat(sums.map(function (x) {
      return h("div", { "class": "crm-pbar" }, [h("span", { "class": "crm-pname", text: x[0].name }), h("div", { "class": "crm-pmeter" }, [h("span", { style: "width:" + (x[2] / max * 100) + "%" })]), h("span", { "class": "crm-pval", text: money(x[2]) + " · " + x[1] })]);
    }))));
    var upcoming = db.tasks.filter(function (t) { return !t.done; }).sort(function (a, b) { return (a.due || "9") < (b.due || "9") ? -1 : 1; }).slice(0, 7);
    g.appendChild(h("div", { "class": "card" }, [h("div", { "class": "row between" }, [h("h2", { text: "Next tasks" }), btn("Add task", function () { newTask(); }, "small", "plus")])].concat(upcoming.length ? upcoming.map(taskRow) : [h("p", { "class": "faint", text: "No open tasks." })])));
    var recent = db.acts.slice().sort(function (a, b) { return b.at - a.at; }).slice(0, 8);
    g.appendChild(h("div", { "class": "card crm-recent" }, [h("h2", { text: "Recent activity" })].concat(recent.length ? recent.map(function (a) {
      var who = a.contact ? contactName(a.contact) : a.company ? companyName(a.company) : a.deal ? (byId(db.deals, a.deal) || {}).title : "";
      return h("button", { type: "button", "class": "crm-relrow", onclick: function () { if (a.deal) open("deal", a.deal); else if (a.contact) open("contact", a.contact); else if (a.company) open("company", a.company); } },
        [h("b", { dir: "auto", text: ACT[a.type] + (who ? " · " + who : "") }), h("span", { "class": "faint", dir: "auto", text: a.text.slice(0, 90) + " · " + ago(a.at) })]);
    }) : [h("p", { "class": "faint", text: "Log calls, emails and notes on a contact or deal and they appear here." })])));
    var closing = open2.filter(function (d) { return d.close; }).sort(function (a, b) { return a.close < b.close ? -1 : 1; }).slice(0, 6);
    g.appendChild(h("div", { "class": "card" }, [h("h2", { text: "Closing soon" })].concat(closing.length ? closing.map(function (d) {
      return h("button", { type: "button", "class": "crm-relrow", onclick: function () { open("deal", d.id); } }, [h("b", { dir: "auto", text: d.title || "Untitled deal" }), h("span", { "class": "faint", text: money(d.value) + " · " + fmtDate(d.close) + (d.close < today() ? " · overdue" : "") })]);
    }) : [h("p", { "class": "faint", text: "Give deals an expected close date to see them here." })])));
    v.appendChild(g);
  }
  function tile(big, small) { return h("div", { "class": "stat" }, [h("b", { text: big }), h("span", { text: small })]); }
  // pipeline board
  var dragDeal = null;
  function deals(v) {
    v.appendChild(h("div", { "class": "row between crm-vbar" }, [h("span", { "class": "faint", text: "Drag cards between stages, or open a deal to change its stage." }), btn("New deal", function () { newDeal(); }, "primary", "plus")]));
    var board = h("div", { "class": "crm-board" });
    db.stages.forEach(function (s) {
      var list = db.deals.filter(function (d) { return d.stage === s.id && matches(d, ["title", function (x) { return contactName(x.contact) + " " + companyName(x.company); }]); });
      var col = h("div", { "class": "crm-col" + (s.won ? " is-won" : s.lost ? " is-lost" : ""), "data-stage": s.id }, [
        h("div", { "class": "crm-colhead" }, [h("b", { text: s.name }), h("span", { "class": "faint", text: list.length + " · " + money(list.reduce(function (a, d) { return a + d.value; }, 0)) })])
      ]);
      list.forEach(function (d) {
        var card = h("button", { type: "button", "class": "crm-card", draggable: "true", onclick: function () { open("deal", d.id); } }, [
          h("b", { dir: "auto", text: d.title || "Untitled deal" }), h("span", { "class": "crm-val", text: money(d.value) }),
          h("span", { "class": "faint", dir: "auto", text: [contactName(d.contact), companyName(d.company)].filter(Boolean).join(" · ") }),
          d.close ? h("span", { "class": "faint" + (isOpen(d) && d.close < today() ? " crm-late" : ""), text: "Close " + fmtDate(d.close) }) : null
        ]);
        card.addEventListener("dragstart", function (e) { dragDeal = d; card.classList.add("is-drag"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", d.id); });
        card.addEventListener("dragend", function () { dragDeal = null; card.classList.remove("is-drag"); });
        col.appendChild(card);
      });
      col.appendChild(btn("Add", function () { newDeal({ stage: s.id }); }, "ghost small crm-coladd", "plus", "Add a deal in " + s.name));
      col.addEventListener("dragover", function (e) { if (dragDeal) { e.preventDefault(); col.classList.add("is-over"); } });
      col.addEventListener("dragleave", function (e) { if (!col.contains(e.relatedTarget)) col.classList.remove("is-over"); });
      col.addEventListener("drop", function (e) { e.preventDefault(); col.classList.remove("is-over"); if (dragDeal && dragDeal.stage !== s.id) { dragDeal.stage = s.id; if ((s.won || s.lost) && !dragDeal.close) dragDeal.close = today(); save(); render(); } });
      board.appendChild(col);
    });
    v.appendChild(board);
  }
  // tables
  var sortBy = { contacts: ["name", 1], companies: ["name", 1] };
  function table(kind, rows, cols, onRow) {
    var sb = sortBy[kind];
    var head = h("tr", {}, cols.map(function (c) {
      return h("th", {}, [h("button", { type: "button", "class": "crm-th", onclick: function () { if (sb[0] === c[0]) sb[1] = -sb[1]; else { sb[0] = c[0]; sb[1] = 1; } renderView(); } }, [c[1] + (sb[0] === c[0] ? (sb[1] > 0 ? " ↑" : " ↓") : "")])]);
    }));
    var col = cols.filter(function (c) { return c[0] === sb[0]; })[0] || cols[0];
    rows.sort(function (a, b) { var x = col[2](a), y = col[2](b); return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * sb[1]; });
    var body = h("tbody", {}, rows.map(function (r) {
      var tr = h("tr", { tabindex: "0" }, cols.map(function (c, i) { return h("td", { dir: "auto" }, [i === 0 ? h("b", { text: c[3] ? c[3](r) : String(c[2](r)) }) : c[3] ? c[3](r) : String(c[2](r))]); }));
      tr.addEventListener("click", function () { onRow(r); }); tr.addEventListener("keydown", function (e) { if (e.key === "Enter") onRow(r); });
      return tr;
    }));
    return h("div", { "class": "tbl-wrap card crm-tbl" }, [h("table", { "class": "tbl" }, [h("thead", {}, [head]), body])]);
  }
  function contacts(v) {
    v.appendChild(h("div", { "class": "row between crm-vbar" }, [h("span", { "class": "faint", text: db.contacts.length + " contacts" }), h("div", { "class": "row" }, [btn("Import CSV", importCsv, "", "upload"), btn("New contact", function () { newContact(); }, "primary", "plus")])]));
    var rows = db.contacts.filter(function (c) { return matches(c, ["name", "email", "phone", "title", function (x) { return companyName(x.company) + " " + x.tags.join(" "); }]); });
    if (!rows.length) { v.appendChild(empty(q ? "No contacts match" : "No contacts yet", q ? "Try another search." : "Add people one by one or import a CSV from Google Contacts, Outlook or your phone.", q ? null : [btn("New contact", function () { newContact(); }, "primary", "plus"), btn("Import CSV", importCsv, "", "upload")])); return; }
    v.appendChild(table("contacts", rows, [
      ["name", "Name", function (c) { return c.name || "Unnamed contact"; }],
      ["company", "Company", function (c) { return companyName(c.company); }],
      ["email", "Email", function (c) { return c.email; }],
      ["phone", "Phone", function (c) { return c.phone; }],
      ["tags", "Tags", function (c) { return c.tags.join(", "); }, function (c) { return h("span", {}, c.tags.map(function (t) { return h("span", { "class": "chip crm-tag", text: t }); })); }],
      ["last", "Last activity", function (c) { return lastAct("contact", c.id); }, function (c) { var t = lastAct("contact", c.id); return t ? ago(t) : "—"; }]
    ], function (c) { open("contact", c.id); }));
  }
  function companies(v) {
    v.appendChild(h("div", { "class": "row between crm-vbar" }, [h("span", { "class": "faint", text: db.companies.length + " companies" }), btn("New company", newCompany, "primary", "plus")]));
    var rows = db.companies.filter(function (c) { return matches(c, ["name", "industry", "website", "phone"]); });
    if (!rows.length) { v.appendChild(empty(q ? "No companies match" : "No companies yet", q ? "Try another search." : "Companies group the people and deals you have with one organisation.", q ? null : [btn("New company", newCompany, "primary", "plus")])); return; }
    v.appendChild(table("companies", rows, [
      ["name", "Name", function (c) { return c.name || "Unnamed company"; }],
      ["industry", "Industry", function (c) { return c.industry; }],
      ["people", "People", function (c) { return db.contacts.filter(function (x) { return x.company === c.id; }).length; }],
      ["open", "Open deals", function (c) { return db.deals.filter(function (d) { return d.company === c.id && isOpen(d); }).reduce(function (s, d) { return s + d.value; }, 0); }, function (c) { var v2 = db.deals.filter(function (d) { return d.company === c.id && isOpen(d); }).reduce(function (s, d) { return s + d.value; }, 0); return v2 ? money(v2) : "—"; }],
      ["last", "Last activity", function (c) { return lastAct("company", c.id); }, function (c) { var t = lastAct("company", c.id); return t ? ago(t) : "—"; }]
    ], function (c) { open("company", c.id); }));
  }
  function taskRow(t) {
    var c = h("input", { type: "checkbox", "aria-label": "Done: " + (t.title || "task") }); c.checked = t.done;
    c.addEventListener("change", function () { t.done = c.checked; save(); renderView(); stats(); });
    var late = !t.done && t.due && t.due < today(), now = !t.done && t.due === today();
    var link = t.deal ? (byId(db.deals, t.deal) || {}).title : t.contact ? contactName(t.contact) : "";
    return h("div", { "class": "crm-task" + (t.done ? " is-done" : "") }, [c,
      h("button", { type: "button", "class": "crm-task-main", onclick: function () { open("task", t.id); } }, [h("b", { dir: "auto", text: t.title || "Untitled task" }), h("span", { "class": "faint", dir: "auto", text: link || "" })]),
      t.due ? h("span", { "class": "chip" + (late ? " bad" : now ? " warn" : ""), text: late ? "Overdue · " + fmtDate(t.due) : now ? "Today" : fmtDate(t.due) }) : null]);
  }
  function tasks(v) {
    v.appendChild(h("div", { "class": "row between crm-vbar" }, [h("span", { "class": "faint", text: db.tasks.filter(function (t) { return !t.done; }).length + " open tasks" }), btn("New task", function () { newTask(); }, "primary", "plus")]));
    var list = db.tasks.filter(function (t) { return matches(t, ["title", function (x) { return contactName(x.contact) + " " + ((byId(db.deals, x.deal) || {}).title || ""); }]); });
    if (!list.length) { v.appendChild(empty(q ? "No tasks match" : "No tasks yet", q ? "Try another search." : "Add follow-ups with a due date so nothing slips.", q ? null : [btn("New task", function () { newTask(); }, "primary", "plus")])); return; }
    var groups = [["Overdue", function (t) { return !t.done && t.due && t.due < today(); }], ["Today", function (t) { return !t.done && t.due === today(); }],
      ["Upcoming", function (t) { return !t.done && t.due > today(); }], ["No date", function (t) { return !t.done && !t.due; }], ["Done", function (t) { return t.done; }]];
    groups.forEach(function (gr) {
      var items = list.filter(gr[1]).sort(function (a, b) { return (a.due || "") < (b.due || "") ? -1 : 1; });
      if (!items.length) return;
      v.appendChild(h("div", { "class": "card crm-tgroup" }, [h("h2", { text: gr[0] + " (" + items.length + ")" })].concat(items.map(taskRow))));
    });
  }

  // ---------- CSV ----------
  function parseCsv(text) {
    text = String(text).replace(/^﻿/, "");
    var sep = (text.split("\n")[0].match(/;/g) || []).length > (text.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
    var rows = [], row = [], cell = "", qd = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (qd) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else qd = false; } else cell += ch; }
      else if (ch === '"') qd = true;
      else if (ch === sep) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim(); }); });
  }
  function csvCell(v) { v = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCsv(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }
  var GUESS = {
    name: /^(full ?name|name|display name|contact|contact name)$/i, first: /^(first ?name|given name)$/i, last: /^(last ?name|family name|surname)$/i,
    email: /e-?mail( ?address)?( ?1)?( ?- ?value)?$/i, phone: /(phone|mobile|tel|telephone|cell)( ?1)?( ?- ?value)?( ?number)?$/i,
    company: /^(company|organi[sz]ation|organi[sz]ation ?1? ?- ?name|business|account)$/i, title: /^(job ?title|title|position|role|organi[sz]ation ?1? ?- ?title)$/i,
    tags: /^(tags?|labels?|group membership|groups?|categor(y|ies))$/i, notes: /^(notes?|description|comments?)$/i
  };
  var FIELDS = [["name", "Name"], ["first", "First name"], ["last", "Last name"], ["email", "Email"], ["phone", "Phone"], ["company", "Company"], ["title", "Job title"], ["tags", "Tags"], ["notes", "Notes"]];
  function importCsv() {
    var inp = h("input", { type: "file", accept: ".csv,text/csv,text/plain", hidden: true });
    inp.addEventListener("change", function () {
      var f = inp.files[0]; inp.remove(); if (!f) return;
      S3.readFile(f, "text").then(function (txt) {
        var rows = parseCsv(txt);
        if (rows.length < 2) return S3.toast("That CSV has no rows to import", "error");
        mapDialog(rows);
      });
    });
    document.body.appendChild(inp); inp.click();
  }
  function mapDialog(rows) {
    var header = rows[0], data = rows.slice(1), map = {};
    FIELDS.forEach(function (fd) { header.forEach(function (hd, i) { if (map[fd[0]] == null && GUESS[fd[0]].test(hd.trim())) map[fd[0]] = i; }); });
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Import contacts" });
    var grid = h("div", { "class": "crm-fields" });
    FIELDS.forEach(function (fd) {
      var s = h("select", { "class": "select" }, [h("option", { value: "", text: "— skip —" })].concat(header.map(function (hd, i) { return h("option", { value: String(i), text: hd || "Column " + (i + 1) }); })));
      s.value = map[fd[0]] == null ? "" : String(map[fd[0]]);
      s.addEventListener("change", function () { map[fd[0]] = s.value === "" ? null : +s.value; });
      grid.appendChild(h("label", { "class": "field" }, [fd[1], s]));
    });
    var go = btn("Import " + data.length + " contacts", function () {
      var before = snapshot(), byName2 = {}, made = 0;
      db.companies.forEach(function (c) { byName2[c.name.toLowerCase()] = c; });
      function g(r, k) { return map[k] == null ? "" : String(r[map[k]] || "").trim(); }
      data.forEach(function (r) {
        var name = g(r, "name") || [g(r, "first"), g(r, "last")].filter(Boolean).join(" ");
        var email = g(r, "email"), phone = g(r, "phone");
        if (!name && !email && !phone) return;
        var co = g(r, "company"), cid = "";
        if (co) { var k = co.toLowerCase(); if (!byName2[k]) { byName2[k] = { id: uid(), name: co.slice(0, 120), website: "", industry: "", phone: "", notes: "", created: Date.now() }; db.companies.push(byName2[k]); } cid = byName2[k].id; }
        db.contacts.push({ id: uid(), name: (name || email || phone).slice(0, 120), email: email.slice(0, 200), phone: phone.slice(0, 40), company: cid, title: g(r, "title").slice(0, 120),
          tags: g(r, "tags").split(/[,;:]+/).map(function (t) { return t.replace(/\*/g, "").trim().slice(0, 30); }).filter(function (t) { return t && !/^myContacts$/i.test(t); }).slice(0, 20), notes: g(r, "notes").slice(0, 5000), created: Date.now() });
        made++;
      });
      save(); close(); view = "contacts"; render(); undoToast(made + " contacts imported", before);
    }, "primary", "upload");
    var sheet = h("div", { "class": "s3-sheet crm-sheet" }, [h("div", { "class": "row between" }, [h("h2", { text: "Import contacts" }), btn("", close, "ghost icon", "x", "Close")]),
      h("p", { "class": "faint", text: "Match your file's columns to the CRM fields. Companies are created from the Company column." }), grid, h("div", { "class": "row end" }, [btn("Cancel", close, "ghost"), go])]);
    m.appendChild(sheet);
    function close() { m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m); go.focus();
  }
  function exportCsv(kind) {
    var rows;
    if (kind === "contacts") rows = [["Name", "Email", "Phone", "Company", "Job title", "Tags", "Notes"]].concat(db.contacts.map(function (c) { return [c.name, c.email, c.phone, companyName(c.company), c.title, c.tags.join(", "), c.notes]; }));
    else if (kind === "companies") rows = [["Name", "Website", "Industry", "Phone", "Notes"]].concat(db.companies.map(function (c) { return [c.name, c.website, c.industry, c.phone, c.notes]; }));
    else rows = [["Deal", "Value", "Currency", "Stage", "Contact", "Company", "Expected close", "Created"]].concat(db.deals.map(function (d) { return [d.title, d.value, db.currency, stage(d.stage).name, contactName(d.contact), companyName(d.company), d.close, new Date(d.created).toISOString().slice(0, 10)]; }));
    S3.download(toCsv(rows), "crm-" + kind + "-" + today() + ".csv", "text/csv"); S3.done();
  }
  function backup() { S3.download(JSON.stringify(Object.assign({ app: "s3eidat-crm", saved: new Date().toISOString() }, db)), "crm-backup-" + today() + ".json", "application/json"); S3.done(); }
  function restore() {
    var inp = h("input", { type: "file", accept: ".json,application/json", hidden: true });
    inp.addEventListener("change", function () {
      var f = inp.files[0]; inp.remove(); if (!f) return;
      S3.readFile(f, "text").then(function (txt) {
        var d; try { d = clean(JSON.parse(txt)); } catch (e) { d = null; }
        if (!d) return S3.toast("That isn't a CRM backup file", "error");
        if ((db.contacts.length || db.deals.length) && !confirm("Replace everything in the CRM with this backup?")) return;
        var before = snapshot(); db = d; save(); render(); undoToast("Backup restored", before);
      });
    });
    document.body.appendChild(inp); inp.click();
  }

  // ---------- example ----------
  function example() {
    var before = snapshot(), d = blank(), t0 = Date.now(), day = 864e5;
    function co(n, ind, web) { var c = { id: uid(), name: n, industry: ind, website: web, phone: "", notes: "", created: t0 }; d.companies.push(c); return c.id; }
    function pe(n, e, ph, c, title, tags) { var x = { id: uid(), name: n, email: e, phone: ph, company: c, title: title, tags: tags, notes: "", created: t0 }; d.contacts.push(x); return x.id; }
    function dl(title, v, st, con, c, close) { var x = { id: uid(), title: title, value: v, stage: d.stages[st].id, contact: con, company: c, close: close, notes: "", created: t0 }; d.deals.push(x); return x.id; }
    function plus(n) { var x = new Date(Date.now() + n * day); return x.toISOString().slice(0, 10); }
    var a = co("Nour Bakery", "Food", "nourbakery.example"), b = co("Petra Dental Clinic", "Health", "petradental.example"), c = co("Bluewave Logistics", "Logistics", "bluewave.example");
    var p1 = pe("Lina Haddad", "lina@nourbakery.example", "+962 79 000 0001", a, "Owner", ["customer"]);
    var p2 = pe("Omar Saleh", "omar@petradental.example", "+962 77 000 0002", b, "Practice manager", ["lead", "referral"]);
    var p3 = pe("Sara Khalil", "sara@bluewave.example", "+962 78 000 0003", c, "Marketing lead", ["lead"]);
    pe("Yousef Nasser", "yousef@example.com", "", "", "Freelancer", ["partner"]);
    var d1 = dl("New website and online menu", 1800, 2, p1, a, plus(10)), d2 = dl("Clinic booking system", 4200, 1, p2, b, plus(25));
    dl("Social media package", 900, 0, p3, c, plus(40)); dl("Logo refresh", 450, 4, p1, a, plus(-3)); dl("Brochure printing", 300, 5, p3, c, plus(-12));
    d.tasks.push({ id: uid(), title: "Send the website proposal", due: plus(0), contact: p1, deal: d1, done: false, created: t0 });
    d.tasks.push({ id: uid(), title: "Follow up on the booking system call", due: plus(-1), contact: p2, deal: d2, done: false, created: t0 });
    d.tasks.push({ id: uid(), title: "Ask Sara for brand guidelines", due: plus(3), contact: p3, deal: "", done: false, created: t0 });
    d.acts.push({ id: uid(), type: "call", text: "Discussed the menu pages and online orders. Wants a quote this week.", at: t0 - 2 * day, contact: p1, deal: d1, company: a });
    d.acts.push({ id: uid(), type: "meeting", text: "Visited the clinic. Two doctors, online booking is the main need.", at: t0 - 5 * day, contact: p2, deal: d2, company: b });
    d.acts.push({ id: uid(), type: "email", text: "Sent portfolio examples.", at: t0 - day, contact: p3, deal: "", company: c });
    d.currency = "JOD";
    db = clean(d); save(); render(); undoToast("Example loaded", before);
  }

  // ---------- settings ----------
  function settings() {
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Settings" });
    var cur = h("select", { "class": "select" }, CURRENCIES.map(function (c) { return h("option", { value: c, text: c }); })); cur.value = db.currency;
    cur.addEventListener("change", function () { db.currency = cur.value; save(); render(); });
    var stagesBox = h("div", { "class": "crm-stages" });
    function drawStages() {
      stagesBox.textContent = "";
      db.stages.forEach(function (s, i) {
        var nm = h("input", { "class": "input", type: "text", value: s.name, "aria-label": "Stage name", dir: "auto" });
        nm.addEventListener("input", function () { s.name = nm.value.slice(0, 40) || "Stage"; save(); renderBehind(); });
        var pr = h("input", { "class": "input crm-prob", type: "number", min: "0", max: "100", value: String(s.prob), "aria-label": "Win probability %" });
        pr.addEventListener("change", function () { s.prob = Math.round(num(pr.value, 0, 100, s.prob)); pr.value = s.prob; save(); renderBehind(); });
        stagesBox.appendChild(h("div", { "class": "row crm-stage" }, [nm, pr, h("span", { "class": "faint", text: "%" }),
          btn("↑", function () { if (i) { db.stages.splice(i - 1, 0, db.stages.splice(i, 1)[0]); save(); drawStages(); renderBehind(); } }, "ghost icon small", "", "Move up"),
          btn("", function () {
            if (db.stages.length < 2) return;
            if (db.deals.some(function (d) { return d.stage === s.id; })) return S3.toast("Move the deals out of " + s.name + " first", "error");
            db.stages.splice(i, 1); save(); drawStages(); renderBehind();
          }, "ghost icon small crm-del", "trash", "Delete stage")]));
      });
    }
    drawStages();
    var sheet = h("div", { "class": "s3-sheet crm-sheet" }, [h("div", { "class": "row between" }, [h("h2", { text: "Settings" }), btn("", close, "ghost icon", "x", "Close")]),
      h("label", { "class": "field" }, ["Currency", cur]),
      h("h3", { "class": "crm-h3", text: "Pipeline stages and win probability" }), stagesBox,
      h("div", { "class": "row" }, [btn("Add stage", function () { db.stages.splice(Math.max(0, db.stages.length - 2), 0, { id: uid(), name: "New stage", prob: 50, won: false, lost: false }); save(); drawStages(); renderBehind(); }, "small", "plus")]),
      h("p", { "class": "faint", text: "Deals in a stage named as won count towards Won this month; the last two default stages are Won and Lost." })]);
    m.appendChild(sheet);
    function close() { m.remove(); document.removeEventListener("keydown", onKey); render(); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m); cur.focus();
  }

  function help() {
    var keys = [["C", "New contact"], ["D", "New deal"], ["T", "New task"], ["1 – 5", "Dashboard, Deals, Contacts, Companies, Tasks"], ["/", "Search"], ["Ctrl+Enter", "Log the activity you typed"], ["Esc", "Close the panel"]];
    var m = h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Keyboard shortcuts" });
    var sheet = h("div", { "class": "s3-sheet" }, [h("div", { "class": "row between" }, [h("h2", { text: "Keyboard shortcuts" }), btn("", close, "ghost icon", "x", "Close")]),
      h("div", { "class": "crm-keys" }, keys.map(function (k) { return h("div", { "class": "row" }, [h("kbd", { text: k[0] }), h("span", { "class": "muted", text: k[1] })]); }))]);
    m.appendChild(sheet);
    function close() { m.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(m); sheet.querySelector("button").focus();
  }

  // ---------- self-test ----------
  window.S3_SELFTEST = async function () {
    try {
      var ok = true;
      var rows = parseCsv('\uFEFFName,Notes\r\n"Ali, Jr.","says ""hi""\nline2"\r\n\r\nBob,x');
      ok = ok && rows.length === 3 && rows[1][0] === "Ali, Jr." && rows[1][1] === 'says "hi"\nline2' && rows[2][1] === "x";
      var semi = parseCsv("Name;Email\nAna;a@b.c"); ok = ok && semi[1][1] === "a@b.c";
      var out = toCsv([["=SUM(A1)", 'a"b', "plain"]]);
      ok = ok && out === "\uFEFF'=SUM(A1),\"a\"\"b\",plain\r\n";
      var c = clean({ contacts: [{ id: "a", name: "X", company: "nope", tags: ["t", 5, ""] }], deals: [{ id: "d", stage: "zzz", value: -5, contact: "a" }], tasks: [{ due: "tomorrow" }], acts: [{ type: "fax", contact: "a" }], currency: "XXX" });
      ok = ok && c.contacts[0].company === "" && c.contacts[0].tags.join() === "t" && c.deals[0].stage === c.stages[0].id && c.deals[0].value === 0 && c.deals[0].contact === "a" && c.tasks[0].due === "" && c.acts[0].type === "note" && c.currency === "USD";
      ok = ok && GUESS.email.test("E-mail 1 - Value") && GUESS.phone.test("Phone 1 - Value") && GUESS.company.test("Organization 1 - Name") && GUESS.first.test("Given Name") && !GUESS.name.test("Nickname");
      ok = ok && clean(null) === null && /\d/.test(money(1234.5));
      return ok;
    } catch (e) { return false; }
  };

  // ---------- actions ----------
  function menu(label, ic, items) {
    var d = h("details", { "class": "crm-menu" }, [h("summary", { "class": "btn" + (label === "New" ? " primary" : "") }, [icon(ic), label])]);
    var list = h("div", { "class": "crm-menu-list", role: "menu" });
    items.forEach(function (it) { if (!it) return list.appendChild(h("hr")); list.appendChild(h("button", { type: "button", role: "menuitem", onclick: function () { d.open = false; it[1](); } }, [it[0]])); });
    d.appendChild(list);
    d.addEventListener("toggle", function () { if (!d.open) return; list.style.left = ""; list.style.right = ""; if (list.getBoundingClientRect().left < 8) { list.style.left = "0"; list.style.right = "auto"; } });
    document.addEventListener("click", function (e) { if (d.open && !d.contains(e.target)) d.open = false; });
    return d;
  }
  function actions() {
    var a = $("#crm-actions");
    a.appendChild(menu("Data", "file", [["Import contacts (CSV)…", importCsv], ["Export contacts (CSV)", function () { exportCsv("contacts"); }], ["Export companies (CSV)", function () { exportCsv("companies"); }],
      ["Export deals (CSV)", function () { exportCsv("deals"); }], null, ["Save backup file", backup], ["Restore backup…", restore], null, ["Load example data", example], ["Settings…", settings]]));
    a.appendChild(btn("?", help, "ghost icon", "", "Keyboard shortcuts (?)"));
    a.appendChild(menu("New", "plus", [["Contact", function () { newContact(); }], ["Company", newCompany], ["Deal", function () { newDeal(); }], ["Task", function () { newTask(); }]]));
  }
  $("#crm-q").addEventListener("input", S3.debounce(function (e) { q = e.target.value.trim(); if (view === "dash") { view = "contacts"; render(); } else renderView(); }, 150));
  document.addEventListener("keydown", function (e) {
    if ($(".s3-modal") || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target && e.target.tagName; if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    var k = e.key.toLowerCase();
    if (k === "/") { e.preventDefault(); $("#crm-q").focus(); }
    else if (k === "c") newContact(); else if (k === "d") newDeal(); else if (k === "t") newTask();
    else if (/^[1-5]$/.test(k)) go(VIEWS[+k - 1][0]);
    else if (k === "?") help();
  });
  actions();
  if (!VIEWS.some(function (v) { return v[0] === view; })) view = "dash";
  render();
  window.CRM = { db: function () { return db; }, clean: clean, parseCsv: parseCsv, toCsv: toCsv, money: money };
})();
