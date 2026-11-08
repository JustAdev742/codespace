# P05 — KM-130 custom motors and KA-130K / KA-130H actuators

The custom motor (magnetic design, laminations, winding, magnets, rotor) is documented step by step in
[docs/13 §3](../13-scratch-build-motors-actuators.md). This phase assembles the actuator around it.

## A. Visual reference
* Cutaway and exploded views: [`renders/18_KA130K_cutaway.png`](../../renders/18_KA130K_cutaway.png), [`renders/19_KA130K_exploded.png`](../../renders/19_KA130K_exploded.png)
* Drawing sheets: `cad/out/drawings/ka130k__front_housing.svg`, `ka130k__motor_housing_finned.svg`, `ka130k__rotor_hub.svg`, `ka130k__s2_ring_gear_z54_m1.25.svg`, `ka130k__s2_carrier_output.svg`
* STEP: `cad/out/step/ka130k__*.step`
* Motor design sheet: [`docs/generated/km_motor_designs.md`](../generated/km_motor_designs.md)
* Envelope: [`docs/img/envelope_KA-130K.png`](../img/envelope_KA-130K.png)

Axial stack, 0 → 124 mm: rear cap (fins) · annular drive PCB with GaN stage · motor encoder ring ·
motor housing with KM-130 stator (potted) · rotor with magnets + hollow hub carrying stage-1 sun ·
stage 1 nested inside the rotor bore (3 planets) · front housing with stage-2 ring · stage 2 (4 planets)
· output carrier · crossed-roller ID90/OD120 · output flange · Ø20 cable bore throughout.

## B. Parts list (per actuator; build 2 × K and 2 × H)

| BOM | Item | Qty |
|---|---|---|
| B001 (K) / B002 (H) | KM-130x45 / KM-130x40 motor (stator stack wound + rotor with magnets), see docs/13 | 1 |
| B007 | Planetary set 14:1 (stage 1 m0.8: sun z20, 3 × z15, ring z50; stage 2 m1.25: sun z18, 4 × z18, ring z54; pins + needle rollers) | 1 |
| B013 | Crossed-roller ID90/OD120 class | 1 |
| B016 | Rotor bearings 6808-class + wave spring | 2 |
| B017 | AksIM-2 × 2 (motor and output) | 2 |
| B020 | NTC | 2 |
| B021 | Housing set: rear cap, motor housing, front housing, rotor hub, stage-1 carrier, stage-2 carrier/output, output flange | 1 |
| B025 + B027 | High-current drive + annular carrier PCB | 1 |
| B081 | 12 × M5 12.9 (output), 12 × M5 (base), M3/M4 housing screws, 2 × Ø6 dowels each flange, O-rings, V-ring, helicoils M5 | set |
| B080 | thigh duct blower (in P07) | — |

## C. Tools
As P03, plus a 2 t arbor press, an oven (housings to 100 °C), the magnet-safe rotor insertion jig (printed guide + Ø20 guide rod, see docs/13 §3.7), a hi-pot tester, an LCR meter.

## D. Manufacturing
* Housings: CNC 7075-T6, tolerances per the drawing sheets. Fins are turned. The stator bore is +0.02/+0.05 mm for the potting film.
* Gears: gear shop, 18CrNiMo7-6 carburised and ground (docs/09 §5). Stage-2 sun Lewis SF 2.7 at the momentary case (structure.py).
* Motor: docs/13.

## E. Assembly
1. **Motor first article test before building the actuator** (docs/13 §3.10): R, L, back-EMF, hi-pot, locked-rotor torque.
2. **Stator potting:**
   - Heat the motor housing to 100 °C.
   - Coat the bore with thermal epoxy (≥ 1.5 W/m·K).
   - Insert the stator with the phase leads at the cable slot.
   - Clamp axially and cure.
   - Pot the end turns, keeping a 1.5 mm clearance to the rotor path (check with a mandrel).
3. Install 2 NTCs in the end turns (one hot-spot side near the cable exit).
4. **Rotor:**
   - Press the bearings onto the hub; fit the stage-1 sun, the motor encoder ring and the wave spring.
   - Insert into the stator **with the jig**. The magnetic pull is several hundred newtons. Keep fingers clear.
5. **Stage 1** inside the rotor bore: ring z50 fixed to the housing spider; planets on the stage-1 carrier. Grease. Check free rotation by turning the rotor.
6. **Front housing with the stage-2 ring** (spigot H7/js6, dowels, M4 at 2.5 N·m), stage-2 sun on the stage-1 carrier, 4 planets on the output carrier.
7. **Crossed-roller** onto the output carrier, then into the front housing. Clamp ring screws in a star pattern to spec. Check output runout ≤ 0.02 mm with a dial indicator.
8. **Output AksIM-2 ring** on the carrier, readhead set with its shim.
9. **Close:** O-rings, M4 housing screws at 2.5 N·m in a star. Annular PCB on the rear cap (thermal pad between the GaN stage and the cap). Phases → PCB with crimped lugs. Rear cap on.
10. **Output flange:** 2 × Ø6 dowels, 12 × M5 12.9 at **8.5 N·m** (Loctite 243). This joint is also the overload slip fuse (SF 2.2 at the momentary torque); do not over-torque it.

## F. Electrical
* Bus through XT60 (12 AWG zone feed). J-LINK IN/OUT.
* Drive setup: KM-130x45 parameters from the **measured** motor test (not the model): pole pairs 21, Kt, R, L.
* Current limits: start at 30 A, raise to 99 A only on the dyno after the thermal test.
* Field weakening off until G1 completes.

## G. Testing (gate G1)
| Test | Pass |
|---|---|
| Kt at the output vs model (model 0.310 × 14 × 0.92 = 4.0 N·m/A rms) | within ±8 %; update `calc` if outside |
| Peak torque 2 s | ≥ 395 N·m at 99 A without slip or tooth noise |
| Torque-speed: points from `docs/img/envelope_KA-130K.png` with ×1.2 / ×1.15 margin at 52 V supply | all reachable |
| **Thermal step test (critical, the knee's continuous margin is only 1.03):** hold 117 N·m at 2 rad/s with the duct blower at its design flow until steady state | winding ≤ 120 °C at 25 °C ambient. **If it fails:** liquid-cooled jacket (docs/13 §6) or a 50 mm stack |
| Walking duty cycle replay (W1/W2 knee torque series ×1.0) for 30 min | winding ≤ 110 °C, no drift in Kt |
| Backlash / stiffness | backlash ≤ 10 arcmin; stiffness recorded |
| Endurance 2 × 10⁵ walking cycles | backlash growth < 2 arcmin; gear inspection clean |
| Overload: drive the output into a locked fixture at 1.5× momentary for 0.1 s (slip test) | the flange slips before any gear damage, or holds without damage; inspect |
