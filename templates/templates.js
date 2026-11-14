/* Template store: public Stripe Payment Link URLs (no keys). Empty link = "coming soon". */
(function () {
  "use strict";
  var LINKS = {
    garage: "https://buy.stripe.com/28EcN4fwH4o3c6T1tUcIE08",
    roofer: "https://buy.stripe.com/5kQ00i1FR2fV2wjegGcIE09",
    bundle: "https://buy.stripe.com/3cIfZg98j5s70obgoOcIE0a"
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
