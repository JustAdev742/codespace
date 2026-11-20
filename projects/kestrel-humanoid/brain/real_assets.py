"""Real surfaces for the house: photographed, physically based textures (colour, surface relief and occlusion /
roughness / metal maps) and a real indoor environment for lighting, from Poly Haven (polyhaven.com), all CC0 (free for
any use, no attribution needed).

    python real_assets.py          # downloads about 110 MB into data/real/ (once; the house uses them from then on)

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

# Scanned and modelled furniture and household things (Poly Haven, CC0): what the house's furniture and objects look
# like. Only the look: each one is fitted over the simple collision shape it stands for (house.py), so the physics, the
# robot's map and its reach are unchanged and a model never pokes out of what the robot can bump into.
# model -> texture size (pixels): big furniture gets sharper textures than small things.
MODELS = {
    "sofa_02": 1024, "ArmChair_01": 1024, "wooden_table_02": 1024, "dining_chair_02": 512,
    "modern_coffee_table_01": 1024, "modern_wooden_cabinet": 1024, "ClassicNightstand_01": 512, "GothicBed_01": 1024,
    "vintage_cabinet_01": 1024, "wooden_bookshelf_worn": 1024, "metal_office_desk": 1024, "painted_wooden_chair_01": 512,
    "metal_stool_01": 512, "potted_plant_02": 1024, "potted_plant_04": 512, "chinese_console_table": 1024,
    "gallinera_table": 512, "old_bed_frame": 1024, "drawer_cabinet": 1024, "painted_wooden_cabinet": 512,
    "modern_ceiling_lamp_01": 512,
    # things the robot picks up
    "vintage_electric_kettle": 512, "pot_enamel_01": 512, "brass_pan_01": 512, "wooden_cutting_board": 512,
    "wicker_basket_02": 512, "metal_toolbox": 512, "multi_cleaner_bottle": 512, "carved_wooden_plate": 512,
    "wooden_bucket_02": 512,
}


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


# ----------------------------------------------------------------------- 3D models (glTF -> OBJ + PNG for MuJoCo)
_CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8, 5122: np.int16, 5120: np.int8}
_NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def _quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def read_gltf(path):
    """A .gltf file's triangles, grouped by material, in metres with Z up (glTF is Y up):
    {material index: (positions [N,3], normals [N,3], uvs [N,2], triangles [M,3])}, and the glTF document."""
    path = Path(path)
    g = json.loads(path.read_text())
    bufs = [np.frombuffer((path.parent / b["uri"]).read_bytes(), np.uint8) for b in g["buffers"]]

    def acc(i):
        a = g["accessors"][i]
        bv = g["bufferViews"][a["bufferView"]]
        dt, n = np.dtype(_CT[a["componentType"]]), _NC[a["type"]]
        stride = bv.get("byteStride") or n * dt.itemsize
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        idx = off + np.arange(a["count"])[:, None] * stride + np.arange(n * dt.itemsize)[None]
        out = bufs[bv["buffer"]][idx].view(dt).reshape(a["count"], n)
        if a.get("normalized"):
            out = out.astype(np.float32) / np.iinfo(dt).max
        return out

    parts = {}

    def visit(k, M):
        nd = g["nodes"][k]
        if "matrix" in nd:
            L = np.array(nd["matrix"], float).reshape(4, 4).T
        else:
            L = np.eye(4)
            L[:3, :3] = _quat_mat(nd.get("rotation", (0, 0, 0, 1))) * np.array(nd.get("scale", (1, 1, 1)))
            L[:3, 3] = nd.get("translation", (0, 0, 0))
        M = M @ L
        if "mesh" in nd:
            N = np.linalg.inv(M[:3, :3]).T
            for p in g["meshes"][nd["mesh"]]["primitives"]:
                if p.get("mode", 4) != 4:
                    continue
                at = p["attributes"]
                v = acc(at["POSITION"]).astype(float) @ M[:3, :3].T + M[:3, 3]
                nrm = acc(at["NORMAL"]).astype(float) @ N.T if "NORMAL" in at else np.zeros_like(v)
                nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
                uv = acc(at["TEXCOORD_0"]).astype(float) if "TEXCOORD_0" in at else np.zeros((len(v), 2))
                f = acc(p["indices"]).reshape(-1, 3).astype(np.int64) if "indices" in p else np.arange(len(v)).reshape(-1, 3)
                parts.setdefault(p.get("material", -1), []).append((v, nrm, uv, f))
        for c in nd.get("children", ()):
            visit(c, M)

    for root in g["scenes"][g.get("scene", 0)]["nodes"]:
        visit(root, np.eye(4))
    out = {}
    yz = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float)            # Y up -> Z up: (x, y, z) -> (x, -z, y)
    for mat, chunks in parts.items():
        vs, ns, us, fs, n0 = [], [], [], [], 0
        for v, nrm, uv, f in chunks:
            vs.append(v @ yz.T)
            ns.append(nrm @ yz.T)
            us.append(uv)
            fs.append(f + n0)
            n0 += len(v)
        out[mat] = (np.concatenate(vs), np.concatenate(ns), np.concatenate(us), np.concatenate(fs))
    return out, g


def _write_obj(path, v, n, uv, f):
    vt = np.column_stack([uv[:, 0], 1.0 - uv[:, 1]])                   # glTF's texture origin is top left, OBJ's bottom left
    f1 = f + 1
    lines = ["\n".join(f"v {a:.5f} {b:.5f} {c:.5f}" for a, b, c in v),
             "\n".join(f"vt {a:.5f} {b:.5f}" for a, b in vt),
             "\n".join(f"vn {a:.4f} {b:.4f} {c:.4f}" for a, b, c in n),
             "\n".join(f"f {a}/{a}/{a} {b}/{b}/{b} {c}/{c}/{c}" for a, b, c in f1)]
    path.write_text("\n".join(lines) + "\n")


def convert_model(src, out, px=1024):
    """A downloaded glTF model -> one OBJ (+ colour, relief and occlusion/roughness/metal PNGs) per material, sitting on
    z = 0 and centred on x = y = 0, and meta.json with its size and parts."""
    from PIL import Image
    parts, g = read_gltf(src)
    allv = np.concatenate([p[0] for p in parts.values()])
    lo, hi = allv.min(0), allv.max(0)
    shift = np.array([-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]])
    out.mkdir(parents=True, exist_ok=True)
    meta = {"size": [round(float(s), 4) for s in hi - lo], "parts": []}

    def image(tex_ref, name, mode):
        if not tex_ref:
            return None
        src_img = g["images"][g["textures"][tex_ref["index"]]["source"]]["uri"]
        im = Image.open(Path(src).parent / src_img).convert(mode)
        if max(im.size) > px:
            im = im.resize((px, px * im.size[1] // im.size[0]), Image.LANCZOS)
        im.save(out / name)
        return name

    for k, (mat, (v, nrm, uv, f)) in enumerate(sorted(parts.items(), key=lambda t: t[0])):
        m = g["materials"][mat] if mat >= 0 else {}
        pbr = m.get("pbrMetallicRoughness", {})
        alpha = m.get("alphaMode", "OPAQUE")
        p = {"obj": f"part{k}.obj", "rgba": [round(float(c), 4) for c in pbr.get("baseColorFactor", (1, 1, 1, 1))],
             "alpha": alpha, "rough": float(pbr.get("roughnessFactor", 1.0)), "metal": float(pbr.get("metallicFactor", 1.0))}
        p["rgb"] = image(pbr.get("baseColorTexture"), f"part{k}_rgb.png", "RGBA" if alpha == "MASK" else "RGB")
        p["normal"] = image(m.get("normalTexture"), f"part{k}_normal.png", "RGB")
        p["orm"] = image(pbr.get("metallicRoughnessTexture"), f"part{k}_orm.png", "RGB")
        _write_obj(out / p["obj"], v + shift, nrm, uv, f)
        meta["parts"].append(p)
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    return meta


def fetch_models(dest=DEST, verbose=True, only=None):
    """Download and convert the furniture and household models (about 60 MB of downloads, once)."""
    found = {}
    for mid, px in MODELS.items():
        if only and mid not in only:
            continue
        out = dest / "models" / mid
        try:
            if not (out / "meta.json").exists():
                src = dest / "models_src" / mid
                info = json.loads(_get(API + mid))["gltf"]["1k"]["gltf"]
                src.mkdir(parents=True, exist_ok=True)
                (src / Path(info["url"]).name).write_bytes(_get(info["url"]))
                for rel, f in info.get("include", {}).items():
                    (src / rel).parent.mkdir(parents=True, exist_ok=True)
                    (src / rel).write_bytes(_get(f["url"]))
                convert_model(src / Path(info["url"]).name, out, px)
                import shutil
                shutil.rmtree(src, ignore_errors=True)            # the converted copy is all the house needs
            found[mid] = f"models/{mid}"
            if verbose:
                print(f"  model        <- {mid}", flush=True)
        except Exception as e:                                    # that piece keeps its plain shape
            print(f"  model {mid} skipped ({type(e).__name__}: {e})", flush=True)
    return found


def model(mid, dest=DEST):
    """A converted model's meta (size, parts with absolute file paths), or None if it hasn't been fetched."""
    p = dest / "models" / mid / "meta.json"
    if not p.exists():
        return None
    try:
        meta = json.loads(p.read_text())
    except ValueError:
        return None
    for part in meta["parts"]:
        for key in ("obj", "rgb", "normal", "orm"):
            if part.get(key):
                part[key] = (p.parent / part[key]).as_posix()
    return meta


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
    manifest["models"] = fetch_models(dest, verbose)
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
    print(f"{len(m['textures'])} textures, {len(m['models'])} models, environment: {bool(m['hdri'])} -> {DEST}")
    sys.exit(0)
