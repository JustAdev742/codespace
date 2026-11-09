# P03 — KA-90P and KA-110P planetary actuators (first articles, then series)

Mk II values (`docs/generated/actuator_family.md`):

| Class | Joints (units) | Motor | Ratio | Peak / continuous out | No-load speed | Mass | Drive |
|---|---|---|---|---|---|---|---|
| **KA-90P** | hip yaw ×2, waist yaw, ankle ×4 (7) | CubeMars RI85-PH | 28:1 | 129 / 44 N·m | 13.1 rad/s | 1.41 kg | Everest S NET |
| **KA-110P** | hip roll ×2, waist pitch (3) | CubeMars **RI115-PH** | 29:1 | **427 / 125 N·m** | 5.7 rad/s | 2.96 kg | Everest S NET |

KA-110P is no longer a stretched KA-90P: it has a Ø115 motor, an Ø≈127 mm housing, a 4-planet output stage and the
**12× M5 12.9 output flange on PCD 100** (K1's 10× M4 flange would slip at 440 N·m against the 379 N·m waist-pitch
momentary torque).

## A. Visual reference
* Architecture of the KA family (same layout as the KA-130K cutaway, smaller): [`renders/18_KA130K_cutaway.png`](../../renders/18_KA130K_cutaway.png), [`renders/19_KA130K_exploded.png`](../../renders/19_KA130K_exploded.png)
* Envelope plots: [`docs/img/envelope_KA-90P.png`](../img/envelope_KA-90P.png), [`envelope_KA-110P.png`](../img/envelope_KA-110P.png)
* Gear tables, fits and flange standards: [docs/09 §2, §4, §5.1](../09-manufacturing-package.md)
* Section (axial stack, output at top):

```
  output flange (KA-90P 8× M4 PCD 75 | KA-110P 12× M5 PCD 100) ─ radial lip seal
  crossed roller THK RB6013 ─ stage-2 carrier (output) + output AksIM-2 ring
  front housing with stage-2 ring · 3 planets · stage-2 sun
  stage-1 carrier → stage-2 sun ; stage-1 ring + front rotor bearing (KA-110P: inside the Ø74 rotor bore; KA-90P: in front of the motor) · 3 planets · stage-1 sun (on rotor hub)
  motor housing: stator bonded in the bore ── rotor (magnets on hub) ── rear rotor bearing in the housing wall
  motor encoder (KA-90P MT6835 | KA-110P AksIM-2) · drive carrier PCB · rear cap ── no through-bore with Plan A gears (docs/09 §11 H2)
```

## B. Parts list (per actuator)

| BOM | Item | KA-90P | KA-110P |
|---|---|---|---|
| B004 / B003 | Frameless motor kit: CubeMars RI85-PH KV85 / RI115-PH KV40 | 1 | 1 |
| B009 / B008 | Planetary set 28:1 / 29:1 per docs/09 §5.1 Plan A (KA-90P: z15/3 × z27/z69 m0.6 + z18/3 × z27/z72 m0.8; KA-110P: z15/3 × z30/z75 m0.6 + z24/4 × z34/z92 m1.0), planet pins 100Cr6, INA needle cages | 1 | 1 |
| B014 | Crossed roller THK RB6013 (60 × 90 × 13) | 1 | 1 |
| B016 | Rotor bearings SKF 61806-2RZ (30 × 42 × 7) / 61808-2RZ (40 × 52 × 7) + wave spring | 2 + 1 | 2 + 1 |
| B017 | AksIM-2 output encoder (ring on carrier, readhead on housing) | 1 | 1 |
| B018 / B017 | Motor encoder: MT6835 + magnet (KA-90P) / AksIM-2 (KA-110P) | 1 | 1 |
| B020 | NTC TDK B57861S0103F045 | 2 | 2 |
| B022 | Housing set: rear cap, motor housing, intermediate plate, front housing, rotor hub, output flange (7075-T6, docs/09 §3) | 1 | 1 |
| B026 + B027 | Everest S NET drive + carrier PCB | 1 | 1 |
| B081 | Output flange screws ISO 4762 12.9 | 8× M4 × 12 | **12× M5 × 14** |
| B081 | Base flange screws 12.9 | 8× M4 | 12× M5 |
| B081 | Dowels ISO 8734 m6, 2 per flange | Ø4 × 10 | **Ø6 × 12** |
| B081 | HeliCoil Plus stainless inserts, 2 × d long | M4 × 8 | M5 × 10 |
| B081 | Housing screws 8.8 (closures), O-rings EPDM/FKM 70 (front, rear), output radial lip seal (double lip with dust lip, FKM) sized to the Ø60 / Ø80 spigot, ePTFE pressure-equalising vent (IP67, docs/03 §12) | set | set |
| — | Grease Klüber Isoflex Topas NB 52 ≈ 8 g / ≈ 14 g; thermally conductive potting epoxy ≥ 1.5 W/m·K Class H ≈ 10 / 20 g; Loctite 243, 638, 222 | — | — |

## C. Tools
Arbor press with bearing tools (flat drifts on the correct ring only), oven or induction heater (housing to 90 °C),
non-ferrous tweezers, torque screwdrivers 0.5–6 N·m and a 2–25 N·m torque wrench, dial indicator + magnetic base,
feeler gauges, rotor-insertion jig (printed sleeve + guide rod), dyno (P01).

## D. Manufacturing
* **Housings (B022):** from the KA-130K STEP profiles, rescaled to the KA-90P / KA-110P interface table (docs/09 §4).
  - 7075-T6; Type III hard anodise black with masks on bearing seats, the stator bore, bonding and earth pads.
  - Machine the bearing seats **after** anodise if not masked.
  - Fits (docs/09 §2): crossed-roller seat H7; rotor bearing seats k5 (hub) and K6/H6 (housing); stator bore
    +0.02/+0.05 over the stack; ring-gear spigots H7/js6; dowel holes H7 (press) / G7 (slip); coaxiality of all seats
    ≤ 0.01 mm; seat faces perpendicular within 0.005 mm.
  - KA-110P output flange: 12 × M5 on PCD 100.000 ±0.02, 2 × Ø6 H7 dowel holes at 180° on the same PCD, spigot
    Ø80 h6. Base flange 12 × M5 on PCD 115. HeliCoil every M5 hole.
* **Gears:** order from a gear shop to docs/09 §5.1 (18CrNiMo7-6 carburised and ground, ISO 1328-1 grade 6; rings
  42CrMo4 wire EDM + nitride). Request the inspection report. On arrival: tooth count, OD, over-pin dimension, hardness
  spot check (file test on a non-functional face), planet bore and pin diameters.

## E. Assembly (KA-90P first article; KA-110P identical order, larger parts)
1. **Clean** all parts (IPA). Lay them out on a lint-free mat in the order below.
2. **Stator into the motor housing.**
   - Heat the housing to 90 °C.
   - Apply the potting epoxy thinly to the bore.
   - Slide the stator in with the lead exit aligned to the cable slot; hold it against the shoulder while it cures
     (24 h at room temperature, or per the epoxy data sheet).
   - Pot the end turns with the same epoxy, keeping the rotor clearance free (check with a gauge pin).
3. **NTCs:** glue two NTCs into the end turns at 180° (thin epoxy). Route the leads with the phase leads.
4. **Rear rotor bearing** into the motor-housing rear wall (outer ring press, Loctite 638), then the wave spring.
5. **Rotor hub:** press the front rotor bearing onto the hub (inner ring only, Loctite 638). Fit the stage-1 sun
   (shrink or press, Loctite 638) and the motor encoder magnet (KA-90P) or AksIM-2 ring (KA-110P) on the rear end.
6. **Insert the rotor** on the guide rod through the rear bearing. **Magnet safety:** the rotor is pulled hard into the
   stator; use the printed sleeve, never fingers. Check free rotation and cogging feel. Check the airgap with plastic
   shim at 4 points: all within ±0.05 mm.
7. **Intermediate plate** (stage-1 ring + front rotor-bearing seat) onto the motor housing: dowels, 8.8 screws at the
   housing torque (docs/09 §2), Loctite 222. This captures the rotor.
8. **Stage 1:** grease the ring and the planets. Planets on the stage-1 carrier pins with their needle cages. Mesh
   them into the ring and onto the sun. Turn the rotor: no tight spots.
9. **Front housing with the stage-2 ring** (spigot H7/js6, 2 dowels, Loctite 243; KA-90P 8 × M3 12.9 at 1.7 N·m,
   KA-110P 12 × M4 12.9 at 4.5 N·m: this joint carries ≈ 80 % of the output torque) onto the intermediate plate
   (O-ring lightly greased). Stage-2 sun on the stage-1 carrier output. Planets on the output carrier.
10. **Crossed roller:** press onto the output carrier, then into the front housing, per THK's instructions (press only
    the ring being fitted). Fit the outer-ring clamp ring: 8 × M4 8.8 at 2.5 N·m in a star, two passes.
11. **Output encoder:** AksIM-2 ring on the output carrier, readhead on the housing. Set the gap with the supplied shim
    and check the signal LED or the RLS tool.
12. **Rear close-up:** motor encoder readhead, drive carrier PCB on the rear standoffs, phases (crimped ring lugs, M3 at
    0.6 N·m), encoders (JST GH), NTCs. Rear cap with O-ring.
13. **Output flange:** radial lip seal (lightly greased lip) on the spigot, ePTFE vent in the rear cap. Fit the flange
    on its 2 dowels.
    - KA-90P: 8 × M4 12.9 at **4.5 N·m**, Loctite 243, star pattern, two passes.
    - KA-110P: **12 × M5 12.9 at 8.5 N·m**, Loctite 243, star pattern, two passes.
    - Witness-mark every screw head with a paint pen.
14. **Label** the actuator serial and record the stator, rotor, gear and bearing serials in the log.

## F. Electrical
* Phases U/V/W to the drive (any order, then fix by auto-phasing). Twist the three leads, ≤ 150 mm.
* Bus: KA-90P via XT30 (16 AWG); KA-110P via XT60 (12 AWG, its peak bus current is ≈ 25 A). EtherCAT + STO via the
  J-LINK pair.
* First power: 48 V, 3 A supply limit, STO enabled, drive in torque mode at 10 % of the peak current.
* Drive peak current: KA-90P 38 A (the RI85-PH saturates at 5.0 N·m), KA-110P 55 A (RI115-PH 16 N·m). Stored in the
  drive's non-volatile parameters.

## G. Testing on the dyno (gate G1, per actuator)
| Test | Method | Pass (KA-90P / KA-110P) |
|---|---|---|
| Phase resistance, insulation | 4-wire milliohm; 500 V insulation tester phases → housing | R_LL within ±10 % of datasheet (0.1385 / 0.134 Ω); > 100 MΩ |
| Back-EMF constant | back-drive at 30 rpm output, scope a line-line voltage | Ke within ±5 % of datasheet |
| **Gear run-in** (R10 §7 item 4) | 30 min each direction at 25 % peak torque and 50 % speed, then 30 min at 50 % torque; drain, inspect and replace the grease | no metal flakes, temperature rise steady, noise does not grow |
| Kt at the output | current steps 10–100 % peak vs transducer torque | slope = Kt·N·η = 3.35 / 7.76 N·m/A within ±8 % |
| Efficiency map | speed × torque grid, forward and back-driven | η ≥ 0.88 at rated (model 0.92; feed the measurement into `ETA`) |
| Peak torque | 2 s pulses at the stored current limit | ≥ 129 / 427 N·m without slip, noise or witness-mark movement |
| Backlash, stiffness | lock the output, ±torque sweep, read both encoders | backlash ≤ 10 arcmin; record torsional stiffness |
| Back-drive torque | turn the output by hand through the transducer (drive off) | record (QDD target < 2 / < 4 N·m) |
| Thermal step | hold the continuous torque (44 / 125 N·m) at 1 rad/s until steady | winding ≤ 120 °C at 25 °C ambient; record the time constant |
| Endurance | 10⁵ cycles of the walking torque profile (from `data/scenario_series.npz`) | no loss of torque, backlash growth < 2 arcmin, grease clean |
| Flange audit after the peak and endurance tests | re-check the witness marks and re-torque check (no rotation at the set torque) | no movement |
| E-stop | STO at full speed | stops; no damage |

Record every result in `logs/actuators/<serial>.md`. **Only after the first article of each class passes, order and
build the rest of that class.**
