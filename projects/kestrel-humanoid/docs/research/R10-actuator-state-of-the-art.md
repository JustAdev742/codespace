# R10 — Actuator state of the art and the KESTREL Mk II actuator upgrade (research notes)

Collected 2026-11-09 (all web sources accessed 2026-11-09). This note surveys high-performance robot actuators and
turns the survey into quantified, buildable upgrades for every K1 actuator class. It does not change the baseline
design; the numbers here are inputs for a Mk II sizing run of `calc/kestrel/actuators.py`.

**Evidence tags.** Every external number carries one tag and a source number from §10.

- **[V] verified:** read in the primary or manufacturer source this session, or already verified in R1/R2/R5.
- **[R] reported:** press, aggregator or search-snippet figure that was not traced to a primary source.
- **[E] estimate:** my own calculation or engineering judgement, with the arithmetic shown.

All Mk II performance numbers are [E]. They come from `calc/kestrel/motor_design.py` plus the actuator checks of
`calc/kestrel/actuators.py`, run against the simulated joint point clouds in `data/scenario_series.npz` and
`data/joint_requirements.json` (both dated 2026-11-08). That run reproduces the K1 family exactly, to the stated decimals,
before any change. The scripts were scratch-only, and no repository file was modified.

---

## 1. Summary

### 1.1 Top recommendation per class

Actuator-side values. Peak is the saturation-corrected motor torque at the drive's current limit × ratio × gear
efficiency. Continuous is thermal. ω₀ is no-load output speed at the minimum loaded bus. Masses are model estimates
(motor + gear + housing + electronics + jacket), on the same basis as K1.

| Class (joints) | K1 today | **Mk II recommendation** | Mk II peak / cont / ω₀ / mass | Build difficulty (1–5) |
|---|---|---|---|---|
| **KA-130K** knee | KM-130x45, 14:1, 99 A drive, ducted air: 376* / 139 N·m, 11.0 rad/s, 4.2 kg | **KA-130K2:** KM-130x50-LC (same Ø130 lamination die, 50 mm stack, N50UH, liquid jacket), 3 turns × 2 paths, 2-stage 16:1, 150 A GaN drive, 16S | **464 / 278 N·m, 13.3 rad/s, 4.9 kg** | 4 |
| **KA-130H** hip pitch | KM-130x40, 14:1: 366* / 123 N·m, 10.3 rad/s, 3.8 kg | **Same KA-130K2 actuator** (one design, 4 units). Voltage-line speed margin 1.04 → 1.36 | 464 / 278 N·m, 13.3 rad/s, 4.9 kg | 4 (shared) |
| "Strongest" knee/hip option | — | **KA-150X:** KM-150x50-LC, segmented stator (fill 0.55), N50UH, 17:1, **20S bus + 200 A drive** | **719 / 524 N·m, 15.3 rad/s, 6.7 kg** | 5 |
| **KA-110P** hip roll, waist pitch | TQ ILM85x26, 32:1: 276 / 73 N·m, 5.9 rad/s, 1.8 kg | **KA-115R:** KM-115x32 (existing model design, N50UH, 3 turns), 22:1, potted, air | 288 / 95 N·m, 8.6 rad/s, 2.9 kg | 3 |
| **KA-90P** hip yaw, waist yaw, ankles | CubeMars RI85-PH, 23:1: 106 / 36 N·m, 16.0 rad/s, 1.4 kg | **KA-90P2:** KM-85x26 (N50UH, 3 turns), 25:1 | 142 / 39 N·m, 13.7 rad/s, 1.7 kg | 3 |
| **KH-25** shoulder pitch/roll | ILM85x13 + CSG-25-50 (gear-limited to 127 N·m): 46 N·m cont, 7.1 rad/s, 1.4 kg | **KH-C25:** KM-85x26 (N50UH, 4 turns) + **machined two-disc cycloid 30:1** | 158 / 44 N·m, 8.6 rad/s, 1.8 kg | 4 |
| **KH-20** shoulder yaw, elbow | RI85-PH + CSG-20-50 (gear-limited to 73 N·m), 7.3 rad/s, 1.25 kg | **KH-C20:** KM-85x17 (N50UH, 5 turns) + cycloid 30:1 | 103 / 28 N·m, 10.5 rad/s, 1.4 kg | 4 |
| **KH-14** wrist yaw, neck | KM-50x20 + CSG-14-50 (gear-limited to 23 N·m) | **Keep.** Optional: N50UH + 16-turn rewind (+4 % speed), or CSG-17-50 (44 N·m repeated, +0.06 kg) | 23 (gear) / 10 N·m, 9.3 rad/s, 0.7 kg | 2 |
| **KW-L** wrist pitch/roll | maxon DCX 16 L (18 V winding) **on the 12 V hand rail** + GPX 16 3.9:1 + Ø6×2 ball screw | **KW-L2:** 40–170 W flat BLDC (ECX FLAT 32 L on the screw directly, or ECX FLAT 22 L + 3.9:1) driven from a 24–48 V rail by its own driver | ≥ 290 N continuous / ≥ 611 N peak per actuator; ≥ 132 mm/s (to verify on the maxon curves) | 3 |

\* K1 peak recomputed with motor_design's own saturation curve; the K1 docs quote 395 / 399 N·m (§2.2).

### 1.2 Findings that matter more than any single part

1. **Peak torque × speed is fixed by bus voltage × drive current, not by motor size.** Below saturation, at the drive's
   current limit:
   `T_peak,out × ω₀,out ≈ 0.75·(3/√6)·V·I·η = 0.9186·V·I·η`.
   - K1 (52 V, 99 A, η 0.92): 4.35 kW-equivalent.
   - 52 V, 150 A: 6.59 kW-equivalent.
   - 65 V, 200 A: 11.0 kW-equivalent.

   A bigger knee motor on the K1 99 A drive gives **less** peak at a useful speed: KM-130x50-LC at 16:1 on 99 A
   reaches only 327 N·m. **The drive is the first peak-torque upgrade. Liquid cooling is the first continuous-torque
   upgrade. Motor size comes third** [E].
2. **Liquid jacket alone fixes the tightest K1 number.** KM-130x45 with a jacket (F_cool = 2.4 from docs/13's
   0.6 → 0.25 K/W estimate) lifts the knee's continuous margin from 1.04 to **1.60**, with no other change [E].
3. **K1 peak is about 5–8 % optimistic.** `actuators.py` takes `min(T_pk, Kt·I_drive)`, which is linear up to the drive
   limit. motor_design's own curve bends above 2.6× continuous, with a 0.45 slope. At 99 A:
   - knee: 30.7 → 29.2 N·m at the motor, so 395 → **376 N·m**;
   - hip: 32.7 → 28.4 N·m, so 399 → **366 N·m**, a peak margin of 1.09 rather than 1.19.

   Still feasible [E].
4. **Speed margins are quoted at no-load.** The check that sizing actually enforces is the minimum over all simulated
   samples of ω_lim(T)/ω. On that basis the margins are **knee 1.10 and hip pitch 1.04**, not 1.37 and 1.06 [E].
5. **The KW-L wrist actuator is the weakest actuator in the robot** [E from V data]. docs/05 drives it from the 12 V hand
   controller, but the DCX 16 L is an 18 V winding. At 12 V it gives:
   - no-load 6,390 × 12/18 = 4,260 rpm, so 36 mm/s at the screw against **132 mm/s required**;
   - stall force ≈ 241 N against **611 N** at the combined pitch+roll corner;
   - maximum mechanical power ≈ 2.8 W against ≈ 25 W needed at the speed corner.
6. **Scratch KM-85 motors match the commercial kits on Km, not on continuous torque.** At the model's 7 A/mm² they give:

   | Scratch motor | Model continuous | Datasheet it replaces |
   |---|---|---|
   | KM-85x26 | 1.96 N·m | ILM85x26: 2.9 N·m |
   | KM-85x17 | 1.28 N·m | RI85-PH: 2.0 N·m |
   | KM-85x12 | 0.91 N·m | ILM85x13: 1.44 N·m |

   Substituting them as docs/13 §2 proposes would break the hip-roll continuous margin (0.75) and the shoulder hold
   margin (0.80) unless the bench proves a higher rating [E]. The same applies to docs/13's KH-C25: the ILM85x13 at
   30:1 cycloid gives a shoulder-hold margin of only 0.86 [E].
7. **Higher Mk II peaks load the structure.** KA-130K2 at the knee is 464 × G = 390–677 N·m, against the K1 momentary
   requirement of 427. Re-run `structure.py` (four-bar rod, thigh, flange slip) or firmware-limit [E].

---

## 2. What the K1 model can and cannot represent

### 2.1 `motor_design.py`: lumped magnetic circuit + winding, calibrated with K_R_CAL = 1.30

| Represented (and how) | Not represented / limitation | Consequence for this study |
|---|---|---|
| Airgap field: `Bg = Br(80 °C)·h_m/(h_m + μr·g·kc)`. Magnets at 80 °C, −0.12 %/K | No demagnetisation (Hcj) check at peak current and temperature. No rotor or magnet thermal model | Magnet grade enters only through Br. The N50UH Hcj margin [V, S21] is a qualitative benefit, to be checked in FEMM |
| Teeth and yoke sized to B_tooth/B_yoke (1.6/1.4 T) | No B–H curve: saturation is a fixed rule (torque linear to 2.6× the 7 A/mm² rating, then 0.45 slope) | Cobalt-iron (Hiperco 50, Bsat 2.4 T [V, S23]) enters only as higher B_tooth/B_yoke. Its saturation and loss benefit is not modelled |
| Slot area and copper fill via k_fill | **Saturation knee is tied to J = 7 A/mm² at the actual fill.** Raising J_cont (liquid cooling) or k_fill also raises T_sat, which is non-physical | I hold T_sat at the ampere-turns of the k_fill = 0.42 / 7 A/mm² design. Continuous torque is computed separately as Km·√P_allow |
| Resistance with end turns, ×K_R_CAL = 1.30 (calibrated on two Ø115 × ~25 mm motors, Km ±5 %) | One factor lumps end-turn length, AC/proximity loss, real fill and leads. Extrapolating to Ø150 / 50 mm stacks or rectangular wire is unvalidated | Kept at 1.30 for all designs, which is conservative for long stacks and possibly optimistic for rectangular wire at high frequency |
| Continuous = fixed J_cont = 7 A/mm² ("conduction-cooled housing") | **No thermal network or time constant.** Cooling only enters as J. `HOLD_FACTOR` 1.5 is the only transient rating | Cooling is represented as an allowable copper loss: P_allow = P_cu(7 A/mm², K1 construction, same envelope) × F_cool, with F_cool = 2.4 for a jacket (docs/13's 0.6 → 0.25 K/W) |
| Masses (×1.08) and rotor inertia (×1.25) | **No iron loss** (NO20 vs 0.35 mm, frequency), no cogging, no Halbach, no axial-flux topology | Iron loss estimated separately from the Tata NO20 datasheet (§3.2.5). Halbach and axial flux are handled qualitatively |

### 2.2 `actuators.py`: sizing checks

| Represented | Not represented / limitation |
|---|---|
| Voltage line `ω(T) = 0.75·(V/√6 − R_ph·T/Kt)·3/Kt` at 52 V. k_L = 0.75 calibrated on TQ ILM115x25 | No inductance-dependent field weakening (extra margin), and no dependence of k_L on pole count or frequency. 42-pole motors at ~500 Hz may differ, so measure on the dyno |
| Peak = `min(T_pk, Kt·I_drive)` | Linear up to the drive limit, which ignores motor_design's saturation curve (finding 3). **Mk II fix:** feed `T_pk` as the saturation-corrected torque at the drive's peak current (§8) |
| Thermal: `T_cont × derate` (0.85 default, 1.0 ducted) vs the walking-RMS corner. Hold vs 1.5× | No duty-cycle or thermal-capacity simulation, so the time a peak can be held is unknown |
| Strain-wave ratings (repeated/momentary/average, max input speed) | No rating model for planetary or cycloidal gears. Planetary gear mass is `0.0063·T^0.85` with T = the momentary **requirement**, not the delivered capability. For Mk II I size gears at 1.1 × delivered peak |
| Supplementary corners (50 % torque at the speed requirement) | Linkage effects only through the knee G(θ) and the ankle/wrist lever formulas |

---

## 3. Survey

### 3.1 Humanoid and legged-robot actuators

Torque density uses the actuator mass the source gives. Torque per volume is computed only where the source gives an
envelope (π/4·D²·L) [E].

| Actuator (robot) | Type | Peak | Continuous / rated | Mass | **Peak N·m/kg** | Cont. N·m/kg | Peak N·m/L | Tag / source |
|---|---|---|---|---|---|---|---|---|
| Unitree M107 (H1 knee) | internal-rotor PMSM + reducer | 360 N·m | not published | 1.9 kg | **189** (vendor claim) | — | — | 360 N·m, 189 N·m/kg [V, S1]; 1.9 kg [R, S2] |
| Unitree H1 joints | planetary [V, S6 table] | knee 360, hip 220, ankle 59 (H1-2: 75 ×2), arm 75 (H1-2 page: 120) | — | — | — | — | — | [V, S1]; URDF knee 300 N·m / 14 rad/s per R7 |
| Unitree G1 | internal-rotor PMSM, crossed-roller output, dual encoder | knee 90 (EDU 120) | — | — | — | — | — | [R, S3] |
| Tesla Optimus (AI Day 2022), 28 actuators in 6 designs | rotary: frameless + strain-wave; linear: frameless + planetary roller screw | rotary 20 / 110 / 180 N·m; linear 500 / 3,900 / 8,000 N | — | not found | — | — | — | [R, S11]. Masses circulating online could not be traced to a source and are **not used** |
| Figure 02 | custom | "up to 150 N·m" (joint unspecified) | — | — | — | — | — | [R, S12] |
| Atlas (electric, production) | custom; Hyundai Mobis supplies production actuators; 31 body actuators per unit | not published | — | — | — | — | — | [R, S13] |
| Apptronik Apollo | own linear + rotary actuators, 13+ generations; knee and elbow linear | not published | — | — | — | — | — | [R, S14] |
| Agility Digit / Cassie | cycloidal + harmonic; leg linkages | hip 200 / knee 230 (Digit); 195 / 195 (Cassie) | — | — | — | — | — | [V, S6 Table 1] |
| MIT Humanoid U12 (hip, knee via 2:1 belt) | Mini-Cheetah-derived QDD, 6:1 planetary | 68 N·m (knee 136 after the belt) | — | 1.174 kg | 57.9 | — | 137 (Ø120×44) | [V, S4] |
| MIT Humanoid U10 | same, smaller | 33.6 N·m | — | 0.619 kg | 54.3 | — | 116 (Ø101×36) | [V, S4] |
| MIT Mini Cheetah | QDD 6:1 planetary | 17 N·m | 6.9 N·m | 0.48 kg | 35.4 | 14.4 | 59 (Ø96×40) | [R, S5] |
| Berkeley Humanoid 10413 | QDD 9:1, hollow | 81.1 N·m | 34.2 (sustained) | 1.011 kg | 80.2 | 33.8 | 137 (Ø123×50) | [V, S6] |
| Berkeley Humanoid 8518 | QDD 9:1 | 62.6 N·m | 26.1 | 0.856 kg | 73.1 | 30.5 | 134 | [V, S6] |
| Berkeley Humanoid Lite 6512 | printed (PLA) cycloid | — | — | — | — | — | — | ≈ 90 % gear efficiency, 319 N·m/rad stiffness [V, S7] |
| Stanford Doggo | T-Motor MN5212 + 3:1 belt | 4.8 N·m | 1.51 | 0.27 kg | 17.8 | 5.6 | — | [V, S8] |
| UCLA C-QDD | machined (wire-EDM 4140) cycloid 10:1 | 89.9 N·m (driver-limited; 120 expected) | 37.5 | 1.40 kg | 64.2 | 26.8 | — | 82.3 % peak efficiency, 7.0 arcmin backlash, 1.99 N·m static back-drive [V, S9] |
| Gregg lab knee orthosis | Hiperco-50 stator, 7:1 planetary inside the stator, potted windings | ≥ 23.9 N·m | 12.78 | 1.15 kg | 20.8 | 11.1 | — | [V, S10] |
| Zhejiang Lab axial-flux biped actuator | axial-flux motor (12.5 N·m) + 2-stage ~16:1 planetary, fan-cooled | 206 N·m | — | 2.0 kg | 103 | — | — | motor/ratio [V, S16 abstract]; 206 N·m / 2 kg / 120 rpm [R, S17] |
| MyActuator X12-320 | integrated, 20:1 | 320 N·m | 85 rated @100 rpm | 2.37 kg | 135 | 35.9 | — | [V, R1] |
| MyActuator X15-450 (72 V) | integrated | 450 N·m | 145 rated | 3.50 kg | 129 | 41.4 | — | [V, R1] |
| RobStride RS04 | integrated 9:1 | 120 N·m | 40 (345 mm plate) | 1.42 kg | 84.5 | 28.2 | 253 (Ø120×42) | [V, R1] |
| EngineAI PM01 | internal-rotor PMSM | 164 N·m max | — | — | 145 (claim) | — | — | per R7 |
| **K1 KA-130K** (model) | Ø130 frameless + 14:1 planetary, incl. drive | 376 N·m | 139 | 4.19 kg | 90 | 33 | 226 (Ø142×~105 [E]) | [E] |
| **Mk II KA-130K2** | §5.1 | 464 N·m | 278 | 4.90 kg | 95 | **57** | 264 | [E] |
| **Mk II KA-150X** | §5.3 | 719 N·m | 524 | 6.69 kg | 108 | **78** | 296 | [E] |

Observations:

- **Peak torque density varies 5×** (18 to 189 N·m/kg) because vendors pick the mass boundary (motor+gear vs. with
  drive, housing, sensors) and the peak duration themselves. Continuous ratings are rarely published. One aggregator puts
  air-cooled continuous at 25–30 % of peak [R, S20].
- The highest published densities (Unitree M107 189, MyActuator X12-320 135, EngineAI 145 N·m/kg) are all **peak**
  ratings. X12-320's published stall table is 300 N·m for 3 s, 250 N·m for 7 s and 150 N·m for 10 s [V, R1]. K1 was
  sized for a high continuous knee torque (113 N·m RMS walking/stairs × 1.2), so its peak density is lower.
- **Continuous density is where Mk II can lead**: 57–78 N·m/kg against ≈ 34–41 for the best published rated figures
  (Berkeley 10413, X15-450) [E].

### 3.2 Motor technology

#### 3.2.1 Winding: pole count, fill factor, conductor

- **High pole-count concentrated windings.** K1's 36-slot / 42-pole (kw1 0.933, LCM 252) is already in the right
  class. Higher pole counts shorten end turns and thin the yoke, at the cost of electrical frequency and iron loss
  (42 poles at 2,000 rpm = 700 Hz) [E].
- **Fill factor.** K1 assumes 0.42 for needle-wound round wire.
  - Segmented-stator tooth windings reach **up to 75 %**, and "maximum slot occupation" coils **80 %** [V, S25].
  - **Hairpins do not apply to concentrated tooth windings.** The tooth-coil equivalent is a layer-wound
    rectangular/edgewise coil on a separate tooth segment [V, S25].
  - Segment joints add parasitic gaps, which raise cogging [V, S25].
  - For a home builder, **0.55 is a realistic target** with bobbin- or layer-wound rectangular magnet wire on wire-EDM
    tooth segments [E].
- **Model effect.** At fixed copper loss, Km ∝ √k_fill, so 0.42 → 0.55 gives **+14 % continuous torque**
  (√(0.55/0.42) = 1.144) [E]. The saturation-limited peak also rises, because more copper is available at J_peak.

#### 3.2.2 Potting and cooling: achievable continuous current density

Typical values by cooling method, from Gai, Newcastle PhD thesis 2020, Table 2-1 [V, S18], citing the IEEE TIE 2019
review:

| Cooling method | Shear stress σ (kPa) | Linear current density (kA/m) | **J (A/mm²)** | h (W/m²K) |
|---|---|---|---|---|
| Natural convection | — | — | **1.5–5** | 5–30 |
| Forced air | < 15 | < 80 | **5–10** | 20–300 |
| Indirect liquid (housing jacket) | 20–60 | 90–130 | **7–20** | 100–10,000 |
| Direct liquid | 60–100 | 100–200 | **10–30** | 200–25,000 |

Other data points:

- **Potting.** Vacuum-potting a robot actuator stator with 3.2 W/m·K silicone (vs 0.3 W/m·K for the nylon it
  replaced) lowered stator temperature by ≈ 15 % at 10.5 W and ≈ 38 % at 20 W [V, S10].
- **Liquid cooling of a small motor.**
  - A Maxon EC-max 40 in a liquid-cooled housing raised its continuous current limit **3.59×** [V, S19].
  - The pump, radiator and reservoir (PC-cooling parts) weighed **≈ 1 kg** [V, S19].
  - The 3.59× gain is for a small motor with poor baseline cooling and does not transfer to K1 [E].
- An aggregator puts the sustainable share of peak at 15–20 % sealed, 25–35 % forced air, 50–60 % liquid channels and
  60–70 % oil immersion. Optimus joint liquid loops are reported but unconfirmed [R, S20].
- Evaporative cooling at JSK roughly doubled usable output [R, S20].
- Thermal-aware RL on a Unitree A1 extended run time before overheat shutdown from ≈ 7 to > 27 min [V, S33]. Thermal
  limits are an operational constraint, not only a sizing one.

**For K1/Mk II [E]:**

- The K1 knee at 7 A/mm² with ducted air sits mid-range for forced air.
- A potted stator in a liquid jacket sits mid-range for "indirect liquid". At **J ≈ 7 × √2.4 ≈ 10.8 A/mm² equivalent**
  it matches the docs/13 thermal-resistance estimate (0.6 → 0.25 K/W).
- In-slot direct cooling (10–30 A/mm²) is possible in principle. It is not recommended for a home build: leak paths
  inside the winding, and dielectric coolant handling.

#### 3.2.3 Halbach rotors

- BIT's Halbach integral-ring robot motor cut **rotor mass by 30 %** at the same torque [V, S24].
- An EHA motor study reports a higher fundamental airgap field, without a percentage [R, S24 search].
- motor_design.py cannot represent a Halbach rotor.

**Assessment [E]:**

- Expect roughly +5–15 % Bg1 and a lighter, lower-inertia rotor, because no back iron is needed.
- Cost: 84–168 segments per rotor, each repelling its neighbours during bonding.
- **Defer to Mk III.** Use FEMM first, and buy a pre-assembled Halbach ring if a supplier will make one.

#### 3.2.4 Magnet grades

DMEGC sintered NdFeB table [V, S21]:

| Grade | Br (T) | Hcj min (kOe) | Max working temperature |
|---|---|---|---|
| N42SH (K1) | 1.29–1.33 | 20 | 150 °C |
| N52SH | 1.42–1.47 | 20 | 150 °C |
| N50UH | 1.39–1.44 | 25 | 180 °C |
| N52UH | 1.42–1.47 | 25 | 180 °C |

Temperature coefficient of Br is −0.12 %/K for all of these grades.

- **Recommendation: N50UH** (Br at least 8.6 % above the model's N42SH value of 1.28; more Hcj margin for 4× rated
  current with jacket-cooled stators). N52UH is better again if a supplier offers it as custom arcs.
- **Model effect.** Bg rises 0.973 → 1.057 T and Kt rises 8.6 % at the same turns. Teeth widen to stay at 1.6 T, so
  slot area falls 59.2 → 52.2 mm² at Ø130. Net Km of KM-130x50 (3 × 2): **1.286 with N50UH vs 1.266 with N42SH, only
  +1.6 %** [E]. In this model the grade upgrade buys temperature/Hcj margin and a higher Kt per turn, which matters for
  speed and the drive current. It buys little thermal torque. Keeping narrow teeth needs cobalt-iron (§3.2.5).
- Kt falls with magnet temperature: at 100 °C magnets the torque is 9.6 % below its 20 °C value (0.12 %/K × 80 K) [E].
  The drive must estimate magnet temperature (§3.4).

#### 3.2.5 Lamination steel

**NO20 (Tata/Surahammars NO20-1200H, 0.20 mm)** [V, S22]:

| Property | Value |
|---|---|
| Loss at 1.0 T / 400 Hz | 11.2 W/kg typical (max 12.0) |
| Loss at 1.5 T / 400 Hz | 28.0 W/kg |
| Loss at 1.0 T / 700 Hz | 24.9 W/kg |
| Polarisation J | 1.64 T at 5 kA/m; 1.76 T at 10 kA/m |
| Thermal conductivity | 21 W/m·K |
| Yield strength | 445 MPa |

- **Iron loss at maximum knee speed [E].** I interpolate log-log at 1.5 T (exponent 1.36 between 400 and 700 Hz) with
  ×1.5 build factor. Assuming 1.5 T everywhere makes this an upper bound.

  | Design | Electrical frequency | Iron loss at max speed |
  |---|---|---|
  | K1 knee (14:1) | 445 Hz | ≈ 60 W |
  | KA-130K2 (16:1) | 508 Hz | ≈ 85 W |
  | KA-150X (17:1) | 540 Hz | ≈ 123 W |

  These occur only during swing, but they belong in the thermal budget. **Keep 0.20 mm NO20; do not fall back to
  0.35 mm M270-35A for Mk II.**
- **Cobalt-iron (Hiperco 50).**
  - Saturation 2.4 T [V, S23]. Core-loss figures are behind a registration wall and were **not found**.
  - Used in a robot actuator stator at airgap Ø95.2 mm [V, S10].
  - Model effect (B_tooth 2.0 / B_yoke 1.8 T on KA-150X): slot area 70 → 95 mm², Km 1.935 → **2.275 (+18 %)**,
    continuous 33.5 → 39.4 N·m [E].
  - Costs: strip only; needs vacuum/H₂ anneal after cutting, done by a specialist; expensive; brittle when annealed.
  - **Optional for KA-150X only, after an NO20 prototype works.**

#### 3.2.6 Axial flux for robots

- The Zhejiang Lab biped actuator above (12.5 N·m motor, ~16:1, fan-cooled) is the closest humanoid-scale example
  [V/R, S16, S17].
- Harvard's axial-flux + 26:1 cycloid ankle actuator: ≈ 75 N·m/kg, 33 mm thick [R, S17].
- As of Oct 2026 the aggregator found **no major humanoid maker confirming axial-flux joints in production** [R, S17].
- **Assessment [E]:**
  - Torque scales ≈ D³ at fixed thickness, which suits pancake joints.
  - Drawbacks for a home build: a sub-mm airgap under kN-level axial magnetic pull, wide rotors (high J), stators that
    are hard to laminate (SMC or tape-wound), and no calibrated model in this repository.
  - **Not recommended for Mk II.**

#### 3.2.7 Bus voltage and inverters

| Bus | Min loaded (3.25 V/cell) | Max (4.2 V/cell) | Device class needed [E] |
|---|---|---|---|
| 16S (K1) | 52 V | 67.2 V | 100 V (K1 choice) |
| 20S | 65 V | 84 V | **120–150 V** for comfortable regen headroom. 100 V parts at 84 V + regen leave < 16 % |
| 24S | 78 V | 100.8 V | 150 V+, and much higher insulation/creepage burden |

- **GaN.** EPC9186HC2/HC3 boards: **150 A rms**, ≤ 76 V input, ≤ 120 kHz PWM, EPC2361 100 V 0.75 mΩ devices
  [R, S26 vendor press]. TI DRV7167 is a 100 V half-bridge, 60 A rms [V, R2]. TIDA-010979 is a 48 V / 1 kW joint
  drive [V, R2]. A **150 A rms GaN drive at 16S is demonstrated hardware**. 200 A at 20S needs paralleled 150 V-class
  devices (custom) [E].
- **Effect on Mk II [E].** For fixed output speed, the V × I product sets peak (§1.2):

  | Configuration | Peak at the knee actuator |
  |---|---|
  | 16S / 150 A (KA-130K2) | 464 N·m |
  | 20S / 150 A, same motor rewound 5 × 3 at 17:1 | 519 N·m |
  | 20S / 200 A (KA-150X) | 719 N·m |

  Continuous torque does not change with voltage (Km is winding-independent).

### 3.3 Transmissions

| Option | Key data | Tag / source |
|---|---|---|
| **Planetary (single stage)** | Internal (inside-stator) stage best at 5:1–7:1. Infeasible above 7:1 (T-motor U12 study). External single stage best at 7:1–11:1 | [V, S29] |
| Planetary efficiency / backlash (industrial) | > 97 % one stage, > 94 % two stages (premium); 95/92 % (economy). Backlash ≤ 7 arcmin (1-stage, 1 arcmin option), ≤ 9 arcmin (2-stage) | [R, S28] |
| QDD practice | 6:1 (MIT), 9:1 (Berkeley), 7.75–10:1 (RobStride, CubeMars), 20:1 (MyActuator) | [V, S4, S6, R1] |
| **Cycloidal, machined** | UCLA 10:1: wire-EDM 4140 discs to ±2 µm; 7.0 arcmin backlash; 82.3 % peak efficiency; output-pin limit 295 N·m; would need 6 planets as a planetary | [V, S9] |
| Cycloidal, printed | ≈ 90 % gear efficiency. Stiffness 319 N·m/rad (PLA) vs 1,468 N·m/rad (PA-CF, Roozing) | [V, S7] |
| Cycloidal, industrial | Spinea TwinSpin TS 085 i33: 75/150 N·m, 1.7 kg; TS 115: 173/346 N·m, 3.2 kg | [V, R1] |
| **Strain-wave CSG ratings** | Rated / repeated / momentary at 50:1: size 20: 33 / 73 / 127 N·m; size 25: 51 / 127 / 242 N·m. Size 25 = 0.42 kg | [V, R1, S27] |
| **Strain-wave torsional stiffness** (CSG/CSF, 50:1, K1 / K2 / K3 ×10⁴ N·m/rad) | Size 14: 0.34 / 0.47 / 0.57. Size 20: 1.3 / 1.8 / 2.3. Size 25: 2.5 / 3.4 / 4.4. Size 32: 5.4 / 7.8 / 9.8. At ≥ 80:1, size 25: 3.1 / 5.0 / 5.7. Minimum ≈ 80 % of listed | [V, S27 Tables 042-4, 043-1] |
| **Planetary roller screw** | Rollvis RV 12 L5: Ca 18.1 kN, C0a 27.3 kN, η 0.89 direct / 0.88 inverse (back-drivable). RV 15 L5: 28.9 / 51.5 kN | [V, R1, S30] |
| Roller-screw actuator efficiency (actuator level) | 75–80 % (Tolomatic). Fine-lead screws are hard to back-drive, so linear units carry a series force sensor. Roller screw ≈ 64 % of linear-actuator cost | [R, S31] |
| Belt drives | MIT Humanoid: belts at knee (6:1 module → 12:1 joint), ankle and elbow [V, S4]. Doggo: two 3:1 belts per leg module [V, S8] | |
| Dual-motor joints | Differential dual-motor joints that sum both motors' torque onto one DOF [R, S34]. Two-motor actuators with different ratios for two load regimes (MIT thesis) [V abstract, S34] | |

Assessment for K1 [E]:

- **Planetary stays the leg transmission.**
  - 2-stage 14–17:1 keeps reflected inertia moderate (0.24–0.67 kg·m²) and back-drivability good.
  - Ground, carburised 18CrNiMo7-6 to ISO 1328 grade 6 (docs/04) is right. Add **crowning and tip relief** in the
    grinding spec, because Mk II loads are 1.2–2× K1's.
- **Strain-wave caps the K1 arms.** KH-25 is firmware-limited to 127 N·m and KH-20 to 73 N·m, both by the gear's
  repeated-peak rating. Higher ratios are too slow at 52 V (CSG-25-80 → 4.3 rad/s against 6.2 required).
  - Torsional stiffness is modest. From Table 042-4 for CSG-25-50 (T1 14 / T2 48 N·m, θ2 15.7×10⁻⁴ rad,
    K3 4.4×10⁴ N·m/rad), the windup at the 67 N·m shoulder requirement is θ = 15.7×10⁻⁴ + (67 − 48)/4.4×10⁴ =
    2.0 mrad = **6.9 arcmin**, ≈ 1.2 mm at a 0.6 m reach. That is the same order as a precision cycloid's
    1–7 arcmin backlash.
  - The flexspline cannot be home-made (docs/13).
  - **A machined two-disc cycloid at 30:1 is the better Mk II arm gear:** higher peak, robust to impact, back-drivable,
    and buildable with wire EDM. Accept 1–7 arcmin backlash [V, S9; docs/13].
- **Roller screw** is the only way to reach Optimus-class force density. It costs reflected inertia and range of motion
  (§5.3.3).

### 3.4 Sensing and safety

| Item | State of the art / data | Mk II recommendation [E] |
|---|---|---|
| Output encoder | RLS AksIM-2, ≤ 20 bit, ±0.004–0.02° after self-calibration, BiSS-C [V, R2] | Keep on every actuator. Use its difference from the motor encoder for gear-windup torque estimation and backlash monitoring |
| Joint torque | Current-based estimation in QDDs (Berkeley: momentum observer, no strain gauges) [V, S6]. Learned torque estimation on a cycloid QDD [V, S9]. Strain-gauge flexures, FUTEK TFF400 [V, R2] | Legs: current + friction model (+ a learned residual). Arms (cycloid has more friction than planetary): keep the K1 KH strain-gauge flexure |
| Brakes | Spring-applied flat brakes 3.4–10.8 N·m in 12–15 mm thickness (KEB). Permanent-magnet 2.7–17 N·m (Kendrion). Holding power ≈ 40–50 W for 12 joints [R, S32] | Fit brakes only where gravity holds for long periods. **Shoulder pitch:** 3.4 N·m × 30 × 0.85 = 87 N·m ≥ 54 N·m hold. **Waist pitch:** 108/(22·0.92) = 5.3 N·m → 10.8 N·m size. Legs: none (see shorted-phase damping below) |
| Passive leg damping | Shorting the phases of a PM motor gives low-speed damping b ≈ Km² at the motor (T = Kt·I, P = 3I²R ⇒ T = Km²·ω) [E] | KA-130K2: 1.286² × 16² = **423 N·m·s/rad** at the joint below the speed where inductance dominates. A collapsing knee at 0.5 rad/s meets ≈ 210 N·m. Make "phase short on fault" the hardware default in the drive, alongside STO |
| Thermal sensing | Resistance-based estimation, case NTC + thermal model, ≈ 20 % Kt loss near the thermal limit [R, search] | 2 NTCs in the end turns + 1 on the jacket outlet. Online R estimate from FOC voltage. Model-based I²t derating; Kt compensated for magnet temperature (−0.12 %/K) |
| Current-limit strategy | Thermal-aware policies stop overheat shutdowns [V, S33] | Three tiers: (1) instantaneous limit at the drive peak (saturation-aware); (2) I²t with the measured thermal time constant; (3) send a temperature-headroom signal to the RL policy as an observation |

---

## 4. Design rules used for Mk II (derived from the K1 model) [E]

1. **Continuous torque** = Km·√P_allow.
   - P_allow = (copper loss of the K1-construction design in the same envelope at 7 A/mm²) × F_cool.
   - F_cool is 1.0 for potted + ducted air and **2.4** for a jacket (docs/13: 0.6 → 0.25 K/W).
   - F_cool is applied to the envelope, so better magnets or fill raise Km but not the heat-rejection capacity.
2. **Peak torque at the drive** = T_sat + 0.45·(Kt·I − T_sat) above T_sat. T_sat = 2.6× the 7 A/mm² torque of the
   k_fill 0.42 design (fixed ampere-turns). Current is capped at the 28 A/mm² current.
3. **Peak × speed product** = 0.9186·V·I·η (drive-limited). Pick V and I first, then ratio and winding for speed.
4. **Reflected inertia** = J_rotor·1.1·N². At fixed output torque it scales with J/T_pk² of the motor: Ø150 (4.6×10⁻⁷)
   beats Ø130 (9.1×10⁻⁷), which beats slim Ø85 (1.5×10⁻⁶ kg·m²/(N·m)²). Large-diameter motors give **low** reflected
   inertia per N·m.
5. **Gear mass** = 0.0063·(1.1·T_peak,out)^0.85. The gear is sized for what the motor can deliver; K1 sized it for the
   requirement.
6. Housing `0.25 + 4.0·(OD+0.012−0.05)` kg (K1 rule). Jacket +0.15–0.18 kg per actuator. Loop (pump, radiator, tubing)
   +0.35–0.5 kg per leg, shared by knee and hip pitch. A 150–200 A drive is +0.05–0.10 kg over K1's 0.20 kg.

---

## 5. Recommendations per class

Each design was checked against every simulated sample (repeated scenarios with ×1.2 torque and ×1.15 speed margins, plus
the supplementary corners), exactly as `actuators.evaluate()` does. The margins below:

- **Peak headroom** = 1/utilisation: how much more torque than the worst sample × 1.2 the actuator can make.
- **Cont / hold**: capability over the continuous corner, and 1.5× continuous over the hold corner.
- **Speed line**: minimum over samples of ω_lim(T)/ω, with the 1.15 speed margin already inside ω.

K1 reference values on the same basis:

| Class | Peak headroom | Cont | Hold | Speed line |
|---|---|---|---|---|
| Knee | 1.07 | 1.04 | 1.43 | 1.10 |
| Hip pitch | 1.09 | 1.35 | 3.64 | 1.04 |

### 5.1 KA-130K → **KA-130K2** (knee), shared with hip pitch

**What to change**

| Item | K1 | Mk II | Why |
|---|---|---|---|
| Motor | KM-130x45, N42SH, 5 turns × 2 paths | **KM-130x50-LC:** same Ø130 / 36s-42p lamination die, **stack 50 mm** (250 laminations of 0.20 mm NO20), **N50UH** 3.0 mm arcs, **3 turns × 2 paths** (N_ph 18), conductor 3.65 mm² ≈ 10 × Ø0.67 mm strands | +Km, +speed winding, die reuse |
| Cooling | potted, finned housing, ducted air | **potted stator (≥ 1.5 W/m·K epoxy) shrink-fitted into an Al jacket with a 6 × 3 mm helical channel, O-ring sealed. Water-glycol 0.3–0.5 L/min, one pump + radiator per leg (knee + hip pitch in series)** | continuous ×1.55 |
| Gear | 2-stage 14:1 (3.5 × 4.0), m0.8 / m1.25 | **2-stage 16:1 (4 × 4).** Stage 1: sun z18 / 3 planets z18 / ring z54, m0.8 (ring PCD 43 mm, inside the Ø85.5 rotor bore). Stage 2: z18/z18/z54, **m1.5, 14 mm face**, 4 planets. Carburised, ground, crowned | carries 1.1 × 464 N·m |
| Drive | 99 A rms (Elmo R70/100 class) | **150 A rms GaN** (EPC9186HC-class power stage + TIDA-010979 architecture) | the peak lever |
| Bus | 16S | 16S (20S variant below) | no change |
| Bearings | 68xx rotor pair, crossed-roller output | same. Re-rate the crossed roller for 1.1 × 464 N·m plus the four-bar rod load | |

**Expected performance (motor_design.py physics; arithmetic):**

```
Br(80 °C) = 1.39·(1 − 0.0012·60)                       = 1.290 T
Bg        = 1.290·3.0/(3.0 + 1.05·0.60·1.05)           = 1.057 T
Bg1       = (4/π)·1.057·sin(0.85·90°)                   = 1.308 T
Kt        = 1.5·√2·0.933·18·1.308·0.0962·0.050          = 0.2242 N·m/A rms
R_LL(120 °C) = 20.26 mΩ  ->  Km = 0.2242/√(3·0.01013)   = 1.286 N·m/√W   (K1: 1.186)
P_allow   = 90 W (K1 construction, Ø130×50, 7 A/mm²) × 2.4 = 215 W
T_cont    = 1.286·√215                                  = 18.85 N·m      (K1: 10.78)
T_sat     = 2.6·11.46                                   = 29.79 N·m
T(150 A)  = 29.79 + 0.45·(0.2242·150 − 29.79)           = 31.52 N·m      (T_pk at 204 A = 37.0)
Output peak = 31.52·16·0.92                             = 464 N·m        (K1: 376)
Output cont = 18.85·16·0.92                             = 278 N·m        (K1: 139)
ω0 motor  = 0.75·(52/√6)·3/0.2242                       = 213 rad/s (2,034 rpm) -> output 13.3 rad/s
J_ref     = 1.258e-3·1.1·16²                            = 0.354 kg·m²    (K1: 0.237)
Mass      = 2.62 motor + 1.26 gear + 0.62 housing + 0.25 drive + 0.15 jacket = 4.90 kg (K1: 4.22)
Stage-2 sun screening: 1.1·464/4/0.96 = 133 N·m; r_sun = 18·1.5/2 = 13.5 mm;
  F_t/mesh = 133/0.0135/4·1.15 (load sharing) = 2.83 kN; Lewis σ = 2,830/(14·1.5·0.31) = 435 MPa
  (K1 stage 2 at m1.25 had Lewis SF 2.7 at its momentary case; confirm by ISO 6336)
```

| Margin (all samples) | Knee | Hip pitch |
|---|---|---|
| Peak headroom | **1.32** (K1 1.07) | **1.38** (K1 1.09) |
| Continuous | **2.07** (K1 1.04) | 3.04 (K1 1.35) |
| Hold (60 s) | 2.85 | 8.17 |
| Speed line | **1.36** (K1 1.10) | **1.36** (K1 1.04) |

At the knee joint the four-bar (G = 0.84–1.46) turns this into:

- peak 390–677 N·m;
- continuous 278 × 0.84 = 234 N·m at the worst angle, against 113 N·m required.

**Variants [E]:**

| Variant | Peak / cont | ω₀ | Margins (knee) | J_ref | Mass | Note |
|---|---|---|---|---|---|---|
| 14:1, 5 × 3 winding (Kt 0.249), 16S/150 A | 428 / 243 N·m | 13.7 rad/s | headroom 1.22, cont 1.81, speed 1.39 | 0.271 | 4.81 kg | "transparency" option, J_ref only +14 % over K1 |
| **20S** (65 V), 5 × 3 winding, 17:1, 150 A | 519 / 295 N·m | 14.1 rad/s | headroom 1.48, speed 1.45 | — | 5.02 kg | needs 120–150 V drive devices |
| Air-only (no jacket), 16:1 | 464 / 179 N·m | — | cont 1.34 | — | 4.75 kg | fallback if the jacket leaks or is deferred |
| K1 motor + jacket only, 99 A | 376 / 215 N·m | — | cont 1.60 | — | — | **cheapest single fix** |

**Build difficulty: 4/5.** Same skills as K1 (needle winding, magnet bonding, sleeve, press assembly). New items:

- an O-ring-sealed shrink-fit jacket (lathe work + leak test at 2 bar);
- a closed coolant loop through the hip joint (rotary hose routing or a short flexible loop across the hip pitch);
- a 150 A drive. Buy an EPC9186HC-class stage, or lay out a 6-layer PCB with paralleled GaN. Firmware is the long pole.

**Risks:**

- jacket thermal resistance worse than 0.25 K/W (it is an estimate; dyno first);
- coolant leak onto drive electronics (keep electronics upstream and above the jacket; use dielectric-tolerant
  conformal coat);
- higher iron loss at 16:1 (≈ 85 W at maximum speed, §3.2.5);
- reflected inertia +49 % (impacts);
- k_L = 0.75 not validated for 42 poles at 500 Hz;
- structure loads up to 677 N·m at the knee (re-run `structure.py`).

### 5.2 KA-130H → shared **KA-130K2** (hip pitch)

**What to change.** Use the KA-130K2 actuator unchanged: one motor, one gearbox, one jacket, 4 units plus spares.

**Expected:** 464 / 278 N·m, 13.3 rad/s, 4.9 kg.

| Margin | K1 | Mk II |
|---|---|---|
| Peak headroom | 1.09 | **1.38** |
| Speed line | **1.04** | **1.36** |

The K1 hip's only weak point is speed (1.04), and the 16:1 + Kt 0.224 winding raises its voltage-line speed by ≈ 31 %.

**Optional:** a 40 mm stack (KM-130x40-LC) saves ≈ 0.3 kg per hip [E], at the cost of a second stator variant. Not
recommended, because commonality is worth more.

**Build difficulty: 4/5.** Mass sits at the pelvis, where it costs little.

**Risk:** +1.1 kg per hip actuator raises waist, hip-roll and knee loads. Re-run the full requirement loop (§7).

### 5.3 The strongest knee/hip candidate: **KA-150X**, and the linear alternative

#### 5.3.1 KA-150X specification

| Item | Specification |
|---|---|
| Motor | **KM-150x50-LC-SEG:** stator OD 150, stack 50 mm, 36s/42p, airgap Ø111 mm. **36 wire-EDM tooth segments** in 0.20 mm NO20, each with a layer-wound rectangular-wire bobbin coil (fill 0.55). 4 turns × 3 paths (N_ph 16, conductor 4.8 mm²). N50UH 3.0 mm arcs on a 1018 back-iron, carbon sleeve. Rotor OD/ID 110.4/99.7 mm |
| Cooling | potted segmented stator in a liquid jacket (F_cool 2.4) |
| Gear | 2-stage **17:1**. Stage 1: sun z16 / **4** planets z18 / ring z52 = 4.25:1; the assembly condition (16+52)/4 = 17 is met, while 3 planets would not be. Stage 2: z18/z18/z54 = 4:1, 4 planets, **m1.75, 16 mm face**. Carburised and ground |
| Drive / bus | **200 A rms**, 150 V-class devices, **20S** (65 V minimum loaded / 84 V maximum) |
| Output bearing | crossed roller one size up from K1 (housing OD 162 mm) |

**Arithmetic [E]:**

```
D_g = 0.74·150 = 111 mm;  Bg1 = 1.308 T (same magnets/gap)
Kt  = 1.9792·16·1.308·0.111·0.050       = 0.2300 N·m/A    R_LL = 9.42 mΩ -> Km = 1.935
P_allow = 125 W (envelope, 7 A/mm²)·2.4 = 300 W -> T_cont = 1.935·√300 = 33.5 N·m
T(200 A) = 0.230·200 = 46.0 N·m (just below T_sat 46.3; T_pk at 405 A = 67.4)
Peak out = 46.0·17·0.92 = 719 N·m;  Cont out = 33.5·17·0.92 = 524 N·m
ω0 = 0.75·(65/√6)·3/0.230 = 260 rad/s -> 15.3 rad/s at the output
J_ref = 2.10e-3·1.1·17² = 0.667 kg·m²
Mass = 3.68 motor + 1.83 gear + 0.70 housing + 0.30 drive + 0.18 jacket = 6.69 kg
Stage-2 sun check: 1.1·719/4/0.96 = 206 N·m; F_t/mesh = 206/0.01575/4·1.15 = 3.76 kN;
  Lewis σ = 3,760/(16·1.75·0.31) = 433 MPa: the same stress level as the KA-130K2 stage 2 below (435 MPa)
  and the K1 design philosophy. Lewis is only a screening number; a full ISO 6336 rating is required
  and may push this to m2.0 or an 18 mm face
```

| Margin (all samples) | Knee | Hip pitch |
|---|---|---|
| Peak headroom | **2.05** | 2.14 |
| Continuous | **3.90** | 5.74 |
| Speed line | **1.59** | 1.57 |

Variants:

| Variant | Peak / cont | Speed line | Mass |
|---|---|---|---|
| 16S / 200 A, 15:1 | 635 / 462 N·m | 1.44 | 6.50 kg |
| Hiperco 50 stator, 20S | 719 / **616** N·m (same peak, drive-limited) | — | 6.57 kg |

#### 5.3.2 Honest assessment of KA-150X [E]

- **Torque and mass.**
  - Peak density 108 N·m/kg, and continuous density **78 N·m/kg**, more than double K1's 33.
  - It weighs +2.5 kg per knee and +2.9 kg per hip over K1. Four units add ≈ 10.8 kg, plus ≈ 0.8 kg of coolant loops.
  - The knee actuator sits 0.16 m below the hip, so +2.5 kg there adds ≈ 0.064 kg·m² to the swing leg about the hip
    (2.5 × 0.16²).
  - The requirements will grow, but the margins (2.05 / 3.90) absorb a 10–15 % rise easily.
- **Thermal.**
  - 300 W copper loss at the continuous rating, plus up to ≈ 120 W of iron loss at maximum speed.
  - A two-actuator leg loop must reject up to ≈ 700–800 W at full continuous rating. Typical walking dissipation will be
    far lower (knee RMS 113 N·m is 22 % of capability).
  - At 0.4 L/min, the coolant rises ≈ 25–30 K at 750 W, so plan 0.6–0.8 L/min and a 120 mm-class radiator with a fan
    per leg.
- **Peak is mostly electrical.** Of the +255 N·m over KA-130K2, ≈ 72 % (+183 N·m) comes from 20S + 200 A. The same
  KM-150 motor on 16S/150 A makes ≈ 536 N·m. Without the drive and bus upgrade, KA-150X is mostly a continuous-torque
  upgrade.
- **Structure.** 719 N·m × G 1.46 = **1,050 N·m** at the knee. The four-bar rod, knee clevis and shank must be redesigned
  for it, or firmware must cap the actuator at the structure rating.
- **When to choose it:** only if the owner wants running, jumping or sustained deep-squat load-carrying beyond the
  K1 scenario set. **For the K1 scenarios, KA-130K2 already gives every margin ≥ 1.32 at 1.8 kg less per unit.**

#### 5.3.3 Linear alternative: roller-screw knee **KL-R**

**Layout [E].** A KM-85x50-LC motor (N50UH, 1-turn tooth coils, N_ph 12) drives an inverted Rollvis RV 12 L5 roller
screw: the nut sits in the hollow rotor, Optimus-style. A trunnion-mounted cylinder in the thigh pushes a knee lever with
an effective moment arm r = 50 mm. Bus 20S, drive 150 A.

```
Effective ratio G = 2π·r/lead = 2π·50/5 = 62.8 /rad   torque gain G·η = 62.8·0.89 = 55.9
Motor torque needed: repeated 351/55.9 = 6.28, momentary 7.64, continuous 2.02, hold 2.20 N·m
Motor speed needed: 9.5·62.8 = 597 rad/s (5,700 rpm); linear 0.475 m/s; forces 7.0 / 8.5 / 2.3 kN
KM-85x50-LC: Kt 0.0892, Km 0.591, T_cont 5.70, T(150 A) 11.3 N·m, ω0 at 65 V = 669 rad/s, mass 1.20 kg, J 2.07e-4
Knee peak = 11.3·55.9 = 631 N·m (headroom 1.80); continuous = 5.70·55.9 = 319 N·m (margin 2.82)
Speed: ω_lim(3.14 N·m) = 662 rad/s vs 597 needed -> only 1.11 (at 16S: 529, NOT feasible)
Reflected inertia at the knee = 2.07e-4·1.3 (nut)·62.8² = 1.06 kg·m² (KA-130K2: 0.354; K1: 0.237)
Screw: static SF = 27.3/8.54 = 3.2; Euler buckling (root Ø10.5, 150 mm, pinned) P_cr = π²·205e9·5.97e-10/0.15² = 54 kN (SF 6.3)
Mass estimate: motor 1.20 + jacket 0.10 + screw/nut 0.35 + housing and thrust bearings 0.55 + trunnion/rod end 0.15
               + load cell 0.10 + drive 0.30 = 2.75 kg
```

**Assessment [E]:**

- **Advantage:** ≈ 2.2 kg lighter than KA-130K2 for more peak and continuous torque. Force density is the reason
  Optimus and Apollo chose linear legs [R, S11, S14].
- **Disadvantages:**
  - **3× the reflected inertia** of KA-130K2 and 4.5× K1, which is bad for foot-strike impacts. Knee swing at
    100 rad/s² costs ≈ 106 N·m just to spin the rotor.
  - Speed margin is thin and needs 20S.
  - The moment arm r·sin μ collapses at the ends of a 130° range. K1's four-bar exists for this reason, so a
    linear-knee linkage must be resynthesised.
  - It needs a series force sensor.
  - The roller screw is a buy-only part (Rollvis/SKF/GSA; quote, long lead time, US$1.35–2.7k per screw reported
    [R, S31]).
  - It is a full thigh and shank redesign.
- **Verdict: a Mk III research path, not Mk II.** Build one on the dyno beside a KA-130K2 before committing a leg to it.

### 5.4 KA-110P → **KA-115R** (hip roll, waist pitch)

**What to change**

- **Motor.** Replace TQ ILM85x26 with **KM-115x32**. It is already in `actuators.py` CUSTOM (Ø115, 36s/40p, 2.8 mm
  magnets). Use N50UH and rewind to **3 turns** (N_ph 36).
- **Gear.** 2-stage 32:1 → **22:1**.
- **Cooling and drive.** Potted, air, derate 0.85; keep the EV drive (60 A).

**Arithmetic [E]:**

```
Bg = 1.290·2.8/(2.8 + 0.6615) = 1.043 T;  Kt = 0.2522;  R_LL = 70.2 mΩ;  Km = 0.777
T_cont = 0.777·√50 = 5.49 N·m;  T(60 A) = 13.49 + 0.45·(15.13 − 13.49) = 14.23 N·m
Peak out = 14.23·22·0.92 = 288 N·m;  cont out = 5.49·0.85·22·0.92 = 94.5 N·m
ω0 = 0.75·21.23·3/0.2522 = 189 rad/s -> 8.6 rad/s
Mass = 1.36 + 0.84 + 0.56 + 0.12 = 2.87 kg (K1 1.82)
```

| Margin | Hip roll (K1: 2.08 peak / 1.11 cont / 1.47 no-load speed) | Waist pitch |
|---|---|---|
| Peak headroom | 2.17 | 1.39 |
| Continuous | **1.45** | 6.79 |
| Hold | 1.43 | **1.32** |
| Speed line | **2.11** (lateral push-recovery steps get 2× the K1 speed) | 5.67 |

**Build difficulty: 3/5.** New Ø115 lamination die; otherwise K1 methods.

**Risks:**

- +1.05 kg × 3 joints;
- if the bench shows a higher air-cooled rating than the conservative model (the TQ datasheet suggests it may),
  a KM-100x30 variant at 28:1 saves ≈ 0.5 kg.

### 5.5 KA-90P → **KA-90P2** (hip yaw, waist yaw, ankles)

**What to change.** Replace CubeMars RI85-PH with **KM-85x26**: the K1 scratch die, N50UH, **3 turns**. Change the
ratio 23:1 → **25:1**. Keep the EV drive. Air-cooled, derate 0.85.

**Arithmetic [E]:**

```
Kt = 0.1392; R_LL = 82.2 mΩ; Km = 0.396; T_cont = 0.396·√26 = 2.01 N·m; T_pk = 6.18 N·m (saturation, 55 A < 60 A)
Peak out = 6.18·25·0.92 = 142 N·m (K1 106);  cont = 2.01·0.85·25·0.92 = 39 N·m (K1 36, datasheet)
ω0 = 343 rad/s -> 13.7 rad/s (K1 16.0)
Mass 0.64 + 0.46 + 0.44 + 0.12 = 1.66 kg (K1 1.37)
Ankle (per-actuator corner 94 N·m, actuator speed requirement 10.4 rad/s):
  headroom 1.51, cont 3.76, speed line 1.30
Hip yaw: headroom 2.01, speed line 2.69.  Waist yaw: headroom 2.37, cont 2.05
```

**Joint-side ankle pitch peak:** 2 × 142 × 52/40 = **369 N·m** (K1 276), against 173 required. That is room for running
push-off.

**Build difficulty: 3/5.**

**Risks:**

- +0.29 kg × 7 units; the ankle units sit in the shank, which adds swing inertia;
- lower top speed than RI85-PH (13.7 vs 16.0 rad/s), though still above every requirement with a 1.30 margin.

### 5.6 KH-25 → **KH-C25** (shoulder pitch/roll)

**What to change**

- **Motor.** Replace ILM85x13 with **KM-85x26** (N50UH, **4 turns**, Kt 0.186).
- **Gear.** Replace CSG-25-50 with a **machined two-disc cycloid, 30:1**, to the docs/13 §4.2 KH-C25 geometry:
  - ring-pin circle Ø84 mm, Ø5 mm pins;
  - E = 0.9 mm;
  - discs 8 mm thick, 42CrMo4 Q&T + nitride, wire-EDM profile;
  - 8 output pins.
- **Brake.** Add a 3.4 N·m flat brake for the shoulder-pitch hold.
- **Torque sensing.** Keep the strain-gauge flexure.

**Arithmetic [E]** (η 0.85, derate 0.85):

```
Peak out = 6.18·30·0.85 = 158 N·m (K1: firmware-limited to the CSG-25-50 repeated 127)
Cont out = 2.01·0.85·30·0.85 = 44 N·m
Hold: 1.5·2.01·0.85 = 2.56 N·m ≥ 54.4/(30·0.85) = 2.13 N·m -> margin 1.20
  (the docs/13 KH-C25 with ILM85x13 gives 1.84 vs 2.13 -> 0.86: fails)
ω0 = 0.75·21.23·3/0.1856 = 257 rad/s -> 8.6 rad/s (K1 7.1; requirement 6.2) -> speed line 1.38
Shoulder pitch headroom 2.37; shoulder roll 3.16
Mass 0.64 + 0.57 (cycloid, docs/13 +0.15 over the strain-wave) + 0.44 + 0.12 = 1.77 kg (K1 1.38)
```

**Design the cycloid for:** repeated ≥ 160 N·m, momentary ≥ 250 N·m (matching CSG-25-50's 242). The UCLA machined
cycloid's output pins alone were rated 295 N·m at a similar size [V, S9]. Verify the pin/lobe Hertz stress and the
output-pin bending in detail design.

**Build difficulty: 4/5.** Wire-EDM discs and ring at a job shop; profile from `cad/cycloid_profile.py`.

**Risks:**

- backlash 1–7 arcmin, against ≤ 10 arcsec for strain-wave;
- more friction than strain-wave at low speed, which affects current-based torque estimation;
- +0.39 kg at the shoulder.

### 5.7 KH-20 → **KH-C20** (shoulder yaw, elbow)

**What to change.** Replace RI85-PH with **KM-85x17** (N50UH, 5 turns), and CSG-20-50 with the **docs/13 KH-C20
cycloid at 30:1** (Ø68 pin circle, Ø4 pins, 6 mm discs).

**Arithmetic [E]:**

```
Kt 0.1517, Km 0.299, T_cont 1.31, T_pk 4.04 N·m (33 A)
Peak out = 4.04·30·0.85 = 103 N·m (K1: 73 gear-limited);  cont = 1.31·0.85·30·0.85 = 28 N·m (elbow needs 6)
ω0 = 315 rad/s -> 10.5 rad/s (K1 7.3; elbow requirement 7.0)
Elbow: headroom 1.89, cont 4.95, hold 1.84, speed line 1.46 (K1 no-load 1.05)
Mass 0.43 + 0.43 + 0.44 + 0.12 = 1.42 kg (K1 1.25)
```

**Build difficulty: 4/5.**

**Risks:** as KH-C25, plus +0.17 kg at the elbow, which raises shoulder loads.

### 5.8 KH-14 (wrist yaw, neck): **keep**

**Why.** K1 already has peak headroom 2.8 (gear-limited at the CSG-14-50 repeated rating of 23 N·m, against 12
required), a continuous rating far above need, and speed-line margins of 1.09 (wrist yaw) to 1.24.

**Optional upgrades [E]:**

| Option | Effect | Cost |
|---|---|---|
| N50UH + fill 0.50 + 16 turns | Kt 0.103, ω₀ 9.3 rad/s (+4 %) | none |
| CSG-14-50 → CSG-17-50 | repeated 44 N·m, momentary 91 N·m [V, R1]; peak becomes motor-limited at 0.95 × 50 × 0.75 = 36 N·m | +0.06 kg, +10 mm OD |

**Build difficulty: 2/5.** Effort is better spent elsewhere.

### 5.9 KW-L → **KW-L2** (wrist pitch/roll, 4 units)

**K1 shortfall** (§1.2 item 5). Lever arms r_p = 22 mm and d = 16 mm give these per-actuator needs:

- combined corner: 13/(2·0.022) + 10/(2·0.016) = **611 N**;
- speed corner: 6.5 N·m pitch at 6 rad/s, i.e. 148 N at **132 mm/s**, ≈ 19.5 W of output per actuator.

| | DCX 16 L 18 V winding at 12 V (K1) | Needed |
|---|---|---|
| Force per motor torque (×3.9 × 0.90 × 2π/2 mm × 0.88) | 9.70 N per mN·m | — |
| Continuous | 10.9 → 106 N | 114 N (AH 5 N·m hold) |
| Stall at 12 V | 24.9 mN·m → 241 N | 611 N |
| No-load | 4,260 rpm → 36 mm/s | 132 mm/s |
| Maximum motor power, T_stall·ω₀/4 | 0.0249 × 446/4 = 2.8 W | ≈ 25 W at the speed corner |

**What to change:**

- **Power the wrist actuators from the main bus or a dedicated 24 V rail** with their own 2-axis driver
  (F28P65x + DRV8353-class), not the 12 V hand controller.
- **Option A (preferred):** maxon **ECX FLAT 32 L**, high-torque version, directly on the Ø6×2 screw (no gearhead).
  Key data 100/168 W, 106 mN·m, 14,000 rpm; ≈ 10,600 rpm no-load at 24 V [R, S36, to verify on the datasheet].
  - Continuous: 106 × 2.765 N/mN·m = **293 N**.
  - 611 N needs 221 mN·m, ≈ 2.1× nominal, short-time.
  - Speed corner 148 N needs 53.5 mN·m, so speed is close to no-load: ≈ 300 mm/s or more if stall torque is
    ≥ 0.6 N·m (to verify).
  - **Mass and stall torque not found:** confirm before committing.
- **Option B:** **ECX FLAT 22 L** (32 g, 28.8 mN·m continuous, 127 mN·m stall, 12,000 rpm no-load at 18 V [V, R5])
  run at 24 V, with a 3.9:1 gearhead rated ≥ 0.25 N·m intermittent (GPX 22 class; the GPX 16's 0.2 N·m continuous is
  marginal).
  - Continuous: 28.8 × 9.70 = **279 N**.
  - Peak: ≥ 611 N at 63 mN·m.
  - Speed corner: 16,000 × (1 − 15.3/169) = 14,550 rpm → **124 mm/s (0.94 of the requirement)**. Borderline; needs a
    lower gear ratio, or longer levers paired with a longer stroke.

**Build difficulty: 3/5** (custom housing, small BLDC driver).

**Risks:**

- maxon data for the 32 L not yet verified;
- Ø6×2 ball screw dynamic load rating not retrieved (KSS Ø4×1 is 560 N [V, R5]); move to Ø8 if Ca < 1.5 kN;
- 4 × ~100 W peak on the hand power budget.

---

## 6. Mk II package: priorities, mass and system impact [E]

| Priority | Change | Units | Δmass vs K1 | What it buys |
|---|---|---|---|---|
| 1 | 150 A GaN drive + liquid jacket on the knee and hip pitch (K1 motors) | 4 + 2 loops | +0.2 per actuator + 0.4 per leg ≈ +1.6 kg | knee continuous margin 1.04 → 1.60 |
| 2 | **KA-130K2** motor/gear (50 mm stack, N50UH, 16:1), shared by knee and hip | 4 | knee +0.68, hip +1.12 per unit → +3.6 kg actuators + 0.8 kg loops = **+4.4 kg** (includes priority 1) | every leg margin ≥ 1.32; hip speed 1.04 → 1.36 |
| 3 | **KW-L2** wrist power fix | 4 | ≈ 0 to +0.2 kg | meets the 6 rad/s and 13/10 N·m wrist requirement, which K1 does not |
| 4 | **KA-90P2** (ankle, yaws) | 7 | +2.0 kg | ankle peak +34 % |
| 5 | **KH-C25 / KH-C20** cycloid arms | 8 | +2.2 kg | arm peak +24 % / +41 % over gear-limited K1; impact-tolerant; arm speed +21 % / +44 % |
| 6 | **KA-115R** (hip roll, waist pitch) | 3 | +3.2 kg | hip-roll continuous 1.11 → 1.45, lateral speed 2× |
| Option | **KA-150X** in place of KA-130K2 | 4 | +7.2 kg over KA-130K2 | peak 719 / continuous 524 N·m, needs 20S |

- **Full recommended package (priorities 1–6):** ≈ **+11–12 kg** on a 92.6 kg design mass, so ≈ 104 kg. With the
  margins above it still closes. Requirements will rise ≈ 12 % because loads scale with mass, against Mk II minimum
  margins of 1.20–1.32.
- **The core (priorities 1–3: legs + wrist fix):** ≈ **+4.5 kg**.
- **Run the K1 iteration loop:** `calc/run_all.py` with the new masses, then `structure.py`, then the power budget. The
  loop dissipation adds ≈ 30–60 W of pump and fan load to `power.py`.

---

## 7. Validation before building more than one of anything [E]

1. **FEMM** for KM-130x50 (N50UH, 3.0 mm yoke per docs/13 §3.1):
   - Kt within ±10 % of 0.224;
   - T_sat knee near 30 N·m;
   - N50UH demagnetisation margin at 204 A and 120 °C.
2. **Jacket dyno test** on a K1 KM-130x45 stator first: measure the copper-to-coolant thermal resistance. If it is
   > 0.30 K/W, F_cool drops below 2.0 and the continuous numbers here scale with √F_cool.
3. **Drive:** 150 A for 2 s and 99 A for 10 s into a locked rotor; check saturation by measured torque vs current.
4. **Gear:** run-in, efficiency map (replace η 0.92), backlash, and stage-2 tooth-root check by ISO 6336.
5. **k_L at 42 poles:** measure the voltage-limited torque–speed curve at 52 V and update `K_L` if it is not 0.75.
6. **Cycloid KH-C25:** static overload to 250 N·m, backlash, stiffness, and efficiency vs speed.
7. **KW-L2:** confirm the maxon datasheet values (32 L mass and stall torque), then a force–speed test at 24 V.

---

## 8. Numbers to feed into `calc/kestrel/actuators.py` (Mk II run)

`T_pk` below is the **saturation-corrected torque at the intended drive's peak current**, so the existing
`min(T_pk, Kt·I_pk)` returns the physical value. `T_cont` already includes the cooling (F_cool) and must use
`derate=1.00` for the jacketed motors. Air-cooled motors keep 0.85. `len` is the active length plus end turns. `bore` is
the rotor ID.

```python
# --- Mk II motors (R10; motor_design.py physics, K_R_CAL 1.30, P_allow = envelope Cu loss @7 A/mm2 x F_cool) ---
MOTORS.update({
    # liquid jacket (F_cool 2.4), N50UH, Ø130 die, 50 mm stack
    "KM-130x50-LC":    dict(Kt=0.2242, R_LL=0.02026, T_cont=18.85, T_pk=31.5, mass=2.615, J=1.258e-3, OD=0.130, len=0.066, bore=0.0855, status="C", src="R10 Mk II, 3t x 2p, T_pk @150 A"),
    "KM-130x50-LC-20S":dict(Kt=0.2491, R_LL=0.02502, T_cont=18.85, T_pk=33.2, mass=2.615, J=1.258e-3, OD=0.130, len=0.066, bore=0.0855, status="C", src="R10 Mk II, 5t x 3p, T_pk @150 A"),
    # strongest: segmented Ø150 stator, fill 0.55, jacket, T_pk @200 A
    "KM-150x50-LCS":   dict(Kt=0.2300, R_LL=0.00942, T_cont=33.5,  T_pk=46.0, mass=3.677, J=2.099e-3, OD=0.150, len=0.068, bore=0.0997, status="C", src="R10 KA-150X, 4t x 3p"),
    # air-cooled, potted (use derate 0.85)
    "KM-115x32-N50":   dict(Kt=0.2522, R_LL=0.0702,  T_cont=5.49,  T_pk=14.2, mass=1.355, J=4.99e-4,  OD=0.115, len=0.047, bore=0.0746, status="C", src="R10 KA-115R, 3t, T_pk @60 A"),
    "KM-85x26-N50-3t": dict(Kt=0.1392, R_LL=0.0822,  T_cont=2.01,  T_pk=6.18, mass=0.642, J=1.08e-4,  OD=0.085, len=0.038, bore=0.0515, status="C", src="R10 KA-90P2"),
    "KM-85x26-N50-4t": dict(Kt=0.1856, R_LL=0.1461,  T_cont=2.01,  T_pk=6.18, mass=0.642, J=1.08e-4,  OD=0.085, len=0.038, bore=0.0515, status="C", src="R10 KH-C25"),
    "KM-85x17-N50-5t": dict(Kt=0.1517, R_LL=0.1713,  T_cont=1.31,  T_pk=4.04, mass=0.434, J=7.04e-5,  OD=0.085, len=0.029, bore=0.0515, status="C", src="R10 KH-C20"),
    "KM-50x20-N50":    dict(Kt=0.1028, R_LL=0.6592,  T_cont=0.31,  T_pk=0.95, mass=0.243, J=1.03e-5,  OD=0.050, len=0.037, bore=0.0227, status="C", src="R10 KH-14 option"),
})
DRIVES.update({
    "HC2": dict(name="150 A rms GaN, 100 V class (EPC9186HC-class stage), 16S", I_pk=150.0, I_cont=75.0),
    "HV":  dict(name="200 A rms, 150 V class, 20S (custom)", I_pk=200.0, I_cont=100.0),
})
ETA["cycloid"] = 0.85        # machined two-disc cycloid, to be measured (UCLA 82 %, printed ~90 %)
# V_MIN = 52.0 for 16S (default plan); 65.0 only together with the 20S variants and the "HV" drive.
# Mk II groups:
#   KA-130K2: ["knee"] and ["hip_pitch"], motor KM-130x50-LC, ratio 16, drive HC2, derate 1.00, electronics_kg 0.25 (+0.15 jacket)
#   KA-150X : same joints, KM-150x50-LCS, ratio 17, drive HV, V_MIN 65, derate 1.00, electronics_kg 0.30 (+0.18 jacket)
#   KA-115R : ["hip_roll", "waist_pitch"], KM-115x32-N50, ratio 22, drive EV, derate 0.85
#   KA-90P2 : ["hip_yaw", "waist_yaw", "ankle"], KM-85x26-N50-3t, ratio 25, drive EV, derate 0.85
#   KH-C25  : ["shoulder_pitch", "shoulder_roll"], KM-85x26-N50-4t, ratio 30, gear "cycloid" (rating target: repeated 160 / momentary 250 N m), gear mass 0.57 kg
#   KH-C20  : ["shoulder_yaw", "elbow"], KM-85x17-N50-5t, ratio 30, gear "cycloid" (repeated 105 / momentary 160 N m), gear mass 0.43 kg
```

Code changes the Mk II run needs (to be made by the design team; not done here):

1. Apply motor_design's saturation curve in the peak check, instead of `min(T_pk, Kt·I)`.
2. Size planetary gear mass on 1.1 × delivered peak, not on the momentary requirement.
3. Add a `"cycloid"` gear path with its own rating table, mirroring `HD_CSG`.
4. Add jacket and loop masses to `params.py`.
5. Report the voltage-line speed margin (minimum over samples) alongside no-load speed.

---

## 9. Build-difficulty scale used

| Score | Meaning for a skilled home builder with machine-shop access |
|---|---|
| 1 | buy and bolt in |
| 2 | K1-level parts, small changes (rewind, magnet grade) |
| 3 | a new lamination die or a new small drive/housing, K1 processes |
| 4 | a new process (liquid jacket + loop, 150 A drive, wire-EDM cycloid) plus K1 processes |
| 5 | several new processes at once (segmented stator + rectangular-wire coils, 20S/150 V drive at 200 A, larger ground gears), or a buy-only precision part with long lead time |

---

## 10. Sources (all accessed 2026-11-09)

| # | Source | Used for | Tag |
|---|---|---|---|
| S1 | Unitree H1 / H1-2 product page — https://www.unitree.com/h1 , https://www.unitree.com/mobile/h1 | 189 N·m/kg; knee 360, hip 220, ankle 59 / 75×2, arm 75 (120 shoulder/elbow on H1-2), 67.2 V max | V |
| S2 | Unitree H1 page comparison table (search snippet: M107 1.9 kg, 360 N·m) — https://unitree.com/h1 ; Wevolver, "Meet the Unitree H1" — https://wevolver.com/article/meet-the-unitree-h1-a-humanoid-general-purpose-robot-starts-a-new-industrial-revolution | M107 mass; M107 on the knees, 360 N·m | R |
| S3 | Unitree G1 spec pages (via search) — https://www.unitree.com/g1 , https://www.elektor.com/products/unitree-g1-humanoid-robot | knee 90 / 120 N·m, internal-rotor PMSM, crossed roller, dual encoder | R |
| S4 | Chignoli, Kim, Stanger-Jones, Kim, "The MIT Humanoid Robot: Design, Motion Planning, and Control for Acrobatic Behaviors", arXiv 2104.09025 — https://arxiv.org/abs/2104.09025 | U10/U12 mass, ratio, torque, speed, size; belts at knee/ankle/elbow; 60 V pack | V |
| S5 | Katz, Di Carlo, Kim, "Mini Cheetah", ICRA 2019 (doi 10.1109/ICRA.2019.8793865); numbers as tabulated in arXiv 2202.12395 — https://arxiv.org/pdf/2202.12395 | 17 / 6.9 N·m, 480 g, 6:1, Ø96×40 | R (secondary table) |
| S6 | Liao, Zhang, Huang, Huang, Li, Sreenath, "Berkeley Humanoid: A Research Platform for Learning-based Control", arXiv 2407.21781 — https://arxiv.org/abs/2407.21781 | Table 2 actuators (5013 … 10413); Table 1 (H1, Digit, Cassie, G1 transmissions and torques) | V |
| S7 | Berkeley Humanoid Lite, arXiv 2504.17249 — https://arxiv.org/abs/2504.17249 | printed cycloid ≈ 90 % efficiency, 319 vs 1,468 N·m/rad stiffness | V |
| S8 | Kau, Schultz, Ferrante, Slade, "Stanford Doggo", arXiv 1905.04254 — https://arxiv.org/abs/1905.04254 | MN5212 + 3:1 belt: 0.27 kg, 1.51 / 4.8 N·m, 17.8 N·m/kg | V |
| S9 | Zhu, Tanaka, Rafeedi, Hong, "Cycloidal Quasi-Direct Drive Actuator Designs with Learning-based Torque Estimation for Legged Robotics", arXiv 2410.16591 — https://arxiv.org/html/2410.16591v2 | 10:1 machined cycloid: 89.9 / 37.5 N·m, 1.40 kg, 82.3 %, 7.03 arcmin, pin limit 295.65 N·m | V |
| S10 | Zhu, Nesler, Divekar, Peddinti, Gregg, "Design Principles for Compact, Backdrivable Actuation in Partial-Assist Powered Knee Orthoses", IEEE/ASME TMech 26(6) 2021 — https://pmc.ncbi.nlm.nih.gov/articles/PMC8670722 | Hiperco-50 stator, 3.2 W/m·K potting, 15–38 % lower temperature, 23.9 / 12.78 N·m, 1.15 kg | V |
| S11 | humanoid.guide, "Linear vs rotary actuators: why Tesla bet on the roller screw" — https://humanoid.guide/linear-vs-rotary-actuators-humanoid-joints/ (cites AI Day 2022 coverage) | Optimus 28 actuators / 6 designs; 20/110/180 N·m; 500/3,900/8,000 N; piano lift | R |
| S12 | Interesting Engineering, Figure 02 — https://interestingengineering.com/innovation/figure-02-worlds-most-advanced-humanoid-robot | "torque up to 150 N·m" | R |
| S13 | Hyundai Mobis–Boston Dynamics actuator agreement (CES 2026) — https://www.barchart.com/story/news/36939666/hyundai-mobis-forms-strategic-collaboration-framework-with-boston-dynamics ; https://en.fnnews.com/news/202609020840218266 | production Atlas actuators from Mobis; 31 actuators per unit | R |
| S14 | The Robot Report, Apptronik Apollo — https://www.therobotreport.com/rbr50-company-2024/apptronik-releases-humanoid-robot-with-bespoke-linear-actuators/ | linear + rotary actuators, 13+ generations | R |
| S16 | Hua et al., "Design of an Actuator for Biped Robots Based on the Axial Flux Motor", ICIRA 2023, LNCS 14270 — https://link.springer.com/chapter/10.1007/978-981-99-6492-5_22 | 12.5 N·m axial-flux motor, ~16:1, fan cooling, 6 km/h biped | V (abstract) |
| S17 | humanoid.guide, "Axial-Flux Motors in Humanoid Joints" — https://humanoid.guide/?p=20283 | 206 N·m / 2 kg / 120 rpm (Hua); Harvard 75 N·m/kg; no production confirmation as of Oct 2026 | R |
| S18 | Y. Gai, PhD thesis, Newcastle University 2020, Table 2-1 — https://theses.ncl.ac.uk/jspui/bitstream/10443/5024/1/Gai%20Y%202020.pdf ; also Gai et al., IEEE TIE 66(3) 2019 | J by cooling method (1.5–5 / 5–10 / 7–20 / 10–30 A/mm²) | V |
| S19 | Kim et al., "Investigations of a Robotic Testbed with Viscoelastic Liquid Cooled Actuators", arXiv 1711.01649 — https://arxiv.org/abs/1711.01649 | 3.59× continuous current; ≈ 1 kg pump/radiator/reservoir | V |
| S20 | humanoid.guide, "Peak vs Continuous Torque in Humanoid Joints" — https://humanoid.guide/?p=17008 | 25–30 % continuous/peak (air); cooling shares; JSK evaporative ×2 | R |
| S21 | DMEGC NdFeB grade table — https://dmegc.de/uploads/20240203/1633a4de451e78f36008f1eeb7805fd5.pdf | N42SH, N52SH, N50UH, N52UH Br / Hcj / temperature / αBr | V |
| S22 | Surahammars (Tata Steel) NO20-1200H datasheet — https://www.tatasteeleurope.com/sites/default/files/tata-steel-hi-lite-electrical-steel-no20-1200h-datasheet-en.pdf | losses vs B and f, magnetisation, thermal and mechanical properties | V |
| S23 | Carpenter Hiperco 50 — https://www.carpentertechnology.com/alloy-finder/Hiperco-50 | 2.4 T saturation (loss data gated, not found) | V |
| S24 | Zhang et al., "Design of a High Torque Density Motor Based on Halbach Array Integral Ring Rotor", ARSO 2019 — https://pure.bit.edu.cn/en/publications/design-of-a-high-torque-density-motor-based-on-halbach-array-inte | −30 % rotor mass | V (abstract) |
| S25 | Khoshoo, Aggarwal, Foster, "A Review of Segmented Stator and Rotor Designs in AC Electric Machines", Eng 6(1):7, 2025 — https://doi.org/10.3390/eng6010007 | segmented FSCW fill up to 75 %, MSO 80 %; parasitic gaps raise cogging | V |
| S26 | EEPower / ChargedEVs on EPC9186HC2/HC3 — https://eepower.com/technical-articles/gan-motor-drive-evaluation-boards-epc9186hc2-hc3-and-epc91202/ ; https://chargedevs.com/newswire/epc-launches-5-kw-gan-motor-inverter-boards-for-light-evs-and-robotics/ | 150 A rms, ≤ 76 V, ≤ 120 kHz, EPC2361 | R (vendor press) |
| S27 | Harmonic Drive CSG/CSF Component Set catalogue — https://www.harmonicdrive.net/_hd/content/documents1/CSG-CSF_Component.pdf | torsional stiffness Tables 042-4 / 043-1; ratings (with R1) | V |
| S28 | Pelonis Servobox planetary catalogue — https://catalog.pelonistechnologies.com/Category/planetary-reducer-gearboxes | 97 / 94 % efficiency; backlash classes | R (vendor) |
| S29 | Singh, Kapa, Chedda, Kolathaya, "Comparison between External and Internal Single Stage Planetary gearbox actuators for legged robots", arXiv 2506.16356 — https://arxiv.org/abs/2506.16356 | ISSPG 5–7:1, ESSPG 7–11:1 | V (abstract) |
| S30 | Rollvis RV tables via R1 — rollvis.com | RV 12 L5 Ca/C0a, η direct/inverse | V (R1) |
| S31 | humanoid.guide (Tolomatic, Fast Company, 36Kr citations) — https://humanoid.guide/linear-vs-rotary-actuators-humanoid-joints/ | roller-screw actuator efficiency 75–80 %, cost share, US$1.35–2.7k per screw | R |
| S32 | humanoid.guide, "Joint Brakes in Humanoid Robots" — https://humanoid.guide/?p=18791 | KEB 3.4–10.8 N·m, 12–15 mm; Kendrion 2.7–17 N·m; 40–50 W for 12 brakes | R |
| S33 | Qian, Wan, Wang, Luo, "Learning Thermal-Aware Locomotion Policies for an Electrically-Actuated Quadruped Robot", arXiv 2603.01631 — https://arxiv.org/abs/2603.01631 | overheat stop at ≈ 7 min vs > 27 min | V (abstract) |
| S34 | J. Bell, "A two-motor actuator for legged robotics applications", MIT S.M. thesis 2020 — https://dspace.mit.edu/handle/1721.1/127152 ; arXiv 2007.00872 — https://arxiv.org/pdf/2007.00872 | dual-motor actuator concepts | V (abstract) / R |
| S36 | maxon catalogue key data for ECX FLAT 32 L — https://www.maxongroup.com/medias/sys_master/root/9410429419550/Cataloge-Page-EN-262.pdf ; https://www.maxongroup.com/maxon/view/product/motor/ecmotor/ECX-Flat/ECX-Flat-32/ECXA32LZF50E6ILACO1Y330A | 100/168 W, 106 mN·m, 14,000 rpm; ≈ 10,600 rpm at 24 V (text jumbled) | R |
| R1, R2, R5, R7 | KESTREL research notes in this folder | MyActuator, RobStride, TQ, CubeMars, CSG ratings, Rollvis (R1); drives, encoders, torque sensors (R2); maxon DCX/ECX, KSS screws (R5); H1 URDF limits, PM01, Optimus 52 V (R7) | as tagged there |

Internal model sources: `calc/kestrel/motor_design.py` (K_R_CAL 1.30, J_cont 7 A/mm², J_peak 28 A/mm², sat_knee 2.6),
`calc/kestrel/actuators.py` (K_L 0.75, V_MIN 52 V, derates 0.85/1.00, HOLD_FACTOR 1.5, η 0.92/0.75), `data/joint_requirements.json`,
`data/scenario_series.npz`, `docs/13` (jacket 0.6 → 0.25 K/W estimate; cycloid geometry), `docs/05` (12 V wrist drive).

Not found or not verified this session:

- Optimus actuator masses (values circulating online were not traceable);
- Figure / Atlas / Apollo / Digit joint torque specifications;
- Hiperco 50 and VACOFLUX core-loss tables;
- a quantified Halbach-vs-surface-PM torque gain for robot motors;
- maxon ECX FLAT 32 L mass and stall torque;
- KSS Ø6×2 ball-screw load rating;
- cycloid torsional stiffness for a machined two-disc design at this size.
