# P08 — Pelvis, waist, torso frame, battery bay, power distribution and compute

The liquid-cooling loop is built and tested in **P08.1** (below) once the torso and both legs are together.

## A. Visual reference
* Torso internals (K1 layout; Mk II adds the two-pack bay, the radiator in the upper back and the Thor cold plate): [`renders/17_torso_ghost.png`](../../renders/17_torso_ghost.png)
* Skeleton: [`renders/10_skeleton_front.png`](../../renders/10_skeleton_front.png), [`renders/13_exploded_skeleton.png`](../../renders/13_exploded_skeleton.png)
* Drawings: `cad/out/drawings/pelvis__pelvis_bowl.svg`, `torso__spine_plate.svg`
* Power and comms (K1 drawings; Mk II single-line diagram in docs/05 §4.1): [`diagrams/power_architecture.svg`](../../diagrams/power_architecture.svg), [`diagrams/comms_topology.svg`](../../diagrams/comms_topology.svg)
* Battery bay: docs/03 §10; loop layout: docs/03 §9.2; routing through the waist: docs/03 §11

## B. Parts list

| BOM | Item | Qty |
|---|---|---|
| B063 | Pelvis bowl (7075, 5-axis) with an M12 lifting-eye insert | 1 |
| (P03) | KA-90P ×3 (hip yaw ×2 with pelvis-side V-flanges, waist yaw) | 3 |
| (P03) | KA-110P (waist pitch) | 1 |
| B064 | Spine plate, upper/lower ribs, CF closeout panels, battery-bay channels and fire wall, M12 lifting-eye insert on the top rib | 1 set |
| B112, B111, B030 | Battery bay mechanics, robot-side connectors, KES-PPM (built and tested in P06.1) | 1 set |
| (P04) | KH-25 shoulder-pitch actuators | 2 |
| (P04) | KH-14 neck-yaw actuator | 1 |
| B035, B036 | PDU KES-PDU2 (logic / actuator bus split, 7 zone eFuses, brake chopper, telemetry), 2 × 5 Ω 100 W brake resistors | 1 + 2 |
| B033, B034 | DC-DC 24 V 300 W and 12 V 150 W, 36–75 V input (input range must cover 67.2 V + the 70 V clamp: **verify**) | 1 each |
| B038–B040, B124 | Jetson T5000 + J601 carrier + NVMe; liquid cold plate for the Thor module | 1 |
| B041 | UP Squared Pro 7000 (RT computer) | 1 |
| B042, B050 | Safety MCU board + IIM-46230 | 1 |
| B044 | Safety relay with delayed-contact expansion + wired pendant + 2 on-robot buttons | 1 |
| B049 | MicroStrain 3DM-CV7 on a 4-point silicone isolator (pelvis) | 1 |
| B047 | Gemini 335Lg (abdomen, 35° down) | 1 |
| B080 | 2 electronics blowers (RT computer, PDU, DC-DCs) + MJF ducts + filters | 1 set |
| — | Keyed main switch; back-cover switch; commissioning DC contactors for the two leg zones (Gigavac GX11 class, P02 §F) | 1 + 1 + 2 |
| (P06) | Battery packs A and B | 2 |
| B077 | Waist TPU bellows | 1 |
| B081 | Fasteners 12.9: 8 × M4 per KA-90P flange, **12 × M5 per KA-110P flange**, M4/M5 rib screws; dowels; HeliCoils | set |

## C. Tools
As P07, plus thermal paste and pads, crimp tools (XT60H, XT30, SurLok, Gecko-MT, JST GH), a label printer, the gantry
with both M12 lifting eyes fitted.

## D. Manufacturing
* **Pelvis bowl:** 5-axis 7075 with all seats (hip yaw ×2, waist yaw) bored in one setup for relative position
  ≤ 0.02 mm; hard anodise with the seats masked; key-locked M12 insert for the lifting eye.
* **Spine and ribs:** CNC 7075 plates; battery-bay channels with PTFE/POM strips and the keyed T-rail (P06.1 §D); 2 mm
  aluminium + mica fire wall between the bays; CF closeouts cut from 2 mm CF sheet and bonded/screwed.
* **Waist-pitch interface:** the spine plate carries the **12 × M5 PCD 100** pattern and 2 × Ø6 dowel holes for the
  KA-110P output (K1 drawings show 10 × M4 on PCD 85).

## E. Assembly
1. **Pelvis:** fit both hip-yaw KA-90P (outputs down, pelvis-side V-flanges already on) and the waist-yaw KA-90P (output
   up) into the bowl seats: 8 × M4 12.9 at 4.5 N·m each, Loctite 243. Mount the IMU isolator at (−60, 0, +50 mm) from
   the hip-centre midpoint, x-axis forward ±0.5°.
2. **Waist:** yoke onto the waist-yaw output (2 dowels, 8 × M4 12.9 at 4.5 N·m). KA-110P (waist pitch) into the yoke,
   axis y at z = 1085 mm: **base 12 × M5 12.9 on PCD 115 at 8.5 N·m**.
3. **Torso frame:** spine plate onto the waist-pitch output (2 × Ø6 dowels, **12 × M5 12.9 on PCD 100 at 8.5 N·m**,
   Loctite 243, witness marks), then the ribs and bay channels. KH-25 shoulder-pitch actuators on the upper rib at
   y = ±135 mm, outputs outward, axes at z = 1420 mm (8 × M4 at 4.5 N·m). Neck-yaw KH-14 on top.
4. **Battery bay:** install the P06.1 mechanics, floating connectors and KES-PPM; pilot loops and CAN-FD as tested in
   P06.1.
5. **Electronics bay:**
   - Jetson + J601 on the front of the upper ribcage, the module's thermal transfer plate on the liquid cold plate
     (thermal paste); the cold-plate hoses stay capped until P08.1;
   - RT computer and safety MCU on the rear of the spine plate (conduction pad), electronics blower stirring the sealed
     core;
   - PDU, PPM and DC-DCs beside the battery bay, **above and upstream of every coolant joint**, over nothing wet.
6. **Hang the torso** from both M12 lifting eyes in the gantry. **Mount each leg** at its V-band limb interface
   (docs/03 §13.1): leg on its trolley, offer it up axially so the guide pins engage the service plate, close the
   V-band, M8 12.9 T-bolt at 10 N·m with the torque-limiting T-handle, check the spring safety catch.
7. Leave the battery bay empty until P08.1 and §G are complete.

## F. Electrical (docs/05 §5–§9)
* **Actuator-bus zones (PDU eFuses):** leg L / leg R 60 A fast, 25 A I²t, 10 AWG pair (SurLok Plus 3.6 mm), outside the
  joints in the leg service bundle with the coolant hoses: waist clock-spring, waist-pitch U-loop, hip-yaw loop, then
  the service plate (docs/03 §11; no cable passes through an actuator bore); pelvis/waist 20 A, 14 AWG; arm L / arm R
  20 A, 14 AWG via the shoulder service plate and clock-spring cassettes (52 V to the forearm buck); neck 10 A, 16 AWG.
  Commissioning contactors in both leg-zone feeds (P02 §F).
* **Logic bus (not cut by the e-stop):** 24 V 300 W → J601 (XT30, 12 AWG), Mid-360, GMSL camera power through the J601;
  12 V 150 W → RT computer, coolant pumps, radiator fans, blowers, foot boards, HC2 aux, LEDs; safety MCU on its own
  12 V → 3.3 V supply with a 200 ms supercap hold-up.
* **Pack path:** each pack → 8 AWG → KES-PPM channel (SurLok Plus 5.7 mm) → PDU busbar. Keyed main switch to the PPM
  (sheds every path).
* **EtherCAT:** RT computer port 1 → torso junction (passive connector board, not a slave) → waist → left leg → right
  leg → arms → neck → back to port 2, in the same external service loops as the power pairs. **30 slaves** (docs/05 §7):
  22 Everest + 4 HC2 + 2 hand controllers + 2 KW-L2 forearm boards, each its own slave.
* **E-stop chain:** FORT receiver + pendant socket + 2 on-robot buttons + back-cover switch → safety relay (back of the
  spine). Instantaneous contacts → STO_A/STO_B to all 26 drives and the forearm-buck disables; delayed contacts
  (0.5–1.5 s) → actuator-zone eFuse enables. Safety MCU inputs: tilt, winding > 150 °C, bus OV/OC, RT heartbeat, comms
  loss, **leak at any HC2, coolant > 75 °C**.
* **CAN-FD power bus:** BMS A, BMS B (through the pack connectors), PPM MCU, PDU MCU, safety MCU, RT computer; 120 Ω at
  the ends only.
* **Grounding:** BUS− bonded to the chassis only at the PDU star point (10 mm² strap); mask the anodise at the bonding
  pads. Packs carry no chassis bond of their own.

## G. Testing (gate G2/G3 preparation)
| Test | Pass |
|---|---|
| Insulation, bus → chassis with the star bond lifted, 500 V | > 10 MΩ (then refit the bond) |
| Power-up sequence with one pack: pack → PPM inrush → logic bus → DC-DCs → computers → zone eFuse soft starts | rails within ±3 %; no zone powers before its enable; leg zone soft-start ≈ 70 ms |
| Second pack inserted, both tied (P06.1 sequence on the robot) | tie closes only after convergence |
| eFuse trip test per zone with an electronic load | trips at the set current ±10 % |
| Stop sequence: e-stop while the logic bus is loaded | STO at t = 0 (< 10 ms), zone eFuses open at 0.5–1.5 s, commissioning contactors open, logic bus and pumps stay up, no computer reboots |
| EtherCAT: all slaves present, ring redundancy (pull one cable mid-run) | OP state maintained; 1 kHz DC, jitter logged < 20 µs |
| Waist yaw/pitch range with the hoses fitted (after P08.1) | full range, no hose strain, bellows clear |
| Safety MCU trip paths (tilt the torso > 35° in the gantry, kill the heartbeat, wet a leak pad) | Cat 1 sequence then STO; leak trips the chain |

---

# P08.1 — Liquid-cooling loop (pumps, radiator, compensator, lines, quick-disconnects)

Layout, components and arithmetic: docs/03 §9; electrical: docs/05 §13; specification summary: docs/09 §6.2. The loop
is **sealed and fully filled with a spring-diaphragm compensator, no reservoir open to air**, because the robot tilts,
lies down and falls. Loop volume ≈ 0.47 L; torso part ≈ 1.5 kg.

## A. Visual reference
* Loop (docs/03 §9.2):

```
 radiator 240 mm + 2 × 120 mm IP68 fans (upper back, wet duct)
   ↓ outlet (coolest)
 compensator 40 mL @ 0.3 bar + fill/bleed valve + pressure sensor
   ↓
 Thor cold plate
   ↓ split
 pump L ─ check valve ─ supply L ─ waist clock-spring ─ hip-yaw loop ─ QD (limb interface) ─ hip-roll U-loop
        ─ rolling loop across hip pitch ─ KNEE jacket ─ back across hip pitch ─ HIP-PITCH jacket ─ return L ─┐
 pump R ─ check valve ─ supply R ─ (right leg, mirrored) ─────────────────────────────────── return R ─────┤
   ↑ return manifold ←──────────────────────────────────────────────────────────────────────────────────────┘
```

## B. Parts list

| BOM | Item | Qty |
|---|---|---|
| B120 / docs/03 §9.4 | Radiator 240 × 120 mm, ≤ 30 mm core, ≈ 20 W/K, aluminium core (Alphacool NexXxoS ST30 240 class or aluminium equivalent; Koolance HX-720 is heavier) | 1 |
| B121 | 120 mm 12 V PWM fans with tach, **IP68** (San Ace waterproof class) | 2 |
| B119 / docs/03 §9.4 | 12 V brushless pumps, ≥ 0.5 L/min at ≥ 30 kPa, tach, glycol-compatible (TCS Micropumps M510 or Laing DDC class) | 2 + 1 spare |
| B126 | Check valves ≤ 3 kPa cracking, EPDM | 2 |
| B123 | Compensator 40 mL: EPDM membrane in a PA12 housing, spring-loaded, fill/bleed valve (sealed loop, no reservoir) | 1 |
| B126 | Supply and return manifolds (6061) | 2 |
| B124 | Thor liquid cold plate (6061) | 1 |
| B126 | Hose 6 mm ID × 10 mm OD EPDM or Norprene ≈ 6 m, G1/8 / G1/4 fittings with bonded seals, stepless ear clamps, grommets | 1 set |
| B125 | Dry-break non-spill coupling pairs on the two leg service plates (supply + return each) | 4 halves × 2 |
| B127, B128, B130 | 2 flow sensors (one per branch), NTC probes (supply/return per branch), loop pressure sensor 0–2.5 bar | 2 + 4 + 1 |
| B129 | Leak pads (HC2 ×4, pumps, manifold, cold plate) + 1 m leak-sensing cable on the torso floor under every fitting | 1 set |
| B122 | Coolant: 40 % propylene glycol with an aluminium-safe (mixed-metal) inhibitor, premixed with deionised water (DOWFROST or an aluminium-engine OAT coolant at 40 %). Not an insulative PC coolant (docs/03 §9.4) | 1 L (B122 buys 2 L) |
| B136 | Waist clock-spring former and hip-yaw partial clock-springs (cable channel above the hose channel), waist-pitch U-loop clip, PET braided sleeve, clamps | 1 set |

## C. Tools & equipment
Vacuum pump with a gauge reading ≤ 50 mbar and a fill rig (valve, sight tube, coolant container), hand pressure pump
with a 0–4 bar gauge, refractometer (glycol concentration), drip trays and spill kit, smoke pen, the loop bench (P01)
for pre-testing pumps and radiator, a padded table to lay the robot on.

## D. Manufacturing
* **Compensator:** PA12-MJF housing, EPDM membrane, compression spring set for 0.3 bar at half stroke, fill/bleed valve
  in the top; proof-test the housing at 3 bar.
* **Wet duct and radiator shroud:** MJF PA12 in the upper back, fans pulling air through the radiator to the rear
  grille; the duct drains outward.
* **Hose and cable guides (B136):** waist clock-spring former (4 hoses and the two leg cable bundles as a flat ribbon,
  cables on the upper face, 1.5 turns round the waist-yaw housing, inside the bellows); hip-yaw partial clock-spring in
  the pelvis shell; hip-pitch C-trough concentric with the axis at radius 85 mm (PA12-MJF); U-loop clips at waist pitch
  and hip roll. Every guide has a cable channel above the hose channel. Bend radius ≥ 30 mm for hoses and ≥ 50 mm for
  the 10 AWG pairs everywhere.
* **Manifolds:** 6061, anodised, ports for the pumps, check valves, sensors and drains.

## E. Assembly
1. Pre-test both pumps and the radiator on the loop bench: flow–pressure curve of each pump at the branch's ≈ 23 kPa;
   radiator UA with a known heat input.
2. Mount radiator, fans and shroud in the upper-back wet duct; compensator at the radiator outlet; pumps with check
   valves and the manifolds below the electronics, over the leak cable.
3. Connect the Thor cold plate (already on the module, P08 §E step 5).
4. Route the four hoses through the waist on the clock-spring former, then the waist-pitch U-loop, into the pelvis, and
   to the pelvis-side couplings of each limb-interface service plate. The two leg cable bundles (10 AWG pair, EtherCAT,
   STO, HC2 aux; P08 §F) ride the same guides in the channel above the hoses. Clamp the bundle at both fixed points of
   every loop (strain relief), clip every 80 mm, grommet every edge.
5. Mate both legs (P08 §E step 6): the service plates close the couplings.
6. **Dry leak test:** air at 1.5 bar with the pumps isolated, 15 min at stable temperature.
7. **Vacuum fill (docs/03 §9.8):** pull the loop to ≤ 50 mbar through the compensator valve, hold 10 min (rise
   ≤ 5 mbar), then let the premixed coolant in under vacuum so the jacket helices fill without trapped air. Pressurise
   to 0.3 bar.
8. Run both pumps 10 min with the robot laid on each side and on its back (padded table, gantry slack), then upright;
   re-check pressure and top up through the compensator.
9. Check the glycol concentration with the refractometer (40 ± 3 %). Label the fill date.

## F. Electrical (docs/05 §13)
* Pumps on the 12 V logic bus, each on its own PWM high-side switch with current sense and tach into the PDU MCU; fans
  PWM + tach. The logic bus stays up after a stop, so the pumps keep cooling the jackets.
* Flow sensors (I²C), NTCs, pressure sensor, pump tach → PDU MCU; leak pads and the leak cable → PDU MCU **and** the
  safety MCU (a leak at an HC2 trips the stop chain; coolant > 75 °C trips it too).
* Software responses (docs/03 §9.6): pump failure → that leg's KA-130 units to the air-only rating (0.64 ×); pressure
  < 0.15 bar → both legs to the air-only rating and stop at the next safe posture; supply > 65 °C → Thor to its 40 W
  mode, speed limit, then stop.
* Sensor and leak wiring runs above the coolant lines, never below.

## G. Testing (part of gate G3)
| Test | Pass |
|---|---|
| Dry leak test, 1.5 bar air, pumps isolated, 15 min | ≤ 0.01 bar drop |
| Vacuum hold before filling, 10 min at ≤ 50 mbar | rise ≤ 5 mbar |
| Flow per branch at nominal pump speed | 0.5 ± 0.05 L/min each; branches within 10 % of each other |
| Joint-cycling leak test: waist yaw, waist pitch, hip yaw, hip roll and hip pitch through full range, 1,000 cycles, loop at 0.3 bar | pressure steady (± 0.02 bar after temperature correction); no damp on any leak pad; no hose rub |
| Radiator capacity: known heat into the loop (jackets by DC injection, P05.1 method) at 25 °C ambient | UA ≥ 18 W/K (docs/05 §13) |
| Thor at 100 W synthetic load for 30 min, 25 °C ambient | coolant supply ≤ 45 °C; module below its throttle temperature |
| Pump-failure simulation: stop pump L | flow alarm within 2 s; left-leg derate applied; check valve stops back-flow through the stopped branch |
| Leak detection: damp cloth (deionised water) on each pad and on the leak cable | each input reports; HC2 pads trip the chain |
| Coupling re-mate: unmate and re-mate a leg 10 × | ≤ 0.5 mL lost per cycle; compensator absorbs it; 2 bar decay test of the couplings after 100 mates (docs/05 §14) |
