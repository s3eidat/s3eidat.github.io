/* Base core: bases, tables, typed fields, records, views (filters, sorts), linked records kept in sync both
   ways, CSV import with type guessing, CSV export, templates. No DOM, no network. */
(function (root) {
  "use strict";

  function uid() {
    var a = new Uint8Array(7);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(a); else for (var i = 0; i < 7; i++) a[i] = Math.random() * 256;
    return Array.prototype.map.call(a, function (b) { return (b + 256).toString(16).slice(1); }).join("");
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function validDay(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; var d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))); return d.toISOString().slice(0, 10) === s; }

  var TYPES = {
    text: "Single line text", long: "Long text", number: "Number", currency: "Currency", percent: "Percent",
    select: "Single select", multi: "Multiple select", date: "Date", check: "Checkbox", url: "URL", email: "Email",
    phone: "Phone", rating: "Rating", link: "Link to another table", file: "Attachment"
  };
  var COLORS = ["#dbeafe", "#dcfce7", "#fef9c3", "#ffedd5", "#fee2e2", "#ede9fe", "#ccfbf1", "#fce7f3", "#e2e8f0", "#fde68a"];

  // ---------- constructors ----------
  function newField(name, type, opts) {
    var f = { id: uid(), name: name || "Field", type: TYPES[type] ? type : "text", opts: {} };
    if (f.type === "number" || f.type === "percent") f.opts.dec = 0;
    if (f.type === "currency") { f.opts.dec = 2; f.opts.sym = "$"; }
    if (f.type === "select" || f.type === "multi") f.opts.choices = [];
    if (f.type === "rating") f.opts.max = 5;
    for (var k in opts || {}) f.opts[k] = opts[k];
    return f;
  }
  function newView(name, type) { return { id: uid(), name: name || "Grid view", type: type || "grid", filters: [], sorts: [], hidden: [], widths: {}, by: null }; }
  function newTable(name, fields) {
    var t = { id: uid(), name: name || "Table", fields: fields || [newField("Name", "text"), newField("Notes", "long")], records: [], views: [newView("Grid view", "grid")] };
    return t;
  }
  function newRecord(t) { return { id: uid(), c: {}, at: Date.now() }; }
  function newBase(name) { return { app: "s3-base", v: 1, id: uid(), name: name || "Untitled base", tables: [newTable("Table 1")], updated: Date.now() }; }
  function choice(name, i) { return { id: uid(), name: String(name).slice(0, 100), color: COLORS[(i || 0) % COLORS.length] }; }

  // ---------- lookups ----------
  function table(b, id) { for (var i = 0; i < b.tables.length; i++) if (b.tables[i].id === id) return b.tables[i]; return null; }
  function field(t, id) { for (var i = 0; i < t.fields.length; i++) if (t.fields[i].id === id) return t.fields[i]; return null; }
  function record(t, id) { for (var i = 0; i < t.records.length; i++) if (t.records[i].id === id) return t.records[i]; return null; }
  function primary(t) { return t.fields[0]; }
  function choiceById(f, id) { var cs = f.opts.choices || []; for (var i = 0; i < cs.length; i++) if (cs[i].id === id) return cs[i]; return null; }
  function title(b, t, r) { var p = primary(t); var s = p ? display(b, p, r.c[p.id]) : ""; return s || "Untitled"; }

  // ---------- values ----------
  function empty(v) { return v == null || v === "" || v === false || (Array.isArray(v) && !v.length); }
  function fmtNum(v, dec) { return Number(v).toLocaleString("en", { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }
  // Text form of a value (for search, CSV, cards).
  function display(b, f, v) {
    if (empty(v) && v !== 0) return f.type === "check" ? "" : "";
    switch (f.type) {
      case "number": return fmtNum(v, f.opts.dec);
      case "currency": return (f.opts.sym || "") + fmtNum(v, f.opts.dec == null ? 2 : f.opts.dec);
      case "percent": return fmtNum(v, f.opts.dec) + "%";
      case "select": var c = choiceById(f, v); return c ? c.name : "";
      case "multi": return v.map(function (id) { var c2 = choiceById(f, id); return c2 ? c2.name : null; }).filter(Boolean).join(", ");
      case "check": return v ? "checked" : "";
      case "rating": return v ? String(v) + "/" + (f.opts.max || 5) : "";
      case "link": var lt = table(b, f.opts.table); return lt ? v.map(function (id) { var r = record(lt, id); return r ? title(b, lt, r) : null; }).filter(Boolean).join(", ") : "";
      case "file": return v.map(function (x) { return x.name; }).join(", ");
      default: return String(v);
    }
  }
  function asciiDigits(s) { return String(s).replace(/[\u0660-\u0669]/g, function (c) { return c.charCodeAt(0) - 0x660; }); }
  function parseNum(s) {
    s = asciiDigits(s).trim().replace(/[\s\u00A0]/g, "");
    if (!s) return null;
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s);
    s = s.replace(/[^\d.,]/g, "");
    var lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
    if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else if (lc > -1) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? (neg ? -n : n) : null;
  }
  function parseDate(s) {
    s = asciiDigits(s).trim();
    var m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(s);
    if (m) { var k = m[1] + "-" + pad(+m[2]) + "-" + pad(+m[3]); return validDay(k) ? k : null; }
    m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/.exec(s);
    if (m) {
      var a = +m[1], c = +m[2], y = +m[3]; if (y < 100) y += 2000;
      var mo = c > 12 ? a : c, d = c > 12 ? c : a; // day/month/year, unless the second number can't be a month
      var k2 = y + "-" + pad(mo) + "-" + pad(d); return validDay(k2) ? k2 : null;
    }
    var t = Date.parse(s);
    if (isFinite(t) && /[a-z]/i.test(s)) { var dt = new Date(t); var k3 = dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate()); return validDay(k3) ? k3 : null; }
    return null;
  }
  // Text → value for a field (CSV import, paste, type conversion). For selects, unknown names become new choices.
  function parse(b, f, s) {
    s = s == null ? "" : String(s);
    var t = s.trim();
    switch (f.type) {
      case "number": case "currency": case "percent": return parseNum(t.replace(/%$/, ""));
      case "check": return /^(1|true|yes|y|checked|x|✓|✔|نعم)$/i.test(t);
      case "date": return parseDate(t);
      case "rating": var n = parseInt(asciiDigits(t), 10); return isFinite(n) ? Math.max(0, Math.min(f.opts.max || 5, n)) : null;
      case "select": return t ? ensureChoice(f, t) : null;
      case "multi": return t ? splitList(t).map(function (x) { return ensureChoice(f, x); }) : [];
      case "link": {
        var lt = table(b, f.opts.table); if (!lt || !t) return [];
        var p = primary(lt), ids = [];
        splitList(t).forEach(function (name) {
          var r = lt.records.filter(function (x) { return display(b, p, x.c[p.id]).toLowerCase() === name.toLowerCase(); })[0];
          if (!r) { r = newRecord(lt); r.c[p.id] = name; lt.records.push(r); }
          if (ids.indexOf(r.id) < 0) ids.push(r.id);
        });
        return ids;
      }
      case "file": return [];
      case "long": return s.replace(/\r\n/g, "\n");
      default: return t.replace(/\s*\n\s*/g, " ");
    }
  }
  function splitList(s) { return String(s).split(/\s*[,;،]\s*/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function ensureChoice(f, name) {
    var cs = f.opts.choices || (f.opts.choices = []);
    for (var i = 0; i < cs.length; i++) if (cs[i].name.toLowerCase() === String(name).toLowerCase()) return cs[i].id;
    var c = choice(name, cs.length); cs.push(c); return c.id;
  }

  // ---------- linked records (kept in sync both ways) ----------
  // A link field has opts.table (the other table) and opts.inv (the matching field over there).
  function addLinkField(b, t, name, other) {
    var ot = table(b, other); if (!ot) return null;
    var f = newField(name || ot.name, "link", { table: ot.id });
    var inv = newField(uniqueName(ot, t.name), "link", { table: t.id });
    f.opts.inv = inv.id; inv.opts.inv = f.id;
    t.fields.push(f); ot.fields.push(inv);
    return f;
  }
  function uniqueName(t, name) {
    var n = name, k = 2; while (t.fields.some(function (f) { return f.name.toLowerCase() === n.toLowerCase(); })) n = name + " " + k++;
    return n;
  }
  // Set the linked records of r in field f, and update the other side.
  function setLinks(b, t, f, r, ids) {
    var ot = table(b, f.opts.table), before = r.c[f.id] || [];
    ids = (ids || []).filter(function (id, i, a) { return a.indexOf(id) === i && ot && record(ot, id); });
    r.c[f.id] = ids;
    var inv = ot && f.opts.inv ? field(ot, f.opts.inv) : null;
    if (!inv) return;
    before.concat(ids).forEach(function (id) {
      var o = record(ot, id); if (!o) return;
      var list = (o.c[inv.id] || []).filter(function (x) { return x !== r.id; });
      if (ids.indexOf(id) >= 0) list.push(r.id);
      o.c[inv.id] = list;
    });
  }
  function setValue(b, t, f, r, v) { if (f.type === "link") setLinks(b, t, f, r, v); else r.c[f.id] = v; r.at = r.at || Date.now(); }
  function deleteRecords(b, t, ids) {
    var gone = {}; ids.forEach(function (i) { gone[i] = 1; });
    t.records = t.records.filter(function (r) { return !gone[r.id]; });
    // remove from link fields anywhere that point to this table
    b.tables.forEach(function (ot) {
      ot.fields.forEach(function (f) {
        if (f.type !== "link" || f.opts.table !== t.id) return;
        ot.records.forEach(function (r) { if (r.c[f.id]) r.c[f.id] = r.c[f.id].filter(function (x) { return !gone[x]; }); });
      });
    });
    return gone;
  }
  function deleteField(b, t, fid) {
    var f = field(t, fid); if (!f || t.fields.indexOf(f) === 0) return false;
    t.fields = t.fields.filter(function (x) { return x !== f; });
    t.records.forEach(function (r) { delete r.c[fid]; });
    t.views.forEach(function (v) { cleanView(t, v); });
    if (f.type === "link" && f.opts.inv) { var ot = table(b, f.opts.table), inv = ot && field(ot, f.opts.inv); if (inv) { inv.opts.inv = null; } }
    return true;
  }
  function deleteTable(b, tid) {
    if (b.tables.length < 2) return false;
    var t = table(b, tid); if (!t) return false;
    b.tables = b.tables.filter(function (x) { return x !== t; });
    b.tables.forEach(function (ot) {
      ot.fields.filter(function (f) { return f.type === "link" && f.opts.table === tid; }).forEach(function (f) {
        // keep the names as plain text so nothing is lost
        ot.records.forEach(function (r) { r.c[f.id] = display({ tables: [t] }, f, r.c[f.id]) || ""; });
        f.type = "text"; f.opts = {};
      });
    });
    return true;
  }
  // Change a field's type, converting values through their text form.
  function convertField(b, t, f, type, opts) {
    if (!TYPES[type] || f.type === type) { if (opts) Object.assign(f.opts, opts); return; }
    var texts = t.records.map(function (r) { return display(b, f, r.c[f.id]); });
    if (f.type === "link" && f.opts.inv) { var ot = table(b, f.opts.table), inv = ot && field(ot, f.opts.inv); if (inv) inv.opts.inv = null; }
    var nf = newField(f.name, type, opts); f.type = nf.type; f.opts = nf.opts;
    if (type === "select" || type === "multi") texts.forEach(function (s) { splitList(s).forEach(function (x) { if (type === "multi" || x === s.trim()) ensureChoice(f, x); }); });
    if (type === "link") {
      // links need a table: link text to the chosen table's records by name (and set up the other side)
      var lt = table(b, f.opts.table);
      if (lt) { var inv2 = newField(uniqueName(lt, t.name), "link", { table: t.id }); inv2.opts.inv = f.id; f.opts.inv = inv2.id; lt.fields.push(inv2); }
      t.records.forEach(function (r, i) { r.c[f.id] = []; setLinks(b, t, f, r, parse(b, f, texts[i])); });
      return;
    }
    t.records.forEach(function (r, i) { var v = parse(b, f, texts[i]); if (empty(v) && v !== 0 && v !== false) delete r.c[f.id]; else r.c[f.id] = v; });
  }

  // ---------- views ----------
  var OPS = {
    text: [["has", "contains"], ["not", "does not contain"], ["is", "is"], ["empty", "is empty"], ["filled", "is not empty"]],
    number: [["eq", "="], ["ne", "≠"], ["gt", ">"], ["lt", "<"], ["ge", "≥"], ["le", "≤"], ["empty", "is empty"], ["filled", "is not empty"]],
    select: [["is", "is"], ["isnt", "is not"], ["empty", "is empty"], ["filled", "is not empty"]],
    multi: [["any", "has any of"], ["none", "has none of"], ["empty", "is empty"], ["filled", "is not empty"]],
    date: [["is", "is"], ["before", "is before"], ["after", "is after"], ["past", "is in the past"], ["future", "is today or later"], ["empty", "is empty"], ["filled", "is not empty"]],
    check: [["on", "is checked"], ["off", "is not checked"]],
    link: [["has", "contains"], ["empty", "is empty"], ["filled", "is not empty"]]
  };
  function opsFor(f) {
    var k = { long: "text", url: "text", email: "text", phone: "text", file: "link", currency: "number", percent: "number", rating: "number" }[f.type] || f.type;
    return OPS[k] || OPS.text;
  }
  function matches(b, f, cond, v) {
    var op = cond.op, val = cond.val;
    if (op === "empty") return empty(v);
    if (op === "filled") return !empty(v);
    switch (f.type) {
      case "number": case "currency": case "percent": case "rating":
        var x = parseNum(val); if (x == null) return true; if (v == null || v === "") return op === "ne";
        return op === "eq" ? v === x : op === "ne" ? v !== x : op === "gt" ? v > x : op === "lt" ? v < x : op === "ge" ? v >= x : v <= x;
      case "select": if (!val) return true; return op === "is" ? v === val : v !== val;
      case "multi": var want = Array.isArray(val) ? val : val ? [val] : []; if (!want.length) return true;
        var hit = (v || []).some(function (id) { return want.indexOf(id) >= 0; }); return op === "any" ? hit : !hit;
      case "check": return op === "on" ? !!v : !v;
      case "date":
        var td = today();
        if (op === "past") return !!v && v < td;
        if (op === "future") return !!v && v >= td;
        if (!validDay(val)) return true;
        return op === "is" ? v === val : op === "before" ? !!v && v < val : !!v && v > val;
      default:
        var s = display(b, f, v).toLowerCase(), q = String(val || "").toLowerCase();
        if (!q) return true;
        return op === "has" ? s.indexOf(q) >= 0 : op === "not" ? s.indexOf(q) < 0 : s === q;
    }
  }
  function compare(b, f, a, c) {
    var ea = empty(a) && a !== 0, ec = empty(c) && c !== 0;
    if (ea || ec) return ea === ec ? 0 : ea ? 1 : -1; // empty last
    switch (f.type) {
      case "number": case "currency": case "percent": case "rating": return a - c;
      case "check": return (c ? 1 : 0) - (a ? 1 : 0);
      case "select": var cs = f.opts.choices || [], ia = cs.findIndex(function (x) { return x.id === a; }), ic = cs.findIndex(function (x) { return x.id === c; }); return ia - ic;
      case "date": return a < c ? -1 : a > c ? 1 : 0;
      default: return display(b, f, a).localeCompare(display(b, f, c), undefined, { numeric: true, sensitivity: "base" });
    }
  }
  function rows(b, t, v, q) {
    var list = t.records.slice();
    (v.filters || []).forEach(function (cond) { var f = field(t, cond.f); if (f) list = list.filter(function (r) { return matches(b, f, cond, r.c[f.id]); }); });
    if (q) {
      q = q.toLowerCase();
      list = list.filter(function (r) { return t.fields.some(function (f) { return display(b, f, r.c[f.id]).toLowerCase().indexOf(q) >= 0; }); });
    }
    var sorts = (v.sorts || []).filter(function (s) { return field(t, s.f); });
    if (sorts.length) {
      var idx = {}; t.records.forEach(function (r, i) { idx[r.id] = i; });
      list.sort(function (x, y) {
        for (var i = 0; i < sorts.length; i++) {
          var f = field(t, sorts[i].f), a = x.c[f.id], c = y.c[f.id];
          var ea = empty(a) && a !== 0, ec = empty(c) && c !== 0;
          if (ea !== ec && f.type !== "check") return ea ? 1 : -1; // empty cells stay last in both directions
          var d = compare(b, f, a, c);
          if (d) return sorts[i].desc ? -d : d;
        }
        return idx[x.id] - idx[y.id];
      });
    }
    return list;
  }
  function cleanView(t, v) {
    var ok = function (id) { return !!field(t, id); };
    v.filters = (v.filters || []).filter(function (c) { return ok(c.f); });
    v.sorts = (v.sorts || []).filter(function (s) { return ok(s.f); });
    v.hidden = (v.hidden || []).filter(ok);
    if (v.by && !ok(v.by)) v.by = null;
  }

  // ---------- CSV ----------
  function parseCSV(text) {
    text = String(text).replace(/^\uFEFF/, "");
    var first = text.split(/\r?\n/, 1)[0] || "";
    var delim = [",", ";", "\t", "|"].map(function (x) { return [x, first.split(x).length]; }).sort(function (a, c) { return c[1] - a[1]; })[0][0];
    var out = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"' && cell === "") q = true;
      else if (ch === delim) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); out.push(row); }
    return out.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
  }
  // Guess a field type from sample values.
  function guessType(values) {
    var vals = values.map(function (v) { return String(v || "").trim(); }).filter(Boolean);
    if (!vals.length) return "text";
    var all = function (re) { return vals.every(function (v) { return re.test(v); }); };
    if (all(/^(true|false|yes|no|y|n|0|1|x|✓)$/i) && vals.some(function (v) { return !/^[01]$/.test(v); })) return "check";
    if (all(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return "email";
    if (all(/^https?:\/\/\S+$/i)) return "url";
    if (all(/^[$€£¥]\s?-?[\d,.]+$|^-?[\d,.]+\s?(JOD|USD|EUR|SAR|AED|د\.أ)$/i)) return "currency";
    if (all(/^-?[\d,.]+\s?%$/)) return "percent";
    if (vals.every(function (v) { return parseDate(v) && /\d/.test(v) && /[-\/.]/.test(v); })) return "date";
    if (all(/^\+?[\d\s()\-]{7,}$/) && vals.some(function (v) { return /^\+|^0/.test(v); })) return "phone";
    if (vals.every(function (v) { return parseNum(v) != null && /^[-+(]?[\d.,\s]+\)?$/.test(v); })) return "number";
    if (vals.some(function (v) { return v.length > 80 || /\n/.test(v); })) return "long";
    var uniq = {}; vals.forEach(function (v) { uniq[v.toLowerCase()] = 1; });
    var n = Object.keys(uniq).length;
    // few distinct values that repeat: an option list
    if (vals.length >= 4 && n < vals.length && n <= Math.max(3, Math.min(15, Math.floor(vals.length / 2))) && vals.every(function (v) { return v.length <= 40; })) {
      return vals.some(function (v) { return /[,;]/.test(v); }) ? "multi" : "select";
    }
    return "text";
  }
  function importCSV(b, text, name) {
    var data = parseCSV(text); if (data.length < 1) throw new Error("empty");
    var head = data[0].map(function (h, i) { return String(h).trim() || "Field " + (i + 1); }), body = data.slice(1);
    var t = newTable(uniqueTableName(b, name || "Imported"), []);
    var seen = {};
    head.forEach(function (h, i) {
      var nm = h, k = 2; while (seen[nm.toLowerCase()]) nm = h + " " + k++; seen[nm.toLowerCase()] = 1;
      var col = body.map(function (r) { return r[i]; });
      var type = i === 0 ? (guessType(col) === "long" ? "long" : "text") : guessType(col.slice(0, 500));
      if (i === 0 && type !== "long") type = "text";
      var f = newField(nm.slice(0, 100), type);
      if (type === "currency") { var sample = col.filter(Boolean)[0] || ""; var sym = /^([$€£¥])/.exec(sample.trim()); f.opts.sym = sym ? sym[1] : (/(JOD|USD|EUR|SAR|AED)/i.exec(sample) || ["", ""])[1].toUpperCase() + " "; }
      if (type === "number" || type === "percent") f.opts.dec = Math.min(4, Math.max.apply(null, [0].concat(col.map(function (v) { var m = /[.,](\d+)\s*%?$/.exec(String(v || "").trim()); return m && !/^\d{1,3}(,\d{3})+$/.test(String(v).trim()) ? m[1].length : 0; }))));
      t.fields.push(f);
    });
    body.forEach(function (r) {
      var rec = newRecord(t);
      t.fields.forEach(function (f, i) { var v = parse(b, f, r[i]); if (!empty(v)) rec.c[f.id] = v; });
      t.records.push(rec);
    });
    b.tables.push(t);
    return t;
  }
  function uniqueTableName(b, name) {
    var n = name, k = 2; while (b.tables.some(function (t) { return t.name.toLowerCase() === n.toLowerCase(); })) n = name + " " + k++;
    return n;
  }
  function csvCell(v) {
    v = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(v) && !/^-?\d[\d.,]*%?$/.test(v)) v = "'" + v;
    return /[",\n\r']/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function exportCSV(b, t, v, list) {
    var fs = t.fields.filter(function (f) { return (v.hidden || []).indexOf(f.id) < 0; });
    var lines = [fs.map(function (f) { return csvCell(f.name); }).join(",")];
    (list || t.records).forEach(function (r) {
      lines.push(fs.map(function (f) {
        var x = r.c[f.id];
        if (f.type === "number" || f.type === "currency" || f.type === "percent") return x == null ? "" : csvCell(String(x));
        if (f.type === "check") return x ? "true" : "false";
        return csvCell(display(b, f, x));
      }).join(","));
    });
    return lines.join("\r\n") + "\r\n";
  }

  // ---------- normalize (files, backups) ----------
  function normalize(o) {
    if (!o || o.app !== "s3-base" || !Array.isArray(o.tables) || !o.tables.length) throw new Error("Not a Base file");
    var str = function (v, n) { return String(v == null ? "" : v).slice(0, n); };
    var b = { app: "s3-base", v: 1, id: str(o.id, 40) || uid(), name: str(o.name, 120) || "Base", tables: [], updated: Number(o.updated) || Date.now() };
    var tids = {};
    o.tables.forEach(function (t) { if (t && t.id && !tids[t.id] && Array.isArray(t.fields) && t.fields.length) tids[t.id] = 1; });
    o.tables.forEach(function (t) {
      if (!t || !tids[t.id] || table(b, t.id)) return;
      var nt = { id: str(t.id, 40), name: str(t.name, 120) || "Table", fields: [], records: [], views: [] }, fids = {};
      t.fields.forEach(function (f) {
        if (!f || !f.id || fids[f.id] || !TYPES[f.type]) return;
        fids[f.id] = 1;
        var nf = newField(str(f.name, 100) || "Field", f.type); nf.id = str(f.id, 40);
        var op = f.opts || {};
        if ("dec" in nf.opts) nf.opts.dec = Math.max(0, Math.min(8, Math.round(Number(op.dec) || 0)));
        if (f.type === "currency") nf.opts.sym = str(op.sym, 6);
        if (f.type === "rating") nf.opts.max = Math.max(1, Math.min(10, Math.round(Number(op.max) || 5)));
        if (f.type === "select" || f.type === "multi") nf.opts.choices = (op.choices || []).filter(function (c) { return c && c.id; }).map(function (c, i) { return { id: str(c.id, 40), name: str(c.name, 100), color: /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : COLORS[i % COLORS.length] }; });
        if (f.type === "link") { if (!tids[op.table]) { nf.type = "text"; nf.opts = {}; } else { nf.opts.table = op.table; nf.opts.inv = op.inv ? str(op.inv, 40) : null; } }
        if (f.width) nf.width = f.width;
        nt.fields.push(nf);
      });
      if (!nt.fields.length) nt.fields.push(newField("Name", "text"));
      if (nt.fields[0].type === "link" || nt.fields[0].type === "file") { nt.fields[0].type = "text"; nt.fields[0].opts = {}; }
      var rids = {};
      (t.records || []).forEach(function (r) {
        if (!r || !r.id || rids[r.id]) return; rids[r.id] = 1;
        var nr = { id: str(r.id, 40), c: {}, at: Number(r.at) || 0 };
        nt.fields.forEach(function (f) { var v = (r.c || {})[f.id]; if (v === undefined) return; var cv = clean(f, v); if (cv !== undefined) nr.c[f.id] = cv; });
        nt.records.push(nr);
      });
      (t.views || []).forEach(function (v) {
        if (!v || !v.id) return;
        var nv = newView(str(v.name, 80) || "View", ["grid", "kanban", "calendar", "gallery"].indexOf(v.type) >= 0 ? v.type : "grid"); nv.id = str(v.id, 40);
        nv.filters = (v.filters || []).filter(function (c) { return c && c.f; }).map(function (c) { return { f: str(c.f, 40), op: str(c.op, 10), val: Array.isArray(c.val) ? c.val.map(function (x) { return str(x, 40); }) : str(c.val, 200) }; });
        nv.sorts = (v.sorts || []).filter(function (s) { return s && s.f; }).map(function (s) { return { f: str(s.f, 40), desc: !!s.desc }; });
        nv.hidden = (v.hidden || []).map(function (x) { return str(x, 40); });
        nv.by = v.by ? str(v.by, 40) : null;
        if (v.widths && typeof v.widths === "object") Object.keys(v.widths).forEach(function (k) { var w = Number(v.widths[k]); if (w >= 60 && w <= 800) nv.widths[k] = w; });
        cleanView(nt, nv); nt.views.push(nv);
      });
      if (!nt.views.length) nt.views.push(newView("Grid view", "grid"));
      b.tables.push(nt);
    });
    // links must point at existing records
    b.tables.forEach(function (t) {
      t.fields.forEach(function (f) {
        if (f.type !== "link") return;
        var ot = table(b, f.opts.table); if (!ot) return;
        if (f.opts.inv && !field(ot, f.opts.inv)) f.opts.inv = null;
        t.records.forEach(function (r) { if (r.c[f.id]) r.c[f.id] = r.c[f.id].filter(function (id) { return !!record(ot, id); }); });
      });
    });
    return b;
  }
  function clean(f, v) {
    switch (f.type) {
      case "number": case "currency": case "percent": return typeof v === "number" && isFinite(v) ? v : undefined;
      case "rating": return typeof v === "number" ? Math.max(0, Math.min(f.opts.max, Math.round(v))) : undefined;
      case "check": return !!v;
      case "date": return validDay(v) ? v : undefined;
      case "select": return choiceById(f, v) ? v : undefined;
      case "multi": return Array.isArray(v) ? v.filter(function (id) { return choiceById(f, id); }) : undefined;
      case "link": return Array.isArray(v) ? v.map(String).slice(0, 5000) : undefined;
      case "file": return Array.isArray(v) ? v.filter(function (x) { return x && x.id; }).map(function (x) { return { id: String(x.id).slice(0, 40), name: String(x.name || "file").slice(0, 200), type: String(x.type || "").slice(0, 100), size: Number(x.size) || 0 }; }) : undefined;
      default: return typeof v === "string" ? v.slice(0, 100000) : v == null ? undefined : String(v).slice(0, 100000);
    }
  }

  // ---------- templates ----------
  function template(kind) {
    var b = newBase(), t = b.tables[0];
    var add = function (tb, vals) { var r = newRecord(tb); tb.fields.forEach(function (f, i) { if (vals[i] != null && vals[i] !== "") { var v = parse(b, f, vals[i]); if (f.type === "link") setLinks(b, tb, f, r, v); else r.c[f.id] = v; } }); tb.records.push(r); return r; };
    if (kind === "contacts") {
      b.name = "Contacts";
      t.name = "People"; t.fields = [newField("Name", "text"), newField("Company", "text"), newField("Email", "email"), newField("Phone", "phone"),
        newField("Stage", "select"), newField("Tags", "multi"), newField("Last contact", "date"), newField("Notes", "long")];
      [["Lina Haddad", "Nour Design", "lina@example.com", "+962 7 9000 0001", "Lead", "Design, Amman", "2026-10-20", "Met at the expo"],
        ["Omar Saleh", "Petra Trading", "omar@example.com", "+962 7 9000 0002", "Customer", "Retail", "2026-10-12", ""],
        ["Sara Khalil", "", "sara@example.com", "", "Contacted", "Freelance, Design", "2026-10-25", "Wants a quote"]].forEach(function (v) { add(t, v); });
      t.views.push(Object.assign(newView("By stage", "kanban"), { by: t.fields[4].id }));
    } else if (kind === "content") {
      b.name = "Content calendar";
      t.name = "Posts"; t.fields = [newField("Title", "text"), newField("Status", "select"), newField("Channel", "multi"), newField("Publish date", "date"),
        newField("Owner", "text"), newField("Ready", "check"), newField("Draft", "long")];
      var d = function (n) { var x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate()); };
      [["Launch announcement", "Scheduled", "Instagram, X", d(2), "Rana", "yes", ""], ["How-to video", "Writing", "YouTube", d(6), "Omar", "", ""],
        ["Customer story", "Idea", "Blog", d(12), "", "", ""], ["Weekly tips", "Published", "LinkedIn", d(-3), "Rana", "yes", ""]].forEach(function (v) { add(t, v); });
      t.fields[1].opts.choices.forEach(function (c, i) { c.color = ["#dbeafe", "#fef9c3", "#e2e8f0", "#dcfce7"][i] || c.color; });
      t.views.push(Object.assign(newView("Board", "kanban"), { by: t.fields[1].id }), Object.assign(newView("Calendar", "calendar"), { by: t.fields[3].id }));
    } else if (kind === "inventory") {
      b.name = "Inventory";
      t.name = "Products"; t.fields = [newField("Product", "text"), newField("SKU", "text"), newField("Price", "currency"), newField("In stock", "number"),
        newField("Category", "select"), newField("Photo", "file"), newField("Active", "check")];
      var sup = newTable("Suppliers", [newField("Supplier", "text"), newField("Email", "email"), newField("Phone", "phone")]);
      b.tables.push(sup);
      add(sup, ["Al Noor Supplies", "sales@example.com", "+962 6 500 0000"]); add(sup, ["Green Farm", "hello@example.com", ""]);
      var lf = addLinkField(b, t, "Supplier", sup.id);
      [["Olive oil 1L", "OL-001", "8.50", "40", "Food", "", "yes", "Green Farm"], ["Za'atar 250g", "ZA-250", "3.25", "120", "Food", "", "yes", "Green Farm"],
        ["Gift box", "GB-010", "15", "8", "Gifts", "", "yes", "Al Noor Supplies"], ["Ceramic bowl", "CB-002", "6", "0", "Home", "", "", "Al Noor Supplies"]].forEach(function (v) {
        var r = add(t, v.slice(0, 7)); setLinks(b, t, lf, r, parse(b, lf, v[7]));
      });
      t.views.push(Object.assign(newView("Gallery", "gallery"), { by: t.fields[5].id }));
    }
    return b;
  }

  var API = {
    uid: uid, today: today, validDay: validDay, TYPES: TYPES, COLORS: COLORS, OPS: OPS,
    newField: newField, newView: newView, newTable: newTable, newRecord: newRecord, newBase: newBase, choice: choice,
    table: table, field: field, record: record, primary: primary, choiceById: choiceById, title: title,
    empty: empty, display: display, parse: parse, parseNum: parseNum, parseDate: parseDate, ensureChoice: ensureChoice,
    addLinkField: addLinkField, setLinks: setLinks, setValue: setValue, deleteRecords: deleteRecords, deleteField: deleteField, deleteTable: deleteTable,
    convertField: convertField, uniqueName: uniqueName, uniqueTableName: uniqueTableName, opsFor: opsFor, matches: matches, compare: compare, rows: rows, cleanView: cleanView,
    parseCSV: parseCSV, guessType: guessType, importCSV: importCSV, exportCSV: exportCSV, normalize: normalize, template: template
  };
  root.BaseCore = API;
  if (typeof module === "object" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
