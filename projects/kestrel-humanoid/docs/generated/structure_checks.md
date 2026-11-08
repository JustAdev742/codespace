# Structural hand checks (generated)

Cases: **N** normal repeated peak (x1.2 margin), **M** momentary (0.10 m unplanned drop), **X** structural (0.15 m drop over 0.10 m). Required SF: X >= 1.5 on yield, N >= 2.0 (fatigue values shown directly against endurance strength). These are hand calculations to set section sizes; FEA and proof loading (docs/11) are mandatory before walking trials.

| Item | Case | Load | Value | Allowable | SF | Note |
|---|---|---|---|---|---|---|
| Knee push-rod, Ti-6Al-4V tube 16x2 mm, axial stress | N | 5.6 kN | 63.4 MPa | 880.0 MPa | **13.87** |  |
| Knee push-rod Euler buckling (pinned, L=299 mm) | N | 5.6 kN | 5.6 kN | 27.6 kN | **4.95** | Pcr |
| Knee push-rod, Ti-6Al-4V tube 16x2 mm, axial stress | X | 7.0 kN | 79.3 MPa | 880.0 MPa | **11.10** |  |
| Knee push-rod Euler buckling (pinned, L=299 mm) | X | 7.0 kN | 7.0 kN | 27.6 kN | **3.96** | Pcr |
| Knee rod ends: M12 PTFE-lined spherical (e.g. SKF SIKAC 12 M class, C0 ~ 30 kN, verify) | X | 7.0 kN | 7.0 kN | 30.0 kN | **4.30** | static rating - confirm with chosen part |
| Thigh twin plates 2x 6x60 mm 7075-T6, bending at knee-reaction moment | X | 490 N m | 68.0 MPa | 503.0 MPa | **7.39** |  |
| Thigh plates, fatigue at repeated knee torque | N | 351 N m | 48.7 MPa | 159.0 MPa | **3.27** | R=-1 conservative |
| Shank CFRP tube 40x2 mm, bending at ankle | X | 257 N m | 118.8 MPa | 350.0 MPa | **2.95** |  |
| Shank CFRP tube axial compression in X drop | X | 2.26 kN | 9.5 MPa | 350.0 MPa | **36.98** |  |
| KA-130K output flange: 12x M5 12.9 on PCD 105 mm, slip torque (mu 0.15) | M | 426 N m | 426.0 N m | 935.5 N m | **2.20** | plus 2 dowels for location; slip = overload fuse |
| KA-110P output flange: 10x M4 12.9 on PCD 85 mm, slip torque (mu 0.15) | M | 205 N m | 205.1 N m | 439.9 N m | **2.14** | plus 2 dowels for location; slip = overload fuse |
| KA-90P output flange: 8x M4 12.9 on PCD 75 mm, slip torque (mu 0.15) | M | 126 N m | 126.3 N m | 310.5 N m | **2.46** | plus 2 dowels for location; slip = overload fuse |
| Ankle cross pins Ti-6Al-4V D12, double shear (X drop GRF) | X | 2.26 kN | 10.0 MPa | 510.4 MPa | **51.08** |  |
| Foot plate 7075-T6 10 mm ribbed, toe cantilever at 1.5 g | N | 163 N m | 44.4 MPa | 159.0 MPa | **3.58** |  |
| KA-130K stage-2 sun teeth, Lewis bending (m 1.25, b 18, 4 planets, 17-4PH/18CrNiMo7-6) | M | 395 N m out | 433.4 MPa | 1170.0 MPa | **2.70** | carburised 18CrNiMo7-6 preferred (sy > 1000 MPa); AGMA check in FEA phase |
| KA-130K output crossed-roller L10 life at walking load (oscillating, 30 rpm equiv.) | N | P_eq 2.8 kN | 3000.0 h | 1519101.1 h | **506.37** | required >= 3000 h; value = L10 hours |
