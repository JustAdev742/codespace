# Joint actuator spec sheets (generated)

Joint-side capability after linkages. Peak = actuator peak (motor saturation or drive current, whichever is lower) × ratio × gear efficiency × linkage. Margin = capability / requirement (requirements already include ×1.2 torque and ×1.15 speed margins). Continuous = thermal at the stated derate. Speed = no-load at 52 V minimum bus (field weakening not counted).

## Hip Yaw  (range -30° … 45°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 72 N·m (sim 60 in W2) | 106 N·m | 1.47 |
| Momentary torque (gear/structure must survive) | 72 N·m | flange slip ≥ 2.15× (structure.py) | — |
| Continuous torque | 14 N·m (RMS W1/W2/ST 9/14/5) | 36 N·m | 2.66 |
| Static hold | 0 N·m (—) | ≤ 54 N·m for 60 s | — |
| Speed | 5.0 rad/s (sim 0.2) | 16.0 rad/s no-load | 3.19 |
| Peak mechanical power | 1 W | — | — |

* Actuator class **KA-90P** — motor **RI85-PH** (CubeMars 2026 catalogue), 2-stage planetary 23:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.130 N·m/A rms, R(LL) 138 mΩ, continuous 2.00 N·m, peak 5.0 N·m; drive EV; reflected inertia 0.045 kg·m²; actuator mass ≈ 1.37 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy CubeMars RI85-PH frameless kit; custom housing + planetary. Commercial alternative: RobStride RS04 (120 N·m pk, 1.42 kg, CAN only → CAN-FD bridge) or MyActuator X8-120 [ds R1].

## Hip Roll  (range -25° … 45°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 133 N·m (sim 111 in ST) | 276 N·m | 2.08 |
| Momentary torque (gear/structure must survive) | 193 N·m | flange slip ≥ 2.15× (structure.py) | — |
| Continuous torque | 65 N·m (RMS W1/W2/ST 54/53/58) | 73 N·m | 1.11 |
| Static hold | 99 N·m (SL) | ≤ 109 N·m for 60 s | — |
| Speed | 4.0 rad/s (sim 0.6) | 5.9 rad/s no-load | 1.47 |
| Peak mechanical power | 45 W | — | — |

* Actuator class **KA-110P** — motor **ILM85x26** (TQ-RoboDrive), 2-stage planetary 32:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.253 N·m/A rms, R(LL) 320 mΩ, continuous 2.90 N·m, peak 9.4 N·m; drive EV; reflected inertia 0.141 kg·m²; actuator mass ≈ 1.81 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy TQ ILM85x26 frameless kit; custom housing + planetary. Commercial alternative: MyActuator X12-320 / X10-200 [ds R1].

## Hip Pitch  (range -125° … 30°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 337 N·m (sim 281 in W2) | 399 N·m | 1.18 |
| Momentary torque (gear/structure must survive) | 337 N·m | flange slip ≥ 2.15× (structure.py) | — |
| Continuous torque | 91 N·m (RMS W1/W2/ST 52/95/16) | 123 N·m | 1.35 |
| Static hold | 50 N·m (AH) | ≤ 185 N·m for 60 s | — |
| Speed | 9.7 rad/s (sim 8.5) | 10.3 rad/s no-load | 1.06 |
| Peak mechanical power | 1120 W | — | — |

* Actuator class **KA-130H** — motor **KM-130x40** (motor_design.py (calibrated)), 2-stage planetary 14:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.330 N·m/A rms, R(LL) 60 mΩ, continuous 9.59 N·m, peak 31.0 N·m; drive HC; reflected inertia 0.210 kg·m²; actuator mass ≈ 3.78 kg [est].
* Thermal: continuous rating at derate 1.00 (ducted air, potted stator); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — same housing as KA-130K, 40 mm stack. Commercial alternative: MyActuator X12-320 (320 N·m pk, 125 rpm no-load, 2.37 kg, EtherCAT) [ds R1].

## Knee  (range 0° … 130°)

*Knee margin is the envelope margin: min over every simulated sample of capability-at-that-angle / (1.2 × demand). The by-angle minimum (333 N·m) occurs at 20–40°, where demands are lower.*

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 352 N·m (sim 294 in ST) | 333 N·m at 20–40° … 576 N·m at 110° (by angle) | 1.40 |
| Momentary torque (gear/structure must survive) | 428 N·m | flange slip ≥ 2.15× (structure.py) | — |
| Continuous torque | 114 N·m (RMS W1/W2/ST 95/118/142) | 117 N·m | 1.03 |
| Static hold | 124 N·m (SL) | ≤ 176 N·m for 60 s | — |
| Speed | 9.4 rad/s (sim 8.2) | 13.1 rad/s no-load | 1.39 |
| Peak mechanical power | 546 W | — | — |

* Actuator class **KA-130K** — motor **KM-130x45** (motor_design.py (calibrated)), 2-stage planetary 14:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: four-bar, G = 0.84–1.46 (see knee_linkage.svg).
* Motor: Kt 0.310 N·m/A rms, R(LL) 45 mΩ, continuous 10.78 N·m, peak 34.8 N·m; drive HC; reflected inertia 0.237 kg·m²; actuator mass ≈ 4.22 kg [est].
* Thermal: continuous rating at derate 1.00 (ducted air, potted stator); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — custom KM-130x45 motor + custom planetary; no verified commercial kit meets the walking thermal duty at 52 V. Commercial alternative: MyActuator X15-450 (450 N·m pk, 3.5 kg, rated at 72 V — ~25 % slower at 59 V); for Phase-0 mules only.

## Ankle Pitch  (range -45° … 45°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 172 N·m (sim 66 in W2) | 275 N·m (pure pitch) | 1.60 |
| Momentary torque (gear/structure must survive) | 272 N·m | flange slip ≥ 2.15× (structure.py) | — |
| Continuous torque | 21 N·m (RMS W1/W2/ST 17/18/17) | 94 N·m | 4.49 |
| Static hold | 26 N·m (SL) | ≤ 140 N·m for 60 s | — |
| Speed | 8.0 rad/s (sim 6.9) | 12.3 rad/s no-load | 1.54 |
| Peak mechanical power | 104 W | — | — |

* Actuator class **KA-90P** — motor **RI85-PH** (CubeMars 2026 catalogue), 2-stage planetary 23:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: 2 push-rods, r_c 40 / r_p 52 mm (shared with roll).
* Motor: Kt 0.130 N·m/A rms, R(LL) 138 mΩ, continuous 2.00 N·m, peak 5.0 N·m; drive EV; reflected inertia 0.045 kg·m²; actuator mass ≈ 1.37 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy CubeMars RI85-PH frameless kit; custom housing + planetary. Commercial alternative: RobStride RS04 (120 N·m pk, 1.42 kg, CAN only → CAN-FD bridge) or MyActuator X8-120 [ds R1].

## Ankle Roll  (range -25° … 25°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 50 N·m (sim 15 in W2) | 190 N·m (pure roll) | 3.81 |
| Momentary torque (gear/structure must survive) | 50 N·m | flange slip ≥ 2.15× (structure.py) | — |
| Continuous torque | 4 N·m (RMS W1/W2/ST 4/4/3) | 65 N·m | 14.68 |
| Static hold | 0 N·m (SL) | ≤ 97 N·m for 60 s | — |
| Speed | 4.0 rad/s (sim 0.6) | 17.7 rad/s no-load | 4.44 |
| Peak mechanical power | 7 W | — | — |

* Actuator class **KA-90P** — motor **RI85-PH** (CubeMars 2026 catalogue), 2-stage planetary 23:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: 2 push-rods, half spacing d 36 mm (shared with pitch).
* Motor: Kt 0.130 N·m/A rms, R(LL) 138 mΩ, continuous 2.00 N·m, peak 5.0 N·m; drive EV; reflected inertia 0.045 kg·m²; actuator mass ≈ 1.37 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy CubeMars RI85-PH frameless kit; custom housing + planetary. Commercial alternative: RobStride RS04 (120 N·m pk, 1.42 kg, CAN only → CAN-FD bridge) or MyActuator X8-120 [ds R1].

## Waist Yaw  (range -70° … 70°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 60 N·m (sim 41 in W2) | 106 N·m | 1.76 |
| Momentary torque (gear/structure must survive) | 60 N·m | flange slip ≥ 2.15× (structure.py) | — |
| Continuous torque | 19 N·m (RMS W1/W2/ST 12/20/6) | 36 N·m | 1.87 |
| Static hold | 0 N·m (—) | ≤ 54 N·m for 60 s | — |
| Speed | 4.0 rad/s (sim 0.0) | 16.0 rad/s no-load | 3.99 |
| Peak mechanical power | 0 W | — | — |

* Actuator class **KA-90P** — motor **RI85-PH** (CubeMars 2026 catalogue), 2-stage planetary 23:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.130 N·m/A rms, R(LL) 138 mΩ, continuous 2.00 N·m, peak 5.0 N·m; drive EV; reflected inertia 0.045 kg·m²; actuator mass ≈ 1.37 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy CubeMars RI85-PH frameless kit; custom housing + planetary. Commercial alternative: RobStride RS04 (120 N·m pk, 1.42 kg, CAN only → CAN-FD bridge) or MyActuator X8-120 [ds R1].

## Waist Pitch  (range -15° … 75°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 205 N·m (sim 171 in SQ) | 276 N·m | 1.35 |
| Momentary torque (gear/structure must survive) | 205 N·m | flange slip ≥ 2.15× (structure.py) | — |
| Continuous torque | 14 N·m (RMS W1/W2/ST 10/14/6) | 73 N·m | 5.32 |
| Static hold | 106 N·m (AH) | ≤ 109 N·m for 60 s | — |
| Speed | 1.5 rad/s (sim 1.3) | 5.9 rad/s no-load | 3.92 |
| Peak mechanical power | 96 W | — | — |

* Actuator class **KA-110P** — motor **ILM85x26** (TQ-RoboDrive), 2-stage planetary 32:1 (custom, ground), gear efficiency 0.92 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.253 N·m/A rms, R(LL) 320 mΩ, continuous 2.90 N·m, peak 9.4 N·m; drive EV; reflected inertia 0.141 kg·m²; actuator mass ≈ 1.81 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy TQ ILM85x26 frameless kit; custom housing + planetary. Commercial alternative: MyActuator X12-320 / X10-200 [ds R1].

## Shoulder Pitch  (range -180° … 60°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 67 N·m (sim 55 in SQ) | 175 N·m | 2.63 |
| Momentary torque (gear/structure must survive) | 67 N·m | gear momentary 242 N·m | — |
| Continuous torque | 18 N·m (RMS W1/W2/ST 10/19/6) | 46 N·m | 2.49 |
| Static hold | 54 N·m (AH) | ≤ 69 N·m for 60 s | — |
| Speed | 6.2 rad/s (sim 5.4) | 7.1 rad/s no-load | 1.16 |
| Peak mechanical power | 169 W | — | — |

* Actuator class **KH-25** — motor **ILM85x13** (TQ-RoboDrive), CSG-25-50 strain-wave (Leaderdrive LHSG equivalent), gear efficiency 0.75 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.134 N·m/A rms, R(LL) 220 mΩ, continuous 1.44 N·m, peak 4.7 N·m; drive EV; reflected inertia 0.195 kg·m²; actuator mass ≈ 1.38 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy TQ ILM85x13 + Leaderdrive size-25 set; custom housing + torque flexure. Commercial alternative: MyActuator RH-25 (157 N·m pk, 2.42 kg) [ds R1].

## Shoulder Roll  (range -15° … 160°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 50 N·m (sim 42 in AS) | 175 N·m | 3.50 |
| Momentary torque (gear/structure must survive) | 50 N·m | gear momentary 242 N·m | — |
| Continuous torque | 4 N·m (RMS W1/W2/ST 3/3/3) | 46 N·m | 12.95 |
| Static hold | 0 N·m (SL) | ≤ 69 N·m for 60 s | — |
| Speed | 6.0 rad/s (sim 3.7) | 7.1 rad/s no-load | 1.19 |
| Peak mechanical power | 127 W | — | — |

* Actuator class **KH-25** — motor **ILM85x13** (TQ-RoboDrive), CSG-25-50 strain-wave (Leaderdrive LHSG equivalent), gear efficiency 0.75 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.134 N·m/A rms, R(LL) 220 mΩ, continuous 1.44 N·m, peak 4.7 N·m; drive EV; reflected inertia 0.195 kg·m²; actuator mass ≈ 1.38 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy TQ ILM85x13 + Leaderdrive size-25 set; custom housing + torque flexure. Commercial alternative: MyActuator RH-25 (157 N·m pk, 2.42 kg) [ds R1].

## Shoulder Yaw  (range -90° … 100°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 30 N·m (sim 1 in W2) | 188 N·m | 6.25 |
| Momentary torque (gear/structure must survive) | 30 N·m | gear momentary 127 N·m | — |
| Continuous torque | < 1 N·m | 64 N·m | — |
| Static hold | 0 N·m (AH) | ≤ 96 N·m for 60 s | — |
| Speed | 6.0 rad/s (sim 0.0) | 7.3 rad/s no-load | 1.22 |
| Peak mechanical power | 0 W | — | — |

* Actuator class **KH-20** — motor **RI85-PH** (CubeMars 2026 catalogue), CSG-20-50 strain-wave (Leaderdrive LHSG equivalent), gear efficiency 0.75 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.130 N·m/A rms, R(LL) 138 mΩ, continuous 2.00 N·m, peak 5.0 N·m; drive EV; reflected inertia 0.212 kg·m²; actuator mass ≈ 1.25 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy RI85-PH + size-20 set; custom housing + torque flexure. Commercial alternative: MyActuator RH-20 (80 N·m pk, 1.45 kg) [ds R1].

## Elbow  (range -145° … 0°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 55 N·m (sim 46 in SQ) | 188 N·m | 3.43 |
| Momentary torque (gear/structure must survive) | 55 N·m | gear momentary 127 N·m | — |
| Continuous torque | 6 N·m (RMS W1/W2/ST 4/6/2) | 64 N·m | 11.08 |
| Static hold | 23 N·m (AH) | ≤ 96 N·m for 60 s | — |
| Speed | 7.0 rad/s (sim 4.3) | 7.3 rad/s no-load | 1.05 |
| Peak mechanical power | 61 W | — | — |

* Actuator class **KH-20** — motor **RI85-PH** (CubeMars 2026 catalogue), CSG-20-50 strain-wave (Leaderdrive LHSG equivalent), gear efficiency 0.75 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.130 N·m/A rms, R(LL) 138 mΩ, continuous 2.00 N·m, peak 5.0 N·m; drive EV; reflected inertia 0.212 kg·m²; actuator mass ≈ 1.25 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **modify** — buy RI85-PH + size-20 set; custom housing + torque flexure. Commercial alternative: MyActuator RH-20 (80 N·m pk, 1.45 kg) [ds R1].

## Wrist Yaw  (range -90° … 90°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 12 N·m (sim 0 in AF) | 34 N·m | 2.81 |
| Momentary torque (gear/structure must survive) | 12 N·m | gear momentary 46 N·m | — |
| Continuous torque | < 1 N·m | 9 N·m | — |
| Static hold | 0 N·m (—) | ≤ 13 N·m for 60 s | — |
| Speed | 8.0 rad/s (sim 0.0) | 9.0 rad/s no-load | 1.12 |
| Peak mechanical power | 0 W | — | — |

* Actuator class **KH-14** — motor **KM-50x20** (motor_design.py (calibrated)), CSG-14-50 strain-wave (Leaderdrive LHSG equivalent), gear efficiency 0.75 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.106 N·m/A rms, R(LL) 865 mΩ, continuous 0.28 N·m, peak 0.9 N·m; drive EV; reflected inertia 0.028 kg·m²; actuator mass ≈ 0.68 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — custom KM-50x20 motor (or a verified 50 mm frameless kit) + size-14 set. Commercial alternative: CubeMars AK45-36 (24 N·m pk, 0.35 kg, 24 V — needs a 24 V branch) [ds R1].

## Wrist Pitch  (range -70° … 70°)

Actuation: two parallel ball-screw linear actuators (maxon DCX 16 L + GPX 16 + KSS Ø6 × 2 mm) on lever arms r_p = 22 mm / d = 16 mm. Required force per actuator at the combined corner ≈ 611 N; speed ≈ 132 mm/s. DCX 16 L (10.9 mN·m cont, 37 mN·m stall [ds R5]) × GPX 16 3.9:1 × 2π/2 mm × 0.88 gives ≈ 106 N continuous / ≈ 359 N stall. Requirement: 13 N·m repeated, 6.0 rad/s. Build class: **modify** (buy motor/gearhead/screw, custom housing).

## Wrist Roll  (range -35° … 35°)

Actuation: two parallel ball-screw linear actuators (maxon DCX 16 L + GPX 16 + KSS Ø6 × 2 mm) on lever arms r_p = 22 mm / d = 16 mm. Required force per actuator at the combined corner ≈ 611 N; speed ≈ 132 mm/s. DCX 16 L (10.9 mN·m cont, 37 mN·m stall [ds R5]) × GPX 16 3.9:1 × 2π/2 mm × 0.88 gives ≈ 106 N continuous / ≈ 359 N stall. Requirement: 10 N·m repeated, 6.0 rad/s. Build class: **modify** (buy motor/gearhead/screw, custom housing).

## Neck Yaw  (range -80° … 80°)

| Item | Requirement | Delivered | Margin |
|---|---|---|---|
| Peak (repeated) torque | 12 N·m (sim 2 in NK) | 34 N·m | 2.81 |
| Momentary torque (gear/structure must survive) | 12 N·m | gear momentary 46 N·m | — |
| Continuous torque | < 1 N·m | 9 N·m | — |
| Static hold | 0 N·m (—) | ≤ 13 N·m for 60 s | — |
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
| Static hold | 0 N·m (AH) | ≤ 13 N·m for 60 s | — |
| Speed | 7.0 rad/s (sim 5.0) | 9.0 rad/s no-load | 1.28 |
| Peak mechanical power | 16 W | — | — |

* Actuator class **KH-14** — motor **KM-50x20** (motor_design.py (calibrated)), CSG-14-50 strain-wave (Leaderdrive LHSG equivalent), gear efficiency 0.75 (assumed, to be measured), transmission: direct.
* Motor: Kt 0.106 N·m/A rms, R(LL) 865 mΩ, continuous 0.28 N·m, peak 0.9 N·m; drive EV; reflected inertia 0.028 kg·m²; actuator mass ≈ 0.68 kg [est].
* Thermal: continuous rating at derate 0.85 (conduction to structure); winding NTC limit 130 °C warn / 150 °C trip.
* Build class: **build** — custom KM-50x20 motor (or a verified 50 mm frameless kit) + size-14 set. Commercial alternative: CubeMars AK45-36 (24 N·m pk, 0.35 kg, 24 V — needs a 24 V branch) [ds R1].

