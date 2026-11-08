# Actuator family (generated)

Sizing at minimum loaded bus voltage 52 V (16S). Torques/speeds at the actuator output (before linkages). Masses are estimates (motor model/datasheet + gear + housing + electronics) until replaced by CAD masses.

| Class | Joints | Motor (status) | Gear | Ratio | Peak out | Continuous out | No-load speed | Speed @ ½ peak | Reflected inertia | Mass | Drive | Feasible options |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **KA-130K** | knee | KM-130x45 (custom KM design) | 2-stage planetary (custom) | 14:1 | 395 N·m | 139 N·m | 11.0 rad/s | 10.4 rad/s | 0.237 kg·m² | 4.22 kg | HC | 2 |
| **KA-130H** | hip_pitch | KM-130x40 (custom KM design) | 2-stage planetary (custom) | 14:1 | 399 N·m | 123 N·m | 10.3 rad/s | 9.6 rad/s | 0.210 kg·m² | 3.78 kg | HC | 7 |
| **KA-110P** | hip_roll, waist_pitch | ILM85x26 (datasheet) | 2-stage planetary (custom) | 32:1 | 276 N·m | 73 N·m | 5.9 rad/s | 5.1 rad/s | 0.141 kg·m² | 1.82 kg | EV | 50 |
| **KA-90P** | hip_yaw, waist_yaw, ankle | RI85-PH (datasheet) | 2-stage planetary (custom) | 23:1 | 106 N·m | 36 N·m | 16.0 rad/s | 15.0 rad/s | 0.045 kg·m² | 1.37 kg | EV | 44 |
| **KH-25** | shoulder_pitch, shoulder_roll | ILM85x13 (datasheet) | CSG-25-50 strain-wave | 50:1 | 175 N·m | 46 N·m | 7.1 rad/s | 6.5 rad/s | 0.195 kg·m² | 1.38 kg | EV | 2 |
| **KH-20** | shoulder_yaw, elbow | RI85-PH (datasheet) | CSG-20-50 strain-wave | 50:1 | 188 N·m | 64 N·m | 7.3 rad/s | 6.9 rad/s | 0.212 kg·m² | 1.25 kg | EV | 1 |
| **KH-14** | wrist_yaw, neck_yaw, neck_pitch | KM-50x20 (custom KM design) | CSG-14-50 strain-wave | 50:1 | 34 N·m | 9 N·m | 9.0 rad/s | 8.2 rad/s | 0.028 kg·m² | 0.68 kg | EV | 2 |

Drives: **HC** = high-current 100 V EtherCAT drive (Elmo Platinum Twitter R70/100 class, or custom GaN per TIDA-010979); **EV** = Novanta Everest S NET (8-80 V, 45 A cont / 60 A 1 s).

## Motor data used

| Motor | Kt (N·m/A rms) | R LL (Ω) | Km (N·m/√W) | Cont / peak (N·m) | Mass (kg) | Rotor J (kg·m²) | OD (mm) | Source |
|---|---|---|---|---|---|---|---|---|
| ILM85x13 | 0.134 | 0.2200 | 0.233 | 1.44 / 4.66 | 0.400 | 7.10e-05 | 85 | TQ-RoboDrive |
| ILM85x26 | 0.253 | 0.3200 | 0.365 | 2.90 / 9.37 | 0.670 | 1.25e-04 | 85 | TQ-RoboDrive |
| KM-130x40 | 0.330 | 0.0601 | 1.101 | 9.59 / 30.96 | 2.076 | 9.76e-04 | 130 | motor_design.py (calibrated) |
| KM-130x45 | 0.310 | 0.0455 | 1.186 | 10.78 / 34.83 | 2.318 | 1.10e-03 | 130 | motor_design.py (calibrated) |
| KM-50x20 | 0.106 | 0.8648 | 0.093 | 0.28 / 0.90 | 0.230 | 1.00e-05 | 50 | motor_design.py (calibrated) |
| RI85-PH | 0.130 | 0.1385 | 0.285 | 2.00 / 5.00 | 0.411 | 7.70e-05 | 85 | CubeMars 2026 catalogue |

## Knee four-bar

Crank r1 = 70.0 mm (actuator), rod L = 252.9 mm, knee crank r2 = 73.7 mm at 229.4° (shank frame), actuator crank zero at 277.1°, actuator sweep 144°.

| Knee angle | 0° | 20° | 40° | 60° | 80° | 100° | 120° | 130° |
|---|---|---|---|---|---|---|---|---|
| G = τ_knee/τ_act | 1.33 | 0.86 | 0.87 | 0.98 | 1.17 | 1.38 | 1.43 | 1.18 |
| transmission angle μ | 152° | 142° | 128° | 112° | 91° | 66° | 36° | 20° |

## Ankle and wrist parallel linkages

Ankle: actuator crank r_c = 40 mm, foot lever r_p = 52 mm, half rod spacing d = 36 mm. Per-actuator torque = r_c(|τp|/2r_p + |τr|/2d): full-authority corner 94 N·m.

