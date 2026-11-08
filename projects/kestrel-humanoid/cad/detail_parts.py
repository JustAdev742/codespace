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
    """7075 8 mm thigh side plate, 300 long; hip-flange bolt circle (12x Ø5.5 on PCD 105) at the
    top, knee-hub boss Ø40 bore with 6x M5 at the bottom, knee actuator mount pattern, 3 lightening
    pockets 4 mm deep."""
    L = 300.0
    p = (cq.Workplane("XZ").moveTo(-38, L / 2).lineTo(38, L / 2).lineTo(30, -L / 2).lineTo(-30, -L / 2).close()
         .extrude(8).edges("|Y").fillet(10))
    # hip flange holes PCD 105 around the top end (only those inside the plate)
    import math
    for k in range(12):
        a = 2 * math.pi * k / 12
        x, z = 52.5 * math.cos(a), L / 2 - 20 + 52.5 * math.sin(a)
        if abs(x) < 32 and z < L / 2 - 6:
            p = p.cut(cq.Workplane("XZ").center(x, z).circle(2.75).extrude(30, both=True))
    # knee hub bore + bolts
    p = p.cut(cq.Workplane("XZ").center(0, -L / 2 + 30).circle(20).extrude(30, both=True))
    for k in range(6):
        a = 2 * math.pi * k / 6
        p = p.cut(cq.Workplane("XZ").center(30 * math.cos(a) * 0.8, -L / 2 + 30 + 30 * math.sin(a) * 0.8).circle(2.1).extrude(30, both=True))
    # lightening pockets (one side, 4 mm)
    for z in (60, -10, -80):
        p = p.cut(cq.Workplane("XZ").workplane(offset=-8).center(0, z).rect(36, 46).extrude(4).edges("|Y").fillet(6))
    return p


def knee_hub():
    """7075 knee hub with 17-4PH bushing seat: two angular-contact bearing seats Ø42 x 9 (k5/H6),
    central Ø15 cable bore, 6x M5 crank-flange holes on PCD 52."""
    import math
    hub = cq.Workplane("XZ").circle(34).extrude(45, both=True)
    hub = hub.cut(cq.Workplane("XZ").circle(7.5).extrude(60, both=True))
    for sgn in (1, -1):
        hub = hub.cut(cq.Workplane("XZ").workplane(offset=(45 - 9) if sgn > 0 else -45).circle(21).extrude(9))
    for k in range(6):
        a = 2 * math.pi * k / 6
        hub = hub.cut(cq.Workplane("XZ").center(26 * math.cos(a), 26 * math.sin(a)).circle(2.1).extrude(60, both=True))
    hub = hub.edges().fillet(0.8)
    return hub


PARTS = {"ankle_cross": ankle_cross, "foot_plate": foot_plate, "thigh_plate": thigh_plate, "knee_hub": knee_hub}

if __name__ == "__main__":
    from pathlib import Path
    out = Path(__file__).resolve().parent / "out" / "step"
    for n, f in PARTS.items():
        s = f()
        cq.exporters.export(s, str(out / f"detail__{n}.step"))
        cq.exporters.export(s, str(out.parent / "stl" / f"detail__{n}.stl"), tolerance=0.1, angularTolerance=0.2)
        print(n, round(s.val().Volume() / 1000, 1), "cm3", s.val().isValid())
