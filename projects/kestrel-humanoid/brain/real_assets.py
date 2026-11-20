"""Real surfaces for the house: photographed, physically based textures (colour, surface relief and occlusion /
roughness / metal maps) and a real indoor environment for lighting, from Poly Haven (polyhaven.com), all CC0 (free for
any use, no attribution needed).

    python real_assets.py          # downloads about 45 MB into data/real/ (once; the house uses them from then on)

Without them the house uses its own generated textures, so nothing breaks offline. They are not in git: they are
large, and anyone can fetch them again with this script.
"""
from __future__ import annotations

import io
import json
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DEST = HERE / "data" / "real"
API = "https://api.polyhaven.com/files/"

# house material -> (Poly Haven texture, repeats per metre: how big one image is on the surface)
TEXTURES = {
    "wood_floor": ("laminate_floor_02", 0.45), "tile_floor": ("interior_tiles", 0.5), "bath_floor": ("granite_tile_03", 0.6),
    "carpet": ("velour_velvet", 0.8), "paint": ("beige_wall_001", 0.4), "grass": ("aerial_grass_rock", 0.25),
    "deck": ("weathered_brown_planks", 0.45), "fabric_grey": ("fabric_pattern_07", 1.2), "fabric_bed": ("fabric_pattern_05", 1.0),
    "wood_dark": ("dark_wood", 0.8), "wood_light": ("oak_veneer_01", 0.8), "worktop": ("grey_cartago_03", 0.6),
}
HDRI = "lebombo"                       # a lived-in living room: the light the house is lit with in the Filament view
FACE = 512                             # pixels per cube face of the environment


def _get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "kestrel-house-assets"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _png(data, path, mode="RGB"):
    from PIL import Image
    Image.open(io.BytesIO(data)).convert(mode).save(path)


def equirect_to_cube(img, n=FACE):
    """An equirectangular panorama -> MuJoCo's skybox grid (3 x 4 faces, layout '.U..LFRB.D..'), Z up."""
    h, w, _ = img.shape
    out = np.zeros((3 * n, 4 * n, 3), np.uint8)
    a = (np.arange(n) + 0.5) / n * 2 - 1
    u, v = np.meshgrid(a, -a)                                     # u right, v up on each face
    # MuJoCo skybox faces (Z up): direction for each face pixel
    faces = {"F": (np.ones_like(u), u, v), "B": (-np.ones_like(u), -u, v), "R": (-u, np.ones_like(u), v),
             "L": (u, -np.ones_like(u), v), "U": (-v, u, np.ones_like(u)), "D": (v, u, -np.ones_like(u))}
    cells = {"U": (0, 1), "L": (1, 0), "F": (1, 1), "R": (1, 2), "B": (1, 3), "D": (2, 1)}
    for f, (x, y, z) in faces.items():
        lon = np.arctan2(y, x)
        lat = np.arctan2(z, np.hypot(x, y))
        px = ((0.5 - lon / (2 * math.pi)) % 1.0) * (w - 1)
        py = (0.5 - lat / math.pi) * (h - 1)
        r, c = cells[f]
        out[r * n:(r + 1) * n, c * n:(c + 1) * n] = img[py.astype(int), px.astype(int)]
    return out


def fetch(dest=DEST, verbose=True):
    dest.mkdir(parents=True, exist_ok=True)
    manifest = {"textures": {}, "hdri": None, "license": "CC0 (Poly Haven)"}
    for mat, (tid, rep) in TEXTURES.items():
        files = {k: dest / f"{tid}_{k}.png" for k in ("rgb", "normal", "orm")}
        try:
            if not all(p.exists() for p in files.values()):
                info = json.loads(_get(API + tid))
                colour = "Diffuse" if "Diffuse" in info else sorted(k for k in info if k.lower().startswith("col"))[0]
                for key, kind in ((colour, "rgb"), ("nor_gl", "normal"), ("arm", "orm")):
                    _png(_get(info[key]["1k"]["jpg"]["url"]), files[kind])
            manifest["textures"][mat] = dict(id=tid, repeat=rep, **{k: p.name for k, p in files.items()})
            if verbose:
                print(f"  {mat:12s} <- {tid}", flush=True)
        except Exception as e:                                    # one missing texture: the generated one stays
            print(f"  {mat:12s} skipped ({type(e).__name__}: {e})", flush=True)
    try:
        cube = dest / f"{HDRI}_cube.png"
        if not cube.exists():
            from PIL import Image
            info = json.loads(_get(API + HDRI))
            pano = np.asarray(Image.open(io.BytesIO(_get(info["tonemapped"]["url"]))).convert("RGB"))
            Image.fromarray(equirect_to_cube(pano)).save(cube)
        manifest["hdri"] = dict(id=HDRI, cube=cube.name)
        if verbose:
            print(f"  environment  <- {HDRI}", flush=True)
    except Exception as e:
        print(f"  environment  skipped ({type(e).__name__}: {e})", flush=True)
    (dest / "manifest.json").write_text(json.dumps(manifest, indent=1))
    return manifest


def manifest(dest=DEST):
    p = dest / "manifest.json"
    try:
        return json.loads(p.read_text()) if p.exists() else None
    except ValueError:
        return None


if __name__ == "__main__":
    print("Fetching real textures and an indoor environment (CC0, polyhaven.com) ...")
    m = fetch()
    print(f"{len(m['textures'])} textures, environment: {bool(m['hdri'])} -> {DEST}")
    sys.exit(0)
