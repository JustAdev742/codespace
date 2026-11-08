# P07 — Legs: hip, thigh with knee four-bar, shank with ankle push-rods, foot

Build the **left leg completely and pass G2 before building the right leg.**

## A. Visual reference
* Hip + knee joint assemblies (ghost): [`renders/09_hip_knee_joints_ghost.png`](../../renders/09_hip_knee_joints_ghost.png)
* Ankle + foot (ghost): [`renders/16_foot_ankle_ghost.png`](../../renders/16_foot_ankle_ghost.png)
* Skeleton rear: [`renders/11_skeleton_rear.png`](../../renders/11_skeleton_rear.png)
* Knee four-bar geometry and G(θ): [`diagrams/knee_linkage.svg`](../../diagrams/knee_linkage.svg), `data/knee_fourbar.json`
* Ankle push-rods: [`diagrams/ankle_linkage.svg`](../../diagrams/ankle_linkage.svg)
* Drawings: `cad/out/drawings/l_hip__yaw_roll_yoke.svg`, `l_hip__roll_pitch_bracket.svg`, `detail__thigh_plate.svg`, `detail__knee_hub.svg`, `l_shank__shank_upper_fitting.svg`, `detail__ankle_cross.svg`, `detail__foot_plate.svg`, `l_thigh__knee_pushrod.svg`

Leg chain (left), with the joint frame origins in the zero pose:

| Joint | Actuator | Location |
|---|---|---|
| hip yaw | KA-90P | pelvis bowl, axis vertical, 75 mm above the hip centre (0, 105, 990 mm) |
| hip roll | KA-110P | axis x through the hip centre, actuator body at x = −118 mm (gluteal) |
| hip pitch | KA-130H | axis y through the hip centre (0, 105, 915), body spans y 61–149 mm |
| knee actuator | KA-130K | axis y at z = 755 (160 mm below the hip) |
| knee joint | — | axis y at z = 495 |
| ankle actuators | 2 × KA-90P | at z = 400 (A, lateral rod) and z = 300 (B, medial rod) |
| ankle cross | — | z = 75; sole at z = 0 |

## B. Parts list (one leg)

| BOM | Item | Qty |
|---|---|---|
| (P03/P05) | KA-90P ×3 (hip yaw, ankle A, ankle B), KA-110P ×1, KA-130H ×1, KA-130K ×1, tested | 6 |
| B065 | Yaw–roll yoke, roll–pitch bracket | 1 + 1 |
| B066 | Thigh plates (medial + lateral), CF tube Ø40 × 2 × 150, end fittings | 1 set |
| B067 | Knee push-rod: Ti-6Al-4V tube 16 × 2, L = 253 mm (pin centres), 2 × M12 PTFE-lined rod ends (one LH thread for length adjustment) | 1 |
| B068 | Actuator crank (r1 = 70 mm), knee crank (r2 = 74 mm at 229° in the shank frame), knee hub with 2 angular-contact bearings, 17-4PH pins | 1 set |
| B069 | Shank upper fitting, CF tube Ø40 × 2 × 230, lower fitting, 2 ankle push-rods (Ti 10 × 1.5) with M8 rod ends, 2 actuator cranks r_c = 40 mm | 1 set |
| B070 | Ankle cross (Ti), 4 × HK1212 needle rollers, 2 × Ø12 17-4PH pins, foot plate, foot levers (r_p = 52 mm, ±36 mm lateral), replaceable NBR sole | 1 set |
| B051 | 4 × load cells + foot board | 1 set |
| B077 | Ankle TPU gaiter | 1 |
| B080 | 2 × 45 mm blowers + MJF duct for the thigh | 1 set |
| B081 | Fasteners: M5 12.9 (KA-130 flanges, 12 + 12), M4 12.9 (KA-110/90), M6 (foot clevis), M3 (shell bosses); Ø6/Ø4 dowels; DP490 structural epoxy | set |

## C. Tools
Torque wrenches (2–25 N·m), dial indicators, height gauge, V-blocks, bonding fixture for the CF tubes (printed alignment jig), digital protractor (0.05°), leg stand (P01).

## D. Manufacturing
* **CF tube bonding (thigh and shank):**
  1. Grit-blast the 7075 fitting bores (Ra 3–5 µm) and abrade the tube ends (P120).
  2. Clean with IPA.
  3. Apply DP490 with a 0.10–0.15 mm bond gap (glass-bead shims in the adhesive), 25 mm engagement.
  4. Hold in the printed alignment jig so the fitting bores are coaxial within 0.05 mm and the clocking is correct.
  5. Cure 24 h, then post-cure at 60 °C for 2 h.
  6. Proof test one coupon per batch (docs/09 §9).
* **Knee push-rod:**
  1. Ti tube, ends bored and tapped M12 (one RH, one LH) 18 mm deep.
  2. Set the length to 253.0 ± 0.1 mm between rod-end ball centres.
  3. Lock with jam nuts at 25 N·m.
* **Foot sole:** cast NBR/PU tread 10 mm in a printed mould, bonded to a 1 mm aluminium carrier screwed to the foot plate (12 × M4), so it can be replaced.

## E. Assembly (left leg)
1. **Hip yaw:** mount KA-90P in the pelvis bowl later (P08). For the leg stand, mount it on the stand carriage plate in the same pattern.
2. **Yaw–roll yoke** onto the hip-yaw output flange: 2 dowels, 8 × M4 12.9 at 4.5 N·m, Loctite 243.
3. **Hip roll actuator** (KA-110P) into the yoke at x = −118 mm, output pointing +x. Base flange 10 × M4 at 4.5 N·m.
4. **Roll–pitch bracket** onto the KA-110P output (dowels, 10 × M4). Check the roll axis passes through the hip centre: dial indicator on a test bar through the KA-130H seat, rotate the roll, runout ≤ 0.1 mm.
5. **Hip pitch actuator** (KA-130H) into the bracket, coaxial with the hip centre, output facing medially. Base 12 × M5 at 8.5 N·m.
6. **Thigh:** medial and lateral plates onto the KA-130H output flange (12 × M5 12.9 at 8.5 N·m, dowels). Fit the CF tube assembly between the plates. Mount the **KA-130K** at z = 755 (thigh frame: 160 mm below the hip axis), output on the lateral side.
7. **Knee hub** between the lower plate ends: angular-contact pair, back-to-back, with 50 N axial preload via a shim stack. The hub must turn with 0.2–0.4 N·m drag and no play.
8. **Shank:** shank upper fitting onto the knee hub (6 × M5 at 8.5 N·m). Mount both ankle actuators on the fitting brackets (A at z = 400 output lateral; B at z = 300 output medial).
9. **Knee four-bar, zero setting:**
   1. Set the knee to 0° (straight) using the Ø4 zero pin through the knee hub and plate.
   2. Command the KA-130K to its zero (output encoder), so the actuator crank sits at **φ0 = 277°** in the thigh frame (pointing almost straight down, slightly forward).
   3. Fit the actuator crank (r1 = 70 mm) on the KA-130K output and the knee crank (r2 = 74 mm) on the knee hub at **229°** in the shank frame.
   4. Install the push-rod and adjust its length (LH/RH thread) until both zero pins slide in freely. Torque the jam nuts.
10. **Check the knee ratio** at 0°, 40°, 80°, 120° by reading the actuator and knee encoders:
    the incremental ratio must match G(θ) in `data/knee_fourbar.json` within ±3 % (0.86 at 20–40°, 1.38 at 100°).
11. **Ankle:**
    1. Ankle cross into the shank lower fitting (pitch pin) and the foot clevis (roll pin), needle rollers greased, pins m6 with retaining screws.
    2. Fit the push-rods from the actuator cranks (r_c = 40 mm) to the foot levers (52 mm behind the axis, ±36 mm lateral).
    3. Zero: foot flat on a surface plate, both ankle actuators at encoder zero, rod lengths adjusted until the foot is level within 0.2° in pitch and roll.
12. **Hard stops:** fit polyurethane bumpers at each joint end of range and check they contact 1–2° before the linkage limits.
13. **Thigh cooling duct:** fit the MJF duct over the KA-130K/H fins, 2 blowers (intake at the knee, exhaust under the pelvis), filter foam.
14. **Foot board** with 4 load cells in the foot plate pockets; sole carrier on top; ankle gaiter.

## F. Electrical
* Leg zone feed: 12 AWG pair from the PDU (eFuse 40 A) through the hip yaw bore. Daisy chain to the 6 drives with XT30 drops (16 AWG).
* EtherCAT order: hip yaw → hip roll → hip pitch → knee → ankle A → ankle B (J-LINK OUT → IN).
* Foot board (load cells + IMU) → ankle A drive's auxiliary I/O or its own EtherCAT slave (design choice; default: an SPI bridge on the ankle A carrier).
* Cable through each actuator's hollow bore with a 30 mm service loop each side, clipped every 80 mm.

## G. Testing (gate G2: leg on the stand)
| Test | Pass |
|---|---|
| Joint zeroing: all six encoders vs zero pins | ±0.05° |
| Range of motion, slow (5 °/s), each joint | full software range, no interference, bumpers contact as designed |
| Kinematics: foot pose vs forward kinematics at 20 poses, measured with a height gauge / tracker | ≤ 1.5 mm |
| Knee ratio check | G(θ) within ±3 % |
| Gravity compensation, leg hanging | holds with < 10 % torque error vs the model |
| **Loaded squat on the stand** (counterweight sets the load to 45 kg, half the design mass), to 90° knee, 20 cycles | tracking error < 2°, temperatures logged, no noise |
| Single-leg stance loading on the stand: 93 kg equivalent for 60 s | KA-130K winding rise matches the dyno model within 10 % |
| Ankle: CoP sweep heel→toe at full load | ankle actuators within 106 N·m; load-cell CoP within ±5 mm of the target |
| Stair-step trajectory replay (`ST` scenario, ×0.5 speed, then ×1.0) | no limit violations, temperatures OK |
| E-stop at each test | joints go limp, the stand catches the load |
