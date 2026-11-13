"""Build the visual S1-Fast build guide from the design data.

    cd projects/kestrel-humanoid
    python scrap/tutorial/s1-fast/make_guide.py

Writes scrap/tutorial/s1-fast/index.html (open it in a browser; its demo clips load from train/runs/s1fast/) and
guide.html (the same page as a fragment for publishing, clips under img/). Parts, drive specs, frame dimensions and
simulated speeds are read from scrap/s1fast/, calc/kestrel/params.py and train/runs/s1fast/, so re-run this after
re-running the selection, the parts list or the training.
"""
from __future__ import annotations

import csv
import html
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJ = HERE.parents[2]
sys.path.insert(0, str(HERE))
os.environ["KESTREL_VARIANT"] = "s1fast"
sys.path.insert(0, str(PROJ / "calc"))

import figures as FG                       # noqa: E402
from kestrel import params as KP           # noqa: E402

D = KP.DIM
FAM = json.loads((PROJ / "scrap/s1fast/data/actuator_family.json").read_text())
BOM = list(csv.DictReader(open(PROJ / "scrap/s1fast/data/bom.csv")))
RANGES = {j: r for j, (_, r, _) in KP.JOINTS_LEFT.items()}


def speed_rows():
    rows = []
    for ln in (PROJ / "train/runs/s1fast/speed.md").read_text().splitlines():
        m = re.match(r"\| ([\d.]+) \| ([\d.]+) \| [\d.]+ \| (\d+)% \| (\d+)% \| (\d+)% \| (yes|\*\*no\*\*) \|", ln)
        if m:
            rows.append((float(m[1]), float(m[2]), int(m[4]) / 100, int(m[5]) / 100))
    return rows


SPEED = speed_rows()
TOP = max((r for r in SPEED if r[2] < 1 and r[3] < 1), key=lambda r: r[1])


def f(c):
    return FAM[c]


JOINTS = {
    "hip_yaw": dict(name="Hip yaw", kind="drill", c="X-HY", what="turns the leg left and right",
                    how="2 drill gearmotors face to face on one rod, Dyneema capstan, 2 cords",
                    red=f"{f('X-HY')['chain']:.1f}:1 · sector radius 36 mm", rng=RANGES["hip_yaw"]),
    "hip_roll": dict(name="Hip roll", kind="drill", c="X-HR", what="swings the leg out to the side",
                     how="2 drill gearmotors face to face on one rod, Dyneema capstan, 2 cords",
                     red=f"{f('X-HR')['chain']:.1f}:1 · sector radius 46 mm", rng=RANGES["hip_roll"]),
    "hip_pitch": dict(name="Hip pitch", kind="hub", c="X-HP", what="swings the leg forward and back",
                      how="2 hub motors → one jackshaft → 3 chains to the thigh", red="14T→32T, then 12T→42T = 8.0:1",
                      rng=RANGES["hip_pitch"]),
    "knee": dict(name="Knee", kind="hub", c="X-KN", what="bends the knee", how="2 hub motors on the thigh → jackshaft → 3 chains to the shank",
                 red="11T→26T, then 11T→36T = 7.74:1", rng=RANGES["knee"]),
    "ankle": dict(name="Ankle", kind="hub", c="X-AN", what="tips the foot (both rods together) and rolls it (rods opposite)",
                  how="1 hub motor per push-rod, 2 per foot, behind the calf", red="18T→26T, then 11T→34T = 4.46:1 to a 40 mm crank",
                  rng=RANGES["ankle_pitch"], extra=f"roll {RANGES['ankle_roll'][0]}…+{RANGES['ankle_roll'][1]}°"),
    "shoulder_pitch": dict(name="Shoulder", kind="drill", c="X-SH", what="swings the arm", how="1 drill gearmotor, capstan",
                           red=f"{f('X-SH')['chain']:.1f}:1 · sector radius 20 mm", rng=RANGES["shoulder_pitch"]),
    "elbow": dict(name="Elbow", kind="drill", c="X-EL", what="bends the elbow", how="1 drill gearmotor, capstan",
                  red=f"{f('X-EL')['chain']:.2f}:1 · sector radius 15 mm", rng=RANGES["elbow"]),
    "battery": dict(name="Battery", kind="batt", what="48 V, about 10 Ah: 52 tested hoverboard cells (13S4P)",
                    how="60 A BMS, 60 A main fuse, 100 A contactor on the e-stop",
                    red="about 1.3 h of walking at 1.0 m/s per charge"),
}
for k, j in JOINTS.items():
    if "c" in j:
        fam = f(j["c"])
        j["motors"] = fam["n_motors"]
        j["torque"] = f"{fam['T_peak_joint']:.0f} N·m"
        j["speed"] = f"{fam['w_noload_joint']:.1f} rad/s"
        j["clutch"] = f"{fam['clutch_Nm']:.1f} N·m" if fam.get("clutch_Nm") else ""
        lo, hi = j["rng"]
        j["range"] = f"{lo}…{'+' if hi > 0 else ''}{hi}°" + (f" · {j['extra']}" if j.get("extra") else "")


def esc(s):
    return html.escape(str(s), quote=False)


def figure(svg, cap, cls=""):
    return f'<figure class="plate-fig {cls}"><div class="scroll">{svg}</div><figcaption>{cap}</figcaption></figure>'


def steps(stage, items):
    out = []
    for i, it in enumerate(items):
        k = f"{stage}.{i}"
        out.append(f'<li><label><input type="checkbox" data-k="{k}" id="c-{k.replace(".", "-")}"><span>{it}</span></label></li>')
    return f'<ol class="steps">{"".join(out)}</ol>'


def check(text):
    return f'<div class="check"><b>Before you move on</b><p>{text}</p></div>'


def warn(text):
    return f'<div class="warn"><b>Careful</b><p>{text}</p></div>'


def chips(items):
    return '<ul class="chips">' + "".join(f"<li>{esc(i)}</li>" for i in items) + "</ul>"


def stage(n, sid, title, time, need, body):
    return (f'<section class="stage" id="{sid}" data-stage="{n}"><header class="stage-h"><span class="num">{n}</span>'
            f'<div><h2>{title}</h2><p class="meta">{time}</p></div></header>'
            + (f'<div class="need"><span>You need</span>{chips(need)}</div>' if need else "") + body + "</section>")


# ------------------------------------------------------------------------------------------------ stages
S = []

S.append(stage(1, "start", "Before you start", "about 2 hours: set up the gantry and read this page", [
    "drill press + 22 mm Forstner bit", "hacksaw", "jigsaw", "files", "tap set M3–M8", "hex keys", "bike chain tool",
    "luggage scale", "multimeter", "soldering iron", "bench supply with a current limit", "a laptop"], f"""
<div class="plate two">
  {figure(FG.gantry(), "Every powered test happens in the gantry, with a second person on the e-stop.", "narrow")}
  <div class="rules">
    <div class="rule"><b>Two people</b><p>One holds the e-stop and does nothing else, from the first powered motion.</p></div>
    <div class="rule"><b>E-stop first</b><p>The e-stop works before any motor is connected. It cuts every motor at once.</p></div>
    <div class="rule"><b>Always in the gantry</b><p>Chest and pelvis straps, rope just slack, for every powered test.</p></div>
    <div class="rule danger"><b>Batteries are the main hazard</b><p>Test every salvaged cell. Charge supervised, on concrete, never overnight.</p></div>
    <div class="rule danger"><b>The joints are strong</b><p>The knee pushes {JOINTS['knee']['torque']}. Fingers out of chains and joints whenever power is on.</p></div>
  </div>
</div>
<p class="lead">S1-Fast is a 1.75 m humanoid with legs driven by <b class="hubt">12 hoverboard hub motors</b> on bike chains,
and hips and arms driven by <b class="drillt">12 cordless-drill gearmotors</b>. Everything is cut with hand tools and a drill
press: no CNC, no 3D printer. Plan on about 220 hours of building, plus 2–4 weeks for parts to arrive.</p>
"""))

# parts
groups = {}
for r in BOM:
    groups.setdefault(r["group"], []).append(r)
rows = []
for g, items in groups.items():
    rows.append(f'<tr class="grp"><th colspan="4">{esc(g)}</th></tr>')
    for i, r in enumerate(items):
        k = f"p.{g}.{i}"
        item = esc(r["item"])
        rows.append(f'<tr><td><input type="checkbox" data-k="{esc(k)}" id="c-{re.sub(r"[^a-z0-9]", "-", k.lower())}" aria-label="have it"></td>'
                    f'<td class="q">{r["qty"]}</td><td>{item}</td>'
                    f'<td class="pr" data-buy="{float(r["buy"]) * int(r["qty"]):.2f}" data-scr="{float(r["scrounge"]) * int(r["qty"]):.2f}">'
                    f'A${float(r["buy"]) * int(r["qty"]):,.0f}</td></tr>')
tot_b = sum(float(r["buy"]) * int(r["qty"]) for r in BOM)
tot_s = sum(float(r["scrounge"]) * int(r["qty"]) for r in BOM)
S.append(stage(2, "parts", "Collect the parts", "2–4 weeks for deliveries; scrounge while you wait", [], f"""
<div class="plate">
  <div class="totals">
    <div class="tot"><span>Buy everything</span><b>A${tot_b:,.0f}</b></div>
    <div class="tot"><span>Scrounge what you can</span><b>A${tot_s:,.0f}</b></div>
    <div class="seg" role="group" aria-label="Price column">
      <button type="button" class="on" data-price="buy" id="price-buy">Buy prices</button>
      <button type="button" data-price="scr" id="price-scr">Scrounge prices</button>
    </div>
  </div>
  <div class="scroll"><table class="parts"><thead><tr><th>Got it</th><th>Qty</th><th>Part</th><th>Cost</th></tr></thead>
  <tbody>{''.join(rows)}</tbody></table></div>
  <div class="tips">
    <div><b>Hoverboards</b><p>Six used ones give the 12 hub motors and most of the 52 battery cells. Broken boards are fine: you only need the motors and the packs.</p></div>
    <div><b>Drills</b><p>Twelve 18 V drills with dead batteries: kerbside collections, tip shops, builders. All the same model if you can.</p></div>
    <div><b>Bike parts</b><p>Old cassettes and chainrings give the 11–18T and 26–42T sprockets. Ask a bike co-op for worn-out bikes.</p></div>
    <div><b>Order online</b><p>12 ODESC V4.2 drives (the biggest cost), BTS7960 H-bridges, MT6701 sensors, ESP32-S3 boards, CAN transceivers, the 60 A BMS.</p></div>
  </div>
</div>
"""))

hp, kn, an = f("X-HP"), f("X-KN"), f("X-AN")
S.append(stage(3, "hubs", "Prepare the hub motors", "about 10 hours for 12 motors", [
    "6 hoverboards", "utility knife", "6 mm aluminium plate", "12 ODESC drives (stage 9)", "luggage scale", "0.5 m bar"], f"""
<div class="plate">
  {figure(FG.hub_prep(), "Cut off the tyre. The axle stays still and is clamped between two plates; the shell is the part that turns. A plate on the side cover carries the small sprocket.")}
  {steps("hubs", [
    "Take the hoverboards apart. Keep the 2 hub motors with their cables (3 thick phase wires, 5 thin hall wires) and the battery pack. The rest can go.",
    "Cut the tyre off with a utility knife. Measure the motor's diameter and width: you need them for the cardboard mock-up in stage 6.",
    "Make 2 axle clamps per motor from 6 mm aluminium: a slot the width of the axle's flats, 2 bolts to close it. Like a scooter fork.",
    "Make the sprocket adapter: a 6 mm aluminium disc drilled to the side cover's 6 screws (the side away from the cable). Bolt the small sprocket to its centre. Use longer screws through the cover.",
    "Set up an ODESC (stage 9) and do the lever test below on every motor."])}
</div>
<div class="plate">
  {figure(FG.lever("hub"), "Lever test: bolt a 0.5 m bar to the adapter plate, rest its end on a luggage scale, and raise the current.")}
  <div class="scroll"><table class="mini"><thead><tr><th>Current</th><th>Expected torque</th><th>Scale reads</th></tr></thead><tbody>
  {''.join(f'<tr><td>{a} A</td><td>{0.48 * a:.1f} N·m</td><td>{0.48 * a / 9.81 / 0.5:.1f} kg</td></tr>' for a in (10, 20, 30, 40, 50))}
  </tbody></table><p class="small">The design assumes 0.48 N·m per amp. Write your figure into <code>scrap/data/actuators.json</code> (<code>hubfoc</code>) and re-run the selection if yours is more than 15 % off.</p></div>
</div>
{check("All 12 motors spin freely with no rubbing and read within 15 % of the table at 50 A.")}
"""))

S.append(stage(4, "chains", "Make the chain drives", "about 30 hours", [
    "bike cassettes and chainrings", "bike chain (about 12 m)", "chain tool", "8 mm steel rod or M8 bolts", "608 bearings", "12 mm plywood"], f"""
<div class="plate">
  <p class="lead">Each hub-motor joint has two chain stages. The motor's small sprocket drives a big one on a <b>jackshaft</b>; a small
  one on the jackshaft drives the big sprocket bolted to the joint. Multiply the two size ratios to get the joint's gearing.</p>
  {figure(FG.drives_all([("Hip pitch", 14, 32, 12, 42, 3, "8.0", 2), ("Knee", 11, 26, 11, 36, 3, "7.74", 2), ("Ankle crank", 18, 26, 11, 34, 1, "4.46", 1)]), "Each drive to the same scale: the motor's small sprocket (top left), the jackshaft (top right), the joint (bottom). Hip pitch " + f"{hp['T_peak_joint']:.0f} N·m, knee {kn['T_peak_joint']:.0f} N·m, ankle {an['T_peak_joint']:.0f} N·m at the crank.")}
  <p class="small">Tooth counts are what the simulation sized; nearby sizes work if you re-run the selection.</p>
</div>
<div class="plate">
  {figure(FG.joint_plan(), "Seen from above. Two motors feed one jackshaft, each through its own first chain, so they share the load. The last stage carries the full joint torque, so it runs 3 chains side by side.")}
  {steps("chains", [
    "Bolt each joint sprocket to the moving link on a plywood or aluminium hub, centred on the joint's 608 bearings.",
    "For 3 chains: bolt 3 identical sprockets together, 3 mm apart with washers. Run 3 chains side by side, all equally tight.",
    "The jackshaft is an 8 mm rod or M8 bolt in two 608 bearings, in slotted plates so you can tension the chains.",
    "Give both motors on a joint exactly the same first-stage sprockets, so they share the load evenly.",
    "Tension every chain to about 5 mm of slack in the middle of its run. Oil them."])}
</div>
{check("With the motors unpowered, turning the joint by hand turns both motors smoothly, with no tight spots and no chain jumping when you push hard on the link.")}
"""))

S.append(stage(5, "drills", "Make the drill joints", "about 25 hours: hip yaw, hip roll, shoulders, elbows", [
    "12 drills", "10 mm steel rod", "3 mm Dyneema cord", "12 mm plywood", "printed sector templates", "luggage scale"], f"""
<div class="plate">
  {figure(FG.capstan(), "The two drills of a hip joint grip the same steel rod from opposite ends. The cord winds on one side of the rod and off the other, turning the plywood sector. No backlash, nothing to machine.")}
  {steps("drills", [
    "Strip each drill: keep the motor, gearbox, clutch ring, chuck and speed selector. Lock the selector in low gear with a screw or epoxy.",
    "Clamp the gearbox between two 12 mm plywood plates bored to its diameter, 4 × M5 bolts, a strap over the motor.",
    "Lever test at the chuck: at 40 A on 18 V expect about 13 N·m (2.7 kg on the scale at 0.5 m) and about 400 rpm unloaded.",
    "Set each clutch ring to slip at the torque in the table, then fix it with a drop of epoxy. The clutch is the fuse that saves the cord.",
    "Print the sector templates at 100 % (check the 50 mm bar), glue them to plywood, drill, jigsaw to the line, file a 3 mm cord groove.",
    "Wind the cord: tie to the first anchor, along the groove, 4–5 turns round the rod, back along the groove to the second anchor. Tighten until it pings."])}
  <div class="scroll"><table class="mini"><thead><tr><th>Joint</th><th>Drills</th><th>Ratio</th><th>Template</th><th>Clutch slips at</th></tr></thead><tbody>
  {''.join(f'<tr><td>{JOINTS[j]["name"]}</td><td>{JOINTS[j]["motors"]}</td><td>{f(JOINTS[j]["c"])["chain"]:.2f}:1</td><td><code>sector_{JOINTS[j]["c"]}.svg</code></td><td>{JOINTS[j]["clutch"]}</td></tr>' for j in ("hip_yaw", "hip_roll", "shoulder_pitch", "elbow"))}
  </tbody></table><p class="small">Templates: <code>scrap/s1fast/templates/</code>. Two-drill joints: reverse one drill in the firmware, since they face each other.</p></div>
</div>
{check("Every drill joint moves through its full range by hand with no rub and no cord slipping on the rod.")}
"""))

S.append(stage(6, "frame", "Build the frame", "about 60 hours", [
    "40 × 40 mm aluminium tube", "25 × 25 × 3 mm aluminium angle", "12 mm plywood", "M5 bolts + nyloc nuts", "cardboard", "bathroom scale"], f"""
<div class="plate">
  {figure(FG.frame_dims(D), "Key dimensions, centre to centre, from the design. The simulation and the walking policy assume these.")}
</div>
<div class="plate">
  {figure(FG.robot_map(D), "Where everything goes. Tap a numbered pin for that joint's drive.", "mapfig")}
  <aside class="spec" id="spec" aria-live="polite"><p class="small">Tap a numbered pin on the drawing.</p></aside>
</div>
<div class="plate">
  {steps("frame", [
    "Cut the thighs and shanks from 40 × 40 mm tube (420 mm centre to centre) and the pelvis and torso ladder from 25 × 25 × 3 mm angle. Square the ends with a file.",
    "Make the joint plates from 12 mm plywood. Each joint turns on 608 bearings: bore a 22 mm seat 7 mm deep with the Forstner bit (a light press fit), M8 bolt as the axle.",
    "<b>Cardboard mock-up first.</b> Cut a cardboard disc and box for every motor at your measured sizes, tape them where the drawing shows, and move every joint through its range. Fix any collision now.",
    "Keep the space between the legs clear: hub motors go on the outside of the hip and thigh, or behind the hip and calf.",
    "Feet: plywood stiffened with aluminium angle, a rubber sole, and 4 microswitches (heel and toe, each side) under it.",
    "Battery and electronics bolt to the torso's back plate, low and central.",
    "Weigh every sub-assembly as you finish it. The design expects about 52 kg in all."])}
  <div class="scroll"><table class="mini"><thead><tr><th>Joint</th><th>Range</th><th>Joint</th><th>Range</th></tr></thead><tbody>
  <tr><td>Hip yaw</td><td>{JOINTS['hip_yaw']['range']}</td><td>Ankle pitch</td><td>{JOINTS['ankle']['range'].split(' · ')[0]}</td></tr>
  <tr><td>Hip roll</td><td>{JOINTS['hip_roll']['range']}</td><td>Ankle roll</td><td>{RANGES['ankle_roll'][0]}…+{RANGES['ankle_roll'][1]}°</td></tr>
  <tr><td>Hip pitch</td><td>{JOINTS['hip_pitch']['range']}</td><td>Shoulder</td><td>{JOINTS['shoulder_pitch']['range']}</td></tr>
  <tr><td>Knee</td><td>{JOINTS['knee']['range']}</td><td>Elbow</td><td>{JOINTS['elbow']['range']}</td></tr>
  </tbody></table><p class="small">Fit a rubber stop at both ends of every range.</p></div>
</div>
{check("Every joint moves through its whole range with every motor and chain fitted, and nothing touches. The robot weighs within 10 % of 52 kg (heavier: re-run the selection with your masses).")}
"""))

S.append(stage(7, "wiring", "Wire it up", "about 25 hours", [
    "12 ODESC drives", "12 BTS7960 H-bridges", "16+ MT6701 sensors + magnets", "TCA9548A multiplexers", "2 ESP32-S3", "CAN transceivers", "120 Ω resistors"], f"""
<div class="plate">
  {figure(FG.wiring(), "Each side of the robot has its own ESP32, its own CAN bus with that leg's 6 hub-motor drives, its 6 drill H-bridges and its angle sensors.")}
  {steps("wiring", [
    "Each hub motor: 3 phase wires to its ODESC, and the 5 hall wires (5 V, ground, A, B, C) to the ODESC's hall input.",
    "Each drill: motor to M+ and M− of a BTS7960, the 18 V bus to B+ and B−, and RPWM, LPWM, R_EN, L_EN to the ESP32. A 1 kΩ resistor from R_IS and L_IS to ground lets the ESP32 read the current.",
    "Each joint: an MT6701 facing a magnet glued to the end of the joint axle. They share one address, so they go through TCA9548A multiplexers.",
    "CAN: one bus per leg, twisted pair, a 120 Ω resistor at each end, 1 Mbit/s.",
    "Label both ends of every cable."])}
</div>
{warn("Do not put all 12 drives on one CAN bus: 500 torque commands a second to each drive would overload it.")}
"""))

S.append(stage(8, "power", "Battery, power and e-stop", "about 15 hours", [
    "52 tested 18650 cells", "13S 60 A BMS", "60 A fuse", "100 A contactor", "e-stop button", "48 → 18 V and 5 V bucks", "54.6 V charger"], f"""
<div class="plate">
  {figure(FG.battery(), "The pack: 13 groups of 4 cells in series.")}
  {steps("power", [
    "Test every cell from the hoverboard packs: reject any below 2.5 V, swollen, dented or warm. Charge to 4.2 V, wait a week, reject any below 4.1 V.",
    "Build 13 groups of 4 matched cells, connect the groups in series, and fit the 13S BMS on the balance wires. Use a 60 A BMS: the legs draw 36 A peaks walking.",
    "Put the pack in a plywood box with a metal liner, low in the torso.",
    "Charge only to 54.6 V, supervised, on a non-flammable surface."])}
</div>
<div class="plate">
  {figure(FG.power(), "The power path. The controllers run from the battery side of the contactor, so an e-stop stops the motors but not the computers.")}
  {steps("power2", [
    "Wire pack → 60 A fuse → 100 A contactor → 48 V bus. The ODESCs go on the 48 V bus with a 25 A fuse and a 2 Ω 50 W brake resistor per pair.",
    "The drills get 18 V from a 48 → 18 V 20 A buck after the contactor.",
    "The contactor coil runs through the latching e-stop button and a transistor the ESP32 keeps switched on (the watchdog).",
    "First power-up from the bench supply at 48 V, 2 A, no motors connected: press the e-stop and check the contactor opens and the ESP32s stay on."])}
</div>
{check("The e-stop stops everything from every state. The resistance from the bus to the frame is over 1 MΩ.")}
"""))

gains = [("Hip yaw", 150, 5), ("Hip roll", 250, 7), ("Hip pitch", 300, 8), ("Knee", 300, 8), ("Ankle pitch", 80, 2.5), ("Ankle roll", 50, 2)]
S.append(stage(9, "software", "Set up the drives and the software", "about 20 hours", [
    "laptop with Python", "odrivetool", "USB cables", "the repository"], f"""
<div class="plate">
  {figure(FG.loops(), "Three loops, each faster than the one above it.")}
  <h3>Each ODESC (once per drive)</h3>
  <div class="code"><button type="button" class="copy" id="copy-odesc">Copy</button><pre id="odesc-cfg"><code>{esc('''# odrivetool, ODrive firmware 0.5.x on the ODESC V4.2. Names follow ODrive's 0.5.x
# hoverboard guide: check them against the firmware your drive shipped with.
odrv0.config.brake_resistance = 2.0
odrv0.config.gpio9_mode = GPIO_MODE_DIGITAL      # hall inputs
odrv0.config.gpio10_mode = GPIO_MODE_DIGITAL
odrv0.config.gpio11_mode = GPIO_MODE_DIGITAL
odrv0.axis0.motor.config.pole_pairs = 15
odrv0.axis0.motor.config.resistance_calib_max_voltage = 4
odrv0.axis0.motor.config.requested_current_range = 60
odrv0.axis0.motor.config.current_control_bandwidth = 100
odrv0.axis0.motor.config.calibration_current = 10
odrv0.axis0.motor.config.current_lim = 50
odrv0.axis0.motor.config.torque_constant = 0.48  # your lever-test figure
odrv0.axis0.encoder.config.mode = ENCODER_MODE_HALL
odrv0.axis0.encoder.config.cpr = 90
odrv0.axis0.encoder.config.calib_scan_distance = 150
odrv0.axis0.encoder.config.bandwidth = 100
odrv0.axis0.controller.config.control_mode = CONTROL_MODE_TORQUE_CONTROL
odrv0.axis0.config.can.node_id = 1               # 1 to 6 on each leg
odrv0.can.config.baud_rate = 1000000
odrv0.save_configuration()''')}</code></pre></div>
  <p class="small">Then calibrate with the motor free to turn: motor calibration, then encoder offset calibration, and set both <code>pre_calibrated</code> flags.</p>
</div>
<div class="plate two">
  <div>
    <h3>The ESP32 firmware does five things</h3>
    {steps("firmware", [
      "Every 2 ms (500 Hz): read each joint's angle (MT6701) and each drill's current.",
      "Hold each joint on its target: torque = kp × (target − angle) − kd × speed, with the gains in the table. Send the torque to the ODESC over CAN, or as PWM to a drill.",
      "Soft limits 3° inside every rubber stop, and a current limit: 50 A per hub motor, 40 A peak and 14 A average per drill.",
      "Watchdog: if one board stops hearing the other or the laptop for 50 ms, it switches off the contactor.",
      "Calibration: hang the robot in the zero pose (legs straight, feet flat, arms down) and record every sensor's offset."])}
  </div>
  <div class="scroll"><table class="mini"><thead><tr><th>Joint</th><th>kp (N·m/rad)</th><th>kd (N·m·s/rad)</th></tr></thead><tbody>
  {''.join(f'<tr><td>{a}</td><td>{b_}</td><td>{c}</td></tr>' for a, b_, c in gains)}
  </tbody></table>
  <p class="small">From <code>train/model.py</code>, the gains the walking policy was trained with. Standing pose: hip −16°, knee +32°, ankle −16°.</p>
  <p class="small">The walking policy is <code>train/runs/s1fast/policy.pt</code>. It runs on the laptop 50 times a second and sends 12 joint targets over USB. It also expects a height map of the ground ahead: on a flat floor, feed it a flat one. Stairs need a depth camera, which is not in the parts list.</p></div>
</div>
"""))

S.append(stage(10, "walk", "Stand, step, walk", "about 30 hours of careful testing", [
    "gantry", "second person on the e-stop", "gait_W0.csv", "the walking policy"], f"""
<div class="plate">
  <ol class="ladder">
    <li><b>Hang</b><span>Feet off the ground. Move each joint slowly to the first row of <code>gait_W0.csv</code>.</span><em>Holds the pose, no shaking</em></li>
    <li><b>Stand</b><span>Feet down, rope taking most of the weight. Crouch to the standing pose.</span><em>5 minutes; motors warm, not hot</em></li>
    <li><b>Shift</b><span>Rope slack. Move the weight from foot to foot with hip roll and ankle roll.</span><em>Stays balanced</em></li>
    <li><b>Step slowly</b><span>Play <code>gait_W0.csv</code> at quarter, half, then full speed. It is balanced at any speed.</span><em>Steps without loading the rope</em></li>
    <li><b>Policy, gently</b><span>Switch to the walking policy at 30 % current limits, commanded 0.3 m/s.</span><em>Rope stays slack</em></li>
    <li><b>Faster</b><span>Raise the command 0.2 m/s at a time, and the current limits back to 100 %.</span><em>Repeatable, no falls into the rope</em></li>
    <li><b>Design speed</b><span>1.0 m/s, the speed the joints were sized for. Past it only with the e-stop in hand.</span><em>You have a walking robot</em></li>
  </ol>
  <p class="small">The scripted motions live in <code>scrap/s1fast/data/</code>. Do not replay <code>gait_W1.csv</code> or <code>gait_W2.csv</code> slower than real time: they balance dynamically and tip over when slowed.</p>
</div>
"""))

results = f"""
<section class="stage" id="results"><header class="stage-h"><span class="num">✓</span><div><h2>What it does in simulation</h2>
<p class="meta">the trained walking policy, with the hub motors' real limits</p></div></header>
<div class="plate two">
  {figure(FG.speed_chart(SPEED), f"Top speed on flat ground: {TOP[1]:.2f} m/s when commanded {TOP[0]:.1f} m/s, with the fastest joint at {TOP[2]:.0%} of its motor's no-load speed and the hottest motor at {TOP[3]:.0%} of its continuous rating.", "narrow")}
  <figure class="plate-fig narrow gif"><img src="@IMG@sprint.gif" alt="S1-Fast walking on flat ground in simulation, commanded {TOP[0]:.1f} metres per second" width="420" height="262" loading="lazy"><figcaption>Commanded {TOP[0]:.1f} m/s on flat ground.</figcaption></figure>
</div>
<div class="plate two">
  <figure class="plate-fig narrow gif"><img src="@IMG@terrain.gif" alt="S1-Fast walking on flat ground and climbing and descending 18 cm stairs in simulation" width="420" height="262" loading="lazy"><figcaption>1.0 m/s on flat ground, then 18 cm stairs up and down.</figcaption></figure>
  <div class="facts">
    <div><b>100 %</b><span>flat ground, 15° slopes and stairs down to 18 cm, at 1.0 m/s</span></div>
    <div><b>88 %</b><span>12.8 cm stairs up · 69 % at 15.4 cm · 50 % at 18 cm</span></div>
    <div><b>1.44 m/s</b><span>Unitree H2's quoted walking pace is about 1.4 m/s</span></div>
    <p class="small">These are simulation results. The chains are modelled as rigid and the motor constants come from one published measurement. Tables: <code>train/runs/s1fast/</code>.</p>
  </div>
</div></section>"""

trouble = """
<section class="stage" id="help"><header class="stage-h"><span class="num">?</span><div><h2>When something goes wrong</h2></div></header>
<div class="scroll"><table class="trouble"><thead><tr><th>What you see</th><th>Likely cause</th><th>Fix</th></tr></thead><tbody>
<tr><td>ODESC calibration fails or the motor stutters</td><td>Hall wires in the wrong order, or the wrong pole-pair count</td><td>Swap two hall signal wires; check pole pairs = 15</td></tr>
<tr><td>A chain jumps a tooth under load</td><td>Too much slack, or the sprockets are not in line</td><td>Re-tension to 5 mm slack; line up the sprockets with a straight edge</td></tr>
<tr><td>A joint shakes when holding a pose</td><td>kp too high, or slack in the chain</td><td>Halve kp, then raise it slowly; take out the slack</td></tr>
<tr><td>Everything cuts out when the robot steps</td><td>BMS overcurrent trip</td><td>Use a 60 A BMS; check the main fuse is 60 A</td></tr>
<tr><td>A drill joint slips in normal walking</td><td>Clutch set too low</td><td>Re-set it on the lever rig to the table value</td></tr>
<tr><td>A motor gets hot</td><td>Holding a crouch too long, or a joint fighting its stop</td><td>Stand straighter between tests; check the soft limits</td></tr>
<tr><td>The two motors of a joint fight each other</td><td>One is reversed, or different sprockets</td><td>Flip one motor's direction in the config; match the first-stage sprockets</td></tr>
</tbody></table></div></section>"""

NAV = [("start", "Before you start"), ("parts", "Collect the parts"), ("hubs", "Hub motors"), ("chains", "Chain drives"),
       ("drills", "Drill joints"), ("frame", "Frame"), ("wiring", "Wiring"), ("power", "Battery and power"),
       ("software", "Drives and software"), ("walk", "Stand, step, walk"), ("results", "Simulation results"), ("help", "Troubleshooting")]
nav = "".join(f'<li><a href="#{a}" data-nav="{a}"><span class="nn">{i + 1 if i < 10 else ("✓" if a == "results" else "?")}</span>'
              f'<span class="nt">{b}</span><span class="np" data-np="{a}"></span></a></li>' for i, (a, b) in enumerate(NAV))

HERO = f"""
<header class="hero">
  <div class="hero-t">
    <p class="eyebrow">KESTREL scrap builds · hand tools only</p>
    <h1>Build S1-Fast</h1>
    <p class="sub">A full-size walking humanoid from six hoverboards, twelve old drills and a pile of bike parts.</p>
    <dl class="stats">
      <div><dt>Height</dt><dd>1.75 m</dd></div><div><dt>Mass</dt><dd>about 52 kg</dd></div>
      <div><dt>Parts</dt><dd>A${tot_s:,.0f}–{tot_b:,.0f}</dd></div><div><dt>Top speed (sim)</dt><dd>{TOP[1]:.2f} m/s</dd></div>
    </dl>
    <p class="progress-line"><span id="prog-n">0</span> of <span id="prog-t">0</span> steps ticked · ticks are kept in this browser</p>
  </div>
  <figure class="hero-g"><img src="@IMG@sprint.gif" alt="S1-Fast walking fast on flat ground in simulation" width="420" height="262"></figure>
</header>"""

CSS = (HERE / "guide.css").read_text()
JS = (HERE / "guide.js").read_text()
JDATA = json.dumps({k: {kk: vv for kk, vv in v.items() if kk not in ("rng",)} for k, v in JOINTS.items()})

BODY = f"""<title>S1-Fast Build Guide</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..800&family=Public+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap">
<style>{CSS}</style>
<div class="wrap">
{HERO}
<div class="layout">
  <nav class="rail" aria-label="Build stages"><ol>{nav}</ol></nav>
  <main>{''.join(S)}{results}{trouble}
  <footer class="foot"><p>Made from the KESTREL design files: parts list <code>scrap/s1fast/generated/bom.md</code>, drives
  <code>scrap/s1fast/generated/actuator_selection.md</code>, full text guide <code>scrap/tutorial/scrap-build-guide.md</code>.
  Re-run <code>scrap/tutorial/s1-fast/make_guide.py</code> after changing the design.</p></footer></main>
</div></div>
<script>window.JOINTS = {JDATA};</script>
<script>{JS}</script>
"""


def main():
    (HERE / "guide.html").write_text(BODY.replace("@IMG@", "img/"))
    full = ("<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" "
            "content=\"width=device-width, initial-scale=1, viewport-fit=cover\"></head><body>\n"
            + BODY.replace("@IMG@", "../../../train/runs/s1fast/").replace("terrain.gif", "demo.gif") + "</body></html>\n")
    (HERE / "index.html").write_text(full)
    print(f"wrote {HERE / 'guide.html'} and index.html; top speed {TOP[1]} m/s, parts A${tot_s:,.0f}-{tot_b:,.0f}")


if __name__ == "__main__":
    main()
