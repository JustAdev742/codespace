# Joint actuator spec sheets (generated)

Joint-side capability after linkages. Peak = actuator peak (motor saturation or drive current, whichever is lower) × ratio × gear efficiency × linkage, capped by the gear's repeated rating for strain-wave and cycloid joints. Continuous = the lower of thermal and the drive's continuous current. Margin = capability / requirement (requirements already include ×1.2 torque and ×1.15 speed margins). Continuous = thermal at the stated derate. Speed = no-load at 52 V minimum bus (field weakening not counted).

## Hip Yaw  (range -30° … 45°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 78 N·m (sim 65 in W2) | 129 N·m | 1.66 |
| Momentary torque (gear/structure must survive) | 78 N·m | output-flange slip: see structure_checks.md | — |
| Continuous torque | 15 N·m (RMS W1/W2/ST 10/15/6) | 44 N·m | 2.96 |
| Static hold | 4 N·m (AO) | ≤ 66 N·m for 60 s | — |
| Speed | 5.0 rad/s (sim 0.2) | 13.1 rad/s no-load | 2.62 |
| Peak mechanical power | 2 W | — | — |

* Actuator class **KA-90P** — motor **RI85-PH** (CubeMars 2026 catalogue), 2-stage planetary 28:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.130 N·m/A rms, R(LL) 138 mΩ, continuous 2.00 N·m, peak 5.0 N·m; drive EV; reflected inertia 0.066 kg·m²; actuator mass ≈ 1.42 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy CubeMars RI85-PH frameless kit; custom housing + 2-stage planetary. Commercial alternative: RobStride RS04 (120 N·m pk, 1.51 kg, CAN → CAN-FD bridge) or MyActuator X8-120 [R9].

## Hip Roll  (range -25° … 45°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 180 N·m (sim 150 in CW) | 427 N·m | 2.37 |
| Momentary torque (gear/structure must survive) | 237 N·m | output-flange slip: see structure_checks.md | — |
| Continuous torque | 79 N·m (RMS W1/W2/ST 66/64/70) | 125 N·m | 1.57 |
| Static hold | 121 N·m (SL) | ≤ 187 N·m for 60 s | — |
| Speed | 4.0 rad/s (sim 0.6) | 5.7 rad/s no-load | 1.42 |
| Peak mechanical power | 53 W | — | — |

* Actuator class **KA-110P** — motor **RI115-PH** (CubeMars 2026 catalogue), 2-stage planetary 29:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.290 N·m/A rms, R(LL) 134 mΩ, continuous 5.50 N·m, peak 16.0 N·m; drive EV; reflected inertia 0.361 kg·m²; actuator mass ≈ 2.96 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy CubeMars RI115-PH frameless kit; custom housing + 2-stage planetary; output flange 12x M5 on PCD 100. Commercial alternative: MyActuator X12-320 [R9].

## Hip Pitch  (range -125° … 30°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 366 N·m (sim 305 in W2) | 435 N·m | 1.19 |
| Momentary torque (gear/structure must survive) | 366 N·m | output-flange slip: see structure_checks.md | — |
| Continuous torque | 100 N·m (RMS W1/W2/ST 58/104/18) | 232 N·m | 2.33 |
| Static hold | 83 N·m (AH) | ≤ 348 N·m for 60 s | — |
| Speed | 9.8 rad/s (sim 8.5) | 14.2 rad/s no-load | 1.45 |
| Peak mechanical power | 1219 W | — | — |

* Actuator class **KA-130H** — motor **KM-130x50-LC** (R10 Mk II: Ø130 die, 50 mm stack, N50UH, 3t x 2p, liquid jacket; T_pk @150 A), 2-stage planetary 15:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.224 N·m/A rms, R(LL) 20 mΩ, continuous 18.85 N·m, peak 31.5 N·m; drive HC2; reflected inertia 0.311 kg·m²; actuator mass ≈ 4.83 kg [est].
* Thermal: continuous rating at derate 1.00 (liquid jacket; also capped by the HC2 drive at 75 A continuous); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — same KA-130K2 hardware as the knee (one part number for 4 joints). Commercial alternative: MyActuator X12-320 (320 N·m pk, 2.37 kg, EtherCAT) [R9]; below the Mk II hip peak.

## Knee  (range 0° … 130°)

*Knee margin is the envelope margin: min over every simulated sample of capability-at-that-angle / (1.2 × demand). The by-angle minimum (415 N·m) occurs at 20–40°, where demands are lower.*

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 435 N·m (sim 362 in ST) | 415 N·m at 20–40° … 719 N·m at 110° (by angle) | 1.43 |
| Momentary torque (gear/structure must survive) | 540 N·m | output-flange slip: see structure_checks.md | — |
| Continuous torque | 143 N·m (RMS W1/W2/ST 119/147/178) | 222 N·m | 1.55 |
| Static hold | 156 N·m (SL) | ≤ 332 N·m for 60 s | — |
| Speed | 9.2 rad/s (sim 8.0) | 14.9 rad/s no-load | 1.62 |
| Peak mechanical power | 647 W | — | — |

* Actuator class **KA-130K** — motor **KM-130x50-LC** (R10 Mk II: Ø130 die, 50 mm stack, N50UH, 3t x 2p, liquid jacket; T_pk @150 A), 2-stage planetary 17:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: four-bar, G = 0.84–1.46 (see knee_linkage.svg).
* Motor: Kt 0.224 N·m/A rms, R(LL) 20 mΩ, continuous 18.85 N·m, peak 31.5 N·m; drive HC2; reflected inertia 0.400 kg·m²; actuator mass ≈ 4.96 kg [est].
* Thermal: continuous rating at derate 1.00 (liquid jacket; also capped by the HC2 drive at 75 A continuous); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — KA-130K2: custom KM-130x50-LC motor (N50UH, 50 mm stack, liquid jacket) + custom 2-stage planetary + HC2 150 A GaN drive. Commercial alternative: MyActuator X15-450 (450 N·m pk, 3.5 kg, rated at 72 V — ~25 % slower at 59 V); test mules only, below the Mk II continuous duty.

## Ankle Pitch  (range -45° … 45°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 212 N·m (sim 80 in W2) | 335 N·m (pure pitch) | 1.58 |
| Momentary torque (gear/structure must survive) | 302 N·m | output-flange slip: see structure_checks.md | — |
| Continuous torque | 26 N·m (RMS W1/W2/ST 21/22/21) | 114 N·m | 4.45 |
| Static hold | 40 N·m (AO) | ≤ 171 N·m for 60 s | — |
| Speed | 7.9 rad/s (sim 6.9) | 10.1 rad/s no-load | 1.28 |
| Peak mechanical power | 119 W | — | — |

* Actuator class **KA-90P** — motor **RI85-PH** (CubeMars 2026 catalogue), 2-stage planetary 28:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: 2 push-rods, r_c 40 / r_p 52 mm (shared with roll).
* Motor: Kt 0.130 N·m/A rms, R(LL) 138 mΩ, continuous 2.00 N·m, peak 5.0 N·m; drive EV; reflected inertia 0.066 kg·m²; actuator mass ≈ 1.42 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy CubeMars RI85-PH frameless kit; custom housing + 2-stage planetary. Commercial alternative: RobStride RS04 (120 N·m pk, 1.51 kg, CAN → CAN-FD bridge) or MyActuator X8-120 [R9].

## Ankle Roll  (range -25° … 25°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 61 N·m (sim 19 in CW) | 232 N·m (pure roll) | 3.79 |
| Momentary torque (gear/structure must survive) | 61 N·m | output-flange slip: see structure_checks.md | — |
| Continuous torque | 5 N·m (RMS W1/W2/ST 4/5/4) | 79 N·m | 14.79 |
| Static hold | 3 N·m (AO) | ≤ 118 N·m for 60 s | — |
| Speed | 4.0 rad/s (sim 0.6) | 14.6 rad/s no-load | 3.65 |
| Peak mechanical power | 8 W | — | — |

* Actuator class **KA-90P** — motor **RI85-PH** (CubeMars 2026 catalogue), 2-stage planetary 28:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: 2 push-rods, half spacing d 36 mm (shared with pitch).
* Motor: Kt 0.130 N·m/A rms, R(LL) 138 mΩ, continuous 2.00 N·m, peak 5.0 N·m; drive EV; reflected inertia 0.066 kg·m²; actuator mass ≈ 1.42 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy CubeMars RI85-PH frameless kit; custom housing + 2-stage planetary. Commercial alternative: RobStride RS04 (120 N·m pk, 1.51 kg, CAN → CAN-FD bridge) or MyActuator X8-120 [R9].

## Waist Yaw  (range -70° … 70°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 60 N·m (sim 48 in W2) | 129 N·m | 2.15 |
| Momentary torque (gear/structure must survive) | 60 N·m | output-flange slip: see structure_checks.md | — |
| Continuous torque | 22 N·m (RMS W1/W2/ST 14/23/7) | 44 N·m | 1.96 |
| Static hold | 14 N·m (AO) | ≤ 66 N·m for 60 s | — |
| Speed | 4.0 rad/s (sim 0.0) | 13.1 rad/s no-load | 3.28 |
| Peak mechanical power | 0 W | — | — |

* Actuator class **KA-90P** — motor **RI85-PH** (CubeMars 2026 catalogue), 2-stage planetary 28:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.130 N·m/A rms, R(LL) 138 mΩ, continuous 2.00 N·m, peak 5.0 N·m; drive EV; reflected inertia 0.066 kg·m²; actuator mass ≈ 1.42 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy CubeMars RI85-PH frameless kit; custom housing + 2-stage planetary. Commercial alternative: RobStride RS04 (120 N·m pk, 1.51 kg, CAN → CAN-FD bridge) or MyActuator X8-120 [R9].

## Waist Pitch  (range -15° … 75°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 287 N·m (sim 239 in SQ) | 427 N·m | 1.49 |
| Momentary torque (gear/structure must survive) | 378 N·m | output-flange slip: see structure_checks.md | — |
| Continuous torque | 17 N·m (RMS W1/W2/ST 13/18/8) | 125 N·m | 7.14 |
| Static hold | 175 N·m (AH) | ≤ 187 N·m for 60 s | — |
| Speed | 1.5 rad/s (sim 1.3) | 5.7 rad/s no-load | 3.77 |
| Peak mechanical power | 135 W | — | — |

* Actuator class **KA-110P** — motor **RI115-PH** (CubeMars 2026 catalogue), 2-stage planetary 29:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.290 N·m/A rms, R(LL) 134 mΩ, continuous 5.50 N·m, peak 16.0 N·m; drive EV; reflected inertia 0.361 kg·m²; actuator mass ≈ 2.96 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy CubeMars RI115-PH frameless kit; custom housing + 2-stage planetary; output flange 12x M5 on PCD 100. Commercial alternative: MyActuator X12-320 [R9].

## Shoulder Pitch  (range -180° … 60°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 108 N·m (sim 90 in CW) | 160 N·m (gear-limited; motor 362) | 1.48 |
| Momentary torque (gear/structure must survive) | 136 N·m | gear momentary 250 N·m | — |
| Continuous torque | 26 N·m (RMS W1/W2/ST 15/27/8) | 119 N·m | 4.54 |
| Static hold | 90 N·m (AH) | ≤ 178 N·m for 60 s | — |
| Speed | 6.2 rad/s (sim 5.4) | 6.3 rad/s no-load | 1.02 |
| Peak mechanical power | 288 W | — | — |

* Actuator class **KH-25** — motor **KM-115x32-N50** (R10 KA-115R: N50UH, 3t; T_pk @60 A), C25 machined two-disc cycloid 30:1 (custom; ratings are dyno-validation targets, R10), gear efficiency 0.85 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.252 N·m/A rms, R(LL) 70 mΩ, continuous 5.49 N·m, peak 14.2 N·m; drive EV; reflected inertia 0.494 kg·m²; actuator mass ≈ 2.60 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — KH-C25: custom KM-115x32-N50 motor + machined two-disc cycloid C25 (ratings are dyno-validation targets). Commercial alternative: MyActuator RH-25 (157 N·m pk, 2.42 kg) [ds R1]; below the Mk II 10 kg-at-reach hold.

## Shoulder Roll  (range -15° … 160°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 58 N·m (sim 48 in AS) | 160 N·m (gear-limited; motor 362) | 2.77 |
| Momentary torque (gear/structure must survive) | 58 N·m | gear momentary 250 N·m | — |
| Continuous torque | 4 N·m (RMS W1/W2/ST 3/4/3) | 119 N·m | 29.18 |
| Static hold | 0 N·m (AO) | ≤ 178 N·m for 60 s | — |
| Speed | 6.0 rad/s (sim 3.7) | 6.3 rad/s no-load | 1.05 |
| Peak mechanical power | 144 W | — | — |

* Actuator class **KH-25** — motor **KM-115x32-N50** (R10 KA-115R: N50UH, 3t; T_pk @60 A), C25 machined two-disc cycloid 30:1 (custom; ratings are dyno-validation targets, R10), gear efficiency 0.85 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.252 N·m/A rms, R(LL) 70 mΩ, continuous 5.49 N·m, peak 14.2 N·m; drive EV; reflected inertia 0.494 kg·m²; actuator mass ≈ 2.60 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — KH-C25: custom KM-115x32-N50 motor + machined two-disc cycloid C25 (ratings are dyno-validation targets). Commercial alternative: MyActuator RH-25 (157 N·m pk, 2.42 kg) [ds R1]; below the Mk II 10 kg-at-reach hold.

## Shoulder Yaw  (range -90° … 100°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 30 N·m (sim 7 in CW) | 105 N·m (gear-limited; motor 158) | 3.50 |
| Momentary torque (gear/structure must survive) | 30 N·m | gear momentary 160 N·m | — |
| Continuous torque | < 1 N·m | 44 N·m | — |
| Static hold | 0 N·m (AO) | ≤ 65 N·m for 60 s | — |
| Speed | 6.0 rad/s (sim 0.0) | 8.6 rad/s no-load | 1.43 |
| Peak mechanical power | 0 W | — | — |

* Actuator class **KH-20** — motor **KM-85x26-N50-4t** (R10 KH-C25), C20 machined two-disc cycloid 30:1 (custom; ratings are dyno-validation targets, R10), gear efficiency 0.85 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.186 N·m/A rms, R(LL) 146 mΩ, continuous 2.01 N·m, peak 6.2 N·m; drive EV; reflected inertia 0.107 kg·m²; actuator mass ≈ 1.63 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — KH-C20: custom KM-85x26-N50-4t motor + machined two-disc cycloid C20 (ratings are dyno-validation targets). Commercial alternative: MyActuator RH-20 (80 N·m pk, 1.45 kg) [ds R1].

## Elbow  (range -145° … 0°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 79 N·m (sim 66 in SQ) | 105 N·m (gear-limited; motor 158) | 1.32 |
| Momentary torque (gear/structure must survive) | 115 N·m | gear momentary 160 N·m | — |
| Continuous torque | 7 N·m (RMS W1/W2/ST 4/7/3) | 44 N·m | 6.39 |
| Static hold | 59 N·m (AO) | ≤ 65 N·m for 60 s | — |
| Speed | 7.0 rad/s (sim 4.3) | 8.6 rad/s no-load | 1.23 |
| Peak mechanical power | 161 W | — | — |

* Actuator class **KH-20** — motor **KM-85x26-N50-4t** (R10 KH-C25), C20 machined two-disc cycloid 30:1 (custom; ratings are dyno-validation targets, R10), gear efficiency 0.85 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.186 N·m/A rms, R(LL) 146 mΩ, continuous 2.01 N·m, peak 6.2 N·m; drive EV; reflected inertia 0.107 kg·m²; actuator mass ≈ 1.63 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — KH-C20: custom KM-85x26-N50-4t motor + machined two-disc cycloid C20 (ratings are dyno-validation targets). Commercial alternative: MyActuator RH-20 (80 N·m pk, 1.45 kg) [ds R1].

## Wrist Yaw  (range -90° … 90°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 12 N·m (sim 0 in AF) | 23 N·m (gear-limited; motor 34) | 1.92 |
| Momentary torque (gear/structure must survive) | 12 N·m | gear momentary 46 N·m | — |
| Continuous torque | < 1 N·m | 9 N·m | — |
| Static hold | 0 N·m (AO) | ≤ 13 N·m for 60 s | — |
| Speed | 8.0 rad/s (sim 0.0) | 9.0 rad/s no-load | 1.12 |
| Peak mechanical power | 0 W | — | — |

* Actuator class **KH-14** — motor **KM-50x20** (motor_design.py (calibrated)), CSG-14-50 strain-wave (Leaderdrive LHSG equivalent), gear efficiency 0.75 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.106 N·m/A rms, R(LL) 865 mΩ, continuous 0.28 N·m, peak 0.9 N·m; drive EV; reflected inertia 0.028 kg·m²; actuator mass ≈ 0.68 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — custom KM-50x20 motor (or a verified 50 mm frameless kit) + size-14 strain-wave set. Commercial alternative: CubeMars AK45-36 (24 N·m pk, 0.35 kg, 24 V — on the Mk II 24 V rail) [R9].

## Wrist Pitch  (range -70° … 70°)

Actuation (Mk II **KW-L2**, docs/04 and R10 sec. 5.9): two parallel ball-screw linear actuators, each a flat brushless motor on the 24 V rail driving a Ø6 × **1 mm-lead** ball screw, on lever arms r_p = 22 mm / d = 16 mm. Required force per actuator at the combined corner ≈ 754 N; speed ≈ 132 mm/s. The K1 DCX 16 L on the 12 V rail (≈ 359 N stall) does not meet this, and with the Mk II 10 kg-per-hand load a 2 mm lead would need 2.8–3.6× the motor's rated torque, hence the 1 mm lead (docs/08). Requirement: 19 N·m repeated, 6.0 rad/s. Build class: **modify** (buy motor/screw, custom housing). Validate force and speed on the bench (docs/11).

## Wrist Roll  (range -35° … 35°)

Actuation (Mk II **KW-L2**, docs/04 and R10 sec. 5.9): two parallel ball-screw linear actuators, each a flat brushless motor on the 24 V rail driving a Ø6 × **1 mm-lead** ball screw, on lever arms r_p = 22 mm / d = 16 mm. Required force per actuator at the combined corner ≈ 754 N; speed ≈ 132 mm/s. The K1 DCX 16 L on the 12 V rail (≈ 359 N stall) does not meet this, and with the Mk II 10 kg-per-hand load a 2 mm lead would need 2.8–3.6× the motor's rated torque, hence the 1 mm lead (docs/08). Requirement: 10 N·m repeated, 6.0 rad/s. Build class: **modify** (buy motor/screw, custom housing). Validate force and speed on the bench (docs/11).

## Neck Yaw  (range -80° … 80°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 12 N·m (sim 2 in NK) | 23 N·m (gear-limited; motor 34) | 1.92 |
| Momentary torque (gear/structure must survive) | 12 N·m | gear momentary 46 N·m | — |
| Continuous torque | < 1 N·m | 9 N·m | — |
| Static hold | 0 N·m (AO) | ≤ 13 N·m for 60 s | — |
| Speed | 7.4 rad/s (sim 6.4) | 9.0 rad/s no-load | 1.21 |
| Peak mechanical power | 8 W | — | — |

* Actuator class **KH-14** — motor **KM-50x20** (motor_design.py (calibrated)), CSG-14-50 strain-wave (Leaderdrive LHSG equivalent), gear efficiency 0.75 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.106 N·m/A rms, R(LL) 865 mΩ, continuous 0.28 N·m, peak 0.9 N·m; drive EV; reflected inertia 0.028 kg·m²; actuator mass ≈ 0.68 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — custom KM-50x20 motor (or a verified 50 mm frameless kit) + size-14 strain-wave set. Commercial alternative: CubeMars AK45-36 (24 N·m pk, 0.35 kg, 24 V — on the Mk II 24 V rail) [R9].

## Neck Pitch  (range -35° … 50°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 12 N·m (sim 5 in NK) | 23 N·m (gear-limited; motor 34) | 1.92 |
| Momentary torque (gear/structure must survive) | 12 N·m | gear momentary 46 N·m | — |
| Continuous torque | < 1 N·m | 9 N·m | — |
| Static hold | 1 N·m (AO) | ≤ 13 N·m for 60 s | — |
| Speed | 7.0 rad/s (sim 5.0) | 9.0 rad/s no-load | 1.28 |
| Peak mechanical power | 16 W | — | — |

* Actuator class **KH-14** — motor **KM-50x20** (motor_design.py (calibrated)), CSG-14-50 strain-wave (Leaderdrive LHSG equivalent), gear efficiency 0.75 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.106 N·m/A rms, R(LL) 865 mΩ, continuous 0.28 N·m, peak 0.9 N·m; drive EV; reflected inertia 0.028 kg·m²; actuator mass ≈ 0.68 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — custom KM-50x20 motor (or a verified 50 mm frameless kit) + size-14 strain-wave set. Commercial alternative: CubeMars AK45-36 (24 N·m pk, 0.35 kg, 24 V — on the Mk II 24 V rail) [R9].

