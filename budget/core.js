/* Budget core: data model, envelope maths, money parsing, CSV import, schedules, reports. No DOM, no network.
   Amounts are integers in the currency's minor unit (fils, cents…). Months are "YYYY-MM", days "YYYY-MM-DD". */
(function (root) {
  "use strict";

  var INC = "inc";       // category id meaning "ready to assign" (income)
  var UNCAT = "uncat";   // spending with no category yet

  var CURRENCIES = ["JOD", "USD", "EUR", "GBP", "SAR", "AED", "KWD", "QAR", "BHD", "OMR", "EGP", "IQD", "LBP", "SYP",
    "MAD", "TND", "DZD", "LYD", "YER", "SDG", "TRY", "ILS", "INR", "PKR", "CAD", "AUD", "CHF", "JPY", "CNY", "MYR",
    "IDR", "NGN", "KES", "ZAR", "BRL", "MXN"];

  var ACCOUNT_TYPES = { checking: "Checking", savings: "Savings", cash: "Cash", credit: "Credit card", loan: "Loan" };

  // ---------- ids, dates ----------
  function uid() {
    var a = new Uint8Array(8);
    (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; });
    return Array.prototype.map.call(a, function (b) { return (b + 256).toString(16).slice(1); }).join("");
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function monthOf(day) { return String(day).slice(0, 7); }
  function addMonths(m, n) {
    var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + n;
    y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
    return y + "-" + pad(mo + 1);
  }
  function monthDiff(a, b) { return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); }
  function daysIn(m) { return new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(); }
  function validDay(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var m = +s.slice(5, 7), d = +s.slice(8, 10);
    return m >= 1 && m <= 12 && d >= 1 && d <= daysIn(s.slice(0, 7));
  }
  function addDays(day, n) {
    var d = new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + n);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  // ---------- money ----------
  function decimalsFor(cur) {
    try { return new Intl.NumberFormat("en", { style: "currency", currency: cur }).resolvedOptions().maximumFractionDigits; }
    catch (e) { return 2; }
  }
  var fmtCache = {};
  function fmt(minor, cur, dec, plain) {
    var key = cur + dec + (plain ? "p" : "");
    var f = fmtCache[key];
    if (!f) {
      try {
        f = fmtCache[key] = new Intl.NumberFormat("en", plain ? { minimumFractionDigits: dec, maximumFractionDigits: dec } :
          { style: "currency", currency: cur, currencyDisplay: "narrowSymbol", minimumFractionDigits: dec, maximumFractionDigits: dec });
      } catch (e) { f = fmtCache[key] = new Intl.NumberFormat("en", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
    }
    var v = (minor || 0) / Math.pow(10, dec);
    return f.format(v === 0 ? 0 : v); // no "-0"
  }
  // Plain number text for an input field ("12.500"), no grouping.
  function toInput(minor, dec) { return minor ? (minor / Math.pow(10, dec)).toFixed(dec) : ""; }

  // Arabic-Indic and Persian digits → ASCII; Arabic decimal/thousands separators → . and nothing.
  function asciiDigits(s) {
    return String(s).replace(/[\u0660-\u0669]/g, function (c) { return c.charCodeAt(0) - 0x660; })
      .replace(/[\u06F0-\u06F9]/g, function (c) { return c.charCodeAt(0) - 0x6F0; })
      .replace(/\u066B/g, ".").replace(/\u066C/g, "");
  }
  // "1,234.5" "1.234,5" "12,5" → JS number text. Decides by which separator comes last.
  function normalizeNumber(s) {
    s = s.replace(/[\s\u00A0\u202F']/g, "");
    var lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
    if (lc > -1 && ld > -1) {
      if (lc > ld) s = s.replace(/\./g, "").replace(",", "."); else s = s.replace(/,/g, "");
    } else if (lc > -1) {
      // a single comma followed by 1-2 digits reads as decimal ("12,5"), otherwise as thousands ("1,200")
      var after = s.length - lc - 1, commas = s.split(",").length - 1;
      if (commas === 1 && (after > 0 && after < 3)) s = s.replace(",", "."); else s = s.replace(/,/g, "");
    }
    return s;
  }
  // Parse what a person types in an amount field: "12.5", "1,200", "٣٥", "20+15.25", "100/3". Returns minor units or NaN.
  function parseAmount(str, dec) {
    var s = asciiDigits(String(str == null ? "" : str)).trim();
    if (!s) return 0;
    s = s.replace(/[^\d.,+\-*/()×÷]/g, "").replace(/×/g, "*").replace(/÷/g, "/");
    // numbers are separated from operators so a "," inside a number is handled per number
    var toks = s.match(/[\d.,]+|[+\-*/()]/g);
    if (!toks) return NaN;
    var i = 0;
    function num(t) { var n = Number(normalizeNumber(t)); if (!isFinite(n)) throw 0; return n; }
    function factor() {
      var t = toks[i++];
      if (t === "-") return -factor();
      if (t === "+") return factor();
      if (t === "(") { var v = expr(); if (toks[i++] !== ")") throw 0; return v; }
      if (t == null || /[*/)]/.test(t)) throw 0;
      return num(t);
    }
    function term() {
      var v = factor();
      while (toks[i] === "*" || toks[i] === "/") { var op = toks[i++], r = factor(); v = op === "*" ? v * r : v / r; }
      return v;
    }
    function expr() {
      var v = term();
      while (toks[i] === "+" || toks[i] === "-") { var op = toks[i++], r = term(); v = op === "+" ? v + r : v - r; }
      return v;
    }
    try {
      var v = expr();
      if (i !== toks.length || !isFinite(v)) return NaN;
      return Math.round(v * Math.pow(10, dec));
    } catch (e) { return NaN; }
  }

  // ---------- budget shape ----------
  var STARTER = {
    en: [["Bills", ["Rent or mortgage", "Electricity and water", "Phone and internet", "Insurance"]],
      ["Everyday", ["Groceries", "Transport and fuel", "Eating out", "Household", "Health"]],
      ["Goals", ["Emergency fund", "Holidays", "Gifts and Eid", "Big purchases"]],
      ["Fun", ["Hobbies", "Subscriptions", "Spending money"]]],
    ar: [["الفواتير", ["الإيجار أو القسط", "الكهرباء والماء", "الهاتف والإنترنت", "التأمين"]],
      ["المصاريف اليومية", ["البقالة", "المواصلات والوقود", "الأكل خارج البيت", "مستلزمات البيت", "الصحة"]],
      ["الأهداف", ["صندوق الطوارئ", "السفر", "الهدايا والعيد", "مشتريات كبيرة"]],
      ["الترفيه", ["الهوايات", "الاشتراكات", "مصروف شخصي"]]]
  };

  function newBudget(opts) {
    opts = opts || {};
    var cur = CURRENCIES.indexOf(opts.cur) >= 0 ? opts.cur : "USD";
    var b = {
      app: "s3-budget", v: 1, id: uid(), name: opts.name || "My budget", cur: cur, dec: decimalsFor(cur),
      created: today(), groups: [], accounts: [], tx: [], assign: {}, sched: [], payees: {}, backedUp: null
    };
    (opts.starter === false ? [] : STARTER[opts.lang === "ar" ? "ar" : "en"]).forEach(function (g) {
      b.groups.push({ id: uid(), name: g[0], cats: g[1].map(function (n) { return { id: uid(), name: n, target: null, note: "" }; }) });
    });
    return b;
  }

  // Bring any parsed object (old version, hand edited, partial) into a safe shape. Throws on non-budgets.
  function normalize(o) {
    if (!o || typeof o !== "object") throw new Error("Not a budget file");
    if (o.app === "s3-budget" && o.budget) o = o.budget; // backup envelope
    if (o.app !== "s3-budget" || !Array.isArray(o.groups) || !Array.isArray(o.tx)) throw new Error("Not a budget file");
    var str = function (v, max) { return String(v == null ? "" : v).slice(0, max || 200); };
    var int = function (v) { v = Math.round(Number(v)); return isFinite(v) ? v : 0; };
    var b = {
      app: "s3-budget", v: 1, id: str(o.id, 40) || uid(), name: str(o.name, 80) || "My budget",
      cur: CURRENCIES.indexOf(o.cur) >= 0 ? o.cur : "USD", dec: 2, created: validDay(o.created) ? o.created : today(),
      groups: [], accounts: [], tx: [], assign: {}, sched: [], payees: {}, backedUp: o.backedUp ? str(o.backedUp, 40) : null
    };
    b.dec = [0, 2, 3].indexOf(o.dec) >= 0 ? o.dec : decimalsFor(b.cur);
    var catIds = {};
    o.groups.forEach(function (g) {
      if (!g || !Array.isArray(g.cats)) return;
      var ng = { id: str(g.id, 40) || uid(), name: str(g.name, 80), cats: [] };
      g.cats.forEach(function (c) {
        if (!c || !c.id || catIds[c.id] || c.id === INC || c.id === UNCAT) return;
        var t = c.target && ["monthly", "refill", "date"].indexOf(c.target.type) >= 0 ?
          { type: c.target.type, amt: Math.max(0, int(c.target.amt)), date: /^\d{4}-\d{2}$/.test(c.target.date) ? c.target.date : null } : null;
        if (t && t.type === "date" && !t.date) t = null;
        catIds[c.id] = 1;
        ng.cats.push({ id: str(c.id, 40), name: str(c.name, 80), target: t, note: str(c.note, 500), hidden: !!c.hidden });
      });
      b.groups.push(ng);
    });
    var acctIds = {};
    (o.accounts || []).forEach(function (a) {
      if (!a || !a.id || acctIds[a.id]) return;
      acctIds[a.id] = 1;
      b.accounts.push({ id: str(a.id, 40), name: str(a.name, 80), type: ACCOUNT_TYPES[a.type] ? a.type : "checking", closed: !!a.closed, note: str(a.note, 300) });
    });
    var txIds = {};
    o.tx.forEach(function (t) {
      if (!t || !acctIds[t.a] || !validDay(t.d) || txIds[t.id]) return;
      var c = t.c === INC || catIds[t.c] ? t.c : null;
      var x = t.xfer && acctIds[t.xfer] && t.xfer !== t.a ? t.xfer : null;
      txIds[t.id = str(t.id, 40) || uid()] = 1;
      b.tx.push({ id: t.id, a: t.a, d: t.d, p: str(t.p, 120), c: x ? null : c, m: str(t.m, 300), amt: int(t.amt), clr: [0, 1, 2].indexOf(t.clr) >= 0 ? t.clr : 0,
        xfer: x, xid: x ? str(t.xid, 40) : null, imp: t.imp ? str(t.imp, 80) : undefined });
    });
    // a transfer whose other half is missing becomes a plain uncategorized transaction
    var byId = {}; b.tx.forEach(function (t) { byId[t.id] = t; });
    b.tx.forEach(function (t) { if (t.xfer && !(byId[t.xid] && byId[t.xid].xid === t.id)) { t.xfer = null; t.xid = null; } });
    Object.keys(o.assign || {}).forEach(function (m) {
      if (!/^\d{4}-\d{2}$/.test(m) || typeof o.assign[m] !== "object") return;
      var row = {};
      Object.keys(o.assign[m]).forEach(function (c) { var v = int(o.assign[m][c]); if (catIds[c] && v) row[c] = v; });
      if (Object.keys(row).length) b.assign[m] = row;
    });
    (o.sched || []).forEach(function (s) {
      if (!s || !acctIds[s.a] || !validDay(s.next) || !FREQ[s.freq]) return;
      var x = s.xfer && acctIds[s.xfer] && s.xfer !== s.a ? s.xfer : null;
      b.sched.push({ id: str(s.id, 40) || uid(), a: s.a, p: str(s.p, 120), c: x ? null : (s.c === INC || catIds[s.c] ? s.c : null), m: str(s.m, 300),
        amt: int(s.amt), xfer: x, freq: s.freq, next: s.next, day: Math.min(31, Math.max(1, int(s.day) || +s.next.slice(8, 10))) });
    });
    Object.keys(o.payees || {}).forEach(function (p) { var c = o.payees[p]; if (c === INC || catIds[c]) b.payees[str(p, 120)] = c; });
    return b;
  }

  // ---------- lookups ----------
  function allCats(b) { var out = []; b.groups.forEach(function (g) { g.cats.forEach(function (c) { out.push(c); }); }); return out; }
  function findCat(b, id) {
    for (var i = 0; i < b.groups.length; i++) for (var j = 0; j < b.groups[i].cats.length; j++) if (b.groups[i].cats[j].id === id) return { g: b.groups[i], c: b.groups[i].cats[j] };
    return null;
  }
  function findAcct(b, id) { for (var i = 0; i < b.accounts.length; i++) if (b.accounts[i].id === id) return b.accounts[i]; return null; }
  function findTx(b, id) { for (var i = 0; i < b.tx.length; i++) if (b.tx[i].id === id) return b.tx[i]; return null; }

  // ---------- the envelope maths ----------
  // For the viewed month M:
  //   available(cat, m) = max(available(cat, m-1), 0) + assigned(cat, m) + activity(cat, m)
  //   overspending in a month (negative available) does not roll over in the category; it is taken out of
  //   ready to assign from the next month on.
  //   readyToAssign(M) = income dated up to the end of M \u2212 everything assigned in any month \u2212 overspending before M
  function compute(b, M) {
    var cats = allCats(b), ids = cats.map(function (c) { return c.id; }).concat([UNCAT]);
    var catSet = {}; cats.forEach(function (c) { catSet[c.id] = 1; });
    var income = {}, activity = {}, first = M;
    b.tx.forEach(function (t) {
      var m = monthOf(t.d);
      if (m < first) first = m;
      if (t.xfer) return;
      if (t.c === INC) { income[m] = (income[m] || 0) + t.amt; return; }
      var c = t.c && catSet[t.c] ? t.c : UNCAT;
      var row = activity[m] || (activity[m] = {});
      row[c] = (row[c] || 0) + t.amt;
    });
    var totalAssigned = 0;
    Object.keys(b.assign).forEach(function (m) {
      if (m < first) first = m;
      var row = b.assign[m];
      for (var c in row) if (catSet[c]) totalAssigned += row[c];
    });
    var carry = {}, overBefore = 0, incomeTo = 0, out = null;
    for (var m = first; m <= M; m = addMonths(m, 1)) {
      var asg = b.assign[m] || {}, act = activity[m] || {}, over = 0, res = {};
      incomeTo += income[m] || 0;
      ids.forEach(function (id) {
        var start = Math.max(carry[id] || 0, 0), a = id === UNCAT ? 0 : (asg[id] || 0), ac = act[id] || 0, av = start + a + ac;
        res[id] = { start: start, assigned: a, activity: ac, available: av };
        carry[id] = av;
        if (av < 0) over += av;
      });
      if (m === M) {
        out = { month: M, cats: res, income: income[M] || 0, overspentBefore: overBefore, overspentNow: over,
          rta: incomeTo - totalAssigned + overBefore };
        var ta = 0, tc = 0, tv = 0;
        ids.forEach(function (id) { ta += res[id].assigned; tc += res[id].activity; tv += res[id].available; });
        out.totals = { assigned: ta, activity: tc, available: tv };
        out.futureAssigned = 0;
        Object.keys(b.assign).forEach(function (fm) { if (fm > M) for (var c in b.assign[fm]) if (catSet[c]) out.futureAssigned += b.assign[fm][c]; });
      }
      overBefore += over;
    }
    cats.forEach(function (c) { out.cats[c.id].need = need(c, out.cats[c.id], M); });
    return out;
  }

  // How much more to assign this month to stay on target (0 when on track or no target).
  function need(cat, r, M) {
    var t = cat.target;
    if (!t || !t.amt) return 0;
    if (t.type === "monthly") return Math.max(0, t.amt - r.assigned);
    if (t.type === "refill") return Math.max(0, t.amt - (r.start + r.assigned));
    if (t.type === "date") {
      var left = monthDiff(M, t.date) + 1;               // months including this one
      var short = t.amt - r.start;                       // still to put aside from the start of this month
      if (short <= 0) return 0;
      var per = left <= 1 ? short : Math.ceil(short / left);
      return Math.max(0, per - r.assigned);
    }
    return 0;
  }
  function targetText(t, f) {
    if (!t) return "";
    if (t.type === "monthly") return "Assign " + f(t.amt) + " every month";
    if (t.type === "refill") return "Have " + f(t.amt) + " available each month";
    var d = new Date(+t.date.slice(0, 4), +t.date.slice(5, 7) - 1, 1);
    return "Save " + f(t.amt) + " by " + d.toLocaleDateString("en", { month: "short", year: "numeric" });
  }

  function setAssigned(b, M, catId, amt) {
    var row = b.assign[M] || (b.assign[M] = {});
    if (amt) row[catId] = amt; else delete row[catId];
    if (!Object.keys(row).length) delete b.assign[M];
  }
  function getAssigned(b, M, catId) { return (b.assign[M] || {})[catId] || 0; }
  // Move money between categories in month M (from or to may be INC = ready to assign).
  function moveMoney(b, M, from, to, amt) {
    if (!amt || from === to) return;
    if (from !== INC) setAssigned(b, M, from, getAssigned(b, M, from) - amt);
    if (to !== INC) setAssigned(b, M, to, getAssigned(b, M, to) + amt);
  }
  // Assign what every target needs this month, as far as ready to assign allows (in plan order). Returns total assigned.
  function assignTargets(b, M) {
    var r = compute(b, M), left = Math.max(0, r.rta), total = 0;
    allCats(b).forEach(function (c) {
      var n = Math.min(r.cats[c.id].need, left);
      if (n > 0) { setAssigned(b, M, c.id, getAssigned(b, M, c.id) + n); left -= n; total += n; }
    });
    return total;
  }
  // Cover every overspent category this month from ready to assign (as far as it goes).
  function coverOverspending(b, M) {
    var r = compute(b, M), left = Math.max(0, r.rta), total = 0;
    allCats(b).forEach(function (c) {
      var av = r.cats[c.id].available;
      if (av < 0 && left > 0) { var n = Math.min(-av, left); setAssigned(b, M, c.id, getAssigned(b, M, c.id) + n); left -= n; total += n; }
    });
    return total;
  }
  // Copy last month's assigned amounts into M for categories not yet assigned.
  function copyLastMonth(b, M) {
    var prev = b.assign[addMonths(M, -1)] || {}, n = 0;
    Object.keys(prev).forEach(function (c) { if (!getAssigned(b, M, c) && findCat(b, c)) { setAssigned(b, M, c, prev[c]); n++; } });
    return n;
  }

  // ---------- accounts and transactions ----------
  function balances(b, upTo) {
    var out = {};
    b.accounts.forEach(function (a) { out[a.id] = { total: 0, cleared: 0, uncleared: 0 }; });
    b.tx.forEach(function (t) {
      if (upTo && t.d > upTo) return;
      var o = out[t.a]; if (!o) return;
      o.total += t.amt; if (t.clr) o.cleared += t.amt; else o.uncleared += t.amt;
    });
    return out;
  }
  function addAccount(b, name, type, startAmt, day) {
    var a = { id: uid(), name: name || "Account", type: ACCOUNT_TYPES[type] ? type : "checking", closed: false, note: "" };
    b.accounts.push(a);
    if (startAmt) b.tx.push({ id: uid(), a: a.id, d: validDay(day) ? day : today(), p: "Starting balance", c: INC, m: "", amt: startAmt, clr: 1, xfer: null, xid: null });
    return a;
  }
  // Save a transaction from a plain object {id?, a, d, p, c, m, amt, clr, xfer}. Keeps transfer halves in sync.
  function saveTx(b, o) {
    var t = o.id ? findTx(b, o.id) : null;
    if (t && t.xfer && t.xid) { var oldPair = findTx(b, t.xid); if (oldPair && (!o.xfer || o.xfer !== t.xfer)) removeTxOnly(b, oldPair.id); }
    if (!t) { t = { id: uid(), clr: 0, xid: null }; b.tx.push(t); }
    t.a = o.a; t.d = o.d; t.p = String(o.p || "").slice(0, 120); t.m = String(o.m || "").slice(0, 300); t.amt = Math.round(Number(o.amt) || 0);
    t.clr = o.clr ? (t.clr === 2 ? 2 : 1) : 0;
    if (o.imp) t.imp = o.imp;
    if (o.xfer && o.xfer !== o.a && findAcct(b, o.xfer)) {
      t.xfer = o.xfer; t.c = null;
      var pair = t.xid ? findTx(b, t.xid) : null;
      if (!pair) { pair = { id: uid(), clr: 0 }; b.tx.push(pair); t.xid = pair.id; }
      pair.a = o.xfer; pair.d = t.d; pair.p = t.p; pair.m = t.m; pair.amt = -t.amt; pair.c = null; pair.xfer = t.a; pair.xid = t.id;
      if (pair.clr == null) pair.clr = 0;
    } else {
      t.xfer = null; t.xid = null;
      t.c = o.c === INC || (o.c && findCat(b, o.c)) ? o.c : null;
      var key = t.p.trim().toLowerCase();
      if (key && t.c && key !== "starting balance") b.payees[key] = t.c;
    }
    return t;
  }
  function removeTxOnly(b, id) { b.tx = b.tx.filter(function (t) { return t.id !== id; }); }
  function deleteTx(b, id) {
    var t = findTx(b, id); if (!t) return;
    var ids = [id]; if (t.xid) ids.push(t.xid);
    b.tx = b.tx.filter(function (x) { return ids.indexOf(x.id) < 0; });
  }
  function sortedTx(b) {
    return b.tx.slice().sort(function (x, y) { return x.d < y.d ? 1 : x.d > y.d ? -1 : 0; });
  }
  // Reconcile account a against the bank's balance: add an adjustment if needed, mark cleared as reconciled.
  function reconcile(b, aId, bankBalance, day) {
    var bal = balances(b)[aId], diff = bankBalance - bal.cleared, adj = null;
    if (diff) adj = saveTx(b, { a: aId, d: day || today(), p: "Reconciliation adjustment", c: INC, m: "", amt: diff, clr: 1 });
    b.tx.forEach(function (t) { if (t.a === aId && t.clr) t.clr = 2; });
    return { diff: diff, adj: adj };
  }
  function deleteCategory(b, catId, moveTo) {
    var f = findCat(b, catId); if (!f) return;
    var target = moveTo && moveTo !== catId && findCat(b, moveTo) ? moveTo : null;
    b.tx.forEach(function (t) { if (t.c === catId) t.c = target; });
    b.sched.forEach(function (s) { if (s.c === catId) s.c = target; });
    Object.keys(b.assign).forEach(function (m) {
      var v = b.assign[m][catId];
      if (v != null) { delete b.assign[m][catId]; if (target) setAssigned(b, m, target, getAssigned(b, m, target) + v); }
      if (!Object.keys(b.assign[m] || {}).length) delete b.assign[m];
    });
    Object.keys(b.payees).forEach(function (p) { if (b.payees[p] === catId) delete b.payees[p]; });
    f.g.cats = f.g.cats.filter(function (c) { return c.id !== catId; });
  }

  // ---------- scheduled / recurring ----------
  var FREQ = { once: "Once", weekly: "Every week", biweekly: "Every 2 weeks", monthly: "Every month", quarterly: "Every 3 months", yearly: "Every year" };
  function nextDate(s) {
    if (s.freq === "weekly") return addDays(s.next, 7);
    if (s.freq === "biweekly") return addDays(s.next, 14);
    var n = s.freq === "monthly" ? 1 : s.freq === "quarterly" ? 3 : s.freq === "yearly" ? 12 : 0;
    if (!n) return null;
    var m = addMonths(monthOf(s.next), n);
    return m + "-" + pad(Math.min(s.day || 1, daysIn(m)));
  }
  function addSched(b, o) {
    var s = { id: uid(), a: o.a, p: o.p || "", c: o.xfer ? null : o.c || null, m: o.m || "", amt: o.amt, xfer: o.xfer || null,
      freq: FREQ[o.freq] ? o.freq : "monthly", next: o.next, day: +o.next.slice(8, 10) };
    b.sched.push(s);
    return s;
  }
  // Enter one occurrence of a schedule now (on its date) and move it forward.
  function enterSched(b, id) {
    var s = null; b.sched.forEach(function (x) { if (x.id === id) s = x; });
    if (!s) return null;
    var t = saveTx(b, { a: s.a, d: s.next, p: s.p, c: s.c, m: s.m, amt: s.amt, xfer: s.xfer, clr: 0 });
    skipSched(b, id);
    return t;
  }
  function skipSched(b, id) {
    b.sched = b.sched.filter(function (s) {
      if (s.id !== id) return true;
      var n = nextDate(s);
      if (!n) return false;
      s.next = n; return true;
    });
  }
  // Enter everything due up to `day` (default today). Returns the number of transactions entered.
  function runDue(b, day) {
    day = day || today();
    var n = 0, guard = 0;
    b.sched.slice().forEach(function (s) {
      while (guard++ < 5000) {
        var cur = null; b.sched.forEach(function (x) { if (x.id === s.id) cur = x; });
        if (!cur || cur.next > day) break;
        enterSched(b, s.id); n++;
      }
    });
    return n;
  }

  // ---------- CSV import ----------
  function parseCSV(text) {
    text = String(text).replace(/^\uFEFF/, "");
    var firstLine = text.split(/\r?\n/, 1)[0] || "";
    var delim = [",", ";", "\t", "|"].map(function (d) { return [d, firstLine.split(d).length]; }).sort(function (a, b) { return b[1] - a[1]; })[0][0];
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === "") q = true;
      else if (ch === delim) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = ""; rows.push(row); row = [];
      } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    rows = rows.map(function (r) { return r.map(function (c) { return c.trim(); }); }).filter(function (r) { return r.some(function (c) { return c !== ""; }); });
    return { rows: rows, delim: delim };
  }
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  // fmt: "ymd" | "dmy" | "mdy". Accepts / - . separators, 2-digit years, "12 Oct 2026", time suffixes.
  function parseDate(s, order) {
    s = asciiDigits(String(s || "")).trim().replace(/[T\s]\d{1,2}:\d{2}.*$/, "");
    var m = s.match(/^(\d{1,2})[\s\-/.]([A-Za-z]{3,9})[\s\-/.,]*(\d{2,4})$/) || s.match(/^([A-Za-z]{3,9})[\s\-/.](\d{1,2}),?[\s\-/.]*(\d{2,4})$/);
    var y, mo, d;
    if (m) {
      var alpha = /[A-Za-z]/.test(m[1]);
      mo = MONTHS[(alpha ? m[1] : m[2]).toLowerCase().slice(0, 4)] || MONTHS[(alpha ? m[1] : m[2]).toLowerCase().slice(0, 3)];
      d = +(alpha ? m[2] : m[1]); y = +m[3];
    } else {
      m = s.match(/^(\d{1,4})[\-/.](\d{1,2})[\-/.](\d{1,4})$/) || s.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (!m) return null;
      var p = [+m[1], +m[2], +m[3]];
      if (m[1].length === 4) { y = p[0]; mo = p[1]; d = p[2]; }
      else if (order === "mdy") { mo = p[0]; d = p[1]; y = p[2]; }
      else if (order === "ymd") { y = p[0]; mo = p[1]; d = p[2]; }
      else { d = p[0]; mo = p[1]; y = p[2]; }
    }
    if (y < 100) y += y < 70 ? 2000 : 1900;
    var out = y + "-" + pad(mo) + "-" + pad(d);
    return validDay(out) ? out : null;
  }
  function guessDateOrder(values) {
    var orders = ["dmy", "mdy", "ymd"], best = "dmy", bestN = -1;
    orders.forEach(function (o) {
      var n = values.filter(function (v) { return parseDate(v, o); }).length;
      if (n > bestN) { best = o; bestN = n; }
    });
    return best;
  }
  // Bank amount text → minor units. Handles "(12.50)", "12.50-", "-1.234,56", "1,234.56 CR", currency letters.
  function parseBankAmount(s, dec) {
    s = asciiDigits(String(s || "")).trim();
    if (!s) return NaN;
    var neg = /^\(.*\)$/.test(s) || /-\s*$/.test(s) || /^-|^\u2212/.test(s) || /\bDR\b|\bdebit\b/i.test(s);
    var pos = /\bCR\b/i.test(s);
    var n = s.replace(/[^\d.,]/g, "");
    if (!/\d/.test(n)) return NaN;
    var v = Number(normalizeNumber(n));
    if (!isFinite(v)) return NaN;
    v = Math.round(v * Math.pow(10, dec));
    return neg && !pos ? -v : v;
  }
  function guessColumns(header) {
    var find = function (re) { for (var i = 0; i < header.length; i++) if (re.test(header[i])) return i; return -1; };
    var c = {
      date: find(/date|تاريخ|posted|booking/i),
      payee: find(/payee|description|details|narrative|merchant|name|البيان|الوصف|التفاصيل/i),
      memo: find(/memo|note|reference|ref\b|ملاحظ|مرجع/i),
      amount: find(/^amount$|amount|المبلغ|value|القيمة/i),
      out: find(/debit|withdraw|out|paid out|مدين|سحب/i),
      inn: find(/credit|deposit|\bin\b|paid in|دائن|إيداع/i)
    };
    if (c.out >= 0 && c.inn >= 0 && c.out !== c.inn) c.amount = -1; else { c.out = -1; c.inn = -1; }
    if (c.amount < 0 && c.out < 0) c.amount = find(/amount|المبلغ/i);
    return c;
  }
  // map: {date, payee, memo, amount, out, inn, order, header:bool, flip:bool}. Returns [{d,p,m,amt,ok,err}]
  function csvToTx(rows, map, dec) {
    var body = map.header ? rows.slice(1) : rows;
    return body.map(function (r) {
      var d = parseDate(r[map.date], map.order), amt;
      if (map.amount >= 0) amt = parseBankAmount(r[map.amount], dec);
      else {
        var o = map.out >= 0 ? parseBankAmount(r[map.out], dec) : NaN, i = map.inn >= 0 ? parseBankAmount(r[map.inn], dec) : NaN;
        amt = (isNaN(i) ? 0 : Math.abs(i)) - (isNaN(o) ? 0 : Math.abs(o));
        if (isNaN(o) && isNaN(i)) amt = NaN;
      }
      if (map.flip && !isNaN(amt)) amt = -amt;
      var row = { d: d, p: map.payee >= 0 ? (r[map.payee] || "") : "", m: map.memo >= 0 ? (r[map.memo] || "") : "", amt: amt };
      row.ok = !!d && !isNaN(amt);
      row.err = !d ? "date" : isNaN(amt) ? "amount" : "";
      return row;
    });
  }
  function importKey(aId, r) { return aId + "|" + r.d + "|" + r.amt + "|" + String(r.p).trim().toLowerCase(); }
  // Adds rows to account aId, skipping ones already present (same date, amount and payee). Categories come from
  // payee memory; money coming in from an unknown payee goes to ready to assign (it is almost always income).
  function importRows(b, aId, rows) {
    var seen = {}, added = 0, skipped = 0;
    b.tx.forEach(function (t) { if (t.a === aId) { var k = importKey(aId, t); seen[k] = (seen[k] || 0) + 1; } });
    var batch = {};
    rows.forEach(function (r) {
      if (!r.ok) return;
      var k = importKey(aId, r);
      batch[k] = (batch[k] || 0) + 1;
      if (batch[k] <= (seen[k] || 0)) { skipped++; return; }
      var c = b.payees[String(r.p).trim().toLowerCase()] || (r.amt > 0 ? INC : null);
      saveTx(b, { a: aId, d: r.d, p: r.p, m: r.m, amt: r.amt, c: c, clr: 1 });
      added++;
    });
    return { added: added, skipped: skipped };
  }
  // Text that a spreadsheet would run as a formula gets a leading ' (numbers like -12.50 are left alone).
  function csvCell(v) {
    v = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(v) && !/^-?\d[\d.,]*$/.test(v)) v = "'" + v;
    return /[",\n\r']/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function exportCSV(b) {
    var lines = [["Date", "Account", "Payee", "Category group", "Category", "Memo", "Outflow", "Inflow", "Cleared"].join(",")];
    sortedTx(b).reverse().forEach(function (t) {
      var a = findAcct(b, t.a), f = t.c && t.c !== INC ? findCat(b, t.c) : null;
      var cat = t.xfer ? "Transfer: " + (findAcct(b, t.xfer) || {}).name : t.c === INC ? "Ready to assign" : f ? f.c.name : "Uncategorized";
      lines.push([t.d, a ? a.name : "", t.p, f ? f.g.name : "", cat, t.m,
        t.amt < 0 ? toInput(-t.amt, b.dec) : "", t.amt > 0 ? toInput(t.amt, b.dec) : "", t.clr === 2 ? "Reconciled" : t.clr ? "Cleared" : ""].map(csvCell).join(","));
    });
    return lines.join("\r\n") + "\r\n";
  }

  // ---------- reports ----------
  function spendingByCategory(b, from, to) {
    var sums = {};
    b.tx.forEach(function (t) {
      var m = monthOf(t.d);
      if (t.xfer || t.c === INC || m < from || m > to) return;
      var id = t.c && findCat(b, t.c) ? t.c : UNCAT;
      sums[id] = (sums[id] || 0) + t.amt;
    });
    return Object.keys(sums).map(function (id) {
      var f = findCat(b, id);
      return { id: id, name: f ? f.c.name : "Uncategorized", group: f ? f.g.name : "", amt: -sums[id] };
    }).filter(function (r) { return r.amt > 0; }).sort(function (x, y) { return y.amt - x.amt; });
  }
  function monthly(b, from, to) {
    var out = [], idx = {};
    for (var m = from; m <= to; m = addMonths(m, 1)) { idx[m] = out.length; out.push({ month: m, income: 0, spending: 0, worth: 0 }); }
    var running = 0, txs = b.tx.slice().sort(function (x, y) { return x.d < y.d ? -1 : x.d > y.d ? 1 : 0; }), j = 0;
    txs.forEach(function (t) {
      var r = idx[monthOf(t.d)];
      if (r == null || t.xfer) return;
      if (t.c === INC) { if (t.p !== "Starting balance" && t.p !== "Reconciliation adjustment") out[r].income += t.amt; }
      else if (!t.c && t.amt > 0) out[r].income += t.amt;   // uncategorized money in counts as income, not as negative spending
      else out[r].spending -= t.amt;                        // refunds into a category lower its spending
    });
    out.forEach(function (row) {
      var end = row.month + "-31";
      while (j < txs.length && txs[j].d <= end) running += txs[j++].amt;
      row.worth = running;
    });
    return out;
  }
  function dateRange(b) {
    var lo = null, hi = null;
    b.tx.forEach(function (t) { if (!lo || t.d < lo) lo = t.d; if (!hi || t.d > hi) hi = t.d; });
    return { first: lo ? monthOf(lo) : monthOf(today()), last: hi ? monthOf(hi) : monthOf(today()) };
  }

  // Change currency: amounts are rescaled when the number of decimals differs, so values stay the same.
  function setCurrency(b, cur) {
    if (CURRENCIES.indexOf(cur) < 0) return;
    var dec = decimalsFor(cur), k = Math.pow(10, dec - b.dec), sc = function (v) { return Math.round(v * k); };
    if (dec !== b.dec) {
      b.tx.forEach(function (t) { t.amt = sc(t.amt); });
      b.sched.forEach(function (s) { s.amt = sc(s.amt); });
      Object.keys(b.assign).forEach(function (m) { for (var c in b.assign[m]) b.assign[m][c] = sc(b.assign[m][c]); });
      allCats(b).forEach(function (c) { if (c.target) c.target.amt = sc(c.target.amt); });
    }
    b.cur = cur; b.dec = dec;
  }

  // ---------- sample budget (for "try it") ----------
  function sample(cur) {
    var b = newBudget({ name: "Sample budget", cur: cur || "JOD" }), k = Math.pow(10, b.dec);
    var M = monthOf(today()), P = addMonths(M, -1), P2 = addMonths(M, -2);
    var cat = function (name) { var c = null; allCats(b).forEach(function (x) { if (x.name === name) c = x.id; }); return c; };
    var bank = addAccount(b, "Bank account", "checking", 250 * k, P2 + "-01");
    var cash = addAccount(b, "Cash", "cash", 60 * k, P2 + "-01");
    var card = addAccount(b, "Credit card", "credit", 0, P2 + "-01");
    var day = function (m, d) { return m + "-" + pad(Math.min(d, daysIn(m), m === M ? +today().slice(8, 10) : 31)); };
    [P2, P, M].forEach(function (m, i) {
      saveTx(b, { a: bank.id, d: day(m, 1), p: "Salary", c: INC, amt: 950 * k, clr: 1 });
      saveTx(b, { a: bank.id, d: day(m, 2), p: "Landlord", c: cat("Rent or mortgage"), amt: -320 * k, clr: 1 });
      saveTx(b, { a: card.id, d: day(m, 4), p: "Supermarket", c: cat("Groceries"), amt: -(64 + i * 7) * k, clr: 1 });
      saveTx(b, { a: cash.id, d: day(m, 6), p: "Fuel station", c: cat("Transport and fuel"), amt: -35 * k, clr: 1 });
      saveTx(b, { a: bank.id, d: day(m, 8), p: "Electricity company", c: cat("Electricity and water"), amt: -(41 + i * 3) * k, clr: 1 });
      saveTx(b, { a: card.id, d: day(m, 11), p: "Shawarma place", c: cat("Eating out"), amt: -(18 + i * 4) * k, clr: 1 });
      saveTx(b, { a: bank.id, d: day(m, 12), p: "Mobile operator", c: cat("Phone and internet"), amt: -25 * k, clr: 1 });
      saveTx(b, { a: card.id, d: day(m, 15), p: "Supermarket", c: cat("Groceries"), amt: -(52 + i * 5) * k, clr: 1 });
      if (m !== M) saveTx(b, { a: bank.id, d: day(m, 20), p: "Card payment", xfer: card.id, amt: -(134 + i * 16) * k, clr: 1 });
      [["Rent or mortgage", 320], ["Electricity and water", 45], ["Phone and internet", 25], ["Groceries", 140], ["Transport and fuel", 40],
        ["Eating out", 30], ["Emergency fund", 180], ["Holidays", 70], ["Spending money", 40]].forEach(function (x) { setAssigned(b, m, cat(x[0]), x[1] * k); });
    });
    findCat(b, cat("Emergency fund")).c.target = { type: "date", amt: 1500 * k, date: addMonths(M, 10) };
    findCat(b, cat("Groceries")).c.target = { type: "monthly", amt: 150 * k, date: null };
    findCat(b, cat("Holidays")).c.target = { type: "date", amt: 600 * k, date: addMonths(M, 7) };
    addSched(b, { a: bank.id, p: "Gym", c: cat("Hobbies"), amt: -20 * k, freq: "monthly", next: addMonths(M, 1) + "-05" });
    return b;
  }

  var API = {
    INC: INC, UNCAT: UNCAT, CURRENCIES: CURRENCIES, ACCOUNT_TYPES: ACCOUNT_TYPES, FREQ: FREQ, STARTER: STARTER,
    uid: uid, today: today, monthOf: monthOf, addMonths: addMonths, monthDiff: monthDiff, addDays: addDays, validDay: validDay, daysIn: daysIn,
    decimalsFor: decimalsFor, fmt: fmt, toInput: toInput, parseAmount: parseAmount, asciiDigits: asciiDigits,
    newBudget: newBudget, normalize: normalize, sample: sample, setCurrency: setCurrency,
    allCats: allCats, findCat: findCat, findAcct: findAcct, findTx: findTx,
    compute: compute, need: need, targetText: targetText, setAssigned: setAssigned, getAssigned: getAssigned, moveMoney: moveMoney,
    assignTargets: assignTargets, coverOverspending: coverOverspending, copyLastMonth: copyLastMonth,
    balances: balances, addAccount: addAccount, saveTx: saveTx, deleteTx: deleteTx, sortedTx: sortedTx, reconcile: reconcile, deleteCategory: deleteCategory,
    addSched: addSched, enterSched: enterSched, skipSched: skipSched, runDue: runDue, nextDate: nextDate,
    parseCSV: parseCSV, parseDate: parseDate, guessDateOrder: guessDateOrder, parseBankAmount: parseBankAmount, guessColumns: guessColumns,
    csvToTx: csvToTx, importRows: importRows, exportCSV: exportCSV,
    spendingByCategory: spendingByCategory, monthly: monthly, dateRange: dateRange
  };
  root.BudgetCore = API;
  if (typeof module === "object" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
