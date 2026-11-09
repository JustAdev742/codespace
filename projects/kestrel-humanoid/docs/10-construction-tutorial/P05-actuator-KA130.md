# P05 — KM-130x50-LC motors and KA-130K / KA-130H actuators

The custom motor (magnetic design, laminations, winding, magnets, rotor) is built step by step per
[docs/13 §3](../13-scratch-build-motors-actuators.md), with the Mk II changes in docs/09 §6.1 (50 mm stack, N50UH,
3 turns × 2 paths, potted, liquid jacket). This phase assembles the actuator around it. Build the jackets in
**P05.1** (below) before step 2.

Mk II values (`docs/generated/actuator_family.md`, docs/04 §5, docs/05 §6.1):

| Class | Joints | Motor | Gear | Peak / continuous out | No-load speed | Reflected inertia | Mass | Drive |
|---|---|---|---|---|---|---|---|---|
| **KA-130K** | knee ×2 | KM-130x50-LC | 2-stage planetary **17:1** | **493 / 295 N·m** (263 N·m at the HC2's 75 A continuous) | 12.5 rad/s | 0.400 kg·m² | 4.96 kg | HC2, 150 A pk / 75 A cont |
| **KA-130H** | hip pitch ×2 | KM-130x50-LC | 2-stage planetary **14:1** | **406 / 243 N·m** (217 N·m at 75 A) | 15.2 rad/s | 0.271 kg·m² | 4.76 kg | HC2 |

Knee and hip share the motor, jacket, housing, stage 2 and drive; only stage 1 differs (docs/09 §5.1). The motor's
thermal rating (18.85 N·m = 84 A) assumes the jacket reaches ≤ 0.25 K/W copper-to-coolant: that is the critical number of
this phase. In service the HC2's 75 A continuous limit sets the usable continuous torque (docs/09 §11 H8).

## A. Visual reference
* Cutaway and exploded views (K1 finned version; Mk II replaces the fins with the jacket): [`renders/18_KA130K_cutaway.png`](../../renders/18_KA130K_cutaway.png), [`renders/19_KA130K_exploded.png`](../../renders/19_KA130K_exploded.png)
* Drawing sheets (K1 geometry; read with docs/09 §5.1 and §11 H1–H3): `cad/out/drawings/ka130k__front_housing.svg`, `ka130k__motor_housing_finned.svg`, `ka130k__rotor_hub.svg`, `ka130k__s2_ring_gear_z54_m1.25.svg` (stage 2 unchanged in Plan A), `ka130k__s2_carrier_output.svg`
* STEP: `cad/out/step/ka130k__*.step`
* Motor design: R10 §5.1 and docs/04 §5.1 (KM-130x50-LC); K1 sheet for comparison [`docs/generated/km_motor_designs.md`](../generated/km_motor_designs.md)
* Envelope: [`docs/img/envelope_KA-130K.png`](../img/envelope_KA-130K.png), [`envelope_KA-130H.png`](../img/envelope_KA-130H.png)

Axial stack (rear → output): rear cap · **HC2 drive bolted to the jacket's rear face** (the jacket is its cold plate;
drip lip above it) · motor encoder AksIM-2 · housing sleeve (≈ Ø145) with the **liquid jacket** and the potted
KM-130x50-LC stator · rotor (N50UH magnets, CF sleeve) on the hub carrying the stage-1 sun · stage 1 nested inside the
Ø85.5 rotor bore (ring on the stage-1 spider) · front housing with the stage-2 ring z54 · stage 2 (4 × z18 planets) ·
output carrier · **THK RB9016** crossed roller · output flange (12× M5 PCD 105). No through-bore on the knee with the
Plan A gears; Ø12 on the hip (docs/09 §11 H2).

## B. Parts list (per actuator; build 2 × K and 2 × H, plus one spare motor and jacket)

| BOM | Item | Qty |
|---|---|---|
| B001, B002, B101, B102 | KM-130x50-LC motor: 50 mm NO20 lamination stack, 42 N50UH arcs, winding set (10 × Ø0.67 mm per conductor, 3 turns × 2 paths), potting ≥ 1.5 W/m·K, rotor back iron + CF sleeve (docs/13 §3, docs/09 §6.1) | 1 set |
| B103 | Liquid jacket with two-start helix, 4 EPDM O-rings, leak-test ports, 2 coolant ports (P05.1) | 1 |
| B007 (K) / B105 (H) | Planetary set per docs/09 §5.1 Plan A. K: stage 1 m0.8 z16 / 4 × z18 / z52; H: stage 1 m0.8 z24 / 3 × z18 / z60; both stage 2 m1.25 z18 / 4 × z18 / z54, 18 mm face. Planet pins 100Cr6 (Ø5 stage 1, Ø10 stage 2); INA K5×8×8 and K10×14×13 needle cages | 1 |
| B013 | Crossed roller **THK RB9016 (90 × 130 × 16)** (hold H1: the CAD seat is OD 120) | 1 |
| B016 | Rotor bearings SKF 61808-2RZ (40 × 52 × 7) + wave spring | 2 + 1 |
| B017 | AksIM-2 × 2 (motor and output) | 2 |
| B020 | NTC TDK B57861S0103F045: 2 in the end turns + 1 at the jacket outlet | 3 |
| B021 | Jacketed housing set: rear cap with HC2 bay and coolant ports, stage-1 spider, front housing, rotor hub, stage-1 carrier, stage-2 carrier/output, output flange (7075-T6 / 17-4PH per docs/09 §3) | 1 |
| B025 | HC2 150 A GaN drive (annular, 6-layer) with leak pad, phase busbars ≈ 12 mm² ≤ 60 mm | 1 |
| B081 | Output flange 12 × M5 × 14 12.9; base flange 12 × M5 12.9; stage-2 ring 12 × M4 12.9; crossed-roller clamp ring 12 × M4 12.9; 2 × Ø6 × 12 dowels per flange; HeliCoil Plus M5 × 10 and M4 × 8; housing O-rings EPDM/FKM 70; output radial lip seal (double lip, FKM) for the Ø90 spigot; ePTFE vent | set |
| — | Grease Klüber Isoflex Topas NB 52 ≈ 25 g; Loctite 243, 638, 222; silicone grease for EPDM O-rings (never mineral grease on EPDM) | — |

## C. Tools
As P03, plus a 2 t arbor press, an oven to 150 °C (jacket shrink fit), the magnet-safe rotor insertion jig (printed
guide + guide rod, docs/13 §3.7), a rotor-locking pin, a hi-pot tester, an LCR meter (also for L_s, needed for the
active-short-circuit check), the coolant loop bench (B131, P01), the test pack (P06) for the 150 A tests.

## D. Manufacturing
* **Housings:** CNC 7075-T6 per docs/09 §2–§3. No fins: the housing sleeve closes the jacket's helix. Crossed-roller
  seat Ø130 H7 (hold H1). Coaxiality of rotor-bearing, ring and crossed-roller seats ≤ 0.01 mm.
* **Gears:** gear shop, 18CrNiMo7-6 carburised and ground, crowned with tip relief (docs/09 §5.1). Stage-2 parts are
  common to K and H: order 4 + 1 sets.
* **Motor:** docs/13 §3, plus the FEMM check in docs/11 §4.1 item 1 **before the Ø130 × 50 stack and the N50UH magnets
  are ordered**.
* **Jacket:** P05.1.

## E. Assembly
1. **Motor first-article tests before building the actuator** (docs/13 §3.10, with the KM-130x50-LC model values in
   docs/09 §6.1): R, L (record L_s), back-EMF, hi-pot, locked-rotor Kt.
2. **Stator in its jacket and sleeve:** P05.1 §E, including the pressure test. Do not continue with a jacket that has
   not passed P05.1 §G.
3. **NTCs:** two in the end turns (one at the hot-spot side near the cable exit), one in the jacket outlet boss.
4. **Rear rotor bearing** into the rear wall of the sleeve (Loctite 638 on the outer ring), wave spring.
5. **Rotor hub:** press the front bearing onto the hub (inner ring only); fit the stage-1 sun and the motor AksIM-2 ring.
6. **Insert the rotor with the jig.** The N50UH magnetic pull is several hundred newtons. Keep fingers clear.
7. **Stage-1 spider** (stage-1 ring + front rotor-bearing seat) into the rotor bore and onto the sleeve: dowels,
   8.8 screws at the housing torque, Loctite 222. This captures the rotor.
8. **Stage 1:** planets with needle cages on the stage-1 carrier pins (4 on the knee, 3 on the hip); grease; mesh.
   Turn the rotor: free, no tight spots.
9. **Front housing with the stage-2 ring z54:** spigot H7/js6, 2 dowels, **12 × M4 12.9 at 4.5 N·m**, Loctite 243.
   This joint carries ≈ 75 % of the output torque (the ring reaction), so the K1 value of 2.5 N·m is not enough.
   Stage-2 sun on the stage-1 carrier; 4 planets on the output carrier.
10. **Crossed roller RB9016** onto the output carrier, then into the front housing; clamp ring 12 × M4 12.9 at
    4.5 N·m in a star, two passes. Output runout ≤ 0.02 mm (dial indicator).
11. **Output AksIM-2 ring** on the carrier; readhead set with its shim.
12. **HC2:** thermal pad, then bolt the HC2 to the jacket's rear face; phase busbars to the stator leads; encoders;
    NTCs. Route every coolant hose **below and away from** the board; no fitting above it. Rear cap on (O-ring).
13. **Output flange:** radial lip seal, 2 × Ø6 dowels, **12 × M5 12.9 at 8.5 N·m**, Loctite 243, witness marks. This joint is
    also the overload slip fuse (935 N·m vs 535 N·m momentary, SF 1.75); do not over-torque it.
14. Cap both coolant ports with plugs (or dry-break halves) until P07.

## F. Electrical
* DC input 12 AWG through XT60H from the leg zone (≤ 0.5 m); HC2 12 V aux on a Gecko-MT 2-pin (2 × 20 AWG); J-LINK
  IN/OUT (docs/05 §6.2).
* Drive setup from the **measured** motor test (not the model): pole pairs 21, Kt, R, L.
* Current limits: start at 30 A; raise to 150 A only on the dyno, **with coolant flowing**, after the thermal test.
  Firmware DC-bus current limit 45 A per HC2.
* Hardware defaults alongside STO (docs/05 §8): **active short circuit** below a speed threshold after STO (passive
  damping ≈ Km²·N² = 478 N·m·s/rad at the knee actuator, 324 at the hip), enabled only after the phase short-circuit
  current λ/L_s is measured below 150 A; field weakening off until G1 completes.
* **Safety function:** the HC2's STO is uncertified, so on the dyno and through commissioning the external safety
  relay + DC contactor in the HC2 feed (P02 §F) is the stop that counts. Every e-stop test in §G is run with it.
* Coolant interlock: the drive limits current to 30 A unless the coolant-flow OK signal (loop bench flow sensor now,
  robot loop sensor later) is present. On loss of flow in service the RT layer derates to the air-only rating
  (0.64 × the jacketed continuous, docs/03 §9.6) and ends the session.

## G. Testing (gate G1; R10 §7 items 1, 3, 4 and 5 run here, item 2 in P05.1)
| Test | Pass (KA-130K / KA-130H) |
|---|---|
| FEMM check of KM-130x50-LC (before the die, docs/11 §4.1) | Kt within ±10 % of 0.224 N·m/A; T_sat near 30 N·m; N50UH demagnetisation margin at 204 A and 120 °C |
| **Gear run-in** (R10 §7 item 4): 30 min each direction at 25 % then 50 % peak, 50 % speed; drain and inspect grease; ISO 6336 tooth-root check on paper | no metal flakes; stable temperature and noise |
| Kt at the output vs model (0.224 × N × 0.92 = 3.50 / 2.89 N·m/A rms) | within ±8 %; update `calc` if outside |
| **150 A locked-rotor test** (R10 §7 item 3): output locked through the transducer and reaction arm; 150 A for 2 s, then 99 A for 10 s; torque vs current from 10 to 150 A | ≥ 493 / 406 N·m at 150 A; the curve bends no earlier than the model (T_sat ≈ 30 N·m at the motor); no flange slip; HC2 within its thermal rating |
| Active short circuit: measure L_s, compute λ/L_s; then trigger ASC at the speed threshold | phase current < 150 A peak; braking torque as modelled |
| Efficiency map, both directions | η recorded (model 0.92); feed into `ETA` |
| **k_L measurement** (R10 §7 item 5): voltage-limited torque–speed curve with the bus held at 52 V | fitted k_L ≥ 0.75; otherwise update `K_L` in `actuators.py` and re-run `run_all.py` |
| Torque–speed: points from the envelope plot with ×1.2 / ×1.15 margin at 52 V | all reachable |
| **Thermal step** (critical): 75 A continuous (263 / 217 N·m) at 2 rad/s, coolant 0.5 L/min at 25 °C inlet, to steady state | winding rise over coolant inlet ≤ 45 K (0.25 K/W × ≈ 170 W copper loss at 75 A); HC2 temperature within rating |
| Walking duty replay (W1/W2 knee or hip torque series ×1.0) for 30 min with coolant | winding ≤ 100 °C; no drift in Kt |
| Coolant-loss response: stop the flow at 75 A | drive derates on the interlock / thermal model before the 130 °C warning; log the time |
| Backlash / stiffness | backlash ≤ 10 arcmin; stiffness recorded |
| Endurance 2 × 10⁵ walking cycles | backlash growth < 2 arcmin; gear inspection clean |
| Static overload: rotor locked with the pin, 590 N·m (1.1 × 535 N·m momentary) on the output through the arm, 1 s × 3 | no flange slip (witness marks), no gear damage on teardown of the first article |

---

# P05.1 — Liquid-cooling jackets (KA-130K and KA-130H)

One jacket per KM-130x50-LC (4 + 1 spare). Making the jacket and the first-article thermal test are described in
[docs/13 §3.9](../13-scratch-build-motors-actuators.md), the motor acceptance tests in docs/13 §3.10; the specification is
docs/09 §6.2 and docs/03 §9.3. This sub-phase is the build-and-test sequence. One deliberate difference: the shrink-fit
interference here is **0.075–0.140 mm**, not docs/13's 0.06–0.08 mm, because aluminium on steel loses ≈ 0.15 mm of
interference on Ø130 in a uniform 100 K hot soak. The loop that feeds the jackets is built in P08.1; on the bench they
run from the loop bench (B131, P01).

## A. Visual reference
* Housing envelope (K1 finned sleeve, to be replaced by the jacket + sleeve): `cad/out/drawings/ka130k__motor_housing_finned.svg`
* Section:

```
  housing sleeve (7075, ≈ Ø145) ═══════════════════════════════════════════════════════
  O-ring ▪ ▪ test port │ two-start helix, each start 6 × 3 mm, lead 18 mm │ test port ▪ ▪ O-ring
  jacket (6061-T6, 2 mm web)  inlet G1/8 at the bottom ───────────────► outlet G1/8 + NTC at the top
  ─────────────── shrink fit, interference 0.075–0.140 mm on Ø130 ───────────────
  stator stack KM-130x50-LC (potted ≥ 1.5 W/m·K)          HC2 bolted to the jacket's rear face
```

## B. Parts list (per jacket)

| BOM | Item | Qty |
|---|---|---|
| B103 | Jacket, 6061-T6, bore Ø129.860 +0.025/0, two-start 6 × 3 mm helix on the OD, leak-test port between each O-ring pair | 1 |
| B021 | Housing sleeve, 7075-T6 (part of the jacketed housing set) | 1 |
| B103 | EPDM 70 O-rings, 3.53 mm section, AS568 -2xx size for the ≈ Ø140 bore (docs/13 §3.9) | 4 + 4 spare |
| B126 | Port fittings: G1/8 (1/8 BSPP) ISO 1179 stud ends with bonded seals and barbs for the 6 mm ID hose, stepless ear clamps | 2 |
| B020 | NTC for the outlet boss | 1 |
| — | Silicone grease for EPDM (e.g. Molykote 111); blanking plugs for the test ports | — |

## C. Tools & equipment
Oven to 150 °C, heat-resistant gloves, press fixture with a positive stop and a guide sleeve, outside micrometer
125–150 mm, bore gauge, hand pump with 0–6 bar gauge and shut-off valve, bucket of water, loop bench (B131), a ≥ 100 A
low-voltage DC supply **or** the HC2 holding d-axis current, 4-wire milliohm meter, thermocouples, data logger.

## D. Manufacturing
* **Jacket (6061-T6):**
  - bore Ø129.860 +0.025/0, Ra 0.8, cylindricity 0.01 mm, entry chamfer 2 × 15°, locating shoulder at one end;
  - two-start helix, each start 6.0 wide × 3.0 deep, pitch 18 mm, lands ≥ 3 mm; deburr every groove edge (a burr cuts
    the O-ring);
  - two O-ring grooves at each end per ISO 3601-2 for 18–25 % squeeze, with a leak-test port drilled between each pair;
  - plenum grooves at both ends join the two starts to the ports; G1/8 ports spot-faced Ra 3.2 for bonded seals; cut the
    helix on a CNC lathe as a 2-start thread with an 18 mm lead and a 6 mm grooving insert, in several passes;
  - coolant surfaces Type II anodised or trivalent chromate; the stator bore stays bare; the rear face flat to 0.05 mm
    for the HC2.
* **Housing sleeve (7075-T6):** bore H7 over the jacket lands, 15° O-ring lead-in, Ra 0.8 in the seal zones.
* **Stator:** potted and varnished per docs/13 §3.5; OD measured at 4 angles × 3 heights, 130 h7.

## E. Assembly
1. Measure stator OD and jacket bore; record the actual interference. **It must be 0.075–0.140 mm**; outside that,
   do not assemble.
2. Heat the jacket to 150 °C (20 min soak, ≤ 30 min total; 6061-T6 loses temper with longer exposure). Stator at room
   temperature.
3. Press the stator into the jacket in **one continuous stroke** against the shoulder, phase leads aligned to the slot.
   Hold under light load for 5 minutes while it cools.
4. At room temperature, check the stator tooth-tip bore: not more than 0.02 mm smaller than before (the shrink fit
   compresses the stack).
5. Pot the end turns into the jacket with the thermally conductive epoxy (≥ 1.5 W/m·K) so end-turn heat also reaches
   the coolant (docs/13 §3.9 step 4). Grease the EPDM O-rings with silicone grease, fit them, and slide the jacket into
   the sleeve without twisting.
   Secure it axially (shoulder + retaining ring or screws per the CAD).
6. Fit the port fittings with bonded seals to the fitting maker's torque. **Inlet at the bottom, outlet at the top when
   the robot stands**, so air purges upward.
7. Glue the outlet NTC into its boss with thermal epoxy. Plug the leak-test ports.

## F. Electrical
* NTCs (2 end turns + 1 outlet) to the HC2 NTC inputs; the outlet temperature also goes to the RT layer for the
  coolant model.
* Leak pad on the HC2 edge facing the inlet fitting → HC2 input **and** the safety MCU leak line (docs/05 §8: a leak at
  an HC2 trips the stop chain).
* Phase leads leave through the sealed slot on the side away from the ports.

## G. Testing (per jacket; R10 §7 item 2)
| Test | Method | Pass |
|---|---|---|
| O-ring pair check | air at 2 bar into each leak-test port, channel open | ≤ 0.01 bar drop in 5 min (each seal pair proven on its own) |
| Proof | fill the channel with water, isolate, 3 bar for 10 min | no weep (dry paper towel at both test ports and every joint) |
| Leak (docs/13 §3.9) | dry, air at 2 bar under water for 10 min; then 2 bar pressure decay for 10 min at stable temperature | no bubbles; ≤ 5 mbar drop |
| Flow and pressure drop | loop bench, 0.2–0.8 L/min | record Δp at 0.5 L/min (expected ≈ 1.4–1.8 kPa, docs/03 §9.3) |
| **Thermal resistance** (first on a K1 KM-130x45 stator if one exists, then every KM-130x50-LC) | rotor locked or removed; inject copper loss of 100, 150 and 215 W (≥ 100 A DC through two phases, or the HC2 holding d-axis current); coolant 0.5 L/min at 25 °C; winding temperature from resistance, R_T = R_20 · (1 + 0.00393 · (T − 20)); R_th = (T_winding − T_coolant,mean) / P_cu (docs/13 §3.9) | **≤ 0.25 K/W** meets the R10 rating. 0.25–0.30 K/W: accept (docs/13 pass limit) and derate the continuous rating by √(0.25 / R_th) in `calc`. **> 0.30 K/W: reject** (check potting voids and the fit) |
| Cleanliness | flush with deionised water until clear, then drain and cap | no debris in the filter |
