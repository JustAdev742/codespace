"""Parametric, printable enclosure for the portal-gun prop (original design).

Builds six parts with constructive solid geometry (manifold3d) and writes STL files:

  body.stl      hollow chassis, open on top (PLA/PETG, opaque)
  lid.stl       top plate with display window, canister socket and dial hole
  emitter.stl   front bezel holding the NeoPixel Ring 16 behind a diffuser
  diffuser.stl  2 mm disc for the emitter (print in translucent PETG)
  canister.stl  "fluid" tube over the NeoPixel Jewel (translucent PETG)
  handle.stl    angled grip with a pocket for the 12 mm trigger button

Coordinates: millimetres, x forward (barrel), y left, z up. Component sizes come from the
retailer pages verified for the tutorial (report/04-prop-tutorial.md, section 2); sizes marked
ASSUMED were not on those pages and have generous clearances.

    python make_enclosure.py            # writes STLs + a preview PNG into ./out
"""

from __future__ import annotations

import json
import pathlib

import manifold3d as mf
import numpy as np

M = mf.Manifold
mf.set_circular_segments(96)

OUT = pathlib.Path(__file__).resolve().parent / "out"

# ---------------------------------------------------------------- parameters (mm)
P = dict(
    wall=2.4,                 # shell wall thickness
    fit=0.3,                  # sliding clearance between printed parts
    body_l=170.0, body_w=58.0, body_h=50.0, corner_r=8.0,
    # components (verified on retailer pages unless marked ASSUMED)
    feather=(52.1, 22.8, 12.2),           # Adafruit 5768
    lipo=(62.0, 34.0, 5.0),               # Adafruit 258, 1200 mAh
    ring_od=44.5, ring_id=31.7, ring_t=6.7,   # NeoPixel Ring 16 (1463)
    jewel_d=23.0, jewel_t=2.0,            # NeoPixel Jewel (2226)
    tft=(42.4, 36.2, 5.4), tft_window_d=33.0,  # Adafruit 6178; 1.28" round, window ASSUMED 33
    tof=(25.5, 17.5, 4.6), tof_window=(10.0, 6.0),  # Adafruit 3967; window ASSUMED
    speaker_d=39.0,                       # Adafruit 1891
    encoder_bushing_d=7.0,                # PEC11-style M7 bushing (ASSUMED)
    button=(12.0, 12.0, 6.0),             # Adafruit 1119 tactile switch
    usb_c=(10.0, 4.5),                    # opening for the Feather's USB-C plug (ASSUMED)
    emitter_od=66.0, emitter_len=20.0, diffuser_d=52.0, diffuser_t=2.0,
    canister_od=30.0, canister_len=60.0,
    handle=(32.0, 30.0, 95.0), handle_tilt=15.0,
)


HANDLE_X = -20.0   # grip position along the body (between the Feather and the LiPo)


def rounded_box(l, w, h, r):
    """Box with rounded vertical edges, base on z = 0, centred in x and y."""
    r = min(r, l / 2 - 0.01, w / 2 - 0.01)
    pts = []
    for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
        pts.append(M.cylinder(h, r).translate([sx * (l / 2 - r), sy * (w / 2 - r), 0]))
    return M.batch_hull(pts)


def cyl_x(length, r, x0=0.0, y=0.0, z=0.0):
    """Cylinder along +x starting at x0."""
    return M.cylinder(length, r).rotate([0, 90, 0]).translate([x0, y, z])


def cyl_y(length, r, x=0.0, y0=0.0, z=0.0):
    return M.cylinder(length, r).rotate([-90, 0, 0]).translate([x, y0, z])


def box(size, center):
    return M.cube(list(size), center=True).translate(list(center))


# ---------------------------------------------------------------- layout (shared)
def layout():
    w = P["wall"]
    L, W, H = P["body_l"], P["body_w"], P["body_h"]
    floor = w
    fx, fy, fz = P["feather"]
    lx, ly, lz = P["lipo"]
    # positions are centres of each component's bounding box
    return {
        # Feather against the rear wall so its USB-C port lines up with the rear opening
        "feather": (-L / 2 + w + 0.5 + fx / 2, 0.0, floor + fz / 2),
        # LiPo flat on the floor in the front half, clear of the ToF board
        "lipo": (L / 2 - w - 20 - lx / 2, 0.0, floor + lz / 2),
        "tof": (L / 2 - w - P["tof"][2] / 2 - 0.4, 0.0, floor + 9.0 + P["tof"][1] / 2),
        "speaker_y": -W / 2,           # speaker on the right wall (-y; seen from behind)
        "speaker_xz": (-10.0, H / 2 + 2),
        "emitter_axis_z": H / 2 + 6,
        "ring_x": L / 2,               # front face plane
    }


# ---------------------------------------------------------------- parts
def make_body():
    w, L, W, H, r = P["wall"], P["body_l"], P["body_w"], P["body_h"], P["corner_r"]
    lay = layout()
    outer = rounded_box(L, W, H, r)
    cavity = rounded_box(L - 2 * w, W - 2 * w, H, r - w).translate([0, 0, w])
    body = outer - cavity
    # front: wire pass-through to the emitter, ToF window below it
    body -= cyl_x(w + 2, 7.0, L / 2 - w - 1, 0, lay["emitter_axis_z"])
    tw, th = P["tof_window"]
    body -= box((w + 2, tw, th), (L / 2 - w / 2, 0, lay["tof"][2]))
    # rear: USB-C access for charging, aligned with the Feather's connector (on its short
    # edge, which faces the rear wall in this layout)
    ux, uz = P["usb_c"]
    body -= box((w + 2, ux, uz), (-L / 2 + w / 2, 0, w + 1.6 + 2.0))
    # right wall (-y, seen from behind): speaker grille (hex pattern of 3 mm holes)
    sx, sz = lay["speaker_xz"]
    holes = []
    for i in range(-5, 6):
        for j in range(-5, 6):
            hx = sx + i * 5.0 + (2.5 if j % 2 else 0.0)
            hz = sz + j * 4.33
            if (hx - sx) ** 2 + (hz - sz) ** 2 < (P["speaker_d"] / 2 - 4) ** 2:
                holes.append(cyl_y(w + 2, 1.5, hx, -W / 2 - 1, hz))
    body -= M.batch_boolean(holes, mf.OpType.Add)
    # left wall (+y, seen from behind): slide switch slot, 9 x 4.5 mm (ASSUMED for Adafruit 805)
    body -= box((9.0, w + 2, 4.5), (-L / 2 + 30, W / 2 - w / 2, H - 14))
    # floor: wire channel into the handle
    body -= M.cylinder(w + 2, 4.5).translate([HANDLE_X, 0, -1])
    return body


def make_lid():
    w, f, L, W, H, r = P["wall"], P["fit"], P["body_l"], P["body_w"], P["body_h"], P["corner_r"]
    plate = rounded_box(L, W, w, r).translate([0, 0, H])
    lip = rounded_box(L - 2 * w - 2 * f, W - 2 * w - 2 * f, 4.0, r - w).translate([0, 0, H - 4.0])
    lip_hollow = rounded_box(L - 4 * w - 2 * f, W - 4 * w - 2 * f, 4.0, r - 2 * w).translate([0, 0, H - 4.0])
    lid = plate + (lip - lip_hollow)
    # display window (rear) and its module pocket from below
    tx = -L / 2 + 34
    lid -= M.cylinder(w + 2, P["tft_window_d"] / 2).translate([tx, 0, H - 1])
    # canister socket (middle): a hole the tube drops into, Jewel sits below it
    lid -= M.cylinder(w + 2, P["canister_od"] / 2 + f).translate([18, 0, H - 1])
    # dial (encoder) bushing hole, near the display
    lid -= M.cylinder(w + 2, P["encoder_bushing_d"] / 2 + f).translate([tx + 34, 0, H - 1])
    return lid


def make_emitter():
    od, length = P["emitter_od"], P["emitter_len"]
    lay = layout()
    z = lay["emitter_axis_z"]
    x0 = P["body_l"] / 2
    shell = cyl_x(length, od / 2, x0, 0, z)
    # pocket for the ring (open to the front), rebate for the diffuser in front of it
    ring_pocket = cyl_x(P["ring_t"] + 1.0, P["ring_od"] / 2 + P["fit"] + 0.2, x0 + length - P["diffuser_t"] - P["ring_t"] - 1.0 - 3.0, 0, z)
    air_gap = cyl_x(3.0 + 0.01, P["diffuser_d"] / 2 - 2.0, x0 + length - P["diffuser_t"] - 3.0, 0, z)
    rebate = cyl_x(P["diffuser_t"] + 0.01, P["diffuser_d"] / 2 + P["fit"], x0 + length - P["diffuser_t"], 0, z)
    wire = cyl_x(length, 7.0, x0 - 1, 0, z)
    return shell - ring_pocket - air_gap - rebate - wire


def make_diffuser():
    lay = layout()
    x0 = P["body_l"] / 2 + P["emitter_len"] - P["diffuser_t"]
    return cyl_x(P["diffuser_t"], P["diffuser_d"] / 2, x0, 0, lay["emitter_axis_z"])


def make_canister():
    od, length = P["canister_od"], P["canister_len"]
    H, w = P["body_h"], P["wall"]
    x = 18
    tube = M.cylinder(length, od / 2).translate([x, 0, H - w])
    dome = M.sphere(od / 2).translate([x, 0, H - w + length])
    outer = tube + dome
    inner = M.cylinder(length, od / 2 - 1.6).translate([x, 0, H - w - 0.01]) + M.sphere(od / 2 - 1.6).translate([x, 0, H - w + length])
    return outer - inner


def make_handle():
    hx, hy, hz = P["handle"]
    L, w = P["body_l"], P["wall"]
    grip = rounded_box(hx, hy, hz, 8.0)
    bx, by, bz = P["button"]
    # trigger: pocket on the front face of the grip, near the top
    grip -= box((bz + 1.0, bx + 2 * P["fit"], by + 2 * P["fit"]), (hx / 2 - (bz + 1.0) / 2 + 0.01, 0, hz - 22))
    grip -= M.cylinder(hz + 2, 4.0).translate([0, 0, -1])                    # wire channel
    grip -= cyl_x(hx, 2.5, 0, 0, hz - 22)                                    # button leads to channel
    grip = grip.rotate([0, -P["handle_tilt"], 0])
    # sink the tilted grip until its top is 6 mm above the body bottom, then trim it flat at
    # z = 0 so it seats squarely on the body (glue or two M3 screws)
    top = grip.bounding_box()[5]
    grip = grip.translate([HANDLE_X, 0, -top + 6.0]).trim_by_plane([0, 0, -1], 0.0)
    return grip


PARTS = {
    "body": make_body, "lid": make_lid, "emitter": make_emitter, "diffuser": make_diffuser,
    "canister": make_canister, "handle": make_handle,
}


def to_trimesh(man):
    import trimesh
    mesh = man.to_mesh()
    return trimesh.Trimesh(vertices=np.asarray(mesh.vert_properties)[:, :3], faces=np.asarray(mesh.tri_verts), process=True)


def components():
    """Bounding boxes (as solids) of the electronics, in assembled position."""
    lay = layout()
    out = {
        "lipo": box(P["lipo"], lay["lipo"]),
        "feather": box(P["feather"], lay["feather"]),
        "tof": box((P["tof"][2], P["tof"][0], P["tof"][1]), lay["tof"]),
    }
    z = lay["emitter_axis_z"]
    x0 = P["body_l"] / 2 + P["emitter_len"] - P["diffuser_t"] - 3.0 - P["ring_t"] - 0.5
    out["ring16"] = cyl_x(P["ring_t"], P["ring_od"] / 2, x0, 0, z) - cyl_x(P["ring_t"] + 1, P["ring_id"] / 2, x0 - 0.5, 0, z)
    out["jewel"] = M.cylinder(P["jewel_t"], P["jewel_d"] / 2).translate([18, 0, P["body_h"] - P["wall"] - P["jewel_t"] - 0.6])
    tx = -P["body_l"] / 2 + 34
    out["tft"] = box(P["tft"], (tx, 0, P["body_h"] - P["tft"][2] / 2 - 0.1))
    return out


def build(write=True):
    OUT.mkdir(exist_ok=True)
    parts = {name: fn() for name, fn in PARTS.items()}
    report = {}
    for name, man in parts.items():
        report[name] = {"status": str(man.status()), "volume_cm3": man.volume() / 1000.0,
                        "bbox_mm": [round(v, 2) for v in man.bounding_box()], "genus": man.genus()}
        if write:
            to_trimesh(man).export(OUT / f"{name}.stl")
    if write:
        (OUT / "report.json").write_text(json.dumps(report, indent=2))
    return parts, report


def preview(parts, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    colors = {"body": "#5d6b74", "lid": "#7a8892", "emitter": "#5d6b74", "diffuser": "#9df5b8",
              "canister": "#7cf09c", "handle": "#46525a"}
    fig = plt.figure(figsize=(9, 6), facecolor="#fcfcfb")
    ax = fig.add_subplot(111, projection="3d", facecolor="#fcfcfb")
    light = np.array([0.4, -0.5, 0.75]); light /= np.linalg.norm(light)
    for name, man in parts.items():
        tm = to_trimesh(man.simplify(0.15) if hasattr(man, "simplify") else man)
        tris = tm.vertices[tm.faces]
        n = tm.face_normals
        shade = 0.45 + 0.55 * np.clip(n @ light, 0, 1)
        base = np.array(matplotlib.colors.to_rgb(colors[name]))
        fc = np.clip(base[None, :] * shade[:, None], 0, 1)
        alpha = 0.55 if name in ("canister", "diffuser") else 1.0
        coll = Poly3DCollection(tris, facecolors=fc, edgecolors="none", alpha=alpha)
        ax.add_collection3d(coll)
    ax.set_xlim(-110, 130); ax.set_ylim(-120, 120); ax.set_zlim(-110, 130)
    ax.view_init(elev=18, azim=-58)
    ax.set_box_aspect((1, 1, 1))
    ax.set_axis_off()
    ax.set_title("Prop enclosure preview: six printed parts (original design)", color="#0b0b0b", fontsize=10)
    fig.savefig(path, dpi=140, bbox_inches="tight")
    plt.close(fig)


if __name__ == "__main__":
    parts, report = build()
    for k, v in report.items():
        print(f"{k:9s} {v['status']:24s} {v['volume_cm3']:7.1f} cm^3  genus {v['genus']}")
    preview(parts, OUT / "preview.png")
    print("wrote", OUT)
