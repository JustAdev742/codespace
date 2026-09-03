(function () {
  var C = window.SITE_CONFIG || {};
  function q(s, r) { return (r || document).querySelectorAll(s); }
  // inject config text
  q("[data-cfg]").forEach(function (el) { var v = C[el.getAttribute("data-cfg")]; if (v) el.textContent = v; });
  // payment / booking links: hide buttons whose link is not configured, show fallback
  q("[data-link]").forEach(function (el) {
    var v = C[el.getAttribute("data-link")];
    if (v) { el.setAttribute("href", v); }
    else { el.classList.add("disabled"); el.setAttribute("href", "#contact"); el.title = "Payment link not yet configured — contact us"; }
  });
  // countdown to 1 Oct 2026 AEST
  var cd = document.getElementById("countdown");
  if (cd && C.deadlineISO) {
    var end = new Date(C.deadlineISO).getTime();
    function tick() {
      var ms = end - Date.now();
      if (ms <= 0) { cd.textContent = "The 1 October 2026 application cut-off has passed. Providers who lodged still need audit-ready evidence; those who did not must stop delivering SIL."; return; }
      var d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
      cd.textContent = d + " days " + h + " hours " + m + " minutes until the 1 October 2026 application cut-off";
    }
    tick(); setInterval(tick, 30000);
  }
  // mailto fallbacks
  q("a[data-mailto]").forEach(function (el) { if (C.email && C.email.indexOf("[") !== 0) el.href = "mailto:" + C.email + "?subject=" + encodeURIComponent(el.getAttribute("data-mailto")); });
})();
