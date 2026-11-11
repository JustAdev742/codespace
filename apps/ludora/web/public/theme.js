// Applies the saved theme and look settings (text size, typeface, spacing, contrast...) before first paint,
// so the page never flashes the wrong colours or reflows when the account loads.
// A file rather than an inline script, because the Content Security Policy allows scripts from this origin only.
try {
  var t = localStorage.getItem('ludora.theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  var look = JSON.parse(localStorage.getItem('ludora.look') || '{}');
  var attrs = look && look.attrs;
  if (attrs && typeof attrs === 'object') {
    for (var k in attrs) {
      if (/^[a-z]+$/.test(k) && typeof attrs[k] === 'string' && /^[a-z]+$/.test(attrs[k])) document.documentElement.dataset[k] = attrs[k];
    }
  }
} catch (e) {}
