# Scratch-build motor family (generated)

A custom motor for every actuator class, sized to match (or replace) the motor chosen in the baseline. Model: calc/kestrel/motor_design.py, calibrated against RI115-PH and ILM115x25; at Ø85 it reproduces ILM85x26 / RI85-PH / ILM85x13 Km within ±6 %. Confirm every design in FEMM before cutting laminations (docs/13 §3.1).

| Motor | For | Stator OD × stack | Slots/poles | Turns × paths | Kt (N·m/A) | R LL 20 °C (mΩ) | Km | Cont / peak (N·m) | No-load @52 V (rpm) | Mass (kg) | Baseline equivalent |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **KM-130x45** | KA-130K knee | Ø130 × 45 | 36/42 | 5 × 2 | 0.310 | 33 | 1.186 | 10.78 / 34.8 | 1964 | 2.32 | custom (no commercial equivalent verified) |
| **KM-130x40** | KA-130H hip pitch | Ø130 × 40 | 36/42 | 3 × 1 | 0.330 | 43 | 1.101 | 9.59 / 31.0 | 1841 | 2.08 | custom |
| **KM-85x26** | KA-110P (replaces TQ ILM85x26) | Ø85 × 26 | 36/42 | 6 × 1 | 0.256 | 211 | 0.386 | 1.96 / 6.3 | 2372 | 0.63 | ILM85x26: Kt 0.253, Km 0.365 (calc) |
| **KM-85x17** | KA-90P, KH-20 (replaces CubeMars RI85-PH) | Ø85 × 17 | 36/42 | 5 × 1 | 0.140 | 109 | 0.292 | 1.28 / 4.1 | 4354 | 0.43 | RI85-PH: Kt 0.13, Km 0.285 |
| **KM-85x12** | KH-25 (replaces TQ ILM85x13) | Ø85 × 12 | 36/42 | 7 × 1 | 0.138 | 174 | 0.229 | 0.91 / 2.9 | 4406 | 0.31 | ILM85x13: Kt 0.134, Km 0.233 (calc) |
| **KM-50x20** | KH-14 wrist yaw, neck | Ø50 × 20 | 12/14 | 18 × 1 | 0.106 | 621 | 0.093 | 0.28 / 0.9 | 5713 | 0.23 | custom |

## Lamination and winding geometry

| Motor | Airgap Ø (mm) | Tooth width | Yoke | Slot depth | Slot area | Conductor equiv. Ø | Magnet arc × thickness × length | Rotor OD/ID |
|---|---|---|---|---|---|---|---|---|
| KM-130x45 | 96.2 | 5.4 | 2.1 | 13.3 | 59 mm² | 1.78 mm | 7.29° × 3.0 × 45 mm (×42) | 95.6 / 85.9 |
| KM-130x40 | 96.2 | 5.4 | 2.1 | 13.3 | 59 mm² | 2.30 mm | 7.29° × 3.0 × 40 mm (×42) | 95.6 / 85.9 |
| KM-85x26 | 59.5 | 3.2 | 1.2 | 10.0 | 31 mm² | 1.18 mm | 7.29° × 2.5 × 26 mm (×42) | 58.9 / 51.7 |
| KM-85x17 | 59.5 | 3.2 | 1.2 | 10.0 | 31 mm² | 1.29 mm | 7.29° × 2.5 × 17 mm (×42) | 58.9 / 51.7 |
| KM-85x12 | 59.5 | 3.2 | 1.2 | 10.0 | 31 mm² | 1.09 mm | 7.29° × 2.5 × 12 mm (×42) | 58.9 / 51.7 |
| KM-50x20 | 31.0 | 5.2 | 2.0 | 6.1 | 32 mm² | 0.69 mm | 21.86° × 2.0 × 20 mm (×14) | 30.6 / 23.0 |

## Winding layouts (double-layer tooth coils, coil k wound around tooth k; star connection)

**36 slots / 42 poles** (kw1 = 0.933). '+' = wind clockwise seen from the lead end, '−' = counter-clockwise. Connect all coils of one phase in series (or in the stated parallel paths), observing the sign, then join the three phase ends in a star.

`T01:+A  T02:+B  T03:-B  T04:-C  T05:+C  T06:+A  T07:-A  T08:-B  T09:+B  T10:+C  T11:-C  T12:-A`  
`T13:+A  T14:+B  T15:-B  T16:-C  T17:+C  T18:+A  T19:-A  T20:-B  T21:+B  T22:+C  T23:-C  T24:-A`  
`T25:+A  T26:+B  T27:-B  T28:-C  T29:+C  T30:+A  T31:-A  T32:-B  T33:+B  T34:+C  T35:-C  T36:-A`  

**12 slots / 14 poles** (kw1 = 0.933). '+' = wind clockwise seen from the lead end, '−' = counter-clockwise. Connect all coils of one phase in series (or in the stated parallel paths), observing the sign, then join the three phase ends in a star.

`T01:+A  T02:+B  T03:-B  T04:-C  T05:+C  T06:+A  T07:-A  T08:-B  T09:+B  T10:+C  T11:-C  T12:-A`  

