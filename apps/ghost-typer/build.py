#!/usr/bin/env python3
"""
Build Ghost Typer as a standalone app.

    python build.py            # one-file app for THIS operating system
    python build.py --onedir   # a folder instead (starts faster, more files)

Output lands in dist/:
    Windows   dist/Ghost Typer.exe
    macOS     dist/Ghost Typer.app
    Linux     dist/ghost-typer

PyInstaller cannot cross-compile, so run this on the operating system you
want the app for. The first run installs PyInstaller into your user site
if it is missing; nothing needs admin rights.

To build for all three at once, push this folder to GitHub with the
included .github/workflows/build.yml and download the artifacts.
"""

import os
import platform
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "ghost_typer.py")
NAME = "Ghost Typer"


def sh(*cmd):
    print("  $", " ".join(cmd))
    subprocess.check_call(list(cmd))


def ensure(module, package=None):
    """Install a package only if it is absent. Checks for presence rather
    than importing: pynput refuses to import without a display on Linux,
    which is not the same thing as being missing."""
    import importlib.util
    if importlib.util.find_spec(module) is not None:
        return
    print(f"==> installing {package or module}")
    try:
        sh(sys.executable, "-m", "pip", "install", "--quiet", package or module)
    except subprocess.CalledProcessError:
        sh(sys.executable, "-m", "pip", "install", "--quiet", "--user",
           package or module)


def load_app():
    """Import ghost_typer.py so the build can reuse its icon writer."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("ghost_typer", SRC)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["ghost_typer"] = mod
    spec.loader.exec_module(mod)
    return mod


def make_icon(app, build_dir):
    """Windows and Linux take the .ico the app already knows how to write.
    macOS wants .icns; iconutil ships with macOS, so use it when present."""
    ico = os.path.join(build_dir, "ghost_typer.ico")
    app.write_ico(ico, sizes=(16, 24, 32, 48, 64, 128, 256))
    if sys.platform != "darwin":
        return ico
    if shutil.which("iconutil") is None:
        return ico
    iconset = os.path.join(build_dir, "ghost.iconset")
    os.makedirs(iconset, exist_ok=True)
    try:
        # the ICO writer gives us BGRA rows; the PNG writer below is tiny
        for size, name in ((16, "16x16"), (32, "16x16@2x"), (32, "32x32"),
                           (64, "32x32@2x"), (128, "128x128"),
                           (256, "128x128@2x"), (256, "256x256"),
                           (512, "256x256@2x")):
            write_png(os.path.join(iconset, f"icon_{name}.png"),
                      size, app._ghost_pixels(size))
        icns = os.path.join(build_dir, "ghost_typer.icns")
        sh("iconutil", "-c", "icns", iconset, "-o", icns)
        return icns
    except Exception as exc:                        # pragma: no cover
        print("   (icns failed, using .ico:", exc, ")")
        return ico


def write_png(path, size, bgra_rows):
    """Minimal PNG encoder: RGBA, no filtering, stdlib only."""
    import struct
    import zlib
    raw = bytearray()
    for row in bgra_rows:
        raw.append(0)                                   # filter: none
        for i in range(0, len(row), 4):
            b, g, r, a = row[i:i + 4]
            raw += bytes((r, g, b, a))

    def chunk(kind, data):
        body = kind + data
        return (struct.pack(">I", len(data)) + body
                + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as fh:
        fh.write(png)


def main():
    if not os.path.exists(SRC):
        sys.exit(f"ghost_typer.py not found next to build.py ({SRC})")
    onedir = "--onedir" in sys.argv

    print("==> dependencies")
    ensure("pynput")
    ensure("webview", "pywebview")
    ensure("PyInstaller", "pyinstaller")

    build_dir = os.path.join(HERE, "build")
    os.makedirs(build_dir, exist_ok=True)
    app = load_app()
    icon = make_icon(app, build_dir)
    print("==> icon:", icon)

    # pynput picks its backend at import time by platform; PyInstaller can't
    # see that, so name them. pywebview ships DLLs and JS as data files.
    hidden = {
        "win32": ["pynput.keyboard._win32", "pynput.mouse._win32"],
        "darwin": ["pynput.keyboard._darwin", "pynput.mouse._darwin"],
    }.get(sys.platform, ["pynput.keyboard._xorg", "pynput.mouse._xorg"])

    cmd = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
           "--windowed", "--name", NAME if sys.platform != "linux" else "ghost-typer",
           "--icon", icon,
           "--collect-all", "webview",
           "--distpath", os.path.join(HERE, "dist"),
           "--workpath", os.path.join(build_dir, "pyinstaller"),
           "--specpath", build_dir]
    cmd += ["--onedir"] if onedir else ["--onefile"]
    for h in hidden:
        cmd += ["--hidden-import", h]
    if sys.platform == "win32":
        # pywebview's Windows backend runs on pythonnet
        for pkg in ("clr_loader", "pythonnet"):
            cmd += ["--collect-all", pkg]
    if sys.platform == "darwin":
        cmd += ["--osx-bundle-identifier", "dev.ghosttyper.app"]
    cmd.append(SRC)

    print("==> PyInstaller")
    sh(*cmd)

    dist = os.path.join(HERE, "dist")
    print("\n==> done. Look in", dist)
    for name in sorted(os.listdir(dist)):
        p = os.path.join(dist, name)
        size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(p) for f in fs) if os.path.isdir(p) else os.path.getsize(p)
        print(f"   {name}  ({size / 1e6:.1f} MB)")
    if sys.platform == "darwin":
        print("\nmacOS will ask for Accessibility permission on first run "
              "(System Settings -> Privacy & Security -> Accessibility).")
    if sys.platform == "win32":
        print("\nSmartScreen may warn on first launch because the exe is "
              "unsigned. 'More info -> Run anyway' clears it.")
    print(f"\nPlatform: {platform.platform()}")


if __name__ == "__main__":
    main()
