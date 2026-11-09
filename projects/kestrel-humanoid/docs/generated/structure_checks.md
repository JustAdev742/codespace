# Structural hand checks (generated)

Cases: **N** normal repeated peak (x1.2 margin), **M** momentary (0.10 m unplanned drop), **X** structural (0.15 m drop over 0.10 m). Required SF: X >= 1.5 on yield, N >= 2.0 (fatigue values shown directly against endurance strength). These are hand calculations to set section sizes; FEA and proof loading (docs/11) are mandatory before walking trials.

| Item | Case | Load | Value | Allowable | SF | Note |
|---|---|---|---|---|---|---|
| Knee push-rod, Ti-6Al-4V tube 16x2 mm, axial stress | N | 6.8 kN | 77.6 MPa | 880.0 MPa | **11.34** |  |
| Knee push-rod Euler buckling (pinned, L=253 mm) | N | 6.8 kN | 6.8 kN | 38.6 kN | **5.66** | Pcr |
| Knee push-rod, Ti-6Al-4V tube 16x2 mm, axial stress | X | 8.8 kN | 100.4 MPa | 880.0 MPa | **8.76** |  |
| Knee push-rod Euler buckling (pinned, L=253 mm) | X | 8.8 kN | 8.8 kN | 38.6 kN | **4.37** | Pcr |
| Knee rod ends: M12 PTFE-lined spherical (e.g. SKF SIKAC 12 M class, C0 ~ 30 kN, verify) | X | 8.8 kN | 8.8 kN | 30.0 kN | **3.40** | static rating - confirm with chosen part |
| Thigh twin plates 2x 6x60 mm 7075-T6, bending at knee-reaction moment | X | 615 N m | 85.5 MPa | 503.0 MPa | **5.89** |  |
| Thigh plates, fatigue at repeated knee torque | N | 431 N m | 59.8 MPa | 159.0 MPa | **2.66** | R=-1 conservative |
| Shank CFRP tube 40x2 mm, bending at ankle | X | 300 N m | 139.1 MPa | 350.0 MPa | **2.52** |  |
| Shank CFRP tube axial compression in X drop | X | 2.76 kN | 11.6 MPa | 350.0 MPa | **30.24** |  |
| KA-130K output flange: 12x M5 12.9 on PCD 105 mm, slip torque (mu 0.15) | M | 535 N m | 535.0 N m | 935.5 N m | **1.75** | plus 2 dowels for location; slip = overload fuse |
| KA-110P output flange: 10x M4 12.9 on PCD 85 mm, slip torque (mu 0.15) | M | 379 N m | 379.2 N m | 439.9 N m | **1.16** ⚠ | plus 2 dowels for location; slip = overload fuse |
| KA-90P output flange: 8x M4 12.9 on PCD 75 mm, slip torque (mu 0.15) | M | 149 N m | 149.4 N m | 310.5 N m | **2.08** | plus 2 dowels for location; slip = overload fuse |
| Ankle cross pins Ti-6Al-4V D12, double shear (X drop GRF) | X | 2.76 kN | 12.2 MPa | 510.4 MPa | **41.77** |  |
| Foot plate 7075-T6 10 mm ribbed, toe cantilever at 1.5 g | N | 199 N m | 54.3 MPa | 159.0 MPa | **2.93** |  |
| KA-130K stage-2 sun teeth, Lewis bending (m 1.25, b 18, 4 planets, 17-4PH/18CrNiMo7-6) | M | 493 N m out | 540.6 MPa | 1170.0 MPa | **2.16** | carburised 18CrNiMo7-6 preferred (sy > 1000 MPa); AGMA check in FEA phase |
| KA-130K output crossed-roller L10 life at walking load (oscillating, 30 rpm equiv.) | N | P_eq 3.5 kN | 3000.0 h | 734810.8 h | **244.94** | required >= 3000 h; value = L10 hours |
