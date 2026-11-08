# 13 — Optional track: scratch-build every motor and actuator

This track replaces bought motors and gearboxes with parts you make: wound copper stators, magnet
rotors, cut gears, machined housings and your own drives. It is **optional**. The baseline
(docs/04) already builds the knee and hip-pitch motors (KM-130) and the KM-50 from scratch, because no
commercial part meets those requirements. Everything here extends that to the rest of the robot.

Generated designs: [generated/km_scratch_designs.md](generated/km_scratch_designs.md) (one motor per
actuator class, with coil-by-coil winding tables) and [generated/km_motor_designs.md](generated/km_motor_designs.md).

## 1. What can and cannot be made: feasibility matrix

| Part | Make at home | Make with a job shop | Buy only | Why / closest buildable alternative |
|---|---|---|---|---|
| Stator **laminations** | ✗ (needs laser/EDM + insulation-coated electrical steel) | ✓ laser-cut or wire-EDM stacks from NO20 / M270-35A sheet | | Order prototype stacks to your DXF; bonding is done at home |
| Stator **winding** (copper coils) | ✓ | ✓ | | Hand needle-winding on the teeth with a jig is practical for 36 slots |
| **Magnets** (sintered NdFeB) | ✗ | ✗ | ✓ | Sintering, grinding and magnetising NdFeB needs an industrial process (hydrogen decrepitation, jet milling, aligned pressing, vacuum sintering at ~1,080 °C, pulse magnetisers). **Buy custom-shaped arcs** (N42SH, NiCuNi coated) from magnet suppliers. Bonded-NdFeB (printable) has about half the remanence and would cost ~40 % of the torque. |
| Rotor back-iron, hubs, shafts | ✓ (lathe) | ✓ | | 1018 steel ring, 7075 hub |
| Rotor **sleeve** | ✓ | | | wet-wound carbon or Kevlar tow on a mandrel |
| **Bearings** (crossed-roller, deep-groove, needle) | ✗ | ✗ | ✓ | Precision-ground races and rollers; buy |
| **Planetary gears** | △ (external gears on a CNC with a hob/4th axis, prototypes) | ✓ hob/shape, wire-EDM rings, carburise, grind | | Gear shop to drawing (docs/09 §5). Printed gears are for fit checks only |
| **Cycloidal reducer** (alternative to strain-wave) | △ | ✓ wire-EDM discs, hardened pins | | **The recommended DIY replacement for strain-wave gears** (§4.2) |
| **Strain-wave flexspline** | ✗ | ✗ (specialised) | ✓ | Thin-walled (≈ 1 % of diameter) alloy-steel cup with fine involute teeth that flexes 2× per input turn. Fatigue life depends on special steel, heat treatment, shot peening and tooth form. Not reproducible reliably. Use **cycloidal** instead, or buy |
| Housings, carriers, flanges | ✓ (mill/lathe) | ✓ | | 7075; hard anodise (Type III) outsourced; Type II you can do at home |
| **Encoders** | ✓ magnetic (MT6835 chip on your own PCB + diametric magnet) | | ✓ optical/inductive absolute rings (AksIM-2) | Making the absolute ring/scale is not practical; the IC is a buy-and-solder part |
| **Motor drives** | △ | ✓ PCB assembly | | Feasible from the TI TIDA-010979 architecture (§7). Months of firmware and safety work |
| MOSFETs, gate drivers, MCUs | | | ✓ | semiconductors |
| **Cells** | ✗ | ✗ | ✓ | Pack assembly is yours (P06) |
| Hand micro-motors (10 mm) | ✗ | ✗ | ✓ | Winding 10 mm coreless motors (self-supporting skew windings) needs dedicated machines; buy maxon/Faulhaber |
| Ball screws (micro) | ✗ | ✗ | ✓ | ground thread + recirculating balls |
| Ti push-rods, crosses | ✓ (lathe/mill, care with Ti) | ✓ | | |

✓ feasible · △ possible with significant tooling/skill · ✗ not realistically possible

## 2. The scratch-built motor family

| Motor | Replaces | Use |
|---|---|---|
| KM-130x45 / KM-130x40 | (baseline custom) | knee / hip pitch |
| **KM-85x26** | TQ ILM85x26 | KA-110P (hip roll, waist pitch) |
| **KM-85x17** | CubeMars RI85-PH | KA-90P (hip yaw, waist yaw, ankles) and KH-20 |
| **KM-85x12** | TQ ILM85x13 | KH-25 (shoulders) |
| KM-50x20 | (baseline custom) | KH-14 |

The three KM-85 designs share **one lamination die** (Ø85, 36 slots) and **one magnet arc**
(42 × 7.29° × 2.5 mm). Only the stack length and the turns change, which makes them cheap to make in quantity.
The model reproduces the commercial motors they replace within ±6 % on Km, so the actuator sizing
in docs/04 stays valid if you substitute them. **Re-run `calc/run_all.py` with the measured values once built.**

## 3. Making a motor, step by step (KM-130x45 shown; the others are identical in method)

### 3.1 Verify the design in FEMM first (free, 2-D magnetostatic)
1. Draw one **symmetry section**. For 36s/42p the pattern repeats every 12 slots / 14 poles, so model 1/3 of
   the motor (12 teeth, 14 magnets) with anti-periodic/periodic boundaries.
2. Materials: NO20 (or M270-35A) BH curve, N42SH at 80 °C (Br ≈ 1.22 T, μr 1.05), copper, air.
3. Check, at rated current (34.8 A rms → peak in phase A, half in B and C), stepping the rotor 0.5° over one pole pair:
   * airgap flux density fundamental ≈ 1.2 T at open circuit (the model says 1.20 T);
   * tooth and yoke peak flux ≤ 1.8 T at rated current, and the knee of the curve at ≈ 3× rated (saturation → peak torque);
   * torque constant within ±10 % of 0.310 N·m/A rms;
   * cogging torque peak-to-peak < 1 % of rated (36s/42p has LCM 252, so cogging is inherently low).
4. Mechanical: the calculated yoke (2.1 mm) is magnetically sufficient but fragile. **Use a 3.0 mm yoke**
   (stator OD unchanged, slot depth −0.9 mm, about −6 % slot area, accepted) and confirm the flux densities again.

### 3.2 Laminations
1. Export the lamination DXF from the FEMM geometry. Features:
   - 36 teeth; tooth tips with a 1.2 mm deep shoe and a 2.0 mm slot opening;
   - 3 mm yoke; OD 130.00;
   - 2 key notches on the OD for housing alignment;
   - 2 small weld or bond notches.
2. Order a **prototype stack** from a lamination service (laser-cut + stacked + bonded, or wire-EDM a
   pre-bonded block): 0.20 mm NO20 with a C-5 insulation coating. Stack height 45.0 mm ≈ 225 laminations.
   Burr ≤ 0.02 mm. Ask for a stacking factor ≥ 0.95.
3. If you receive loose laminations, bond them yourself:
   1. Clean them.
   2. Stack on a hardened mandrel with key bars (keeps the slots aligned).
   3. Press 1 MPa in a fixture and wick Loctite 290 (or use self-bonding Backlack laminations heated per the supplier).
   4. Cure in an oven.
   5. Check that the stack is square (≤ 0.05 mm) and that a slot gauge passes through every slot.
4. Deburr the slot edges with a fibre brush. Check insulation between laminations (> 1 kΩ across the stack with a megger at 50 V). That limits eddy losses.

### 3.3 Slot insulation
1. Cut **Nomex 410, 0.13 mm** liners to the slot perimeter plus 2 mm (a printed template helps). Crease and insert one per slot, folded over at the tooth tips.
2. Fit end-lamination insulators (printed PA12-CF or Nomex) on both stack faces so the wire never touches lamination edges.

### 3.4 Winding (the copper coil)
Use the coil table in [generated/km_scratch_designs.md](generated/km_scratch_designs.md):

```
36 slots / 42 poles, coil k around tooth k ('+' clockwise seen from the lead end):
T01:+A T02:+B T03:-B T04:-C T05:+C T06:+A T07:-A T08:-B T09:+B T10:+C T11:-C T12:-A   (repeats ×3)
```

* **Conductor:** KM-130x45 needs 5 turns × 2 parallel paths of ≈ 1.78 mm equivalent copper per turn. Wind
  **7 strands of Ø0.67 mm grade-2 enamelled copper, Class H (200 °C)** in hand, so the bundle stays
  flexible and AC losses stay low. KM-130x40: 3 turns of ≈ 2.30 mm equivalent (12 × Ø0.67).
* **Method (needle winding by hand):**
  1. Mount the stator on a rotary indexing jig (printed, 10° detents).
  2. For each tooth: anchor the bundle at the lead end, then wind the required turns around the tooth in the table direction, laying turns flat and tight against the liner.
  3. Use a smooth nylon wedge to dress each turn into the slot. Each slot holds two half-coils (double layer), so keep each coil within its half of the slot.
  4. After each coil, tie it off with Kevlar lacing at both end faces. Label the start/finish leads (A1s, A1f…).
* **Connection:**
  - Each phase has 12 coils.
  - KM-130x45 (2 paths): two groups of 6 coils in series per phase (alternating teeth of that phase in the sequence), the groups paralleled.
  - Observe the signs: a "−" coil is connected finish-to-finish with its neighbour (equivalent to winding it the other way).
  - Join the three phase ends in a **star** with a crimped and soldered star point, insulated with Class H sleeving.
* **Leads:** 3 phase leads in high-temperature silicone (12 AWG for KM-130), plus 2 NTCs (EPCOS B57861S) laid against the end turns at the hot spot (near the lead exit).
* **Check before varnishing:**
  - phase resistances equal within ±2 % (KM-130x45 model: 32.6 mΩ line-to-line at 20 °C);
  - insulation > 100 MΩ at 500 V to the stack;
  - a surge/comparison test if available, otherwise the phase inductances must be equal within ±3 % on an LCR meter.

### 3.5 Impregnation
1. Pre-heat the stator to 80 °C.
2. Vacuum-dip (or trickle-impregnate) in **Class H polyester-imide or epoxy varnish**.
3. Drain, then bake to the varnish schedule (typically 2 h at 150 °C).

This fills the voids (thermal conduction from copper to iron, mechanical locking, moisture protection).
Re-test insulation afterwards.

### 3.6 Rotor
1. **Back-iron ring:**
   - 1018 steel, OD 89.6 (the magnets add 2 × 3.0 to give a rotor OD of 95.6 mm), radial thickness 3.6 mm;
   - turned and ground to concentricity ≤ 0.01 mm;
   - press or bond it onto the 7075 hub, which has its two bearing seats.
2. **Magnets:**
   - Order 42 arcs: N42SH, 3.0 mm thick, 7.29° arc at Ø95.6 OD, 45 mm long (or 3 × 15 mm segmented axially, which cuts eddy losses and is easier to source).
   - NiCuNi coated, **radially magnetised**. Order 10 % spares.
   - Check every magnet's polarity with a gaussmeter and mark the N face.
3. **Bonding fixture:**
   - A printed or aluminium (non-magnetic) indexing ring with 42 pockets holds the magnets in **alternating polarity** (N out, S out, …) at exact pitch.
   - Bond with a high-temperature structural epoxy (Loctite 9492 / 3M 2216 class).
   - Load one magnet at a time. Each new magnet is attracted strongly to the steel ring, so slide it in from the side with a non-magnetic pusher and **never put fingers between a magnet and steel**.
4. **Sleeve:**
   - Wet-wind carbon tow (or Kevlar) 0.3 mm thick over the magnets with epoxy, under light tension.
   - Cure and grind to the final OD (airgap 0.60 mm to the stator bore).
   - This retains the magnets at speed and in a crash.
5. **Balance:** static on knife edges, then dynamic on the lathe at 1,000 rpm using a phone-accelerometer app, removing material from the hub to G2.5.

### 3.7 Assembly (rotor into stator): magnet safety
The radial pull of a 42-pole rotor entering a stator is several hundred newtons and acts suddenly.
1. Mount the stator (potted in its housing, P05 §E) vertically on the press table.
2. Fit a **Ø20 mm hardened guide rod** through the housing's bearing seat and the rotor hub bore. A printed PTFE sleeve on the rotor keeps it concentric.
3. Lower the rotor with the press quill (never by hand) until the bearings seat.
4. Remove the sleeve, fit the second bearing and the wave spring, then rotate by hand: smooth, with faint cogging only.

### 3.8 Bearings and encoder
Rotor bearings (68xx thin-section) j5/H6, wave spring 30–60 N preload. Motor encoder:
- **AksIM-2 ring** on the hub, readhead on the rear cap; or
- **MT6835** on the drive PCB facing a diametric magnet at the hub end (shaft-end mounting). A hollow hub needs an off-axis magnetic ring, so use the AksIM-2 ring for KA-130.

### 3.9 Cooling options
* Baseline: potted stator in a finned 7075 housing with ducted air (derate 1.00).
* **Liquid jacket (fallback if the knee thermal test fails):**
  - a helical 6 × 3 mm channel machined in a stainless or aluminium sleeve, shrink-fitted over the stator OD and sealed with O-rings;
  - 0.3–0.5 L/min water–glycol from a 12 V micro pump (TCS / Bürkert class);
  - a radiator in the thigh duct.
  - Expected continuous gain ≈ 1.6× (copper-to-coolant thermal resistance ≈ 0.25 K/W vs ≈ 0.6 K/W air-cooled; validate on the dyno). Adds ≈ 0.35 kg per leg.

### 3.10 Motor acceptance tests (before building it into an actuator)
| Test | Equipment | Pass (KM-130x45 model) |
|---|---|---|
| Phase resistance (4-wire) at 20 °C | milliohm meter | 32.6 mΩ L-L ±10 %, phases within ±2 % |
| Inductance | LCR meter, 1 kHz | phases within ±3 %; record Ld/Lq by rotor position |
| Hi-pot, winding → stack | 1,000 V AC (or 1,500 V DC) 60 s | no breakdown, leakage < 1 mA |
| Insulation resistance | 500 V DC | > 100 MΩ |
| Back-EMF constant | spin with a second motor at 500 rpm, scope L-L voltage | Ke L-L peak 0.253 V·s/rad ±7 %, sinusoidal (THD < 5 %) |
| Torque constant | locked rotor on a lever + load cell, 5–35 A | Kt 0.310 N·m/A rms ±8 %; linear to ≈ 80 A, then saturating |
| Cogging | rotate slowly with a torque arm | < 0.1 N·m peak-to-peak |
| Thermal step | 10.8 N·m equivalent current (34.8 A) in the potted housing with duct air | winding ≤ 120 °C at steady state |

If Kt or Km is more than 10 % off, update `calc/kestrel/actuators.py` (or `motor_design.py`'s
calibration) and re-run `calc/run_all.py` before building more.

## 4. Making the gearboxes

### 4.1 Planetary (KA family)
* **Recommended:** a gear shop machines to the docs/09 §5 table (hob/shape, carburise, grind).
* **Prototype path at home:**
  1. Print the gears in PA12 or tough resin to check meshing, backlash and assembly inside the rotor.
  2. Then CNC-hob the external gears in 17-4PH on a 4th axis (single-tooth fly cutter or a module hob on a mill arbor) for low-load tests.
  3. Internal rings: wire-EDM from 42CrMo4 pre-hardened plate (job shop).
  4. Heat treatment (carburise + temper, or nitride) is always outsourced.
* Inspection: over-pin measurement (two pins in opposite tooth spaces) to verify tooth thickness; meshing backlash 0.03–0.06 mm at m1.25.

### 4.2 Cycloidal reducer: the DIY replacement for strain-wave gears (KH family)
Recommended scratch-build arm actuator: **KH-C** (cycloidal), replacing the bought strain-wave sets.

| Item | KH-C25 (shoulder) | KH-C20 (shoulder yaw, elbow) |
|---|---|---|
| Ratio | 30:1 (31 ring pins, 30-lobe disc) | 30:1 |
| Ring-pin circle | Ø84 mm, pins Ø5 mm hardened dowels (62 HRC) in a 42CrMo4 ring | Ø68, pins Ø4 |
| Eccentricity | 0.9 mm (K1 = E·N/R = 0.66; min epitrochoid curvature radius 4.9 mm vs pin radius 2.5 mm) | 0.8 mm (K1 0.73; 3.7 mm vs 2.0 mm) |
| Discs | 2 discs at 180° (balance), 8 mm thick each, 42CrMo4 Q&T + nitrided, **wire-EDM profile** (generated from the standard cycloid equations with a 0.02 mm profile modification for clearance) | 6 mm |
| Output | 8 pins Ø8 through disc holes into the output flange (crossed-roller) | 6 pins |
| Expected | backlash 1–3 arcmin with precision EDM; efficiency 0.82–0.88; momentary capacity > 3× rated | |
| Effect on sizing | 30:1 instead of 50:1: speed +67 %, torque × 0.6 × (0.85/0.75). KH-25 → ≈ 119 N·m peak (req. 67), 11.8 rad/s; KH-20 → ≈ 128 N·m (req. 55), 12 rad/s | |

The disc profile for EDM is generated by `cad/cycloid_profile.py` (outputs `cad/out/cycloid_KH-C25.dxf`,
`cycloid_KH-C20.dxf` and STEP discs) from the standard equations, with pin-circle radius R, pin radius
Rr, eccentricity E and N ring pins:

```
psi(t) = atan2( sin((1−N)t),  R/(E·N) − cos((1−N)t) )
x(t)   =  R·cos t − Rr·cos(t + psi) − E·cos(N·t)
y(t)   = −R·sin t + Rr·sin(t + psi) + E·sin(N·t)
```

The script checks E·N < R and that the pin radius is below 0.8× the minimum radius of curvature of the
pin-centre epitrochoid (no undercut). It also removes 0.02 mm for running clearance. Verify the meshing in CAD before cutting. Cycloidal reducers tolerate
shock better than strain-wave gears and need no special steel. They are heavier, about +0.15 kg per
actuator.

### 4.3 Strain-wave (if you insist)
Not recommended (§1). If you experiment, treat it as research. The flexspline fatigue life cannot be
validated without long endurance testing and metallurgy.

## 5. Housings and structure
Everything in docs/09 §3 is CNC work you can do yourself with a capable mill and lathe (7075, Ti with
care). Hard anodise (Type III) is outsourced. Type II sulphuric anodise is possible at home with a
small tank, but it is softer.

## 6. Bearings, magnets, cells, semiconductors
Buy them (see §1). Use authorised distributors for cells (counterfeits are common, R3) and for magnets
(request grade certificates with Br/Hcj at temperature).

## 7. Building the joint drives yourself (cost-down option)
* **Architecture (TI TIDA-010979 pattern [R2]):**
  - AM2612 or F28P650DK MCU (the F28P65 has an on-chip EtherCAT slave controller and SIL2 hardware);
  - 3 × DRV7167 100 V GaN half-bridges (60 A rms), or DRV8353RS + 6 × ISC022N10NM6 MOSFETs;
  - isolated delta-sigma current sensing (AMC0106M05) or INA241 + 1 mΩ shunts;
  - 2 × BiSS-C encoder interfaces; EtherCAT PHYs;
  - a Ø70 mm annular board with a 15 mm bore.
* **Firmware:** FOC (Park/Clarke, SVPWM 20–40 kHz), current/velocity/position loops, field weakening,
  CiA-402 state machine over EtherCAT (ESI file), encoder calibration, thermal model, fault handling.
* **STO:** two independent hardware channels that remove gate-driver supply/enable, so they cannot be overridden by firmware. Test the response time.
* **Effort:** 6–12 months for a robust, tested drive. Recommendation (R2): buy modules first and design
  your drive as a later cost-down for the low-power joints.

## 8. Cost and time comparison (per actuator class, rough)

| Item | Buy route | Scratch route | Notes |
|---|---|---|---|
| Ø85 frameless motor | A$450–1,300 (CubeMars/TQ) | A$180–350 (laminations, magnets, wire) + ≈ 15 h | big saving on the TQ classes |
| KM-130 motor | n/a | A$1,050–1,100 + ≈ 25 h | baseline already |
| Strain-wave set | A$450–640 (Leaderdrive) | cycloidal A$250–400 (EDM + pins) + ≈ 10 h | cycloidal is more robust |
| Drive | A$945–1,600 | A$150–250 parts + months of development | after the robot works |
| Encoder (motor side) | A$456 (AksIM-2) | A$18 (MT6835) | baseline already uses MT6835 on 19 joints |
