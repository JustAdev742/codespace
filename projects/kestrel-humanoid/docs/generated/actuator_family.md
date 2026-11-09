# Actuator family (generated)

Sizing at minimum loaded bus voltage 52 V (16S). Torques/speeds at the actuator output (before linkages). Masses are estimates (motor model/datasheet + gear + housing + electronics) until replaced by CAD masses.

| Class | Joints | Motor (status) | Gear | Ratio | Peak out | Continuous out | No-load speed | Speed @ ½ peak | Reflected inertia | Mass | Drive | Feasible options |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **KA-130K** | knee | KM-130x50-LC (custom KM design) | 2-stage planetary (custom) | 17:1 | 493 N·m | 263 N·m | 12.5 rad/s | 12.1 rad/s | 0.400 kg·m² | 4.96 kg | HC2 | 6 |
| **KA-130H** | hip_pitch | KM-130x50-LC (custom KM design) | 2-stage planetary (custom) | 15:1 | 435 N·m | 232 N·m | 14.2 rad/s | 13.7 rad/s | 0.311 kg·m² | 4.83 kg | HC2 | 8 |
| **KA-110P** | hip_roll, waist_pitch | RI115-PH (datasheet) | 2-stage planetary (custom) | 29:1 | 427 N·m | 125 N·m | 5.7 rad/s | 5.2 rad/s | 0.361 kg·m² | 2.96 kg | EV | 2 |
| **KA-90P** | hip_yaw, waist_yaw, ankle | RI85-PH (datasheet) | 2-stage planetary (custom) | 28:1 | 129 N·m | 44 N·m | 13.1 rad/s | 12.3 rad/s | 0.066 kg·m² | 1.42 kg | EV | 20 |
| **KH-25** | shoulder_pitch, shoulder_roll | KM-115x32-N50 (custom KM design) | C25 machined two-disc cycloid 30:1 | 30:1 | 362 N·m | 119 N·m | 6.3 rad/s | 6.0 rad/s | 0.494 kg·m² | 2.60 kg | EV | 2 |
| **KH-20** | shoulder_yaw, elbow | KM-85x26-N50-4t (custom KM design) | C20 machined two-disc cycloid 30:1 | 30:1 | 158 N·m | 44 N·m | 8.6 rad/s | 8.1 rad/s | 0.107 kg·m² | 1.63 kg | EV | 2 |
| **KH-14** | wrist_yaw, neck_yaw, neck_pitch | KM-50x20 (custom KM design) | CSG-14-50 strain-wave | 50:1 | 34 N·m | 9 N·m | 9.0 rad/s | 8.2 rad/s | 0.028 kg·m² | 0.68 kg | EV | 2 |

Drives: **EV** = Novanta Everest S NET (8-80 V, 45 A cont / 60 A 1 s); **HC2** = 150 A pk / 75 A cont GaN EtherCAT drive, 100 V class (EPC9186HC-class power stage), 16S - Mk II legs.

## Motor data used

| Motor | Kt (N·m/A rms) | R LL (Ω) | Km (N·m/√W) | Cont / peak (N·m) | Mass (kg) | Rotor J (kg·m²) | OD (mm) | Source |
|---|---|---|---|---|---|---|---|---|
| KM-115x32-N50 | 0.252 | 0.0702 | 0.777 | 5.49 / 14.20 | 1.355 | 4.99e-04 | 115 | R10 KA-115R: N50UH, 3t; T_pk @60 A |
| KM-130x50-LC | 0.224 | 0.0203 | 1.286 | 18.85 / 31.50 | 2.615 | 1.26e-03 | 130 | R10 Mk II: Ø130 die, 50 mm stack, N50UH, 3t x 2p, liquid jacket; T_pk @150 A |
| KM-50x20 | 0.106 | 0.8648 | 0.093 | 0.28 / 0.90 | 0.230 | 1.00e-05 | 50 | motor_design.py (calibrated) |
| KM-85x26-N50-4t | 0.186 | 0.1461 | 0.396 | 2.01 / 6.18 | 0.642 | 1.08e-04 | 85 | R10 KH-C25 |
| RI115-PH | 0.290 | 0.1340 | 0.647 | 5.50 / 16.00 | 1.108 | 3.90e-04 | 115 | CubeMars 2026 catalogue |
| RI85-PH | 0.130 | 0.1385 | 0.285 | 2.00 / 5.00 | 0.411 | 7.70e-05 | 85 | CubeMars 2026 catalogue |

## Knee four-bar

Crank r1 = 70.0 mm (actuator), rod L = 252.9 mm, knee crank r2 = 73.7 mm at 229.4° (shank frame), actuator crank zero at 277.1°, actuator sweep 144°.

| Knee angle | 0° | 20° | 40° | 60° | 80° | 100° | 120° | 130° |
|---|---|---|---|---|---|---|---|---|
| G = τ_knee/τ_act | 1.33 | 0.86 | 0.87 | 0.98 | 1.17 | 1.38 | 1.43 | 1.18 |
| transmission angle μ | 152° | 142° | 128° | 112° | 91° | 66° | 36° | 20° |

## Ankle and wrist parallel linkages

Ankle: actuator crank r_c = 40 mm, foot lever r_p = 52 mm, half rod spacing d = 36 mm. Per-actuator torque = r_c(|τp|/2r_p + |τr|/2d): full-authority corner 115 N·m.

