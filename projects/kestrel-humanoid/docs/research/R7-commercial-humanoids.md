# R7 — Commercial humanoid benchmark and K1 Mk II upgrade targets (research notes)

Collected **2026-11-09**; that is the access date for every URL below. The benchmark covers full-size and mid-size
electric humanoids that are sold, leased or in announced production, and compares them with KESTREL K1 as designed
(not built). Manufacturer spec pages, datasheets, model files and spec sheets were used first, then press and
third-party sources.

**Tags.** Every number carries one tag:

| Tag | Meaning |
|---|---|
| **[V*n*]** | verified: manufacturer page, datasheet, spec sheet, brochure or manufacturer-published model file, source *n* |
| **[R*n*]** | reported: press, reseller or third-party database, source *n*. Lower confidence |
| **[E]** | estimate: my inference. The method is given beside it |
| **[K]** | KESTREL K1 design value, from this repo (README, `docs/generated/*`, `docs/01`, `docs/05`). Calculated, not measured. "repo R1" and "repo R3" mean `docs/research/R1-...md` and `R3-...md` |

A blank cell or "—" means no public number was found. No number was filled in to complete a row. Unitree URDF limits
[V5] are the manufacturer's simulation model limits; where they differ from the spec page, both are shown.

---

## (a) Summary comparison

### A1. Body, energy, performance, price

| Robot | Height / mass | DOF | Payload | Battery | Runtime | Speed | Price |
|---|---|---|---|---|---|---|---|
| **KESTREL K1 (baseline)** | 1.75 m / 84 kg est., 92.6 kg design [K] | 30 body + 2 × 10-DOA hands [K] | 20 kg box squat (sim); 5 kg/hand at full reach [K] | 1.68 kWh Li-ion 16S6P, 59.2 V nom / 67.2 V max; slides out on rails, not hot-swap; 10 A charger ≈ 3 h [K] | 3.8 h mixed, 3.3 h walking (sim) [K] | 0.8 / 1.2 m/s walk (sim); 1.5 m/s target [K] | parts ≈ A$196k, prototype [K] |
| Unitree H1 | ~1.80 m / ~47 kg [V1] | 5/leg, 4/arm (+1 torso in URDF [V5]) [V1] | — | 0.864 kWh, 15 Ah, 67.2 V max; "quickly replaceable" [V1] | — | 3.3 m/s [V1] | US$90,000 list [R7] |
| Unitree H1-2 | ~1.78 m / ~70 kg [V1] | 6/leg, 7/arm (+torso) [V1][V5] | — | 0.864 kWh, 67.2 V max [V1] | — | < 2 m/s [V1] | — |
| **Unitree H2** (2025) | 1.82 m / ~70 kg [V4] | 31: 6/leg, 7/arm, 3 waist, 2 head [V4] | arm 15 kg peak / 7 kg rated [V4] | 0.972 kWh, 15 Ah, 75.6 V max (= 18S [E: 75.6/4.2]) [V4] | ~3 h [V4]; H2-X variant claims ~8 h, standing [R8] | — | **US$29,900** [V4] |
| Unitree G1 / G1 EDU | 1.32 m / ~35 kg [V2] | 23 / 23–43 [V2] | arm ~2 kg / ~3 kg [V2] | 13S, 9 Ah, quick-release [V2] | ~2 h [V2] | — | US$13,500 (G1) [V2] |
| Unitree R1 (Air / R1 / EDU) | 1.23 m / 27–29 kg [V3] | 20 / 26 / 26–40 [V3] | arm "about 2 kg" [V3] | quick-release [V3] | ~1 h [V3] | — | US$4,900 / 5,900 [V3] |
| Tesla Optimus (Gen 1 2022, Gen 2 2023; V3 not yet shown) | Gen 1 73 kg [R10]; Gen 2 ≈ 63 kg [E: 73 − 10 kg [R14]] | 28 body actuators + 11-DOF hands [R11][R14] | 2021 concept: 20 kg carry, 68 kg deadlift [R15] | 2.3 kWh, 52 V nom [R10] | "a day's work" (claim) [R9] | Gen 2 +30 % vs Gen 1 [R14] | cost target < US$20k [R9] |
| Figure 02 | 1.68 m / 60 kg [R21] | hands 16 DOF [R21] | 20 kg; 25 kg per hand [R21][R20] | 2.25 kWh, in torso [R59][R20] | 5 h [R21] | — | — |
| **Figure 03** (Oct 2025) | 1.73 m / 61 kg [V17] | — | 20 kg [V17] | 2.3 kWh structural pack [R19]; 2 kW wireless charging through the feet [V18] | 5 h [V17] | 1.2 m/s [V17] | — |
| **Boston Dynamics Atlas** (electric, product) | 1.9 m / 90 kg [V23] | 56 [V23] | **50 kg instant / 30 kg sustained / 20 kg one-handed** [V23] | autonomous self-swap in 3 min; 1.5 h charge [V23] | 4 h; 2 h heavy lifting [V23] | — | — |
| Agility Digit (2023 version) | 1.75 m / ~63.5 kg (5'9", 140 lb) [R28] | — | ≈ 16 kg [E: Digit 5's 50 lb is "+40 %" [R27]] | 2:1 work:charge [R27] | — | — | — |
| Agility Digit 5 (pre-production, Sep 2026) | 1.81 m / 129 kg [R27] | — | 23 kg (50 lb), repeated [V26] | 9 min charge [R27]; 10:1 run:charge [V26] | 90 min [R27]; 20 h per 24 h [V26] | — | — |
| Apptronik Apollo | 1.72 m / 72.5 kg [R30] | — | 25 kg [R29][R30] | hot-swappable packs [R31] | ~4 h per pack [R29][R31] | — | "price of a car"; < US$50k goal [R30][R29] |
| **1X NEO** | 1.68 m / 30 kg [V32] | 75 [E: sum of 22 × 2 hands, 7 × 2 arms, 3 neck, 2 spine, 6 × 2 legs [V32]] | lift 70 kg, carry 25 kg, arm 8.2 kg [V32] | 0.842 kWh; quick charge 6 min per hour of runtime [V32] | 4 h [V32] | walk 1.4 m/s, run 6.2 m/s [V32] | US$20,000 or US$499/month [R33] |
| Fourier GR-1 | 1.65 m / ~52 kg [V34] | up to 44 [V34] | ~3 kg per hand [V34] | 483 Wh, 40 V nom [V34] | ~60 min (45 min walking) [V34] | 5 km/h [V34] | — |
| Fourier GR-2 | 1.75 m / ~63 kg [V35] | up to 53 [V35] | ~3 kg per hand [V35] | ~950 Wh, 39.6 V nom, pack ≤ 9 kg [V35] | ~2 h; 2 h charge [V35] | 5 km/h [V35] | — |
| Fourier GR-3 (Aug 2025) | 1.65 m / ~71 kg [V36] | up to 55 [V36] | ~3 kg per hand [V36] | **702 + 234 Wh, hot-swappable**, 46.8 V nom [V36] | ~3 h; 1.5 h charge [V36] | 6.1 km/h [V36] | US$119,995 reseller [R38] |
| Fourier N1 | 1.3 m / ~39 kg [V37] | 23 [V37] | — | 475 Wh, 39.6 V nom [V37] | ~2 h; 3.5 h charge [V37] | 2.7 km/h walk, 10.8 km/h run; 3.5 m/s measured [V37] | — |
| UBTech Walker S2 | 1.76 m / 65–73 kg (sources conflict) [R41] | 52 [R41] | 15 kg over a 0–1.8 m workspace [V39] | dual battery, **autonomous swap ≤ 3 min** [V39] | 2–2.5 h per battery [R41] | 2 m/s [R41] | — |
| Booster T1 | 1.18 m / 30 kg [R42] | 23 / 31 / 41 [R42] | — | 10.5 Ah [R42] | 2 h walk / 4 h stand [R42] | — | €39,000 list [R42] |
| Booster T2 (Jul 2026) | height conflicting [R43] | — | — | 48 V, 10 Ah; magnetic charge port [R43] | ~2 h walking [R43] | — | — |
| EngineAI PM01 | 1.40 m / ~44 kg [V44] | 24 [V44] | — | quick-release; 54.6 V charger (= 13S [E]) [V44] | 2 h; 2 h charge [V44] | > 2 m/s (hardware) [V44] | ≈ US$12,000 at launch [R48] |
| EngineAI SE01 | 1.70 m / 55 kg [R47] | 32 [R47] | — | quick-release [V45] | 2 h [V45] | — | CNY 88,000 early-bird, CNY 188,000 list [R60] |
| **EngineAI T800** (Dec 2025) | 1.73 m / 75–85 kg [V46] | 25–46 by edition [V46] | 5 kg per hand [V46] | modular solid-state Li, quick-release [V46] | 3–5 h [V46] | ≥ 2 m/s [V46] | US$40,500 [R49] |
| Kepler K2 "Bumblebee" | 1.75 m / 75 kg [R50] | 52 [R50] | **30 kg two-arm, 15 kg per arm** [R50] | 2.33 kWh [R51] | 8 h on a 1 h charge (claim) [R50] | > 1.1 m/s [R51] | US$30k base [R50]; RMB 248,000 [R52] |
| AgiBot A2 | 1.69 m / 69 kg [V54] | 40+ [V54] | — | 700 Wh, swappable [V54] | 2 h [V54] | — | — |
| Xpeng IRON (Nov 2025 gen.) | — | 76 [R56] | — | solid-state [R55] | — | — | — |

### A2. Joints, actuation, hands

Torques in N·m at the joint unless noted. Joint speed in rad/s.

| Robot | Knee peak | Hip peak | Ankle peak | Arm / waist peak | Joint speed | Actuation / motor | Hands |
|---|---|---|---|---|---|---|---|
| **K1** | actuator 395 / 139 cont.; joint 340 (20–40°) to 565 (120°) [K; E: × four-bar G 0.86–1.43] | pitch 399 / 123 cont.; roll 276 / 73 cont. [K] | ≈ 276 pitch, ≈ 191 roll [E: 2 × 106 N·m × r_p/r_c or d/r_c from [K]] | shoulder 175, elbow 188 (46 / 64 cont.); waist pitch 276 [K] | actuator no-load: knee 11.0, hip 10.3 at 52 V [K] | custom Ø130 frameless + 14:1 planetary (knee, hip pitch); 32:1 / 23:1 planetary; 50:1 strain-wave arms [K] | 10 DOA ball-screw linkage, 0.92 kg; targets ≥ 10 N tip, ≥ 50 N grasp, ≥ 5 kg [K] |
| Unitree H1 | ~360 [V1] (URDF 300 [V5]) | ~220 [V1] (URDF 200) | ~59 [V1] | arm ~75 [V1] | URDF: knee 14, hip 23, ankle 9 [V5] | internal-rotor PMSM; M107 joint 360 N·m, 1.9 kg = 189 N·m/kg [V1] | optional [V1] |
| Unitree H1-2 | ~360 [V1] | ~220 [V1] | ~75 × 2 [V1] | shoulder/elbow ~120, wrist ~30, waist ~220 [V1] | URDF wrist 31.4 [V5] | as H1 [V1] | optional Dex5-1 [V1]: 16 active DOF, 10 N tip, 1.0 kg [V6] |
| Unitree H2 | leg ≤ 360 [V4] | (leg ≤ 360) [V4] | — | arm ≤ 120 [V4] | — | — | EDU: hand options [V4] |
| Unitree G1 / EDU | 90 / 120 [V2] (URDF 139 [V5]) | URDF 88 [V5] | URDF 35 [V5] | URDF 25; wrist pitch/yaw 5 [V5] | URDF: knee 20, hip 32, arm 37 [V5] | internal-rotor PMSM, crossed-roller output, dual encoders, local air cooling, hollow wiring [V2] | Dex3-1: 7 DOF, 0.71 kg, 33 pressure sensors, 10–2,500 g range [V6] |
| Tesla Optimus | leg linear class 8,000 N [R11] | rotary class 180 [R11] | — | rotary 20 / 110; linear 500 / 3,900 N [R11] | — | 14 rotary (frameless + strain-wave), 14 linear (planetary roller screw) [R11] | Gen 2: 11 DOF, tactile all fingers [R14]; V3: 22 DOF, tendons from forearm [R16] |
| Figure 03 | — | — | — | — | "2× faster" than F.02 [V18] | custom motors integrated with drivetrains [R20] | fingertip tactile 3 g threshold, palm camera [V18] |
| Atlas | — | — | — | — | "continuous" range of motion [V22] | production actuators from Hyundai Mobis [R25] | 4 fingers, 13 DOF, tactile; carries > 45 kg [R24] |
| Digit 5 | — | — | — | — | — | cycloidal leg actuators [R27] | 2-finger gripper on swappable ISO flange [R27] |
| Apollo | — | — | — | — | — | linear + rotary [R29] | 0–1 DOF hand at launch [R30] |
| 1X NEO | — | — | — | — | hand speed 8.0 m/s [V32] | tendon drive, low inertia [V32] | 22 DOF, IP68 [V32] |
| Fourier GR-1 | max any joint 230 [V34] | — | — | — | — | 32 FSA actuators [V34] | 6 DOF [V34] |
| Fourier GR-2 | 366 [V35] | pitch 366, roll 95, yaw 54 [V35] | pitch 54, roll 30 [V35] | shoulder 74 / 74 / 43, elbow 43, wrist 17, waist 74 [V35] | — | FSA 2.0; 23-bit dual encoders on legs [V35] | 6 std / 12 optional [V35] |
| Fourier GR-3 | 366 (440 "max" in core table) [V36] | pitch 366, roll/yaw 140 [V36] | 59 [V36] | shoulder 74, elbow 43, waist 140 / 109 [V36] | — | — | 6 std / 12 optional [V36] |
| Fourier N1 | 90 [V37] | pitch 90, roll/yaw 54 [V37] | 30 [V37] | shoulder 54 / 30 / 30, elbow 30 [V37] | — | dual 16/14-bit encoders [V37] | — |
| Walker S2 | — | — | — | waist ±162° yaw, 125° torso pitch [V39] | — | — | 11 DOF [R41] |
| Booster T1 | 130 [R42] | — | — | — | — | dual encoders [R42] | optional Inspire RH56DFX: 6 DOF, fingertip ≥ 3 kg, 0.8 kg [R42] |
| EngineAI PM01 | max any joint 164; 145 N·m/kg [V44] | — | — | — | — | internal-rotor PMSM, crossed roller [V44] | — |
| EngineAI SE01 | max 330 [R47] | — | — | — | — | in-house planetary, strain-wave and linear [V45] | 6 DOF [V45] |
| EngineAI T800 | max any joint 450 [V46] | — | — | — | — | internal-rotor PMSM; active air cooling of all leg joints [V46] | 7 DOF, tactile, 5 kg [V46] |
| Kepler K2 | max any joint > 220 [R51] | — | — | — | — | planetary roller-screw linear + rotary [R50] | 11 DOF, 25 force points per finger, 6-axis wrist F/T [R50] |
| AgiBot A2 | integrated joint 512 peak [V54] | — | — | — | — | — | dexterous hand, no figures [V54] |
| Xpeng IRON | — | — | — | — | — | biomimetic spine and "muscle" system [R55] | 22 DOF [R55] (21 per [R56]) |

---

## (b) Per-robot notes

### Unitree H1 / H1-2 / H2 / H2-X
- H1: 47 kg, knee ~360, hip ~220, ankle ~59, arm ~75 N·m; 0.864 kWh at 67.2 V max (the same 16S class as K1); 3.3 m/s
  [V1]. The M107 joint makes 360 N·m at 1.9 kg, which is **189 N·m/kg** [V1]. URDF limits: knee 300 N·m / 14 rad/s,
  hip 200 N·m / 23 rad/s [V5].
- H1-2: 70 kg, 7-DOF arms (shoulder/elbow ~120, wrist ~30 N·m), 2-actuator ankle ~75 × 2 N·m, waist ~220 N·m [V1].
- H2: 1.82 m / 70 kg, 31 DOF with a 3-DOF waist, arm 15 kg peak / 7 kg rated, 0.972 kWh at **75.6 V max (18S)**,
  ~3 h, US$29,900 [V4]. H2-X (shown 2026-10-21) claims ~8 h, but only standing, with no full spec sheet [R8].
- Copy: high bus voltage (18S); compact high-torque-density joint modules; quick-release battery on H1.

### Unitree G1 and R1
- G1: 1.32 m / 35 kg; knee 90 N·m (EDU 120) [V2]; URDF per joint: hip 88, knee 139, ankle 35, arm 25 N·m;
  speed limits hip 32, knee 20, arm 37 rad/s [V5]. 13S 9 Ah quick-release smart battery, ~2 h, US$13.5k [V2].
  The page lists only the G1 and G1 EDU; EDU sub-variants (hands, compute) are configured through sales [V2].
- Hands (2026 brochure): Dex3-1 has 7 DOF, weighs 0.71 kg and carries 33 pressure sensors (10–2,500 g). Dex5-1 has
  16 active DOF, 10 N fingertip force, ±1 mm repeatability and weighs 1.0 kg. The Dex1-1 gripper gives 5–120 N and holds
  20 kg in a conforming grasp [V6].
- R1: 27–29 kg, 1 h, quick-release battery, US$4,900–5,900 [V3].
- Copy: **full hollow joint wiring**, quick-release smart battery, dual encoders, crossed-roller output bearings [V2][V3].

### Tesla Optimus
- AI Day 2022 (Gen 1): 73 kg, 2.3 kWh at 52 V nominal [R10]. 28 structural actuators in six designs: rotary 20 / 110
  / 180 N·m (frameless motor + strain-wave) and linear 500 / 3,900 / 8,000 N (planetary roller screw) [R11]. Cost target
  < US$20k [R9].
- Gen 2 (Dec 2023): 10 kg lighter, 30 % faster walk, 11-DOF hands with tactile sensing on every finger, 2-DOF neck, foot
  force/torque sensing, articulated toes [R14].
- Gen 3 / V3: Tesla planned a Q1 2026 unveil and a production start before the end of 2026 [V12]. The unveil was later
  pushed "closer to production" [R13]. Patent coverage describes a 22-DOF tendon-driven hand with its actuators in the
  forearm [R16]. **No V3 body spec was public on 2026-11-09.**
- A knee torque cannot be derived from the 8,000 N linear class without the lever arm, which is not public.
- Copy: few actuator classes (six designs for 28 joints) for cost; tactile sensing on every finger.

### Figure 02 / Figure 03
- F.02: 1.68 m / 60 kg, 20 kg payload, 5 h, 16-DOF hands [R21]; 25 kg per hand, six RGB cameras, all cabling inside the
  limbs [R20]; 2.25 kWh [R59]. Figure 03 is "9 % less mass" than F.02 [V18], which suggests F.02 ≈ 67 kg [E].
- F.03: 1.73 m / 61 kg, 20 kg payload, 5 h, 1.2 m/s [V17]. It charges at **2 kW wirelessly through coils in the feet**,
  the battery is UN38.3 certified, the fingertips sense 3 g, there are palm cameras, camera FOV is 60 % wider, and
  actuators are 2× faster. Soft goods are washable and come off without tools, with foam over pinch points. Data
  offloads at 10 Gbps over mmWave [V18].
- F.03 battery: 2.3 kWh, die-cast and stamped structural pack, 78 % cheaper than F.02's, with cell fusing and a flame
  arrestor; designed to UL 2271 [R19].
- Copy: **structural battery**, foot inductive charging, washable tool-free covers, palm cameras, fingertip tactile.

### Boston Dynamics Atlas (electric, production)
- Spec sheet (rev. 2026-10-15): 1.9 m / 90 kg, 56 DOF, 2.3 m reach. Payload **50 kg instant, 30 kg sustained, 20 kg
  one-handed**. 4 h runtime, 2 h when lifting heavy loads. **Autonomous battery swap in 3 min**, 1.5 h recharge.
  **IP67**, −20 to 40 °C. Tactile fingers and palm, 360° cameras, fenceless guarding, human detection. Modular,
  field-replaceable parts and customer self-repair certification [V23]. Joints with "continuous" range of motion [V22].
- New hand (Oct 2026): 4 fingers, 13 DOF (3 per finger, 4 on the thumb), encapsulated direct actuators, tactile skin;
  carries a > 45 kg (100 lb) load [R24]. Hyundai Mobis supplies the production actuators [R25].
- Copy: **IP67 + cold-rated**, self battery swap, continuous-rotation joints, field-repair programme. It is the payload
  benchmark.

### Agility Digit / Digit 5
- 2023 Digit: 1.75 m, ~63.5 kg [R28], ≈ 16 kg payload [E from R27], 2:1 work:charge [R27].
- Digit 5 (unveiled 2026-09-15; early access H1 2027): 1.81 m / 129 kg, new legs on in-house **cycloidal**
  actuators, 90 min runtime, 9 min charge, an independent safety controller and CE marking planned [R27]. 23 kg payload,
  2.2 m reach, 10:1 run:charge, 20 working hours per 24 [V26]. Grippers are swappable on **ISO-standard flanges** [R27].
- Copy: **fast opportunity charging** instead of large packs; ISO tool flange; independent safety controller.

### Apptronik Apollo
- 1.72 m / 72.5 kg, 25 kg payload, ~4 h on a swappable pack [R30][R29]. The packs are hot-swappable, 4 h each [R31].
  Linear and rotary actuators with a third fewer parts and a third of the assembly time [R29]. Jabil builds it.
- Copy: hot-swap battery; linear actuators designed for low part count.

### 1X NEO
- 1.68 m / 30 kg. Lifts 70 kg, carries 25 kg, arm payload 8.2 kg. 0.842 kWh, 4 h, quick charge of 6 min per hour of
  runtime, 22 dB noise. Walks at 1.4 m/s and runs at 6.2 m/s (claims). Tendon drive; **22-DOF hands rated IP68**;
  Jetson Thor (2,070 FP4 TFLOPS); 8.85 MP 90 Hz stereo fisheye cameras; washable nylon suit [V32]. US$20k or
  US$499/month [R33].
- Copy: quiet, low-inertia, back-drivable drive for working near people; IP68 hands; washable suit.

### Fourier GR-1 / GR-2 / GR-3 / N1
- GR-1: 52 kg, max joint 230 N·m, 483 Wh, ~60 min, 5 km/h, 32 FSA actuators [V34].
- GR-2: 63 kg. Per-joint limits: hip pitch and knee 366, hip roll 95, ankle pitch 54, shoulder 74, elbow 43, wrist 17
  N·m. ~950 Wh at 39.6 V, ~2 h, 5 km/h [V35]. (The core table says 436 N·m "max"; the per-joint table tops out at 366.)
- GR-3 (2025 care robot): 71 kg, hip pitch and knee 366, hip roll/yaw 140, waist yaw 140, ankle 59 N·m.
  **702 + 234 Wh hot-swappable**, 46.8 V, ~3 h, 1.5 h charge, 6.1 km/h, touch sensing [V36]. US$119,995 reseller [R38].
- N1: 39 kg, knee/hip pitch 90 N·m, 475 Wh, measured 3.5 m/s run [V37]. Open-source hardware.
- Copy: **two-pack hot swap** (a small second pack keeps the robot alive during the swap); low 11S–13S bus.

### UBTech Walker S2
- 52 DOF, 1.76 m [R41]. 15 kg over a 0–1.8 m workspace, ±162° waist yaw, 125° torso pitch, **autonomous battery swap
  ≤ 3 min with dual-battery balancing** (it swaps without shutting down [R40]), RGB stereo depth [V39]. 11-DOF hands,
  2 m/s, 2–2.5 h per battery [R41]. Weight is reported as 65–73 kg; joint torques are not public.
- Copy: self-swap with dual packs; **±162° waist yaw** to pick behind and place without stepping.

### Booster T1 / T2
- T1: 1.18 m / 30 kg, knee 130 N·m, 10.5 Ah, 2 h walking, AGX Orin 200 TOPS; optional Inspire hand with ≥ 3 kg
  fingertip force; €39,000 list [R42].
- T2 (Jul 2026): Jetson Thor, 48 V 10 Ah pack, ~2 h walking, magnetic charge port, charges while in use [R43].
  Height reports conflict, so it is not tabulated.

### EngineAI PM01 / SE01 / T800
- PM01: 1.40 m / 44 kg, max 164 N·m, **145 N·m/kg peak torque density**, 2 h, quick-release, Orin NX [V44];
  ≈ US$12k [R48].
- SE01: 1.70 m / 55 kg, 330 N·m, 32 DOF [R47]; in-house planetary, strain-wave and linear joints, quick-release battery,
  2 h [V45]. The page gives "1000 mAh", which looks like a typo [V45].
- T800: 1.73 m / 75–85 kg, **450 N·m** max joint, aluminium and titanium structure, **active air cooling of every leg
  joint**, modular quick-release solid-state lithium battery, 3–5 h, ≥ 2 m/s, AGX Orin (Thor on request), 7-DOF tactile
  hands carrying 5 kg [V46]. US$40,500 [R49].
- Copy: active leg-joint cooling; quick-release battery.

### Kepler K2 "Bumblebee"
- 1.75 m / 75 kg, 52 DOF, hybrid **planetary roller-screw linear + rotary** actuators, "near-zero static power", 8 h on
  a 1 h charge, 30 kg two-arm and 15 kg one-arm payload, 11-DOF hands with 25 force points per finger, 6-axis wrist F/T,
  100 TOPS, US$30k base [R50]. 2.33 kWh, > 220 N·m max joint, > 1.1 m/s [R51]. RMB 248,000; 81.3 % efficiency claim
  [R52].
- Copy: low holding power (roller screws that hold load without current); a 2.3 kWh class pack.

### AgiBot A2 and Xpeng IRON (2025–2026 entrants)
- AgiBot A2: 1.69 m / 69 kg, 40+ DOF, **integrated joint peak torque 512 N·m**, 700 Wh swappable, 2 h, 360° LiDAR plus
  six HD cameras, **PL d safety** [V54].
- Xpeng IRON (Nov 2025 generation): 22-DOF hands, solid-state battery, biomimetic spine, flexible skin, three Turing
  chips (2,250 TOPS); mass production targeted for the end of 2026 [R55]. 76 DOF; deliveries in 2027 [R56].
- Copy: PL d certified safety; 500 N·m-class joints.

---

## (c) Gap analysis vs KESTREL K1

K1 numbers are from `README.md`, `docs/generated/actuator_family.md`, `joint_requirements.md`, `mass_budget.md` and
`power_budget.md`, and `docs/01`/`docs/05` [K]. K1 joint torque at the knee = actuator torque × four-bar ratio G
(0.86 at 20–40°, 1.43 at 120°) [K]. Peer ratios below divide the manufacturer's peak torque by the manufacturer's mass
[E]. Peers publish peaks only, so the comparisons use peak torque.

### C1. Joint torque and torque-to-mass

| Metric | K1 | Peers (ratio method [E]) | Verdict |
|---|---|---|---|
| Knee peak | 340 N·m near extension, 565 N·m at 120°; actuator 395 [K][E] | AgiBot A2 512 (joint unspecified) [V54]; T800 450 (any joint) [V46]; GR-2/GR-3 366 [V35][V36]; H1/H2 360 [V1][V4] | **Parity**: slightly below H1/H2 near extension, above in deep flexion |
| Knee peak / robot mass | 4.7 N·m/kg (395/84); 4.3 at 92.6 kg; 4.0 at the joint near extension | H1 7.7; A2 7.4; GR-2 5.8; T800 5.3–6.0; H2 5.1; GR-3 5.2; GR-1 4.4; T1 4.3; G1 EDU 3.4 | **Weaker** than full-size peers (heavy robot) |
| Hip pitch peak | 399 [K] | GR-2/GR-3 366; H1/H1-2 220 [V1] | **Stronger** |
| Hip pitch / mass | 4.75 | GR-2 5.8; GR-3 5.2; H1 4.7; H1-2 3.1; G1 2.5 | Parity |
| Hip roll | 276 [K] | GR-3 140; GR-2 95 | **Stronger** (≈ 2×) |
| Ankle pitch | ≈ 276 [E] (3.3 N·m/kg) | H1-2 2 × 75 = 150 combined [E] (2.1); H1 59 (1.3); GR-3 59 (0.8); G1 35 (1.0) | **Much stronger**: full CoP authority |
| Waist pitch | 276 [K] | H1-2 waist 220; GR-3 109 | **Stronger** |
| Shoulder / elbow peak | 175 / 188 [K] (shoulder 2.1 N·m/kg) | H1-2 / H2 120 (1.7); H1 75 (1.6); GR-2/3 74 / 43 (1.1); G1 25 (0.7) | **Stronger at peak**. But continuous torque is only 46 / 64 N·m, which limits sustained payload (C3) |

### C2. Actuator quality: torque density, continuous fraction, speed

| Metric | K1 | Peers | Verdict |
|---|---|---|---|
| Leg main actuator torque density | KA-130K 395 N·m / 4.22 kg = **94 N·m/kg**; KA-130H 106; KA-110P 152; KA-90P 77 [K][E] | Unitree M107 **189** [V1]; EngineAI PM01 145 [V44]; MyActuator X12-320 135, X15-450 129 (repo R1) | **Weaker**: knee and hip pitch are at 50–56 % of Unitree's M107 |
| Continuous / peak | knee 139/395 = 35 %; hip 31 % (ducted air) [K] | MyActuator X12-320 85/320 = 27 % (repo R1); most humanoid makers publish no continuous rating | **Stronger** where data exist; K1 is the only design here with sized continuous ratings |
| Hip pitch speed | 10.3 rad/s no-load at 52 V [K] | H1 23 [V5]; G1 32 [V5] | **Weaker** (≈ 0.45× H1) |
| Knee speed | actuator 11.0 rad/s; joint ≈ 12.8 near extension [E: 11.0/0.86] | H1 14 [V5]; G1 20 [V5] | Weaker |
| Bus | 16S: 59.2 V nom, 67.2 V max [K] | H2 18S, 75.6 V max [V4]; H1 67.2 V [V1]; GR-3 46.8 V nom [V36] | Mid. H2 shows the move to 18S |

### C3. Payload, mass, reach

| Metric | K1 | Peers | Verdict |
|---|---|---|---|
| Whole-body payload | 20 kg box squat (sim) = 0.24 × robot mass [K][E] | Atlas 50 kg instant / 30 kg sustained (0.56 / 0.33) [V23]; Kepler 30 kg (0.40) [R50]; Apollo 25 kg (0.34) [R30]; Figure 03 20 kg (0.33) [V17]; Digit 5 23 kg (0.18) [V26][R27]; Walker S2 15 kg [V39] | **Weaker** than the industrial leaders |
| One-arm payload at reach | 5 kg per hand (static, sim) [K] | Atlas 20 kg one-handed [V23]; H2 15 kg peak / 7 kg rated [V4]; Kepler 15 kg per arm [R50]; NEO 8.2 kg [V32] | **Weaker**. The arm's peak torque would allow ≈ 25 kg momentarily [E: (175 − 12 N·m arm self-load) / (9.81 × 0.65 m)], but shoulder continuous torque of 46 N·m caps sustained load at ≈ 5 kg |
| Mass at 1.65–1.82 m | 84 kg est. / 92.6 kg design [K] | Figure 03 61; H2 70; GR-3 71; Apollo 72.5; Kepler 75; T800 75–85; Atlas 90 (1.9 m); Digit 5 129 | **Heavier** than all but Atlas and Digit 5 |

### C4. Energy, runtime, swap, charging

| Metric | K1 | Peers | Verdict |
|---|---|---|---|
| Pack energy | 1.68 kWh [K] | Kepler 2.33 [R51]; Figure 03 2.3 [R19]; Optimus 2.3 [R10]; F.02 2.25 [R59]; H2 0.972 [V4]; GR-2 0.95 [V35]; GR-3 0.936 [V36]; NEO 0.842 [V32]; A2 0.70 [V54] | Upper middle |
| Wh per kg of robot | 20 [E] | Figure 03 37.7; Optimus (2022) 31.5; Kepler 31.1; NEO 28.1; H1 18.4; GR-2 15.1; H2 13.9; GR-3 13.2; A2 10.1 [E] | Middle; the leaders carry about 1.5–1.9× more energy per kg of robot |
| Runtime | 3.8 h mixed / 3.3 h walking [K] | Kepler 8 h (claim) [R50]; Figure 03 5 h [V17]; Atlas 4 h (2 h heavy) [V23]; Apollo 4 h per pack [R29]; NEO 4 h [V32]; H2 3 h [V4]; GR-3 3 h [V36]; A2 2 h [V54]; Digit 5 1.5 h [R27] | Middle |
| Average power implied | 384 W (1.46 kWh usable / 3.8 h) [E] | Figure 03 ≈ 460 W; H2 ≈ 324 W; GR-3 ≈ 312 W; Kepler ≈ 291 W; NEO ≈ 210 W [E: pack ÷ rated runtime] | **Parity**. K1's runtime gap comes from pack size and swap strategy, not efficiency |
| Swap | rails, swapped powered down [K] | Atlas self-swap 3 min [V23]; Walker S2 self-swap ≤ 3 min, dual packs, no shutdown [V39][R40]; GR-3 hot-swap [V36]; Apollo hot-swap [R31]; G1/R1/PM01/T800 quick-release [V2][V3][V44][V46] | **Weaker** |
| Charging | 10 A at 67.2 V ≈ 0.67 kW, ≈ 3 h, supervised [K] | Figure 03 2 kW wireless via feet [V18]; Digit 5 9 min charge [R27]; NEO 6 min per hour of runtime [V32]; Atlas 1.5 h [V23]; GR-3 1.5 h [V36] | **Weaker** |

### C5. Hands, speed, environment, compute, safety

| Metric | K1 | Peers | Verdict |
|---|---|---|---|
| Hand DOF | 10 DOA [K] | NEO 22 [V32]; Optimus V3 22 [R16]; IRON 22 [R55]; Dex5-1 16 [V6]; F.02 16 [R21]; Atlas 13 [R24]; Kepler/Walker S2 11 [R50][R41] | **Weaker** |
| Hand force / payload | targets ≥ 10 N tip, ≥ 50 N grasp, ≥ 5 kg [K] | Atlas hand > 45 kg [R24]; F.02 25 kg per hand [R20]; Inspire RH56DFX ≥ 3 kg (≈ 29 N) tip [R42]; Dex5-1 10 N tip [V6]; T800 5 kg [V46] | **Weaker** in payload; fingertip on par with Dex5-1 |
| Tactile | Contactile 3D tips (±0.04–0.08 N) + magnetic palm skin (docs/06) [K] | Figure 03 3 g threshold + palm camera [V18]; Dex3-1 33 sensors, 10–2,500 g [V6]; Kepler 25 points per finger [R50] | Parity on sensing; no palm camera |
| Walking / running | 0.8 / 1.2 m/s walk (sim) [K] | H1 3.3 m/s [V1]; N1 3.5 m/s [V37]; NEO 6.2 m/s run (claim) [V32]; Walker S2 2 m/s [R41]; T800 ≥ 2 m/s [V46]; Figure 03 1.2 m/s [V17] | **Weaker**: no running gait, limited by hip speed (C2) |
| Ingress / temperature | IP54 target [K]; no low-temperature rating | Atlas **IP67, −20 to 40 °C** [V23]; NEO hands IP68 [V32] | **Weaker** |
| Waist yaw range | ±70° [K: params.py] | Walker S2 ±162° [V39]; G1 ±155° [V2]; Atlas continuous [V22] | **Weaker** |
| Compute | Jetson AGX Thor T5000 + PREEMPT_RT controller + safety MCU [K] | NEO Thor [V32]; Booster T2 Thor [R43]; IRON 2,250 TOPS [R55]; Kepler 100 TOPS [R50]; PM01 Orin NX [V44] | **Parity / top tier** |
| Functional safety | STO on every drive, independent SIL3-class MCU (design) [K] | AgiBot A2 PL d [V54]; Digit 5 independent safety controller, CE planned [R27]; Atlas fenceless guarding and human detection [V23] | Parity in architecture; not certified |
| Price | parts ≈ A$196k (one-off prototype) [K] | H2 US$29.9k [V4]; NEO US$20k [R33]; Kepler US$30k [R50]; T800 US$40.5k [R49]; G1 US$13.5k [V2] | Not comparable (one-off vs volume). It shows how far below K1's parts cost commercial prices now sit |

**K1 is stronger in:** hip roll, ankle, waist and peak arm torque (often about 2× peers per kg); sized continuous
torque and thermal design; compute; safety architecture; and design traceability (every limit derived from scenarios).

**K1 is weaker in:** actuator torque density (≈ 0.5× Unitree), joint speed (hip ≈ 0.45× H1), mass, whole-body and
one-arm payload ratings, hand DOF and hand payload, battery swap and charging, ingress protection, waist range and
running.

---

## (d) Ranked upgrade recommendations for K1 Mk II

Ranked by value for real work (payload, uptime, manipulation, robustness), then by how hard each is. Each target
is quantified and names at least one robot that shows it can be done. Estimates [E] state their method.

| # | Upgrade | Mk I [K] | **Mk II target** | Shown achievable by | How / notes |
|---|---|---|---|---|---|
| 1 | **Whole-body payload** | 20 kg squat; 5 kg/hand at reach | **30 kg sustained two-handed (floor to chest, carried on stairs), 50 kg momentary lift, 15 kg one-handed** | Atlas 50 / 30 / 20 kg [V23]; Kepler 30 kg two-arm, 15 kg per arm [R50]; Apollo 25 kg [R30] | Add scenarios SQ30, ST+30 kg and AH15 to `calc/kestrel/scenarios.py`. Scaling K1's stair case by mass (122.6/92.6 = 1.32) gives knee ≈ 465 N·m repeated and ≈ 149 N·m continuous [E], which drives #2 and #10. Waist pitch ≈ 255 N·m repeated [E: +10 kg × 0.4 m lever × 1.2] stays inside KA-110P's 276 N·m |
| 2 | **Knee and hip-pitch actuators** | 395–399 N·m peak at 3.78–4.22 kg (94–106 N·m/kg) | **≥ 480 N·m peak, ≥ 170 N·m continuous, ≤ 3.2 kg (≥ 150 N·m/kg)** | AgiBot A2 512 N·m [V54]; T800 450 N·m [V46]; GR-3 366 / "440" [V36]; torque density: Unitree M107 189 N·m/kg [V1], PM01 145 N·m/kg [V44] | 480 covers #1 at the stair knee angle (G ≈ 0.98) [E]. Integrate the drive into the housing, use a thin-wall Al/Mg case, hollow shaft and a higher-pole-count KM-130 stack. Torque × speed per kg (480 × 16 / 3.2 = 2,400) is close to M107's (360 × 14 / 1.9 = 2,650) [E], so this is state of the art but already done |
| 3 | **Hot-swappable battery, larger pack** | 1.68 kWh, rails, powered-down swap | **≥ 2.3 kWh in two hot-swappable halves (e.g. 2 × 18S4P P50B = 2.59 kWh), swap ≤ 3 min without shutdown, ≥ 5 h mixed** | Atlas 3 min self-swap [V23]; Walker S2 ≤ 3 min, dual packs [V39]; GR-3 702 + 234 Wh hot-swap [V36]; Apollo hot-swap [R31]; Figure 03 / Kepler 2.3 kWh [R19][R51] | Runtime ≈ 2.59 × 0.9 / 0.384 kW = 6.1 h [E]; cells +3.4 kg [E: 144 × 71 g vs 6.8 kg]. Either half alone must carry the 2.7 kW peak (18S4P → ≈ 10 A/cell at 2.7 kW / 66.6 V / 4 [E], inside the P50B's 60 A continuous rating (repo R3)). Add BMS hand-off and ideal-diode OR-ing |
| 4 | **Hands** | 10 DOA; ≥ 10 N tip, ≥ 50 N grasp, ≥ 5 kg | **≥ 13 active DOF with a 4-DOF thumb; ≥ 15 N fingertip; ≥ 200 N power grasp; ≥ 20 kg hook/handle hold per hand; tactile threshold ≤ 5 g; palm camera** | Atlas 13 DOF, > 45 kg [R24]; F.02 16 DOF, 25 kg per hand [R20][R21]; Dex5-1 16 DOF, 10 N, 1.0 kg [V6]; Figure 03 3 g + palm camera [V18]; NEO 22 DOF [V32]; Inspire ≈ 29 N tip [R42] | 200 N ≈ 20 kg × 9.81 / (2 × μ 0.5) [E]. Keep K1's ball-screw linkage (self-locking holds without power) and add a thumb opposition DOF and finger abduction. Hand mass ≤ 1.2 kg (Dex5-1 is 1.0 kg) |
| 5 | **Sustained arm payload** | shoulder 46 N·m continuous → 5 kg at reach | **10 kg per hand sustained at full reach; shoulder pitch ≥ 80 N·m continuous** | H2 15 kg peak / 7 kg rated [V4]; Atlas 20 kg one-handed [V23]; Kepler 15 kg per arm [R50] | 10 kg × 9.81 × 0.65 m (upper arm 0.30 + forearm 0.26 + half hand 0.09 [K]) + ≈ 12 N·m arm self-load ≈ 76 N·m [E]. CSG-25-50's 72 N·m average-torque limit (repo R1 table D) rules out a motor swap alone, so move shoulder pitch/roll to CSG-32-50 (140 N·m average, 0.89 kg) with ILM85x26 or ILM115x25 |
| 6 | **Ingress and temperature** | IP54 target, no cold rating | **IP65 body, IP67 below the knee and hands; operate −20 to 40 °C** | Atlas IP67, −20 to 40 °C [V23]; NEO hands IP68 [V32] | Sealed actuator output seals, IP67 blind-mate connectors (K1 already uses IP67 SurLok for power [K]), pack heater for cold starts, cooling through sealed heat exchangers instead of open ducts (pairs with #10) |
| 7 | **Quick-change wrist and grippers** | fixed hand | **ISO 9409-1 flange with 60 V power + EtherCAT pass-through; tool swap ≤ 60 s; parallel gripper option ≥ 120 N, 20 kg** | Digit 5 swappable gripper on ISO flanges [R27]; Unitree Dex1-1 5–120 N, 20 kg [V6] | Lets one robot carry a dexterous hand or a heavy gripper per task. Design the F/T sensor as part of the flange stack |
| 8 | **Autonomous fast charging** | 0.67 kW, ≈ 3 h, supervised | **≥ 2 kW through foot or dock contacts (or inductive), ≤ 1.5 h full charge, run:charge ≥ 4:1, no human present** | Figure 03 2 kW wireless via feet [V18]; Digit 5 10:1 [V26]; NEO 6 min per hour [V32]; Atlas 1.5 h [V23] | 2 kW into 2.59 kWh ≈ 0.75 C = 3.75 A/cell, inside the P50B's 5 A standard charge (repo R3) [E]. This needs BMS-supervised unattended charging and a dock with thermal monitoring |
| 9 | **Joint speed (running and fast stepping)** | hip 10.3, knee 11.0 rad/s no-load at 52 V | **Hip pitch ≥ 16 rad/s, knee actuator ≥ 14 rad/s (≥ 16 at the joint near extension), at minimum bus; run ≥ 2.5 m/s** | H1 URDF hip 23 / knee 14 rad/s, 3.3 m/s [V5][V1]; G1 hip 32 / knee 20 [V5]; N1 3.5 m/s [V37]; H2 18S bus [V4] | 18S raises minimum bus 52 → 58.5 V (+12.5 %), 14:1 → 12:1 gives +17 %, and a rewind with ≈ 15 % lower Kt gives the rest: 10.3 × 1.125 × 1.17 × 1.18 ≈ 16 rad/s [E]. Caveat: Everest S NET is 80 V abs max, which leaves too little regen headroom at 18S (75.6 V full), so use 100 V-class drives throughout or settle on 17S (71.4 V) |
| 10 | **Active cooling of all leg joints** | ducted air on knee and hip pitch only | **Continuous ≥ 45 % of peak on knee, hip pitch and hip roll (knee ≥ 170 N·m continuous)** | T800 active cooling on every leg joint [V46]; Figure 03 actively cooled pack [R19] | Needed for 30 kg stair carrying (≈ 149 N·m continuous [E], #1). A sealed liquid loop (cold plates on stators, radiator in the torso) also serves #6. No peer publicly verifies liquid-cooled joints, so test it before committing |
| 11 | **Mass budget** | 84 kg est. | **Hold ≤ 84 kg est. while adding #1–#10; knee peak / mass ≥ 5.7 N·m/kg** | Peers at 61–75 kg [V17][V4][V36][R30][R50]; H1 7.7 N·m/kg [V1] | #2 saves ≈ 3.2 kg [E: 2 × (4.22 − 3.2) + 2 × (3.78 − 3.2)], which offsets the larger pack in #3. 480/84 = 5.7 N·m/kg [E] |
| 12 | **Waist yaw range** | ±70° | **±160°** | Walker S2 ±162° [V39]; G1 ±155° [V2]; Atlas continuous [V22] | Pick from behind and place in front without stepping, which shortens pick-and-place cycles. It needs a slip ring or a service loop through the waist; KA-90P torque is unchanged |
| 13 | **Certified functional safety** | SIL3-class MCU + STO, uncertified | **ISO 13849-1 PL d / Cat 3 for STO, safe speed and protective stop; 360° human detection; CE path** | AgiBot A2 PL d [V54]; Digit 5 independent safety controller, CE planned [R27]; Atlas fenceless guarding and human detection [V23] | K1's architecture already fits. The work is FMEDA, validation and adding rear and side detection sensors |
| 14 | **Serviceability and covers** | modules swap in ≤ 30 min with hand tools | **Any leg actuator in ≤ 10 min (blind-mate connector + quick-release clamp); tool-free washable soft covers with pinch-point foam; field-repair procedure per module** | Atlas modular, field-replaceable, customer self-repair certification [V23]; Figure 03 tool-free washable covers [V18]; NEO washable suit [V32]; G1 hollow wiring [V2] | Route harnesses through hollow joint shafts (G1/R1 do) so that a module swap breaks no harness |
| 15 | **Perception for manipulation and safety** | head stereo, hand-workspace stereo, 2 SLAM cameras, LiDAR, chest depth [K] | **Palm camera in each hand; full 360° camera coverage around the torso** | Figure 03 palm cameras, 60 % wider FOV [V18]; Atlas 360° cameras [V23]; A2 360° LiDAR + 6 cameras [V54] | Palm cameras close the last 10 cm of a grasp, where head cameras are blocked. 360° coverage feeds #13 |

**Recommended order.** Do #1 first: re-running `calc/run_all.py` with the payload scenarios sets the numbers for #2,
#5 and #10. Then do #3 with #8 (power architecture), #9 (bus voltage, which must be fixed before drives are bought)
and #4, #6 and #7 (wrist/hand stack).

---

## (e) Sources (all accessed 2026-11-09)

| # | Source | Tag use |
|---|---|---|
| 1 | Unitree H1 / H1-2 — https://www.unitree.com/h1 | V |
| 2 | Unitree G1 — https://www.unitree.com/g1 | V |
| 3 | Unitree R1 — https://www.unitree.com/R1 | V |
| 4 | Unitree H2 — https://www.unitree.com/H2 | V |
| 5 | Unitree URDF model files (joint effort and velocity limits): https://raw.githubusercontent.com/unitreerobotics/unitree_ros/master/robots/g1_description/g1_29dof.urdf · https://raw.githubusercontent.com/unitreerobotics/unitree_ros/master/robots/h1_description/urdf/h1.urdf · https://raw.githubusercontent.com/unitreerobotics/unitree_ros/master/robots/h1_2_description/h1_2.urdf | V (model limits) |
| 6 | Unitree product brochure, World Robot Conference 2026 — https://www.worldrobotconference.com/profile/robot/download/2026/07/23/20260723162124000433_20260723162124A829.pdf | V |
| 7 | Unitree shop H1 listing (seen as a search snippet) — https://shop.unitree.com/en-fr/products/unitree-h1 | R |
| 8 | Interesting Engineering, Unitree H2-X — https://interestingengineering.com/ai-robotics/unitree-showcases-h2-x-humanoid-robot | R |
| 9 | Electrek, Optimus at AI Day 2022 — https://electrek.co/2022/09/30/tesla-optimus-humanoid-robot/ | R |
| 10 | TeslaOracle, AI Day 2022 (73 kg, 2.3 kWh / 52 V) — https://teslaoracle.com/2022/10/02/elon-musk-unveils-optimus-tesla-bot-produced-at-high-volume-low-cost-brain-to-navigate-the-world | R |
| 11 | humanoid.guide, Optimus actuator classes — https://humanoid.guide/linear-vs-rotary-actuators-humanoid-joints/ | R |
| 12 | Tesla Form 8-K exhibit 99.1 (FY2026) — https://www.sec.gov/Archives/edgar/data/1318605/000162828026003837/exhibit991.htm | V |
| 13 | Electrek, V3 reveal pushed (2026-04-22) — https://electrek.co/2026/04/22/tesla-optimus-production-fremont-model-sx-line/ | R |
| 14 | Optimus Gen 2 features — https://news.designrush.com/tesla-shows-what-optimus-2-can-do · https://alphasignalai.beehiiv.com/p/tesla-unveils-optimus-gen-2 | R |
| 15 | Screen Rant, Tesla Bot 2021 concept — https://screenrant.com/tesla-bot-robot-specs-price-design-presentation/ | R |
| 16 | Drive Tesla Canada, V3 hand patents — https://driveteslacanada.ca/news/new-tesla-patents-reveal-optimus-v3-hand-human-muscles-tendons/ | R |
| 17 | Figure 03 — https://www.figure.ai/figure | V |
| 18 | Figure, "Introducing Figure 03" — https://www.figure.ai/news/introducing-figure-03 | V |
| 19 | Interesting Engineering, F.03 battery (2025-07-21) — https://interestingengineering.com/energy/figure-unveils-fireproof-humanoid-robot-battery | R |
| 20 | The Robot Report, Figure 02 — https://www.therobotreport.com/figure-02-humanoid-robot-is-ready-to-get-to-work/ | R |
| 21 | Maginative, Figure 02 (2024-08-06) — https://www.maginative.com/article/figure-unveils-second-generation-humanoid-robot-with-openai-powered-speech/ | R |
| 22 | Boston Dynamics Atlas — https://bostondynamics.com/atlas/ | V |
| 23 | Atlas spec sheet, rev. 2026-10-15 — https://bostondynamics.com/wp-content/uploads/2026/01/atlas-spec-sheet.pdf | V |
| 24 | Interesting Engineering, Atlas 13-DOF hand (2026-10-02) — https://interestingengineering.com/ai-robotics/boston-dynamics-13-dof-robot-hand | R |
| 25 | Nasdaq, Hyundai Mobis to supply Atlas actuators — https://www.nasdaq.com/articles/hyundai-mobis-supply-actuators-boston-dynamics | R |
| 26 | Agility Digit 5 (preliminary specs) — https://www.agilityrobotics.com/solutions/digit-5 | V |
| 27 | The Robot Report, Digit 5 (2026-09-15) — https://www.therobotreport.com/agilitys-digit-5-humanoid-has-new-legs-batteries-safety-upgrades/ | R |
| 28 | Engadget, next-gen Digit (2023-03-20) — https://www.engadget.com/the-next-gen-digits-robot-gets-a-head-and-hands-120001329.html | R |
| 29 | IEEE Spectrum, Apollo (2023-08-23) — https://spectrum.ieee.org/humanoid-robot | R |
| 30 | The Robot Report, Apollo unveiled — https://www.therobotreport.com/apptronik-unveils-apollo-humanoid-robot/ | R |
| 31 | Apptronik Apollo page (hot-swap 4 h packs; seen as a search snippet, direct fetch 404) — https://apptronik.com/apollo | R |
| 32 | 1X NEO — https://www.1x.tech/neo | V |
| 33 | Notebookcheck, NEO pre-orders — https://www.notebookcheck.net/1X-opens-pre-orders-for-20-000-NEO-humanoid-home-robot.1149203.0.html | R |
| 34 | Fourier GR-1 — https://support-old.fftai.com/en/docs/GR-X-Humanoid-Robot/GR1/GR-1_Introduction/ | V |
| 35 | Fourier GR-2 — https://support-old.fftai.com/en/docs/GR-X-Humanoid-Robot/GR2/GR-2_Introduction/ | V |
| 36 | Fourier GR-3 — https://support-old.fftai.com/en/docs/GR-X-Humanoid-Robot/GR3/GR-3_Introduction/ | V |
| 37 | Fourier N1 — https://support-old.fftai.com/en/docs/GR-X-Humanoid-Robot/Fouriern1/N1_Introduction/ | V |
| 38 | American Satellite, GR-3 reseller price — https://www.americansatellite.us/Fourier-GR-3-GR-3-Care-Bot.htm | R |
| 39 | UBTech Walker S2 — https://www.ubtrobot.com/en/humanoid/products/WalkerS2 | V |
| 40 | CnEVPost, Walker S2 swap without shutdown — https://cnevpost.com/2025/07/17/ubtech-humanoid-robot-autonomous-battery-swap/ | R |
| 41 | Walker S2 aggregators — https://www.humanoidhub.ai/robots/ubtech-walker-s2 · https://robotoverflow.com/en/robot-database/ubtech-walker-s2/ | R |
| 42 | Generation Robots, Booster T1 — https://www.generationrobots.com/en/404278-booster-t1-humanoid-robot.html | R |
| 43 | Booster T2 battery listing — https://www.maverickdrone.com/products/booster-t2-10-5ah-battery-pack · Thor compute — https://interestingengineering.com/ai-robotics/china-humanoid-robot-unveiled-nvidia-compute | R |
| 44 | EngineAI PM01 — https://en.engineai.com.cn/product-pm01.html | V |
| 45 | EngineAI SE01 — https://en.engineai.com.cn/product-se01.html | V |
| 46 | EngineAI T800 — https://en.engineai.com.cn/product-t800 | V |
| 47 | Maginative, SE01 — https://www.maginative.com/article/engineai-unveils-se01-an-impressive-robot-the-walks-like-a-human/ | R |
| 48 | Maginative, PM01 "for $12,000" — https://www.maginative.com/article/engineai-expands-lineup-with-pm01-a-lighter-more-agile-humanoid-robot-for-12-000/ | R |
| 49 | John Koetsier, T800 "$40,500" — https://johnkoetsier.com/?p=46564 | R |
| 50 | The Robot Report, Kepler K2 at ICRA 2025 — https://www.therobotreport.com/kepler-robotics-showcases-k2-bumblebee-icra-2025/ | R |
| 51 | RBTX, Kepler K2 listing — https://rbtx.de/en-GB/components/humanoid/kepler-k2-humanoid-robot-52-dof | R |
| 52 | The AI Insider, Kepler mass production (2025-09-27) — https://theaiinsider.tech/?p=39026 | R |
| 54 | AgiBot A2 — https://agibot.com/products/A2 | V |
| 55 | Gasgoo, Xpeng IRON (2025-11-06) — https://autonews.gasgoo.com/articles/news/xpeng-unveils-next-generation-humanoid-robot-iron-to-begin-mass-production-by-end-of-2026-70039692 | R |
| 56 | Electrek, Xpeng IRON (2026-09-07) — https://electrek.co/?p=483263 | R |
| 59 | NextBigFuture, Figure 02 2.25 kWh — https://www.nextbigfuture.com/2024/08/figure-2-humanoid-bot.html | R |
| 60 | China Daily HK, SE01 price — https://chinadailyhk.com/article/603216 | R |
| K | KESTREL repo: `README.md`, `docs/01-concept.md`, `docs/05-electrical-architecture.md`, `docs/generated/actuator_family.md`, `joint_requirements.md`, `mass_budget.md`, `power_budget.md`, `calc/kestrel/params.py`; `docs/research/R1` (strain-wave and MyActuator tables), `R3` (P50B ratings) | K |

Numbers 53, 57 and 58 are unused. Kepler's own press release (2.33 kWh) and Xpeng's production-line report were seen
only in search extracts and are not relied on.

**Not found or not public (left blank above):** Figure, Atlas, Apollo, Digit, Walker S2 and Optimus joint torques;
Optimus V3 body spec; Digit 5 battery chemistry and capacity; Atlas walking speed; Walker S2 official mass; Booster T2
height; Xpeng IRON height and mass. Continuous torque ratings are published by almost no humanoid maker.
