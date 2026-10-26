/* Coffee page: tiers come from the kit config (public Stripe Payment Link URLs — no keys). */
(function () {
  "use strict";
  var s = S3.config.support || {};
  var tiers = (s.stripe || []).filter(function (t) { return t && /^https:\/\/buy\.stripe\.com\//.test(t.url); });
  var box = S3.$("#tiers");
  tiers.forEach(function (t, i) {
    box.appendChild(S3.h("a", { "class": "cf-tier" + (t.popular ? " pop" : ""), href: t.url, target: "_blank", rel: "noopener" }, [
      t.popular ? S3.h("span", { "class": "tag", text: "Most loved" }) : null,
      S3.h("span", { "class": "e", text: t.emoji || "☕" }),
      S3.h("b", { text: t.price || "" }),
      S3.h("span", { text: t.label || "" })
    ]));
  });
  box.hidden = !tiers.length;
  var alt = S3.$("#alt"), others = [["☕ Buy Me a Coffee", s.buymeacoffee], ["🍵 Ko-fi", s.kofi], ["💜 GitHub Sponsors", s.githubSponsors]];
  others.forEach(function (o) { if (o[1]) alt.appendChild(S3.h("a", { "class": "btn", href: o[1], target: "_blank", rel: "noopener" }, [o[0]])); });
  alt.appendChild(S3.h("a", { "class": "btn ghost", href: "https://github.com/s3eidat", target: "_blank", rel: "noopener" }, ["⭐ Star on GitHub"]));
  S3.$("#soon").hidden = tiers.length > 0 || !!(s.buymeacoffee || s.kofi || s.githubSponsors);
})();
