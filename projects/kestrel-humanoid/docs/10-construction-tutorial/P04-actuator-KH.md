# P04 — KH arm and neck actuators: KH-C25 and KH-C20 cycloids, KH-14 strain-wave

Mk II values (`docs/generated/actuator_family.md`, docs/09 §5.3):

| Class | Joints (units) | Motor | Gear | Motor-limited peak | **Gear limit (drive current limit)** | Continuous | No-load speed | Mass |
|---|---|---|---|---|---|---|---|---|
| **KH-25 (KH-C25)** | shoulder pitch, shoulder roll (4) | KM-115x32-N50 (Ø115, scratch-built) | C25 two-disc cycloid 30:1 | 362 N·m | **160 N·m repeated (21 A)**, 250 N·m momentary target | 119 N·m motor / 100 N·m gear average | 6.3 rad/s | 2.60 kg |
| **KH-20 (KH-C20)** | shoulder yaw, elbow (4) | KM-85x26-N50-4t | C20 two-disc cycloid 30:1 | 158 N·m | **105 N·m repeated (18.8 A)**, 160 N·m momentary | 44 N·m | 8.6 rad/s | 1.63 kg |
| **KH-14** | wrist yaw ×2, neck yaw, neck pitch (4) | KM-50x20 | CSG-14-50 strain-wave | 34 N·m | **23 N·m repeated (4.3 A)** | 9 N·m | 9.0 rad/s | 0.68 kg |

**Every KH motor can out-torque its gear.** The drive peak-current limits above are stored in the drive's
non-volatile parameters (P02 §E step 4) and verified on the dyno before the actuator goes into an arm. A software
bug in the RT layer must not be able to break a gear.

Build the cycloid gear sets first: **P04.1** (below).

## A. Visual reference
* KH-25 cutaway (K1 strain-wave version; the motor, encoder, flexure and output bearing positions still apply): [`renders/20_KH25_cutaway.png`](../../renders/20_KH25_cutaway.png)
* STEP profiles: `cad/out/step/kh25__*.step` (K1), cycloid discs `cad/out/step/cycloid_KH-C25_disc.step`, `cycloid_KH-C20_disc.step`
* Envelope plots: [`docs/img/envelope_KH-25.png`](../img/envelope_KH-25.png), `envelope_KH-20.png`, `envelope_KH-14.png`

KH-C25 axial stack (output at top):

```
 output flange (8× M4 PCD 70) ─ torque flexure (Ti, 4 shear gauges) ─ output front disc (screws into the 8 output pins)
 crossed roller THK RB5013 ─ input-shaft front journal 61803 in the output disc
 disc 1 (needle cage on eccentric sleeve 1) ─ spacer ─ disc 2 (sleeve 2, 180°) ─ ring with 31 Ø5 pins (fixed in the housing)
 output back ring (8 solid Ø8 output pins pressed in, rotating)
 rotor (KM-115x32-N50) on the hollow input shaft ─ stator bonded in the motor housing ─ rotor bearings 61808
 motor encoder MT6835 ─ drive carrier (Everest + ADS1262) ─ rear cap ─ Ø12 cable bore
```

## B. Parts list (per actuator)

| BOM | Item | KH-C25 | KH-C20 | KH-14 |
|---|---|---|---|---|
| B005 / B104 / B006 | Motor: KM-115x32-N50 / KM-85x26-N50-4t / KM-50x20 (docs/09 §6.1, docs/13 §3) | 1 | 1 | 1 |
| B010 / B011 / B012 | Gear: C25 set / C20 set (P04.1) / Leaderdrive LHSG-14-50 component set (WG, FS, CS) | 1 | 1 | 1 |
| B015 | Output crossed roller THK RB5013 (50 × 80 × 13) / THK RB4010 (40 × 65 × 10) / per the CSG-14 installation drawing (THK RB3010 class) | 1 | 1 | 1 |
| B016 | Rotor bearings 61808-2RZ / 61806-2RZ / per K1 drawing + wave spring | 2 | 2 | 2 |
| B016 | Input-shaft front journal bearing 61803 / 61802 | 1 | 1 | — |
| B017, B018 | AksIM-2 output + MT6835 motor encoder | 1 + 1 | 1 + 1 | 1 + 1 |
| B019 | Torque flexure kit: 4 × HBK XY41-3/350 shear gauges, ADS1262 on the carrier | 1 | 1 | — |
| B023 | Housing set incl. Ti-6Al-4V flexure (KH-C25/C20) | 1 | 1 | 1 |
| B026 + B027 | Everest S NET + carrier | 1 | 1 | 1 |
| B081 | Output flange screws 12.9 | 8× M4 | **8× M4** (was M3) | 6× M3 |
| B081 | Output-pin screws 12.9 (front disc into the pin ends) | 8× M4 | 6× M3 | — |
| B081 | Dowels ISO 8734 m6 (flange, ring) | Ø4 | Ø4 | Ø3 |
| — (recommended, docs/04 §8; not in the mass budget) | Spring-applied flat brake ≥ 4.5 N·m at the motor (shoulder pitch only, for the 90 N·m hold) | 1 | — | — |
| — | Grease: Nabtesco VIGOGREASE RE0 or Molykote BR2 Plus (cycloid), Harmonic Grease SK-1A (KH-14); gauge adhesive (M-Bond 610 class), protective coating (M-Coat) | — | — | — |

## C. Tools
As P03, plus a strain-gauge bonding kit (clamps, Teflon tape, curing oven 120–175 °C for M-Bond 610), a fine
soldering iron, a gauge installation tester, a rotor-locking pin for the static overload test, gauge pins Ø5 and Ø4.

## D. Manufacturing
* **Cycloid gear sets:** P04.1.
* **Motors:** KM-115x32-N50 needs a new Ø115 lamination die; KM-85x26 uses the Ø85 die. Wind, impregnate and test per
  docs/13 §3 (method) and §3.11 (these two variants), with the values in docs/09 §6.1. Run the FEMM check on each new design before cutting the die.
* **Torque flexure (KH-C25/C20):** Ti-6Al-4V, 4 radial spokes, sized for ≈ 200 µε at the gear-limited torque
  (**160 N·m KH-C25, 105 N·m KH-C20**; K1 flexures were sized for 127 / 73 N·m and are too soft). Check by FEA.
  Gauge pads ground flat, Ra ≤ 0.8.
* **Housings:** 7075-T6, hard anodise with masked seats. Fits in docs/09 §2. Critical:
  - ring-pin circle coaxial with the rotor bearing seats ≤ 0.01 mm;
  - crossed-roller seat coaxial with the ring ≤ 0.01 mm;
  - KH-14: circular spline and wave generator concentricity ≤ 0.01 mm, mounting-face perpendicularity ≤ 0.01 mm,
    axial room for the flexspline to "breathe" (vendor drawing).

## E. Assembly
**Torque flexure (KH-C25, KH-C20):**
1. Bond 4 shear gauges on the flexure spokes at ±45° as a full Wheatstone bridge (insensitive to bending and
   temperature when the gauges are matched).
2. Cure per the adhesive data sheet, wire to the 4-pin flexure connector and coat.
3. Measure the bridge: 350 Ω ± 0.5 %, insulation > 10 GΩ.

**Motor (all):** stator, NTCs, rear rotor bearing, rotor on the guide rod as P03 steps 2–6. On the cycloids the rotor
hub is the hollow input shaft, with a keyway for the two eccentric sleeves.

**Cycloid gear train (KH-C25 shown; KH-C20 identical with its own parts). Housing on the bench, output end up:**
4. **Ring** into the front housing: spigot H7/js6, 2 dowels, 12.9 screws at the structural torque with Loctite 243.
5. **Output back ring** with its 8 output pins already pressed in (m6 pins into H7, Loctite 638) over the input shaft,
   pins pointing up.
6. **Disc 2:** key, eccentric sleeve 2, grease, needle cage, then disc 2 (mark up) over the sleeve and over the 8 output
   pins.
7. **Spacer**, then sleeve 1 on the same key (180° from sleeve 2), cage, and **disc 1** turned 180° about the axis
   relative to disc 2 (marks opposite). With 30 lobes the lobes coincide.
8. **Ring pins:** grease the 31 grooves; slide the pins in axially one by one, rocking the rotor so each groove meets a
   lobe valley. Fit the pin retaining washer.
9. **Output front disc** with the 61803 journal bearing onto the input shaft and onto the pin ends; 8 × M4 12.9 axially
   into the tapped pin ends at **4.5 N·m**, Loctite 243 (KH-C20: 6 × M3 at 1.7 N·m). The output pins are now
   supported at both ends.
10. Turn the rotor by hand through a full output turn: smooth, no tight spot, no knock. A tight spot means a mis-phased
    disc: stop and re-check step 7.
11. **Crossed roller** RB5013 (RB4010) onto the output front disc and into the housing; clamp ring 8 × M3 8.8 at
    1.2 N·m in a star.
12. **Flexure** on the output disc (2 dowels, screws at the structural torque), then the AksIM-2 ring; readhead on the
    housing, gap set with its shim.

**Strain-wave train (KH-14):**
4. Wave generator onto the rotor hub (keyed, Loctite 638).
5. Circular spline into the front housing (dowelled, screws to the vendor torque). Flexspline cup bolted to the
   crossed-roller inner ring / output carrier to the vendor torque.
6. Grease the flexspline teeth and the wave-generator bearing with the vendor's quantity. Insert the wave generator at
   the vendor's orientation and rotate: smooth, with **no dedoidal (off-by-one-tooth) assembly**. An incorrect mesh
   destroys the gear: follow the vendor's check exactly.

**Close-up (all):**
13. Motor encoder at the rear, drive carrier on its standoffs, phases, encoder and flexure connectors, rear cap with
    O-ring.
14. **Output flange** on 2 dowels: KH-C25 8 × M4 12.9 at **4.5 N·m**; KH-C20 **8 × M4 12.9 at 4.5 N·m** (K1's 8 × M3
    slipped at ≈ 125 N·m against the 115 N·m elbow momentary torque); KH-14 6 × M3 12.9 at 1.7 N·m. Loctite 243,
    witness marks.
15. Label and log serials.

## F. Electrical
* As P03 (XT30, 16 AWG drops; J-LINK; JST GH encoders).
* Flexure bridge → ADS1262 on the carrier (excitation 5 V, gain 32, 1 kSPS, sinc3 filter).
* **Drive peak-current limits (non-volatile):** KH-C25 21 A rms, KH-C20 18.8 A rms, KH-14 4.3 A rms, each then
  trimmed on the dyno so the measured output torque sits at 95–100 % of the gear's repeated rating.
* Shoulder-pitch brake (if fitted): 24 V coil from a torso 24 V supply through a low-side switch on the carrier;
  released only while the drive is enabled and healthy; it engages on STO.

## G. Testing (gate G1)
| Test | Pass (KH-C25 / KH-C20 / KH-14) |
|---|---|
| Phase resistance, insulation, back-EMF (motor model values, docs/09 §6.1) | R_LL ±10 %, Ke ±7 %, > 100 MΩ at 500 V |
| **Cycloid run-in**: 1 h at 25 % then 1 h at 50 % of the repeated rating, both directions, 50 % speed; change the grease | no metal in the grease, steady temperature, no growing noise |
| Kt at the output: slope = Kt·N·η (6.43 / 4.74 / 3.98 N·m/A at η 0.85 / 0.85 / 0.75) | within ±10 %; record measured η and feed it into `ETA` |
| **Drive current limit** commanded at 2 × over EtherCAT | output torque 152–160 / 100–105 / 22–23 N·m |
| **Cycloid static overload (R10 §7 item 6)**: rotor locked with the locking pin, output loaded through the 1 m arm to 250 / 160 N·m for 1 s, 3 times each direction | no permanent lost-motion change > 1 arcmin; no pin or lobe marks on teardown of the first article |
| Torsional stiffness (from the overload sweep) | record; feed into the arm model |
| Backlash / lost motion (dual encoder) | ≤ 7 arcmin cycloid; ≤ 1 arcmin strain-wave |
| Efficiency vs speed at 50 % and 100 % of the repeated rating | cycloid ≥ 0.80 at rated (model 0.85) |
| Torque flexure calibration: ±full scale with lever + weights | linearity ≤ 1 % FS, hysteresis ≤ 0.5 % FS |
| Collision detection: padded pendulum into the output link at 1 rad/s | flexure detects within 5 ms; controller backs off |
| Thermal: 100 / 44 / 9 N·m at 2 rad/s to steady state | winding ≤ 120 °C; gear housing ≤ 80 °C |
| Endurance: 10⁵ reach cycles at the arm torque profile | lost-motion growth < 1 arcmin (cycloid) / < 0.5 arcmin (strain-wave); grease clean |

---

# P04.1 — Machined cycloid gears (C25 and C20)

Four C25 sets (shoulders) and four C20 sets (shoulder yaw, elbows), plus one spare disc pair of each. Specification:
docs/09 §5.3. Build and test **one C25 set first** (G1 static overload above) before ordering the rest.

## A. Visual reference
* Profile generator: `cad/cycloid_profile.py` (writes `cad/out/cycloid_KH-C25.dxf`, `cycloid_KH-C20.dxf` and the STEP discs)
* Disc models: `cad/out/step/cycloid_KH-C25_disc.step`, `cycloid_KH-C20_disc.step`
* Equations and design background: [docs/13 §4.2](../13-scratch-build-motors-actuators.md)

```
            ring: 31 pin grooves on Ø84 (C25), pins Ø5 roll freely
        ╭───────────────────────────────╮
        │   disc 1 (30 lobes) ── E 0.9 ──► orbit     output pins Ø8 through Ø9.80 holes (8 on PCD 52)
        │   disc 2 (180° phase)                       needle cage Fw20/Ew26 on eccentric sleeve Ø20 h5
        ╰───────────────────────────────╯
```

## B. Parts list (per set)

| Part | C25 | C20 |
|---|---|---|
| Discs (matched pair) | 2 × 8.0 mm, 100Cr6 hardened 60–62 HRC (route A) | 2 × 6.0 mm (7.0 mm per docs/13 §4.2) |
| Ring | 42CrMo4 Q&T 28–32 HRC, nitrided, 31 grooves on Ø84.000 | 31 grooves on Ø68.000 |
| Ring pins | 31 × Ø5 × 19.8 needle rollers ISO 3096 G2 (or ISO 8734 Ø5 m6, 60 HRC) | 31 × Ø4 × 15.8 |
| Output pins | 8 × ISO 8734 Ø8 m6, ≥ 58 HRC, ends tapped M4 | 6 × Ø6, ends tapped M3 |
| Eccentric sleeves | 2 × 100Cr6 60–62 HRC, Ø20 h5, E 0.900 ±0.003, keyway | 2 × Ø16 h5, E 0.800 |
| Needle cages | 2 × INA K-series Fw 20 / Ew 26, width ≤ 8 mm | 2 × Fw 16 / Ew 22, width ≤ 6 mm |
| Output back ring and front disc | 17-4PH H1025 or 42CrMo4 Q&T | same |
| Spacer between discs | 1 mm 100Cr6 shim, ground | 1 mm |

## C. Tools & equipment (outsourced items in brackets)
Python with CadQuery (to run the profile script), [wire-EDM shop with 3-skim capability], [heat treater], [CMM or
optical comparator service], surface plate, micrometers, gauge pins Ø5 / Ø4 (class ZZ or better), lapping plate and
fine diamond paste, ultrasonic cleaner.

## D. Manufacturing
1. **Generate the profile.** `python cad/cycloid_profile.py`. The script asserts E·N < R and checks that the pin radius
   is below 0.8 × the minimum radius of curvature of the pin-centre epitrochoid (no undercut); it prints that
   radius. **Before sending the DXF:** change the eccentric bore from the Ø22 in the script to **Ø26 G6 (C25)** and keep
   **Ø22 G6 (C20)** (docs/09 §11 H6), and add the output-pin holes Ø9.80 / Ø7.60 +0.01/0. Have Ø3 wire start holes drilled at two
   output-pin centres before hardening; the shop uses them to align and pin the two-disc stack.
2. **Blanks:** 100Cr6 plate, ground both faces parallel within 0.005 mm, thickness 8.00 / 6.00 −0.005. Through-harden
   to 60–62 HRC and temper **before** EDM (route A, docs/09 §5.3). Witness coupon with each batch for hardness.
3. **Wire EDM (route A):** stack the two discs of a pair on the alignment pins and cut profile, bore and pin holes in
   one setup: rough cut + 3 skim cuts. Specify to the shop: profile ±0.005 mm, bore and pin-hole position ±0.005 mm,
   Ra ≤ 0.6 µm. Mark both discs on the same lobe ("lobe 1") before unstacking.
   - Route B (42CrMo4 Q&T + nitride): cut, then gas nitride; press a hardened 100Cr6 sleeve into the bore as the needle
     raceway; allow for 0.005–0.010 mm nitride growth in the profile offset.
   - Route C (jig/profile grinding from the DXF): best accuracy (±0.002 mm, Ra ≤ 0.2); use it if the EDM sets fail the
     run-in or efficiency targets.
4. **Recast removal:** lap the profile flanks and bore lightly with fine diamond paste on a hardwood or brass lap
   (2–5 µm), then ultrasonic clean. Do not round the lobe tips.
5. **Ring:** wire EDM the 31 semicircular grooves (Ø5.00 / Ø4.00 F7) on the pin circle, then nitride. Pins must roll
   freely in the grooves.
6. **Eccentric sleeves:** turn, harden, then grind the OD on a fixture that sets E; grind both sleeves of a set in the
   same setup so E matches within 0.003 mm. Keyway before hardening.
7. **Output pins:** ISO 8734 hardened dowels; tap the ends M4 (C20: M3) by EDM-drill or buy pins with tapped ends
   (ISO 8735).

## E. Assembly (bench pre-check of each set before it goes into an actuator)
1. Clean all parts; oil lightly.
2. On a plate: ring pins into the ring, both discs on a ground test mandrel with the sleeves, phased 180°.
3. Rotate the mandrel through 30 turns (one output turn): smooth, no tight spot, no knock.
4. Measure the free lost motion of the output pins by hand with a dial indicator on a lever: record.
5. Tag the set (ring, disc pair, sleeves) with one serial. Parts of a set stay together.

## F. Electrical
None. (The actuator's drive limits are set in P04 §F.)

## G. Testing and measurement
| Check | Method | Accept |
|---|---|---|
| Disc profile | CMM (≥ 72 points per lobe) or optical comparator at 20× against the DXF | ±0.005 mm everywhere |
| Over-pins dimension | two gauge pins Ø5 (Ø4) in diametrically opposite lobe valleys, micrometer; nominal from the CAD | within ±0.005 mm of nominal; the two discs of a pair within 0.003 mm |
| Bore and pin holes | bore gauge; CMM position | bore G6; pin-hole position ±0.005 mm; bore-to-profile concentricity ≤ 0.005 mm |
| Hardness | Rockwell on the witness coupon; file test on a non-functional face | 60–62 HRC (route A) |
| Eccentricity of sleeves | V-block + dial indicator | E 0.900 / 0.800 ±0.003 mm, pair within 0.003 mm |
| Ring-pin circle | CMM | Ø84.000 / Ø68.000 ±0.005 mm, groove pitch error ≤ 0.005 mm |
| Bench pre-check (E above) | hand rotation, lost motion | smooth; lost motion recorded |
| In the actuator | P04 §G (run-in, overload, backlash ≤ 7 arcmin, efficiency ≥ 0.80) | as listed |
