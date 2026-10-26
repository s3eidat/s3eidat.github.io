/* Hub: search + category filter over the tool list built into the kit. */
(function () {
  "use strict";
  var tools = S3.tools.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  var grid = S3.$("#grid"), q = S3.$("#q"), cats = S3.$("#cats"), none = S3.$("#none");
  var cat = "All";

  S3.$("#count").textContent = tools.length;
  var counts = {};
  tools.forEach(function (t) { counts[t.category] = (counts[t.category] || 0) + 1; });
  ["All"].concat(Object.keys(counts).sort()).forEach(function (c) {
    var b = S3.h("button", { type: "button", "aria-pressed": String(c === cat) }, [c, S3.h("span", { text: c === "All" ? tools.length : counts[c] })]);
    b.addEventListener("click", function () {
      cat = c;
      S3.$$("button", cats).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      draw();
    });
    cats.appendChild(b);
  });

  function norm(s) { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function draw() {
    var words = norm(q.value.trim()).split(/\s+/).filter(Boolean);
    var hits = tools.filter(function (t) {
      if (cat !== "All" && t.category !== cat) return false;
      var hay = norm(t.name + " " + t.tagline + " " + t.category + " " + t.slug);
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    });
    grid.innerHTML = "";
    hits.forEach(function (t) {
      grid.appendChild(S3.h("a", { "class": "hub-card", href: "/" + t.slug + "/" }, [
        S3.h("b", { text: t.name }), S3.h("span", { text: t.tagline }), S3.h("em", { text: t.category })
      ]));
    });
    none.hidden = hits.length > 0;
  }
  q.addEventListener("input", draw);
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== q) { e.preventDefault(); q.focus(); }
  });
  draw();
})();
