# Structural hand checks (generated)

Cases: **N** normal repeated peak (x1.2 margin), **M** momentary (0.10 m unplanned drop), **X** structural (0.15 m drop over 0.10 m). Required SF: X >= 1.5 on yield, N >= 2.0 (fatigue values shown directly against endurance strength). These are hand calculations to set section sizes; FEA and proof loading (docs/11) are mandatory before walking trials.

| Item | Case | Load | Value | Allowable | SF | Note |
|---|---|---|---|---|---|---|
| Knee push-rod, Ti-6Al-4V tube 16x2 mm, axial stress | N | 6.9 kN | 78.1 MPa | 880.0 MPa | **11.27** |  |
| Knee push-rod Euler buckling (pinned, L=253 mm) | N | 6.9 kN | 6.9 kN | 38.6 kN | **5.62** | Pcr |
| Knee push-rod, Ti-6Al-4V tube 16x2 mm, axial stress | X | 9.0 kN | 101.8 MPa | 880.0 MPa | **8.64** |  |
| Knee push-rod Euler buckling (pinned, L=253 mm) | X | 9.0 kN | 9.0 kN | 38.6 kN | **4.31** | Pcr |
| Knee rod ends: M12 PTFE-lined spherical (e.g. SKF SIKAC 12 M class, C0 ~ 30 kN, verify) | X | 9.0 kN | 9.0 kN | 30.0 kN | **3.35** | static rating - confirm with chosen part |
| Knee push-rod at the drive torque limit, whole range 0-130 deg: rod-end static | M | 12.0 kN max | 12.0 kN | 30.0 kN | **2.50** | C0 ~ 30 kN, verify with chosen part (H7) |
| Knee push-rod at the drive torque limit, whole range 0-130 deg: Euler buckling | M | 12.0 kN max | 12.0 kN | 38.6 kN | **3.22** | Pcr (H7) |
| Knee joint firmware cap vs the momentary requirement | M | 542 N m | 542.0 N m | 545.0 N m | **1.01** | the cap must stay >= the requirement; raise it (and re-check) if not |
| Knee: joint torque available under the limit table vs every simulated sample (x1.2; SD, LM x1.0) | N | SD at 77 deg | 492.7 N m | 545.0 N m | **1.11** | required >= 1.0; per-scenario table in data/knee_torque_limit.json (H7) |
| Thigh twin plates 2x 6x60 mm 7075-T6, bending at knee-reaction moment | X | 623 N m | 86.6 MPa | 503.0 MPa | **5.81** |  |
| Thigh plates, fatigue at repeated knee torque | N | 433 N m | 60.2 MPa | 159.0 MPa | **2.64** | R=-1 conservative |
| Shank CFRP tube 40x2 mm, bending at ankle | X | 325 N m | 150.4 MPa | 350.0 MPa | **2.33** |  |
| Shank CFRP tube axial compression in X drop | X | 2.79 kN | 11.7 MPa | 350.0 MPa | **29.98** |  |
| KA-130K output flange: 12x M5 12.9 on PCD 105 mm, slip torque (mu 0.15) | M | 542 N m | 542.0 N m | 935.5 N m | **1.73** | plus 2 dowels for location; slip = overload fuse |
| KA-110P output flange: 12x M5 12.9 on PCD 100 mm, slip torque (mu 0.15) | M | 381 N m | 380.7 N m | 891.0 N m | **2.34** | plus 2 dowels for location; slip = overload fuse |
| KA-90P output flange: 8x M4 12.9 on PCD 75 mm, slip torque (mu 0.15) | M | 159 N m | 159.1 N m | 310.5 N m | **1.95** | plus 2 dowels for location; slip = overload fuse |
| Ankle cross pins 100Cr6 60-64 HRC D12 ground, double shear (X drop GRF) | X | 2.79 kN | 12.3 MPa | 812.0 MPa | **65.89** |  |
| Foot plate 7075-T6 10 mm ribbed, toe cantilever at 1.5 g | N | 201 N m | 54.7 MPa | 159.0 MPa | **2.90** |  |
| KA-130K stage-2 sun teeth, Lewis bending (m 1.25, b 18, 4 planets, 17-4PH/18CrNiMo7-6) | M | 493 N m out | 540.6 MPa | 1170.0 MPa | **2.16** | carburised 18CrNiMo7-6 preferred (sy > 1000 MPa); AGMA check in FEA phase |
| KA-130K output crossed-roller THK RB9016 L10 life at walking load (oscillating, 30 rpm equiv.) | N | P_eq 3.5 kN | 3000.0 h | 987207.7 h | **329.07** | required >= 3000 h; value = L10 hours |

## Knee drive torque limit (hold H7)

τ_act ≤ min(493 N·m, 545 / G(θ), 12 kN · r2 · |sin μ(θ)| / G(θ)). Full table: `data/knee_torque_limit.json`.

| Knee angle | 0° | 20° | 40° | 60° | 80° | 100° | 120° | 130° |
|---|---|---|---|---|---|---|---|---|
| G(θ) | 1.33 | 0.86 | 0.87 | 0.98 | 1.17 | 1.38 | 1.43 | 1.18 |
| Transmission angle μ | 152° | 142° | 128° | 112° | 91° | 66° | 36° | 20° |
| **Actuator limit (N·m)** | 309 | 493 | 493 | 493 | 467 | 395 | 362 | 253 |
| Joint torque available (N·m) | 410 | 422 | 427 | 484 | 545 | 545 | 517 | 300 |

Worst sample per scenario against that table (demand includes the 1.2 margin; SD and LM 1.0):

| Scenario | Knee angle | Demand | Available | Ratio |
|---|---|---|---|---|
| SD | 77° | 493 N·m | 545 N·m | **1.11** |
| ST | 94° | 433 N·m | 545 N·m | **1.26** |
| SU | 107° | 410 N·m | 545 N·m | **1.33** |
| W2 | 62° | 351 N·m | 492 N·m | **1.40** |
| W1 | 51° | 258 N·m | 453 N·m | **1.76** |
| DS | 125° | 218 N·m | 413 N·m | **1.90** |
| CW | 61° | 252 N·m | 486 N·m | **1.93** |
| SL | 46° | 188 N·m | 439 N·m | **2.34** |
| SQ | 105° | 191 N·m | 545 N·m | **2.85** |
| LM | 103° | 159 N·m | 545 N·m | **3.42** |
| AO | 42° | 103 N·m | 430 N·m | **4.18** |
| AF | 42° | 103 N·m | 430 N·m | **4.19** |
| TB | 41° | 96 N·m | 429 N·m | **4.47** |
| AL | 41° | 96 N·m | 429 N·m | **4.49** |
| AS | 41° | 94 N·m | 429 N·m | **4.54** |
| NK | 41° | 84 N·m | 429 N·m | **5.09** |
| AH | 39° | 31 N·m | 425 N·m | **13.60** |
