#!/usr/bin/env python3
"""Generate the engineering diagrams (SVG) from design data. Run: python make_diagrams.py"""
from __future__ import annotations

import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
INK, MUTED, LINE, BG = "#1f2328", "#59636e", "#c9d1d9", "#ffffff"
AMBER, BLUE, GREEN, RED, PURPLE, GREY = "#d9822b", "#2f6fdf", "#2f8f5b", "#c93c37", "#7a4fc9", "#8c959f"
FONT = "font-family='Inter, Segoe UI, Helvetica, Arial, sans-serif'"


class SVG:
    def __init__(self, w, h, title):
        self.w, self.h, self.e = w, h, []
        self.e.append(f"<rect width='{w}' height='{h}' fill='{BG}'/>")
        self.text(24, 34, title, 20, INK, weight=700)

    def text(self, x, y, s, size=13, fill=INK, anchor="start", weight=400, italic=False):
        st = " font-style='italic'" if italic else ""
        s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        self.e.append(f"<text x='{x:.1f}' y='{y:.1f}' {FONT} font-size='{size}' fill='{fill}' text-anchor='{anchor}' font-weight='{weight}'{st}>{s}</text>")

    def box(self, x, y, w, h, label="", sub="", stroke=INK, fill="#f6f8fa", r=8, size=13, lines=None):
        self.e.append(f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='{r}' fill='{fill}' stroke='{stroke}' stroke-width='1.5'/>")
        if label:
            self.text(x + w / 2, y + (h / 2 if not (sub or lines) else 20), label, size, INK, "middle", 600)
        if sub:
            self.text(x + w / 2, y + 38, sub, size - 2, MUTED, "middle")
        if lines:
            for i, l in enumerate(lines):
                self.text(x + w / 2, y + 38 + i * 15, l, size - 2.5, MUTED, "middle")

    def line(self, x1, y1, x2, y2, stroke=INK, width=1.5, dash=None, arrow=False):
        d = f" stroke-dasharray='{dash}'" if dash else ""
        m = " marker-end='url(#arrow)'" if arrow else ""
        self.e.append(f"<line x1='{x1:.1f}' y1='{y1:.1f}' x2='{x2:.1f}' y2='{y2:.1f}' stroke='{stroke}' stroke-width='{width}'{d}{m}/>")

    def poly(self, pts, stroke=INK, width=1.5, fill="none", dash=None, arrow=False):
        d = f" stroke-dasharray='{dash}'" if dash else ""
        m = " marker-end='url(#arrow)'" if arrow else ""
        p = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        self.e.append(f"<polyline points='{p}' fill='{fill}' stroke='{stroke}' stroke-width='{width}'{d}{m}/>")

    def circle(self, x, y, r, stroke=INK, fill="#fff", width=1.5):
        self.e.append(f"<circle cx='{x:.1f}' cy='{y:.1f}' r='{r}' fill='{fill}' stroke='{stroke}' stroke-width='{width}'/>")

    def save(self, name):
        defs = ("<defs><marker id='arrow' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='7' markerHeight='7' orient='auto-start-reverse'>"
                f"<path d='M0,0 L10,5 L0,10 z' fill='{INK}'/></marker></defs>")
        svg = f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {self.w} {self.h}' width='{self.w}' height='{self.h}'>{defs}" + "".join(self.e) + "</svg>\n"
        (HERE / name).write_text(svg)


def legend(s, x, y, items):
    for i, (c, t) in enumerate(items):
        s.e.append(f"<rect x='{x}' y='{y + i * 20 - 10}' width='14' height='14' rx='3' fill='{c}'/>")
        s.text(x + 22, y + i * 20 + 2, t, 12, MUTED)


# --------------------------------------------------------------------------- 1. DOF map
def dof_map():
    s = SVG(1240, 900, "KESTREL K1 — kinematic layout (30 body DOF + 2 × 10 hand DOA)")
    cx, sc, base = 230, 0.42, 860   # front view (robot faces the viewer): robot +y (left) appears on screen right
    def P(y, z):
        return cx + y * sc, base - z * sc
    J = {  # (y, z) mm
        "head": (0, 1650), "neck": (0, 1520), "sh_l": (200, 1420), "sh_r": (-200, 1420), "el_l": (200, 1120), "el_r": (-200, 1120),
        "wr_l": (200, 860), "wr_r": (-200, 860), "waist": (0, 1050), "pelvis": (0, 950), "hip_l": (105, 915), "hip_r": (-105, 915),
        "kn_l": (105, 495), "kn_r": (-105, 495), "an_l": (105, 75), "an_r": (-105, 75)}
    segs = [("head", "neck"), ("neck", "waist"), ("sh_l", "sh_r"), ("sh_l", "el_l"), ("el_l", "wr_l"), ("sh_r", "el_r"), ("el_r", "wr_r"),
            ("waist", "pelvis"), ("hip_l", "hip_r"), ("hip_l", "kn_l"), ("kn_l", "an_l"), ("hip_r", "kn_r"), ("kn_r", "an_r")]
    for a, b in segs:
        s.line(*P(*J[a]), *P(*J[b]), GREY, 5)
    s.text(cx, 885, "front view — robot faces the viewer; labelled joints are on the robot's left side", 12, MUTED, "middle")
    marks = [("neck", "2: yaw · pitch (KH-14)", PURPLE), ("waist", "2: yaw (KA-90P) · pitch (KA-110P)", GREEN),
             ("sh_l", "3: pitch · roll (KH-25) · yaw (KH-20)", BLUE), ("el_l", "1: elbow (KH-20)", BLUE),
             ("wr_l", "3: yaw (KH-14) · pitch/roll (2× linear)", BLUE), ("hip_l", "3: yaw (KA-90P) · roll (KA-110P) · pitch (KA-130H)", AMBER),
             ("kn_l", "1: knee (KA-130K via four-bar)", AMBER), ("an_l", "2: pitch/roll (2× KA-90P via push-rods)", AMBER)]
    for k, lbl, col in marks:
        x, y = P(*J[k])
        s.circle(x, y, 9, col, "#fff", 3)
        s.line(x + 10, y, 400, y, col, 1, "3 3")
        s.text(406, y + 4, lbl, 13, INK)
    for k in ("sh_r", "el_r", "wr_r", "hip_r", "kn_r", "an_r"):
        x, y = P(*J[k])
        s.circle(x, y, 7, GREY, "#fff", 2)
    hx, hy = P(*J["head"])
    s.circle(hx, hy, 30, GREY, "#fff", 3)
    legend(s, 880, 120, [(AMBER, "legs: 6 DOF each (12)"), (GREEN, "waist: 2 DOF"), (BLUE, "arms: 7 DOF each (14)"), (PURPLE, "neck: 2 DOF"),
                         (GREY, "hands: 10 DOA each (in palm)")])
    rows = [("Joint", "Actuator", "Range (deg)"), ("hip yaw", "KA-90P", "-30 / +45"), ("hip roll", "KA-110P", "-25 / +45"), ("hip pitch", "KA-130H", "-125 / +30"),
            ("knee", "KA-130K", "0 / 130"), ("ankle pitch", "2× KA-90P", "-45 / +45"), ("ankle roll", "(shared)", "-25 / +25"), ("waist yaw", "KA-90P", "±70"),
            ("waist pitch", "KA-110P", "-15 / +75"), ("shoulder pitch", "KH-25", "-180 / +60"), ("shoulder roll", "KH-25", "-15 / +160"), ("shoulder yaw", "KH-20", "-90 / +100"),
            ("elbow", "KH-20", "-145 / 0"), ("wrist yaw", "KH-14", "±90"), ("wrist pitch/roll", "2× linear", "±70 / ±35"), ("neck yaw/pitch", "KH-14 ×2", "±80 / -35 +50")]
    y = 300
    for i, r in enumerate(rows):
        w = 700 if i == 0 else 400
        for j, c in enumerate(r):
            s.text(880 + j * 110, y + i * 20, c, 12, INK if i == 0 else MUTED, weight=w)
    s.save("dof_map.svg")


# --------------------------------------------------------------------------- 2. power architecture
def power():
    s = SVG(1240, 760, "Power architecture — 16S Li-ion bus (48.0 – 67.2 V), single-line")
    s.box(30, 80, 210, 110, "Battery 16S6P", lines=["96× Molicel P50B", "1.68 kWh · 59.2 V nom", "BMS: Orion BMS 2 + Hall 500 A"], stroke=AMBER, fill="#fff7ef")
    s.box(280, 95, 130, 80, "Pack fuse", lines=["125 A ≥80 V DC", "≥3 kA break"], stroke=RED, fill="#fff2f1")
    s.box(450, 80, 190, 110, "Solid-state disconnect", lines=["TPS48111 + B2B 100 V FETs", "precharge · 150 A cont", "enable = safety chain"], stroke=RED, fill="#fff2f1")
    s.box(680, 95, 150, 80, "Manual service", lines=["disconnect (MSD)", "interlocked plug"], stroke=RED, fill="#fff2f1")
    for x0, x1 in ((240, 280), (410, 450), (640, 680)):
        s.line(x0, 135, x1, 135, INK, 3, arrow=True)
    s.line(755, 175, 755, 215, INK, 4)
    s.line(145, 215, 1200, 215, INK, 4)
    s.text(1000, 207, "MAIN BUS 48–67.2 V (bus clamp 72 V)", 13, INK, "middle", 700)
    zones = [("Left leg", "4 drives · eFuse 40 A", 870), ("Right leg", "4 drives · eFuse 40 A", 870), ("Pelvis/waist", "4 drives · eFuse 30 A", 870),
             ("Left arm", "5 drives + wrist · eFuse 20 A", 870), ("Right arm", "5 drives + wrist · eFuse 20 A", 870), ("Neck + hands", "2 drives + 2 hand ctrl · 15 A", 870)]
    for i, (n, sub, _) in enumerate(zones):
        x = 220 + i * 165
        s.line(x + 75, 215, x + 75, 250, INK, 2)
        s.box(x, 250, 150, 70, n, sub, stroke=BLUE, fill="#f1f6ff", size=12)
    s.box(30, 400, 230, 90, "Brake chopper / clamp", lines=["8 Ω 100 W resistor", "active above 70 V (regen)"], stroke=PURPLE, fill="#f6f1ff")
    s.line(145, 400, 145, 215, PURPLE, 2, "4 3")
    s.box(320, 400, 230, 90, "DC-DC 24 V 300 W", lines=["36–75 V in, isolated", "Thor carrier, LiDAR, cameras"], stroke=GREEN, fill="#effaf3")
    s.box(600, 400, 230, 90, "DC-DC 12 V 150 W", lines=["RT computer, blowers", "hands logic, foot boards"], stroke=GREEN, fill="#effaf3")
    s.box(880, 400, 300, 90, "Logic 5 V / 3.3 V (on boards)", lines=["encoders 5 V via drive carriers", "safety MCU has own buck + supercap"], stroke=GREEN, fill="#effaf3")
    for x in (435, 715, 1030):
        s.line(x, 400, x, 340, GREEN, 1.5, "4 3")
    s.line(435, 340, 1030, 340, GREEN, 1.5, "4 3")
    s.box(320, 560, 510, 80, "Compute & sensors", lines=["Jetson T5000 + J601 (24 V) · UP Squared Pro (12 V) · ZED X Mini, 2× ZED X One, Gemini 335Lg (GMSL PoC)",
                                                            "Mid-360 (24 V) · IMUs · audio · ToF"], stroke=GREEN, fill="#fff")
    s.line(435, 490, 435, 560, GREEN, 2, arrow=True)
    s.line(715, 490, 715, 560, GREEN, 2, arrow=True)
    s.box(880, 560, 300, 80, "Charge port", lines=["67.2 V 10 A CC/CV charger", "enabled by BMS over CAN"], stroke=AMBER, fill="#fff7ef")
    s.text(30, 700, "Safety: e-stop chain removes SSD enable and asserts STO on all drives (Cat 0/1). BMS opens SSD on cell OV/UV/OT/OC. "
                    "Peak bus ≈ 2.8 kW / 52 A; normal ≈ 0.4 kW.", 12, MUTED)
    s.text(30, 722, "Wire: pack→PDU 8 AWG silicone; zone feeds 12 AWG (legs) / 14 AWG (arms); drive drops 16 AWG; all ≥ 200 °C silicone, tinned fine strand.", 12, MUTED)
    s.save("power_architecture.svg")


# --------------------------------------------------------------------------- 3. comms
def comms():
    s = SVG(1240, 820, "Compute & communications topology")
    s.box(470, 70, 300, 110, "AI computer — Jetson T5000", lines=["perception, mapping, VLA/LLM, planning", "ROS 2 Jazzy · Isaac ROS", "GMSL2 ×8 · 10GbE"], stroke=BLUE, fill="#f1f6ff")
    s.box(470, 260, 300, 110, "Real-time computer", lines=["UP Squared Pro 7000 · PREEMPT_RT", "IgH EtherCAT master @ 1 kHz (DC)", "whole-body control 500 Hz–1 kHz"], stroke=AMBER, fill="#fff7ef")
    s.line(620, 180, 620, 260, INK, 2)
    s.text(630, 225, "1 GbE · DDS/Zenoh · PTP time sync", 12, MUTED)
    s.box(880, 260, 300, 110, "Safety MCU (TMS570)", lines=["independent IMU · heartbeat watchdog", "e-stop inputs · STO + SSD outputs", "CAN to BMS / RT computer"], stroke=RED, fill="#fff2f1")
    s.line(770, 315, 880, 315, RED, 2, "5 3")
    sensors = [("ZED X Mini (head)", 90), ("2× ZED X One GS", 140), ("Gemini 335Lg (abdomen)", 190)]
    for n, y in sensors:
        s.box(60, y - 20, 250, 38, n, size=12, stroke=GREEN, fill="#effaf3")
        s.line(310, y, 470, 125, GREEN, 1.5)
    s.text(320, 230, "GMSL2 coax (FAKRA)", 12, MUTED)
    s.box(60, 250, 250, 38, "Livox Mid-360 · audio (USB)", size=12, stroke=GREEN, fill="#effaf3")
    s.line(310, 270, 470, 150, GREEN, 1.5)
    s.box(880, 90, 300, 60, "Pelvis IMU 3DM-CV7 (1 kHz, UART)", size=12, stroke=GREEN, fill="#effaf3")
    s.line(880, 120, 770, 300, GREEN, 1.5)
    # EtherCAT ring
    s.text(40, 445, "EtherCAT (100 Mbit, distributed clocks, 1 kHz; cable redundancy ring)", 14, INK, weight=700)
    chain = ["Torso junction (8-port)", "Waist yaw", "Waist pitch", "L hip yaw", "L hip roll", "L hip pitch", "L knee", "L ankle A", "L ankle B",
             "R hip yaw", "R hip roll", "R hip pitch", "R knee", "R ankle A", "R ankle B"]
    arms = ["L sh pitch", "L sh roll", "L sh yaw", "L elbow", "L wrist yaw", "L hand ctrl", "R sh pitch", "R sh roll", "R sh yaw", "R elbow", "R wrist yaw", "R hand ctrl",
            "Neck yaw", "Neck pitch", "F/T (opt.)"]
    for row, items in enumerate((chain, arms)):
        y = 480 + row * 120
        for i, n in enumerate(items):
            x = 40 + i * 79
            col = AMBER if row == 0 else BLUE
            s.box(x, y, 72, 44, "", stroke=col, fill="#fff", r=6)
            words = n.split(" ")
            s.text(x + 36, y + 18, " ".join(words[:2]), 10.5, INK, "middle", 600)
            if len(words) > 2:
                s.text(x + 36, y + 33, " ".join(words[2:]), 10.5, INK, "middle", 600)
            if i:
                s.line(x - 7, y + 22, x, y + 22, col, 2)
    s.line(620, 370, 620, 430, AMBER, 2)
    s.line(620, 430, 76, 430, AMBER, 2)
    s.line(76, 430, 76, 480, AMBER, 2, arrow=True)
    s.line(1182, 502, 1220, 502, AMBER, 2)
    s.line(1220, 502, 1220, 622, AMBER, 2)
    s.line(1220, 622, 1182, 622, BLUE, 2)
    s.line(40, 622, 20, 622, BLUE, 2)
    s.line(20, 622, 20, 430, BLUE, 2, "4 3")
    s.text(26, 700, "Ring closes back to the master's 2nd port (cable-break tolerance). 28 slaves; ~0.1 ms frame at 1 kHz. "
                    "Each joint drive also carries two hard-wired STO lines from the safety relay (not shown).", 12, MUTED)
    s.text(26, 722, "Hands: 10 micro-motor channels per hand on one EtherCAT slave (F28P65x). Wrist linear actuators driven by the hand controller.", 12, MUTED)
    s.save("comms_topology.svg")


# --------------------------------------------------------------------------- 4. safety chain
def safety():
    s = SVG(1240, 680, "Safety chain — independent of the AI computer and the real-time controller")
    ins = [("Wireless e-stop", "FORT WES Pro · SIL3 · heartbeat"), ("Wired pendant (tether)", "5 m, dual-contact NC"), ("On-robot stop button", "back of torso, NC"),
           ("Gantry load-cell trip", "test rig only")]
    for i, (n, sub) in enumerate(ins):
        s.box(30, 80 + i * 95, 250, 70, n, sub, stroke=RED, fill="#fff2f1", size=12)
        s.line(280, 115 + i * 95, 380, 250, RED, 2)
    s.box(380, 200, 230, 110, "Dual-channel safety relay", lines=["Pilz PNOZ-class, Cat 3 / PLd", "monitored reset", "2 × NC chains"], stroke=RED, fill="#fff")
    s.box(700, 80, 250, 90, "STO → all 26 drives", lines=["torque removed in < 10 ms", "(drives' SIL3 STO inputs)"], stroke=RED, fill="#fff2f1")
    s.box(700, 220, 250, 90, "Delayed bus disconnect", lines=["SSD opens after 0.5–1.5 s", "(Cat 1: brake/crouch first)"], stroke=RED, fill="#fff2f1")
    s.box(700, 360, 250, 90, "Gantry catch", lines=["harness takes the load", "(mandatory in testing)"], stroke=RED, fill="#fff2f1")
    for y in (125, 265, 405):
        s.line(610, 255, 700, y, RED, 2, arrow=True)
    s.box(380, 420, 230, 150, "Safety MCU (TMS570)", lines=["monitors: tilt > 35°, joint limits,", "winding T > 130 °C, bus V/I,", "RT-controller heartbeat (2 ms),",
                                                              "comms loss > 50 ms", "→ opens relay chain"], stroke=PURPLE, fill="#f6f1ff")
    s.line(495, 420, 495, 310, PURPLE, 2, arrow=True)
    s.box(1000, 80, 210, 90, "BMS", lines=["cell OV/UV/OT/OC", "opens SSD directly"], stroke=AMBER, fill="#fff7ef")
    s.line(1000, 125, 950, 265, AMBER, 2, arrow=True)
    s.box(1000, 360, 210, 120, "Software stops", lines=["Cat 2 controlled stop", "(RT controller): crouch,", "kneel, hold; AI layer can only", "REQUEST motion"], stroke=GREY, fill="#f6f8fa")
    s.text(30, 620, "Stop categories (IEC 60204-1): Cat 0 = STO + disconnect now (falls into the gantry harness during testing); Cat 1 = controlled crouch ≤ 1.5 s then STO; "
                    "Cat 2 = controlled stop, power kept.", 12, MUTED)
    s.text(30, 642, "Nothing in the AI / LLM layer can bypass or delay the chain: it is hard-wired, normally-closed, and the safety MCU and BMS each have independent authority to open it.", 12, MUTED)
    s.save("safety_chain.svg")


# --------------------------------------------------------------------------- 5. software stack
def software():
    s = SVG(1240, 860, "Software architecture — layers, rates and where they run")
    L = [("10 Diagnostics & monitoring", "Foxglove, Prometheus/Grafana, rosbag2/MCAP, health manager", "1–10 Hz", "Thor + laptop", GREY),
         ("9 High-level AI integration", "LLM task planner, VLA policy (GR00T / π0 class), skill API with safety envelope", "0.5–10 Hz", "Thor GPU", PURPLE),
         ("8 Navigation", "Nav2 (footstep-aware), nvblox map, behaviour trees", "5–20 Hz", "Thor", BLUE),
         ("7 Perception", "Isaac ROS cuVSLAM + nvblox, object detection/pose, people tracking, LiDAR odometry (FAST-LIO2)", "15–60 Hz", "Thor GPU", BLUE),
         ("6 Manipulation & grasping", "motion planning (cuRobo/MoveIt 2), grasp synthesis, hand synergies, tactile reflexes", "50–200 Hz", "Thor / RTC", GREEN),
         ("5 Whole-body control", "QP inverse dynamics (TSID/Pinocchio), contact wrench limits, posture tasks", "500 Hz–1 kHz", "RT computer", AMBER),
         ("4 Walking & locomotion", "learned policy (PPO, Isaac Lab / MuJoCo) 50 Hz + MPC/ZMP fallback; footstep planner", "50–500 Hz", "RT computer", AMBER),
         ("3 Balance & state estimation", "contact-aided invariant EKF (IMU + leg kinematics + VIO correction), contact detection", "1 kHz", "RT computer", AMBER),
         ("2 Joint coordination", "trajectory interpolation, limits, linkage maps (knee/ankle/wrist), friction comp., CiA-402", "1 kHz", "RT computer", RED),
         ("1 Low-level motor control", "FOC current loop 20–50 kHz, velocity/position 2–25 kHz, STO, thermal model", "20–50 kHz", "joint drives", RED)]
    for i, (n, d, r, where, c) in enumerate(L):
        y = 70 + i * 74
        s.box(30, y, 820, 62, "", stroke=c, fill="#fff", r=8)
        s.text(46, y + 25, n, 15, INK, weight=700)
        s.text(46, y + 46, d, 12, MUTED)
        s.box(870, y, 140, 62, r, stroke=c, fill="#f6f8fa", size=13)
        s.box(1030, y, 180, 62, where, stroke=c, fill="#f6f8fa", size=13)
    s.text(870, 62, "rate", 12, MUTED)
    s.text(1030, 62, "runs on", 12, MUTED)
    s.line(20, 70 + 4.95 * 74, 1220, 70 + 4.95 * 74, RED, 2, "8 5")
    s.text(24, 70 + 4.95 * 74 - 6, "deterministic boundary: everything below runs on PREEMPT_RT / drives; nothing above may command torques directly", 12, RED, weight=600)
    s.text(30, 830, "Independent safety MCU + hard-wired e-stop chain sit outside all layers (see safety_chain.svg).", 12, MUTED)
    s.save("software_stack.svg")


# --------------------------------------------------------------------------- 6. knee linkage
def knee():
    k = json.loads((ROOT / "data" / "knee_fourbar.json").read_text())
    s = SVG(1240, 700, "Knee four-bar (synthesised) — actuator in upper thigh, variable ratio G(θ) = τ_knee / τ_actuator")
    sc, ox, oy = 1.25, 300, 600   # mm -> px ; knee at (ox, oy)
    A = (k["A"][0] * 1e3, k["A"][1] * 1e3)
    r1, r2, beta, phi0, L = k["r1"] * 1e3, k["r2"] * 1e3, math.radians(k["beta_deg"]), math.radians(k["phi0_deg"]), k["L"] * 1e3

    def P(x, z):
        return ox + x * sc, oy - z * sc
    # thigh
    s.line(*P(0, 0), *P(0, 420), GREY, 14)
    s.circle(*P(*A), 71 * sc, AMBER, "#fff7ef", 2)
    s.text(P(*A)[0] + 95, P(*A)[1], "KA-130K actuator (Ø142)", 13, INK)
    s.circle(*P(0, 420), 10, INK, "#fff", 2)
    s.text(P(0, 420)[0] + 16, P(0, 420)[1] + 4, "hip axis", 12, MUTED)
    cols = [BLUE, GREEN, PURPLE]
    import numpy as np
    th_list = np.array(k["theta_deg"])
    for (deg, col) in zip((0, 60, 120), cols):
        th = math.radians(deg)
        Rm = [[math.cos(th), math.sin(th)], [-math.sin(th), math.cos(th)]]
        u = (r2 * math.cos(beta), r2 * math.sin(beta))
        S = (Rm[0][0] * u[0] + Rm[0][1] * u[1], Rm[1][0] * u[0] + Rm[1][1] * u[1])
        # actuator crank point by continuation (same solver as calc/kestrel/linkages.py)
        import sys as _sys
        _sys.path.insert(0, str(ROOT / "calc"))
        from kestrel.linkages import KneeFourBar
        kb = KneeFourBar(r1 / 1e3, r2 / 1e3, beta, phi0, A=[A[0] / 1e3, A[1] / 1e3])
        ths = np.radians(np.linspace(0, deg, max(2, int(deg) + 1)))
        phis = kb.solve(ths)[0]
        C = (A[0] + r1 * math.cos(phis[-1]), A[1] + r1 * math.sin(phis[-1]))
        shank_end = (Rm[0][1] * -170, Rm[1][1] * -170)
        s.line(*P(0, 0), *P(*shank_end), col, 10)
        s.line(*P(*A), *P(*C), col, 4)
        s.line(*P(*C), *P(*S), col, 3)
        s.line(*P(0, 0), *P(*S), col, 4)
        s.circle(*P(*C), 5, col, "#fff", 2)
        s.circle(*P(*S), 5, col, "#fff", 2)
        s.text(P(*shank_end)[0] + 8, P(*shank_end)[1], f"{deg}°", 13, col, weight=700)
    s.circle(*P(0, 0), 12, INK, "#fff", 2.5)
    s.text(P(0, 0)[0] + 16, P(0, 0)[1] + 18, "knee axis", 12, MUTED)
    s.text(40, 660, f"r1 = {r1:.0f} mm (actuator crank) · rod L = {L:.0f} mm (Ti-6Al-4V 16×2 tube, M12 rod ends) · r2 = {r2:.0f} mm (knee crank) · actuator sweep {k['actuator_sweep_deg']:.0f}°", 12, MUTED)
    # G plot
    gx, gy, gw, gh = 700, 120, 480, 300
    s.box(gx - 50, gy - 40, gw + 80, gh + 90, "", stroke=LINE, fill="#fff")
    s.text(gx, gy - 14, "Transmission ratio G and transmission angle μ vs knee angle", 13, INK, weight=600)
    th = th_list
    G = k["G"]
    mu = k["mu_deg"]
    def X(t): return gx + t / 130 * gw
    def YG(g): return gy + gh - (g - 0.6) / (1.6 - 0.6) * gh
    def YM(m): return gy + gh - m / 180 * gh
    for g in (0.8, 1.0, 1.2, 1.4):
        s.line(gx, YG(g), gx + gw, YG(g), LINE, 1)
        s.text(gx - 8, YG(g) + 4, f"{g:.1f}", 11, MUTED, "end")
    s.poly([(X(t), YG(g)) for t, g in zip(th, G)], AMBER, 3)
    s.poly([(X(t), YM(m)) for t, m in zip(th, mu)], BLUE, 2, dash="6 4")
    for t in (0, 30, 60, 90, 120):
        s.text(X(t), gy + gh + 18, f"{t}°", 11, MUTED, "middle")
    legend(s, gx + 10, gy + gh + 40, [(AMBER, "G (left axis): >1 = torque amplified at the knee"), (BLUE, "μ (0–180°): keep 35–145° where torque is high")])
    s.save("knee_linkage.svg")


# --------------------------------------------------------------------------- 7. ankle
def ankle():
    s = SVG(1100, 620, "Parallel ankle — two calf actuators drive pitch + roll through push-rods")
    sc = 1.15
    ox, oy = 280, 560
    def P(x, z): return ox + x * sc, oy - z * sc
    s.line(*P(0, 75), *P(0, 495), GREY, 14)
    s.circle(*P(-15, 400), 48 * sc, AMBER, "#fff7ef", 2)
    s.circle(*P(-25, 300), 48 * sc, AMBER, "#fff7ef", 2)
    s.text(P(-15, 400)[0] + 70, P(-15, 400)[1], "actuator A (lateral rod)", 12, INK)
    s.text(P(-25, 300)[0] + 70, P(-25, 300)[1], "actuator B (medial rod)", 12, INK)
    s.line(*P(-15, 400), *P(-55, 400), INK, 4)
    s.line(*P(-25, 300), *P(-65, 300), INK, 4)
    s.line(*P(-55, 400), *P(-52, 92), BLUE, 3)
    s.line(*P(-65, 300), *P(-52, 92), GREEN, 3, "6 3")
    s.poly([P(-70, 10), P(190, 10), P(190, 40), P(-70, 40), P(-70, 10)], INK, 2, "#f6f8fa")
    s.circle(*P(0, 75), 10, INK, "#fff", 2.5)
    s.text(P(0, 75)[0] + 14, P(0, 75)[1] - 8, "ankle cross (pitch + roll axes)", 12, MUTED)
    s.circle(*P(-52, 92), 5, INK, "#fff", 2)
    s.text(560, 120, "Kinematics (small angles)", 14, INK, weight=700)
    for i, t in enumerate(["τ_pitch = (F_A + F_B) · r_p,   τ_roll = (F_A − F_B) · d",
                           "F = τ_actuator / r_c",
                           "r_c = 40 mm (actuator crank), r_p = 52 mm (foot lever behind the axis),",
                           "d = 36 mm (half lateral rod spacing)",
                           "Per-actuator torque = r_c ( |τp| / 2r_p + |τr| / 2d )",
                           "Full authority (CoP at toe and at sole edge): ≈ 93 N·m per actuator",
                           "KA-90P: 106 N·m peak, 36 N·m continuous, 16 rad/s",
                           "Why: 2.7 kg of actuators sit high in the calf instead of at the",
                           "ankle → leg swing inertia about the knee drops by ≈ 0.25 kg·m²;",
                           "both motors share pitch load (the large one) and differ for roll."]):
        s.text(560, 150 + i * 24, t, 13, MUTED if i > 1 else INK)
    s.save("ankle_linkage.svg")


# --------------------------------------------------------------------------- 8. battery
def battery():
    s = SVG(1240, 700, "Battery pack 16S6P — layout, series path, protection (two layers of 6 × 8 vertical 21700 cells)")
    for layer in range(2):
        x0, y0 = 40 + layer * 560, 90
        s.text(x0, y0 - 10, f"Layer {layer + 1} (top view) — series groups S{1 + layer * 8}–S{8 + layer * 8}", 13, INK, weight=600)
        for g in range(8):
            for p in range(6):
                cx, cy = x0 + 30 + g * 62, y0 + 30 + p * 52
                s.circle(cx, cy, 22, AMBER, "#fff7ef", 1.5)
            s.text(x0 + 30 + g * 62, y0 + 30 + 6 * 52, f"S{g + 1 + layer * 8}", 12, INK, "middle", 600)
            s.e.append(f"<rect x='{x0 + 8 + g * 62}' y='{y0 + 4}' width='44' height='{6 * 52}' rx='6' fill='none' stroke='{BLUE}' stroke-width='1.5' stroke-dasharray='4 3'/>")
    s.text(40, 470, "Each dashed column = one parallel group (6P, 30 Ah); series links alternate top/bottom; the 16S path snakes S1→S8 in layer 1, rises, and returns S9→S16 in layer 2.", 12, MUTED)
    items = ["Cells: Molicel P50B — 5.0 Ah (4.85 min), 60 A cont, DCIR 12.8 mΩ, ≤71 g. 96 cells = 6.8 kg; pack ≈ 8.9 kg incl. enclosure.",
             "Interconnect: 0.15 mm Ni-plated copper/nickel sandwich strip, resistance-welded; ≤ 10 A per cell normal, 60 A cell rating (≥5× margin at 2.8 kW).",
             "Cell fusing: 0.3 mm Al bond wire or 22 AWG fuse link per cell to the collector (isolates an internally shorted cell).",
             "Thermal-runaway mitigation: 1 mm mica between layers and around groups; vent path to rear grille; NTC on 8 cells + busbars; Al enclosure, PC/ABS inner holders.",
             "BMS: Orion BMS 2 (16 taps + 8 thermistors, CAN). Secondary protection: TI BQ77216 OVP on separate taps → SSD fault input.",
             "Disconnect: TPS48111 back-to-back MOSFET SSD with precharge + 125 A fuse; manual service disconnect accessible through the back door.",
             "Build & test: incoming-inspect every cell (mass, OCV, 1 kHz IR) and match groups within 0.5 % capacity; hi-pot 500 V pack-to-enclosure; IR scan at 1C."]
    for i, t in enumerate(items):
        s.text(40, 510 + i * 24, "• " + t, 12, INK if i == 0 else MUTED)
    s.save("battery_pack.svg")


# --------------------------------------------------------------------------- 9. hand
def hand():
    s = SVG(1100, 660, "Hand actuation map — 10 actuated DOF, linkage-driven (palm-housed micro linear actuators)")
    fingers = [("Index", 3, ["MCP abd", "MCP flex", "PIP+DIP (coupled)"]), ("Middle", 2, ["MCP flex", "PIP+DIP (coupled)"]),
               ("Ring", 1, ["MCP+PIP+DIP coupled"]), ("Little", 1, ["MCP+PIP+DIP coupled"]), ("Thumb", 3, ["CMC rotation", "CMC flex", "MCP+IP coupled"])]
    for i, (n, na, joints) in enumerate(fingers):
        x = 40 + i * 205
        s.box(x, 80, 185, 60, f"{n}  ({na} DOA)", stroke=AMBER, fill="#fff7ef", size=14)
        for j, jn in enumerate(joints):
            s.box(x + 10, 160 + j * 56, 165, 44, jn, stroke=BLUE, fill="#f1f6ff", size=12)
    s.text(40, 360, "Per actuated joint", 14, INK, weight=700)
    rows = ["maxon DCX 10 L (9 V) + GPX 10 planetary + ENX 10 encoder → KSS SR0401K Ø4 × 1 mm ball screw on a miniature guide",
            "→ crossed four-bar to the joint (MCP) or through a proximal-phalanx link (PIP), PIP→DIP coupled by a second four-bar (ILDA pattern)",
            "Sensing: motor encoder + TMAG5273 3D-Hall angle sensor at every MCP + Contactile 3-axis force button (Ø10, 0–20 N) under each fingertip",
            "Overload: ball screw is back-drivable (η ≈ 0.9) so impacts back-drive the motor; spring-detent breakaway in the MCP link; firmware current limit",
            "Targets: fingertip ≥ 10 N (ILDA reference achieved 28–34 N), power grasp ≥ 50 N, full close ≤ 1 s, payload ≥ 5 kg, hand ≤ 1.0 kg",
            "Replaceable fingertips: printed PA12-CF distal core with dovetail + cast Dragon Skin 20 cap; palm AnySkin magnetic tactile patch",
            "Controller: one EtherCAT slave per hand (TI F28P65x + 10× DRV8316 class), placed in the forearm; also drives the 2 wrist linear actuators"]
    for i, t in enumerate(rows):
        s.text(40, 390 + i * 26, "• " + t, 12.5, MUTED)
    s.save("hand_architecture.svg")


# --------------------------------------------------------------------------- 10. test gates
def tests():
    s = SVG(1240, 760, "Progressive commissioning — gates (each must pass before the next)")
    gates = [("G0", "Bench electrical", "power-up behind current-limited supply; EtherCAT ring; STO response < 10 ms", GREY),
             ("G1", "Single actuator on dyno", "Kt, efficiency map, thermal step tests, 10⁵-cycle endurance, backlash/stiffness", RED),
             ("G2", "Limb on bench", "leg/arm clamped at the hip/shoulder; torque & position tracking; joint limits & e-stop", RED),
             ("G3", "Whole robot hanging", "gantry-suspended, feet clear: all joints, sensors, state estimator, safety MCU trips", AMBER),
             ("G4", "Standing, harness slack-taut", "balance controller; push tests ≤ 20 N·s; sit/stand; Cat 0/1 stops caught by harness", AMBER),
             ("G5", "Supported stepping", "in-place steps, weight shift, 0.1–0.3 m/s on flat with harness taking ≥ 10 % load", BLUE),
             ("G6", "Free walking in cage", "0.3 → 0.8 → 1.2 m/s; turns; slopes 5° → 15°; disturbance tests; harness slack", BLUE),
             ("G7", "Stairs & terrain", "0.10 → 0.18 m steps, gravel/mats; step-down trials with spotter catch", GREEN),
             ("G8", "Endurance & thermal", "2 h mixed duty, thermal margins logged; 10 h cumulative walking; inspection teardown", GREEN),
             ("G9", "Manipulation & AI", "pick/place 5 kg; tool use; VLA/LLM skills inside safety envelope; people exclusion zone", PURPLE)]
    for i, (g, n, d, c) in enumerate(gates):
        y = 70 + i * 66
        s.box(30, y, 80, 54, g, stroke=c, fill="#fff", size=16)
        s.box(125, y, 300, 54, n, stroke=c, fill="#f6f8fa", size=14)
        s.text(445, y + 32, d, 12.5, MUTED)
        if i:
            s.line(70, y - 12, 70, y, INK, 1.5, arrow=True)
    s.save("test_gates.svg")


if __name__ == "__main__":
    dof_map(); power(); comms(); safety(); software(); knee(); ankle(); battery(); hand(); tests()
    print("diagrams written:", sorted(p.name for p in HERE.glob("*.svg")))
