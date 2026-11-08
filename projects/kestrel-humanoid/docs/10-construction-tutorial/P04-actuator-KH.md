# P04 — KH strain-wave actuators (KH-25, KH-20, KH-14)

## A. Visual reference
* KH-25 cutaway: [`renders/20_KH25_cutaway.png`](../../renders/20_KH25_cutaway.png)
* STEP profiles: `cad/out/step/kh25__*.step`
* Envelope plots: [`docs/img/envelope_KH-25.png`](../img/envelope_KH-25.png), `envelope_KH-20.png`, `envelope_KH-14.png`

```
 output flange ─ torque flexure (Ti, 4 strain gauges) ─ crossed-roller ─ flexspline cup (output)
 circular spline (fixed) ─ wave generator (elliptical plug + flexible bearing) on the hollow rotor hub
 stator ─ rotor ─ motor encoder ─ drive carrier ─ rear cap ─ Ø12 cable bore
```

## B. Parts list (per actuator)

| BOM | Item | KH-25 | KH-20 | KH-14 |
|---|---|---|---|---|
| B005 / B004 / B006 | Motor: TQ ILM85x13 / RI85-PH / KM-50x20 | 1 | 1 | 1 |
| B010 / B011 / B012 | Leaderdrive LHSG size 25 / 20 / 14, 50:1 component set (WG, FS, CS) | 1 | 1 | 1 |
| B015 | Crossed-roller output bearing | 1 | 1 | 1 |
| B016 | Rotor bearings | 2 | 2 | 2 |
| B017, B018 | AksIM-2 output + MT6835 motor encoder | 1 + 1 | 1 + 1 | 1 + 1 |
| B019 | Torque flexure kit: 4 × HBK XY41 shear gauges, ADS1262 on the carrier | 1 | 1 | — |
| B023 | Housing set incl. Ti flexure (KH-25/20) | 1 | 1 | 1 |
| B026 + B027 | Everest S NET + carrier | 1 | 1 | 1 |
| — | Strain-wave grease (Harmonic Grease SK-1A class or the vendor's recommendation), gauge adhesive (M-Bond 610 class), protective coating (M-Coat) | — | — | — |

## C. Tools
As P03, plus a strain-gauge bonding kit (clamps, Teflon tape, curing oven 120–175 °C for M-Bond 610), a fine soldering iron, a gauge installation tester.

## D. Manufacturing
* **Torque flexure (KH-25/20):** Ti-6Al-4V, 4 radial spokes (cross-section sized for 200 µε at the
  repeated-peak torque: 127 N·m KH-25, 73 N·m KH-20; check by FEA). Gauge pads ground flat, Ra ≤ 0.8.
* **Housings:** tolerances per the Leaderdrive/Harmonic installation drawing. These are critical:
  - circular spline and wave generator concentricity ≤ 0.01 mm;
  - perpendicularity of the mounting faces ≤ 0.01 mm;
  - the flexspline must have axial room to "breathe".

## E. Assembly
1. **Strain gauges first:**
   - Bond 4 shear gauges on the flexure spokes at ±45° to form a full Wheatstone bridge. The bridge is
     insensitive to bending and temperature when the gauges are matched.
   - Cure per the adhesive data sheet, wire to the 4-pin flexure connector and coat.
   - Measure the bridge: 350 Ω ± 0.5 %, insulation > 10 GΩ.
2. Motor stator and rotor as in P03 steps 2–5.
3. **Wave generator onto the rotor hub** (keyed, Loctite 638).
4. **Circular spline into the front housing** (dowelled, screws to spec). **Flexspline:** bolt the cup
   bottom to the crossed-roller inner ring/output carrier through the flexure, then torque to the
   vendor's value.
5. **Mesh:** grease the flexspline teeth and the wave-generator bearing per the vendor's quantity.
   Insert the wave generator into the flexspline at the vendor's specified orientation. Check the mesh
   by rotating: it must be smooth, with **no "dedoidal" (off-by-one-tooth) assembly**. Follow the
   vendor's alignment check exactly, because an incorrect mesh destroys the gear.
6. AksIM-2 ring on the output, readhead on the housing; motor encoder at the rear.
7. Close, seal and flange as P03 (KH-25 output 8 × M4 at 4.5 N·m; KH-20 8 × M3 at 2.0 N·m; KH-14 6 × M3).

## F. Electrical
As P03, plus the flexure bridge → ADS1262 on the carrier (excitation 5 V, gain 32, 1 kSPS, sinc3 filter).

## G. Testing (gate G1)
| Test | Pass |
|---|---|
| Kt at the output, efficiency (η model 0.75) | measured η recorded; feed it back into `calc` |
| **Firmware torque limit** set to the gear's repeated-peak rating (127 / 73 / 23 N·m) and verified on the dyno | limit holds within ±5 % |
| Torque flexure calibration: ±full scale with lever + weights | linearity ≤ 1 % FS, hysteresis ≤ 0.5 % FS |
| Backlash / lost motion (dual encoder) | ≤ 1 arcmin (strain-wave) |
| Collision detection: strike a padded pendulum into the output link at 1 rad/s | flexure detects within 5 ms; controller backs off |
| Thermal: continuous torque (46 / 64 / 9 N·m) at 2 rad/s to steady state | winding ≤ 120 °C |
| Endurance: 10⁵ reach cycles at the arm torque profile | no ratcheting, lost motion growth < 0.5 arcmin |
