"""Inline SVG figures for the visual S1-Fast build guide (make_guide.py).

Every figure is drawn from the design data where one exists: frame dimensions from calc/kestrel/params.py, sprocket
sizes from the actuator selection, cell counts from the parts list. Colours come from page CSS classes, so the
drawings follow the page's light and dark themes:

    .hub   hub motors (amber)        .drill  drill gearmotors (teal)
    .wood  12 mm plywood             .alu    aluminium angle / tube
    .chain bike chain                .dim    dimension lines
"""
from __future__ import annotations

import math

P = 12.7          # bike chain pitch, mm


def pr(n):
    """Pitch radius of an n-tooth bike sprocket, mm."""
    return P / (2 * math.sin(math.pi / n))


def defs(uid):
    return (f'<defs><marker id="ar-{uid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
            f'orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>')


def svg(uid, w, h, body, label, cls="fig"):
    return (f'<svg class="sv {cls}" viewBox="0 0 {w} {h}" role="img" aria-label="{label}" '
            f'xmlns="http://www.w3.org/2000/svg">{defs(uid)}{body}</svg>')


def t(x, y, s, cls="", anchor="start", size=None):
    st = f' style="font-size:{size}px"' if size else ""
    return f'<text x="{x:.1f}" y="{y:.1f}" class="{cls}" text-anchor="{anchor}"{st}>{s}</text>'


def rect(x, y, w, h, cls, rx=0):
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" class="{cls}"/>'


def circ(x, y, r, cls):
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" class="{cls}"/>'


def line(x1, y1, x2, y2, cls="ln", arrow=None, uid=""):
    m = ""
    if arrow == "end":
        m = f' marker-end="url(#ar-{uid})"'
    elif arrow == "both":
        m = f' marker-start="url(#ar-{uid})" marker-end="url(#ar-{uid})"'
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" class="{cls}"{m}/>'


def path(d, cls="ln", arrow=None, uid=""):
    m = f' marker-end="url(#ar-{uid})"' if arrow else ""
    return f'<path d="{d}" class="{cls}"{m}/>'


def sprocket(x, y, n, label=True, cls="spk", lpos="below"):
    r = pr(n)
    teeth = f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r + 3:.1f}" class="teeth" style="stroke-dasharray:{2 * math.pi * (r + 3) / n / 2:.2f}"/>'
    out = teeth + circ(x, y, r, cls) + circ(x, y, 3, "axle")
    if label:
        ly = y + r + 18 if lpos == "below" else y - r - 9
        out += t(x, ly, f"{n}T", "lbl", "middle")
    return out


def tangents(c1, r1, c2, r2):
    """The two outer tangent segments of two circles (a chain around two sprockets)."""
    (x1, y1), (x2, y2) = c1, c2
    d = math.hypot(x2 - x1, y2 - y1)
    th = math.atan2(y2 - y1, x2 - x1)
    ph = math.acos((r1 - r2) / d)
    segs = []
    for s in (1, -1):
        a = th + s * ph
        segs.append((x1 + r1 * math.cos(a), y1 + r1 * math.sin(a), x2 + r2 * math.cos(a), y2 + r2 * math.sin(a)))
    return segs


def chain(c1, n1, c2, n2, k=1):
    out = ""
    for (ax, ay, bx, by) in tangents(c1, pr(n1) + 2, c2, pr(n2) + 2):
        out += line(ax, ay, bx, by, "chain" + (" chain3" if k == 3 else ""))
    return out


# ------------------------------------------------------------------------------------------------ 1. robot map
def robot_map(D):
    """Front and side views of S1-Fast at true proportions, with every drive coloured by type. Numbered pins (with
    leader lines) carry data-j for the page's spec panel."""
    s = 0.44                                  # px per mm
    W, H = 780, 880
    fy = 836                                  # floor
    fx0, sx0 = 190, 560                       # front-view centre line, side-view hip axis

    def F(X, Z):
        return fx0 + X * s, fy - Z * s

    def S(x, Z):
        return sx0 + x * s, fy - Z * s

    hip = (D["ankle_h"] + D["shank"] + D["thigh"]) * 1000
    knee = (D["ankle_h"] + D["shank"]) * 1000
    ank = D["ankle_h"] * 1000
    hw = D["hip_half_width"] * 1000
    waist = hip + (D["waist_yaw_above"] + D["waist_pitch_above"]) * 1000
    sh = waist + D["shoulder_z"] * 1000
    shw = D["shoulder_half_width"] * 1000
    neck = waist + D["neck_yaw_z"] * 1000
    top = neck + (D["neck_pitch_above"] + D["head_top_above_neck_pitch"]) * 1000
    ua, fa = D["upper_arm"] * 1000, D["forearm"] * 1000
    flen, fw, heel = D["foot_len"] * 1000, D["foot_w"] * 1000, D["heel"] * 1000
    HR = 70                                   # hub motor radius once the tyre is off, mm (measure yours)

    b = [line(16, fy, W - 60, fy, "ground"), t(fx0, fy + 30, "FRONT", "cap", "middle"),
         t(sx0, fy + 30, "SIDE, facing right", "cap", "middle")]

    def frect(X0, Z0, X1, Z1, cls, rx=0):
        x0, y1 = F(X0, Z0)
        x1, y0 = F(X1, Z1)
        return rect(min(x0, x1), min(y0, y1), abs(x1 - x0), abs(y1 - y0), cls, rx)

    def srect(x0, Z0, x1, Z1, cls, rx=0):
        a0, c1 = S(x0, Z0)
        a1, c0 = S(x1, Z1)
        return rect(min(a0, a1), min(c0, c1), abs(a1 - a0), abs(c1 - c0), cls, rx)

    # ---------- front view
    b.append(frect(-150, waist, 150, sh + 20, "wood"))                                  # torso
    b.append(frect(-80, waist + 30, 80, waist + 170, "batt", 4))                        # battery
    b.append(frect(-15, sh + 20, 15, neck + 70, "alu"))                                 # neck
    b.append(frect(-70, top - 140, 70, top, "wood", 8))                                 # head
    for sg in (1, -1):
        X = sg * hw
        for off in (-27, 27):                                                           # hip-yaw drills
            b.append(frect(X + off - 24, hip + 20, X + off + 24, hip + 200, "drill", 10))
    b.append(frect(-150, hip - 10, 150, hip + 95, "alu"))                               # pelvis
    for sg in (1, -1):
        X = sg * hw
        b.append(frect(X - fw / 2, 0, X + fw / 2, 22, "wood"))                         # foot
        b.append(frect(X - 20, ank, X + 20, knee, "alu"))                               # shank
        b.append(frect(X - 20, knee, X + 20, hip, "alu"))                               # thigh
        for Zc in (knee - 160, knee - 320):                                             # ankle pair, behind the calf
            b.append(frect(X - 30, Zc - HR, X + 30, Zc + HR, "hub ghost", 6))
        for Zc in (hip - 110, hip - 270):                                               # knee pair, outside the thigh
            b.append(frect(sg * (hw + 26), Zc - HR, sg * (hw + 86), Zc + HR, "hub", 6))
        for off in (26, 92):                                                            # hip-pitch pair, outboard
            b.append(frect(sg * (hw + off), hip + 60 - HR, sg * (hw + off + 60), hip + 60 + HR, "hub", 6))
        for Z in (ank, knee, hip):
            b.append(circ(*F(X, Z), 5, "joint"))
        b.append(frect(sg * shw - 15, sh - ua, sg * shw + 15, sh, "alu"))               # arm
        b.append(frect(sg * shw - 12, sh - ua - fa, sg * shw + 12, sh - ua, "alu"))
        b.append(frect(sg * shw - 20, sh - 120, sg * shw + 20, sh + 60, "drill", 10))   # shoulder drill
        b.append(frect(sg * shw - 20, sh - ua + 10, sg * shw + 20, sh - ua + 190, "drill", 10))  # elbow drill

    # ---------- side view
    b.append(srect(-90, waist, 90, sh + 20, "wood"))                                    # torso
    b.append(srect(-150, waist + 30, -70, waist + 170, "batt", 4))                      # battery, low at the back
    b.append(srect(-15, sh + 20, 15, neck + 70, "alu"))
    b.append(srect(-60, top - 140, 80, top, "wood", 8))
    b.append(srect(-24, hip + 20, 24, hip + 200, "drill", 10))                          # hip-yaw drills
    b.append(srect(-110, hip - 10, 100, hip + 95, "alu"))                               # pelvis
    b.append(srect(-190, hip - 24, -10, hip + 24, "drill", 10))                         # hip-roll drills, behind
    b.append(srect(-heel, 0, flen - heel, 22, "wood"))
    b.append(srect(-20, ank, 20, knee, "alu"))
    b.append(srect(-20, knee, 20, hip, "alu"))
    b.append(srect(-15, sh - ua, 15, sh, "alu"))                                        # arm
    b.append(srect(-12, sh - ua - fa, 12, sh - ua, "alu"))
    b.append(srect(-60, sh - 20, 60, sh + 20, "drill", 10))                             # shoulder drill
    cx, cy = S(-90, hip + 60)
    b.append(circ(cx + 7, cy - 7, HR * s, "hub ghost"))
    b.append(circ(cx, cy, HR * s, "hub"))
    for Zc in (hip - 110, hip - 270):
        b.append(circ(*S(0, Zc), HR * s, "hub"))
    for Zc in (knee - 160, knee - 320):
        b.append(circ(*S(-100, Zc), HR * s, "hub"))
    b.append(line(*S(-90, hip + 60), *S(0, hip), "chain"))
    b.append(path(f"M{S(0, hip - 110)[0]:.1f} {S(0, hip - 110)[1]:.1f} L{S(30, hip - 190)[0]:.1f} {S(30, hip - 190)[1]:.1f} "
                  f"L{S(0, knee)[0]:.1f} {S(0, knee)[1]:.1f}", "chain"))
    b.append(line(*S(-100, knee - 160), *S(-52, knee - 245), "chain"))
    b.append(line(*S(-52, knee - 245), *S(-52, ank), "rod"))
    b.append(line(*S(-52, ank), *S(0, ank), "rod"))
    for Z in (ank, knee, hip):
        b.append(circ(*S(0, Z), 5, "joint"))

    # ---------- pins with leader lines: (key, number, part point, pin point)
    pins = [("hip_yaw", 1, S(20, hip + 150), S(190, hip + 230)),
            ("hip_roll", 2, S(-150, hip), S(-300, hip - 40)),
            ("hip_pitch", 3, S(-110, hip + 80), S(-300, hip + 150)),
            ("knee", 4, S(40, hip - 110), S(190, hip - 110)),
            ("ankle", 5, S(-130, knee - 200), S(-300, knee - 200)),
            ("shoulder_pitch", 6, S(55, sh), S(190, sh + 60)),
            ("elbow", 7, F(shw + 20, sh - ua + 100), F(shw + 160, sh - ua + 100)),
            ("battery", 8, S(-150, waist + 100), S(-300, waist + 100))]
    for key, n, (px, py), (qx, qy) in pins:
        b.append(line(px, py, qx, qy, "leader"))
        b.append(circ(px, py, 3, "leader-dot"))
        b.append(f'<g class="pin" data-j="{key}" tabindex="0" role="button" aria-label="{key.replace("_", " ")}">'
                 f'<circle cx="{qx:.1f}" cy="{qy:.1f}" r="16" class="pin-c"/>{t(qx, qy + 5.5, str(n), "pin-t", "middle")}</g>')

    x0 = W - 30
    b.append(line(x0, fy, x0, F(0, top)[1], "dim", "both", "map"))
    b.append(t(x0 - 8, (fy + F(0, top)[1]) / 2, f"{top / 1000:.2f} m", "lbl", "end"))

    lg = [("hub", "hub motor (12)"), ("drill", "drill gearmotor (12)"), ("alu", "aluminium"), ("wood", "plywood"),
          ("batt", "48 V battery")]
    for i, (c, s_) in enumerate(lg):
        y = 24 + i * 24
        b.append(rect(16, y - 12, 18, 14, c, 3))
        b.append(t(42, y, s_, "lbl"))
    return svg("map", W, H, "".join(b), "S1-Fast front and side views showing where the 12 hub motors and 12 drill "
                                         "gearmotors go", "fig map")


# ------------------------------------------------------------------------------------------------ 2. drive to scale
def drive(js_in, n_motor, n_js_big, n_js_small, n_joint, last_chains, name, ratio, joint_label, motors=2):
    """One hub-motor drive at 1 px per mm: motor sprocket -> jackshaft -> joint, chains on outer tangents."""
    m = (90, 120)
    j = (m[0] + 150, 120)
    k = (j[0] + 40, 120 + 190)
    W = int(k[0] + pr(n_joint) + 150)
    H = 120 + 190 + int(pr(n_joint)) + 60
    b = [circ(*m, 70, "hub ghost"), t(m[0], m[1] - 78, "hub motor" + (f" ×{motors}" if motors > 1 else ""), "lbl", "middle")]
    b.append(chain(m, n_motor, j, n_js_big))
    b.append(chain(j, n_js_small, k, n_joint, last_chains))
    b.append(sprocket(*m, n_motor, lpos="below"))
    b.append(sprocket(*j, n_js_big, label=False))
    b.append(sprocket(*j, n_js_small, label=False, cls="spk2"))
    b.append(t(j[0], j[1] - pr(n_js_big) - 10, f"{n_js_big}T + {n_js_small}T", "lbl", "middle"))
    b.append(t(j[0] + pr(n_js_big) + 8, j[1] + 4, "jackshaft", "lbl muted"))
    b.append(sprocket(*k, n_joint, lpos="below"))
    b.append(t(k[0] + pr(n_joint) + 10, k[1] - 6, joint_label, "lbl"))
    if last_chains > 1:
        b.append(t(k[0] + pr(n_joint) + 10, k[1] + 12, f"{last_chains} chains side by side", "lbl muted"))
    s1, s2 = n_js_big / n_motor, n_joint / n_js_small
    b.append(t(16, H - 16, f"{n_js_big}/{n_motor} × {n_joint}/{n_js_small} = {s1:.2f} × {s2:.2f} = {ratio}:1", "eq"))
    return svg(name, W, H, "".join(b), f"{joint_label}: {n_motor}T to {n_js_big}T, then {n_js_small}T to {n_joint}T, "
                                       f"{ratio} to 1, drawn to scale", "fig drive")


def drives_all(specs):
    """The three hub-motor drives side by side, all at the same scale (0.75 px per mm)."""
    k = 0.75
    cw, W, H = 250, 750, 430

    def R(n):
        return pr(n) * k

    b = []
    for i, (title, nm, jb, js, nj, nch, ratio, motors) in enumerate(specs):
        ox = i * cw
        m = (ox + 62, 120)
        j = (ox + 62 + 110, 120)
        q = (ox + 62 + 70, 120 + 175)
        b.append(t(ox + cw / 2, 26, title, "bt", "middle"))
        b.append(t(ox + cw / 2, 44, f"{motors} hub motor{'s' if motors > 1 else ''}", "bs", "middle"))
        b.append(circ(*m, 70 * k, "hub ghost"))
        for (ax, ay, bx, by) in tangents(m, R(nm) + 2, j, R(jb) + 2):
            b.append(line(ax, ay, bx, by, "chain"))
        for (ax, ay, bx, by) in tangents(j, R(js) + 2, q, R(nj) + 2):
            b.append(line(ax, ay, bx, by, "chain" + (" chain3" if nch == 3 else "")))
        for (c, n, cls) in ((m, nm, "spk"), (j, jb, "spk"), (j, js, "spk2"), (q, nj, "spk")):
            r = R(n)
            b.append(f'<circle cx="{c[0]:.1f}" cy="{c[1]:.1f}" r="{r + 2.5:.1f}" class="teeth" '
                     f'style="stroke-dasharray:{2 * math.pi * (r + 2.5) / n / 2:.2f}"/>')
            b.append(circ(c[0], c[1], r, cls))
            b.append(circ(c[0], c[1], 2.5, "axle"))
        b.append(t(m[0], m[1] - 70 * k - 8, f"{nm}T", "lbl", "middle"))
        b.append(t(j[0], j[1] - R(jb) - 8, f"{jb}T + {js}T", "lbl", "middle"))
        b.append(t(q[0], q[1] + R(nj) + 20, f"{nj}T" + (f" × {nch} chains" if nch > 1 else ""), "lbl", "middle"))
        b.append(t(ox + cw / 2, H - 30, f"{jb}/{nm} × {nj}/{js}", "eq", "middle"))
        b.append(t(ox + cw / 2, H - 10, f"= {ratio}:1", "eqb", "middle"))
    b.append(t(8, 72, "motor", "lbl muted"))
    b.append(t(8, 88, "sprocket", "lbl muted"))
    return svg("drv", W, H, "".join(b), "The three hub-motor drives to the same scale: hip pitch 8.0 to 1, knee 7.74 to "
                                        "1, ankle 4.46 to 1", "fig drives")


# ------------------------------------------------------------------------------------------------ 3. two motors, one joint
def joint_plan():
    """Plan view (from above) of a two-motor joint: both motors chain into one jackshaft, which drives the joint with
    three chains."""
    W, H = 720, 330
    b = []
    # link plates (moving) and frame plates
    b.append(rect(40, 40, 640, 14, "wood"))
    b.append(t(46, 34, "frame plate, 12 mm plywood", "lbl muted"))
    # motors (seen from above: 60 wide along the axle, 140 long)
    for i, x in enumerate((90, 450)):
        b.append(rect(x, 70, 180, 64, "hub", 8))
        b.append(t(x + 90, 107, f"hub motor {'AB'[i]}", "lbl", "middle"))
        b.append(rect(x - 14, 94, 14, 16, "alu"))
        b.append(rect(x + 180, 94, 14, 16, "alu"))
        sx = x + 190 if i == 0 else x - 10
        b.append(rect(sx - 4, 134, 8, 30, "spk"))
    b.append(t(70, 160, "axle clamps (6 mm aluminium)", "lbl muted"))
    # first-stage chains to the jackshaft
    for sx in (280, 440):
        b.append(line(sx, 150, sx, 214, "chain"))
    b.append(t(292, 186, "chain 1", "lbl muted"))
    b.append(t(452, 186, "chain 2", "lbl muted"))
    # jackshaft
    b.append(line(150, 222, 570, 222, "shaft"))
    for x in (276, 436):
        b.append(rect(x, 206, 8, 32, "spk"))
    for x in (348, 358, 368):
        b.append(rect(x, 212, 6, 20, "spk2"))
    for x in (150, 570):
        b.append(circ(x, 222, 9, "brg"))
    b.append(t(150, 252, "608 bearing", "lbl muted", "middle"))
    b.append(t(580, 226, "jackshaft", "lbl"))
    # three chains to the joint
    for x in (351, 361, 371):
        b.append(line(x, 232, x, 288, "chain"))
    b.append(t(384, 266, "3 chains", "lbl"))
    b.append(rect(330, 288, 64, 12, "spk"))
    b.append(t(402, 298, "joint sprocket ×3, bolted to the moving link", "lbl"))
    return svg("plan", W, H, "".join(b), "Seen from above: two hub motors each chain to one jackshaft, which drives the "
                                         "joint through three chains side by side", "fig plan")


# ------------------------------------------------------------------------------------------------ 4. hub motor prep
def hub_prep():
    W, H = 760, 330
    b = []
    cx, cy = 190, 150
    b.append(f'<circle cx="{cx}" cy="{cy}" r="118" class="tyre"/>')
    b.append(t(cx, 22, "1  cut the tyre off", "lbl", "middle"))
    b.append(circ(cx, cy, 86, "hub"))
    b.append(circ(cx, cy, 26, "alu"))
    b.append(t(cx, cy + 5, "axle", "lbl", "middle"))
    for a in range(0, 360, 60):
        b.append(circ(cx + 54 * math.cos(math.radians(a)), cy + 54 * math.sin(math.radians(a)), 4.5, "bolt"))
    b.append(t(cx, H - 32, "side cover: 6 screws", "lbl", "middle"))
    b.append(t(cx, H - 14, "on the side away from the cable", "lbl muted", "middle"))
    # exploded side view
    y0, x = 160, 410
    parts = [(x, 12, 150, "alu", "2  clamp", "below"), (x + 40, 72, 172, "hub", "motor", "below"),
             (x + 140, 10, 124, "alu", "3  adapter plate", "above"), (x + 186, 7, 64, "spk", "4  sprocket", "below2"),
             (x + 226, 12, 150, "alu", "2  clamp", "below")]
    b.append(line(x - 24, y0, x + 280, y0, "shaft"))
    for (px, w, h, cls, lab, pos) in parts:
        b.append(rect(px, y0 - h / 2, w, h, cls, 8 if cls == "hub" else 2))
        if pos == "above":
            b.append(t(px + w / 2, y0 - h / 2 - 10, lab, "lbl", "middle"))
        elif pos == "below2":
            b.append(t(px + w / 2, y0 + h / 2 + 18, lab, "lbl", "middle"))
        else:
            b.append(t(px + w / 2, y0 + h / 2 + 20, lab, "lbl", "middle"))
    b.append(t(x + 288, y0 + 5, "axle", "lbl"))
    b.append(t(x + 130, 30, "the shell turns; the axle never does", "lbl muted", "middle"))
    return svg("hub", W, H, "".join(b), "Hub motor preparation: remove the tyre, clamp the fixed axle in two plates, "
                                        "bolt an adapter plate and sprocket to the side cover", "fig hubprep")


# ------------------------------------------------------------------------------------------------ 5. lever test
def lever(kind="hub"):
    W, H = 720, 250
    b = []
    if kind == "hub":
        b.append(circ(110, 120, 56, "hub"))
        b.append(t(110, 124, "hub motor", "lbl", "middle"))
        b.append(t(110, 196, "axle in a vice", "lbl muted", "middle"))
    else:
        b.append(rect(40, 100, 120, 40, "drill", 10))
        b.append(t(100, 124, "drill", "lbl", "middle"))
    b.append(rect(150, 112, 440, 14, "alu"))
    b.append(line(150, 60, 590, 60, "dim", "both", "lev" + kind))
    b.append(t(370, 52, "0.5 m from the axle to the scale", "lbl", "middle"))
    b.append(rect(560, 140, 60, 50, "scale", 6))
    b.append(t(590, 170, "kg", "lbl", "middle"))
    b.append(line(590, 126, 590, 140, "ln"))
    b.append(t(590, 214, "luggage scale", "lbl muted", "middle"))
    b.append(t(150, 240, "torque (N·m) = scale reading (kg) × 9.81 × 0.5", "eq"))
    return svg("lev" + kind, W, H, "".join(b), "Lever test: a 0.5 m bar from the motor presses on a luggage scale",
               "fig lever")


# ------------------------------------------------------------------------------------------------ 6. drill capstan
def capstan():
    W, H = 760, 340
    b = []
    # left: seen along the joint axis
    cx, cy, R = 190, 290, 170
    a0, a1 = math.radians(-140), math.radians(-40)
    b.append(path(f"M{cx} {cy} L{cx + R * math.cos(a0):.1f} {cy + R * math.sin(a0):.1f} "
                  f"A{R} {R} 0 0 1 {cx + R * math.cos(a1):.1f} {cy + R * math.sin(a1):.1f} Z", "wood"))
    rr = 9
    rc = (cx, cy - R - rr)
    b.append(path(f"M{cx + (R + 2) * math.cos(a0):.1f} {cy + (R + 2) * math.sin(a0):.1f} "
                  f"A{R + 2} {R + 2} 0 0 1 {cx + (R + 2) * math.cos(a1):.1f} {cy + (R + 2) * math.sin(a1):.1f}", "cord"))
    b.append(circ(rc[0], rc[1], rr + 2, "cordring"))
    b.append(circ(rc[0], rc[1], rr, "rod"))
    for a in (a0, a1):
        b.append(circ(cx + (R - 16) * math.cos(a), cy + (R - 16) * math.sin(a), 5, "bolt"))
    b.append(circ(cx, cy, 8, "joint"))
    b.append(t(cx + 16, cy + 4, "joint axle", "lbl"))
    b.append(t(rc[0] + 18, rc[1] - 8, "steel rod (motor side)", "lbl"))
    b.append(t(cx, cy - 70, "plywood sector", "lbl", "middle"))
    b.append(t(cx - R + 4, cy - 46, "cord anchor", "lbl muted"))
    b.append(t(20, 22, "SEEN ALONG THE JOINT AXIS", "cap"))
    # right: seen from above
    y = 130
    x = 430
    b.append(t(x, 22, "SEEN FROM ABOVE", "cap"))
    b.append(rect(x, y - 24, 110, 48, "drill", 10))
    b.append(t(x + 55, y + 5, "drill A", "lbl", "middle"))
    b.append(rect(x + 110, y - 16, 22, 32, "clutch", 3))
    b.append(rect(x + 208, y - 16, 22, 32, "clutch", 3))
    b.append(rect(x + 230, y - 24, 110, 48, "drill", 10))
    b.append(t(x + 285, y + 5, "drill B", "lbl", "middle"))
    b.append(rect(x + 132, y - 5, 76, 10, "rod"))
    for i in range(5):
        xx = x + 150 + i * 8
        b.append(path(f"M{xx} {y - 7} L{xx + 6} {y + 7}", "cord"))
    b.append(rect(x + 150, y + 30, 40, 12, "wood"))
    b.append(line(x + 160, y + 7, x + 160, y + 30, "cord"))
    b.append(line(x + 180, y + 7, x + 180, y + 30, "cord"))
    b.append(t(x + 170, y + 62, "sector, edge on", "lbl", "middle"))
    b.append(t(x + 121, y - 34, "clutch", "lbl muted", "middle"))
    b.append(t(x + 170, y - 34, "rod in both chucks", "lbl", "middle"))
    b.append(t(x, y + 104, "Both chucks grip one 10 mm rod. Reverse", "lbl muted"))
    b.append(t(x, y + 122, "one drill in the firmware: they face", "lbl muted"))
    b.append(t(x, y + 140, "each other.", "lbl muted"))
    b.append(t(x, H - 14, "ratio = sector radius ÷ 6.5 mm", "eq"))
    return svg("cap", W, H, "".join(b), "Drill joint: two drills face each other on one steel rod; a cord wrapped round "
                                        "the rod pulls a plywood sector on the joint", "fig capstan")


# ------------------------------------------------------------------------------------------------ 7. frame dimensions
def frame_dims(D):
    s = 0.34
    W, H = 760, 650
    fy = 590
    hip = (D["ankle_h"] + D["shank"] + D["thigh"]) * 1000
    knee = (D["ankle_h"] + D["shank"]) * 1000
    ank = D["ankle_h"] * 1000
    hw = D["hip_half_width"] * 1000
    waist = hip + (D["waist_yaw_above"] + D["waist_pitch_above"]) * 1000
    sh = waist + D["shoulder_z"] * 1000
    shw = D["shoulder_half_width"] * 1000
    neck = waist + D["neck_yaw_z"] * 1000
    flen, fw, heel = D["foot_len"] * 1000, D["foot_w"] * 1000, D["heel"] * 1000
    ua, fa = D["upper_arm"] * 1000, D["forearm"] * 1000
    fx0, sx0 = 230, 560
    u = "frm"

    def F(X, Z):
        return fx0 + X * s, fy - Z * s

    def S(x, Z):
        return sx0 + x * s, fy - Z * s

    b = [line(20, fy, W - 20, fy, "ground")]
    pts = [((-hw, ank), (-hw, knee)), ((-hw, knee), (-hw, hip)), ((hw, ank), (hw, knee)), ((hw, knee), (hw, hip)),
           ((-hw, hip), (hw, hip)), ((0, hip), (0, waist)), ((0, waist), (0, sh)), ((-shw, sh), (shw, sh)),
           ((0, sh), (0, neck)), ((-shw, sh), (-shw, sh - ua)), ((-shw, sh - ua), (-shw, sh - ua - fa)),
           ((shw, sh), (shw, sh - ua)), ((shw, sh - ua), (shw, sh - ua - fa))]
    for (a, c) in pts:
        b.append(line(*F(*a), *F(*c), "stick"))
    for X in (-hw, hw):
        b.append(line(*F(X - fw / 2, 0), *F(X + fw / 2, 0), "stick"))
        b.append(line(*F(X, 0), *F(X, ank), "stick"))
        for Z in (ank, knee, hip):
            b.append(circ(*F(X, Z), 4, "joint"))
    # widths: label to the right of the centre line, clear of it
    y = F(0, hip)[1] + 26
    b.append(line(F(-hw, 0)[0], y, F(hw, 0)[0], y, "dim", "both", u))
    b.append(t(F(hw, 0)[0] + 8, y + 4, f"hips {2 * hw:.0f}", "dl"))
    y = F(0, sh)[1] - 18
    b.append(line(F(-shw, 0)[0], y, F(shw, 0)[0], y, "dim", "both", u))
    b.append(t(F(shw, 0)[0] + 8, y + 4, f"shoulders {2 * shw:.0f}", "dl"))
    x = F(-hw, 0)[0] - 30
    for (z0, z1, lab) in ((0, ank, f"ankle {ank:.0f}"), (ank, knee, f"shank {knee - ank:.0f}"), (knee, hip, f"thigh {hip - knee:.0f}")):
        b.append(line(x, F(0, z0)[1], x, F(0, z1)[1], "dim", "both", u))
        b.append(t(x - 8, (F(0, z0)[1] + F(0, z1)[1]) / 2 + 4, lab, "dl", "end"))
    x = F(-shw, 0)[0] - 18
    for (z0, z1, lab) in ((sh - ua, sh, f"upper arm {ua:.0f}"), (sh - ua - fa, sh - ua, f"forearm {fa:.0f}")):
        b.append(line(x, F(0, z0)[1], x, F(0, z1)[1], "dim", "both", u))
        b.append(t(x - 8, (F(0, z0)[1] + F(0, z1)[1]) / 2 + 4, lab, "dl", "end"))
    b.append(t(fx0, fy + 28, "FRONT", "cap", "middle"))
    # side
    b.append(line(*S(-heel, 0), *S(flen - heel, 0), "stick"))
    b.append(line(*S(0, 0), *S(0, neck), "stick"))
    for Z in (ank, knee, hip, waist, sh):
        b.append(circ(*S(0, Z), 4, "joint"))
    y = fy + 16
    b.append(line(S(-heel, 0)[0], y, S(flen - heel, 0)[0], y, "dim", "both", u))
    b.append(t(S((flen - heel) / 2 - heel / 2, 0)[0], y + 18, f"foot {flen:.0f} × {fw:.0f}, ankle {heel:.0f} from the heel", "dl", "middle"))
    xs = S(0, 0)[0]
    for (z0, z1, lab, dx) in ((hip, waist, f"waist +{waist - hip:.0f}", 26), (waist, sh, f"shoulders +{sh - waist:.0f}", 26),
                              (waist, neck, f"neck +{neck - waist:.0f}", 130)):
        b.append(line(xs + dx, F(0, z0)[1], xs + dx, F(0, z1)[1], "dim", "both", u))
        b.append(t(xs + dx + 8, (F(0, z0)[1] + F(0, z1)[1]) / 2 + 4, lab, "dl"))
    b.append(t(xs + 26 + 8, F(0, hip)[1] + 18, f"hip-yaw axis 75 above the hip", "dl"))
    b.append(t(sx0, fy + 58, "SIDE", "cap", "middle"))
    b.append(t(20, 22, "mm, centre to centre", "lbl muted"))
    return svg(u, W, H, "".join(b), "Frame dimensions in millimetres: hips 210 apart, thigh and shank 420, ankle "
                                    "75 above the floor, shoulders 400 apart", "fig frame")


# ------------------------------------------------------------------------------------------------ 8. signal wiring
def wiring():
    W, H = 780, 500
    b = []
    u = "wir"

    def box(x, y, w, h, title, sub="", cls="blk"):
        o = rect(x, y, w, h, cls, 8) + t(x + w / 2, y + (h / 2 + 5 if not sub else h / 2 - 3), title, "bt", "middle")
        if sub:
            o += t(x + w / 2, y + h / 2 + 13, sub, "bs", "middle")
        return o

    b.append(box(310, 14, 160, 48, "Laptop", "walking policy, 50 Hz"))
    b.append(path("M390 62 L390 84 L170 84 L170 108", "ln", True, u))
    b.append(t(400, 78, "USB: 12 joint targets", "lbl"))
    for i, x in enumerate((30, 420)):
        side = "LEFT" if i == 0 else "RIGHT"
        b.append(box(x + 80, 110, 170, 50, "ESP32-S3", f"{side} leg and arm", "blk strong"))
        cxp = x + 165
        b.append(line(cxp, 160, cxp, 200, "can"))
        b.append(t(cxp + 8, 186, "CAN, 1 Mbit/s", "lbl"))
        b.append(line(x, 206, x + 330, 206, "can"))
        b.append(rect(x - 7, 199, 8, 14, "term"))
        b.append(rect(x + 329, 199, 8, 14, "term"))
        for kk, lab in enumerate(("hip", "hip", "knee", "knee", "ankle", "ankle")):
            bx = x + 6 + kk * 54
            b.append(line(bx + 24, 206, bx + 24, 224, "can"))
            b.append(rect(bx, 224, 48, 26, "blk hubb", 5))
            b.append(t(bx + 24, 241, "ODESC", "bs", "middle"))
            b.append(line(bx + 24, 250, bx + 24, 266, "ln"))
            b.append(circ(bx + 24, 284, 17, "hub"))
            b.append(t(bx + 24, 288, lab, "bs", "middle"))
        # PWM and I2C run down the outer edge, clear of the drive row
        ex = x - 18 if i == 0 else x + 348
        sx = x + 80 if i == 0 else x + 250
        b.append(path(f"M{sx} 140 L{ex} 140 L{ex} 352 L{x + (0 if i == 0 else 330)} 352", "ln", True, u))
        b.append(path(f"M{sx} 150 L{ex + (6 if i == 0 else -6)} 150 L{ex + (6 if i == 0 else -6)} 416 L{x + (0 if i == 0 else 330)} 416", "ln dashed", True, u))
        b.append(box(x, 330, 330, 44, "6 × BTS7960 H-bridge → drill", "hip yaw ×2, hip roll ×2, shoulder, elbow", "blk drillb"))
        b.append(box(x, 394, 330, 44, "8 × MT6701 angle sensor", "one per joint, through TCA9548A multiplexers", "blk"))
        b.append(t(x, 460, "+ 4 foot switches" + (", BNO085 IMU" if i == 0 else ""), "lbl muted"))
    b.append(line(250, 128, 500, 128, "uart"))
    b.append(t(375, 120, "UART link", "lbl", "middle"))
    b.append(t(16, 326, "PWM", "lbl muted"))
    b.append(t(16, 390, "I²C", "lbl muted"))
    b.append(t(16, 488, "Each CAN bus: twisted pair, a 120 Ω resistor at both ends (black squares).", "lbl muted"))
    return svg(u, W, H, "".join(b), "Signal wiring: a laptop sends joint targets to two ESP32 boards; each drives its "
                                    "leg's six ODESC drives on its own CAN bus, six drills through H-bridges, and reads "
                                    "eight angle sensors", "fig wiring")


# ------------------------------------------------------------------------------------------------ 9. power path
def power():
    W, H = 780, 340
    b = []
    u = "pwr"

    def box(x, y, w, h, title, sub="", cls="blk"):
        o = rect(x, y, w, h, cls, 8) + t(x + w / 2, y + (h / 2 + 5 if not sub else h / 2 - 3), title, "bt", "middle")
        if sub:
            o += t(x + w / 2, y + h / 2 + 13, sub, "bs", "middle")
        return o

    yb = 170
    b.append(box(16, yb - 32, 124, 64, "13S4P pack", "48 V · 60 A BMS", "blk battb"))
    b.append(line(140, yb, 176, yb, "bus48"))
    b.append(box(176, yb - 22, 76, 44, "fuse", "60 A"))
    b.append(line(252, yb, 288, yb, "bus48"))
    b.append(box(288, yb - 32, 120, 64, "contactor", "100 A, 12 V coil", "blk danger"))
    b.append(line(408, yb, 450, yb, "bus48"))
    b.append(line(450, 80, 450, 240, "bus48"))
    b.append(t(442, 256, "48 V bus", "lbl", "end"))
    b.append(line(450, 80, 480, 80, "bus48"))
    b.append(box(480, 56, 284, 48, "12 × ODESC → hub motors", "25 A fuse + 2 Ω brake resistor per pair", "blk hubb"))
    b.append(line(450, 170, 480, 170, "bus48"))
    b.append(box(480, 148, 118, 44, "48 → 18 V buck", "20 A"))
    b.append(line(598, 170, 630, 170, "bus18"))
    b.append(box(630, 146, 134, 48, "12 × BTS7960", "→ drills", "blk drillb"))
    b.append(box(288, 46, 120, 42, "E-STOP", "latching button", "blk danger"))
    b.append(line(348, 88, 348, 138, "estop"))
    b.append(t(356, 118, "coil", "lbl muted"))
    b.append(line(158, yb, 158, 280, "ln"))
    b.append(line(158, 280, 196, 280, "ln"))
    b.append(box(196, 260, 120, 40, "5 V buck", "on the battery side"))
    b.append(line(316, 280, 350, 280, "ln", "end", u))
    b.append(box(352, 260, 160, 40, "ESP32s + sensors", "stay on after an e-stop"))
    b.append(t(16, 328, "Press the button, or let the firmware's watchdog drop out: the contactor opens and every motor "
                        "loses power at once.", "lbl"))
    return svg(u, W, H, "".join(b), "Power path: pack, 60 A fuse, 100 A contactor controlled by the e-stop, then the "
                                    "48 V bus to the hub-motor drives and an 18 V buck for the drills", "fig power")


# ------------------------------------------------------------------------------------------------ 10. battery
def battery():
    W, H = 760, 250
    b = []
    r = 13
    x0, y0, dx, dy = 40, 40, 52, 30
    for g in range(13):
        for c in range(4):
            b.append(circ(x0 + g * dx, y0 + c * dy, r, "cell"))
        x = x0 + g * dx
        b.append(rect(x - 17, y0 - 18, 34, 3 * dy + 36, "group"))
        if g < 12:
            yy = y0 + 3 * dy + 18 if g % 2 == 0 else y0 - 18
            b.append(line(x + 17, yy, x + dx - 17, yy, "series"))
        b.append(t(x, y0 + 3 * dy + 40, str(g + 1), "bs", "middle"))
    b.append(t(x0 - 26, y0 + 50, "−", "big", "middle"))
    b.append(t(x0 + 12 * dx + 28, y0 + 50, "+", "big", "middle"))
    b.append(t(x0, y0 + 3 * dy + 62, "13 groups in series (13S) × 4 cells in parallel (4P) = 52 cells · 48 V nominal, "
                                     "54.6 V full, 39 V empty · about 10 Ah", "lbl"))
    b.append(t(x0, y0 + 3 * dy + 80, "Each group: 4 tested cells side by side. A balance wire from every group join to the "
                                     "BMS.", "lbl muted"))
    return svg("bat", W, H, "".join(b), "Battery layout: 13 groups of 4 cells in series, 52 cells, 48 volts", "fig battery")


# ------------------------------------------------------------------------------------------------ 11. control loops
def loops():
    W, H = 780, 230
    b = []
    u = "lp"
    stages = [("Laptop", "policy · 50 Hz", "reads IMU + angles"), ("ESP32", "PD loop · 500 Hz", "holds each joint"),
              ("ODESC", "current loop", "holds the torque"), ("Hub motor", "+ chain", "turns the joint")]
    w, gap = 162, 44
    xs = [16 + i * (w + gap) for i in range(4)]
    for i, (a, b_, c) in enumerate(stages):
        x = xs[i]
        cls = "blk strong" if i == 1 else ("blk hubb" if i >= 2 else "blk")
        b.append(rect(x, 30, w, 62, cls, 8))
        b.append(t(x + w / 2, 56, a, "bt", "middle"))
        b.append(t(x + w / 2, 76, b_, "bs", "middle"))
        b.append(t(x + w / 2, 114, c, "lbl muted", "middle"))
        if i < 3:
            b.append(line(x + w, 61, x + w + gap - 2, 61, "ln", "end", u))
    b.append(t(xs[1] + w / 2, 132, "kp × (target − angle) − kd × speed", "eq", "middle", 11))
    # feedback: joint angle to the ESP32, angles + IMU to the laptop
    b.append(path(f"M{xs[3] + w - 16} 92 L{xs[3] + w - 16} 168 L{xs[1] + w - 16} 168 L{xs[1] + w - 16} 94", "ln", True, u))
    b.append(t((xs[1] + xs[3]) / 2 + w / 2, 162, "joint angle (MT6701), 500 Hz", "lbl", "middle"))
    b.append(path(f"M{xs[1] + 16} 92 L{xs[1] + 16} 204 L{xs[0] + w - 16} 204 L{xs[0] + w - 16} 94", "ln dashed", True, u))
    b.append(t(xs[0] + w + 60, 198, "angles + IMU, 50 Hz", "lbl muted"))
    return svg(u, W, H, "".join(b), "Control loops: the laptop's policy sends targets at 50 Hz, the ESP32 holds each "
                                    "joint at 500 Hz, the ODESC holds the motor current", "fig loops")


# ------------------------------------------------------------------------------------------------ 12. gantry
def gantry():
    W, H = 420, 330
    b = []
    b.append(line(30, 300, 390, 300, "ground"))
    b.append(line(60, 300, 120, 40, "ln thick"))
    b.append(line(360, 300, 300, 40, "ln thick"))
    b.append(line(100, 40, 320, 40, "ln thick"))
    b.append(t(210, 30, "beam or A-frame", "lbl", "middle"))
    b.append(path("M210 40 Q 214 70 210 96", "rope"))
    b.append(t(218, 74, "rope, just slack", "lbl"))
    # robot outline
    b.append(rect(186, 100, 48, 70, "alu", 6))
    b.append(rect(194, 170, 32, 20, "alu", 4))
    for x in (198, 222):
        b.append(line(x, 190, x, 296, "stick"))
    b.append(path("M184 112 L236 112 M188 178 L232 178", "strap"))
    b.append(t(244, 116, "chest strap", "lbl muted"))
    b.append(t(244, 182, "pelvis strap", "lbl muted"))
    # person with e-stop
    b.append(circ(330, 190, 12, "ln"))
    b.append(line(330, 202, 330, 250, "stick"))
    b.append(line(330, 250, 318, 296, "stick"))
    b.append(line(330, 250, 342, 296, "stick"))
    b.append(line(330, 214, 302, 226, "stick"))
    b.append(rect(290, 218, 16, 16, "danger-fill", 3))
    b.append(t(298, 252, "e-stop", "lbl", "end"))
    return svg("gan", W, H, "".join(b), "Gantry: the robot hangs from a beam by chest and pelvis straps; a second person "
                                        "holds the e-stop", "fig gantry")


# ------------------------------------------------------------------------------------------------ 13. speed chart
def speed_chart(rows):
    """rows: (commanded, achieved, joint speed fraction, rms fraction)."""
    W, H = 560, 300
    x0, y0, x1, y1 = 60, 250, 520, 30
    lo, hi = 0.4, 1.8

    def X(v):
        return x0 + (v - lo) / (hi - lo) * (x1 - x0)

    def Y(v):
        return y0 - (v - lo) / (hi - lo) * (y0 - y1)

    b = []
    for v in (0.6, 1.0, 1.4, 1.8):
        b.append(line(X(v), y0, X(v), y1, "grid"))
        b.append(line(x0, Y(v), x1, Y(v), "grid"))
        b.append(t(X(v), y0 + 18, f"{v:.1f}", "lbl", "middle"))
        b.append(t(x0 - 8, Y(v) + 4, f"{v:.1f}", "lbl", "end"))
    b.append(line(X(lo), Y(lo), X(hi), Y(hi), "diag"))
    b.append(t(X(1.62), Y(1.72), "achieved = commanded", "lbl muted", "end"))
    b.append(rect(X(0.8), y1, X(1.0) - X(0.8), y0 - y1, "band"))
    b.append(t(X(0.9), y1 + 14, "sized for", "lbl muted", "middle"))
    pts = " ".join(f"{X(c):.1f},{Y(a):.1f}" for c, a, _, _ in rows)
    b.append(f'<polyline points="{pts}" class="series"/>')
    for c, a, w, r in rows:
        b.append(circ(X(c), Y(a), 5, "dot"))
    c, a, w, r = rows[-1]
    b.append(t(X(c) - 10, Y(a) - 12, f"{a:.2f} m/s", "lbl strongt", "end"))
    b.append(t((x0 + x1) / 2, H - 6, "commanded speed (m/s)", "lbl", "middle"))
    b.append(f'<text x="16" y="{(y0 + y1) / 2:.0f}" class="lbl" text-anchor="middle" transform="rotate(-90 16 {(y0 + y1) / 2:.0f})">achieved (m/s)</text>')
    return svg("spd", W, H, "".join(b), f"S1-Fast top speed in simulation: {rows[-1][1]:.2f} metres per second when "
                                        f"commanded {rows[-1][0]:.1f}", "fig speed")
