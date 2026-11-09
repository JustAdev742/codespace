# R8: Open-source humanoids and bipeds, and lessons for KESTREL S1

**Purpose.** This report surveys the open-hardware and open-software humanoid and biped projects that exist as of
November 2026. From them it derives design rules for **KESTREL S1**, a simple, cheap, easy-to-modify but strong
full-size humanoid that one person can build. Cost, buildability, modularity, strength and robustness drive the
choices; appearance is ignored. The high-end K1 package ([README](../../README.md)) is the comparison point.

**Access date:** 2026-11-09 for every source. **Method:** primary sources first (project repos, papers, docs,
manufacturer pages). GitHub HTML pages returned 403 in this session, so repo files were read from
`raw.githubusercontent.com`. Google-Sheet BOMs were exported as CSV. `kscale.dev` and `docs.kscale.dev` were
unreachable (K-Scale shut down in November 2025), and `docs.poppy-project.org` is outside this session's
allowed network, so those projects partly rely on secondary sources.

**Evidence tags.** Every number carries one:

| Tag | Meaning |
|---|---|
| **[V n]** | Verified: read in the project's own repo, paper or docs, or the manufacturer's page (source *n* in §6). |
| **[R n]** | Reported: press, retailer, aggregator, wiki or search snippet. Not confirmed against a primary source. |
| **[E]** | Estimate: the method is given next to it. |
| **[K1: path]** | Taken from the existing K1 package in this repo, which cites its own sources. |

Currency: prices are given in the currency and year the source states. Where I convert CNY to USD I use
**6.7 CNY/USD**, the 2026-09-09 mid-market rate (6.708) [R 66]. That rate is an assumption for November 2026.

---

## 1. Summary of findings

1. **No open project combines full size, low cost and one-person buildability.** The full-size open designs
   (OpenLoong 80 kg [V 19], Unitree H1 URDFs [V 35]) rest on proprietary or high-cost actuators. The cheap,
   buildable ones are 0.4–1.25 m tall: BHL, ToddlerBot, Z-Bot, Roboto Origin, Asimov, K-Bot and N1. S1 fills a
   real gap, but none of its parts is untested: every subsystem below has an open precedent.
2. **The commodity Chinese QDD actuator decides the cost.** The 2026 RobStride list prices give **0.67 N·m of
   peak torque per US$** for the RS04 (120 N·m, ¥1,199) [V 52] [E: 6.7 CNY/USD]. That is about 6× the printed BHL
   actuator (0.11 N·m/$) and 3–10× MyActuator and CubeMars integrated actuators. Actuators are 63 % of the Roboto Origin BOM
   [V 46] [E] and about 90 % of ToddlerBot's cost, together with the computer [V 7].
3. **Printed cycloidal gearboxes are proven only to about 15–36 N·m.** Published evidence covers short runs
   (10–60 h) at small size. Wear-driven backlash growth is the failure mode reported, not tooth fracture.
   Full-size legs need 120–210 N·m, so S1 should not put printed gearboxes in its legs (§5.4).
4. **The S1 frame pattern already exists in the open designs.** BHL [V 1], AGILOped [V 48] and Duke [V 33] build
   the torso from aluminium extrusion. BHL lengthens legs with carbon tubes [V 1], and Upkie adds outboard
   bearings so the actuators do not carry link loads [V 40].
5. **One CAN bus per limb at 1 Mbps is the open-source norm.** BHL uses 4 buses [V 1], Asimov 6 [V 25] and
   Roboto 4 USB-CAN adapters [V 46]. Only the higher-end designs use EtherCAT: Duke [V 33], OpenLoong [V 19]
   and AgiBot X1 [V 49].
6. **Hardware e-stops are rare and usually software-only.** Asimov's stops are software and "none of them
   replaces cutting power" [V 26]. S1 must add a hardware power cut.
7. **RL locomotion runs out of the box on a common stack:** Isaac Lab or Isaac Gym with rsl_rl or PPO, then
   MuJoCo sim-to-sim, actuator system identification, and an MLP policy at 25–50 Hz on a CPU (BHL, Roboto,
   Duke, unitree_rl_gym, ToddlerBot).

---

## 2. Comparison table

### 2a. Walking humanoids and bipeds with published hardware

| Project (year) | Height / mass | DOF | Frame | Actuators (peak N·m) | Bus · compute · battery | Software | Cost | Licence |
|---|---|---|---|---|---|---|---|---|
| **Berkeley Humanoid Lite** (2025) | 0.8 m / 16 kg [V 1] | 22: 6/leg, 5/arm [V 5] | Al extrusion torso, PLA FDM limbs, every part ≤200 mm cube [V 1] | Custom: M6C12 150KV (6512) and 5010 drone BLDC + **printed PLA cycloid**, ratio not published; 20 N·m model limit [V 5] | 4× CAN 2.0 at 1 Mbps via USB-CAN, 250 Hz · Intel N95 mini PC · 6S 4 Ah LiPo, ~30 min [V 1] | Isaac Gym PPO, policy 25 Hz; Isaac-Lab-style repo, sim2sim docs [V 1][V 2][V 3] | **US$4,312 (US) / $3,236 (CN), 2025** [V 1] | Code MIT; assets CC BY-SA 4.0 [V 2] |
| **ToddlerBot 2.0** (2025) | 0.56 m / 3.4 kg [V 7] | 30 [V 7] | Fully 3D-printed with metal shafts [V 7] | Dynamixel XC330/XC430/XM430/2XL430/2XC430, stall 1.0–3.0 N·m [V 7] | TTL 2 Mbaud, 50 Hz · Jetson Orin NX 16 GB · 4S 2–5 Ah [V 7] | MuJoCo/MJX/Brax PPO; zero-point jigs; 9-parameter motor sysID [V 7] | **<US$6,000** [V 7]; motors $4,070 (2XC variant) [V 9] | MIT [V 10] |
| **K-Scale K-Bot** (2025) | 1.40 m / 34 kg [R 14] | 20 [R 14] | Aluminium body [R 14] | RobStride RS00/02/03/04, up to 120 [R 14][R 15] | CAN [R 15] · Amlogic/Nvidia board [V 12] · 13 Ah, ~4 h [R 15] | KOS (Rust), ksim (JAX/MuJoCo) [V 16] | **US$8,999, 2025** [V 12] | HW CERN-OHL-S, SW GPL-3 [V 11] |
| **Z-Bot / Zeroth-01** (2024–25) | ~0.5 m [R 18] | 16 [R 18] | 3D-printed [V 17] | Feetech serial servos [V 17] | Serial bus [V 17] | kos-zbot, ksim-gym-zbot with sysID [V 17] | **BoM from US$350** [V 17] | MIT [V 17] |
| **OpenLoong / Qinglong** (2024) | 1.85 m [R 21] / 80 kg [V 19] | 43 [V 19] | Machined parts; PDF drawings [V 19] | Not specified in the open files | EtherCAT · 400 TOPS · ≥3 h [V 19] | MPC + WBC in MuJoCo/Pinocchio [V 20] | Not published | None found in repo root; research use [V 19] |
| **Fourier N1** (2025) | 1.3 m (1,245 mm) / 38–39 kg [V 22] | 23 [V 22] | Al alloy + engineering plastic [R 23] | Joint limits 90 / 54 / 30, peak 144 [V 22] | Ethernet · i7-13700H · 475 Wh, 39.6 V, ~2 h [V 22] | SDK docs repo [V 24] | Not published [R 23] | BOM, drawings, assembly guide released [R 23]; licence not found |
| **Asimov 1** (Menlo, 2025–26) | 1.2 m / 35 kg [V 25] | 25 [V 25] | 7075 Al + MJF PA12 [V 25] | ENCOS-type EC-A series: 120 / 90 / 75 / 60 / 36 [V 26] | 5× CAN 1 Mbps + 1× 500 kbps · Radxa CM5 + RPi 5 · 13S4P 491 Wh [V 25][V 26] | Isaac Lab or mjlab templates [V 26] | **DIY kit US$20,000** [V 25] | HW CERN-OHL-S-2.0, SW GPL-2.0 [V 25] |
| **Roboto Origin** (RoboParty, 2025/26) | 1.25 m / 34 kg [R 46] | 23 [V 46] | CNC-machined aluminium (alloy not stated), sandblasted and black anodised [V 46] | Damiao DM-J10010L (120) ×9 + DM-J4340P (27) ×14 [V 46][R 47] | 4× USB-CAN · RDK X5 · 48 V 15 Ah [V 46] | ROS 2 Humble, Isaac Lab 2.1.1, rsl_rl [V 46] | **¥49,713 BOM (2026-01)** ≈ US$7,420 [V 46][E] | HW CERN-OHL-W-2.0, SW GPL-3 [V 46] |
| **AgiBot X1** (2024) | 1.30 m / 33 kg [V 49] | 34 [V 49] | n/a | PowerFlow R86-3 (200), R86-2 (80), R52 (19) [V 49] | EtherCAT to 3× FDCAN 5 Mbps · 2 h [V 49] | AimRT, RL code [R 49] | <US$20k [R 49] | HW on GitHub [R 49] |
| **AGILOped** (Bonn, 2025) | 1.10 m / 14.5 kg [V 48] | 10 actuators, 12 joints [V 48] | Al extrusion torso cage, PLA/nylon, TPU feet [V 48] | MyActuator RMD X6-40 (40) [V 48] | 2× CAN 1 Mbit · RPi 3B+ · 2× 26.1 V LiPo [V 48] | ROS, CPG + LIP (no RL yet) [V 48] | **US$6,380** [V 48] | Files at nimbro.net [V 48] |
| **Duke Humanoid v1** (2024) | ~1 m shoulder–foot / 30 kg [V 33] | 10 (legs only) [V 33] | Al extrusion upper frame, machined 6061 legs, TPU covers [V 33] | Motorevo planetary 18:1 / 20:1 / 10:1; rated 72 / 80 / 40 [V 33] | EtherCAT 2 kHz · tethered, no battery [V 33] | Isaac Gym, rl-games; DR + joint sysID [V 33] | Not published | Open, licence not stated [V 33] |
| **Unitree G1 / H1** (open SDK, URDF, rl_gym) | G1 1.32 m / 35 kg; H1 1.80 m / 47 kg [V 36][V 37] | G1 23–43; H1-2 27 [V 36][V 37] | Proprietary | G1 knee 90/120; H1 knee 360, hip 220 [V 36][V 37] | G1 13-cell 9 Ah, ~2 h; H1 864 Wh [V 36][V 37] | unitree_rl_gym: Isaac Gym → MuJoCo → real [V 34] | G1 from US$13.5k [V 36] | SDK, URDFs, rl_gym: BSD-3 [V 34][V 35] |
| **HopeJR** (Pollen/HF + TheRobotStudio, 2025) | Full size [R 30] | 66 [R 30] | 3D-printed [V 29] | Feetech ST3215/ST3250/STS8215 in arms; RobStride 02 in body design [V 29] | n/a | LeRobot; exoskeleton teleop [V 29] | ~US$3,000 target [R 30] | Not found in repo root |
| **ODRI Bolt** (2019–) | ~0.5 m [E: 2× 200 mm leg segments [V 38]] / 1.34 kg [V 38] | 6 + passive ankle [V 38] | 3D-printed shells [V 38] | 4004 300KV + 9:1 two-stage belt, 2.5 N·m @ 12 A [V 38] | Master board over Ethernet/WiFi, SPI micro-drivers; tethered [V 38] | ODRI C++/Python | Not published | BSD-3 [V 38] |
| **Upkie** (2022–) | Wheeled biped | 4 leg + 2 wheel [V 40] | 3D-printed (FreeCAD) [V 40] | mjbots qdd100 (16 peak, 3.3 continuous) [V 40][R 41] | pi3hat CAN-FD · RPi 4 · Ryobi 18 V tool battery [V 40] | Python Gym envs, PyBullet [V 40] | Not published | Apache-2.0 [V 40] |

### 2b. Servo-based and non-biped open humanoids (for completeness)

| Project | Size | Actuation | Cost | Licence | Relevance to S1 |
|---|---|---|---|---|---|
| **InMoov** (2012–) | life size, ~1.8 m [R 42] | Hobby servos (HK15298) [R 42]; legs non-motorized [V 42] | <€1,500 [R 42] | CC BY-NC 3.0 [R 42] | Shows printed life-size shells but no locomotion. NC licence blocks reuse in a commercial kit. |
| **Poppy Humanoid** (2013–) | 84 cm / 3.5 kg [R 43] | 25 Dynamixel (21 MX-28, 2 MX-64, 2 AX-12) [R 43] | US$8,000–9,000, ~60 % actuators [V 43] | HW CC BY-SA 4.0, SW GPL-3 [V 43] | Assembly in ~7 h [V 43]. Servo cost per N·m is very poor. |
| **pib** | pib Pro: 80 cm, 20 DOF [R 44] | Hobby servos via RPi + Tinkerforge [R 44] | not found | Backend AGPL-3.0 [V 44] | ROS 2 + Webots + Blockly education stack [V 44]. |
| **Kayra** (2022–) | small | Hobby servos, Pimoroni Servo 2040, BNO055 [R 45] | <€500 [R 45] | BSD-3 [V 45] | FreeCAD + MuJoCo + PETG; "design should be adaptable to different servos" [V 45]. |
| **Reachy 2** (Pollen/HF) | 136–166 cm, up to 50 kg [V 31] | Orbita parallel actuators; 7-DOF arms, 3 kg per arm [V 31] | ~US$70,000 [R 32] | Apache 2.0 [V 31] | Fixed stand or optional omni-wheel base. ROS 2 Humble + Python SDK. A model for upper-body modularity. |
| **AhaRobot** (2025) | Bimanual mobile base | Low-cost servo arms | ~US$1,000 hardware [V 50] | Open (CAD + SW) [V 50] | Cost discipline for arms. Not a biped. |
| **Tien Kung** (X-Humanoid) | 1.69 m [R 51] | n/a | n/a | "Open platform" claimed [R 51] | No BOM or CAD verified. Excluded from the lessons. |

### 2c. Actuator torque per dollar (the S1 cost driver)

| Actuator (type) | Peak / rated N·m | Mass | Price (as published) | Peak N·m per US$ | Source |
|---|---|---|---|---|---|
| **RobStride RS04** (QDD 9:1, steel gears, 15–60 V) | 120 / 40 (345 mm plate) or 35 (220×200 plate) | 1.42 kg | **¥1,199** list, 2026-07 | **0.67** [E] | [V 52] |
| RobStride RS04, Western resellers | same | same | US$295–401 | 0.30–0.41 | [R 53] |
| **RobStride RS03** (9:1) | 60 / 21 | 0.90 kg | ¥999; resellers US$224 | 0.40 [E]; 0.27 | [V 52][R 53] |
| RobStride RS06 (9:1) | 36 / 11 | 0.621 kg | ¥849 | 0.28 [E] | [V 52] |
| RobStride RS02 (7.75:1) | 17 / 7 | 0.38 kg | ¥699 | 0.16 [E] | [V 52] |
| **Damiao DM-J10010L** (10:1) | 120 / 40 | n/a | ¥1,989 (Taobao, in Roboto BOM) | 0.40 [E] | [V 46][R 47] |
| Damiao DM-J4340P (~40:1) | 27 / 9 | ~0.375 kg | ¥949 | 0.19 [E] | [V 46][R 47] |
| ENCOS EC-A6416-P2-25 (25:1) | 120 / 40 | 0.805 kg | not found | n/a | [R 28] |
| AgiBot PowerFlow R86-3 | 200 / 60 | 1.28 kg | not sold separately | n/a | [V 49] |
| MyActuator X12-320 (20:1) | 320 / 85 | 2.37 kg | US$1,647 | 0.19 | [K1: docs/research/R1] |
| MyActuator X8-120 | 120 / 43 | 1.40 kg | US$977 | 0.12 | [K1: R1] |
| MyActuator X6-40 | 40 / 18 | n/a | US$545 | 0.073 | [V 48] |
| CubeMars AK10-9 V3 | 53 / 18 | 0.94 kg | US$799 | 0.066 | [K1: R1] |
| SteadyWin GIM8108-8 (motor + planetary, **no driver**) | 22 stall / 7.5 | 0.375 kg | US$85 | 0.26, excluding driver | [R 54] |
| **BHL 6512 DIY printed cycloid** | 20 (model limit) | n/a | US$188 (US) / $157 (CN) | 0.11–0.13 | [V 1][V 4][V 5] |
| mjbots qdd100 beta 3 | 16 / 3.3 continuous | n/a | US$559 | 0.029 | [R 41] |
| Dynamixel XM430-W210 | 3.0 stall | n/a | US$310.39 | 0.010 | [V 7][V 9] |

---

## 3. Per-project notes

### 3.1 Berkeley Humanoid Lite (UC Berkeley Hybrid Robotics, RSS 2025)
- **Specs.** 0.8 m, 16 kg [V 1]. 22 actuated joints: 6 per leg (hip roll, yaw, pitch, knee, ankle pitch, ankle
  roll) and 5 per arm. Every joint is modelled at 20 N·m effort and 15 rad/s; ankle roll is limited to
  ±0.26 rad [V 5]. Walking uses about 30 % of the actuator torque limit [V 1].
- **Actuators.** Two sizes, both built around a 3D-printed PLA cycloidal reducer. A brass hex standoff is
  embedded in the printed input shaft, and through-screws reinforce the layer boundaries [V 1]. The 6512 uses a
  MAD M6C12 150KV drone motor and a 6811ZZ output bearing. The driver is an ST B-G431B-ESC1 ($19) with custom
  firmware, and the encoder an AS5600 [V 1][V 4]. Part costs:
  - 6512: US$188 (US) / $157 (CN) [V 1]. The BOM sheet total is $188.69, with 0.12 kg of PLA ($3.12) [V 4].
  - 5010: $136 / $94 [V 1].
  - The gear ratio and peak torque are not printed in the paper's text [V 1].
- **Tests.**
  - Mechanical efficiency is about 90 % over most of the range and drops at high torque and speed because of
    heat [V 1].
  - Stiffness is 319 N·m/rad, measured with torque ramped 0→20 N·m [V 1].
  - Backlash across six units: maximum 0.0229 rad (1.31° [E]) [V 1].
  - 60-hour pendulum endurance test (0.5 kg, 0.5 m, 0.5 Hz): efficiency stayed stable while backlash grew
    with wear [V 1]. That pendulum produces only ≈2.45 N·m of gravity torque [E: m·g·L], about 12 % of the
    20 N·m limit.
  - Torque tracking stayed within ±0.5 N·m across six units printed on two printers [V 1].
- **Electronics.** Four CAN 2.0 buses at 1 Mbps, one per limb, through 4 USB-CAN adapters ($68). An Intel N95
  mini PC ($129) does the computing. The IMU is a BNO085 ($13), which the paper calls "cellphone-grade"; the
  docs later added an "IMU upgrade" (2025-06-28) [V 1][V 3]. Power is a 6S 4,000 mAh LiPo ($70), giving about
  30 min [V 1]. Each CAN bus can address up to 64 devices [V 1].
- **Build and modify.**
  - Off-the-shelf parts ship within a week, printing takes about a week, and assembly about 3 days [V 1].
    Berkeley estimates "about one week" for a novice [V 6].
  - Actuators need only power and CAN, so the same modules rebuild into quadruped, centaur and wheeled-base
    forms [V 1].
  - Carbon-fibre tubes lengthen the legs into an adult-scale 7-DOF-leg variant [V 1]. The torso extrusions
    exist "to support mounting additional components" [V 1].
  - URDF and MJCF are exported from Onshape with onshape-to-robot [V 2].
- **Weaknesses.**
  - The printed parts' long-run thermal behaviour was not studied [V 1].
  - Stiffness is 4.6× [E] lower than a PA-CF printed cycloid (1,468 N·m/rad), which the paper attributes to
    PLA [V 1].
  - The ESC's CAN solder pads are "very fragile" [V 3].
  - The torque scale is small. Berkeley says it has "yet to break a single actuator" [V 6], but published
    durability data is at low load.
- **Links.** Code: https://github.com/HybridRobotics/Berkeley-Humanoid-Lite. Docs:
  https://berkeley-humanoid-lite.gitbook.io/docs. Site: https://lite.berkeley-humanoid.org.

### 3.2 ToddlerBot 2.0 (Stanford, 2025)
- **Specs.** 0.56 m, 3.4 kg, 30 DOF: 7 per arm, 6 per leg, 2 neck, 2 waist [V 7]. It walks up to 0.25 m/s and
  turns at 1 rad/s. It lifts 1,484 g (40 % of body mass) [V 8].
- **Actuators.** Dynamixel servos at 1.0–3.0 N·m stall. The XM430-W210 drives the knee and ankle pitch; the
  2XC430 dual servo drives hip roll and pitch [V 7]. Measured backlash is about 0.25° [V 7]. Motors are $4,070 of
  the BOM in the 2XC variant [V 9].
- **Electronics.** TTL bus at 2 Mbaud with full-state feedback at 50 Hz. The computer is a Jetson Orin NX 16 GB
  ($955) [V 7][V 9]. The 4S pack peaks at 370 W [V 7]. The distribution board carries 4× XT30, an **E-stop
  terminal block**, 7 TTL outlets and 2× 12 V buck converters [V 7].
- **Software.** MuJoCo/MJX/Brax with PPO (3×10⁸ steps, 1,024 environments) [V 7]. Printed zero-point jigs
  calibrate the robot "within a minute" [V 7]. Chirp-based system ID fits a 9-parameter actuator model to an
  average tracking error of 1.3° [V 7].
- **Build and modify.** A student with no hardware background built the second unit in 3 days including
  printing; community builds averaged about a week. A broken part costs 21 min of printing plus 14 min of
  assembly [V 7]. A third-party assembled kit sells at $4,299, excluding the Jetson [V 9].
- **Weaknesses.**
  - The longest walk is about 19 min before motor heating degrades stability [V 8].
  - It survives up to 7 falls before something breaks [V 8].
  - The actuator model ignores temperature, and heating pushes the robot outside the policy's training
    distribution [V 7].
  - Servo speed, torque and bus rate cap performance [V 7].
- **Links.** https://github.com/hshi74/toddlerbot · https://toddlerbot.github.io

### 3.3 K-Scale Labs K-Bot and Z-Bot / Zeroth-01
- **K-Bot.**
  - Sold for US$8,999, stated by the founders in their launch post [V 12].
  - Reported at 1.40 m, 34 kg, 20 DOF, 10 kg payload [R 14].
  - Actuators reported as RobStride RS00 ×2, RS02 ×6, RS03 ×8, RS04 ×4, with RS04 at hip and knee
    [R 14][R 15]. Battery reported at 13 Ah for about 4 h [R 15].
  - Software: KOS, a Rust robot OS with a Python client, and ksim, MuJoCo/JAX RL under MIT [V 16].
  - Licences: hardware CERN-OHL-S, software GPL-3 [V 11].
- **What went wrong.**
  - The founder admitted that on earlier prototypes "3D printed components break a lot and repair time can be
    quite long" [V 12].
  - The company shut down in November 2025 and released its IP [R 13]. One wiki reports only 2 K-Bots shipped
    [R 14].
  - In July 2025 a reviewer noted the hardware CAD was still missing from GitHub [R 15].
- **Z-Bot / Zeroth-01.** A 3D-printed robot driven by Feetech serial servos, with "BoM starts at $350", MIT
  licence and a sysID-calibrated RL pipeline (ksim-gym-zbot) [V 17]. Reported at about 50 cm and 16 DOF [R 18].
- **Lessons.**
  - A community open-source company is a supply-chain risk. S1 must not depend on one small vendor's firmware
    or parts.
  - The K-Bot's RobStride-plus-aluminium recipe is the closest commercial analogue of S1.

### 3.4 OpenLoong / Qinglong (Shanghai Humanoid Robotics Innovation Center, 2024)
- **Specs.** 80 kg, 43 DOF, ≥5 km/h, ≥20 kg payload, ≥3 h, up to 400 TOPS, EtherCAT joint bus [V 19]. Height
  is reported as 185 cm [R 21]; the repo gives only a 2,192 × 1,850 × 300 mm envelope [V 19].
- **Open content.** PDF part drawings for the waist, chest, head and leg/foot [V 19]. The leg drawings include a
  "Rocking Arm", "Link" and "Lower Leg Pull Rod", which shows a linkage-driven knee [V 19]. Control is MPC + WBC
  in MuJoCo with Pinocchio, with walk, jump and blind-step demos [V 20].
- **Build and modify.** Hard. The design is machined metal, published as PDFs rather than editable CAD, with no
  actuator specification and no BOM cost. No licence file was found in the repo root, and the README limits use
  to learning and research [V 19].
- **Lesson.** A pushrod-driven knee is the norm at full size. Open drawings without open actuators do not make a
  robot buildable.

### 3.5 Fourier N1 (Fourier, open-sourced April 2025)
- **Specs.** 1.3 m (1,245 mm), 38–39 kg, 23 DOF: 6 per leg, 5 per arm, 1 waist [V 22].
- **Torque.** Joint limits are 90 N·m (hip pitch, knee), 54 N·m (hip roll/yaw, waist, shoulder pitch) and
  30 N·m (ankle, shoulder roll/yaw, elbow, wrist), with a peak of 144 N·m [V 22].
- **Electronics and speed.** 475 Wh pack at 39.6 V nominal, about 2 h of running time, i7-13700H computer,
  Ethernet to the joints, dual 16/14-bit encoders [V 22]. Running speed is given as 10.8 km/h in the spec table
  and 3.5 m/s in the text; the page contradicts itself [V 22].
- **Open content.** Fourier says it released the BOM, machinable drawings, assembly guide and basic control code
  [R 23]. This research found only SDK documentation on GitHub (`FFTAI/fourier-grx-n1`, `Wiki-GRx-Deploy`
  FourierN1 branch) [V 24]. The hardware repo was not located and no licence was confirmed.
- **Lesson.** The 30 N·m ankle limit on a 38 kg robot is low (§5.3), and FSA actuators are hard to source
  outside Fourier.

### 3.6 Asimov 1 (Menlo Research / Asimov Inc., 2025–26)
- **Specs.** 1.2 m, 35 kg, 25 actuated DOF plus 2 passive toes [V 25][V 26]. Rated loads are a 5 kg squat and a
  5 kg bicep curl per arm (15 kg peak) [V 25].
- **Actuators.** Five ENCOS-type EC-A models; Menlo does not name the vendor, and the "EC-A" naming matches
  ENCOS listings [R 28]. Rated/peak torque and count:

  | Model | Joints | Rated / peak N·m | Count |
  |---|---|---|---|
  | EC-A6416-P2-25 | Hip pitch, waist | 40 / 120 | ×3 |
  | EC-A5013-H17-100 | Hip roll, shoulder pitch | 30 / 90 | ×4 |
  | EC-A3814-H14-107 | Hip yaw, shoulder yaw | 20 / 60 | ×4 |
  | EC-A4315-P2-36 | Knee, shoulder roll | 25 / 75 | ×4 |
  | EC-A4310-P2-36 | Ankle A/B (parallel), elbow, wrist, neck | 12 / 36 | ×10 |

  Sources: [V 26]. A retailer lists the EC-A6416-P2-25 at 805 g, 25:1 and 107 rpm rated [R 28].
- **Electronics.** Six CAN interfaces (5 at 1 Mbps, 1 at 500 kbps). Radxa CM5 runs motion control and RPi 5
  handles media [V 25]. Battery: 13S4P INR18650, 46.8 V nominal, 54.6 V charge, 491.4 Wh, about 2 kg, 30 A
  maximum discharge, with actuator power daisy-chained on XT30 [V 26].
- **Frame.** 7075 aluminium plus MJF PA12 [V 25]. Feet are printed TPU 95A shoes [V 25].
- **Cost.** The DIY kit ships at US$20,000 [V 25]. An earlier BOM page quoted about $16k to self-source and a
  $15k kit target [R 27].
- **Software.** Isaac Lab or mjlab templates with MJCF and URDF provided [V 26].
- **Build and modify.** The self-source checklist has 162 item quantities [V 26]. All 25 actuator IDs must be
  assigned on the bench **before** assembly, or parts of the robot must be taken apart again [V 26]. The
  mounting and extension guidance is still "coming soon" [V 26].
- **Safety.** Stops are software, the robot "go[es] limp at once", and "none of them replaces cutting power"
  [V 26]. The robot must be supported (gantry, bench or a person) until it is walking [V 26].
- **Lessons.**
  - A parallel two-actuator ankle is a good pattern.
  - A 75 N·m knee on a 35 kg robot fits its modest squat rating.
  - Assigning actuator IDs before assembly is a must for any CAN robot.

### 3.7 Roboto Origin / ATOM 01 (Shanghai RoboParty, prototype 2025, open January 2026)
- **Specs.** 1.25 m, 34 kg, 3 m/s running [R 46]. 23 actuators in the BOM: 14× DM-J4340P and 9× DM-J10010L
  [V 46].
- **BOM.** ¥49,713, dated 2026-01-05 [V 46]:
  - Actuators: ¥31,187 (63 % [E]).
  - CNC-machined, sandblasted and anodised aluminium frame: 70 parts, ¥15,670 (32 % [E]). The hip joint
    fixation alone is ¥1,800 and the two calves ¥3,200.
  - Battery: 48 V 15 Ah Li-ion pack, ¥528.
  - IMU: HiPNUC HI13, ¥350.
  - Computer: RDK X5 8 GB, ¥599.
  - CAN: 4× USB-CAN at ¥46 each.
- **Software.** ROS 2 Humble deployment, Isaac Sim 4.5 / Isaac Lab 2.1.1 training with rsl_rl, USB2CAN
  firmware, URDF/MJCF descriptions [V 46].
- **Build and modify.** Everything is bought on Taobao or made by JLC prototyping, "truly assembled
  independently through DIY" [V 46]. The ankle uses linkages: the BOM lists universal connectors, output-flange
  connecting rods and long and short rods [V 46].
- **Licences.** Hardware CERN-OHL-W-2.0, aggregation layer GPL-3 [V 46].
- **Lesson.** This is the closest open BOM to S1. CNC parts cost a third of the robot; extrusion and tube
  framing could cut that sharply (§5.2).

### 3.8 AgiBot X1 (2024)
- **Specs.** 130 cm, 33 kg, 34 DOF, about 2 h, 1 m/s [V 49].
- **Actuators.** PowerFlow R86-3: 200 / 60 N·m, 1.28 kg, 48 V. R86-2: 80 / 20 N·m, 0.81 kg. R52: 19 / 6 N·m,
  0.45 kg. EtherCAT runs to a domain controller that fans out to 3× FDCAN at 5 Mbps, with 1 kHz forwarding
  [V 49].
- **Open content.** CAD, PCB, firmware and AimRT middleware are reported to be on GitHub [R 49].
- **Lesson.** 200 N·m at 1.28 kg shows what the next commodity tier will look like. Today it is not sold as a
  separate part.

### 3.9 AGILOped (University of Bonn NimbRo, 2025)
- **Specs.** 110 cm, 14.5 kg. 10 MyActuator RMD X6-40 actuators (18/40 N·m, $545 each) drive 12 joints. Two
  CAN buses at 1 Mbit via PiCAN2 Duo, RPi 3B+, 2× 26.1 V 4.5 Ah LiPo for 1.5–2.5 h. Total cost US$6,380,
  itemised [V 48].
- **Frame and software.** Aluminium extrusion torso cage, PLA/nylon links, TPU soles [V 48]. Control is a CPG
  gait plus LIP balancing; RL is not yet implemented [V 48].
- **Lesson.** A transparent itemised cost table, and an extrusion cage again.

### 3.10 Duke Humanoid v1 (2024)
- **Specs.** About 1 m from shoulder to foot, 30 kg, 10 DOF (legs only) [V 33]. Motorevo planetary actuators:

  | Joints | Ratio | Rated N·m | Max speed |
  |---|---|---|---|
  | Hip roll, hip abduction, knee | 18:1 | 72 | 20 rad/s |
  | Hip flexion | 20:1 | 80 | 18 rad/s |
  | Ankle | 10:1 | 40 | 36 rad/s |

  The paper's table gives maxima of 264 N·m (hip flexion) and 238 N·m (knee) [V 33].
- **Electronics.** EtherCAT at 2 kHz, MicroStrain 3DM-CV7 IMU, toe and heel load cells through a Teensy 4.0.
  The robot is tethered with no onboard battery [V 33].
- **Frame.** Off-the-shelf aluminium extrusion upper frame, machined 6061 legs, printed TPU motor covers for
  falls [V 33].
- **Software.** Isaac Gym with 4,096 environments, about 30 min of training on one RTX 4090. Policy at 50 Hz,
  PD at 2 kHz on the robot. Sim-to-real uses joint friction, damping and armature identification plus domain
  randomisation [V 33]. Using passive dynamics cut cost of transport by up to 50 % in simulation and 31 % on
  hardware [V 33].
- **Weaknesses.** No arms. Tethered. A single-DOF ankle with no roll. About 0.2 rad knee tracking error during
  parts of the gait [V 33].

### 3.11 Unitree open SDK, URDFs and unitree_rl_gym
- **Repos.** `unitree_sdk2`, `unitree_ros` and `unitree_rl_gym` are all BSD-3 [V 34][V 35]. The URDFs cover G1
  (23/29 DOF), H1 (19) and H1-2 (27) [V 35]. The rl_gym pipeline goes Train → Play → Sim2Sim (MuJoCo) →
  Sim2Real for Go2, G1, H1 and H1-2 [V 34].
- **Benchmarks.**
  - G1: 1.32 m, about 35 kg, knee 90 N·m (EDU 120), 13-cell 9 Ah pack, about 2 h, from US$13.5k [V 36].
  - H1: 1.80 m, 47 kg, knee 360, hip 220, ankle 59 N·m [V 37].
  - H1-2: 1.78 m, 70 kg, ankle 2× 75 N·m (parallel) [V 37].
- **Lesson.** The software is the open part, and the pipeline is a ready template for S1. H1-2 replaced H1's
  single 59 N·m ankle with a parallel 2× 75 N·m ankle, evidence that the original ankle was too weak.

### 3.12 ODRI Solo / Bolt (MPI Tübingen and NYU)
- **Actuator module.**
  - Motor: T-Motor Antigravity 4004 300KV (53 g).
  - Transmission: two-stage 3:1 × 3:1 timing belt (9:1).
  - Encoder: Broadcom AEDT-9810 optical, 20,000 counts per revolution.
  - Output: 2.5 N·m at 12 A, 150 g module [V 38].
- **Bolt.** 1.34 kg, 3 active DOF per leg plus a passive ankle, 200 mm leg segments [V 38]. It has no yaw DOF,
  so yaw cannot be controlled [V 38]. A tether carries power and Ethernet [V 38]. Solo8 weighs 2.2 kg [V 39].
- **Lesson.** The ODRI modules are clean and well documented under BSD-3, but they do not scale to S1 torques.

### 3.13 Upkie (wheeled biped)
- **Specs.** 4× mjbots qdd100 in the legs, 2× moteus kits on the wheels, pi3hat, RPi 4, and a **Ryobi 18 V tool
  battery** [V 40]. Software is Python Gymnasium environments shared between simulation (PyBullet) and the real
  robot, with a gamepad button as the emergency stop [V 40]. The qdd100 beta 3 gives 16 N·m peak (<1 s),
  10 N·m for 60 s and 3.3 N·m continuous at 24 V [R 41].
- **Lesson.** Upkie offers optional printed hip and knee supports with a 40×52×7 mm bearing "to reduce play and
  protect knee actuators from radial load" [V 40]. S1 needs the same outboard bearings, at larger size.

### 3.14 HopeJR and Reachy (Hugging Face / Pollen)
- **HopeJR.**
  - A 66-DOF full-size humanoid targeted at about US$3,000 [R 30].
  - The repo holds printed arms with Feetech servos: ST3250 (steel gears) in the shoulder pitch, STS8215 to
    replace a passive tendon. It also holds tendon hands, an exoskeleton teleop rig, LeRobot integration, and a
    body design "updated for new motors, Robstride 02" [V 29].
  - No walking hardware results were found.
- **Reachy 2.**
  - 7-DOF arms carrying 3 kg each, Orbita parallel actuators, adjustable 136–166 cm torso, omni base, ROS 2
    Humble, Apache 2.0 [V 31]. Reported at about US$70k [R 32].
- **Lessons.** The value to S1 is in the software and data (LeRobot, the teleop exoskeleton) rather than the
  structure.

### 3.15 InMoov, Poppy, pib, Kayra
- These are servo robots built for education, art and HRI. Their shared lessons:
  - Printed shells are enough for upper bodies.
  - Hobby servos limit torque and life: InMoov builders recommend the HK15298 because cheaper servos "burn"
    [R 42], and Poppy spends about 60 % of its US$8–9k on 25 Dynamixels [V 43].
  - InMoov's CC BY-NC licence prevents selling kits [R 42].
- **Kayra's design goals** are a good checklist for S1: "modular so that enthusiasts can change the design of a
  subsystem", "adaptable to different servos", "ideally no soldering", and simulation provided [V 45].

---

## 4. Cross-cutting evidence

### 4.1 Knee torque normalised by mass × height
Index = knee peak torque / (mass × height), in N·m/(kg·m) [E: arithmetic on the tagged inputs].

| Robot | Knee peak / mass / height | Index | Note |
|---|---|---|---|
| BHL | 20 N·m / 16 kg / 0.8 m [V 1][V 5] | 1.56 | walks at about 30 % of limit [V 1] |
| Asimov | 75 / 35 / 1.2 [V 26] | 1.79 | hip pitch 120 → 2.86; knee transmission ratio not stated |
| Fourier N1 | 90 / 38 / 1.3 [V 22] | 1.82 | joint limit |
| Unitree G1 (EDU) | 90 (120) / 35 / 1.32 [V 36] | 1.95 (2.60) | |
| K-Bot | 120 / 34 / 1.40 [R 14] | 2.52 | RS04, reported |
| KESTREL K1 (calculated) | 399 / 84 / 1.75 [K1: README] | 2.71 | 15-scenario inverse dynamics, including stairs and 20 kg squat |
| Roboto Origin | 120 / 34 / 1.25 [V 46][R 46] | 2.82 | assumes DM-J10010L at the knee (9 units → hips and knees, inferred) |
| Unitree H1-2 | 360 / 70 / 1.78 [V 37] | 2.89 | |
| Unitree H1 | 360 / 47 / 1.80 [V 37] | 4.26 | running and jumping class |
| AGILOped | 80 / 14.5 / 1.10 [V 48] | 5.02 | "config-dependent" |

Walking humanoids trained with RL cluster at **1.6–2.9**, and the K1 calculation (2.71) sits inside that band.
**S1 design rule: knee peak ≥ 2.5 × m × h** [E]. For m = 50 kg and h = 1.65 m that gives **≈206 N·m**.

### 4.2 Printed gearbox evidence

| Source | Gearbox | Material | Load demonstrated | Duration | Outcome |
|---|---|---|---|---|---|
| BHL 6512 [V 1] | Cycloid, ratio not published | PLA | Static ramp 0→20 N·m; endurance pendulum ≈2.45 N·m [E] | 60 h at 0.5 Hz | Efficiency recovered; backlash rose, "acceptable"; ≤0.0229 rad across units |
| Roozing & Roozing [V 55] | Cycloid 11:1, pinwheel and non-pinwheel, Ø104 × 23 mm, 360–377 g | PA6-CF, 15 % CF, Prusa MK3S+ | Nominal 36.4 N·m at 40 A (motor-limited); endurance >15 N·m and 3 rad/s | 10 h, 1,390 cycles | Play roughly doubled after 10 h from "elephant's foot" disk-edge wear; stiffness 1,271–1,468 N·m/rad; gearbox BOM €65–98 |
| Scientific.net abstract [R 56] | Cycloid 24:1 | PLA disk vs machined Al disk | 18.3 vs 31.5 N·m maximum | n/a | Al 1.7× higher torque with better thermal stability |
| COMPAct [V 59] | Printed planetary, single and compound | n/a | n/a | n/a | Efficiency 60–80 %, backlash 0.59–2.6°, stiffness 202–243 N·m/rad |
| Polymer gear wear study [V 57] | Spur gears (not cycloid), 1.5 N·m at 900 rpm | PETG / PLA / ABS | 1.5 N·m | Run to failure | PETG lasted 22 % longer than PLA and 37 % longer than ABS; wear driven by temperature rise |
| Robrotics HD20 [R 58] | Printed strain wave 20:1 | PETG flexspline | ~3.5 N·m peak | n/a | "PLA has almost no fatigue life" in that role |

### 4.3 Bus, power and safety comparison

| Robot | Joint bus | Rates | Battery | E-stop |
|---|---|---|---|---|
| BHL | 4× CAN 2.0, 1 Mbps, one per limb [V 1] | 250 Hz comms, 25 Hz policy [V 1] | 6S 4 Ah LiPo (~89 Wh [E]) [V 1] | not documented |
| ToddlerBot | TTL 2 Mbaud [V 7] | 50 Hz [V 7] | 4S, 370 W peak [V 7] | E-stop terminal on the distribution board [V 7] |
| Asimov | 5× CAN 1 Mbps + 1× 500 kbps [V 25] | telemetry 10 Hz [V 26] | 13S4P 491 Wh, 30 A [V 26] | software stops only; "none replaces cutting power" [V 26] |
| Roboto Origin | 4× USB-CAN [V 46] | n/a | 48 V 15 Ah, ¥528 [V 46] | not documented |
| AGILOped | 2× CAN 1 Mbit [V 48] | n/a | 2× 26.1 V 4.5 Ah [V 48] | not documented |
| Duke | EtherCAT [V 33] | 2 kHz PD, 50 Hz policy [V 33] | tethered [V 33] | not documented |
| AgiBot X1 | EtherCAT → 3× FDCAN 5 Mbps [V 49] | 1 kHz [V 49] | n/a | n/a |
| Upkie | CAN-FD via pi3hat [V 40] | 200 Hz in example [V 40] | Ryobi 18 V tool pack [V 40] | gamepad button [V 40] |
| N1 | Ethernet [V 22] | n/a | 475 Wh, 39.6 V [V 22] | n/a |

---

## 5. Lessons for KESTREL S1

### 5.1 Proposed S1 envelope
- Height **1.60–1.70 m**, design mass **≤50 kg**, and **23 DOF** (6 per leg, 5 per arm, 1 waist), the same count
  as G1, N1 and Roboto. Simple grippers or the HopeJR/Asimov printed hands are optional add-ons.
- Built mass estimate: **≈40–45 kg** [E]. The actuators in §5.3 weigh 21.7 kg [E: sum of RobStride masses
  [V 52]]. Frame, battery, electronics and grippers are assumed at 18–23 kg, bracketed by the 34–38 kg robots
  above.
- Target: walk, turn, take steps, carry a light payload, and fall without breaking. Running is not a target.

### 5.2 Frame standards
1. **Build the pelvis and torso as a 20-series T-slot box, with a 40×40 hip cross-member.**
   - BHL [V 1], AGILOped [V 48] and Duke [V 33] all frame the torso in extrusion, because anything mounts
     anywhere on T-nuts.
   - 2040 section: 0.90 kg/m, I = 4.64 cm⁴ strong axis / 1.42 cm⁴ weak axis, W = 2.32 cm³ [V 60]. That is
     6.4× the strong-axis stiffness of 2020 (0.72 cm⁴) for 1.8× the mass [E from V 60].
   - Hip cross-member check [E]. Assume a 3 g single-support transient at 50 kg (1,472 N) acting 0.10 m from the
     member (147 N·m bending):

     | Section | Bending stress |
     |---|---|
     | 2040, strong axis | **63 MPa** |
     | 40×40 (PIL 4040: 8.6 cm⁴, 1.53 kg/m [R 61]) | **34 MPa** |

     The 3 g factor is an assumption. 6061-T6 has a fatigue strength of 96.5 MPa at 5×10⁸ cycles [K1: R6].
     Extrusions are usually 6063 (PIL 4040 is 6063-T66 [R 61]), which is weaker. Use **4040 or a 6061 plate
     for the hip member** and 2040 elsewhere.
2. **Make limbs from round 6061 tube between bolt-on actuator clamps, not from machined plates.**
   - Roboto's CNC frame costs ¥15,670, about US$2,340 and a third of its BOM [V 46][E].
   - BHL turned its robot adult-scale simply by swapping in carbon tubes [V 1].
   - Ø40×3 6061-T6 tube [E: thin-wall formulas, ρ and E from K1: R6]: I = 6.0 cm⁴ in every direction,
     0.94 kg/m, EI ≈ 4,140 N·m². That is about 6 % stiffer in bending than K1's Ø40×2 CF tube at its 90 GPa
     design modulus (EI ≈ 3,890 N·m²) [K1: docs/03-mechanical-architecture.md], at a fraction of the cost.
   - Changing a limb length then means cutting a new tube. Pin each clamp with one cross-dowel so torque cannot
     slip it.
   - Torsion check [E]: 210 N·m (the full knee peak as a worst case) gives 35 MPa of shear in the tube.
   - CF tube (25×23 mm ≈ 134 g/m [R 63]) stays the upgrade path where mass matters (shank).
3. **Support both sides of every leg joint.** Each hip, knee and ankle gets a yoke with an outboard bearing
   opposite the actuator (Upkie's 40×52×7 bearing pattern [V 40]), so link bending does not pass through the
   actuator's output bearing. Check the RS04 manual's bearing ratings before relaxing this rule; this research
   did not retrieve them.
4. **Use printed parts only off the main load path**: covers, cable guides, sensor brackets, TPU bumpers (Duke
   [V 33]) and TPU shoes (Asimov [V 25]). K-Bot's founder [V 12] and ToddlerBot (7 falls [V 8]) both report
   printed structure breaking.

### 5.3 Actuators: best torque per dollar, and the S1 joint map
- **Use RobStride RS-series as the baseline**, with Damiao DM-J10010L/J4340P as the drop-in alternative.
  - The RS04 at ¥1,199 gives 0.67 N·m/$ at the Chinese list price [V 52][E]; the DM-J10010L gives 0.40
    [V 46][E].
  - Both have integrated FOC drivers, dual encoders and CAN, and RobStride states machined steel gears [V 52].
    STEP models are published in the RobStride repo [V 52].
  - Buy direct from China where possible: Western resellers charge **1.5–2.2×** the list price (RS04
    US$295–401 against ≈$179) [R 53][E].
- **Knee: RS04 plus a 1.75:1 pushrod linkage.** This gives **210 N·m peak**, 70 N·m rated and ≈12.0 rad/s
  no-load [E from RS04: 120/40 N·m, 200 rpm [V 52]]. It meets the 206 N·m rule in §4.1.
  - The linkage moves the actuator up to the thigh, as OpenLoong's rocking-arm and pull-rod knee does [V 19].
    K1's `calc/kestrel/linkages.py` already synthesises a four-bar knee [K1: README].
  - Link force at a 60 mm crank is ≈3.5 kN [E], so size rod ends at ≥3× that.
- **Hip pitch: RS04 direct (120 N·m), with provision for the same 1.5–1.75:1 linkage.** The open designs
  disagree on how hip pitch compares with knee: H1 runs hip at 0.61× knee [V 37], Asimov runs hip above knee
  [V 26], and K1's calculation has them about equal [K1: README]. Settle it by running S1's parameters through
  the K1 calc pipeline.
- **Hip roll: RS04 direct (120 N·m).** The static single-support need is ≈49 N·m [E: 50 kg × g × 0.10 m
  offset], leaving 2.4× margin.
- **Hip yaw: RS03 (60 N·m).**
- **Ankle: two RS03 in a parallel linkage.** This gives up to 120 N·m in pitch at a 1:1 lever, against a static
  toe-stance need of ≈74 N·m [E: 50 kg × g × 0.15 m]. It is the H1-2 (2× 75 N·m [V 37]) and Asimov
  (ankle A/B [V 26]) pattern. Avoid N1's 30 N·m single ankle [V 22], Duke's ankle with no roll [V 33] and BHL's
  ±0.26 rad roll limit [V 5].
- **Waist: RS03.** **Arms:** RS03 at shoulder pitch and roll, RS06 at shoulder yaw and elbow, RS02 at the wrist.
- **Count and cost.**

  | Model | Count | List price each | Subtotal |
  |---|---|---|---|
  | RS04 | 6 | ¥1,199 | ¥7,194 |
  | RS03 | 11 | ¥999 | ¥10,989 |
  | RS06 | 4 | ¥849 | ¥3,396 |
  | RS02 | 2 | ¥699 | ¥1,398 |
  | **Total** | 23 | | **¥22,977 ≈ US$3,430** |

  Prices are RobStride list [V 52]; the total and conversion are [E]. At Western reseller prices the total is
  ≈US$5,100–7,700 [E].
- **Heat.** RS04's rated torque drops from 40 to 35 N·m on a smaller heatsink plate [V 52]. Bolt the RS04s to
  the aluminium yokes and clamps as heat paths, and do not enclose them in printed shells.
- **Interchangeability.** Every actuator mounts through a pair of adapter flanges (housing side and output side)
  that convert the vendor's bolt circle to the S1 clamp. Swapping to Damiao or ENCOS (EC-A6416, 120 N·m,
  0.805 kg [R 28]) then means changing two flanges per joint.

### 5.4 Printed cycloidal gearboxes: how far to trust them
- **Proven:** about 15–36 N·m at 11:1 and Ø104 mm in PA6-CF, for 10 h [V 55]; 20 N·m static and ≈2.5 N·m
  endurance for 60 h in PLA [V 1][E]; and 18.3 N·m maximum for a PLA disk at 24:1 [R 56].
- **Not proven:** anything near the 120–210 N·m that S1 hips and knees need (§4.1), or impact and fall loads.
- **Failure mode:** progressive play. Roozing's play doubled in 10 h [V 55], and BHL's backlash grew over 60 h
  [V 1]. Heat lowers efficiency and softens the polymer [V 1][V 57].
- **Cost does not favour them at high torque.** A Roozing gearbox alone costs €65–98 for 36 N·m nominal, before
  motor and driver [V 55]. A complete RS03 costs ¥999 (about US$149) for 60 N·m peak [V 52][E]. A complete BHL
  6512 costs US$188 for a 20 N·m limit [V 1][V 5].
- **S1 rule.** Printed cycloids are allowed only on joints with **≤15 N·m peak and low duty**: neck, wrist
  roll, gripper. Use PA-CF (Roozing) or PETG (gear-wear study [V 57]), never PLA. Make the disks replaceable,
  check backlash every 10 h for the first 50 h, and replace a disk when play doubles. Never use them in the leg
  load path.

### 5.5 Standard mounting patterns
1. **The "S1-20" grid.** All brackets and plates carry clearance holes on a **20 mm pitch**, matching the
   20-series extrusion slots [V 60]. A bracket then bolts to the torso extrusion, a plate or another bracket
   without redesign. Use the T-nut size the extrusion supplier specifies.
2. **VESA MIS-D, 75×75 or 100×100 mm with M4**, for the computer, screens and boxed sensors [R 62]. Many mini
   PCs ship with VESA plates, and BHL's N95 PC is that class [V 1].
3. **Tube-clamp accessory collars** on the Ø40 limb tubes take cameras, foot sensors and cable P-clips anywhere
   along a limb.
4. **Per-limb bus pass-through.** Each limb's CAN and 48 V branch ends in a spare connector with the CAN
   terminator plugged into it. Adding a node (gripper, foot load cell) means moving the terminator. BHL's "only
   power and CAN" modularity is what allowed its morphology changes [V 1].
5. **Actuator ID convention, assigned on the bench before assembly** (Asimov's hard lesson [V 26]): left leg
   11–16, right leg 21–26, left arm 31–35, right arm 41–45, torso 51 and up. Write the IDs on the housings and
   keep a joint-mapping page, as BHL does [V 3].

### 5.6 Wiring, bus, power and safety
- **Topology.** Five CAN 2.0 buses at 1 Mbps: L-leg (6), R-leg (6), L-arm (5), R-arm (5), torso (waist plus
  spare). Each bus is daisy-chained along its limb. Use SocketCAN USB-CAN adapters (the BHL and Roboto choice
  [V 1][V 46]) or a multi-port CAN HAT.
- **Bus load and rates.** Six actuators with one command and one reply per cycle at about 125 bits per frame
  load the bus to **37.5 % at 250 Hz** and **75 % at 500 Hz** [E]. Run **250 Hz** (BHL's rate [V 1]) with the
  RL policy at 50 Hz (Duke and ToddlerBot [V 33][V 7]) and the PD loop inside the actuators. For 500 Hz or more,
  split each leg onto 2 buses or move to CAN-FD (X1 runs FDCAN at 5 Mbps [V 49]).
- **Battery.** 13S Li-ion: 46.8 V nominal, 54.6 V full (the Asimov pack [V 26]); size it at **≥15 Ah (≈700 Wh
  [E])**.
  - It suits RobStride's 15–60 V range [V 52] with 5.4 V of headroom at full charge [E].
  - Runtime estimate ≈2.3–2.7 h [E]. Method: scale G1's 421 Wh / 2 h [V 36][E] or K1's 440 W walking at 84 kg
    [K1: README] linearly to 50 kg, giving 262–300 W.
  - Specify the BMS at ≥40 A continuous [E: K1's 2.7 kW peak scaled by 50/84 ≈ 1.6 kW ÷ 46.8 V ≈ 34 A].
  - Prefer a pack with named cells (Asimov's 13S4P INR18650 [V 26]) over a no-name e-bike pack, even though the
    no-name pack is cheap (¥528 [V 46]).
- **Power path.** Battery → main fuse → precharge resistor and **DC contactor** → actuator bus (48V-SW) →
  per-limb fused branches. A separate DC-DC fed upstream of the contactor powers the computer, IMU and network
  (LOGIC), so logs and telemetry survive an e-stop.
- **Regeneration.** Full charge leaves only 5.4 V below the RS04's 60 V maximum. Fit a brake chopper on 48V-SW
  that clamps below 60 V. K1's chopper design scales down [K1: docs/05-electrical-architecture.md], and R2
  notes that a 13S bus needs a clamp below 60 V [K1: docs/research/R2].
- **E-stop.** A latching mushroom button on the back and a wireless e-stop receiver sit in series in the
  contactor coil loop: hardware, independent of software. Software adds a "damp" state and a CAN-timeout
  watchdog; confirm RobStride's timeout behaviour in its manual. This goes beyond Asimov's software-only stops
  [V 26], ToddlerBot's terminal block [V 7] and Upkie's gamepad button [V 40]. Because a cut makes the robot go
  limp [V 26], **a gantry or harness is mandatory** until walking is validated.
- **Connectors.** Use XT60-class per limb branch. Use XT30 daisy-chains (Asimov [V 26]) only for arm and neck
  branches; leg peak currents are not verified here. CAN wiring: twisted pair with locking connectors (BHL warns
  that the ESC CAN pads are fragile [V 3]).
- **IMU.** Use an industrial-class unit (HiPNUC HI13, ¥350 [V 46], or MicroStrain CV7 [V 33]) rather than the
  BNO085, which BHL calls cellphone-grade and later upgraded [V 1][V 3].

### 5.7 Software that gives RL locomotion out of the box
1. **One parameter source.** S1 geometry, mass and actuator limits live in one file that generates URDF and
   MJCF, the way K1's `params.py → model.py` already works [K1: README]. BHL generates its descriptions from
   Onshape with onshape-to-robot [V 2].
2. **Train in Isaac Lab (BSD-3) with rsl_rl (BSD-3)** [V 65]. This is Roboto Origin's stack (Isaac Lab 2.1.1)
   [V 46]. Asimov's alternative is mjlab (Apache-2.0, Isaac-Lab API on MuJoCo Warp) [V 26][V 64]. K1's CPU
   trainer in `train/` covers anyone without a GPU [K1: README].
3. **Copy the observation and action interface** from BHL: base angular velocity, projected gravity, joint
   positions and velocities, command, previous action [V 1]. Use an MLP policy at 25–50 Hz on an x86 mini PC
   (BHL runs it on an N95 [V 1]).
4. **Validate sim-to-sim in MuJoCo before hardware**, following unitree_rl_gym (Train → Play → Sim2Sim →
   Sim2Real) [V 34], humanoid-gym [V 65] and BHL's sim2sim docs [V 3].
5. **Sim-to-real kit.**
   - Actuator system ID by chirp fitting (ToddlerBot's 9-parameter model reached 1.3° tracking error [V 7]).
   - Joint friction, damping and armature identification plus domain randomisation (Duke [V 33]).
   - Printed zero-point calibration jigs (ToddlerBot, "within a minute" [V 7]).
   - Torque limits set at the RS04's rated value for continuous tasks.
6. **Deployment.** A single real-time Python or C++ process talks SocketCAN. A ROS 2 Humble bridge is optional
   for perception and teleop, following Roboto's `roboparty_deploy` [V 46]. LeRobot [V 29] is optional for
   arm data collection.

### 5.8 Recommended S1 architecture (summary)

| Subsystem | Choice | Why (evidence) |
|---|---|---|
| Size and mass | 1.60–1.70 m, ≤50 kg design, 23 DOF | Fills the gap above the 1.2–1.4 m open robots (§1) |
| Torso and pelvis | 2040 T-slot box with 4040 or 6061-plate hip member; S1-20 grid; VESA bay | Extrusion torsos in BHL, AGILOped, Duke; 34 MPa hip-member check [E] |
| Limbs | Ø40×3 6061 tube + clamp and adapter flanges; outboard bearing yokes; CF tube optional | Tube-length scaling (BHL); Upkie bearings; EI ≈ K1's CF tube [E] |
| Leg actuators | RS04 at hip roll, hip pitch and knee (knee through 1.75:1 pushrod → 210 N·m); RS03 at hip yaw and 2× parallel ankle | Torque per dollar 0.67 N·m/$ [E]; index rule ≥2.5 [E] |
| Arm and waist actuators | RS03 shoulder pitch/roll and waist; RS06 shoulder yaw and elbow; RS02 wrist | Cost and mass |
| Printed gearboxes | Neck, wrist roll and grippers only (≤15 N·m, PA-CF or PETG) | §5.4 |
| Bus | 5× CAN 1 Mbps via SocketCAN; 250 Hz joint loop, 50 Hz policy | BHL / Asimov / Roboto norm; 37.5 % bus load [E] |
| Compute | x86 N95/N100-class mini PC (~US$129 [V 1]); optional Jetson for vision | BHL runs the RL policy on an N95 [V 1] |
| Power | 13S Li-ion ≥15 Ah, BMS ≥40 A; precharge + contactor; chopper below 60 V; separate logic DC-DC | Asimov pack; RS04 60 V maximum [V 52] |
| Safety | Hardware e-stop (mushroom + wireless) on the contactor coil; software damp and CAN watchdog; gantry | Asimov's software-only gap [V 26] |
| Software | Single-source params → URDF/MJCF; Isaac Lab + rsl_rl or mjlab; MuJoCo sim2sim; sysID; ROS 2 bridge optional | Roboto, BHL, Duke, unitree_rl_gym |

**Indicative S1 parts cost** [E]. Bought China-direct the total is ≈US$4.6–5.5k; with Western reseller
actuators it is ≈US$6.3–9.8k.

| Line | Estimate | Basis |
|---|---|---|
| Actuators | ¥22,977 ≈ $3,430 | RobStride list prices [V 52] |
| Frame | $600–1,500 | Bracketed by BHL's structure ($289 for 0.8 m [V 1]) and Roboto's CNC frame (≈$2,340 [V 46]) |
| Battery | ¥528 | [V 46] |
| Computer | $129 | [V 1] |
| IMU | ¥350 | [V 46] |
| 5× USB-CAN | ¥230 | [V 46] |
| Power and safety parts | ~$300 | Assumption: not priced in this research |

For comparison: K-Bot sold at US$8,999 [V 12], Roboto's BOM is ≈US$7.4k [E], and the Asimov kit is US$20k
[V 25].

### 5.9 Risks and open questions for S1
- **Vendor risk.** K-Scale's shutdown [R 13] shows how fragile small vendors are. The adapter-flange standard
  (§5.3) keeps Damiao and ENCOS as fallbacks; keep at least one spare RS04 and one RS03.
- **Unverified items.**
  - RS04 output-bearing ratings and CAN timeout behaviour (read the RS04 manual [V 52]).
  - Leg peak currents, which decide XT30 vs XT60.
  - The CAN-FD capability of each RS model.
  - The final hip-pitch ratio: run S1's parameters through K1's `calc/run_all.py` to replace the index rule
    with inverse dynamics.
- **Prices.** The RobStride list is from the 2026-07-13 spec document [V 52]. The CNY→USD rate and reseller
  multipliers are assumptions [R 66][R 53].

---

## 6. Sources (all accessed 2026-11-09)

1. Chi et al., "Demonstrating Berkeley Humanoid Lite", arXiv 2504.17249 (RSS 2025). https://arxiv.org/abs/2504.17249 · PDF https://arxiv.org/pdf/2504.17249
2. Berkeley Humanoid Lite repo README and licence. https://github.com/HybridRobotics/Berkeley-Humanoid-Lite
3. Berkeley Humanoid Lite docs (BOM, actuator build, 3D printing, releases, joint ID mapping). https://berkeley-humanoid-lite.gitbook.io/docs · https://berkeley-humanoid-lite.gitbook.io/docs/releases.md · https://berkeley-humanoid-lite.gitbook.io/docs/getting-started-with-hardware/building-the-actuator.md
4. BHL 6512 actuator BOM (Google Sheet, CSV export). https://docs.google.com/spreadsheets/d/1AQEHcH_nPkXYfor2-h7bwNIUMmsePtAm53epnsWgZXc
5. BHL assets: URDF and MJCF joint limits. https://github.com/HybridRobotics/Berkeley-Humanoid-Lite-Assets (data/robots/berkeley_humanoid/berkeley_humanoid_lite/urdf/berkeley_humanoid_lite.urdf, mjcf/berkeley_humanoid_lite.xml)
6. Berkeley Engineering, "Building bots on a budget" (Nov 2025). https://engineering.berkeley.edu/news/2025/11/building-bots-on-a-budget/
7. Shi et al., "ToddlerBot", arXiv 2502.00893. https://arxiv.org/abs/2502.00893 · https://arxiv.org/html/2502.00893
8. ToddlerBot 2.0 project page. https://toddlerbot.github.io/
9. ToddlerBot BOM (Google Sheet, CSV export). https://docs.google.com/spreadsheets/d/12MPpu1rRBogICvM5LNRhUcev6Mb_HHuyf8a1decOBxA
10. ToddlerBot repo and licence (MIT). https://github.com/hshi74/toddlerbot
11. K-Bot repo README and licence. https://github.com/kscalelabs/kbot
12. K-Scale Labs launch post and founder replies, Hacker News. https://news.ycombinator.com/item?id=44456904
13. Humanoids Daily, K-Scale shutdown (2025-11-07). https://www.humanoidsdaily.com/news/watch-k-scale-labs-ceo-explains-shutdown-i-bet-the-farm-on-the-k-bot-launch
14. K-Bot spec aggregators (reported): https://aiwiki.ai/wiki/k_scale_k_bot · https://www.grabarobot.com/robots/humanoid-robot/products/k-bot/
15. S. Scheele, "Open-source robots" (July 2025). https://sscheele.github.io/post/open-source-robots
16. K-Scale software repos: https://github.com/kscalelabs/ksim · https://github.com/kscalelabs/ksim-gym · https://github.com/kscalelabs/kos · https://github.com/kscalelabs/kos-kbot
17. Zeroth-01 / Z-Bot repo README. https://github.com/zeroth-robotics/zeroth-bot
18. Zeroth-bot Gitee mirror (height and DOF, reported). https://gitee.com/becomehero/zeroth-bot
19. OpenLoong hardware repo (QingLoong specs and drawings). https://github.com/loongOpen/OpenLoong-Hardware
20. OpenLoong dynamics control (MPC + WBC). https://github.com/loongOpen/Openloong-Dyn-Control
21. TechNode, Qinglong at WAIC 2024. https://technode.com/2024/07/05/qinglong-chinas-first-full-sized-general-purpose-humanoid-robot-unveiled-at-world-artificial-intelligence-conference-2024/
22. Fourier N1 introduction (Fourier support docs). https://support-old.fftai.com/en/docs/GR-X-Humanoid-Robot/Fouriern1/N1_Introduction/
23. Yicai Global, Fourier N1 open-source release (2025-04-14). https://www2.yicaiglobal.com/news/chinese-robotics-pioneer-fourier-unveils-first-open-source-android
24. FFTAI fourier-grx-N1 SDK documentation repo. https://github.com/FFTAI/fourier-grx-n1
25. Asimov 1 repo README (specs, kit price, licences). https://github.com/asimovinc/asimov-1 (mirror https://github.com/menloresearch/asimov-1)
26. Menlo docs for Asimov 1: overview https://docs.menlo.ai/asimov · mechanical https://docs.menlo.ai/asimov/1/overview/system-tour/mechanical · electrical https://docs.menlo.ai/asimov/1/overview/system-tour/electrical · safety https://docs.menlo.ai/asimov/1/operate/safety · self-source BOM https://docs.menlo.ai/asimov/1/assembly-preparations/self-source/select-release-and-bom · extend https://docs.menlo.ai/asimov/1/extend
27. Menlo Asimov BOM page (earlier $16k / $15k figures, via search snippet). https://docs.menlo.ai/asimov/1/bom
28. ENCOS EC-A6416-P2-25 retailer listing. https://aifitlab.com/products/encos-ec-a6416-p2-25-motor
29. HOPEJr repo (Humanoid and Arm READMEs). https://github.com/TheRobotStudio/HOPEJr
30. TechCrunch, Hugging Face HopeJR and Reachy Mini (2025-05-29). https://techcrunch.com/2025/05/29/hugging-face-unveils-two-new-humanoid-robots/
31. Pollen Robotics, Reachy 2. https://www.pollen-robotics.com/reachy/
32. Fox News, Reachy 2 price. https://www.foxnews.com/tech/can-70000-robot-transform-ai-research
33. Xia et al., "The Duke Humanoid", arXiv 2409.19795v2. https://arxiv.org/html/2409.19795v2
34. unitree_rl_gym README and licence. https://github.com/unitreerobotics/unitree_rl_gym
35. unitree_sdk2 and unitree_ros (licences, URDF DOF table). https://github.com/unitreerobotics/unitree_sdk2 · https://github.com/unitreerobotics/unitree_ros
36. Unitree G1 product page. https://www.unitree.com/g1
37. Unitree H1 / H1-2 product page. https://www.unitree.com/h1
38. ODRI open robot actuator hardware (actuator module v1, biped 6dof v1). https://github.com/open-dynamic-robot-initiative/open_robot_actuator_hardware
39. Grimminger et al., ODRI paper, arXiv 1910.00093. https://arxiv.org/abs/1910.00093
40. Upkie repo, BOM and parts: https://github.com/upkie/upkie · https://upkie.github.io/upkie/bill-of-materials.html · https://github.com/upkie/parts
41. mjbots qdd100 beta 3 (reseller spec and price). https://reach.dog/shop/mjbots-robotic-systems/products/qdd100-beta-3
42. InMoov: https://inmoov.fr/ · licence https://inmoov.fr/project/ · servos https://inmoov.fr/default-hardware-map/ · cost (Langevin) https://groups.google.com/g/inmoov/c/ZcarOFYsVbU · size https://humanoid.press/database/humanoid-press-database-inmoov/
43. Poppy Humanoid repo README: https://github.com/poppy-project/poppy-humanoid · New Atlas https://newatlas.com/poppy-3d-printed-humanoid-robot-kit/29497 · Lapeyre et al. https://hal-ensta-paris.archives-ouvertes.fr/hal-01096338
44. pib: https://github.com/pib-rocks/pib-backend · https://pib.rocks/ · KB https://pib-rocks.atlassian.net/wiki/spaces/kb/pages/66256925/System+design · pib Pro https://humanoid.guide/product/pib-pro/
45. Kayra: https://github.com/assadollahi/kayra · https://forums.pimoroni.com/t/update-on-open-source-humanoid-kayra/22508
46. Roboto Origin: README https://github.com/Roboparty/roboto_origin · BOM https://github.com/Roboparty/roboto_origin/blob/main/assets/BOM_EN.md · hardware https://github.com/Roboparty/Atom01_hardware · specs (reported) https://interestingengineering.com/ai-robotics/worlds-first-full-stack-humanoid-robot-open-sourced
47. Damiao retailer specs: https://openelab.com/products/damiao-brushless-servo-dm-j10010l · https://openelab.com/products/damiao-brushless-servo-dm-j4340p
48. Ficht et al., "AGILOped", arXiv 2509.09364v1. https://arxiv.org/html/2509.09364v1
49. AgiBot X1 product page: https://agibot.com/products/X1 · hardware repo (reported) https://github.com/AgibotTech/agibot_x1_hardware
50. Cui et al., "AhaRobot", arXiv 2503.10070. https://arxiv.org/abs/2503.10070
51. X-Humanoid Tien Kung 3.0 release (reported). https://www.roboticstomorrow.com/news/2026/02/16/x-humanoid-introduces-embodied-tien-kung-30-a-more-open-and-practical-humanoid-robotics-platform/26148/
52. RobStride product information (RS-series spec table from the 2026-07-13 document; prices, ratings, masses, gear material, STEP files). https://github.com/RobStride/Product_Information
53. RobStride reseller prices: https://rcdrone.top/products/robstride-04-qdd-120n-m-integrated-actuator-module-48v-9-1-ratio-dual-magnetic-encoder-ip52-700w-output · https://www.roboticscenter.ai/store/product/robstride-04 · https://www.newegg.com/p/3C6-00UV-00451 · https://rcdrone.top/collections/robstride
54. SteadyWin GIM8108-8 retailer listing. https://aifitlab.com/products/steadywin-gim8108-8-planetary-reducer-servo-motor
55. W. Roozing and G. Roozing, "Experimental comparison of pinwheel and non-pinwheel designs of 3D-printed cycloidal gearing for robotics" (University of Twente; c. 2023 per the hosting file name). https://files.energiazero.org/cartelle/meccanica/riduttori/2023_cycloidal_drive_nonpinwheel.pdf
56. PLA vs aluminium 24:1 cycloidal drive (abstract via search; page returned 403). https://www.scientific.net/AST.181.419
57. Tunalioglu and Agca, "Wear and Service Life of 3-D Printed Polymeric Gears", Polymers 2022, 14(10):2064. https://pmc.ncbi.nlm.nih.gov/articles/PMC9147857/
58. Robrotics HD20 printed strain-wave actuator (via search). https://github.com/robrotics/hd20/releases
59. COMPAct, arXiv 2510.07197 (abstract). https://arxiv.org/abs/2510.07197
60. 20-series aluminium profile datasheet (HY-S6 2020/2040/2060/2080). https://fab.academany.org/2021/labs/agrilab/students/antonio-anaya/files/week10/profile_alum_2020_datasheet.pdf
61. Robotunits PIL 4040 extrusion (values via search snippet). https://robotunits.com/en-us/shop/extrusion-fastening-technology/extrusion-technology-40mm-series/extrusion-40x40/
62. VESA MIS-D hole patterns (via search): https://www.ergotron.com/de-de/support/vesa-standard · https://en.wikipedia.org/wiki/VESA_mount
63. CF tube 25×23×1000 mm, 134 g (retailer). https://stgaws.robu.in/?p=1342563
64. mjlab (Apache-2.0). https://github.com/mujocolab/mjlab · https://arxiv.org/abs/2601.22074
65. RL frameworks and licences: Isaac Lab https://github.com/isaac-sim/IsaacLab (BSD-3) · rsl_rl https://github.com/leggedrobotics/rsl_rl (BSD-3) · legged_gym https://github.com/leggedrobotics/legged_gym · MuJoCo Playground https://github.com/google-deepmind/mujoco_playground (Apache-2.0) · humanoid-gym https://github.com/roboterax/humanoid-gym
66. USD/CNY mid-market 6.7080 on 2026-09-09 (reported). https://currencybeacon.com/index.php/rates/USD/CNY
67. KESTREL K1 package in this repo: `projects/kestrel-humanoid/README.md`, `docs/research/R1-actuators-gears-benchmarks.md`, `docs/research/R2-drives-encoders-safety.md`, `docs/research/R6-australian-sourcing-materials.md`, `docs/03-mechanical-architecture.md`, `docs/05-electrical-architecture.md`.
