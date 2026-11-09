# Joint actuator spec sheets (generated)

Joint-side capability after linkages. Peak = actuator peak (motor saturation or drive current, whichever is lower) × ratio × gear efficiency × linkage. Margin = capability / requirement (requirements already include ×1.2 torque and ×1.15 speed margins). Continuous = thermal at the stated derate. Speed = no-load at 52 V minimum bus (field weakening not counted).

## Hip Yaw  (range -30° … 45°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 76 N·m (sim 63 in W2) | 129 N·m | 1.69 |
| Momentary torque (gear/structure must survive) | 76 N·m | output-flange slip: see structure_checks.md | — |
| Continuous torque | 15 N·m (RMS W1/W2/ST 10/15/6) | 44 N·m | 2.97 |
| Static hold | 4 N·m (AO) | ≤ 66 N·m for 60 s | — |
| Speed | 5.0 rad/s (sim 0.2) | 13.1 rad/s no-load | 2.62 |
| Peak mechanical power | 2 W | — | — |

* Actuator class **KA-90P** — motor **RI85-PH** (CubeMars 2026 catalogue), 2-stage planetary 28:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.130 N·m/A rms, R(LL) 138 mΩ, continuous 2.00 N·m, peak 5.0 N·m; drive EV; reflected inertia 0.066 kg·m²; actuator mass ≈ 1.41 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy CubeMars RI85-PH frameless kit; custom housing + planetary. Commercial alternative: RobStride RS04 (120 N·m pk, 1.42 kg, CAN only → CAN-FD bridge) or MyActuator X8-120 [ds R1].

## Hip Roll  (range -25° … 45°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 179 N·m (sim 149 in CW) | 427 N·m | 2.38 |
| Momentary torque (gear/structure must survive) | 235 N·m | output-flange slip: see structure_checks.md | — |
| Continuous torque | 79 N·m (RMS W1/W2/ST 66/64/70) | 125 N·m | 1.58 |
| Static hold | 120 N·m (SL) | ≤ 187 N·m for 60 s | — |
| Speed | 4.0 rad/s (sim 0.6) | 5.7 rad/s no-load | 1.42 |
| Peak mechanical power | 53 W | — | — |

* Actuator class **KA-110P** — motor **RI115-PH** (CubeMars 2026 catalogue), 2-stage planetary 29:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.290 N·m/A rms, R(LL) 134 mΩ, continuous 5.50 N·m, peak 16.0 N·m; drive EV; reflected inertia 0.361 kg·m²; actuator mass ≈ 2.96 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy TQ ILM85x26 frameless kit; custom housing + planetary. Commercial alternative: MyActuator X12-320 / X10-200 [ds R1].

## Hip Pitch  (range -125° … 30°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 364 N·m (sim 303 in W2) | 406 N·m | 1.12 |
| Momentary torque (gear/structure must survive) | 364 N·m | output-flange slip: see structure_checks.md | — |
| Continuous torque | 98 N·m (RMS W1/W2/ST 58/102/18) | 243 N·m | 2.47 |
| Static hold | 84 N·m (AH) | ≤ 364 N·m for 60 s | — |
| Speed | 9.8 rad/s (sim 8.5) | 15.2 rad/s no-load | 1.56 |
| Peak mechanical power | 1192 W | — | — |

* Actuator class **KA-130H** — motor **KM-130x50-LC** (R10 Mk II: Ø130 die, 50 mm stack, N50UH, 3t x 2p, liquid jacket; T_pk @150 A), 2-stage planetary 14:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.224 N·m/A rms, R(LL) 20 mΩ, continuous 18.85 N·m, peak 31.5 N·m; drive HC2; reflected inertia 0.271 kg·m²; actuator mass ≈ 4.76 kg [est].
* Thermal: continuous rating at derate 1.00 (ducted air, potted stator); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — same housing as KA-130K, 40 mm stack. Commercial alternative: MyActuator X12-320 (320 N·m pk, 125 rpm no-load, 2.37 kg, EtherCAT) [ds R1].

## Knee  (range 0° … 130°)

*Knee margin is the envelope margin: min over every simulated sample of capability-at-that-angle / (1.2 × demand). The by-angle minimum (415 N·m) occurs at 20–40°, where demands are lower.*

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 431 N·m (sim 359 in ST) | 415 N·m at 20–40° … 719 N·m at 110° (by angle) | 1.44 |
| Momentary torque (gear/structure must survive) | 535 N·m | output-flange slip: see structure_checks.md | — |
| Continuous torque | 142 N·m (RMS W1/W2/ST 118/146/176) | 248 N·m | 1.75 |
| Static hold | 155 N·m (SL) | ≤ 373 N·m for 60 s | — |
| Speed | 9.2 rad/s (sim 8.0) | 14.9 rad/s no-load | 1.61 |
| Peak mechanical power | 652 W | — | — |

* Actuator class **KA-130K** — motor **KM-130x50-LC** (R10 Mk II: Ø130 die, 50 mm stack, N50UH, 3t x 2p, liquid jacket; T_pk @150 A), 2-stage planetary 17:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: four-bar, G = 0.84–1.46 (see knee_linkage.svg).
* Motor: Kt 0.224 N·m/A rms, R(LL) 20 mΩ, continuous 18.85 N·m, peak 31.5 N·m; drive HC2; reflected inertia 0.400 kg·m²; actuator mass ≈ 4.96 kg [est].
* Thermal: continuous rating at derate 1.00 (ducted air, potted stator); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — custom KM-130x45 motor + custom planetary; no verified commercial kit meets the walking thermal duty at 52 V. Commercial alternative: MyActuator X15-450 (450 N·m pk, 3.5 kg, rated at 72 V — ~25 % slower at 59 V); for Phase-0 mules only.

## Ankle Pitch  (range -45° … 45°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 210 N·m (sim 79 in W2) | 335 N·m (pure pitch) | 1.59 |
| Momentary torque (gear/structure must survive) | 300 N·m | output-flange slip: see structure_checks.md | — |
| Continuous torque | 25 N·m (RMS W1/W2/ST 21/22/21) | 114 N·m | 4.48 |
| Static hold | 40 N·m (AO) | ≤ 171 N·m for 60 s | — |
| Speed | 7.9 rad/s (sim 6.9) | 10.1 rad/s no-load | 1.27 |
| Peak mechanical power | 118 W | — | — |

* Actuator class **KA-90P** — motor **RI85-PH** (CubeMars 2026 catalogue), 2-stage planetary 28:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: 2 push-rods, r_c 40 / r_p 52 mm (shared with roll).
* Motor: Kt 0.130 N·m/A rms, R(LL) 138 mΩ, continuous 2.00 N·m, peak 5.0 N·m; drive EV; reflected inertia 0.066 kg·m²; actuator mass ≈ 1.41 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy CubeMars RI85-PH frameless kit; custom housing + planetary. Commercial alternative: RobStride RS04 (120 N·m pk, 1.42 kg, CAN only → CAN-FD bridge) or MyActuator X8-120 [ds R1].

## Ankle Roll  (range -25° … 25°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 61 N·m (sim 19 in CW) | 232 N·m (pure roll) | 3.81 |
| Momentary torque (gear/structure must survive) | 61 N·m | output-flange slip: see structure_checks.md | — |
| Continuous torque | 5 N·m (RMS W1/W2/ST 4/5/4) | 79 N·m | 14.90 |
| Static hold | 3 N·m (AO) | ≤ 118 N·m for 60 s | — |
| Speed | 4.0 rad/s (sim 0.6) | 14.6 rad/s no-load | 3.65 |
| Peak mechanical power | 8 W | — | — |

* Actuator class **KA-90P** — motor **RI85-PH** (CubeMars 2026 catalogue), 2-stage planetary 28:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: 2 push-rods, half spacing d 36 mm (shared with pitch).
* Motor: Kt 0.130 N·m/A rms, R(LL) 138 mΩ, continuous 2.00 N·m, peak 5.0 N·m; drive EV; reflected inertia 0.066 kg·m²; actuator mass ≈ 1.41 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy CubeMars RI85-PH frameless kit; custom housing + planetary. Commercial alternative: RobStride RS04 (120 N·m pk, 1.42 kg, CAN only → CAN-FD bridge) or MyActuator X8-120 [ds R1].

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
* Motor: Kt 0.130 N·m/A rms, R(LL) 138 mΩ, continuous 2.00 N·m, peak 5.0 N·m; drive EV; reflected inertia 0.066 kg·m²; actuator mass ≈ 1.41 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy CubeMars RI85-PH frameless kit; custom housing + planetary. Commercial alternative: RobStride RS04 (120 N·m pk, 1.42 kg, CAN only → CAN-FD bridge) or MyActuator X8-120 [ds R1].

## Waist Pitch  (range -15° … 75°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 288 N·m (sim 240 in SQ) | 427 N·m | 1.48 |
| Momentary torque (gear/structure must survive) | 379 N·m | output-flange slip: see structure_checks.md | — |
| Continuous torque | 17 N·m (RMS W1/W2/ST 13/18/7) | 125 N·m | 7.25 |
| Static hold | 176 N·m (AH) | ≤ 187 N·m for 60 s | — |
| Speed | 1.5 rad/s (sim 1.3) | 5.7 rad/s no-load | 3.77 |
| Peak mechanical power | 136 W | — | — |

* Actuator class **KA-110P** — motor **RI115-PH** (CubeMars 2026 catalogue), 2-stage planetary 29:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.290 N·m/A rms, R(LL) 134 mΩ, continuous 5.50 N·m, peak 16.0 N·m; drive EV; reflected inertia 0.361 kg·m²; actuator mass ≈ 2.96 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy TQ ILM85x26 frameless kit; custom housing + planetary. Commercial alternative: MyActuator X12-320 / X10-200 [ds R1].

## Shoulder Pitch  (range -180° … 60°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 108 N·m (sim 90 in CW) | 362 N·m | 3.34 |
| Momentary torque (gear/structure must survive) | 136 N·m | gear momentary 250 N·m | — |
| Continuous torque | 26 N·m (RMS W1/W2/ST 15/27/8) | 119 N·m | 4.54 |
| Static hold | 90 N·m (AH) | ≤ 178 N·m for 60 s | — |
| Speed | 6.2 rad/s (sim 5.4) | 6.3 rad/s no-load | 1.02 |
| Peak mechanical power | 288 W | — | — |

* Actuator class **KH-25** — motor **KM-115x32-N50** (R10 KA-115R: N50UH, 3t; T_pk @60 A), C25 machined two-disc cycloid 30:1 (custom; ratings are dyno-validation targets, R10), gear efficiency 0.85 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.252 N·m/A rms, R(LL) 70 mΩ, continuous 5.49 N·m, peak 14.2 N·m; drive EV; reflected inertia 0.494 kg·m²; actuator mass ≈ 2.60 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy TQ ILM85x13 + Leaderdrive size-25 set; custom housing + torque flexure. Commercial alternative: MyActuator RH-25 (157 N·m pk, 2.42 kg) [ds R1].

## Shoulder Roll  (range -15° … 160°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 58 N·m (sim 48 in AS) | 362 N·m | 6.26 |
| Momentary torque (gear/structure must survive) | 58 N·m | gear momentary 250 N·m | — |
| Continuous torque | 4 N·m (RMS W1/W2/ST 3/4/3) | 119 N·m | 29.16 |
| Static hold | 0 N·m (AO) | ≤ 178 N·m for 60 s | — |
| Speed | 6.0 rad/s (sim 3.7) | 6.3 rad/s no-load | 1.05 |
| Peak mechanical power | 144 W | — | — |

* Actuator class **KH-25** — motor **KM-115x32-N50** (R10 KA-115R: N50UH, 3t; T_pk @60 A), C25 machined two-disc cycloid 30:1 (custom; ratings are dyno-validation targets, R10), gear efficiency 0.85 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.252 N·m/A rms, R(LL) 70 mΩ, continuous 5.49 N·m, peak 14.2 N·m; drive EV; reflected inertia 0.494 kg·m²; actuator mass ≈ 2.60 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy TQ ILM85x13 + Leaderdrive size-25 set; custom housing + torque flexure. Commercial alternative: MyActuator RH-25 (157 N·m pk, 2.42 kg) [ds R1].

## Shoulder Yaw  (range -90° … 100°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 30 N·m (sim 7 in CW) | 158 N·m | 5.25 |
| Momentary torque (gear/structure must survive) | 30 N·m | gear momentary 160 N·m | — |
| Continuous torque | < 1 N·m | 44 N·m | — |
| Static hold | 0 N·m (AO) | ≤ 65 N·m for 60 s | — |
| Speed | 6.0 rad/s (sim 0.0) | 8.6 rad/s no-load | 1.43 |
| Peak mechanical power | 0 W | — | — |

* Actuator class **KH-20** — motor **KM-85x26-N50-4t** (R10 KH-C25), C20 machined two-disc cycloid 30:1 (custom; ratings are dyno-validation targets, R10), gear efficiency 0.85 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.186 N·m/A rms, R(LL) 146 mΩ, continuous 2.01 N·m, peak 6.2 N·m; drive EV; reflected inertia 0.107 kg·m²; actuator mass ≈ 1.63 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy RI85-PH + size-20 set; custom housing + torque flexure. Commercial alternative: MyActuator RH-20 (80 N·m pk, 1.45 kg) [ds R1].

## Elbow  (range -145° … 0°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 79 N·m (sim 66 in SQ) | 158 N·m | 1.99 |
| Momentary torque (gear/structure must survive) | 115 N·m | gear momentary 160 N·m | — |
| Continuous torque | 7 N·m (RMS W1/W2/ST 4/7/3) | 44 N·m | 6.39 |
| Static hold | 59 N·m (AO) | ≤ 65 N·m for 60 s | — |
| Speed | 7.0 rad/s (sim 4.3) | 8.6 rad/s no-load | 1.23 |
| Peak mechanical power | 161 W | — | — |

* Actuator class **KH-20** — motor **KM-85x26-N50-4t** (R10 KH-C25), C20 machined two-disc cycloid 30:1 (custom; ratings are dyno-validation targets, R10), gear efficiency 0.85 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.186 N·m/A rms, R(LL) 146 mΩ, continuous 2.01 N·m, peak 6.2 N·m; drive EV; reflected inertia 0.107 kg·m²; actuator mass ≈ 1.63 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy RI85-PH + size-20 set; custom housing + torque flexure. Commercial alternative: MyActuator RH-20 (80 N·m pk, 1.45 kg) [ds R1].

## Wrist Yaw  (range -90° … 90°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 12 N·m (sim 0 in AF) | 34 N·m | 2.81 |
| Momentary torque (gear/structure must survive) | 12 N·m | gear momentary 46 N·m | — |
| Continuous torque | < 1 N·m | 9 N·m | — |
| Static hold | 0 N·m (AO) | ≤ 13 N·m for 60 s | — |
| Speed | 8.0 rad/s (sim 0.0) | 9.0 rad/s no-load | 1.12 |
| Peak mechanical power | 0 W | — | — |

* Actuator class **KH-14** — motor **KM-50x20** (motor_design.py (calibrated)), CSG-14-50 strain-wave (Leaderdrive LHSG equivalent), gear efficiency 0.75 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.106 N·m/A rms, R(LL) 865 mΩ, continuous 0.28 N·m, peak 0.9 N·m; drive EV; reflected inertia 0.028 kg·m²; actuator mass ≈ 0.68 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — custom KM-50x20 motor (or a verified 50 mm frameless kit) + size-14 set. Commercial alternative: CubeMars AK45-36 (24 N·m pk, 0.35 kg, 24 V — needs a 24 V branch) [ds R1].

## Wrist Pitch  (range -70° … 70°)

Actuation: two parallel ball-screw linear actuators (maxon DCX 16 L + GPX 16 + KSS Ø6 × 2 mm) on lever arms r_p = 22 mm / d = 16 mm. Required force per actuator at the combined corner ≈ 754 N; speed ≈ 132 mm/s. DCX 16 L (10.9 mN·m cont, 37 mN·m stall [ds R5]) × GPX 16 3.9:1 × 2π/2 mm × 0.88 gives ≈ 106 N continuous / ≈ 359 N stall. Requirement: 19 N·m repeated, 6.0 rad/s. Build class: **modify** (buy motor/gearhead/screw, custom housing).

## Wrist Roll  (range -35° … 35°)

Actuation: two parallel ball-screw linear actuators (maxon DCX 16 L + GPX 16 + KSS Ø6 × 2 mm) on lever arms r_p = 22 mm / d = 16 mm. Required force per actuator at the combined corner ≈ 754 N; speed ≈ 132 mm/s. DCX 16 L (10.9 mN·m cont, 37 mN·m stall [ds R5]) × GPX 16 3.9:1 × 2π/2 mm × 0.88 gives ≈ 106 N continuous / ≈ 359 N stall. Requirement: 10 N·m repeated, 6.0 rad/s. Build class: **modify** (buy motor/gearhead/screw, custom housing).

## Neck Yaw  (range -80° … 80°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 12 N·m (sim 2 in NK) | 34 N·m | 2.81 |
| Momentary torque (gear/structure must survive) | 12 N·m | gear momentary 46 N·m | — |
| Continuous torque | < 1 N·m | 9 N·m | — |
| Static hold | 0 N·m (AO) | ≤ 13 N·m for 60 s | — |
| Speed | 7.4 rad/s (sim 6.4) | 9.0 rad/s no-load | 1.21 |
| Peak mechanical power | 8 W | — | — |

* Actuator class **KH-14** — motor **KM-50x20** (motor_design.py (calibrated)), CSG-14-50 strain-wave (Leaderdrive LHSG equivalent), gear efficiency 0.75 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.106 N·m/A rms, R(LL) 865 mΩ, continuous 0.28 N·m, peak 0.9 N·m; drive EV; reflected inertia 0.028 kg·m²; actuator mass ≈ 0.68 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — custom KM-50x20 motor (or a verified 50 mm frameless kit) + size-14 set. Commercial alternative: CubeMars AK45-36 (24 N·m pk, 0.35 kg, 24 V — needs a 24 V branch) [ds R1].

## Neck Pitch  (range -35° … 50°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 12 N·m (sim 5 in NK) | 34 N·m | 2.81 |
| Momentary torque (gear/structure must survive) | 12 N·m | gear momentary 46 N·m | — |
| Continuous torque | < 1 N·m | 9 N·m | — |
| Static hold | 1 N·m (AO) | ≤ 13 N·m for 60 s | — |
| Speed | 7.0 rad/s (sim 5.0) | 9.0 rad/s no-load | 1.28 |
| Peak mechanical power | 16 W | — | — |

* Actuator class **KH-14** — motor **KM-50x20** (motor_design.py (calibrated)), CSG-14-50 strain-wave (Leaderdrive LHSG equivalent), gear efficiency 0.75 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.106 N·m/A rms, R(LL) 865 mΩ, continuous 0.28 N·m, peak 0.9 N·m; drive EV; reflected inertia 0.028 kg·m²; actuator mass ≈ 0.68 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — custom KM-50x20 motor (or a verified 50 mm frameless kit) + size-14 set. Commercial alternative: CubeMars AK45-36 (24 N·m pk, 0.35 kg, 24 V — needs a 24 V branch) [ds R1].

