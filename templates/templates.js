/* CineSites store: public Stripe Payment Link URLs (no keys). Empty link = "coming soon". */
(function () {
  "use strict";
  var LINKS = {
    garage: "https://buy.stripe.com/28EcN4fwH4o3c6T1tUcIE08",
    roofer: "https://buy.stripe.com/5kQ00i1FR2fV2wjegGcIE09",
    plumber: "https://buy.stripe.com/5kQ9AS3NZ7Af7QDa0qcIE0b",
    cleaning: "https://buy.stripe.com/28E00i3NZaMrfj56OecIE0c",
    barber: "https://buy.stripe.com/4gM28qesDbQv4Er7SicIE0d",
    bundle: "https://buy.stripe.com/3cIfZg98j5s70obgoOcIE0a",
    all: "https://buy.stripe.com/cNieVcdoz8Ej7QD2xYcIE0e",
    dfy: "https://buy.stripe.com/bJe5kCbgr4o37QDfkKcIE0f"
  };
  Array.prototype.forEach.call(document.querySelectorAll("a.buy"), function (a) {
    var url = LINKS[a.getAttribute("data-product")];
    if (/^https:\/\/buy\.stripe\.com\//.test(url || "")) {
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
    } else {
      a.textContent = "Opening soon";
      a.classList.add("tp-soon");
      a.removeAttribute("href");
    }
  });
})();
