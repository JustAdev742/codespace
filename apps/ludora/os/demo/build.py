#!/usr/bin/env python3
"""Build the dashboard demo: the real dashboard page with a pretend server inside it.

    python3 apps/ludora/os/demo/build.py OUT_DIR

Writes OUT_DIR/index.html (page content only, for a host that wraps it in its own <html>), and copies
dash.css and dash.js beside it unchanged. Pass --standalone for a complete HTML document instead,
which opens straight from disk or any static web server.
"""
from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DASH = HERE.parent / "rootfs/usr/share/ludora-os/dash"


def build(out: Path, standalone: bool) -> None:
    page = (DASH / "index.html").read_text(encoding="utf-8")
    body = re.search(r"<body[^>]*>(.*)</body>", page, re.S)
    if not body:
        sys.exit("dash/index.html has no <body>")
    inner = body.group(1)
    # A script must not be able to close its own tag early.
    script = lambda name: (HERE / name).read_text(encoding="utf-8").replace("</script", "<\\/script")
    parts = [
        "<title>Ludora OS Dashboard Demo</title>",
        '<link rel="stylesheet" href="dash.css">',
        f"<style>\n{(HERE / 'bar.css').read_text(encoding='utf-8')}</style>",
        (HERE / "bar.html").read_text(encoding="utf-8"),
        inner.strip(),
        f"<script>\n{script('mock.js')}</script>",
        f"<script>\n{script('bar.js')}</script>",
        '<script src="dash.js"></script>',
    ]
    content = "\n".join(parts) + "\n"
    if standalone:
        content = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
                   '<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n'
                   + content + "</body>\n</html>\n")
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(content, encoding="utf-8")
    for name in ("dash.css", "dash.js"):
        shutil.copyfile(DASH / name, out / name)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--standalone"]
    if len(args) != 1:
        sys.exit(__doc__)
    build(Path(args[0]), "--standalone" in sys.argv)
