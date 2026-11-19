"""Download the CMU Graphics Lab motion capture database and retarget it to the G1 (one command).

    python -m motion.build_cmu                       # -> runs/motion/cmu_library.npz + cmu_captions.json

About 2400 clips (9 hours) of everyday motion with a text description each: walking and running in every way,
jumping, dancing, sports, playground, sitting, eating and drinking, stretching, animal imitations, gestures. Clips
whose description mentions fighting (punch, kick, boxing, martial arts, ...) are never downloaded (safety.py), and
the library build filters striking motions again. The CMU data is free for all uses
(mocap.cs.cmu.edu; the database was created with funding from NSF EIA-0196217).
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .safety import _RX as COMBAT

SITE = "http://mocap.cs.cmu.edu"


def index():
    """[(subject, trial, description, fps)] from the database's full listing."""
    with urllib.request.urlopen(f"{SITE}/search.php?subjectnumber=%25&motion=%25", timeout=120) as r:
        s = r.read().decode("latin-1")
    out = []
    for num, desc, rest in re.findall(r"<TD>(\d+)</TD><TD>([^<]*)</TD>(.*?)</TR>", s, re.S):
        m = re.search(r"/subjects/(\d+)/(\d+_\d+)\.amc", rest)
        fps = re.findall(r"<TD>(\d+)</TD>", rest)
        if m:
            out.append((m.group(1), m.group(2), html.unescape(desc).strip(), int(fps[-1]) if fps else 120))
    return out


def allowed(desc):
    d = re.sub(r"[\s\-\.]", "_", desc.lower())
    return bool(desc.strip()) and not COMBAT.search(d) and not re.search(r"\b(box|punch|kick|fight)", desc.lower())


def fetch(url, dst, tries=3):
    if dst.exists() and dst.stat().st_size > 0:
        return True
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                data = r.read()
            dst.write_bytes(data)
            return True
        except Exception:
            pass
    return False


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--raw", default="runs/motion/cmu_raw")
    ap.add_argument("--out", default="runs/motion/cmu_library.npz")
    ap.add_argument("--captions", default="runs/motion/cmu_captions.json")
    ap.add_argument("--threads", type=int, default=8)
    ap.add_argument("--procs", type=int, default=None)
    ap.add_argument("--download-only", action="store_true")
    a = ap.parse_args()
    raw = Path(a.raw)
    rows = index()
    keep = [r for r in rows if allowed(r[2])]
    print(f"{len(rows)} clips listed; {len(keep)} kept ({len(rows) - len(keep)} left out: no description or fighting)")
    jobs = []
    for subj in sorted({r[0] for r in keep}):
        d = raw / subj.zfill(2)
        d.mkdir(parents=True, exist_ok=True)
        jobs.append((f"{SITE}/subjects/{subj.zfill(2)}/{subj.zfill(2)}.asf", d / f"{subj.zfill(2)}.asf"))
    captions = {}
    for subj, trial, desc, fps in keep:
        d = raw / subj.zfill(2)
        name = f"cmu_{trial}"
        jobs.append((f"{SITE}/subjects/{subj.zfill(2)}/{trial}.amc", d / f"{name}.amc"))
        if fps != 120:
            (d / f"{name}.fps").write_text(str(fps))
        captions[name] = desc
    with ThreadPoolExecutor(a.threads) as ex:
        ok = list(ex.map(lambda j: fetch(*j), jobs))
    print(f"downloaded {sum(ok)}/{len(jobs)} files into {raw}")
    Path(a.captions).parent.mkdir(parents=True, exist_ok=True)
    Path(a.captions).write_text(json.dumps(captions, indent=0))
    print(f"captions: {a.captions}")
    if a.download_only:
        return
    from . import library
    sys.argv = ["motion.library", "--data", str(raw), "--out", a.out] + (["--procs", str(a.procs)] if a.procs else [])
    library.main()
    print(f"\nmotion library: {a.out}")


if __name__ == "__main__":
    main()
