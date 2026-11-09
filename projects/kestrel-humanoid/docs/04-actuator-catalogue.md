# 04 — Actuator catalogue (Mk II)

![KA-130K cutaway](../renders/18_KA130K_cutaway.png)

*Render shows the K1 KA-130K. The Mk II unit keeps the Ø142 housing of the sizing rule, grows to ≈ Ø145 at the liquid jacket around the stator (docs/03 §9.3), and has a 10 mm longer motor (§5).*

Per-joint spec sheets (requirement vs. delivered, with margins) are generated in
[generated/joint_catalogue.md](generated/joint_catalogue.md). The family table and motor data are in
[generated/actuator_family.md](generated/actuator_family.md). Requirements are in
[generated/joint_requirements.md](generated/joint_requirements.md). Torque-speed envelope plots are
`docs/img/envelope_*.png`. The Mk II actuator research, including every motor derivation quoted below, is
[research/R10](research/R10-actuator-state-of-the-art.md).

**Rule for this document:** every margin is copied from `docs/generated`. Where a number is not in the generated
files, the arithmetic is written next to it and the number is tagged **[E]**.

## 0. Status tags

| Tag | Meaning |
|---|---|
| **[sim]** | requirement from whole-body inverse dynamics (`docs/generated/joint_requirements.md`) |
| **[V]** | verified: manufacturer datasheet or catalogue value (research R1, R2, R5) |
| **[E]** | estimate: output of `motor_design.py` / `actuators.py`, or arithmetic shown in this document |
| **[VT]** | validation target: a rating the sizing assumes and the dyno must demonstrate before a second unit is built (R10 §7). Treat it as unproven |

## 1. How the actuators were engineered

1. **Loads.** Whole-body inverse dynamics over **18 scenarios** at the **112.7 kg design mass** (102.5 kg estimate ×
   1.10). Mk II adds three work cases to the K1 set: CW (walk 0.6 m/s carrying a 30 kg box), AO (15 kg in one hand,
   elbow 90°) and LM (momentary squat-lift of a 50 kg box). The squat box rises from 20 to 30 kg and the arm cases
   from 5 to 10 kg per hand [sim].
2. **Requirement classes.** Repeated peak (normal operation × 1.2), momentary (SD drop and LM lift × 1.1), continuous
   (walking RMS × 1.2), hold (static postures), speed (× 1.15). Analytic minimums cover full-authority ankle torque,
   turning in place and wrist tool use.
3. **Linkage mapping.** Knee four-bar G(θ) = 0.84–1.46; ankle push-rod pair; wrist linear pair.
4. **Search.** Motor × gear × ratio × drive for each class. Every simulated (torque, speed) sample is checked against:
   * the voltage-limited line at the **52 V minimum loaded bus**, `ω(T) = 0.75·(V/√6 − R_ph·T/Kt)·3/Kt`;
   * peak = min(T_pk, Kt × drive peak current). For the Mk II custom motors `T_pk` is already the
     **saturation-corrected torque at the intended drive's peak current** (R10 §8), so the check is physical;
   * continuous thermal torque × derate: 0.85 for conduction-cooled housings, **1.00 for the liquid-jacketed
     KM-130x50-LC**, whose `T_cont` already includes the jacket (R10 §4 rule 1);
   * strain-wave ratings [V] and the new **cycloid rating table** (`CYC` in `actuators.py`), whose values are [VT];
   * gear maximum input speed.
5. **Gear mass** is sized on 1.1 × the delivered peak, not on the requirement (R10 §8 change 2). Sized masses go back
   into the dynamic model and the loop repeats until masses settle.

What the sizer does **not** check, and this document adds by hand:

* **Drive continuous current.** HC2 is 75 A rms continuous. 75 × 0.2242 = 16.8 N·m at the motor, below the
  KM-130x50-LC thermal rating of 18.85 N·m. Continuous output is therefore drive-limited (§3, §5) [E].
* **Cycloid repeated-peak limit.** The KH-25 and KH-20 motors can exceed the gear's repeated rating. The drive torque
  limit is set at the gear rating (§3), as K1 did for its strain-wave gears.

## 2. The Mk II family

From [generated/actuator_family.md](generated/actuator_family.md). Torques at the actuator output, before linkages.

| Class | Joints (qty) | Motor | Gear | Peak / cont. out | No-load @52 V | Refl. inertia | Mass | Drive | Build class |
|---|---|---|---|---|---|---|---|---|---|
| **KA-130K** | knee (2) | **KM-130x50-LC** custom, liquid jacket [E] | 2-stage planetary **17:1** | **493 / 295 N·m** [E; cont. VT] | 12.5 rad/s | 0.400 kg·m² | 4.96 kg [E] | HC2 | build |
| **KA-130H** | hip pitch (2) | **KM-130x50-LC** (same unit) [E] | 2-stage planetary **14:1** | **406 / 243 N·m** [E; cont. VT] | 15.2 rad/s | 0.271 kg·m² | 4.76 kg [E] | HC2 | build |
| **KA-110P** | hip roll (2), waist pitch (1) | CubeMars **RI115-PH** [V] | 2-stage planetary **29:1** | 427 / 125 N·m [E] | 5.7 rad/s | 0.361 kg·m² | 2.96 kg [E] | EV | modify |
| **KA-90P** | hip yaw (2), waist yaw (1), ankle (4) | CubeMars **RI85-PH** [V] | 2-stage planetary **28:1** | 129 / 44 N·m [E] | 13.1 rad/s | 0.066 kg·m² | 1.41 kg [E] | EV | modify |
| **KH-25** | shoulder pitch (2), roll (2) | **KM-115x32-N50** custom [E] | **C25** machined two-disc cycloid 30:1 [VT] | 362* / 119 N·m [E] | 6.3 rad/s | 0.494 kg·m² | 2.60 kg [E] | EV | build |
| **KH-20** | shoulder yaw (2), elbow (2) | **KM-85x26-N50-4t** custom [E] | **C20** machined two-disc cycloid 30:1 [VT] | 158* / 44 N·m [E] | 8.6 rad/s | 0.107 kg·m² | 1.63 kg [E] | EV | build |
| **KH-14** | wrist yaw (2), neck (2) | **KM-50x20** custom [E] | CSG-14-50 strain-wave [V] | 34* / 9 N·m [E] | 9.0 rad/s | 0.028 kg·m² | 0.68 kg [E] | EV | build |
| **KW-L2** | wrist pitch/roll (4, parallel pairs) | maxon ECX FLAT 32 L high-torque, 24 V [V] | Ø6 × 2 (or Ø8 × 2) ball screw, direct | 19 / 10 N·m wrist requirement (§9) | — | — | 0.34 kg (budget) | own 24 V driver | modify |

\* **Motor-limited peak above the gear's repeated rating.** The drive torque limit is set at the gear's repeated-peak
rating: C25 **160 N·m**, C20 **105 N·m** [VT, `CYC` table / R10 §5.6–5.7], CSG-14-50 **23 N·m** [V, R1]. The momentary
ratings (C25 250, C20 160, CSG-14-50 46 N·m) protect against impacts.

Drives: **HC2** = 150 A rms peak / 75 A rms continuous GaN EtherCAT drive, 100 V class (EPC9186HC-class power stage
[R, R10 S26]), 16S. **EV** = Novanta Everest S NET (8–80 V, 45 A continuous / 60 A for 1 s) [V, R2].

Mass bookkeeping for KA-130K, from the sizer rule [E]: motor 2.615 + gear 0.0063·(1.1·493)^0.85 = 1.33 + housing
0.25 + 4.0·(0.142 − 0.05) = 0.62 + drive and jacket 0.40 = **4.96 kg**. KA-130H differs only in the gear (1.13 kg).

### 2.1 What changed from K1, and why the sizer chose these parts

| Class | K1 | Mk II | Driver of the change |
|---|---|---|---|
| KA-130K | KM-130x45, 14:1, 99 A drive, ducted air: 395 / 139 N·m | KM-130x50-LC, 17:1, 150 A, liquid jacket: 493 / 295 N·m | knee repeated requirement 351 → **431 N·m**, continuous 113 → 142 N·m (30 kg carry, 112.7 kg robot). R10 §1.2: drive current is the first peak lever, the jacket the first continuous lever |
| KA-130H | KM-130x40, 14:1: 399 / 123 N·m, 10.3 rad/s | same motor as the knee, 14:1: 406 / 243 N·m, **15.2 rad/s** | hip speed was the K1 weak point (R10 §5.2); one motor, one jacket, one drive for 4 units |
| KA-110P | TQ ILM85x26, 32:1: 276 / 73 N·m | RI115-PH, 29:1: 427 / 125 N·m | waist pitch repeated 208 → 288 N·m, momentary 379 N·m (LM); hip-roll continuous 65 → 79 N·m |
| KA-90P | RI85-PH, 23:1: 106 / 36 N·m | RI85-PH, 28:1: 129 / 44 N·m | ankle full-authority 173 → 210 N·m at the heavier design mass |
| KH-25 | ILM85x13 + CSG-25-50, gear-limited 127 N·m | KM-115x32-N50 + C25 cycloid 30:1 | 10 kg per hand at reach: shoulder hold 54 → **90 N·m** (AH), repeated 67 → 108 N·m |
| KH-20 | RI85-PH + CSG-20-50, gear-limited 73 N·m | KM-85x26-N50-4t + C20 cycloid 30:1 | 15 kg one-handed: elbow hold 23 → **59 N·m** (AO) |
| KH-14 | KM-50x20 + CSG-14-50 | unchanged | requirements unchanged (12 N·m) |
| KW-L | DCX 16 L (18 V winding) on the 12 V hand rail | KW-L2: flat BLDC on a 24 V rail | K1 delivered 36 mm/s and 241 N against 132 mm/s and 611 N (R10 §1.2 item 5) |

R10 made its first recommendations against the **K1** loads. The Mk II sizing ran at Mk II loads, and three picks differ
from R10 §1.1 for that reason:

* **Shoulders take the Ø115 motor, not R10's KM-85x26-4t.** The 90 N·m hold needs 90 / (30 × 0.85) = 3.53 N·m at the
  motor. Hold capacity is 1.5 × T_cont × 0.85: KM-85x26 gives 2.56 N·m (fails), KM-115x32-N50 gives 7.00 N·m [E].
* **Elbow takes KM-85x26-N50-4t, not R10's KM-85x17.** At the output, KM-85x17 holds 1.5 × 1.31 × 0.85 × 30 × 0.85 =
  42.6 N·m against the 59 N·m AO hold (fails). KM-85x26-4t holds 65.3 N·m [E].
* **Hip roll / waist pitch and ankles keep the datasheet CubeMars motors.** Both R10 custom options (KM-115x32-N50
  at 22:1, KM-85x26-N50-3t at 25:1) were in the search. At the higher ratios the Mk II loads need, the lighter
  datasheet motors rank first on mass + reflected inertia, and their data are verified rather than modelled.

## 3. Margins per joint (Mk II)

Copied from [generated/joint_catalogue.md](generated/joint_catalogue.md). Margin = capability / requirement, and the
requirements already include ×1.2 torque and ×1.15 speed. Hold capability is the 60 s (1.5 × continuous) rating;
the hold ratio column is the quotient of the two generated values.

| Joint | Repeated req [sim] | Cont. req [sim] | Hold req → 60 s capability | Speed req | **Peak margin** | **Cont. margin** | Hold ratio | **Speed margin** |
|---|---|---|---|---|---|---|---|---|
| Knee | 431 N·m | 142 N·m | 155 (SL) → 373 N·m | 9.2 rad/s | 1.44 (envelope) | 1.75 | 2.41 | 1.61 |
| Hip pitch | 364 N·m | 98 N·m | 84 (AH) → 364 N·m | 9.8 rad/s | **1.12** | 2.47 | 4.33 | 1.56 |
| Hip roll | 179 N·m | 79 N·m | 120 (SL) → 187 N·m | 4.0 rad/s | 2.38 | 1.58 | 1.56 | 1.42 |
| Hip yaw | 76 N·m | 15 N·m | 4 (AO) → 66 N·m | 5.0 rad/s | 1.69 | 2.97 | — | 2.62 |
| Ankle pitch | 210 N·m | 25 N·m | 40 (AO) → 171 N·m | 7.9 rad/s | 1.59 | 4.48 | 4.28 | 1.27 |
| Ankle roll | 61 N·m | 5 N·m | 3 (AO) → 118 N·m | 4.0 rad/s | 3.81 | 14.9 | — | 3.65 |
| Waist pitch | 288 N·m | 17 N·m | 176 (AH) → 187 N·m | 1.5 rad/s | 1.48 | 7.25 | **1.06** | 3.77 |
| Waist yaw | 60 N·m | 22 N·m | 14 (AO) → 66 N·m | 4.0 rad/s | 2.15 | 1.96 | 4.7 | 3.28 |
| Shoulder pitch | 108 N·m | 26 N·m | 90 (AH) → 178 N·m (motor) | 6.2 rad/s | 3.34 motor / **1.48 gear** | 4.54 | 1.98 motor / 1.11 vs C25 average 100 N·m | **1.02** |
| Shoulder roll | 58 N·m | 4 N·m | 0 → 178 N·m | 6.0 rad/s | 6.26 motor / 2.76 gear | 29.2 | — | 1.05 |
| Shoulder yaw | 30 N·m | < 1 N·m | 0 → 65 N·m | 6.0 rad/s | 5.25 motor / 3.50 gear | — | — | 1.43 |
| Elbow | 79 N·m | 7 N·m | 59 (AO) → 65 N·m | 7.0 rad/s | 1.99 motor / **1.33 gear** | 6.39 | **1.10** | 1.23 |
| Wrist yaw | 12 N·m | < 1 N·m | 0 → 13 N·m | 8.0 rad/s | 2.81 motor / 1.92 gear | — | — | 1.12 |
| Neck yaw / pitch | 12 / 12 N·m | < 1 N·m | ≤ 1 → 13 N·m | 7.4 / 7.0 rad/s | 2.81 motor / 1.92 gear | — | — | 1.21 / 1.28 |
| Wrist pitch / roll | 19 / 10 N·m (momentary 29 pitch) | ≈ 1 N·m | 14 (AO) | 6.0 rad/s | KW-L2, §9 | | | |

"Gear" margins are the gear's repeated rating over the requirement: C25 160 / 108 = 1.48; C20 105 / 79 = 1.33;
CSG-14-50 23 / 12 = 1.92 [E, from the rating tables]. The generated catalogue reports the motor-limited number only.

**Tightest numbers in Mk II (where to look first on the dyno):**

1. **Shoulder speed 1.02 / 1.05** (no-load 6.3 rad/s against 6.2 / 6.0). The Ø115 motor that the hold needs is slower
   at 30:1. If the fast-raise case (AF) cannot be met on hardware, accept 5.4 rad/s raises (the simulated value) or
   rewind KM-115x32 to fewer turns and re-run the sizing.
2. **Waist-pitch hold 1.06** (176 N·m against 187 N·m for 60 s) and **elbow hold 1.10** (59 against 65 N·m). Both are
   60 s ratings; for longer holds fit the waist brake (§8) and limit one-handed 15 kg holds to 60 s.
3. **Hip-pitch peak 1.12** (W2 fast walk). Sufficient by the K1 rule (≥ 1.1), with no headroom for mass growth beyond
   the 10 % contingency.
4. **Knee by-angle minimum** 415 N·m at 20–40° against the 431 N·m class requirement. The envelope margin is 1.44
   because demands at those angles are lower.
5. **Drive continuous current (not checked by the sizer).** HC2 at 75 A continuous caps the knee at
   16.8 × 17 × 0.92 = 263 N·m (worst-angle joint 263 × 0.84 = 221 N·m → **1.56** against 142, instead of the generated
   1.75) and the hip at 16.8 × 14 × 0.92 = 217 N·m (2.21 instead of 2.47) [E]. Still adequate; the motor's extra thermal
   headroom is usable only with a higher-continuous drive.

Momentary loads against gear momentary ratings: shoulder 136 / 250 → 1.84; elbow 115 / 160 → 1.39; wrist yaw and
neck 12 / 46 [E]. Leg and waist momentary loads are carried through the output-flange friction joints
([generated/structure_checks.md](generated/structure_checks.md)): KA-130K slip 935.5 N·m (SF **1.73** at 540 N·m),
KA-110P 891.0 N·m (SF **2.35** at 379 N·m, after the Mk II flange upgrade, docs/03 §5), KA-90P 310.5 N·m (SF **2.08**).

## 4. Status of the numbers that matter

| Number | Value | Status | How it is retired |
|---|---|---|---|
| KM-130x50-LC Kt | 0.2242 N·m/A rms | [E] | FEMM ±10 % (R10 §7.1), then back-EMF on the first stator (docs/13 §3.10) |
| KM-130x50-LC continuous | 18.85 N·m (215 W copper, F_cool 2.4) | **[VT]** | jacket dyno test: copper-to-coolant ≤ 0.30 K/W, else continuous scales with √F_cool (R10 §7.2) |
| KM-130x50-LC peak at 150 A | 31.5 N·m (saturation-corrected) | [E] | locked-rotor torque vs current to 150 A for 2 s (R10 §7.3) |
| HC2 drive 150 A pk / 75 A cont | rating | **[VT]** | EPC9186HC-class data are vendor press [R]; the drive is custom or integrated, so test 150 A / 2 s and 99 A / 10 s locked rotor |
| Planetary efficiency | 0.92 | [E] assumed | efficiency map on the dyno (R10 §7.4) |
| Cycloid efficiency | 0.85 | [E] assumed | efficiency vs speed (R10 §7.6) |
| C25 ratings | rated 80 / repeated 160 / average 100 / momentary 250 N·m | **[VT]** | static overload to 250 N·m, backlash, stiffness (R10 §7.6); pin and lobe stress screening in docs/13 §4.2 |
| C20 ratings | 52 / 105 / 65 / 160 N·m | **[VT]** | as C25 |
| KM-115x32-N50, KM-85x26-N50-4t | Kt 0.252 / 0.186; T_cont 5.49 / 2.01 N·m | [E] | FEMM + first-article tests (docs/13 §3.10). R10 §1.2 item 6: the model's continuous rating for scratch motors is conservative against datasheets but unproven |
| RI115-PH, RI85-PH | catalogue Kt, R, T_cont, T_pk | [V] | incoming inspection: Kt and R |
| k_L = 0.75 (voltage line) | calibrated on a Ø115 TQ motor | [E] | measure the torque–speed line at 52 V on the 42-pole KM-130 (R10 §7.5) |
| ECX FLAT 32 L data | 98.5 mN·m nominal, 540 mN·m stall, 10,600 rpm no-load at 24 V, 71 g | [V] (maxon product page, cited in [generated/bom.md](generated/bom.md) B024) | — |
| KW-L2 actuator force–speed | 754 N short-time, 272 N continuous, 132 mm/s | **[VT]** | force–speed test at 24 V (R10 §7.7, docs/13 §4.4) |
| Actuator masses | 0.68–4.96 kg | [E] | replace with CAD and weighed masses; re-run `calc/run_all.py` |

## 5. KA-130K / KA-130H: the shared KA-130K2 hardware (knee and hip pitch)

One motor, one jacket, one housing, one output stage and one drive for all 4 units; only the planetary stage 1
differs (17:1 knee, 14:1 hip). R10 §5.1 calls this platform KA-130K2.

### 5.1 KM-130x50-LC motor: design requirements

| Item | Requirement / design |
|---|---|
| Topology | inner-rotor surface-PM, double-layer tooth winding, 36 slots / 42 poles (kw1 0.933). **Same Ø130 lamination die as K1** |
| Magnetic circuit | airgap Ø96.2 mm, mechanical gap 0.60 mm. **N50UH** arcs 3.0 mm, 85 % pole arc. Bg 1.057 T, Bg1 1.308 T at 80 °C (Br 1.290 T). Teeth widened to stay at 1.6 T, slot area 59.2 → **52.2 mm²** (R10 §3.2.4, §5.1) [E] |
| Stator | 0.20 mm NO20, **50 mm stack** (≈ 238–250 laminations depending on the stacking factor), 3.0 mm yoke (docs/13 §3.1); Class H insulation |
| Winding | **3 turns × 2 parallel paths** (N_ph 18), star. Conductor 3.65 mm² ≈ 10 × Ø0.67 mm strands. Kt **0.2242 N·m/A rms**, R_LL **20.26 mΩ at 120 °C** (≈ 14.5 mΩ at 20 °C: 20.26 / (1 + 0.00393 × 100)) [E] |
| Rotor | 1018 back-iron, N50UH arcs bonded, carbon sleeve 0.3 mm, balanced G2.5. Rotor ID 85.5 mm nests planetary stage 1 |
| Cooling | stator potted (≥ 1.5 W/m·K) and shrink-fitted into an aluminium jacket with a **two-start helical 6 × 3 mm channel**, O-ring sealed; 0.5 L/min of 40 % propylene glycol per leg branch (docs/03 §9). Target copper-to-coolant 0.25 K/W [VT] |
| Ratings | continuous **18.85 N·m** (Km 1.286 × √215 W) [VT]; peak **31.5 N·m at 150 A** [E] (37.0 N·m at 204 A, not used); no-load 213 rad/s (2,034 rpm) at 52 V; mass 2.615 kg; rotor J 1.258×10⁻³ kg·m² [E] |
| Heat at the design points | knee continuous requirement: 142 / 0.84 / (17 × 0.92) = 10.8 N·m → (10.8 / 1.286)² = **71 W**; hip: 98 / (14 × 0.92) = 7.6 N·m → **35 W**; at the motor's continuous rating 215 W; at 150 A 1.5 × 150² × 0.02026 = 684 W [E] |
| Controller | HC2: FOC at ≥ 40 kHz PWM (electrical frequency at no-load speed 21 × 2,034 / 60 = 712 Hz [E]), 100 V GaN stage, 150 A rms peak / 75 A rms continuous, dual absolute encoders (BiSS-C), 2 NTC in the end turns + 1 on the jacket outlet, SIL3 STO, regeneration with a bus clamp, **phase-short on fault** as hardware default (R10 §3.4) |
| Passive damping (phases shorted) | b ≈ Km² × N²: knee 1.286² × 17² = **478 N·m·s/rad**, hip 1.286² × 14² = 324 N·m·s/rad at the actuator output, below the speed where inductance dominates [E] |
| Validation | R10 §7 items 1–5: FEMM (Kt, T_sat, N50UH demagnetisation at 204 A and 120 °C); jacket thermal resistance on a K1 stator first; drive 150 A locked rotor; gear efficiency and ISO 6336; k_L at 42 poles |

### 5.2 Gearbox

| | Stage 1 (inside the Ø85.5 rotor bore) | Stage 2 (shared) | Ratio |
|---|---|---|---|
| **KA-130K knee** | sun z16 / **4** planets z18 / ring z52, m0.8 (4.25:1; assembly (16 + 52)/4 = 17 ✓) | sun z18 / 4 planets z18 / ring z54, **m1.25, 18 mm face** (4.0:1; (18 + 54)/4 = 18 ✓) | **17.0:1** |
| **KA-130H hip** | sun z24 / 3 planets z18 / ring z60, m0.8 (3.5:1; (24 + 60)/3 = 28 ✓) | same parts as the knee | **14.0:1** |

These suns leave no cable through-bore (KA-130K stage-1 sun pitch diameter 12.8 mm; KA-130H allows Ø12), so the leg
harness crosses the joints externally with the coolant hoses (docs/03 §11; docs/09 §5.1 lists a bore-compatible Plan B).
Preliminary tooth plans [E]: each passes the coaxial condition (z_r = z_s + 2·z_p), the equal-spacing assembly
condition, and planet tip clearance. The K1 stage 1 (z20/z15/z50, 3 planets) failed the assembly condition
((20 + 50)/3 = 23.3) and is withdrawn. Stage 2 is the geometry checked in `structure.py`: Lewis 540.6 MPa at the
493 N·m knee peak, **SF 2.16** against 1,170 MPa ([generated/structure_checks.md](generated/structure_checks.md)).
R10 §5.1's m1.5 × 14 mm stage 2 is an alternative if the ISO 6336 rating asks for it. Material 18CrNiMo7-6 carburised
58–62 HRC, ground to ISO 1328 grade 6, **crowned with tip relief** (Mk II loads are 1.2–1.3× K1's, R10 §3.3).
Output crossed-roller L10 at walking load: ≈ 990,000 h against 3,000 h required (generated).

### 5.3 Knee structure versus actuator capability

At the knee joint the actuator's 493 N·m becomes **415 N·m (20–40°) to 719 N·m (110°)**. The structural checks are
run at the requirement loads (434 repeated, 540 momentary, 621 N·m X-case thigh moment), not at 719 N·m. Until FEA
clears the full capability, the drive limits actuator torque to

**τ_act ≤ min(493 N·m, 540 / G(θ), 12 kN · r2 · |sin μ(θ)| / G(θ))**,

so the knee joint never exceeds the momentary structural case and the push-rod never carries more than 12 kN (rod-end
C0 ≈ 30 kN / 2.5, buckling SF 3.2) anywhere in 0–130° (hold H7, resolved). `calc/kestrel/structure.py` generates the
table into `data/knee_torque_limit.json` and checks every simulated sample against it
([generated/structure_checks.md](generated/structure_checks.md), "Knee drive torque limit"). The worst sample is the
missed-step drop (SD) at 1.10, then stairs (ST) at 1.24 with the 1.2 margin; the deep squat at 125° is 1.88. The rod
limit only bites near full extension (309 N·m actuator at 0°) and past 110°, where the scenarios do not need it.

## 6. KA-150X: the "strongest" option (documented, not baseline)

Source: R10 §5.3 (all numbers [E]).

| Item | KA-150X | KA-130K (Mk II baseline) |
|---|---|---|
| Motor | KM-150x50-LCS: Ø150 segmented stator (36 wire-EDM tooth segments), fill 0.55, rectangular-wire bobbin coils, N50UH, jacket; Kt 0.230, Km 1.935, T_cont 33.5 N·m, T(200 A) 46.0 N·m | KM-130x50-LC |
| Gear | 2-stage **17:1**: stage 1 z16 / 4 × z18 / z52; stage 2 z18/z18/z54, **m1.75 × 16 mm** (ISO 6336 may push to m2.0 or 18 mm) | 17:1, m1.25 × 18 mm stage 2 |
| Bus / drive | **20S (65 V min loaded, 84 V max), 200 A rms, 150 V-class devices (custom "HV" drive)** | 16S, 150 A HC2 |
| Peak / continuous | **719 / 524 N·m** | 493 / 295 N·m |
| No-load speed | 15.3 rad/s (at 65 V) | 12.5 rad/s (at 52 V) |
| Reflected inertia / mass | 0.667 kg·m² / **6.69 kg** | 0.400 kg·m² / 4.96 kg |

**Margins at Mk II loads (not run by the sizer).** KA-150X keeps the knee's 17:1 ratio, so the four-bar mapping is
identical and the knee margins scale with capability [E]:

* envelope peak 1.44 × 719 / 493 ≈ **2.1**;
* worst-angle continuous 248 × 524 / 295 = 440 N·m → **3.1** against 142 N·m;
* knee no-load at the joint 14.9 × 15.3 / 12.5 ≈ 18 rad/s;
* as the hip (17:1): peak 719 / 364 = 2.0, no-load speed 15.3 / 9.8 = 1.56.

Run `actuators.py` with V_MIN 65 and the "HV" drive before relying on these.

**System implications (why it is not the baseline).** KA-150X is not a drop-in actuator. Choosing it changes:

| Area | Change | Owner |
|---|---|---|
| Battery | 16S → 20S packs (e.g. 2 × 20S4P; ≈ 7.4 kg each scaling 5.90 kg × 80/64 cells, +3 kg total [E]); new BMS configuration, charger and cold-start limits | docs/05 |
| **Every other drive** | Everest S NET is an 8–80 V part (85 V for 100 ms, docs/05). A 20S bus reaches 84 V before regeneration, so **all 22 EV drives must be replaced** with 120–150 V-class drives, not only the 4 leg drives (R10 §3.2.7) | docs/05, docs/12 |
| Power path | the TPS48111 solid-state disconnect (3.5–80 V), 36–75 V DC-DC bricks, brake-chopper thresholds and bus capacitors are all out of range at 84 V | docs/05 |
| Leg drives | 200 A rms custom drive with paralleled 150 V devices; no demonstrated part (R10 §3.2.7) | docs/05 |
| Structure | knee joint up to 719 × 1.46 = **1,050 N·m**: four-bar rod, rod ends (SF 3.40 now at 8.8 kN), knee clevis, thigh plates and shank need redesign, or firmware caps the actuator at the structure rating. The KA-130K flange (935.5 N·m slip) falls to 1.30 × the actuator peak and must grow | docs/03, `structure.py` |
| Cooling | up to 700–800 W per leg at full continuous rating, 0.6–0.8 L/min, a 120 mm-class radiator per leg (R10 §5.3.2). The single torso radiator of docs/03 §9 cannot absorb it | docs/03 |
| Mass | 2 × (6.69 − 4.96) + 2 × (6.69 − 4.76) = **+7.3 kg** actuators [E], + ≈ 0.8 kg loops (R10 §6), + battery. Requirements rise with mass; re-run the loop | `params.py` |
| Build | difficulty 5/5: segmented stator, rectangular-wire coils, 200 A / 150 V drive, larger ground gears (R10 §9) | docs/13 |

R10's decision rule stands: choose KA-150X only for running, jumping or sustained deep-squat carrying beyond the
Mk II scenario set. For the Mk II scenarios the baseline already meets every leg margin.

## 7. KA-110P and KA-90P (planetary, datasheet motors)

| Item | KA-110P (hip roll, waist pitch) | KA-90P (hip yaw, waist yaw, ankles) |
|---|---|---|
| Motor | CubeMars RI115-PH: Kt 0.290, R_LL 134 mΩ, 5.5 / 16.0 N·m [V] | CubeMars RI85-PH: Kt 0.130, R_LL 138.5 mΩ, 2.0 / 5.0 N·m [V] |
| Gear | 29:1 = stage 1 sun z15 / 3 × z30 / ring z75, m0.6 (6.0:1, ring PCD 45 mm in the Ø74 rotor bore) × stage 2 sun z24 / **4** × z34 / ring z92, m1.0, 16 mm face (4.83:1) [E] | 28:1 = stage 1 z15 / 3 × z27 / z69, m0.6 (5.6:1) × stage 2 z18 / 3 × z27 / z72, m0.8, 12 mm face (5.0:1) [E] |
| Stage-2 sun screening (Lewis, 1.25 load sharing) | 427 / 4.83 = 88 N·m sun → 2.30 kN per mesh → ≈ 423 MPa, SF ≈ 2.8 [E] | 129 / 5 = 26 N·m → 1.49 kN → ≈ 518 MPa, SF ≈ 2.3 [E] |
| Output flange | **12 × M5 12.9 on PCD 100** (Mk II; was 10 × M4 on PCD 85), slip 891.0 N·m, SF 2.35 at 379 N·m | 8 × M4 12.9 on PCD 75, slip 310.5 N·m, SF 2.08 |
| Thermal | conduction to structure, derate 0.85 | same |

The flange upgrade is required, not cosmetic: the K1 pattern slips at 10 × 6.9 kN × 0.15 × 0.0425 = **440 N·m** [E],
which is only 1.16 × the Mk II waist momentary (379 N·m, LM) and **below the RI115-PH 29:1 actuator's own 427 N·m
peak**. The new pattern slips at 2.09 × the actuator peak.

Scratch-build alternatives (docs/13 §2): KM-115x32-N50 in KA-110P and KM-85x26-N50-3t in KA-90P. The second gives
6.18 × 28 × 0.92 = 159 N·m peak, 2.01 × 0.85 × 28 × 0.92 = 44 N·m continuous and 343 / 28 = 12.3 rad/s at 28:1
(+0.23 kg per unit; ankle speed margin ≈ 1.27 × 12.3 / 13.1 = 1.19) [E]. Re-run the sizing with measured motor data
before substituting.

## 8. KH-25 / KH-20 (cycloid arm actuators) and KH-14

| Item | KH-25 (shoulder pitch, roll) | KH-20 (shoulder yaw, elbow) | KH-14 (wrist yaw, neck) |
|---|---|---|---|
| Motor | KM-115x32-N50: Ø115, 36s/40p, N50UH 2.8 mm, 3 turns; Kt 0.252, R_LL 70.2 mΩ, 5.49 / 14.2 N·m (@60 A) [E] | KM-85x26-N50-4t: Ø85, 36s/42p, N50UH 2.5 mm, 4 turns; Kt 0.186, R_LL 146 mΩ, 2.01 / 6.18 N·m [E] | KM-50x20, unchanged [E] |
| Gear | **C25**: 31 ring pins on Ø84 mm, Ø5 pins, E 0.9 mm, 2 discs × 8 mm hardened 100Cr6, 8 solid output pins Ø8 (docs/13 §4.2, docs/09 §5.3) | **C20**: Ø68 pin circle, Ø4 pins, E 0.8 mm, 2 discs × 6 mm hardened 100Cr6 (7 mm if nitrided 42CrMo4), 6 output pins Ø6 | Leaderdrive CSG-14-50 component set [V] |
| Gear ratings rated / repeated / avg / momentary | 80 / 160 / 100 / 250 N·m **[VT]** | 52 / 105 / 65 / 160 N·m **[VT]** | 7 / 23 / 9 / 46 N·m [V] |
| **Drive torque limit** | **160 N·m** (motor could make 362) | **105 N·m** (motor 158) | 23 N·m (motor 34) |
| Max input speed | 4,000 rpm (6.2 rad/s × 30 = 1,776 rpm used) | 4,500 rpm | 8,500 rpm |
| Torque sensing | strain-gauge output flexure (4 × HBK XY41, ADS1262): cycloid friction spoils current-based estimation (R10 §3.4) | same | same |
| Backlash | 1–7 arcmin expected [R10 §3.3, S9]; accept | same | ≤ 10 arcsec [V] |

**Brakes (recommended, mass not yet budgeted).** Shoulder pitch: 90 × 1.5 / 30 = **≥ 4.5 N·m** at the motor (back-drive
efficiency ignored, conservative) [E]; R10's 3.4 N·m size covered only the K1 54 N·m hold. Waist pitch:
176 × 1.5 / 29 = **≥ 9.1 N·m** → the 10.8 N·m size from R10's range (spring-applied flat brakes 3.4–10.8 N·m, 12–15 mm
thick [R, R10 S32]).

## 9. KW-L2 wrist actuators (4 units)

**Requirement (Mk II, generated):** wrist pitch 19 N·m repeated, 29 N·m momentary; roll 10 N·m; 6.0 rad/s. Lever arms
r_p = 22 mm, d = 16 mm. Per actuator [E]:

* combined corner 19 / (2 × 0.022) + 10 / (2 × 0.016) = 744 N with rounded torques; **the generated value is ≈ 754 N** and is used below;
* momentary 29 / 0.044 + 10 / 0.032 = **972 N**;
* speed corner 0.5 × 19 / 0.044 = 216 N at 6 rad/s × 22 mm = **132 mm/s**, ≈ 32 W of output;
* stroke ≈ ±(22 sin 70° + 16 sin 35°) = ±30 mm.

The generated catalogue still evaluates the K1 maxon DCX 16 L (106 N continuous, 359 N stall), which does not meet
this. **The KW-L2 design below is the Mk II baseline**; `catalogue.py` has not been updated for it.

| Item | KW-L2 (Option A, preferred) | Option B |
|---|---|---|
| Motor | maxon **ECX FLAT 32 L** high-torque, 24 V, directly on the screw: **98.5 mN·m nominal, 540 mN·m stall, 10,600 rpm no-load, 71 g** [V, maxon product page via generated/bom.md B024; R10 quoted 106 mN·m from the catalogue key data] | ECX FLAT 22 L (32 g, 28.8 mN·m cont., 127 mN·m stall) [V, R5] + 3.9:1 gearhead ≥ 0.25 N·m |
| Force per motor torque | 2π / 2 mm × 0.88 = **2.765 N per mN·m** | 9.70 N per mN·m |
| Continuous force | 98.5 × 2.765 = **272 N**; 60 s hold 1.5 × 272 = 408 N against the AO hold 14 N·m / 0.044 m = 318 N (**1.28**) [E] | 279 N |
| Torque at 754 N (generated) / 972 N | **273 / 351 mN·m = 0.51 / 0.65 of stall** (2.8× / 3.6× nominal, short-time); stall force 540 × 2.765 = 1,490 N [E] | 78 / 100 mN·m (inside 127 stall) |
| Speed corner | 216 N → 78 mN·m; on the linear 24 V line 10,600 × (1 − 78/540) = 9,070 rpm → 302 mm/s, **2.3×** the 132 mm/s requirement [E] | 124 mm/s at the K1 148 N corner (0.94 of 132, R10 §5.9), lower at the Mk II 216 N corner: does not meet the speed requirement without a lower gear ratio |
| Screw | Ø6 × 2 if its catalogue rating is C_a ≥ 2 kN and C_0a ≥ 3 kN (3 × 972 N); otherwise **Ø8 × 2** (same lead, same force constant) [E] | same |
| Supply | **24 V rail**, own 2-axis driver per forearm (F28P65x + DRV8353-class), not the 12 V hand controller | same |
| Power | ≈ 100 W peak per actuator, 4 units → 400 W peak on the 24 V rail (R10 §5.9); average a few W | lower |
| Mass | 0.34 kg budget per unit (params.py), of which the motor is 71 g | 32 g motor |

The 24 V supply is a local buck converter in each forearm fed from the 52 V bus (docs/05, 200 W per arm), so the wrist
peak does not load the central 24 V rail.

## 10. Sensors and safety hardware in every actuator

| Sensor | Part | Purpose |
|---|---|---|
| Output absolute encoder | RLS AksIM-2 (BiSS-C, ≤ 20 bit) [V, R2] | joint angle; motor-minus-output difference for windup torque estimate and backlash monitoring (R10 §3.4) |
| Motor encoder | AksIM-2 ring (KA-130, KA-110, KH-25: hollow rotors) or MagnTek MT6835 (21 bit) [V, R2] | commutation, velocity |
| Torque | KH-25/20/14: strain-gauge flexure; KA: current + friction model + dual-encoder windup | collision detection, force control |
| Temperature | 2 × NTC in the end turns, 1 on the power stage; **+1 on the jacket outlet (KA-130)** | thermal model (online R estimate from FOC voltage, Kt corrected for magnet temperature at −0.12 %/K), I²t derating, temperature headroom sent to the policy (R10 §3.4) |
| Coolant (per leg branch) | supply / return NTC, loop pressure (docs/03 §9) | leak and flow-loss detection → air-only derate |
| Brakes | shoulder pitch, waist pitch (§8) | long static holds without motor heat |

## 11. Phase-0 option: commercial integrated actuators

For software development before the custom units exist (research R1):

| Joint | Phase-0 unit | Main limitation |
|---|---|---|
| Knee, hip pitch | MyActuator X15-450 / X12-320 | 450 / 320 N·m peak; X15-450 is rated at 72 V and X12-320 has a 55 V maximum, so both run slower than Mk II on the mule's bus and well below Mk II continuous torque |
| Hip roll, waist pitch | MyActuator X12-320 | |
| Hip yaw, waist yaw, ankles | RobStride RS04 (CAN only) or MyActuator X8-120 | |
| Arms | MyActuator RH-25 (157 N·m) / RH-20 (80 N·m) | RH-20 has no margin over the 79 N·m elbow requirement at 10 kg per hand |

A Phase-0 mule cannot carry the Mk II work loads. Run it at K1 loads (20 kg box, 5 kg per hand) only.

## 12. Build / modify / buy summary (Mk II)

* **Build:** KM-130x50-LC (4 + 1 spare), KM-115x32-N50 (4), KM-85x26-N50-4t (4), KM-50x20 (4); 4 liquid jackets; all
  planetary sets (14: 4 KA-130, 3 KA-110, 7 KA-90); C25 (4) and C20 (4) cycloid sets (wire-EDM at a job shop); all 26
  housings; HC2 drives (4, from an EPC9186HC-class stage or a custom board).
* **Modify:** CubeMars RI115-PH (3) and RI85-PH (7) frameless kits; Leaderdrive CSG-14 sets (4); maxon ECX FLAT
  KW-L2 motors (4) and hand micro-drives (26).
* **Buy complete:** Everest S NET drives (22), encoders, bearings, brakes, sensors.
