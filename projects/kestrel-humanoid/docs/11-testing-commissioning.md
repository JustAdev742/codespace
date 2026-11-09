# 11 — Engineering validation, testing and commissioning (Mk II)

![Test gates](../diagrams/test_gates.svg)

Nothing on KESTREL K1 Mk II is proven until it passes the tests below. Movement is introduced progressively:
restrained → low speed → supported → free → loaded, with independent shutdown at every step. Numbers come from
`docs/generated/` (design mass 112.7 kg, Mk II actuator family, payload scenarios CW, SQ, LM, AH, AO) and R10 §7.

## 1. Gate checklist (sign and date each)

| Gate | Entry condition | Exit criteria (all required) |
|---|---|---|
| G0 Bench electrical | P02 complete | EtherCAT 1 kHz with distributed clocks, 1 h, 0 lost frames; STO < 10 ms from every e-stop device; HC2 external-contactor stop verified; drive-level current limits proven independent of the RT software; safety-MCU trips verified; **pack gate (P06 §G) for both packs and bay gate (P06.1 §G)** passed |
| G1 Actuator | each actuator built | P03/P04/P05 §G tables passed, **including the R10 §7 validation tests of §4.1**; P05.1 jacket tests and P04.1 cycloid measurements passed; P09.1 KW-L2 tests passed; measured Kt, η, R_th, k_L, thermal time constant and backlash fed back into `calc/` and the requirements re-checked |
| G2 Limb | limb assembled on its stand | P07/P09/P10 §G tables passed, including the knee torque-limit table, the leg coolant test and the stand payload cases |
| G3 Hanging | robot assembled, suspended, P08.1 loop filled | every joint, sensor, coolant sensor and estimator verified; Cat 0/1/2 stops tested (logic bus stays up); thermal soak OK; pack swap in STO ≤ 3 min; P12 §G inspection passed |
| G4 Standing | G3 | stand 10 min unassisted (harness slack-taut); recovery from 20 N·s pushes in 4 directions; sit/stand × 20; single-pack standing for 10 min |
| G5 Supported stepping | G4 | 100 steps in place, 50 m at 0.3 m/s with the harness carrying ≥ 10 % load; no falls caught by the harness in the last 20 m |
| G6 Free walking (cage) | G5 | 0.3 → 0.8 → 1.2 m/s; turns; slopes 5° → 15°; 1 h cumulative; harness slack throughout; coolant supply and knee winding logged |
| G7 Stairs & terrain | G6 | 0.10 → 0.18 m steps up/down × 50 each; gravel, mats, cables on the floor; standing pack swap (no STO) × 10 with the harness slack-attached |
| G8 Endurance | G7 | 2 h mixed duty with thermal and coolant margins logged; 10 h cumulative walking; hose-loop fatigue 10⁶ cycles complete; teardown: gears, cycloids, bearings, rod ends, bonds, jacket O-rings, quick-disconnects |
| G9 Manipulation & AI | G8 | 5 kg pick/place × 100; tool use; skill API rejects out-of-envelope requests; people exclusion zones enforced |
| **G10 Payload (Mk II)** | G9 | §7.1 table passed in order: 10 kg per hand at reach, 15 kg one-handed, 30 kg squat, 30 kg carried 20 m at 0.6 m/s, 50 kg momentary lift; post-test flange audit and teardown of one knee and one shoulder |

## 2. Test environment and safe operating limits

* **Cage:** 4 × 3 m mesh panels, foam floor tiles, operator outside with the wireless e-stop on a lanyard. The gantry
  harness is attached from G3 to G5 and slack-attached in G6–G7 and **for every G10 payload test**.
* **Two-person rule** from G3 and for every pack swap. Nobody inside the cage while drives are enabled, and **no
  unrestricted high-torque operation around people** at any stage of this programme.
* **Limits until G6:** torque limits 50 % of the class peak (the gear-limited KH classes at most their repeated ratings,
  the knee additionally by the angle table of P07 §F), speed 50 %, workspace fences in software (base within the cage,
  hands below 1.8 m).
* **HC2 stop function:** the HC2 is custom and its STO is uncertified. Through commissioning (until G6 and a recorded
  STO validation, §5) each leg-zone feed has a DC contactor opened by the safety relay's instantaneous contacts; that
  external chain is the safety function for the knees and hip pitches.
* **E-stop behaviour (docs/05 §8):** STO at t = 0, actuator-zone eFuses open at 0.5–1.5 s, logic bus and coolant pumps
  stay up. The e-stop is not an isolation: for any hands-on work, keyed main switch off and both packs out.
* **Hot swap:** until G6 only with the robot supported and all drives in STO; standing swaps from G7.
* **Coolant:** no powered tests with a known leak; any damp leak pad stops the session; spills on the cage floor are
  cleaned before walking.
* **Abort criteria:** any unexpected noise or smell, temperature above warn, coolant supply > 55 °C or pressure
  < 0.15 bar, estimator divergence, EtherCAT errors > 0 per minute, a pack fault, or a witness mark that has moved. Stop
  and investigate before continuing.

## 3. Structural validation

| What | How | Pass |
|---|---|---|
| Hand calculations | `calc/kestrel/structure.py` ([generated](generated/structure_checks.md)) | all SF ≥ 1.5 (structural case) / ≥ 2.0 (fatigue): **met at the requirement loads**, including the KA-110P 12 × M5 flange (SF 2.35) |
| Design holds | docs/09 §11 H1, H4, H5, H7, H9, H12, H13 | each signed off by the owner **before metal is cut** |
| Knee push-rod at actuator capability | rod force vs knee angle with the P07 §F torque table; rod-end and buckling check over 0–130° | rod force ≤ 12 kN everywhere; rod-end C0 confirmed from the purchased part |
| FEA | pelvis bowl, yokes, hip adapter ring, knee hub, thigh plates, shank fittings, foot plate, ankle cross, limb-interface V-flanges under N/M/X loads (CalculiX/FreeCAD FEM or Fusion); thigh and knee also at the actuator's full capability (≤ 535 N·m at the joint) | von Mises < σy/1.5 (X); < endurance/2 (N); modes > 40 Hz (legs), > 25 Hz (arms) with the heavier Mk II actuators |
| Proof load | each leg on the stand: 1.5 × the structural-case vertical load (1.5 × 2.76 kN ≈ **4.1 kN**) for 30 s, joints locked | no permanent set > 0.05 mm (dial indicators), no bond creep |
| Limb interfaces | V-band fixture: 1.5 × 546 N·m bending, 260 N·m torque (docs/03 §13.1) | no 0.02 mm feeler entry; no slip |
| Bonded joints | coupons: 1.5 × axial + torsion | no failure |
| Fatigue | leg stand, 10⁶ cycles of the walking load profile (≈ 140 h at 2 Hz) on one leg before G8 | no cracks (dye penetrant on Ti and 7075 hot-spots) |
| Drop | the structural case (0.15 m) on the stand with a **113 kg** sled | no yield; actuators may slip their flanges (inspect and re-torque) |
| Payload proof (before G10) | leg stand at the LM case: 81 kg equivalent per leg, slow, 5 cycles | no slip marks, no permanent set |

## 4. Actuator validation (P03–P05, P04.1, P05.1, P09.1 §G)

| Item | Method | Feeds back into |
|---|---|---|
| Joint torque validation | dyno torque vs current across the speed range | `MOTORS` Kt, `ETA` |
| Motor thermal testing | thermal step to steady state; walking-duty replay from `data/scenario_series.npz`; for the KA-130, the jacket R_th and the HC2's 75 A limit (§4.1) | derates; **the jacket thermal resistance is now the critical result** (knee continuous margin with HC2: 263 × 0.84 / 142 ≈ 1.56) |
| Gearbox endurance | 10⁵ cycles (2 × 10⁵ for KA-130) of the scenario torque profile; backlash and efficiency before and after | gear spec, maintenance interval |
| Efficiency map | speed × torque grid, motoring and regenerating | power budget (`calc/kestrel/power.py`) |
| Overload | KA family: rotor locked, 1.1 × momentary on the output; KH cycloids: §4.1 item 6 | flange slip setting, gear rating |
| Drive-level limits | command 2 × the stored limit over EtherCAT | KH classes clamp at 160 / 105 / 23 N·m ± 5 % |

### 4.1 Mk II validation before building more than one (R10 §7)

| # | Test | Where | Method | Pass / feeds back |
|---|---|---|---|---|
| 1 | **FEMM check of KM-130x50-LC** (also KM-115x32-N50 and KM-85x26-N50-4t before their dies) | desk, before ordering laminations and N50UH magnets | 2-D magnetostatic model (docs/13 §3.1): Kt, saturation curve, demagnetisation at peak current and temperature | Kt within ±10 % of 0.224 N·m/A; T_sat near 30 N·m; N50UH demagnetisation margin at 204 A and 120 °C. Update `MOTORS` |
| 2 | **Jacket thermal-resistance dyno test** | P05.1 §G, first on a K1 KM-130x45 stator if available | DC copper loss 100 / 150 / 215 W, 0.5 L/min at 25 °C, winding temperature by resistance | R_th ≤ 0.25 K/W meets the rating; ≤ 0.30 K/W accept and derate by √(0.25 / R_th); > 0.30 reject. Feed F_cool into `actuators.py` |
| 3 | **150 A drive locked-rotor test** | P05 §G on the dyno, test pack as the source, external contactor in circuit | 150 A for 2 s and 99 A for 10 s into the locked output; torque vs current 10–150 A | ≥ 493 / 406 N·m at 150 A; saturation no earlier than modelled; no flange slip; HC2 within rating. Update `T_pk` |
| 4 | **Gear run-in, efficiency, ISO 6336** | P03 / P05 §G | run-in at 25 % then 50 % peak both directions; efficiency map; backlash; ISO 6336 bending and pitting on paper | clean grease, η recorded (replace 0.92), backlash ≤ 10 arcmin, ISO 6336 SF ≥ 1.4 bending / 1.0 pitting at 1.1 × peak |
| 5 | **k_L measurement** | P05 §G (also P03 for the RI motors) | voltage-limited torque–speed curve with the bus held at 52 V | fitted k_L ≥ 0.75; otherwise update `K_L` and re-run `run_all.py` |
| 6 | **Cycloid overload** (C25 and C20) | P04 §G | rotor locked, 250 / 160 N·m on the output through the 1 m arm, 1 s × 3 each direction; backlash, stiffness, efficiency vs speed | lost-motion change < 1 arcmin, no pin or lobe marks, backlash ≤ 7 arcmin, η ≥ 0.80 at rated. Confirms the CYC rating targets in `actuators.py` |
| 7 | **KW-L2 force–speed** | P09.1 §G | confirm the maxon datasheet values; force–speed at 24 V on a test frame with the **1 mm lead** screw | ≥ 754 N for 2 s, ≥ 972 N for 0.2 s, ≥ 132 mm/s at 216 N, 318 N for 60 min with winding ≤ 100 °C |

## 5. Electrical validation

| Item | Method | Pass |
|---|---|---|
| Insulation | 500 V bus → chassis (bond lifted); 1000 V motor windings → stack; repeat bus → chassis after the first coolant fill and after the IPX4 spray | > 10 MΩ / > 100 MΩ |
| Packs | P06 §G for each pack (capacity, balance, 1C thermal, 80 A peak, BMS trips, dead terminals) | as listed |
| Hot-swap power path | P06.1 §G; then docs/05 §14: pull and insert each pack 50 × while walking on the gantry (from G7) | no bus dip below 52 V, no drive under-voltage, no arc marks; interlock refuses unsafe releases |
| Single-pack peak | 3.1 kW from one pack at 20 % SoC on the gantry | sag consistent with 51 mΩ; bus ≥ 52 V; RT power cap engaged |
| Power quality | scope the bus during a W2 replay and an SD drop on the stand in diode mode | bus stays 48–72 V; chopper engages above 70 V |
| eFuses | electronic-load trip per zone | ±10 % |
| **HC2 STO validation** | scope STO_A/STO_B → gate-supply removal and PWM disable → phase current, read-back of both channels, 100 trials; fault-inject one channel | phase current zero < 10 ms; read-back detects every injected fault. Only after this may the commissioning contactors be removed (and not before G6) |
| **E-stop response measurement** | scope from the button contact to phase current zero, for each device; wireless out-of-range timeout; zone eFuse opening at 0.5–1.5 s; logic bus stays up | ≤ 10 ms wired; wireless heartbeat timeout measured and logged (not published by the vendor [R2]) |
| EtherCAT timing | log DC sync error and cycle jitter over 1 h with all 30 slaves | jitter < 20 µs, sync error < 1 µs |
| EMC pre-scan | near-field probe + LISN on the bus during walking; ESD ±8 kV air on exposed metal | no resets, no EtherCAT errors |
| Coolant electrical | leak pads and cable wetted with deionised water; pump stall; flow sensor unplugged | each produces its alarm; HC2 leak trips the chain; pump stall → derate |

## 6. Sensor calibration and validation
See docs/06 §4 for procedures. Validation: walk a 20 m closed loop and compare the estimator against a motion-capture or
total-station reference. Pass: drift < 1 % of distance without vision; < 0.2 % with VIO + LiDAR. Palm cameras:
intrinsics and hand-eye calibration against the wrist F/T flange (≤ 2 mm at 0.3 m).

## 7. Control-system testing (progressive)

| Step | Environment | What is tested |
|---|---|---|
| Software-in-the-loop | MuJoCo with `sim/kestrel_k1.xml` + the RT stack through ros2_control | stand, walk 0.8/1.2 m/s, stairs, pushes, payload scenarios: regression suite before every hardware session |
| Single joint (G1) | dyno | torque, impedance, limits, faults, coolant interlock |
| Single limb (G2) | leg/arm stand | tracking, gravity comp., load cases, linkage maps, knee torque table |
| Balance (G4) | standing, harness | WBC, IEKF, push recovery, controlled stops |
| Supported walking (G5) | harness ≥ 10 % load | ZMP walker first, then the learned policy at 50 % action scale |
| Progressive locomotion (G6–G7) | cage | speed, turns, slopes, stairs, terrain |
| Full-system endurance (G8) | cage | 2 h duty, thermal and coolant margins, inspection |
| Payload (G10) | cage, harness slack-attached | §7.1 |

### 7.1 Mk II payload tests (gate G10)

Run in this order; each row first at 50 % of the mass, then 100 %. The payload is a rigid box with handles on two sides
and a quick-release strap, filled with sandbags in 5 kg steps; **never a person holding or handing over the load while
drives are enabled**; the box is placed on a stand at the start height by the operator with the robot in STO. Catch
table under the box path for the lift tests.

| # | Test (scenario) | Procedure | Pass |
|---|---|---|---|
| P1 | **10 kg per hand at full reach** (AH, AL) | lift 10 kg per hand from hanging to forward horizontal in 0.8 s, hold 60 s | shoulder ≤ 160 N·m (requirement 108 repeated / 90 hold); winding within the thermal model; no gear-limit or flexure alarms |
| P2 | **15 kg one-handed** (AO) | elbow at 90°, 15 kg in one hand, 60 s, then walk 5 m at 0.3 m/s | elbow ≤ 105 N·m limit (requirement 79 repeated, 59 hold); KW-L2 holds wrist pitch (14 N·m) within its I²t; balance maintained |
| P3 | **30 kg squat** (SQ) | squat and rise holding 30 kg at the chest, × 10 | knee within the P07 §F table; waist pitch ≤ 288 N·m repeated; tracking < 3° |
| P4 | **30 kg sustained carry** (CW) | walk 0.6 m/s for 20 m carrying 30 kg at the chest, × 5; then 10 min of repeated pick–carry–place | knee and hip-pitch windings within the model + 10 %; coolant supply ≤ 55 °C; no single-pack event; CoP inside the sole margin |
| P5 | **50 kg momentary lift** (LM) | squat-lift a 50 kg box from thigh height, × 3, harness slack-taut, catch table under the box | waist pitch ≤ 379 N·m and knee ≤ 540 N·m (momentary requirements, logged from current); no flange slip (witness marks); no structural noise |
| P6 | Post-test inspection | flange torque audit; teardown of one knee and one shoulder actuator | no slip, no gear or cycloid marks, no bearing damage |

**Not in the sized scenarios — do not attempt in this programme:** stairs with a 30 kg load (R7 #1 target), one-handed
loads above 15 kg, and any payload test without the harness. Add the scenario to `calc/kestrel/scenarios.py` and re-run
`run_all.py` first.

**Sim-to-real checks:**
- compare measured joint torques (current × Kt) against the inverse-dynamics model for identical motions, including the
  payload cases. Expected agreement ±15 %; investigate anything larger.
- re-identify inertial parameters if the mass of any module deviates > 5 % from `params.py`.

## 8. Failure modes (FMEA summary)

| Failure mode | Effect | Detection | Mitigation |
|---|---|---|---|
| Knee/hip motor overheats in sustained walking or carrying | derate → slow, then Cat 1 stop | winding NTC + jacket-outlet NTC + thermal model | liquid jacket; HC2 75 A continuous limit; system-level thermal derate (docs/05 §13) |
| Coolant leak | loss of cooling; conductive coolant on electronics | loop pressure < 0.15 bar, leak pads and cable, branch ΔT | dry-break couplings, drip lips, drives above and upstream of joints, conformal coat; leak at an HC2 trips the chain; air-only rating 0.64 × (docs/03 §9.6) |
| Pump failure | one leg loses cooling | tach = 0, branch ΔT | check valves isolate the branch; that leg to the air-only rating; finish the task at reduced duty and sit |
| Coolant over-temperature | reduced margins | supply NTC | Thor to 40 W mode at 65 °C, speed limit, trip at 75 °C |
| Cycloid lobe or pin damage on impact | arm position loss, noise | dual-encoder mismatch, flexure torque vs current | drive-level current limits at the repeated rating; collision detection on the flexure |
| KH-14 strain-wave ratcheting | wrist/neck position loss | dual-encoder mismatch | drive limit 23 N·m; momentary rating 2 × repeated |
| Push-rod or rod-end failure | knee/ankle loss of drive → fall | encoder mismatch (actuator vs joint) | angle-dependent knee torque limit (rod ≤ 12 kN); buckling SF; inspection interval; harness during testing |
| Flange slip | joint offset | dual-encoder mismatch; witness marks | slip = overload fuse on the KA family; re-zero + re-torque procedure |
| HC2 STO fault (uncertified) | drive could keep torque after a stop | STO read-back mismatch, FAULT_N | commissioning contactor in each leg-zone feed; safety MCU refuses reset on inconsistent STO |
| EtherCAT cable break | loss of slaves | master WKC error | ring redundancy; Cat 1 stop if the ring is broken in two places |
| Pack cross-current on insertion | cell stress, fuse | INA228, BMS current | DIODE default; tie only at \|ΔV\| < 0.5 V (≤ 4.4 A) |
| Pack pulled under load | arc at 67 V, connector damage | pilot loop, lever switch | fail-locked solenoid with hardware AND; pilot breaks ≥ 2 mm first |
| Single remaining pack overloaded | brown-out, fall | PPM, BMS DCL | single-pack power cap 1.8 kW; swap cap 1.5 kW; interlock refuses a release if the other pack < 54 V |
| Cell internal short / thermal runaway | fire | BMS (dT/dt, voltage), in-pack gas sensor, smoke | per-cell fuse links, mica barriers, fire wall between bays, in-pack FET switch, supervised charging, battery-area storage |
| RT computer crash | loss of control | safety-MCU heartbeat | Cat 1 → STO; harness |
| Estimator divergence | fall | covariance monitor, IMU vs kinematics residual | Cat 1 stop |
| Foot slip | fall | load-cell CoP jump, foot IMU | conservative friction cone (μ = 0.5 assumed vs 1.0 sole); speed limits |
| Payload slip or shift | fall, dropped load | wrist F/T, CoM estimate jump | quick-release strap; harness for every G10 test; catch table |
| Hand overload | finger damage | current | breakaway detents, back-drivable screws, current limits |
| KW-L2 overheating in long one-hand holds | wrist droop | I²t model, current | 1 mm lead (545 N continuous vs 318 N needed); hold-time limit in the skill API |
| AI requests unsafe motion | collision | skill-API envelope check | requests are advisory; envelope enforced in the RT layer |

## 9. Uncertainties and assumptions register

| # | Assumption | Value used | How verified |
|---|---|---|---|
| 1 | Mass growth | +10 % (design 112.7 kg on a 102.5 kg estimate) | weigh modules (P12); re-run `run_all.py` |
| 2 | KM-130x50-LC Kt, saturation | model (R10 §5.1) | FEMM, then dyno (§4.1 items 1, 3) |
| 3 | Jacket thermal resistance | 0.25 K/W (F_cool 2.4) | P05.1 thermal test (§4.1 item 2) |
| 4 | HC2 continuous current | 75 A → 263 / 217 N·m usable continuous (below the 295 / 243 N·m motor rating) | HC2 thermal test on the jacket |
| 5 | Planetary efficiency | 0.92 | dyno |
| 6 | Cycloid efficiency and ratings | 0.85; C25 160 / 250 N·m, C20 105 / 160 N·m (targets) | §4.1 item 6 |
| 7 | Strain-wave efficiency (KH-14) | 0.75 | dyno |
| 8 | Voltage-limited speed factor | k_L = 0.75 (calibrated on a Ø115 TQ motor) | §4.1 item 5 at 42 poles |
| 9 | KW-L2 motor data | maxon catalogue values (98.5 / 540 mN·m, 10,600 rpm) with a 1 mm lead | §4.1 item 7 |
| 10 | Radiator capacity | UA ≈ 20 W/K | loop bench (B131) and P08.1 §G |
| 11 | Rod-end static rating | ≈ 30 kN (unverified) | purchased part datasheet |
| 12 | Gait model | flat-footed ZMP with dynamics filter (conservative knee); learned gait differs | measured torques vs model |
| 13 | Minimum loaded bus | 52 V (3.25 V/cell); 3 V one-pack sag at 59 A | single-pack peak test |
| 14 | Prices | mostly estimate/quote | quotes before ordering |
| 15 | Unverified components | DC-DC bricks, Class T fuse DC rating, pack connector stagger, STO signal levels, HC2 (custom), wireless e-stop response time | datasheets/quotes before design freeze; tests in §5 |

## 10. Reporting
Each gate produces a short report in `logs/gates/Gx.md`: test list, data plots, deviations, decisions, the updated calc
outputs, and the design holds closed. Keep failed attempts too; they are the most valuable data.
