"""KESTREL K1 hand geometry (left hand; mirrored for the right). Millimetres, zero pose.

Architecture (docs/03 §Hands): 10 actuated DOF. Linkage-driven fingers; each actuated joint
is driven by a palm-housed micro linear actuator (maxon DCX 10 L / Ø4x1 mm KSS ball screw
class) through a crossed four-bar; PIP-DIP coupled by a second four-bar (ILDA pattern,
Kim et al. Nat. Commun. 2021). Thumb: CMC rotation + CMC flexion + MCP/IP coupled.
Index: MCP abduction + MCP flexion + PIP/DIP. Middle: MCP flexion + PIP/DIP. Ring, little:
one coupled flexion each. Hand frame: palm normal -y (faces the thigh), fingers -z, thumb +x.
"""
import cadquery as cq

from geom import cyl, loft, rbox, rod_between

# finger: x offset across palm, phalanx lengths (prox, mid, dist), radius, splay deg
FINGERS = [("index", 30, (44, 27, 21), 9.0, 4), ("middle", 10, (48, 30, 22), 9.2, 0),
           ("ring", -10, (45, 28, 21), 8.8, -3), ("little", -30, (37, 22, 18), 8.0, -7)]


def phalanx(x, y, z0, L, r, curl_deg=0.0):
    """Rounded phalanx shell from z0 downward (along -z), slightly tapered."""
    s = loft([((x, y, z0 - 1.5), r, r * 0.92, 2.2), ((x, y, z0 - L + 3.0), r * 0.9, r * 0.84, 2.2)])
    return s


def hand_parts(SY, WRZ):
    P = []
    y0 = SY - 2
    # palm: lofted, thicker at the heel, rounded knuckle line
    palm = loft([((0, y0, WRZ - 30), 40, 15, 2.4), ((0, y0 - 1, WRZ - 70), 45, 17, 2.8), ((0, y0 - 2, WRZ - 118), 46, 15, 2.8),
                 ((0, y0 - 2, WRZ - 128), 42, 12, 2.4)])
    P.append(("shell", "palm_shell", palm))
    P.append(("joint", "palm_pad", rbox(70, 4, 70, 2, (0, y0 - 16, WRZ - 80))))
    P.append(("joint", "wrist_link", cyl(26, 24, "z", (0, y0, WRZ - 22))))
    z_k = WRZ - 128  # knuckle line
    for name, x, (l1, l2, l3), r, splay in FINGERS:
        z = z_k
        yk = y0 - 2
        P.append(("joint", f"{name}_mcp", cyl(r + 0.8, 2 * r + 2, "y", (x, yk, z))))
        for j, (L, curl) in enumerate(((l1, 6), (l2, 10), (l3, 12))):
            yk -= L * 0.06 * (j + 1)                    # natural slight curl toward the palm
            P.append(("shell", f"{name}_p{j}", phalanx(x, yk, z - r * 0.4, L, r * (1 - 0.08 * j))))
            if j < 2:
                P.append(("joint", f"{name}_j{j}", cyl(r * (0.95 - 0.08 * j), 2 * r * (0.95 - 0.08 * j), "y", (x, yk, z - L))))
            z -= L
        P.append(("sole", f"{name}_tip_pad", rbox(r * 1.5, 4, 14, 2, (x, yk - r * 0.75, z + 9))))
    # thumb: CMC housing in the thenar, three segments angled forward and toward the palm
    P.append(("joint", "thumb_cmc", cq.Workplane("XY").sphere(15).translate((34, y0 - 8, WRZ - 52))))
    p0 = (38, y0 - 10, WRZ - 56)
    p1 = (56, y0 - 18, WRZ - 88)
    p2 = (66, y0 - 24, WRZ - 116)
    p3 = (72, y0 - 28, WRZ - 138)
    P.append(("shell", "thumb_meta", rod_between(p0, p1, 11)))
    P.append(("joint", "thumb_mcp", cq.Workplane("XY").sphere(10.5).translate(p1)))
    P.append(("shell", "thumb_prox", rod_between(p1, p2, 9.6)))
    P.append(("joint", "thumb_ip", cq.Workplane("XY").sphere(9.2).translate(p2)))
    P.append(("shell", "thumb_dist", rod_between(p2, p3, 8.8)))
    P.append(("sole", "thumb_tip_pad", rbox(10, 4, 12, 2, (p3[0] - 3, p3[1] - 7, p3[2] + 6))))
    P.append(("accent", "palm_light", rbox(2, 2, 30, 1, (46, y0, WRZ - 70))))
    return P


def hand_internals(SY, WRZ):
    """Palm-housed linear actuators and linkages (for the hand detail render)."""
    P = []
    y0 = SY - 2
    for k, x in enumerate((30, 10, -10, -30)):
        P.append(("act", f"lin_act_mcp_{k}", cyl(5.2, 46, "z", (x, y0 + 4, WRZ - 72))))
        P.append(("ti", f"mcp_rod_{k}", rod_between((x, y0 + 4, WRZ - 96), (x, y0 + 2, WRZ - 124), 1.5)))
    for k, x in enumerate((30, 10)):
        P.append(("act", f"lin_act_pip_{k}", cyl(4.2, 30, "z", (x, y0 - 4, WRZ - 150))))
    P.append(("act", "lin_act_index_abd", cyl(4.2, 30, "x", (8, y0 + 8, WRZ - 50))))
    P.append(("act", "thumb_rot_motor", cyl(6.5, 26, "z", (24, y0 + 2, WRZ - 46))))
    P.append(("act", "thumb_flex_motor", cyl(5.2, 30, "x", (40, y0 + 3, WRZ - 66))))
    P.append(("pcb", "hand_controller", rbox(60, 3, 40, 1, (0, y0 + 10, WRZ - 50))))
    return P
