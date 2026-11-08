"""Training terrain: a grid of tiles built from cheap collision primitives.

Rows are difficulty levels 0..R-1; columns are terrain types (the Isaac Lab rough-terrain mix):
  0 flat · 1 random rough · 2 pyramid slope (walk DOWNHILL leaving the centre) · 3 inverted slope (uphill)
  4 pyramid stairs (walk DOWN stairs leaving the centre) · 5 inverted stairs (walk UP)
Step height grows with difficulty from 0.05 to 0.18 m (the K1 stair requirement), tread 0.30 m;
slopes grow from 4 to 15 deg; rough amplitude from 0.02 to 0.10 m.

Geometry: stairs are boxes, slopes are convex meshes, the ground is a plane and only the rough tiles are
heightfields. Sphere-box and sphere-plane contacts are analytic, which halves the physics cost compared
with one heightfield for everything (the robot's feet are four spheres each).

`make()` returns the height map H sampled from exactly that geometry (RES grid, centred on the origin);
the policy's height scan and the curriculum read H through HeightSampler.
"""
from __future__ import annotations

import numpy as np

TILE = 6.0       # m
RES = 0.05       # m per height-map sample
ROWS, COLS = 6, 6
BORDER = 3.0
STEP_MIN, STEP_MAX = 0.05, 0.18
TREAD = 0.30
PLATFORM = 0.6   # half-width of the flat centre of slope tiles; stairs' centre step reaches PLATFORM + TREAD
N_TILE = int(round(TILE / RES))
HALF = (N_TILE - 1) * RES / 2      # 2.975 m: offset of the outermost sample from the tile centre
NAMES = ["flat", "rough", "slope_down", "slope_up", "stairs_down", "stairs_up"]


def params(row, rows=ROWS):
    diff = row / max(rows - 1, 1)
    return dict(step=STEP_MIN + (STEP_MAX - STEP_MIN) * diff, slope=float(np.tan(np.radians(4 + 11 * diff))),
                rough=0.02 + 0.08 * diff)


def n_steps():
    return int(np.floor((HALF - PLATFORM) / TREAD))          # 7 rings outside the centre step


def tile_center(row, col):
    """World (x, y) of a tile centre. The map is centred on the world origin."""
    x = -(COLS * TILE + 2 * BORDER) / 2 + BORDER + (col + 0.5) * TILE
    y = -(ROWS * TILE + 2 * BORDER) / 2 + BORDER + (row + 0.5) * TILE
    return x, y


def _tile_height(row, col, rng):
    """Analytic surface of one tile on its sample grid (row index = y)."""
    p = params(row)
    u = (np.arange(N_TILE) - (N_TILE - 1) / 2) * RES
    uy, ux = np.meshgrid(u, u, indexing="ij")
    cheb = np.maximum(np.abs(ux), np.abs(uy))
    nmax = n_steps()
    if col == 0:
        return np.zeros_like(cheb)
    if col == 1:
        t = rng.uniform(0, 2 * p["rough"], cheb.shape)
        k = np.ones(3) / 3
        t = np.apply_along_axis(lambda v: np.convolve(v, k, "same"), 0, t)
        t = np.apply_along_axis(lambda v: np.convolve(v, k, "same"), 1, t)
        return t
    if col == 2:
        return np.maximum(0.0, p["slope"] * (HALF - np.maximum(cheb, PLATFORM)))
    if col == 3:
        return p["slope"] * np.clip(cheb - PLATFORM, 0, None)
    n = np.floor(np.clip(cheb - PLATFORM, 0, None) / TREAD)
    return (nmax - n) * p["step"] if col == 4 else n * p["step"]


def make(seed=0, rows=ROWS, cols=COLS):
    """Height map of the whole terrain plus the per-tile data the MJCF needs."""
    rng = np.random.default_rng(seed)
    nb = int(round(BORDER / RES))
    H = np.zeros((rows * N_TILE + 2 * nb, cols * N_TILE + 2 * nb), dtype=np.float32)
    tiles = {}
    for r in range(rows):
        for c in range(cols):
            t = _tile_height(r, c, rng).astype(np.float32)
            H[nb + r * N_TILE: nb + (r + 1) * N_TILE, nb + c * N_TILE: nb + (c + 1) * N_TILE] = t
            tiles[(r, c)] = t
    make.tiles = tiles
    return H


def mjcf(H):
    """(asset_xml, worldbody_xml, hfields) for the terrain; hfields = [(asset name, normalised data)]."""
    tiles = getattr(make, "tiles", None)
    assert tiles is not None, "call make() first"
    assets, geoms, hfields = [], ['<geom name="ground" type="plane" size="0 0 0.05" rgba="0.55 0.57 0.6 1"/>'], []
    nmax = n_steps()
    E = TILE / 2                                  # boxes and meshes reach the tile edge
    for (r, c), t in tiles.items():
        cx, cy = tile_center(r, c)
        p = params(r)
        tag = f"t{r}{c}"
        if c == 1:
            zmax = float(max(t.max(), 1e-3))
            assets.append(f'<hfield name="{tag}" nrow="{N_TILE}" ncol="{N_TILE}" size="{HALF} {HALF} {zmax:.4f} 0.05"/>')
            geoms.append(f'<geom name="{tag}" type="hfield" hfield="{tag}" pos="{cx} {cy} 0" rgba="0.55 0.57 0.6 1"/>')
            hfields.append((tag, (t / zmax).astype(np.float32)))
        elif c == 2:
            top = p["slope"] * (HALF - PLATFORM)
            bot = p["slope"] * (HALF - E)                                  # just below 0 at the edge
            v = [(sx * PLATFORM, sy * PLATFORM, top) for sx in (-1, 1) for sy in (-1, 1)]
            v += [(sx * E, sy * E, z) for sx in (-1, 1) for sy in (-1, 1) for z in (bot, -0.05)]
            assets.append(f'<mesh name="{tag}" vertex="{" ".join(f"{a:.4f}" for xyz in v for a in xyz)}"/>')
            geoms.append(f'<geom name="{tag}" type="mesh" mesh="{tag}" pos="{cx} {cy} 0" rgba="0.55 0.57 0.6 1"/>')
        elif c == 3:
            top = p["slope"] * (E - PLATFORM)
            for k, (ax, sg) in enumerate([(0, 1), (0, -1), (1, 1), (1, -1)]):
                pts = [(PLATFORM, -PLATFORM, 0.0), (PLATFORM, PLATFORM, 0.0), (E, -E, top), (E, E, top),
                       (PLATFORM, -PLATFORM, -0.05), (PLATFORM, PLATFORM, -0.05), (E, -E, -0.05), (E, E, -0.05)]
                v = [((sg * a, b, z) if ax == 0 else (b, sg * a, z)) for a, b, z in pts]
                assets.append(f'<mesh name="{tag}_{k}" vertex="{" ".join(f"{a:.4f}" for xyz in v for a in xyz)}"/>')
                geoms.append(f'<geom name="{tag}_{k}" type="mesh" mesh="{tag}_{k}" pos="{cx} {cy} 0" rgba="0.55 0.57 0.6 1"/>')
        elif c == 4:
            for j in range(nmax):                                          # nested boxes, highest in the middle
                h, a = (nmax - j) * p["step"], PLATFORM + (j + 1) * TREAD
                geoms.append(f'<geom name="{tag}_{j}" type="box" pos="{cx} {cy} {(h - 0.05) / 2:.4f}" '
                             f'size="{a:.3f} {a:.3f} {(h + 0.05) / 2:.4f}" rgba="0.55 0.57 0.6 1"/>')
        elif c == 5:
            for n in range(1, nmax + 1):                                   # square rings, higher outwards
                h, a0 = n * p["step"], PLATFORM + n * TREAD
                a1 = E if n == nmax else a0 + TREAD
                ai = a0 - 0.002              # 2 mm under the lower ring: no coplanar faces (render z-fighting)
                w, mid, zc, hz = (a1 - ai) / 2, (ai + a1) / 2, (h - 0.05) / 2, (h + 0.05) / 2
                for k, (px, py, sx, sy) in enumerate([(mid, 0, w, a1), (-mid, 0, w, a1), (0, mid, ai, w), (0, -mid, ai, w)]):
                    geoms.append(f'<geom name="{tag}_{n}_{k}" type="box" pos="{cx + px:.4f} {cy + py:.4f} {zc:.4f}" '
                                 f'size="{sx:.4f} {sy:.4f} {hz:.4f}" rgba="0.55 0.57 0.6 1"/>')
    return "\n    ".join(assets), "\n    ".join(geoms), hfields


class HeightSampler:
    def __init__(self, H):
        self.H = H
        self.ny, self.nx = H.shape
        self.x0 = -(self.nx - 1) * RES / 2
        self.y0 = -(self.ny - 1) * RES / 2

    def __call__(self, x, y):
        """Bilinear terrain height at world points (arrays)."""
        fx = np.clip((x - self.x0) / RES, 0, self.nx - 1.001)
        fy = np.clip((y - self.y0) / RES, 0, self.ny - 1.001)
        ix, iy = fx.astype(int), fy.astype(int)
        ax, ay = fx - ix, fy - iy
        H = self.H
        return ((1 - ax) * (1 - ay) * H[iy, ix] + ax * (1 - ay) * H[iy, ix + 1] +
                (1 - ax) * ay * H[iy + 1, ix] + ax * ay * H[iy + 1, ix + 1])
