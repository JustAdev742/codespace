# P03 — KA-90P and KA-110P planetary actuators (first articles, then series)

## A. Visual reference
* Architecture of the KA family (same layout as the KA-130K cutaway, smaller): [`renders/18_KA130K_cutaway.png`](../../renders/18_KA130K_cutaway.png), [`renders/19_KA130K_exploded.png`](../../renders/19_KA130K_exploded.png)
* Envelope plots: [`docs/img/envelope_KA-90P.png`](../img/envelope_KA-90P.png), [`envelope_KA-110P.png`](../img/envelope_KA-110P.png)
* Section (axial stack, output at top):

```
  output flange ─┬─ crossed-roller bearing ─ stage-2 carrier (output)
                 │  stage-2 ring (fixed in front housing) · 3–4 planets · sun
                 │  stage-1 carrier → stage-2 sun ;  stage-1 ring · planets · sun (on rotor hub)
  front housing ─┤
  stator (bonded in finned housing) ── rotor (magnets on hub) ── rotor bearings ×2
  motor encoder ring · annular drive carrier PCB · rear cap ── hollow Ø15 cable bore through everything
```

## B. Parts list (per actuator)

| BOM | Item | KA-90P | KA-110P |
|---|---|---|---|
| B004 / B003 | Frameless motor kit: CubeMars RI85-PH / TQ ILM85x26 | 1 | 1 |
| B009 / B008 | Planetary gear set 23:1 / 32:1 (sun, planets, ring ×2 stages, planet pins, needle rollers) | 1 | 1 |
| B014 | Crossed-roller output bearing ~ID60/OD90 | 1 | 1 |
| B016 | Rotor bearings (thin-section deep-groove) + wave spring | 2 | 2 |
| B017 | AksIM-2 output encoder (ring on carrier, readhead on housing) | 1 | 1 |
| B018 / B017 | Motor encoder: MT6835 (KA-90P) / AksIM-2 (KA-110P) | 1 | 1 |
| B020 | NTC B57861S | 2 | 2 |
| B022 | Housing set: rear cap, motor housing (finned), front housing, rotor hub, carriers, output flange | 1 | 1 |
| B026 + B027 | Everest S NET drive + carrier PCB | 1 | 1 |
| B081 | M4 12.9 screws (output 8×/10×), M3 housing screws, Ø4 dowels, O-rings (front Ø92×2, rear Ø86×2), V-ring output seal, helicoils | set | set |
| — | Grease (Klüber Isoflex Topas class) ~8 g; thermal epoxy (≥ 1.5 W/m·K) ~10 g; Loctite 243, 638 | — | — |

## C. Tools
Arbor press with bearing-installation tools (flat drifts on the correct ring only), induction or oven heater (housing to 90 °C for stator fit), magnetic-safe non-ferrous tweezers, torque screwdrivers (0.5–6 N·m), dial indicator + magnetic base, feeler gauges, dyno (P01).

## D. Manufacturing
* Housings (B022): from the KA-130K STEP profiles scaled to the KA-90/110 interface table (docs/09 §4).
  - 7075-T6; hard anodise black with masks on the bearing seats, the stator bore and the bonding pads.
  - Machine the bearing seats **after** anodise if not masked.
  - Critical tolerances: crossed-roller seat H6, rotor bearing seats H6/j5, stator bore +0.02/+0.05 (potting gap), ring-gear spigot H7/js6, coaxiality of all seats ≤ 0.01 mm.
* Gears: order from a gear shop to the table in docs/09 §5. Request a gear inspection report.
  Inspect on arrival: tooth count, OD, double-flank roll if available, hardness spot check (file test on a non-functional face).

## E. Assembly (KA-90P; KA-110P identical procedure)
1. **Clean** all parts (IPA). Lay them out on a lint-free mat in the order below.
2. **Stator into the motor housing.**
   - Heat the housing to 90 °C.
   - Apply thermal epoxy thinly to the bore.
   - Slide the stator in with the lead exit aligned to the cable slot.
   - Keep it pressed against the shoulder while it cures (24 h at room temperature, or as the epoxy data sheet says).
   - Pot the end turns with the same epoxy, leaving the rotor clearance free (check the bore with a gauge pin).
3. **NTCs:** glue two NTCs into the end turns at 180° (thin epoxy). Route the leads with the phase leads.
4. **Rotor hub:**
   - Press the two rotor bearings onto the hub (inner ring only) with Loctite 638.
   - Fit the stage-1 sun (keyed/pressed) and the motor encoder magnet/ring.
   - **Magnet safety:** the rotor is strongly attracted to the stator. Insert it with an axial guide rod
     through the bore and a printed sleeve. Never by hand.
5. **Insert the rotor** into the stator on the guide rod. Check free rotation and cogging feel. Measure the radial gap with plastic shim at 4 points; all must be within ±0.05 mm.
6. **Stage 1:** grease the ring gear and planets. Install the planets on the stage-1 carrier pins (needle rollers greased). Mesh them into the ring and onto the sun. Check for free rotation without tight spots.
7. **Stage 2:** fit the stage-2 ring into the front housing (spigot H7/js6, 2 dowels, Loctite 243 on the M3 screws at 1.2 N·m). Fit the stage-2 sun on the stage-1 carrier output. Install the planets on the output carrier.
8. **Crossed-roller bearing:** press onto the output carrier and into the front housing per the bearing maker's instructions. Tighten the clamp ring screws in a star pattern to the specified torque.
9. **Output encoder:** fit the AksIM-2 ring to the output carrier and the readhead to the housing. Set the readhead gap with the supplied shim and check the signal LED or the RLS tool.
10. **Close up:** join the front and motor housings (O-ring lightly greased, 6 × M3 at 1.2 N·m in a star). Fit the drive carrier PCB on the rear standoffs. Connect the phases (crimped ring lugs, M3 at 0.6 N·m), the encoders (JST GH) and the NTCs. Fit the rear cap.
11. **Output seal:** V-ring on the output flange. Fit the flange (dowels + 8 × M4 12.9 at **4.5 N·m** with Loctite 243).
12. **Label** the actuator serial and record the stator/rotor/gear serials in the log.

## F. Electrical
* Phases U/V/W to the drive (any order, then fix by auto-phasing). Twist the three leads.
* Bus via XT30 (16 AWG). EtherCAT + STO via the J-LINK pair.
* First power: 48 V, 3 A limit, STO enabled, drive in torque mode at 10 % limit.

## G. Testing on the dyno (gate G1, per actuator)
| Test | Method | Pass (KA-90P / KA-110P) |
|---|---|---|
| Phase resistance, insulation | 4-wire milliohm; 500 V insulation tester phases→housing | R_LL within ±10 % of datasheet; > 100 MΩ |
| Back-EMF constant | back-drive at 30 rpm output, scope a line-line voltage | Ke within ±5 % of datasheet |
| Kt at the output | current steps 10–100 % peak vs transducer torque | slope = Kt·N·η within ±8 % of model (calc table) |
| Efficiency map | speed × torque grid, forward and back-driven | η ≥ 0.88 at rated (model assumes 0.92; feed the measurement back into `ETA`) |
| Peak torque | 2 s pulses to the drive limit | ≥ 106 N·m / 276 N·m without slip or noise |
| Backlash, stiffness | lock the output, ±torque sweep, read both encoders | backlash ≤ 10 arcmin; record torsional stiffness |
| Back-drive torque | turn the output by hand through the transducer (drive off) | record (QDD target < 2 N·m) |
| Thermal step | hold the continuous torque (36 / 73 N·m) at 1 rad/s until steady | winding ≤ 120 °C at 25 °C ambient; record the time constant |
| Endurance | 10⁵ cycles of the walking torque profile (from `data/scenario_series.npz`) | no loss of torque, backlash growth < 2 arcmin, grease clean |
| E-stop | STO at full speed | stops; no damage |

Record every result in `logs/actuators/<serial>.md`. **Only after the first article of each class passes, order and build the rest of that class.**
