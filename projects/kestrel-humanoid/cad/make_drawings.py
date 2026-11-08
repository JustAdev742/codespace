#!/usr/bin/env python3
"""2-D drawing sheets (SVG) for key machined parts: projected view with hidden lines + title block.

Dimensions for manufacture come from the STEP models (cad/out/step) and the tolerance/fit
tables in docs/09-manufacturing-package.md; these sheets are the visual reference.
"""
from pathlib import Path

import cadquery as cq

HERE = Path(__file__).resolve().parent
STEP = HERE / "out" / "step"
OUT = HERE / "out" / "drawings"
OUT.mkdir(parents=True, exist_ok=True)

SHEETS = [
    ("detail__ankle_cross", "Ankle cross (detailed)", "Ti-6Al-4V bar (AMS 4928)", "5-axis CNC", "pin bores Ø12 H7, needle seats Ø18 N6, bores perpendicular & intersecting within 0.01", "bead blast"),
    ("detail__foot_plate", "Foot plate (detailed)", "7075-T651 12 mm plate", "3-axis CNC, 2 setups", "load-cell pockets flat 0.02, M6/M4 per ISO 965 6H", "hard anodise black (mask pockets)"),
    ("detail__thigh_plate", "Thigh side plate (detailed)", "7075-T651 8 mm plate", "CNC", "hub bore Ø40 H7; PCD holes ±0.02 true position", "hard anodise black"),
    ("detail__knee_hub", "Knee hub (detailed)", "7075-T6 + 17-4PH bushing", "CNC lathe", "bearing seats Ø42 H6, coaxial 0.01; M5 6H", "hard anodise, seats masked"),
    ("pelvis__pelvis_bowl", "Pelvis bowl", "7075-T651 plate/billet", "5-axis CNC", "ISO 2768-mK; bearing seats H6", "hard anodise black, 25 µm"),
    ("l_hip__yaw_roll_yoke", "Hip yaw-roll yoke (L; R mirrored)", "7075-T6", "3-axis CNC, 2 setups", "ISO 2768-mK; bores H7", "hard anodise black"),
    ("l_hip__roll_pitch_bracket", "Hip roll-pitch bracket", "7075-T6", "3-axis CNC", "ISO 2768-mK; dowel holes H7", "hard anodise black"),
    ("l_thigh__thigh_plate_lateral", "Thigh plate (lateral)", "7075-T6 8 mm plate", "CNC / waterjet + finish", "ISO 2768-mK; flatness 0.1", "hard anodise"),
    ("l_thigh__knee_pushrod", "Knee push-rod", "Ti-6Al-4V tube 16 x 2", "turn + thread M12 ends", "length ±0.05; threads 6g", "bead blast"),
    ("l_shank__knee_hub", "Knee hub", "7075-T6 + 17-4PH bushing", "CNC lathe", "bearing seats k5/H6; runout 0.01", "hard anodise (mask seats)"),
    ("l_shank__shank_upper_fitting", "Shank upper fitting", "7075-T6", "5-axis CNC", "ISO 2768-mK; tube bore +0.10/+0.15 (bond gap)", "hard anodise"),
    ("l_foot__ankle_cross", "Ankle cross", "Ti-6Al-4V bar", "5-axis CNC", "pin bores H7, perpendicularity 0.01", "as machined"),
    ("l_foot__foot_plate", "Foot plate", "7075-T6", "CNC (ribbed underside)", "ISO 2768-mK; load-cell pads flat 0.02", "hard anodise"),
    ("torso__spine_plate", "Spine plate", "7075-T6", "CNC", "ISO 2768-mK", "hard anodise"),
    ("ka130k__front_housing", "KA-130K front housing", "7075-T6", "CNC lathe + mill", "crossed-roller seat H6; ring-gear spigot H7/js6", "hard anodise (mask seats)"),
    ("ka130k__motor_housing_finned", "KA-130K motor housing (finned)", "7075-T6", "CNC lathe", "stator bore +0.02/+0.05 (potting)", "hard anodise black"),
    ("ka130k__rotor_hub", "KA-130K rotor hub", "7075-T6", "CNC lathe", "bearing seats j5; magnet-ring seat g6", "clear anodise"),
    ("ka130k__s2_ring_gear_z54_m1.25", "Stage-2 ring gear blank z54 m1.25", "18CrNiMo7-6", "turn, shape/wire-EDM teeth, carburise, grind", "ISO 1328 grade 6", "case 0.6-0.8 mm, 58-62 HRC"),
    ("ka130k__s2_carrier_output", "KA-130K stage-2 carrier / output", "17-4PH H1025", "CNC", "planet pin bores H6 on PCD ±0.01", "passivate"),
]


def sheet(stem, title, mat, proc, tol, finish):
    shp = cq.importers.importStep(str(STEP / f"{stem}.step"))
    f = OUT / f"{stem}.svg"
    cq.exporters.export(shp, str(f), opt={"width": 900, "height": 620, "marginLeft": 60, "marginTop": 60,
                                          "showAxes": False, "projectionDir": (1.0, -0.8, 0.6), "strokeWidth": 0.4,
                                          "strokeColor": (30, 35, 40), "hiddenColor": (150, 160, 170), "showHidden": True})
    svg = f.read_text()
    bb = shp.val().BoundingBox()
    block = (f"<g font-family='Helvetica, Arial, sans-serif' font-size='13' fill='#1f2328'>"
             f"<rect x='5' y='640' width='990' height='120' fill='#fff' stroke='#1f2328'/>"
             f"<text x='18' y='665' font-size='17' font-weight='700'>KESTREL K1 — {title}</text>"
             f"<text x='18' y='688'>File: cad/out/step/{stem}.step   ·   Envelope {bb.xlen:.1f} × {bb.ylen:.1f} × {bb.zlen:.1f} mm</text>"
             f"<text x='18' y='710'>Material: {mat}   ·   Process: {proc}</text>"
             f"<text x='18' y='732'>Tolerances: {tol}   ·   Finish: {finish}</text>"
             f"<text x='18' y='752' fill='#59636e'>Dimension from the STEP model; general tolerances per docs/09 §2. Break sharp edges 0.2–0.5 mm. Projection: isometric, hidden lines grey.</text>"
             f"</g>")
    svg = svg.replace("</svg>", block + "</svg>")
    import re
    svg = re.sub(r'height="[0-9.]+"', 'height="770"', svg, count=1)
    svg = re.sub(r'width="[0-9.]+"', 'width="1000"', svg, count=1)
    f.write_text(svg)


if __name__ == "__main__":
    for s in SHEETS:
        try:
            sheet(*s)
            print("drawing", s[0])
        except Exception as e:
            print("skip", s[0], e)
