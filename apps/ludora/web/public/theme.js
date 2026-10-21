// Applies the saved theme before first paint so the page never flashes the wrong colours.
// A file rather than an inline script, because the Content Security Policy allows scripts from this origin only.
try {
  var t = localStorage.getItem('ludora.theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
