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
    ("detail__thigh_plate", "Medial thigh plate, Mk II (full-circle hip boss, H4)", "7075-T651 30 mm plate", "5-axis CNC (jogged plate)",
     "12x Ø5.5 cbore Ø9.5x5 on PCD 105 ±0.02; spigot Ø90 H7; 2x Ø6 H7 dowels; 7207 BE seat Ø72 H6", "hard anodise black"),
    ("detail__knee_hub", "Knee hub with integral crank, Mk II (H5)", "7075-T6 billet", "CNC turn-mill",
     "journals Ø35 k5 coaxial 0.01; 12x M6 6H on PCD 90; 2x Ø6 H7; crank pin Ø12 H7 at r 73.7", "hard anodise, journals masked"),
    ("detail__hip_roll_flange", "KA-110P hip-roll output flange (Mk II)", "7075-T6", "CNC lathe + mill",
     "12x M5 6H (HeliCoil) on PCD 100 ±0.02; 2x Ø5 H7 dowels; faces flat 0.01", "hard anodise black"),
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
    ("ka130k__front_housing", "KA-130K Mk II front housing", "7075-T6", "CNC lathe + mill", "THK RB9016 seat Ø130 H7 x 16; ring-gear spigot Ø81 H7/js6", "hard anodise (mask seats)"),
    ("ka130k__motor_housing_finned", "KA-130K Mk II jacket core (legacy file name)", "7075-T6", "CNC lathe",
     "stator bore shrink fit; helical channel 6 x 3; O-ring grooves", "hard anodise black"),
    ("ka130k__coolant_jacket_sleeve", "KA-130K Mk II coolant jacket sleeve", "6061-T6", "CNC lathe", "bore H7 over O-rings; 2 radial ports; leak test 2 bar", "clear anodise"),
    ("ka130k__rotor_hub", "KA-130K rotor hub", "7075-T6", "CNC lathe", "bearing seats j5; magnet-ring seat g6", "clear anodise"),
    ("ka130k__s2_ring_gear_z54_m1.25", "Stage-2 ring gear blank z54 m1.25", "18CrNiMo7-6", "turn, shape/wire-EDM teeth, carburise, grind", "ISO 1328 grade 6", "case 0.6-0.8 mm, 58-62 HRC"),
    ("ka130k__s2_carrier_output", "KA-130K stage-2 carrier / output", "17-4PH H1025", "CNC", "RB9016 inner seat Ø90 h5; planet pin bores H6 on PCD 45 ±0.01", "passivate"),
    ("kh25__front_housing", "KH-C25 front housing (pin ring + RB5013 seat)", "7075-T6", "CNC lathe + mill", "pin-ring spigot Ø104 H7; RB5013 seat Ø80 H7", "hard anodise (mask seats)"),
    ("kh25__output_front_disc", "KH-C25 output front disc", "17-4PH H1025", "CNC", "RB5013 seat Ø50 h5; 8x M4 to the Ø8 output pins on PCD 52 ±0.01", "passivate"),
    ("torso__battery_hatch_A", "Battery hatch A (B mirrored), rear service door", "PA12 (HP MJF)", "MJF + bead blast", "gasket land flat 0.3", "primer + satin warm white"),
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
