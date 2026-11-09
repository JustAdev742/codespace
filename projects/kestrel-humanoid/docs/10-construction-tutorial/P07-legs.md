# P07 — Legs: hip, thigh with knee four-bar, shank with ankle push-rods, foot, leg coolant lines

Build the **left leg completely and pass G2 before building the right leg.** Before machining any leg part, clear
holds H1, H4, H5, H7 and H9 in [docs/09 §11](../09-manufacturing-package.md): the K1 thigh plate and knee hub cannot
carry the Mk II torques as detailed.

## A. Visual reference
* Hip + knee joint assemblies (ghost): [`renders/09_hip_knee_joints_ghost.png`](../../renders/09_hip_knee_joints_ghost.png)
* Ankle + foot (ghost): [`renders/16_foot_ankle_ghost.png`](../../renders/16_foot_ankle_ghost.png)
* Skeleton rear: [`renders/11_skeleton_rear.png`](../../renders/11_skeleton_rear.png)
* Knee four-bar geometry and G(θ): [`diagrams/knee_linkage.svg`](../../diagrams/knee_linkage.svg), `data/knee_fourbar.json`
* Ankle push-rods: [`diagrams/ankle_linkage.svg`](../../diagrams/ankle_linkage.svg)
* Drawings: `cad/out/drawings/l_hip__yaw_roll_yoke.svg`, `l_hip__roll_pitch_bracket.svg`, `detail__thigh_plate.svg`, `detail__knee_hub.svg`, `l_shank__shank_upper_fitting.svg`, `detail__ankle_cross.svg`, `detail__foot_plate.svg`, `l_thigh__knee_pushrod.svg`
* Leg limb interface, coolant loops through the hip: docs/03 §11 and §13.1

Leg chain (left), with the joint frame origins in the zero pose:

| Joint | Actuator | Location |
|---|---|---|
| hip yaw | KA-90P (stays on the pelvis; the leg detaches at its output, docs/03 §13.1) | pelvis bowl, axis vertical, 75 mm above the hip centre (0, 105, 990 mm) |
| hip roll | KA-110P | axis x through the hip centre, actuator body at x = −118 mm (gluteal) |
| hip pitch | KA-130H (jacketed, ≈ Ø145) | axis y through the hip centre (0, 105, 915) |
| knee actuator | KA-130K (jacketed) | axis y at z = 755 (160 mm below the hip); ≈ 15 mm running clearance to the hip actuator |
| knee joint | — | axis y at z = 495 |
| ankle actuators | 2 × KA-90P | at z = 400 (A, lateral rod) and z = 300 (B, medial rod) |
| ankle cross | — | z = 75; sole at z = 0 |

## B. Parts list (one leg)

| BOM | Item | Qty |
|---|---|---|
| (P03/P05) | KA-90P ×2 (ankle A, B), KA-110P ×1, KA-130H ×1, KA-130K ×1, tested; hip-yaw KA-90P is part of the pelvis (P08) | 5 |
| B065 | Yaw–roll yoke (carries the leg-side V-flange), roll–pitch bracket | 1 + 1 |
| — (docs/03 §13.1) | Leg limb interface: pelvis-side and leg-side V-flanges (Ø70 H7/g6 spigot, 1 round + 1 diamond dowel, face O-ring), 3-segment 17-4PH V-band with a single M8 12.9 T-bolt and spring safety catch, torque-limiting T-handle (10 N·m), blind-mate service plate (power, EtherCAT in/out, STO, leg ID, 2 dry-break couplings) | 1 set |
| B066 | Thigh plates (medial + lateral), CF tube Ø40 × 2 × 150, end fittings; **hip adapter ring with the full 12-hole PCD 105 pattern (hold H4)** | 1 set |
| B067 | Knee push-rod: Ti-6Al-4V, Ø16 × 2 mm section with **solid threaded ends** (see §D), L = 252.9 mm between ball centres; rod ends SKF **SIKAC 12 M** (RH) and **SILKAC 12 M** (LH), PTFE-lined; 2 jam nuts M12 × 1.25 | 1 |
| B068 | Actuator crank (r1 = 70 mm), knee crank (r2 = 73.7 mm at 229.4° in the shank frame) **made integral with the knee hub (hold H5)**, knee bearings per the revised hub drawing | 1 set |
| B069 | Shank upper fitting, CF tube Ø40 × 2 × 230, lower fitting, 2 ankle push-rods (Ti 10 × 1.5 with solid M8 ends) with SKF SIKAC 8 M / SILKAC 8 M rod ends, 2 actuator cranks r_c = 40 mm | 1 set |
| B070 | Ankle cross (Ti-6Al-4V), 4 × INA HK1212 drawn-cup needle bearings, **2 × Ø12 h6 pins in 100Cr6, 60–64 HRC, ground** (not Ti or 17-4PH: hold H13), foot plate, foot levers (r_p = 52 mm, ±36 mm lateral), replaceable NBR sole | 1 set |
| B051 | 4 × load cells + foot board | 1 set |
| B077 | Ankle TPU gaiter | 1 |
| B125, B126 | Coolant: 1 dry-break pair on the service plate (supply + return), 6 mm ID EPDM/Norprene hose ≈ 2.6 m, G1/4 fittings, clamps | 1 set |
| B136 | Service-loop hardware for this leg: hip-pitch C-trough (R85, cable channel above the hose channel), U-loop clip at hip roll, PET braided sleeve, saddle clamps / P-clips, grommets | 1 set |
| B127, B128 | Flow sensor for this leg branch (in the torso, P08.1); NTC probes at the knee-jacket inlet and the hip-jacket outlet | 1 + 2 |
| — | Polyurethane 90A bumpers for every joint end stop; knee stops sized for ≈ 31 J at the actuator (docs/03 §6) | 1 set |
| B081 | Fasteners 12.9: M5 (KA-130 flanges, 12 + 12; KA-110P flanges, 12 + 12), M4 (KA-90P, 8 + 8), M6 (foot clevis, 4), M4 (sole carrier, 12), M3 (shell bosses); Ø6 / Ø4 dowels; HeliCoils; 3M DP490 structural epoxy | set |

## C. Tools
Torque wrenches (1–25 N·m), torque-limiting T-handle for the V-band, dial indicators, height gauge, V-blocks, bonding
fixture for the CF tubes (printed alignment jig), digital protractor (0.05°), leg stand (P01), loop bench with dry-break
halves (P01), hand pump with gauge.

## D. Manufacturing
* **CF tube bonding (thigh and shank):**
  1. Grit-blast the 7075 fitting bores (Ra 3–5 µm) and abrade the tube ends (P120).
  2. Clean with IPA.
  3. DP490 with a 0.10–0.15 mm bond gap (glass-bead shims in the adhesive), 25 mm engagement.
  4. Hold in the printed alignment jig so the fitting bores are coaxial within 0.05 mm and the clocking is correct.
  5. Cure 24 h, then post-cure at 60 °C for 2 h.
  6. Proof-test one coupon per batch (docs/09 §9).
* **Knee push-rod:** a Ø16 × 2 tube has a 12 mm bore, so it cannot be tapped M12 (tap drill 10.2 mm), as K1 specified.
  Machine it from Ø16 Ti-6Al-4V bar instead:
  1. bore Ø12 through the middle, leaving 25 mm solid at each end;
  2. turn M12 × 1.25 male threads, 24 mm long, RH at one end and LH at the other;
  3. stress-relieve (595 °C, 2 h, inert), dye-penetrant inspect;
  4. set the length to 252.9 ± 0.1 mm between rod-end ball centres; lock with the jam nuts at 25 N·m, Loctite 243.
  Ankle push-rods the same way in Ø10 bar with M8 × 1.25 ends (jam nuts 15 N·m).
* **Ankle pins:** 100Cr6, harden 60–64 HRC, grind Ø12 h6, Ra ≤ 0.2; retaining screw groove before hardening.
* **Foot sole:** cast NBR/PU tread 10 mm in a printed mould, bonded to a 1 mm aluminium carrier screwed to the foot
  plate (12 × M4), so it can be replaced.

## E. Assembly (left leg)
1. **Pelvis-side V-flange** onto the hip-yaw KA-90P output (P08), or onto the stand carriage plate in the same pattern:
   2 dowels, 8 × M4 12.9 at 4.5 N·m, Loctite 243.
2. **Leg-side V-flange** onto the yaw–roll yoke (dowels, 12.9 screws at the structural torque).
3. **Hip roll actuator** (KA-110P) into the yoke at x = −118 mm, output pointing +x. **Base flange 12 × M5 12.9 on
   PCD 115 at 8.5 N·m**, Loctite 243 (K1's 10 × M4 base would slip at the Mk II torque).
4. **Roll–pitch bracket** onto the KA-110P output: 2 × Ø6 dowels, **12 × M5 12.9 on PCD 100 at 8.5 N·m**, Loctite 243.
   Check the roll axis passes through the hip centre: dial indicator on a test bar through the KA-130H seat, rotate the
   roll, runout ≤ 0.1 mm.
5. **Hip pitch actuator** (KA-130H) into the bracket, coaxial with the hip centre, output facing medially. Base
   12 × M5 12.9 at 8.5 N·m. Fit the jacket hoses before the thigh goes on (access is lost afterwards).
6. **Thigh** (sequence depends on the detailed CAD, hold H9): hip adapter ring onto the KA-130H output (2 × Ø6 dowels,
   12 × M5 12.9 at 8.5 N·m), thigh plates to the ring, CF tube assembly between the plates, then the **KA-130K** at
   z = 755, output lateral, base 12 × M5 at 8.5 N·m. Torque every screw before the next part blocks its access, and
   witness-mark it.
7. **Knee hub** (crank integral) between the lower plate ends, bearings per the revised hub drawing; set the preload
   with the shim stack so the hub turns with 0.2–0.4 N·m drag and no play.
8. **Shank:** shank upper fitting onto the knee hub (pattern per the revised hub drawing, hold H5). Mount both ankle
   actuators on the fitting brackets (A at z = 400 output lateral; B at z = 300 output medial).
9. **Knee four-bar, zero setting:**
   1. Set the knee to 0° (straight) with the Ø4 zero pin through the knee hub and plate.
   2. Command the KA-130K to its zero (output encoder), so the actuator crank sits at **φ0 = 277.1°** in the thigh frame.
   3. Fit the actuator crank (r1 = 70 mm) on the KA-130K output flange (12 × M5 12.9 at 8.5 N·m, dowels).
   4. Install the push-rod and adjust its length (LH/RH threads) until both zero pins slide in freely. Torque the jam
      nuts.
10. **Check the knee ratio** at 0°, 40°, 80°, 120° from the actuator and knee encoders: the incremental ratio must match
    G(θ) in `data/knee_fourbar.json` within ±3 % (1.33 at 0°, 0.87 at 40°, 1.17 at 80°, 1.43 at 120°).
11. **Ankle:**
    1. Ankle cross into the shank lower fitting (pitch pin) and the foot clevis (roll pin, 4 × M6 12.9 at 14 N·m into
       the foot plate), HK1212 bearings pressed into the cross (Ø18 N6), pins greased, retaining screws with
       Loctite 243.
    2. Fit the push-rods from the actuator cranks (r_c = 40 mm) to the foot levers (52 mm behind the axis, ±36 mm
       lateral).
    3. Zero: foot flat on a surface plate, both ankle actuators at encoder zero, rod lengths adjusted until the foot is
       level within 0.2° in pitch and roll.
12. **Hard stops:** fit the polyurethane bumpers at each joint end of range and check they contact 1–2° before the
    linkage limits. For the knee, put the stops on the **actuator crank** side so the actuator's own torque into a stop
    does not load the push-rod (hard stop at 132° knee).
13. **Coolant and cable routing (docs/03 §11):** supply from the service plate → U-loop behind the hip-roll actuator →
    rolling loop in the C-trough concentric with the hip-pitch axis (radius 85 mm) → **knee jacket first** → back across
    the hip pitch → **hip-pitch jacket** → return to the service plate. The leg cable bundle (§F) follows the same
    loops in the channel above the hoses. Hose bend radius ≥ 30 mm, 10 AWG ≥ 50 mm; clips every 80 mm, grommet at
    every edge, hoses never above an HC2. Fit the knee-inlet and hip-outlet NTCs.
14. **Foot board** with 4 load cells in the foot plate pockets; sole carrier on top; ankle gaiter.

## F. Electrical
* **Leg zone feed:** 10 AWG silicone pair from the PDU leg eFuse (60 A fast / 25 A I²t, docs/05 §5), SurLok Plus 3.6 mm
  at the service plate. **No cable passes through an actuator bore** (docs/03 §11, docs/09 §11 H2): the power pair, the
  EtherCAT/STO J-LINK cables and the HC2 12 V aux run outside the joints in the leg service bundle with the coolant
  hoses, in the cable channel of each loop guide above the hoses, in PET braided sleeve.
* Drops: HC2 (hip pitch, knee) 12 AWG with XT60H, ≤ 0.5 m; Everest (hip roll, ankle A/B) 16 AWG with XT30. HC2 12 V aux
  2 × 20 AWG (Gecko-MT 2-pin).
* EtherCAT order: hip roll → hip pitch → knee → ankle A → ankle B (J-LINK OUT → IN); the hip yaw sits upstream on the
  pelvis.
* Foot board (load cells + IMU) → SPI bridge on the ankle-A carrier (default) or its own EtherCAT slave.
* Cables cross each joint in a service loop with 30 mm slack each side, **strain-relieved by a clamp on the link at
  both fixed points of the loop** (no connector or crimp takes the motion), clipped every 80 mm between joints.
* **Knee torque limit (drive parameter table, interpolated in θ):** τ_act ≤ min(493 N·m, 545 / G(θ), F_rod,max · r2 ·
  |sin μ(θ)| / G(θ)) with F_rod,max = 12 kN (rod end C0 ≈ 30 kN unverified / 2.5). Load the full 2° table from
  `data/knee_torque_limit.json` (generated by `calc/run_all.py`; docs/09 hold H7, resolved).

  | Knee angle | 0° | 20° | 40° | 60° | 80° | 100° | 120° | 130° |
  |---|---|---|---|---|---|---|---|---|
  | G(θ) / transmission angle μ | 1.33 / 152° | 0.86 / 142° | 0.87 / 128° | 0.98 / 112° | 1.17 / 91° | 1.38 / 66° | 1.43 / 36° | 1.18 / 20° |
  | **Actuator limit (N·m)** | **309** | 493 | 493 | 493 | 467 | 395 | **362** | **253** |
  | Joint torque available (N·m) | 410 | 422 | 427 | 484 | 545 | 545 | 517 | 300 |

  Every simulated scenario sits under this table (generated/structure_checks.md): worst the missed-step drop at 1.11,
  stairs 1.26 with the 1.2 margin, deep squat (DS, 125°) 1.90, 50 kg lift (LM) 3.42.

## G. Testing (gate G2: leg on the stand)
| Test | Pass |
|---|---|
| Torque audit: every flange screw re-checked at its set torque after the first powered session | no rotation; witness marks intact |
| Joint zeroing: five leg encoders (plus hip yaw on the stand) vs zero pins | ±0.05° |
| Range of motion, slow (5 °/s), each joint, with hoses and cables fitted | full software range, no interference, no hose kink or rub, bumpers contact as designed |
| Kinematics: foot pose vs forward kinematics at 20 poses (height gauge / tracker) | ≤ 1.5 mm |
| Knee ratio check | G(θ) within ±3 % |
| Knee torque limit: command 493 N·m at 0°, 120° and 130° against a locked foot | measured actuator torque follows the table ±5 % |
| Leg coolant: loop bench on the service-plate couplings, 0.5 L/min, 1.5 bar leak test with the leg cycled through its range 100 × | no leak; flow ≥ 0.45 L/min at every pose; coupling re-mate dry |
| Hose-loop fatigue (start here, continue on the stand; docs/03 §11) | 10⁵ cycles before G4, 10⁶ before G8, no chafe or leak |
| Gravity compensation, leg hanging | holds with < 10 % torque error vs the model |
| Loaded squat on the stand: counterweight sets 57 kg (half the 113.7 kg design mass), to 90° knee, 20 cycles | tracking error < 2°, temperatures logged, no noise |
| **Mk II payload on the stand:** 72 kg equivalent (half of 113.7 kg + 30 kg), 20 squats; 82 kg equivalent (half of 113.7 kg + 50 kg) single slow lift | within the torque table; KA-130 windings within the dyno model + 10 %; no slip marks |
| Single-leg stance loading: 113 kg equivalent for 60 s | KA-130K winding rise within 10 % of the dyno model |
| Ankle: CoP sweep heel → toe at full load | ankle actuators ≤ 129 N·m; load-cell CoP within ±5 mm of the target |
| Stair-step replay (ST scenario, ×0.5 speed, then ×1.0) | no limit violations; temperatures and coolant ΔT logged |
| Leg-zone current log during the ST replay | peak < 60 A, I²t below the eFuse setting |
| Limb interface (docs/03 §13.1): 1.5 × 546 N·m bending, 260 N·m torque on the fixture | no 0.02 mm feeler entry; no slip |
| E-stop at each test | joints go limp (ASC damping on the KA-130), the stand catches the load |
