"""Build simple/tutorial/S1-build-guide.html (and the PDF via Playwright) from S1-build-guide.md.

    python simple/tutorial/make_pdf.py            # writes S1-build-guide.html next to this file
    node <playwright script> ... (see print_pdf() - run automatically when node + playwright are available)

Renders in simple/renders/*.png are embedded at the top (base64), so the HTML/PDF is a single file.
Needs: markdown.
"""
from __future__ import annotations

import base64
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import markdown

HERE = Path(__file__).resolve().parent
SIMPLE = HERE.parent
CSS = SIMPLE.parent / "docs" / "10-construction-tutorial" / "handbook_style.css"


def build_html():
    md = (HERE / "S1-build-guide.md").read_text()
    body = markdown.markdown(md, extensions=["tables", "sane_lists", "fenced_code"])
    body = body.replace("<table>", '<div class="tablewrap"><table>').replace("</table>", "</table></div>")
    imgs = sorted((SIMPLE / "renders").glob("*.png"))[:6]
    gallery = ""
    if imgs:
        figs = []
        for p in imgs:
            b64 = base64.b64encode(p.read_bytes()).decode()
            cap = re.sub(r"^\d+_", "", p.stem).replace("_", " ")
            figs.append(f'<figure class="fig"><a><img src="data:image/png;base64,{b64}" alt="{cap}"></a>'
                        f'<figcaption><span class="kind">Render</span> {cap}</figcaption></figure>')
        gallery = '<div class="gallery">' + "".join(figs) + "</div>"
    # first h1 -> hero title, gallery right after the intro
    body = body.replace("<h1>", '<h1 class="title">', 1)
    if gallery:
        body = body.replace("<hr />", gallery + "<hr />", 1)
    style = CSS.read_text() if CSS.exists() else ""
    html = f"""<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>KESTREL S1 Build Guide</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap">
<style>{style}
main {{ max-width: 46rem; margin: 0 auto; padding: 24px max(16px, env(safe-area-inset-left, 0px)) 48px; }}
main h2 {{ font-family: var(--display); font-weight: 600; font-size: 1.7rem; margin: 34px 0 10px; border-top: 2px solid var(--ink); padding-top: 18px; }}
@media print {{ main h2 {{ break-before: page; }} main h2:first-of-type {{ break-before: auto; }} }}
</style></head><body><main>{body}</main></body></html>"""
    out = HERE / "S1-build-guide.html"
    out.write_text(html)
    return out


def print_pdf(html_path):
    node = shutil.which("node")
    if not node:
        print("node not found: open the HTML and print to PDF")
        return None
    pdf = HERE / "KESTREL-S1-build-guide.pdf"
    js = f"""
const {{ chromium }} = require('playwright');
(async () => {{
  const proxy = process.env.HTTPS_PROXY ? {{ server: process.env.HTTPS_PROXY }} : undefined;
  const b = await chromium.launch({{ proxy }});
  const p = await b.newPage();
  await p.goto('file://{html_path}', {{ waitUntil: 'networkidle', timeout: 60000 }});
  await p.emulateMedia({{ media: 'print' }});
  await p.pdf({{ path: '{pdf}', format: 'A4', printBackground: true,
    margin: {{ top: '14mm', bottom: '14mm', left: '13mm', right: '13mm' }}, displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#666">KESTREL S1 build guide · <span class="pageNumber"></span> / <span class="totalPages"></span></div>' }});
  await b.close();
}})();
"""
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
        f.write(js)
    r = subprocess.run([node, f.name], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-800:])
        return None
    return pdf


if __name__ == "__main__":
    h = build_html()
    print("wrote", h)
    if "--no-pdf" not in sys.argv:
        print("wrote", print_pdf(h))
