"""Fully detailed manufacturing models of the primary load-path parts (mm, part frames).

These replace envelope models in the assembly and are exported to cad/out/step/detail__*.step.
Hole sizes: tapped holes modelled at tap-drill diameter; dowel/bearing bores at nominal.
"""
import cadquery as cq


def ankle_cross():
    """Ti-6Al-4V cross: pitch pin bore along Y, roll pin bore along X (Ø12 H7), needle-roller
    counterbores Ø18 x 12 deep (HK1212 class) at each end, push-rod lever lugs are on the foot."""
    body = cq.Workplane("XY").box(48, 48, 36).edges("|Z").fillet(6).edges("#Z").fillet(2)
    body = body.cut(cq.Workplane("XZ").circle(6.0).extrude(30, both=True))          # pitch pin Ø12 along Y
    body = body.cut(cq.Workplane("YZ").circle(6.0).extrude(30, both=True))          # roll pin Ø12 along X
    for sgn in (1, -1):
        body = body.cut(cq.Workplane("XZ").workplane(offset=sgn * 24 - (12 if sgn > 0 else 0)).circle(9.0).extrude(12))
        body = body.cut(cq.Workplane("YZ").workplane(offset=sgn * 24 - (12 if sgn > 0 else 0)).circle(9.0).extrude(12))
    # lightening pockets on top/bottom
    for z in (18, -18):
        body = body.cut(cq.Workplane("XY").workplane(offset=z - (4 if z > 0 else -4) * 0).rect(18, 18).extrude(-6 if z > 0 else 6))
    return body


def foot_plate():
    """7075 foot plate 250 x 104, 10 mm base + ribs; 4 load-cell pockets Ø22 x 6; ankle clevis
    bolt pattern 4x M6; push-rod lever pads with M8 holes; sole fixing 12x M4."""
    p = cq.Workplane("XY").box(250, 104, 10).edges("|Z").fillet(18)
    # underside ribs (grid) -> modelled as pockets between ribs from the top face
    for x in (-80, -30, 20, 70):
        for y in (-25, 25):
            p = p.cut(cq.Workplane("XY").workplane(offset=1.5).center(x, y).rect(38, 34).extrude(4).edges("|Z").fillet(4))
    # load cell pockets (heel L/R, toe L/R)
    for x, y in ((-95, 32), (-95, -32), (95, 32), (95, -32)):
        p = p.cut(cq.Workplane("XY").workplane(offset=-5).center(x, y).circle(11).extrude(6))
        p = p.cut(cq.Workplane("XY").workplane(offset=-5).center(x, y).circle(2.1).extrude(10))
    # ankle clevis mount (4x M6 tap-drill Ø5.0) around the ankle axis at x = -58 (heel at x=-125)
    for dx, dy in ((-20, -22), (-20, 22), (20, -22), (20, 22)):
        p = p.cut(cq.Workplane("XY").center(-58 + dx, dy).circle(2.5).extrude(20, both=True))
    # sole fixing holes M4 (tap Ø3.3)
    for x in (-110, -55, 0, 55, 110):
        for y in (-44, 44):
            p = p.cut(cq.Workplane("XY").center(x, y).circle(1.65).extrude(20, both=True))
    return p


def thigh_plate():
    """Mk II medial thigh plate, 7075-T651 (28 mm billet), machined. Local frame: hip axis at the origin,
    x forward, z up, y = left-leg world y (plate faces y 30/37 at the knee, 51/58 at the hip).

    Hold H4 fix: a FULL-CIRCLE hip boss (Ø128 x 10, y 51..61) carries all 12 holes of the KA-130H output
    flange: 12x Ø5.5 on PCD 105 counterbored Ø9.5 x 5 from the medial face (12.9 SHCS, HeliCoils in the
    actuator flange), 2x Ø6 H7 dowels at 180 deg, Ø90 H7 x 3 spigot recess, Ø20 cable bore. Slip capacity
    935 N m at mu 0.15 (docs/09 §4) vs 364 N m hip-pitch momentary / 406 N m actuator peak.
    The plate jogs 21 mm medially below the hip (block y 30..58, z -87..-67) so the boss stays 2.5 mm clear
    of the KA-90P waist-yaw housing while the lower plate (y 30..37) passes outside the KA-130K (y 37..140).
    Knee boss Ø90 x 17 (y 30..47) with the Ø72 H6 seat of the 7207 BE bearing (hold H5b); KA-130K rear-face
    mount 8x Ø6.6 on PCD 100 + Ø40 spigot bore at z -160; one 3 mm lightening pocket."""
    import math
    lower = cq.Workplane("XY").box(60, 7, 333).translate((0, 33.5, -420 + 333 / 2)).edges("|Y").fillet(8)
    knee = cq.Workplane("XZ").circle(45).extrude(-17).translate((0, 30, -420))
    block = cq.Workplane("XY").box(60, 28, 20).translate((0, 44, -77)).edges("|Y").fillet(5)
    upper = cq.Workplane("XY").box(60, 7, 70).translate((0, 54.5, -32)).edges("|Y").fillet(6)
    boss = cq.Workplane("XZ").circle(64).extrude(-10).translate((0, 51, 0))
    p = lower.union(knee).union(block).union(upper).union(boss)
    yz = lambda y0, dy, x, z, r: cq.Workplane("XZ").center(x, z).circle(r).extrude(-dy).translate((0, y0, 0))
    for k in range(12):
        a = 2 * math.pi * k / 12 + math.pi / 12
        x, z = 52.5 * math.cos(a), 52.5 * math.sin(a)
        p = p.cut(yz(40, 30, x, z, 2.75)).cut(yz(50, 6, x, z, 4.75))
    for a in (0.0, math.pi):
        p = p.cut(yz(40, 30, 52.5 * math.cos(a), 52.5 * math.sin(a), 3.0))
    p = p.cut(yz(58, 4, 0, 0, 45.0)).cut(yz(40, 30, 0, 0, 10.0))
    p = p.cut(yz(25, 30, 0, -420, 36.0))                                  # 7207 BE seat Ø72 H6 (through, shoulder in the hub)
    for k in range(8):
        a = 2 * math.pi * k / 8
        p = p.cut(yz(25, 20, 50 * math.cos(a), -160 + 50 * math.sin(a), 3.3))
    p = p.cut(yz(25, 20, 0, -160, 20.0))
    p = p.cut(cq.Workplane("XY").box(36, 4, 90).translate((0, 31.0, -300)).edges("|Y").fillet(6))
    return p


def knee_hub():
    """Mk II knee hub, 7075-T6 one piece with the shank crank (hold H5a: the crank-hub joint is gone).
    Local frame: knee axis = y through the origin (hub centre y 88.5 in the robot), x forward, z up.
      * journals Ø35 k5 at both ends (y +-41.5..+-58.5) for a 7207 BE angular-contact pair in O arrangement,
        seated in the thigh-plate bosses (Ø72 H6): C0 20.8 kN each vs <= 11.9 kN on the lateral bearing in the
        X case (push-rod 8.8 kN at 20 mm overhang + GRF 2.8 kN), s0 1.75 (hold H5b);
      * central flange Ø104 x 10: 12x M6 12.9 on PCD 90 (tapped, tap drill Ø5.0) + 2x Ø6 H7 dowels to the
        shank upper fitting: 12 x 14 kN x 0.15 x 45 mm = 1,130 N m slip vs 535 N m knee momentary (SF 2.1);
      * integral crank (y 58.5..63.5): r2 73.7 mm at 229.4 deg (data/knee_fourbar.json), Ø12 H7 rod-end pin bore;
      * Ø52 central tube (wall 18 mm round the Ø16 cable bore): torsion 535 N m -> 21 MPa."""
    import json
    import math
    from pathlib import Path
    kf = json.loads((Path(__file__).resolve().parent.parent / "data" / "knee_fourbar.json").read_text())
    r2, beta = kf["r2"] * 1e3, math.radians(kf["beta_deg"])
    yz = lambda y0, y1, r, x=0.0, z=0.0: cq.Workplane("XZ").center(x, z).circle(r).extrude(-(y1 - y0)).translate((0, y0, 0))
    hub = yz(-41.5, 41.5, 26).union(yz(-58.5, -41.5, 17.5)).union(yz(41.5, 58.5, 17.5)).union(yz(-5, 5, 52))
    px, pz = r2 * math.cos(beta), r2 * math.sin(beta)
    arm = cq.Workplane("XZ").polyline([(0, 13), (px * 0.98 + 10 * math.sin(beta), pz * 0.98 - 10 * math.cos(beta)),
                                       (px * 0.98 - 10 * math.sin(beta), pz * 0.98 + 10 * math.cos(beta)), (0, -13)]).close().extrude(-5).translate((0, 58.5, 0))
    crank = yz(58.5, 63.5, 20).union(arm).union(yz(58.5, 63.5, 12, px, pz))
    hub = hub.union(crank)
    hub = hub.cut(yz(-70, 70, 8))
    hub = hub.cut(yz(55, 70, 6, px, pz))
    for k in range(12):
        a = 2 * math.pi * k / 12 + math.pi / 12
        hub = hub.cut(yz(-6, 6, 2.5, 45 * math.cos(a), 45 * math.sin(a)))
    for a in (0.0, math.pi):
        hub = hub.cut(yz(-6, 6, 3.0, 45 * math.cos(a), 45 * math.sin(a)))
    return hub


def hip_roll_flange():
    """Mk II KA-110P hip-roll output flange, 7075-T6: Ø114 x 8, 12x M5 clearance Ø5.5 on PCD 100
    tapped (tap drill Ø4.2; 12.9 SHCS from the roll-pitch bracket side, slip torque 379 N m at mu 0.15 = the
    overload fuse, docs/generated/structure_checks.md), 2x Ø5 H7 dowel holes on PCD 100, Ø40 cable bore,
    4 lightening pockets on the actuator side. Part frame: thickness along +Z (bracket face at +Z)."""
    import math
    f = cq.Workplane("XY").circle(57).extrude(8).edges(">Z or <Z").chamfer(0.8)
    f = f.cut(cq.Workplane("XY").circle(20).extrude(20, both=True))
    for k in range(12):
        a = 2 * math.pi * k / 12 + math.pi / 12
        f = f.cut(cq.Workplane("XY").center(50 * math.cos(a), 50 * math.sin(a)).circle(2.1).extrude(20, both=True))
    for a in (0.0, math.pi):
        f = f.cut(cq.Workplane("XY").center(50 * math.cos(a), 50 * math.sin(a)).circle(2.5).extrude(20, both=True))
    for k in range(4):
        a = 2 * math.pi * k / 4 + math.pi / 4
        f = f.cut(cq.Workplane("XY").workplane(offset=-1).center(33 * math.cos(a), 33 * math.sin(a)).circle(8).extrude(5))
    return f


PARTS = {"ankle_cross": ankle_cross, "foot_plate": foot_plate, "thigh_plate": thigh_plate, "knee_hub": knee_hub, "hip_roll_flange": hip_roll_flange}

if __name__ == "__main__":
    from pathlib import Path
    out = Path(__file__).resolve().parent / "out" / "step"
    for n, f in PARTS.items():
        s = f()
        cq.exporters.export(s, str(out / f"detail__{n}.step"))
        cq.exporters.export(s, str(out.parent / "stl" / f"detail__{n}.stl"), tolerance=0.1, angularTolerance=0.2)
        print(n, round(s.val().Volume() / 1000, 1), "cm3", s.val().isValid())
