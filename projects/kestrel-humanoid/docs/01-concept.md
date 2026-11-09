# 01 — Robot concept, capabilities and engineering philosophy (K1 Mk II)

![KESTREL K1, three-quarter front](../renders/05_threequarter_front.png)

*Render shows K1. Mk II keeps the silhouette; the visible changes (back-door battery hatches, radiator grille, hip
interfaces) are listed in docs/03 §14.*

## 1. What KESTREL K1 Mk II is, and what it is for

KESTREL K1 Mk II is a 1.75 m, ~102 kg electric humanoid built to do **physical work**: lift and carry loads the size of a
person's job, hold tools at arm's length, and keep going for a shift. It is the second revision of K1. K1 proved the
design method; Mk II raises the work loads to the level of the industrial humanoids in the 2026 benchmark (research
[R7](research/R7-commercial-humanoids.md)) and is the version the owner intends to build.

**Work Mk II is designed for** (each is a simulated design case, §2):

| Task | Mk II design load | Scenario |
|---|---|---|
| Tote and box handling, floor/thigh to chest | 30 kg sustained, two-handed | SQ (squat + rise), CW (walk 0.6 m/s carrying it) |
| Heavy single lifts (a sack onto a bench, one end of a load) | 50 kg momentary, from thigh height | LM |
| Machine tending, kitting, shelf work at full reach | 10 kg per hand, arms straight out | AH (hold), AL (lift in 0.8 s) |
| Carrying a tool case or bucket | 15 kg in one hand, elbow 90° | AO |
| Two-shift duty | hot-swap a pack in ≤ 3 min without shutdown; 4.9 h mixed duty per pair of packs | power budget |
| Wet and dirty sites | IP65 body, IP67 legs and hands, −20 to 40 °C | target |

**Not designed for:** running or jumping (the KA-150X actuator option exists for that, docs/04 §6), climbing stairs
while carrying 30 kg (stairs are simulated unloaded), overhead lifts of heavy loads, pressure washing or submersion of
the torso.

It is designed to be **built by one determined person with access to job shops** (CNC, wire EDM, gear cutting, MJF
printing, PCB assembly), and **serviced** like a professional machine: every major part is a module that can be removed
and tested on its own, and a leg comes off in minutes (docs/03 §13).

Every number below is tagged:

| Tag | Meaning |
|---|---|
| **[sim]** | computed by the engineering model in `calc/` (inverse dynamics, sizing, thermal, power), results in `docs/generated/` |
| **[ds]** | manufacturer datasheet / page (research R1–R10) |
| **[est]** | engineering estimate, to be confirmed by test (docs/11) |
| **[target]** | a requirement the design must meet; not yet demonstrated |

Nothing on this robot has been built or tested. The design is consistent and checked by calculation; it is **not**
proven. Section 7 lists what is most likely to be wrong.

## 2. Capability targets (Mk II)

| Capability | Target | Basis |
|---|---|---|
| Height / mass | 1.75 m / **102.5 kg estimated** (112.7 kg design mass, +10 % growth) | [sim] `docs/generated/mass_budget.md` |
| Walking | 0.8 m/s nominal, 1.2 m/s fast (flat-footed ZMP gait); **0.6 m/s carrying a 30 kg box** | [sim] W1, W2, CW |
| Stairs | 0.18 m rise, 0.28 m tread, 0.9 s per step (unloaded) | [sim] ST |
| Step-up | single-leg rise onto a 0.30 m platform in 1.2 s | [sim] SU |
| Two-handed payload | **30 kg sustained** (squat to chest, carry); **50 kg momentary** squat-lift from thigh height | [sim] SQ, CW, LM |
| Arm payload | **10 kg per hand at full forward reach** (static hold) and lifted hanging → horizontal in 0.8 s; 3 kg side raise | [sim] AH, AL, AS |
| One-handed | **15 kg** in one hand, elbow at 90° | [sim] AO |
| Disturbances | survive an unplanned 0.10 m drop without damage; structure survives 0.15 m | [sim] SD, SX |
| Hands | **13 actuated DOF** each (4-DOF thumb, finger abduction), **≥ 200 N power grasp**, palm camera, close ≤ 1 s | [target] (R7 #4) |
| Runtime | **4.9 h mixed duty, 4.3 h continuous walking** on 2 × 16S4P packs (2 × 1.15 kWh) | [sim] `docs/generated/power_budget.md` |
| Battery swap | one pack at a time, robot stays powered; ≤ 3 min | [target] (R7 #3), docs/03 §10 |
| Protection | **IP65 body, IP67 legs and hands**; operate −20 to 40 °C | [target] (R7 #6), docs/03 §12 |
| Service | a leg module off and back on in ≤ 10 min | [target] (R7 #14), docs/03 §13 |
| Perception | stereo + wide VIO cameras, 360° LiDAR, downward depth for footholds, mic array; **a camera in each palm** | [ds] |
| Compute | NVIDIA Jetson AGX Thor (T5000) for AI; separate PREEMPT_RT computer for control; independent safety MCU | [ds] |
| Safety | hard-wired e-stop chain → STO on every drive + bus disconnect; independent safety MCU; gantry-harness testing | design rule |

## 3. Engineering philosophy

1. **Loads first, hardware second.** Joint requirements come from whole-body inverse dynamics over **18 design
   scenarios**: walking, stairs, squats, step-ups, drops, arm work, and the Mk II work cases (CW, AO, LM).
   `calc/run_all.py` regenerates every table.
2. **Design to the not-to-exceed mass.** All requirements use the estimate + 10 % (112.7 kg). Programmes gain mass;
   the actuators must not become marginal when they do.
3. **Each joint gets the transmission its job needs.**
   - **Legs and waist:** quasi-direct-drive planetary actuators at 14–29:1. They tolerate impacts, can be back-driven
     and are torque-controlled from motor current.
   - **Arms:** machined two-disc **cycloids at 30:1**, with output torque flexures. Mk II moved off strain-wave gears
     because their repeated-peak ratings capped K1's arms below the Mk II loads; the cycloid is impact tolerant and has a
     higher peak at a speed the 52 V bus can reach.
   - **Neck and wrist yaw:** strain-wave 50:1, where loads are small and precision matters.
   - **Wrist pitch/roll and hands:** ball screws.

   It is a family of 7 rotary classes plus the wrist linear unit, each sized against the full torque-speed envelope of
   the joints it serves.
4. **Keep the mass high and central.** The knee actuator sits in the upper thigh and drives the knee through a four-bar.
   The ankle actuators sit in the calf and drive the foot through push-rods. Leg swing inertia falls sharply.
5. **Make speed, torque and heat agree.** The sizing checks every simulated (torque, speed) point at the **minimum
   loaded bus voltage** and the continuous duty at thermal limits. The Mk II lesson from R10 §1.2: **drive current is
   the first peak-torque lever, liquid cooling the first continuous-torque lever, motor size comes third.**
6. **Fail soft.** A coolant loss is a derate, not a fall (docs/03 §9.6). One pack carries the robot during a swap. A
   cycloid or flange overload slips or saturates before it breaks.
7. **Deterministic control, independent safety.** Motor timing and balance never depend on the AI computer. The safety
   chain is hard-wired and stops the robot even if every computer has crashed.
8. **Spend money where it buys capability or safety.** Custom motors where no commercial kit meets the duty (knee, hip
   pitch, shoulders, elbows, wrist yaw/neck); verified datasheet motors everywhere else; optional items kept out of the
   baseline.

## 4. Architecture at a glance

![Kinematic layout](../diagrams/dof_map.svg)

| Subsystem | Choice | Why |
|---|---|---|
| DOF | 12 legs (6 each), 2 waist, 14 arms (7 each), 2 neck = **30 body DOF**; 2 × **13** hand DOA | 6-DOF legs for general footholds; 7-DOF arms; waist pitch for floor reach |
| Knee & hip pitch | **KA-130K / KA-130H**: custom **KM-130x50-LC** (Ø130, 50 mm stack, N50UH, **liquid jacket**) + 2-stage planetary **17:1 / 14:1**, **150 A GaN drive** | knee 493 / 295 N·m, hip 406 / 243 N·m, hip 15.2 rad/s — [sim] |
| Hip roll, waist pitch | **KA-110P**: CubeMars RI115-PH + 29:1 planetary; 12 × M5 output flange | 427 N·m for the 50 kg lift (waist momentary 379 N·m) |
| Hip yaw, waist yaw, ankles | **KA-90P**: CubeMars RI85-PH + 28:1 planetary | 129 N·m, 13.1 rad/s, 1.4 kg |
| Shoulders | **KH-25**: custom KM-115x32-N50 + **C25 cycloid 30:1** | 10 kg per hand at reach: 90 N·m hold; 160 N·m gear repeated rating |
| Shoulder yaw, elbow | **KH-20**: custom KM-85x26-N50-4t + **C20 cycloid 30:1** | 15 kg one-handed: 59 N·m elbow hold; 105 N·m gear rating |
| Wrist yaw, neck | **KH-14**: custom KM-50x20 + CSG-14-50 strain-wave (unchanged) | |
| Wrist pitch/roll | **KW-L2**: flat brushless motor on a ball screw, 2 per forearm, 24 V rail | 19 / 10 N·m at 6 rad/s; K1's 12 V unit fell short (R10 §1.2) |
| Hands | 13 palm-housed micro linear actuators per hand, linkage fingers, palm camera | robust, self-locking grasp, sealable palm |
| Power | **16S Li-ion, 2 × 16S4P hot-swap packs**, 128 × Molicel P50B, 2 × 1.15 kWh | runtime and swap without shutdown (R7 #3) |
| Cooling | **liquid loop**: knee and hip-pitch jackets + Thor cold plate, torso radiator, dry-break couplings at the hips | continuous torque ≈ 60 % of peak on the main leg joints |
| Drives | HC2 150 A GaN (knee, hip pitch); Novanta Everest S NET (22 others) | 100 V class over the 67.2 V bus + regeneration; SIL3 STO |
| Limb interfaces | V-band clamp + blind-mate service plate (power, EtherCAT, STO, coolant) | leg off in minutes (R7 #14) |
| Control / AI compute | UP Squared Pro 7000, PREEMPT_RT, IgH EtherCAT at 1 kHz / Jetson T5000 on Seeed J601 | unchanged from K1 |
| Safety | FORT SIL3 wireless e-stop + wired pendant → dual-channel relay → STO + solid-state bus disconnect; TMS570 safety MCU | independent of software |

What changed from K1, item by item, with the reasons: README "What changed in Mk II" and docs/04 §2.1.

## 5. Benchmark: Mk II against commercial humanoids (R7)

Peer values and tags from [R7](research/R7-commercial-humanoids.md) §(a) and §(c). Peers publish peak torques only, and
most publish no continuous rating. Mk II values are [sim] unless marked.

| Metric | **K1 Mk II** | Peers (R7) |
|---|---|---|
| Height / mass | 1.75 m / 102.5 kg est. | Atlas 1.9 m / 90 kg [V23]; Digit 5 129 kg [R27]; GR-3 71 kg [V36]; H2 70 kg [V4]; Figure 03 61 kg [V17] |
| Whole-body payload | **30 kg sustained / 50 kg momentary** | Atlas 30 / 50 kg [V23]; Kepler K2 30 kg two-arm [R50]; Apollo 25 kg [R30]; Figure 03 20 kg [V17]; Digit 5 23 kg [V26] |
| One-arm payload | **15 kg** one-handed (elbow 90°); **10 kg** per hand at full reach | Atlas 20 kg one-handed [V23]; Kepler 15 kg per arm [R50]; H2 15 kg peak / 7 kg rated [V4]; NEO 8.2 kg [V32] |
| Knee peak at the joint | **415 N·m (20–40°) to 719 N·m (110°)** | AgiBot A2 512 [V54]; T800 450 (any joint) [V46]; GR-3 366 [V36]; H1/H2 360 [V1][V4] |
| Hip pitch peak / speed | **406 N·m; 15.2 rad/s** no-load at 52 V | GR-2/GR-3 366 N·m [V35][V36]; H1 220 N·m [V1], URDF 23 rad/s [V5] |
| Knee peak per kg of robot | 4.8 N·m/kg (493 actuator / 102.5); 4.0 at the joint near extension | H1 7.7; A2 7.4; GR-2 5.8; H2 5.1 (R7 §C1, ratio method) |
| Continuous / peak, main leg joints | **60 %** (knee 295 / 493, hip 243 / 406) | MyActuator X12-320 27 % (R1); air-cooled 25–30 % reported [R, R10 S20] |
| Battery | **2 × 1.15 kWh, hot-swap** | Figure 03 2.3 kWh [R19]; Kepler 2.33 kWh [R51]; GR-3 702 + 234 Wh hot-swap [V36]; Walker S2 dual packs, self-swap ≤ 3 min [V39] |
| Runtime | **4.9 h mixed, 4.3 h walking** | Figure 03 5 h [V17]; Atlas 4 h, 2 h heavy lifting [V23]; Apollo 4 h per pack [R29]; H2 3 h [V4] |
| Hands | **13 DOA, ≥ 200 N grasp, palm camera** [target] | Atlas 13 DOF, > 45 kg [R24]; F.02 16 DOF, 25 kg per hand [R20][R21]; Figure 03 palm camera, 3 g tactile [V18] |
| Ingress | **IP65 body / IP67 legs, hands; −20 to 40 °C** [target] | Atlas IP67, −20 to 40 °C [V23]; NEO hands IP68 [V32] |
| Bus | 16S, 52 V minimum loaded | H2 18S, 75.6 V max [V4]; H1 67.2 V max [V1] |

**Where Mk II stands.** On payload it reaches the Atlas/Kepler class in simulation. On sized continuous torque it leads
everything that publishes a number. It remains heavy (102.5 kg against 61–90 kg for most peers), so its torque per kg of
robot is below Unitree's, and its joint speed is below H1's. It is also the only design in the table with every limit
derived from simulated work cases and published.

### 5.1 Scorecard against the R7 upgrade targets

| # (R7 §d) | R7 Mk II target | Mk II as designed | Status |
|---|---|---|---|
| 1 | 30 kg sustained, 50 kg momentary, 15 kg one-handed | SQ / CW 30 kg, LM 50 kg, AO 15 kg, all margins ≥ 1.0 [sim] | **met in simulation**; 30 kg on stairs is not in the scenario set |
| 2 | knee and hip ≥ 480 N·m peak, ≥ 170 N·m continuous, ≤ 3.2 kg | knee 493 / 295 N·m at 4.96 kg; hip 406 / 243 N·m at 4.76 kg | torque met at the knee; hip peak below 480; **mass not met** |
| 3 | ≥ 2.3 kWh in two hot-swap halves, swap ≤ 3 min, ≥ 5 h mixed | 2 × 1.15 kWh (2.24 kWh on the power-budget basis), swap mechanism designed, 4.9 h | **partly** (runtime 0.98 of target) |
| 4 | ≥ 13 DOF hands, ≥ 200 N grasp, palm camera | 13 DOA, ≥ 200 N, palm camera | design target set; grasp arithmetic in docs/03 §8 |
| 5 | 10 kg per hand at full reach; shoulder ≥ 80 N·m continuous | AH 10 kg per hand; KH-25 119 N·m motor-continuous, C25 rated 80 N·m [VT] | met **if** the C25 rating is proven |
| 6 | IP65 body, IP67 legs and hands, −20 to 40 °C | sealing strategy, 40 % glycol (≈ −21 °C), pack heaters | designed, untested |
| 7 | ISO 9409 quick-change wrist | not in Mk II | not met |
| 8 | ≥ 2 kW autonomous charging | not in the Mk II mechanical baseline (docs/05) | not met here |
| 9 | hip ≥ 16 rad/s, knee actuator ≥ 14 rad/s | 15.2 / 12.5 rad/s | not met (hip close) |
| 10 | continuous ≥ 45 % of peak on knee, hip pitch, hip roll | 60 % / 60 % / 29 % | met on knee and hip pitch; hip roll stays air-cooled |
| 11 | ≤ 84 kg estimated; knee peak / mass ≥ 5.7 N·m/kg | 102.5 kg; 4.8 N·m/kg | **not met** |
| 12 | waist yaw ±160° | ±70° | not met |
| 13 | certified functional safety (PL d) | architecture unchanged (docs/05, docs/07) | outside this document |
| 14 | any leg actuator in ≤ 10 min | leg module off in ≈ 5 min via the V-band interface [target] | designed |
| 15 | palm cameras; 360° coverage | palm cameras in the hand; coverage in docs/06 | partly here |

The mass miss is the cost of the work loads: actuators +13.9 kg, battery +2.9 kg, cooling and hands +1.6 kg over K1
(docs/03 §14). The owner's priority is payload and uptime, not mass.

## 6. What "finished" means for Mk II

1. All 30 joints commissioned through gates G0–G9 (docs/11), with logged thermal margins including coolant temperatures.
2. Walks untethered at ≥ 0.8 m/s for 1 h, climbs 0.18 m stairs, recovers from a 20 N·s push.
3. Squat-lifts a 30 kg box to the chest and carries it 100 m at 0.6 m/s; lifts a 50 kg box from thigh height; holds
   10 kg per hand at full reach for 60 s; carries 15 kg in one hand.
4. Picks and places with either 13-DOA hand using perception (including the palm camera) and the skill API.
5. Swaps a battery pack in ≤ 3 min without shutting down, and runs ≥ 4.5 h of mixed duty on two packs.
6. Passes an IPX5 spray on the body and IPX7 immersion of a leg actuator and a hand.
7. A leg module comes off and goes back on in ≤ 10 min; every other module in ≤ 30 min with hand tools.

## 7. Biggest uncertainties (top 8; full register in docs/11)

| # | Uncertainty | Impact | How it is retired |
|---|---|---|---|
| 1 | Liquid-jacket thermal resistance (0.25 K/W is an estimate) | knee and hip continuous torque (scales with √F_cool) | first-article jacket test, pass ≤ 0.30 K/W (docs/13 §3.9; R10 §7.2) |
| 2 | 150 A GaN drive (HC2): vendor-press data, custom firmware; its 75 A continuous limit already caps continuous output below the motor rating | knee/hip peak and continuous | locked-rotor 150 A / 2 s and 99 A / 10 s (R10 §7.3); docs/04 §3 |
| 3 | Cycloid C25 / C20 ratings are validation targets; the contact screen leaves the C20 marginal (6 mm discs need hardened 100Cr6) | shoulder and elbow peak, impact survival | static overload, stiffness, efficiency, 10⁵-cycle endurance before ordering the rest (docs/13 §4.2) |
| 4 | Mass growth beyond +10 %: ≈ 2 kg of known items are not yet in `params.py`; hip-pitch peak margin is 1.12 | every leg requirement | weigh every module; re-run `run_all.py` (docs/03 §14) |
| 5 | Coolant loop: 5 joint crossings per leg, dry-break couplings, leaks near drives | leg duty, electronics | hose-loop cycling on the leg rig; leak tests; air-only derate on loss (docs/03 §9.6) |
| 6 | KW-L2 wrist actuator: motor data now verified (540 mN·m stall), but the ball-screw rating and the 24 V force–speed curve are not | 19 N·m wrist with a 10 kg payload | screw catalogue check (C_a ≥ 2 kN), force–speed test at 24 V (docs/13 §4.4) |
| 7 | Real gait differs from the ZMP model; shoulder speed margin 1.02, waist and elbow hold ratios 1.06 / 1.10 | arm speed, long holds | supported-walking and arm-dyno logs; brakes on shoulder and waist pitch (docs/04 §3, §8) |
| 8 | IP65/IP67 sealing untested; lip-seal drag affects torque estimation | ingress, force control | IPX5/IPX7 component tests, robot spray test (docs/03 §12) |

Prices are tracked in docs/12; most actuator lines are estimates or quotes.

## 8. Document map

| # | Deliverable | File |
|---|---|---|
| 1 | Concept | this file |
| 2 | Industrial design & views | [02-industrial-design.md](02-industrial-design.md) |
| 3 | Mechanical architecture | [03-mechanical-architecture.md](03-mechanical-architecture.md) |
| 4 | Actuator catalogue | [04-actuator-catalogue.md](04-actuator-catalogue.md) |
| 5 | Electrical architecture | [05-electrical-architecture.md](05-electrical-architecture.md) |
| 6 | Sensor architecture | [06-sensor-architecture.md](06-sensor-architecture.md) |
| 7 | Software architecture | [07-software-architecture.md](07-software-architecture.md) |
| 8 | Bill of materials | [08-bom.md](08-bom.md) · [`data/bom.csv`](../data/bom.csv) |
| 9 | Manufacturing package | [09-manufacturing-package.md](09-manufacturing-package.md) |
| 10 | Visual construction tutorial | [10-construction-tutorial/](10-construction-tutorial/README.md) |
| 11 | Testing & commissioning | [11-testing-commissioning.md](11-testing-commissioning.md) |
| 12 | Cost analysis | [12-cost-analysis.md](12-cost-analysis.md) |
| 13 | Scratch-build motors & actuators | [13-scratch-build-motors-actuators.md](13-scratch-build-motors-actuators.md) |
| — | Research notes with sources (R7 benchmark, R10 actuators) | [research/](research/) |
| — | Generated engineering tables | [generated/](generated/) |
