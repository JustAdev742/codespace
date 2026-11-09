# Structural hand checks (generated)

Cases: **N** normal repeated peak (x1.2 margin), **M** momentary (0.10 m unplanned drop), **X** structural (0.15 m drop over 0.10 m). Required SF: X >= 1.5 on yield, N >= 2.0 (fatigue values shown directly against endurance strength). These are hand calculations to set section sizes; FEA and proof loading (docs/11) are mandatory before walking trials.

| Item | Case | Load | Value | Allowable | SF | Note |
|---|---|---|---|---|---|---|
| Knee push-rod, Ti-6Al-4V tube 16x2 mm, axial stress | N | 6.9 kN | 78.3 MPa | 880.0 MPa | **11.24** |  |
| Knee push-rod Euler buckling (pinned, L=253 mm) | N | 6.9 kN | 6.9 kN | 38.6 kN | **5.61** | Pcr |
| Knee push-rod, Ti-6Al-4V tube 16x2 mm, axial stress | X | 8.9 kN | 101.3 MPa | 880.0 MPa | **8.69** |  |
| Knee push-rod Euler buckling (pinned, L=253 mm) | X | 8.9 kN | 8.9 kN | 38.6 kN | **4.33** | Pcr |
| Knee rod ends: M12 PTFE-lined spherical (e.g. SKF SIKAC 12 M class, C0 ~ 30 kN, verify) | X | 8.9 kN | 8.9 kN | 30.0 kN | **3.37** | static rating - confirm with chosen part |
| Knee push-rod at the drive torque limit, whole range 0-130 deg: rod-end static | M | 12.0 kN max | 12.0 kN | 30.0 kN | **2.50** | C0 ~ 30 kN, verify with chosen part (H7) |
| Knee push-rod at the drive torque limit, whole range 0-130 deg: Euler buckling | M | 12.0 kN max | 12.0 kN | 38.6 kN | **3.22** | Pcr (H7) |
| Knee: joint torque available under the limit table vs every simulated sample (x1.2; SD, LM x1.0) | N | SD at 77 deg | 490.7 N m | 540.0 N m | **1.10** | required >= 1.0; per-scenario table in data/knee_torque_limit.json (H7) |
| Thigh twin plates 2x 6x60 mm 7075-T6, bending at knee-reaction moment | X | 621 N m | 86.2 MPa | 503.0 MPa | **5.83** |  |
| Thigh plates, fatigue at repeated knee torque | N | 434 N m | 60.3 MPa | 159.0 MPa | **2.64** | R=-1 conservative |
| Shank CFRP tube 40x2 mm, bending at ankle | X | 302 N m | 139.6 MPa | 350.0 MPa | **2.51** |  |
| Shank CFRP tube axial compression in X drop | X | 2.78 kN | 11.6 MPa | 350.0 MPa | **30.06** |  |
| KA-130K output flange: 12x M5 12.9 on PCD 105 mm, slip torque (mu 0.15) | M | 540 N m | 539.8 N m | 935.5 N m | **1.73** | plus 2 dowels for location; slip = overload fuse |
| KA-110P output flange: 12x M5 12.9 on PCD 100 mm, slip torque (mu 0.15) | M | 378 N m | 378.0 N m | 891.0 N m | **2.36** | plus 2 dowels for location; slip = overload fuse |
| KA-90P output flange: 8x M4 12.9 on PCD 75 mm, slip torque (mu 0.15) | M | 150 N m | 150.0 N m | 310.5 N m | **2.07** | plus 2 dowels for location; slip = overload fuse |
| Ankle cross pins 100Cr6 60-64 HRC D12 ground, double shear (X drop GRF) | X | 2.78 kN | 12.3 MPa | 812.0 MPa | **66.06** |  |
| Foot plate 7075-T6 10 mm ribbed, toe cantilever at 1.5 g | N | 200 N m | 54.6 MPa | 159.0 MPa | **2.91** |  |
| KA-130K stage-2 sun teeth, Lewis bending (m 1.25, b 18, 4 planets, 17-4PH/18CrNiMo7-6) | M | 493 N m out | 540.6 MPa | 1170.0 MPa | **2.16** | carburised 18CrNiMo7-6 preferred (sy > 1000 MPa); AGMA check in FEA phase |
| KA-130K output crossed-roller THK RB9016 L10 life at walking load (oscillating, 30 rpm equiv.) | N | P_eq 3.5 kN | 3000.0 h | 990401.5 h | **330.13** | required >= 3000 h; value = L10 hours |

## Knee drive torque limit (hold H7)

τ_act ≤ min(493 N·m, 540 / G(θ), 12 kN · r2 · |sin μ(θ)| / G(θ)). Full table: `data/knee_torque_limit.json`.

| Knee angle | 0° | 20° | 40° | 60° | 80° | 100° | 120° | 130° |
|---|---|---|---|---|---|---|---|---|
| G(θ) | 1.33 | 0.86 | 0.87 | 0.98 | 1.17 | 1.38 | 1.43 | 1.18 |
| Transmission angle μ | 152° | 142° | 128° | 112° | 91° | 66° | 36° | 20° |
| **Actuator limit (N·m)** | 309 | 493 | 493 | 493 | 463 | 391 | 362 | 253 |
| Joint torque available (N·m) | 410 | 422 | 427 | 484 | 540 | 540 | 517 | 300 |

Worst sample per scenario against that table (demand includes the 1.2 margin; SD and LM 1.0):

| Scenario | Knee angle | Demand | Available | Ratio |
|---|---|---|---|---|
| SD | 77° | 491 N·m | 540 N·m | **1.10** |
| ST | 94° | 434 N·m | 540 N·m | **1.24** |
| SU | 107° | 411 N·m | 540 N·m | **1.31** |
| W2 | 62° | 345 N·m | 492 N·m | **1.43** |
| W1 | 51° | 255 N·m | 453 N·m | **1.78** |
| DS | 125° | 219 N·m | 412 N·m | **1.88** |
| CW | 61° | 248 N·m | 486 N·m | **1.96** |
| SL | 46° | 187 N·m | 439 N·m | **2.34** |
| SQ | 105° | 192 N·m | 540 N·m | **2.81** |
| LM | 103° | 160 N·m | 540 N·m | **3.37** |
| AO | 42° | 104 N·m | 430 N·m | **4.15** |
| AF | 42° | 102 N·m | 430 N·m | **4.23** |
| TB | 41° | 96 N·m | 429 N·m | **4.49** |
| AL | 41° | 96 N·m | 429 N·m | **4.49** |
| AS | 41° | 94 N·m | 429 N·m | **4.55** |
| NK | 41° | 84 N·m | 429 N·m | **5.10** |
| AH | 39° | 31 N·m | 425 N·m | **13.62** |
