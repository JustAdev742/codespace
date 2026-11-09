"""Assemble the whole construction tutorial into one illustrated page (and its images).

    python docs/10-construction-tutorial/make_handbook.py [out_dir]

Reads README.md + P00..P13 of this folder and, as appendices, docs/11 (testing and commissioning gates),
docs/09 (manufacturing package) and docs/13 (scratch-built motors and actuators). Every render, diagram,
plot and drawing sheet the text points to becomes a figure next to the text. Writes:
  out_dir/index.html   page body (title + style + content; no <html>/<body> wrapper)
  out_dir/print.html   the same, wrapped as a full document for printing to PDF
  out_dir/img/...      downscaled renders (JPEG), diagrams and drawings (SVG), plots (PNG)
Needs: markdown, pillow.
"""
from __future__ import annotations

import html
import re
import shutil
import sys
from pathlib import Path

import markdown
from PIL import Image

HERE = Path(__file__).resolve().parent
PROJ = HERE.parent.parent                       # projects/kestrel-humanoid
REPO_URL = "https://github.com/JustAdev742/codespace/blob/claude/dreamy-carson-f16476/projects/kestrel-humanoid/"
APPENDICES = [("a", "11-testing-commissioning.md", "Testing and commissioning gates"),
              ("b", "09-manufacturing-package.md", "Manufacturing package"),
              ("c", "13-scratch-build-motors-actuators.md", "Optional: scratch-built motors and actuators")]
IMG_DIRS = ("renders/", "diagrams/", "docs/img/", "cad/out/drawings/")


class Figs:
    """Collects the figures of one chapter and copies/downscales their files into out/img."""

    def __init__(self, out, chap):
        self.out, self.chap, self.items, self.index = out, chap, [], {}

    def add(self, rel, caption):
        rel = rel.lstrip("./")
        if rel in self.index:
            return self.index[rel]
        src = PROJ / rel
        if not src.exists():
            return None
        name = src.stem
        if rel.startswith("renders/"):
            dst = f"img/renders/{name}.jpg"
            if not (self.out / dst).exists():
                (self.out / dst).parent.mkdir(parents=True, exist_ok=True)
                im = Image.open(src).convert("RGB")
                im.thumbnail((1400, 1400))
                im.save(self.out / dst, quality=82, optimize=True)
        elif rel.startswith("docs/img/"):
            dst = f"img/plots/{name}.png"
            if not (self.out / dst).exists():
                (self.out / dst).parent.mkdir(parents=True, exist_ok=True)
                im = Image.open(src)
                im.thumbnail((1200, 1200))
                im.save(self.out / dst, optimize=True)
        else:
            sub = "drawings" if "drawings" in rel else "diagrams"
            dst = f"img/{sub}/{src.name}"
            (self.out / dst).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, self.out / dst)
        fid = f"fig-{self.chap}-{len(self.items) + 1}"
        kind = ("Drawing" if "drawings" in rel else "Diagram" if rel.startswith("diagrams/")
                else "Plot" if rel.startswith("docs/img/") else "Render")
        self.items.append(dict(id=fid, src=dst, caption=caption, kind=kind, rel=rel))
        self.index[rel] = fid
        return fid

    def gallery(self):
        if not self.items:
            return ""
        out = ['<div class="gallery">']
        for f in self.items:
            cls = "fig paper" if f["kind"] in ("Drawing", "Diagram", "Plot") else "fig"
            out.append(f'<figure class="{cls}" id="{f["id"]}"><a href="{f["src"]}" target="_blank" rel="noopener">'
                       f'<img src="{f["src"]}" alt="{html.escape(f["caption"])}" loading="lazy"></a>'
                       f'<figcaption><span class="kind">{f["kind"]}</span> {html.escape(f["caption"])}</figcaption></figure>')
        out.append("</div>")
        return "\n".join(out)


def anchor_for(path: Path):
    """In-page anchor for links to other chapters, else None."""
    if path.parent == HERE and re.match(r"P\d\d", path.name):
        return "#" + path.name[:3].lower()
    if path.parent == PROJ / "docs":
        for key, fname, _ in APPENDICES:
            if path.name == fname:
                return f"#app-{key}"
    return None


def pretty(stem):
    return stem.replace("__", " / ").replace("_", " ")


def convert(md_text: str, src_file: Path, figs: Figs, gallery_after_a=True) -> str:
    """Markdown chapter -> HTML with resolved links and an inline figure gallery."""
    lines = md_text.splitlines()
    out_lines = []
    for line in lines:
        # caption for figures on this line: bullet text before the first colon
        m = re.match(r"\s*[*-]\s+(.*?):", line)
        cap_line = re.sub(r"[`*]", "", m.group(1)).strip() if m else ""

        def link(mm):
            text, target = mm.group(1), mm.group(2)
            img = mm.group(0).startswith("!")
            if re.match(r"https?://", target):
                return mm.group(0)
            tpath = (src_file.parent / target.split("#")[0]).resolve()
            try:
                rel = tpath.relative_to(PROJ).as_posix()
            except ValueError:
                return text
            if rel.startswith(IMG_DIRS) and tpath.suffix.lower() in (".png", ".svg", ".jpg"):
                cap = cap_line or re.sub(r"[`*]", "", text).strip() or pretty(tpath.stem)
                if cap.endswith((".png", ".svg")) or "/" in cap:
                    cap = pretty(tpath.stem)
                fid = figs.add(rel, cap)
                if img:
                    return f"[[FIG:{fid}]]" if fid else ""
                return f"[{text}](#{fid})" if fid else text
            a = anchor_for(tpath)
            if a:
                return f"[{text}]({a})"
            return f"[{text}]({REPO_URL}{rel})"

        line = re.sub(r"!?\[([^\]]*)\]\(([^)\s]+)\)", link, line)

        # drawing sheets named in code spans
        def drawing(mm):
            name = mm.group(1)
            stem = Path(name).name
            p = PROJ / "cad/out/drawings" / stem
            if p.exists():
                fid = figs.add(f"cad/out/drawings/{stem}", f"{pretty(Path(stem).stem)}")
                return f"[`{name}`](#{fid})"
            return mm.group(0)
        line = re.sub(r"`((?:cad/out/drawings/)?[\w.\-]+\.svg)`", drawing, line)
        out_lines.append(line)

    # gallery placeholder: after the "A. Visual reference" block, else after the first paragraph
    if gallery_after_a:
        ia = next((i for i, l in enumerate(out_lines) if re.match(r"##\s+A\.", l)), None)
        if ia is not None:
            nxt = next((i for i in range(ia + 1, len(out_lines)) if out_lines[i].startswith("#")), len(out_lines))
            out_lines.insert(nxt, "\n[[GALLERY]]\n")
    body = markdown.markdown("\n".join(out_lines), extensions=["tables", "sane_lists", "fenced_code"])
    if "[[GALLERY]]" in body:
        body = body.replace("<p>[[GALLERY]]</p>", figs.gallery())
    elif figs.items:
        body += figs.gallery()
    body = re.sub(r"<p>\[\[FIG:(fig-[\w-]+)\]\]</p>", "", body)
    # shift headings one level down (the chapter header is h2), wrap tables for horizontal scroll
    for k in (4, 3, 2, 1):
        body = body.replace(f"<h{k}>", f"<h{k + 1}>").replace(f"</h{k}>", f"</h{k + 1}>")
    body = body.replace("<table>", '<div class="tablewrap"><table>').replace("</table>", "</table></div>")
    body = re.sub(r"<h3>([A-G])\. ", r'<h3 class="sec"><span class="letter">\1</span> ', body)
    return body


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "handbook"
    out.mkdir(parents=True, exist_ok=True)
    readme = (HERE / "README.md").read_text()
    # gates per phase from the phase map
    gates = dict(re.findall(r"\|\s*\[(P\d\d)\]\([^)]*\)\s*\|[^|]*\|\s*([^|]+?)\s*\|", readme))
    intro_md = re.sub(r"^# .*\n", "", readme, count=1)
    intro_md = re.sub(r"!\[[^\]]*\]\([^)]*\)\n", "", intro_md)
    intro = convert(intro_md, HERE / "README.md", Figs(out, "intro"), gallery_after_a=False)
    hero = Figs(out, "hero")
    hero.add("renders/12_exploded.png", "Exploded assembly")
    hero.add("renders/05_threequarter_front.png", "Fully assembled")

    chapters, toc = [], []
    for f in sorted(HERE.glob("P[0-9][0-9]-*.md")):
        text = f.read_text()
        h1 = re.match(r"# (P\d\d)\s*[—-]\s*(.*)", text)
        code, title = h1.group(1), h1.group(2).strip()
        body = convert(re.sub(r"^# .*\n", "", text, count=1), f, Figs(out, code.lower()))
        gate = gates.get(code, "—")
        gate_html = f'<span class="gate">Gate {html.escape(gate)}</span>' if gate not in ("—", "-") else ""
        chapters.append(f'<section class="chapter" id="{code.lower()}"><header class="chap-head">'
                        f'<span class="code">{code}</span><h2>{html.escape(title)}</h2>{gate_html}</header>{body}</section>')
        toc.append((code.lower(), code, title))
    apps = []
    for key, fname, title in APPENDICES:
        p = PROJ / "docs" / fname
        text = re.sub(r"^# .*\n", "", p.read_text(), count=1)
        body = convert(text, p, Figs(out, f"app{key}"), gallery_after_a=False)
        apps.append(f'<section class="chapter appendix" id="app-{key}"><header class="chap-head">'
                    f'<span class="code">App. {key.upper()}</span><h2>{html.escape(title)}</h2></header>{body}</section>')
        toc.append((f"app-{key}", f"App. {key.upper()}", title))

    toc_html = "".join(f'<li><a href="#{i}"><span class="tcode">{c}</span><span class="ttl">{html.escape(t)}</span></a></li>'
                       for i, c, t in toc)
    words = sum(len(re.sub(r"<[^>]+>", " ", c).split()) for c in chapters + apps)
    nfig = len(list((out / "img").rglob("*.*")))
    style = (HERE / "handbook_style.css").read_text()
    page = f"""<title>KESTREL K1 Build Tutorial</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap">
<style>
{style}
</style>
<div class="layout">
  <nav class="toc" aria-label="Phases">
    <a class="brand" href="#top">KESTREL K1<span>build tutorial</span></a>
    <details class="toc-details" open><summary>Phases and appendices</summary><ol>{toc_html}</ol></details>
  </nav>
  <script>try {{ if (matchMedia("(max-width: 999px)").matches) document.querySelector(".toc-details").removeAttribute("open"); }} catch (e) {{}}</script>
  <main id="top">
    <header class="hero">
      <p class="eyebrow">Full-size humanoid · 1.76 m · 84 kg estimated (92.6 kg design mass) · 16S Li-ion</p>
      <h1>KESTREL K1 build tutorial</h1>
      <p class="lede">Every phase from an empty workshop to a commissioned robot. In each phase: visual reference,
      parts with BOM IDs, tools, manufacturing, assembly with torques, electrical work, and the bench test that has
      to pass before you move on. {words:,} words, {nfig} figures and drawing sheets.</p>
      {hero.gallery()}
    </header>
    <section class="chapter intro" id="intro">{intro}</section>
    {''.join(chapters)}
    {''.join(apps)}
    <footer class="foot">Generated from <code>docs/10-construction-tutorial/</code>, <code>docs/09</code>, <code>docs/11</code> and
    <code>docs/13</code> of the KESTREL K1 design package by <code>make_handbook.py</code>. The engineering numbers come
    from <code>calc/run_all.py</code>; when a design value changes, re-run it and regenerate this page.</footer>
  </main>
</div>
"""
    (out / "index.html").write_text(page)
    fonts = re.search(r'(<link rel="stylesheet"[^>]+>)', page).group(1)
    (out / "print.html").write_text(f'<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8">'
                                    f'<meta name="viewport" content="width=device-width, initial-scale=1">{fonts}'
                                    f"</head><body>{page}</body></html>")
    print(f"wrote {out / 'index.html'}: {len(chapters)} phases, {len(apps)} appendices, {words} words, {nfig} image files")


if __name__ == "__main__":
    main()
