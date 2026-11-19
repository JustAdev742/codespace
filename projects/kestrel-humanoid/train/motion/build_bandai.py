"""Download the Bandai Namco motion dataset and build the G1 motion library the mover plays from (one command).

    python -m motion.build_bandai                    # -> runs/motion/bandai_library.npz

Fetches the dataset from GitHub as a zip (no git needed; about 0.5 GB), picks every clip of dataset 1 and the
"normal" and "active" styles of dataset 2 (1224 clips, 1.3 hours: walking in every direction and style, turning,
gestures), and retargets them to the G1 (motion.library: fighting moves are filtered out). About 6 minutes on 4 CPU
cores. The dataset is CC BY-NC 4.0 (Bandai Namco Research Inc.): non-commercial use, with attribution.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

URL_GIT = "https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset"
URL = "https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset/archive/refs/heads/master.zip"


def pick(name):
    """Which clips to use: all of dataset 1; the normal and active styles of dataset 2 (the rest repeat them)."""
    if name.startswith("dataset-1_"):
        return True
    return name.startswith("dataset-2_") and ("_normal_" in name or "_active_" in name)


def download(zp):
    print(f"downloading {URL}\n  -> {zp} (about 0.5 GB) ...", flush=True)
    tmp = zp.with_suffix(".part")
    with urllib.request.urlopen(URL) as r, open(tmp, "wb") as f:
        got = 0
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
            got += len(b)
            print(f"\r  {got / 1e6:7.0f} MB", end="", flush=True)
    print()
    tmp.rename(zp)


def main_with(a, src):
    a.src = str(src)
    return run(a)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--work", default="runs/motion/bandai_src", help="where the download and the picked clips go")
    ap.add_argument("--out", default="runs/motion/bandai_library.npz")
    ap.add_argument("--zip", default=None, help="an already downloaded zip of the dataset repository")
    ap.add_argument("--src", default=None, help="an existing clone (or unpacked copy) of the dataset repository")
    ap.add_argument("--procs", type=int, default=None)
    run(ap.parse_args())


def run(a):
    work = Path(a.work)
    work.mkdir(parents=True, exist_ok=True)
    sel = work / "picked"
    sel.mkdir(exist_ok=True)
    n = 0
    if a.src:                                            # an existing clone or unpacked copy
        for f in Path(a.src).rglob("*.bvh"):
            if pick(f.name):
                if not (sel / f.name).exists():
                    shutil.copyfile(f, sel / f.name)
                n += 1
    else:
        zp = Path(a.zip) if a.zip else work / "bandai.zip"
        if not zp.exists():
            try:
                download(zp)
            except Exception as e:                       # no zip download: try git instead
                print(f"zip download failed ({e}); trying git clone ...", flush=True)
                clone = work / "clone"
                if not clone.exists():
                    subprocess.run(["git", "clone", "--depth", "1", URL_GIT, str(clone)], check=True)
                return main_with(a, src=clone)
        with zipfile.ZipFile(zp) as z:
            for info in z.infolist():
                name = Path(info.filename).name
                if name.endswith(".bvh") and "/data/" in info.filename and pick(name):
                    dst = sel / name
                    if not dst.exists():
                        with z.open(info) as src, open(dst, "wb") as out:
                            shutil.copyfileobj(src, out)
                    n += 1
    print(f"{n} clips picked into {sel}", flush=True)
    from . import library
    sys.argv = ["motion.library", "--data", str(sel), "--out", a.out] + (["--procs", str(a.procs)] if a.procs else [])
    library.main()
    print(f"\nmotion library: {a.out}\nnext: python -m motion.live_mover --library {a.out}")


if __name__ == "__main__":
    main()
