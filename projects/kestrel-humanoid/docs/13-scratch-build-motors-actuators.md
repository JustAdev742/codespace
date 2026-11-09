# 13 — Scratch-build motors and actuators (Mk II)

This track covers the parts you make yourself: wound copper stators, magnet rotors, liquid jackets, cut gears, machined
cycloids, housings and drives. In Mk II much of it is **no longer optional**. No commercial part meets these
requirements, so the baseline (docs/04) builds:

* **KM-130x50-LC** (knee, hip pitch) with its liquid jacket;
* **KM-115x32-N50** (shoulders) and **KM-85x26-N50-4t** (shoulder yaw, elbow);
* KM-50x20 (wrist yaw, neck);
* the **C25 and C20 machined two-disc cycloids**;
* the **KW-L2** wrist linear actuators, which use a bought motor and screw in your own housing.

The optional part of the track replaces the remaining bought motors: RI115-PH by KM-115x32-N50, RI85-PH by
KM-85x26-N50-3t, and the bought drives.

Design data: [generated/actuator_family.md](generated/actuator_family.md) (Mk II motor table),
[research/R10](research/R10-actuator-state-of-the-art.md) §5 and §8 (derivations of every Mk II motor), and
[generated/km_scratch_designs.md](generated/km_scratch_designs.md) / [generated/km_motor_designs.md](generated/km_motor_designs.md)
for the K1 N42SH designs and the 36s/42p coil table. The two generated KM sheets still show the K1 N42SH variants; the
Mk II N50UH numbers below come from R10 and `actuators.py`. Tags: **[E]** estimate (model or arithmetic shown),
**[VT]** validation target, **[V]** datasheet.

## 1. What can and cannot be made: feasibility matrix

| Part | Make at home | Make with a job shop | Buy only | Why / closest buildable alternative |
|---|---|---|---|---|
| Stator **laminations** (0.20 mm NO20) | ✗ (laser/EDM + insulation-coated electrical steel) | ✓ laser-cut or wire-EDM stacks to your DXF | | Bonding is done at home. Keep 0.20 mm NO20 for Mk II: iron loss at maximum knee speed ≈ 85 W (R10 §3.2.5) |
| Segmented stator teeth + rectangular-wire bobbin coils (KA-150X only) | ✗ | △ wire-EDM segments ✓; layer-wound rectangular coils need a bobbin winder | | Not in the Mk II baseline (docs/04 §6) |
| Stator **winding** (round multi-strand) | ✓ | ✓ | | Hand needle-winding with an indexing jig is practical for 36 slots |
| **Magnets** (sintered NdFeB, **N50UH**) | ✗ | ✗ | ✓ | Sintering, grinding and magnetising need an industrial process (hydrogen decrepitation, jet milling, aligned pressing, vacuum sintering at ~1,080 °C, pulse magnetisers). **Buy custom arcs, N50UH, NiCuNi coated, with grade certificates (Br, Hcj at temperature).** UH grades have longer lead times than SH; order early. Bonded NdFeB has about half the remanence and would cost ~40 % of the torque |
| Rotor back-iron, hubs, shafts | ✓ (lathe) | ✓ | | 1018 ring, 7075 hub |
| Rotor **sleeve** | ✓ | | | wet-wound carbon tow on a mandrel |
| **Liquid jacket** (sleeve with helical channel) | ✓ (CNC lathe threading cycle) | ✓ | | §3.9. The two-start helix is a coarse thread cut with a grooving insert |
| **Bearings** | ✗ | ✗ | ✓ | precision-ground races and rollers |
| **Planetary gears** | △ (prototype external gears on a 4th axis) | ✓ hob/shape, wire-EDM rings, carburise, grind | | gear shop to drawing (docs/09 §5); printed gears for fit checks only |
| **Cycloid discs, ring, pins** (C25, C20) | △ only if you own a wire EDM | ✓ wire-EDM discs, nitriding | pins ✓ (62 HRC dowels) | §4.2. **Baseline in Mk II** |
| **Strain-wave flexspline** | ✗ | ✗ | ✓ | thin-walled alloy-steel cup that flexes 2× per input turn; its fatigue life depends on steel, heat treatment, shot peening and tooth form. Only KH-14 still uses one (bought set) |
| Housings, carriers, flanges | ✓ (mill/lathe) | ✓ | | 7075; Type III hard anodise outsourced |
| **Encoders** | ✓ magnetic (MT6835 on your PCB) | | ✓ AksIM-2 rings | the absolute ring/scale is not practical to make |
| **Motor drives** | △ (EV-class, ≤ 60 A) | ✓ PCB assembly | | §7. The **150 A GaN HC2** uses chip-scale GaN parts that need reflow and X-ray inspection: job-shop assembly only, never hand-soldered |
| MOSFETs, GaN, gate drivers, MCUs | | | ✓ | semiconductors |
| **Cells** | ✗ | ✗ | ✓ | pack assembly is yours (P06) |
| Flat BLDC motor for KW-L2 (maxon ECX FLAT) | ✗ | ✗ | ✓ | thin multi-pole outer-rotor windings with Halls; buy |
| Hand micro-motors (10 mm) | ✗ | ✗ | ✓ | coreless skew windings need dedicated machines; buy maxon/Faulhaber |
| Ball screws (Ø4–Ø8) | ✗ | ✗ | ✓ | ground thread + recirculating balls |
| Ti push-rods, crosses | ✓ (care with Ti) | ✓ | | |

✓ feasible · △ possible with significant tooling/skill · ✗ not realistically possible

## 2. The scratch-built motor family (Mk II)

All Mk II motors use **N50UH** magnets (R10 §3.2.4: Br +8.6 % over N42SH, Hcj ≥ 25 kOe for 4× rated current). Data from
[generated/actuator_family.md](generated/actuator_family.md) and `actuators.py` (R10 §8); resistances at 120 °C.

| Motor | Use | Status | Die (OD, slots/poles) | Stack | Turns × paths | Kt (N·m/A rms) | R_LL 120 °C | Km | Cont / peak (N·m) | Mass |
|---|---|---|---|---|---|---|---|---|---|---|
| **KM-130x50-LC** | KA-130K knee, KA-130H hip pitch (4 + spare) | baseline | Ø130, 36/42 (K1 die) | 50 mm | 3 × 2 | 0.2242 | 20.26 mΩ | 1.286 | 18.85 [VT, jacket] / 31.5 @150 A | 2.615 kg |
| **KM-115x32-N50** | KH-25 shoulders (4) | baseline | Ø115, 36/40 | 32 mm | 3 × 1 | 0.2522 | 70.2 mΩ | 0.777 | 5.49 / 14.2 @60 A | 1.355 kg |
| **KM-85x26-N50-4t** | KH-20 shoulder yaw, elbow (4) | baseline | Ø85, 36/42 | 26 mm | 4 × 1 | 0.1856 | 146.1 mΩ | 0.396 | 2.01 / 6.18 | 0.642 kg |
| KM-115x32-N50 | KA-110P (replaces RI115-PH) | optional | as above | | | | | | | |
| KM-85x26-N50-3t | KA-90P (replaces RI85-PH) | optional | Ø85, 36/42 | 26 mm | 3 × 1 | 0.1392 | 82.2 mΩ | 0.396 | 2.01 / 6.18 | 0.642 kg |
| KM-85x17-N50-5t | KH-20 lighter variant | not used in Mk II | Ø85, 36/42 | 17 mm | 5 × 1 | 0.1517 | 171.3 mΩ | 0.299 | 1.31 / 4.04 | 0.434 kg |
| KM-50x20 | KH-14 wrist yaw, neck (4) | baseline (unchanged) | Ø50, 12/14 | 20 mm | 18 × 1 | 0.106 | 864.8 mΩ | 0.093 | 0.28 / 0.9 | 0.23 kg |

Why the KM-85x17 is not used: at the elbow its 60 s hold is 1.5 × 1.31 × 0.85 × 30 × 0.85 = 42.6 N·m against the
59 N·m one-handed-carry hold [E]. KM-85x12 (the K1 KH-25 scratch motor) is retired; the Mk II shoulder needs the Ø115.

**The two dies.** The Ø85 motors share one lamination die and one magnet arc (42 × 7.29° × 2.5 mm); only stack and
turns change. The Ø130 die is the K1 die. KM-115x32 needs a new Ø115 die (R10 §5.4).

**Honest limit of the model (R10 §1.2 item 6).** At the model's 7 A/mm² rule, the scratch Ø85 motors match the
commercial kits on Km but not on the datasheet continuous torque (KM-85x26 1.96 vs ILM85x26 2.9 N·m). The sizing used the
model's (lower) values, so measured continuous torque may come out higher. Never substitute a scratch motor for a
datasheet motor (RI115-PH, RI85-PH) without re-running `calc/run_all.py` with the measured Kt, R and thermal rating.

## 3. Making a motor, step by step (KM-130x50-LC shown; the others are identical in method)

### 3.1 Verify the design in FEMM first (free, 2-D magnetostatic)
1. Draw one **symmetry section**. For 36s/42p the pattern repeats every 12 slots / 14 poles, so model 1/3 of the motor
   with anti-periodic/periodic boundaries.
2. Materials: NO20 BH curve, **N50UH at 80 °C (Br ≈ 1.29 T, μr 1.05)**, copper, air.
3. Check, at the continuous current (84 A rms → peak in phase A, half in B and C), stepping the rotor 0.5° over one
   pole pair:
   * open-circuit airgap fundamental Bg1 ≈ 1.31 T (R10 §5.1);
   * tooth and yoke peak flux ≤ 1.8 T at continuous current; torque linear to ≈ 130 A, then bending (T_sat ≈ 29.8 N·m,
     31.5 N·m at 150 A);
   * Kt within ±10 % of 0.224 N·m/A rms;
   * **demagnetisation:** at 204 A and 120 °C magnet temperature, no magnet region below the N50UH knee (R10 §7.1);
   * cogging peak-to-peak < 1 % of the continuous torque (0.19 N·m).
4. **Teeth.** N50UH raises Bg from 0.97 to 1.06 T, so the teeth widen to stay at 1.6 T: ≈ 5.4 → 5.9 mm (scaled by Bg)
   [E]; slot area falls 59.2 → 52.2 mm² (R10 §3.2.4).
5. **Yoke.** The calculated yoke (2.1 mm) is magnetically sufficient but fragile. **Use 3.0 mm** (stator OD unchanged,
   slot depth −0.9 mm, about −6 % slot area). Confirm the flux densities and Km again.

### 3.2 Laminations
1. Export the lamination DXF from the FEMM geometry: 36 teeth, 1.2 mm deep shoes, 2.0 mm slot openings, 3 mm yoke,
   OD 130.00, 2 key notches on the OD, 2 bond notches.
2. Order a **prototype stack** from a lamination service: 0.20 mm NO20 with C-5 coating, **stack height 50.0 mm**
   (≈ 238–250 laminations depending on the stacking factor; specify the height, not the count), burr ≤ 0.02 mm,
   stacking factor ≥ 0.95.
3. If you receive loose laminations, bond them yourself: clean; stack on a hardened mandrel with key bars; press 1 MPa
   and wick Loctite 290 (or use self-bonding Backlack laminations); cure; check squareness ≤ 0.05 mm and that a slot gauge
   passes every slot.
4. Deburr the slot edges with a fibre brush. Check interlaminar insulation (> 1 kΩ across the stack, megger at 50 V).

### 3.3 Slot insulation
1. Cut **Nomex 410, 0.13 mm** liners to the slot perimeter plus 2 mm; crease and insert one per slot, folded over at the
   tooth tips.
2. Fit end-lamination insulators (printed PA12-CF or Nomex) on both faces.

### 3.4 Winding (the copper coil)
36 slots / 42 poles, coil k around tooth k ('+' clockwise seen from the lead end; table from
[generated/km_scratch_designs.md](generated/km_scratch_designs.md)):

```
T01:+A T02:+B T03:-B T04:-C T05:+C T06:+A T07:-A T08:-B T09:+B T10:+C T11:-C T12:-A   (repeats ×3)
```

* **Conductor (KM-130x50-LC):** 3 turns × 2 parallel paths of **3.65 mm²** per turn: **10 strands of Ø0.67 mm grade-2
  enamelled copper, Class H (200 °C)** in hand (10 × 0.353 = 3.53 mm²). Check: 2 half-coils × 3 turns × 3.65 mm² =
  21.9 mm² copper in a 52.2 mm² slot = fill 0.42 [E], the model's value. Ten strands are stiff: wind with a tensioner
  and dress each turn with the nylon wedge.
* **Method (needle winding by hand):** mount the stator on a rotary indexing jig (10° detents); anchor the bundle at the
  lead end; wind 3 turns per tooth in the table direction, flat and tight against the liner; keep each coil in its half
  of the slot (double layer); lace with Kevlar at both faces; label every lead (A1s, A1f…).
* **Connection:** 12 coils per phase in **2 parallel paths of 6 coils in series** (alternating teeth of that phase in
  the sequence). A "−" coil connects finish-to-finish with its neighbour. Star point crimped and soldered, Class H sleeve.
* **Leads:** 3 phase leads, **8 AWG (or 2 × 12 AWG) 200 °C silicone** for 150 A peak / 84 A continuous; 2 NTCs
  (EPCOS B57861S) against the end turns at the hot spot near the lead exit.
* **Check before varnishing:** phase resistances equal within ±2 % (model **14.5 mΩ line-to-line at 20 °C** =
  20.26 / (1 + 0.00393 × 100) [E]; use a 4-wire meter, leads matter at this level); insulation > 100 MΩ at 500 V;
  phase inductances equal within ±3 %.

### 3.5 Impregnation
Pre-heat to 80 °C, vacuum-dip in **Class H polyester-imide or epoxy varnish**, drain, bake per the varnish schedule
(typically 2 h at 150 °C). Re-test insulation.

### 3.6 Rotor
1. **Back-iron ring:** 1018 steel, OD 89.6 mm (magnets add 2 × 3.0 for a 95.6 mm rotor OD), radial 3.6 mm, ground
   concentric ≤ 0.01 mm, pressed or bonded on the 7075 hub with its two bearing seats. **Ring length 50 mm.**
2. **Magnets:** 42 arcs **N50UH**, 3.0 mm thick, 7.29° at Ø95.6, **50 mm long, or 4 × 12.5 mm segmented axially**
   (lower eddy loss, easier to source); NiCuNi, radially magnetised, 10 % spares. Gaussmeter every magnet, mark the N face.
3. **Bonding fixture:** non-magnetic indexing ring with 42 pockets, alternating polarity; high-temperature structural
   epoxy (Loctite 9492 / 3M 2216 class); one magnet at a time, slid in from the side with a non-magnetic pusher.
   **Never put fingers between a magnet and steel.**
4. **Sleeve:** wet-wind carbon tow 0.3 mm over the magnets, cure, grind to the final OD (airgap 0.60 mm).
5. **Balance:** static on knife edges, then dynamic at 1,000 rpm, to G2.5.

### 3.7 Assembly (rotor into stator): magnet safety
The radial pull of a 42-pole rotor entering a stator is several hundred newtons and acts suddenly; the N50UH, 50 mm rotor
pulls harder than K1's.
1. Mount the jacketed stator in its housing vertically on the press table.
2. Fit a **Ø20 mm hardened guide rod** through the housing bearing seat and the rotor hub bore; a printed PTFE sleeve on
   the rotor keeps it concentric.
3. Lower the rotor with the press quill (never by hand) until the bearings seat.
4. Remove the sleeve, fit the second bearing and the wave spring, rotate by hand: smooth, faint cogging only.

### 3.8 Bearings and encoder
Rotor bearings (68xx thin-section) j5/H6, wave spring 30–60 N. Motor encoder: **AksIM-2 ring** on the hub (the hollow
rotor rules out a shaft-end MT6835).

### 3.9 Liquid jacket (baseline on KM-130x50-LC)

Placement in the thigh and hip: docs/03 §3.1–§3.2; the loop it connects to: docs/03 §9.

| Item | Specification |
|---|---|
| Sleeve | 6061-T6, ID 130 mm minus 0.06–0.08 mm interference, 2 mm web under the channel, length = stack + end turns (≈ 66 mm) |
| Channel | **two-start helix, each start 6 mm wide × 3 mm deep, lead 18 mm** (a channel every 9 mm); each start runs ≈ 3 turns (≈ 1.3 m) over the active length; plenum grooves at both ends join the starts to the ports |
| Seal | 2 EPDM O-rings at each end on the sleeve OD (3.53 mm section, AS568 -2xx size for the ≈ Ø140 bore); leak-check port between each pair |
| Housing | 7075 bore H7 over the sleeve OD; housing wall 2.5 mm at the jacket → OD ≈ 145 mm [E] |
| Ports | 1/8 BSPP (or M8 × 1) with barbed fittings, **inlet at the bottom, outlet at the top** when standing (air purges upward) |
| Potting | after the shrink fit, pot the end turns into the sleeve with thermally conductive epoxy (≥ 1.5 W/m·K) so end-turn heat also reaches the coolant |
| Mass | ≈ +0.15 kg net per actuator over the finned K1 housing (R10 §4 rule 6) |

**Making it:**
1. Turn the sleeve blank; bore to the shrink diameter.
2. Cut the channel on a CNC lathe as a **2-start "thread" with an 18 mm lead using a 6 mm grooving insert**, in several
   depth passes to 3.0 mm. Cut the end plenums and O-ring grooves. Deburr; anodise the wetted faces.
3. Heat the sleeve to 150 °C (Al expansion 23.6×10⁻⁶ × 130 mm × 125 K = 0.38 mm, ample clearance) and drop it over the
   impregnated stator on a locating mandrel. Do not exceed the varnish's temperature class.
4. Pot the end turns. Fit O-rings (EPDM only, lubricated with a glycol-compatible silicone grease) and press into the
   housing.
5. **Leak test:** 2 bar air, under water, 10 min, no bubbles; then 2 bar pressure decay ≤ 5 mbar in 10 min (R10 §5.1).

**First-article thermal test (gate before building four).** Build the first jacket on a spare stack with a dummy winding
(or on a K1 KM-130x45 stator, R10 §7.2). Feed 0.5 L/min of 40 % glycol at 25 °C, inject a known copper loss (DC
through two phases in series), log winding (NTC + resistance rise) and coolant in/out to steady state.
R_th = (T_winding − T_coolant,mean) / P. **Pass: ≤ 0.30 K/W.** Above that, F_cool falls below 2.0 and the continuous
rating scales with √F_cool (R10 §7.2); re-run `calc/run_all.py` with the measured value.

**Fallback (R10 §5.1 variants):** air-only (no jacket) gives 0.64 × the jacketed continuous torque; the leg margins
still close at ≈ 1.13 (knee) (docs/03 §9.6).

### 3.10 Motor acceptance tests (before building it into an actuator)

| Test | Equipment | Pass (KM-130x50-LC model) |
|---|---|---|
| Phase resistance (4-wire) at 20 °C | milliohm meter | **14.5 mΩ L-L ±10 %**, phases within ±2 % |
| Inductance | LCR meter, 1 kHz | phases within ±3 %; record Ld/Lq by rotor position |
| Hi-pot, winding → stack | 1,000 V AC (or 1,500 V DC) 60 s | no breakdown, leakage < 1 mA |
| Insulation resistance | 500 V DC | > 100 MΩ |
| Back-EMF constant | spin at 500 rpm with a second motor, scope L-L | **Ke L-L peak 0.183 V·s/rad ±7 %** (≈ 9.6 V peak at 500 rpm; 0.818 × Kt as in the generated sheets) [E], THD < 5 % |
| Torque constant | locked rotor on a lever + load cell, 10–80 A, then 2 s pulses to 150 A on the HC2 | **Kt 0.224 N·m/A rms ±8 %**; linear to ≈ 130 A; **31.5 N·m ±10 % at 150 A** [E] |
| Cogging | rotate slowly with a torque arm | < 0.19 N·m peak-to-peak |
| Jacket leak | 2 bar air | §3.9 |
| Thermal (in the jacket, 0.5 L/min, 25 °C coolant) | 84 A rms (18.85 N·m equivalent), steady state | winding ≤ 25 + 0.30 × 215 ≈ 90 °C → R_th ≤ 0.30 K/W [VT] |

If Kt, Km or R_th is more than 10 % off, update `calc/kestrel/actuators.py` and re-run `calc/run_all.py` before building
more.

### 3.11 Mk II variants: KM-115x32-N50 and the KM-85 family

Same method as §3.1–§3.10; the differences are below. Conductor sizes are [E]: slot area scaled by the Ø130 N50UH
reduction (52.2 / 59.2) at fill 0.42. Each one reproduces the model resistance within ≈ 1 % (e.g. KM-115x32-N50:
K1 4-turn 109.4 mΩ × 36/48 × 2.49/2.90 = 70.5 mΩ vs 70.2 mΩ).

| Item | KM-115x32-N50 | KM-85x26-N50-4t | KM-85x26-N50-3t | KM-85x17-N50-5t |
|---|---|---|---|---|
| Die | **new Ø115**, 36 slots / **40 poles** (kw1 0.945), airgap Ø84.5, gap 0.60 | Ø85 K1 die, 36/42 (kw1 0.933), airgap Ø59.5 | same | same |
| Teeth | ≈ 4.7 → 5.1 mm for N50UH [E]; 3.0 mm mechanical yoke check | per FEMM | | |
| Stack | 32 mm | 26 mm | 26 mm | 17 mm |
| Magnets | 40 arcs N50UH, 2.8 mm, 7.65° (0.85 of the 9° pole pitch) at rotor OD 83.9, 32 mm long | 42 arcs N50UH, 2.5 mm, 7.29°, 26 mm | same | 17 mm |
| Turns × paths (N_ph) | 3 × 1 (36) | 4 × 1 (48) | 3 × 1 (36) | 5 × 1 (60) |
| Conductor per turn | ≈ 2.9 mm² ≈ **8 × Ø0.67** | ≈ 1.43 mm² ≈ **4 × Ø0.67** | ≈ 1.9 mm² ≈ 7 × Ø0.59 | ≈ 1.15 mm² ≈ 3 × Ø0.70 |
| R_LL 20 °C (from 120 °C ÷ 1.393) | 50.4 mΩ | 104.9 mΩ | 59.0 mΩ | 123.0 mΩ |
| Ke L-L peak (0.818 × Kt) | 0.206 V·s/rad | 0.152 | 0.114 | 0.124 |
| No-load @ 52 V | 189 rad/s (1,805 rpm) | 257 rad/s (2,458 rpm) | 343 rad/s | 315 rad/s |
| Thermal acceptance (in its housing, derate 0.85) | 4.67 N·m ≈ 18.5 A rms → winding ≤ 120 °C | 1.71 N·m ≈ 9.2 A rms | 1.71 N·m ≈ 12.3 A rms | 1.11 N·m ≈ 7.3 A rms |
| Rotor ID (gear / cable bore) | 74.6 mm | 51.5 mm | 51.5 mm | 51.5 mm |

**36 slots / 40 poles coil table (KM-115x32-N50)** [E: balanced double-layer allocation from the slot-EMF star,
kd 0.960 × kp 0.985 = kw 0.945, matching the generated KM-115x32 sheet]. It repeats every 9 teeth, 4 times:

```
T01:+A T02:-A T03:-B T04:+B T05:-B T06:-C T07:+C T08:-C T09:-A   (T10–T18, T19–T27, T28–T36 repeat)
```

Each phase forms groups of three adjacent teeth with the middle coil reversed (e.g. T36 −A, T01 +A, T02 −A). Same sign
convention as §3.4. **Check phase sequence and back-EMF balance (three phases within ±2 %) on the first stator before
winding the rest.**

## 4. Making the transmissions

### 4.1 Planetary (KA family)
* **Recommended:** a gear shop machines to the docs/09 §5 table (hob/shape, carburise, grind, crown, tip relief). Mk II
  tooth plans are in docs/04 §5.2 and §7: KA-130K 17:1 (z16/z18/z52 × 4 planets, then z18/z18/z54 m1.25 × 18 mm),
  KA-130H 14:1 (z24/z18/z60 × 3, same stage 2), KA-110P 29:1 (6.0 × 4.83), KA-90P 28:1 (5.6 × 5.0).
* **Prototype path at home:** print the gears to check meshing and assembly inside the rotor; CNC-hob external gears in
  17-4PH on a 4th axis for low-load tests; wire-EDM the rings from pre-hardened 42CrMo4 (job shop). Heat treatment is
  always outsourced.
* Inspection: over-pin measurement for tooth thickness; backlash 0.03–0.06 mm at m1.25.

### 4.2 Machined two-disc cycloid C25 / C20 (KH-25, KH-20) — baseline in Mk II

| Item | **C25** (shoulder pitch, roll) | **C20** (shoulder yaw, elbow) |
|---|---|---|
| Ratio | 30:1 (31 ring pins, 30-lobe discs) | 30:1 |
| Ring-pin circle | Ø84 mm (R 42) | Ø68 mm (R 34) |
| Ring pins | Ø5 needle rollers (ISO 3096 G2) or Ø5 m6 dowels (60 HRC) in a 42CrMo4 ring | Ø4 |
| Eccentricity E | 0.9 mm (short-width coefficient K1 = E·31/R = 0.66; min epitrochoid curvature radius 4.9 mm vs pin radius 2.5) | 0.8 mm (K1 0.73; 3.7 vs 2.0 mm) |
| Discs | 2 at 180°, **8 mm** each, stack-cut as a matched pair | 2 at 180°, **6 mm** each in hardened 100Cr6 (**7 mm** if the nitrided 42CrMo4 route is used; see the screening below) |
| Disc material and process | **Route A (preferred, docs/09 §5.3): 100Cr6 hardened to 60–62 HRC, then wire EDM** (rough + 3 skims, bore and output holes in the same setup), lap the 2–5 µm recast layer. Route B: 42CrMo4 Q&T, wire EDM, gas nitride, and a pressed 100Cr6 sleeve in the bore as the needle raceway (a nitrided case is too soft for needles) | same |
| Profile | standard cycloid equations (below) with a 0.02 mm equidistant clearance | same |
| Output | **8 solid pins Ø8** (≥ 58 HRC) on PCD 52, supported at both ends (output disc + output ring); disc holes = 8 + 2E = **Ø9.80** | **6 solid pins Ø6** on PCD 40; holes Ø7.60 |
| Input | two 100Cr6 eccentric sleeves (Ø20 h5, 60–62 HRC) keyed 180° apart on a hollow input shaft (Ø12 bore); one needle cage Fw 20 / Ew 26 per disc running directly on the cam and the hardened disc bore (docs/09 §5.3) | sleeves Ø16, cages Fw 16 / Ew 22, shaft bore Ø10 |
| Ratings rated / repeated / avg / momentary | 80 / 160 / 100 / 250 N·m **[VT]** (`actuators.py` `CYC`, R10 §5.6) | 52 / 105 / 65 / 160 N·m **[VT]** |
| Mass (gear) | 0.57 kg | 0.43 kg |
| Expected backlash / efficiency | 1–7 arcmin; 0.85 assumed (UCLA machined cycloid: 7.0 arcmin, 82.3 % [V, R10 S9]) | same |

Profile equations (`cad/cycloid_profile.py`, outputs `cad/out/cycloid_KH-C25.dxf` and `cycloid_KH-C20.dxf`), with
pin-circle radius R, pin radius Rr, eccentricity E and N ring pins:

```
psi(t) = atan2( sin((1−N)t),  R/(E·N) − cos((1−N)t) )
x(t)   =  R·cos t − Rr·cos(t + psi) − E·cos(N·t)
y(t)   = −R·sin t + Rr·sin(t + psi) + E·sin(N·t)
```

The script checks E·N < R and Rr < 0.8 × the minimum curvature radius of the pin-centre epitrochoid (no undercut),
and removes 0.02 mm for running clearance. Verify meshing in CAD before cutting.

**Load screening [E]** (assumptions stated; a profile-resolved contact analysis replaces this before the discs are cut):

| Check | Formula / assumption | C25 at 160 / 250 N·m | C20 at 105 / 160 N·m |
|---|---|---|---|
| Torque per disc | T_d = 0.55 × T_out (2 discs, 1.1 load share) | 88 / 138 N·m | 58 / 88 N·m |
| Max ring-pin force | F_max ≈ 4·T_d / (K1·R·31) | 407 / 636 N | 301 / 458 N |
| Worst-case Hertz (max force at the minimum lobe curvature, ρ_lobe = ρ_epi,min − Rr) | p = √(F·E*/(π·L·ρ_eff)), E* 115 GPa; C25 ρ_eff = 1/(1/2.5 + 1/2.4) = 1.22 mm, L 8; C20 ρ_eff 0.92 mm | **1,240 / 1,550 MPa** | 6 mm: 1,415 / 1,750 MPa; **7 mm: 1,310 / 1,620 MPa** |
| Output-pin bending (solid pin, simply supported, two disc loads) | F_op ≈ 4·T_d/(n·R_op), M ≈ F·span/4 (spans 19 / 15 mm) | ≈ 160 / 250 MPa (Ø8, R 26) | ≈ 340 / 520 MPa (Ø6, R 20) |
| Eccentric bearing load per disc | ≥ T_d / (E·30) | ≥ 3.3 kN | ≥ 2.4 kN |

Reading, with typical repeated-contact allowables (confirm for the chosen steel): ≈ 1,500 MPa for through-hardened
100Cr6 (route A), ≈ 1,300 MPa for nitrided 42CrMo4 (route B). The C25 passes on either route even with the worst-case
geometry combination. The C20 at 6 mm passes on route A only (1,415 MPa); on route B use **7 mm discs** (+ ≈ 0.02 kg) or
show ρ_eff ≥ 1.1 mm at the most-loaded pin with a profile-resolved check. Momentary values are static loads that
hardened contacts carry. The pins are far below the yield of hardened dowels. The eccentric needle cages (C0 ≥ 8 kN on
the C25) cover the ≥ 3.3 kN bearing load.

**Assembly:** ring pins in, discs on the eccentric needle cages 180° apart, solid output pins through both discs, output
ring, crossed-roller output (THK RB5013 on C25, RB4010 on C20, docs/09 §5.3). Grease: RV-reducer grease (docs/09 §5.3)
or lithium-complex EP, NLGI 1–2. Set the drive's peak-current limit in non-volatile parameters so the gear never sees more
than its repeated rating (docs/09 §5.3: 21 A rms on KH-25, 18.8 A rms on KH-20, then trim on the dyno). Run in 2 h at 30 % load, both
directions, then change the grease.

**Tests (R10 §7.6), on the first unit of each size:** backlash (input locked, ±2 N·m at the output, dial at 100 mm);
torsional stiffness (torque–twist to the repeated rating, output encoder); efficiency vs speed at 25 / 50 / 100 % of
rated (replaces η 0.85); **static overload to the momentary rating** (250 / 160 N·m) with no measurable permanent
backlash change; 10⁵-cycle endurance at the repeated rating before ordering the other units.

### 4.3 Strain-wave (KH-14 only)
Bought Leaderdrive CSG-14-50 sets. Not recommended to make (§1).

### 4.4 KW-L2 wrist linear actuator (4 units)

What you make: the housing, push tube, end fittings and the driver board's enclosure. What you buy: the motor, the screw,
bearings and the driver electronics (docs/04 §9 for the requirement and the motor choice).

| Item | Specification |
|---|---|
| Motor | maxon **ECX FLAT 32 L** high-torque, 24 V winding (Option A), screw coupled directly: 98.5 mN·m nominal, 540 mN·m stall, 10,600 rpm no-load, 71 g [V, maxon product page cited in generated/bom.md B024] |
| Screw | Ø6 × 2 mm ground ball screw with flange nut **if** C_a ≥ 2 kN and C_0a ≥ 3 kN; else **Ø8 × 2** (same force per mN·m: 2.765 N) [E] |
| Fixed end | angular-contact pair, back-to-back, preloaded, in a 7075 bearing block bolted to the motor flange |
| Coupling | rigid clamp hub from the motor shaft to the screw journal (no flexible coupling: it adds compliance and length) |
| Anti-rotation | nut carried in a push tube with a flat running in a POM-lined slot (or a miniature rail where space allows) |
| Push tube / rod end | Ti tube, M5 PTFE-lined rod end to the wrist lever (r_p 22 mm, d 16 mm) |
| Stroke | ±30 mm working (22 sin 70° + 16 sin 35°) + 5 mm each end to elastomer stops [E] |
| Driver | per forearm, 2-axis: F28P65x + DRV8353-class gate driver + 6 MOSFETs per axis, **24 V rail**, Hall + encoder inputs, current sensing for force estimation |
| Sealing | forearm is IP65 zone: O-ring housing joints, PTFE wiper at the rod exit, ePTFE vent |

**Build steps:** machine the housing and bearing block → press and preload the bearing pair on the screw journal → fit
the clamp hub to the motor shaft → check screw run-out ≤ 0.02 mm at the nut → fit the nut and push tube, set the
anti-rotation flat → fit the rod end at mid-stroke → wire to the driver → home against the soft stops.

**Tests (R10 §7.7):** force–speed curve at 24 V: **≥ 754 N for 2 s** (generated combined-corner requirement, short-time stall), **≥ 272 N continuous for
10 min** with the winding ≤ 100 °C, **≥ 318 N for 60 s** (AO hold), **≥ 132 mm/s at 216 N**; backlash < 0.02 mm; 10⁵ cycles at ±25 mm and 300 N. If
the 32 L cannot make 754 N short-time, use Option B (ECX FLAT 22 L + 3.9:1) and accept a ≈ 0.94 speed margin, or
lengthen the levers with a longer stroke and re-run the wrist requirement.

## 5. Housings and structure
Everything in docs/09 §3 is CNC work you can do with a capable mill and lathe (7075, Ti with care). New in Mk II: the
jacket sleeve (§3.9), the KA-110P output hub for 12 × M5 on PCD 100 (docs/03 §5), the cycloid carrier rings and the
V-band limb flanges (docs/03 §13). Type III hard anodise is outsourced; Type II is possible at home but softer.

## 6. Bearings, magnets, cells, semiconductors, bought motors
Buy them (§1). Authorised distributors only for cells (counterfeits are common, R3), magnets (request N50UH grade
certificates with Br/Hcj at temperature) and maxon motors.

## 7. Building the joint drives yourself (cost-down option)
* **EV-class drives (≤ 60 A, 22 joints), TI TIDA-010979 pattern [R2]:** AM2612 or F28P650DK MCU (on-chip EtherCAT
  slave); 3 × DRV7167 100 V GaN half-bridges (60 A rms) or DRV8353RS + 6 × ISC022N10NM6; isolated current sensing;
  2 × BiSS-C; EtherCAT PHYs; Ø70 mm annular board with a 15 mm bore.
* **HC2 (150 A rms, knee and hip pitch):** buy an EPC9186HC-class power stage (150 A rms, ≤ 76 V, EPC2361 100 V GaN
  [R, R10 S26]) and add your controller, or lay out a 6-layer board with paralleled GaN (R10 §5.1). Chip-scale GaN:
  reflow and X-ray at a PCB assembler. Heat path: board bonded to the rear cap, which is thermally tied to the jacket.
  Test 150 A for 2 s and 99 A for 10 s into a locked rotor (R10 §7.3). **Firmware is the long pole.**
* **Firmware:** FOC (SVPWM 20–40 kHz; ≥ 40 kHz on HC2 for the 712 Hz electrical frequency), current/velocity/position
  loops, field weakening, CiA-402 over EtherCAT, encoder calibration, thermal model with magnet-temperature Kt
  correction, **phase-short on fault** (R10 §3.4), fault handling.
* **STO:** two independent hardware channels removing gate-driver supply/enable; cannot be overridden by firmware.
  Test the response time.
* **Effort:** 6–12 months for a robust EV-class drive; longer for HC2. Buy modules first; design your own as a later
  cost-down.

## 8. Cost and time comparison (per actuator class, rough)

| Item | Buy route | Scratch route | Notes |
|---|---|---|---|
| Ø85 frameless motor | A$450–1,300 (CubeMars/TQ) | A$180–350 (laminations, magnets, wire) + ≈ 15 h | K1 figures; N50UH arcs cost more than N42SH (re-cost in docs/12) |
| Ø115 frameless motor | RI115-PH: see BOM | new die + parts + ≈ 18 h | not re-costed for Mk II |
| KM-130 motor | n/a | K1 KM-130x45: A$1,050–1,100 + ≈ 25 h | the 50 mm N50UH version costs more in magnets and laminations; re-cost in docs/12 |
| Liquid jacket | n/a | 6061 bar + O-rings + ≈ 6 h lathe work | plus ≈ 3 h leak and thermal test for the first article |
| Strain-wave set (size 20/25) | A$450–640 (Leaderdrive) | cycloid A$250–400 (EDM + pins) + ≈ 10 h | K1 figures; Mk II adds nitriding and a second skim pass |
| Drive (EV class) | A$945–1,600 | A$150–250 parts + months of development | after the robot works |
| Encoder (motor side) | A$456 (AksIM-2) | A$18 (MT6835) | |
