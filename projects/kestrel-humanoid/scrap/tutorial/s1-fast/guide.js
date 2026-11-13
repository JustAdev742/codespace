(function () {
  var KEY = "s1fast-guide-v1";
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { state = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  var boxes = Array.prototype.slice.call(document.querySelectorAll("input[data-k]"));
  function refresh() {
    var n = 0, per = {};
    boxes.forEach(function (b) {
      var sec = b.closest("section");
      var id = sec ? sec.id : "";
      per[id] = per[id] || [0, 0];
      per[id][1]++;
      if (b.checked) { n++; per[id][0]++; }
      var tr = b.closest("tr");
      if (tr) tr.classList.toggle("have", b.checked);
    });
    var pn = document.getElementById("prog-n"), pt = document.getElementById("prog-t");
    if (pn) pn.textContent = n;
    if (pt) pt.textContent = boxes.length;
    Object.keys(per).forEach(function (id) {
      var el = document.querySelector('[data-np="' + id + '"]');
      if (el) el.textContent = per[id][0] ? per[id][0] + "/" + per[id][1] : "";
    });
  }
  boxes.forEach(function (b) {
    b.checked = !!state[b.dataset.k];
    b.addEventListener("change", function () { state[b.dataset.k] = b.checked; save(); refresh(); });
  });
  refresh();

  // price column toggle
  var segs = document.querySelectorAll(".seg button");
  segs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      segs.forEach(function (o) { o.classList.toggle("on", o === btn); });
      var k = btn.dataset.price;
      document.querySelectorAll("td.pr").forEach(function (td) {
        var v = parseFloat(td.dataset[k === "buy" ? "buy" : "scr"]);
        td.textContent = "A$" + Math.round(v).toLocaleString("en-AU");
      });
    });
  });

  // robot map pins
  var spec = document.getElementById("spec");
  function show(key) {
    var j = (window.JOINTS || {})[key];
    if (!j || !spec) return;
    document.querySelectorAll(".pin").forEach(function (p) { p.classList.toggle("on", p.dataset.j === key); });
    var tag = j.kind === "hub" ? "hub motors" : (j.kind === "drill" ? "drill gearmotors" : "power");
    var rows = [];
    if (j.motors) rows.push(["Motors", j.motors + (j.kind === "hub" ? " hub motor" : " drill") + (j.motors > 1 ? "s" : "") + (key === "ankle" ? " per push-rod, 2 per foot" : "")]);
    rows.push(["How", j.how]);
    rows.push([j.kind === "batt" ? "Runtime" : "Gearing", j.red]);
    if (j.torque) rows.push(["Peak torque", j.torque]);
    if (j.speed) rows.push(["No-load speed", j.speed]);
    if (j.range) rows.push(["Range", j.range]);
    if (j.clutch) rows.push(["Clutch slips at", j.clutch]);
    var h = '<span class="tag ' + j.kind + '">' + tag + "</span><h3>" + j.name + "</h3><p class=\"small\">" + j.what + "</p><dl>";
    rows.forEach(function (r) { h += "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; });
    spec.innerHTML = h + "</dl>";
  }
  document.querySelectorAll(".pin").forEach(function (p) {
    p.addEventListener("click", function () { show(p.dataset.j); });
    p.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(p.dataset.j); } });
  });
  show("knee");

  // copy buttons
  document.querySelectorAll(".copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var pre = btn.parentNode.querySelector("pre");
      var txt = pre ? pre.innerText : "";
      var done = function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy"; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, function () { selectText(pre); });
      } else { selectText(pre); }
    });
  });
  function selectText(el) {
    if (!el) return;
    var r = document.createRange(); r.selectNodeContents(el);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  // current stage in the rail
  var links = {};
  document.querySelectorAll("[data-nav]").forEach(function (a) { links[a.dataset.nav] = a; });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) {
          Object.keys(links).forEach(function (k) { links[k].classList.toggle("cur", k === e.target.id); });
        }
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    document.querySelectorAll("section.stage").forEach(function (s) { io.observe(s); });
  }
})();
