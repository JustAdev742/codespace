# 10 — Visual construction tutorial

![Exploded assembly](../../renders/12_exploded.png)

This is the step-by-step build guide. **All phases plus the commissioning, manufacturing and scratch-build
appendices in one illustrated file: [KESTREL-K1-build-tutorial.pdf](KESTREL-K1-build-tutorial.pdf)**
(regenerate it with `make_handbook.py`). Work through the phases **in order**. Each phase ends
in a test gate (docs/11). Do not start a phase until the previous gate has passed and been logged.

## How each phase is laid out

| Section | Contents |
|---|---|
| **A. Visual reference** | renders, cutaways, diagrams, CAD files and drawing sheets for this phase |
| **B. Parts list** | every part with its BOM ID (`data/bom.csv`), quantity, specification, make/buy |
| **C. Tools & equipment** | what you need on the bench |
| **D. Manufacturing** | how to make the custom parts: material, process, tolerances, finishing |
| **E. Assembly** | ordered steps with orientation, fasteners, torques, adhesives, alignment |
| **F. Electrical** | wiring, connectors, pinouts, voltages, precautions |
| **G. Testing** | the bench test that proves the assembly before it goes into the robot, with pass criteria |

## Phase map

| Phase | What you build | Gate |
|---|---|---|
| [P00](P00-workshop-and-safety.md) | Workshop layout, lithium safety, electrical safety rules, documentation system | — |
| [P01](P01-test-infrastructure.md) | Gantry + fall-arrest harness, actuator dynamometer, e-stop chain, bench power | — |
| [P02](P02-electronics-bringup.md) | RT computer + EtherCAT master, drive carrier PCB, safety MCU, one drive spinning one motor | G0 |
| [P03](P03-actuator-KA90P-KA110P.md) | KA-90P (first article), then KA-110P: planetary actuators with commercial frameless motors | G1 |
| [P04](P04-actuator-KH.md) | KH-25 / KH-20 / KH-14 strain-wave actuators with torque flexures | G1 |
| [P05](P05-actuator-KA130.md) | KM-130 custom motors and KA-130K / KA-130H actuators | G1 |
| [P06](P06-battery-pack.md) | 16S6P battery pack, BMS, solid-state disconnect | G0 (pack) |
| [P07](P07-legs.md) | Hip, thigh with knee four-bar, shank with ankle push-rods, foot | G2 |
| [P08](P08-pelvis-waist-torso.md) | Pelvis, waist, torso frame, power distribution, compute | G2/G3 |
| [P09](P09-arms-wrists.md) | Shoulders, upper arms, elbows, forearms, wrist linear actuators | G2 |
| [P10](P10-hands.md) | Hands: palm actuators, finger linkages, tactile sensors, controller | G2 |
| [P11](P11-head-neck-sensors.md) | Neck, head frame, cameras, LiDAR, calibration | G3 |
| [P12](P12-harness-shells-final-assembly.md) | Harness, cooling ducts, shells, final assembly and inspection | G3 |
| [P13](P13-software-bringup.md) | Software bring-up and progressive commissioning (hand-off to docs/11 G3–G9) | G3–G9 |

## Why this order

1. **Rigs and safety before anything moves.** The gantry, e-stop chain and dyno are the tools that
   make every later test safe and measurable.
2. **One of each actuator class first.** The first article proves the design (Kt, efficiency, thermal
   behaviour, backlash) before you buy 13 more gear sets. Results feed back into `calc/kestrel/actuators.py`.
3. **Simplest risk first.** KA-90P (commercial motor, simplest planetary) comes before the custom KM-130 motor.
4. **Limbs before the body.** Each limb is tested clamped on a stand before it carries the robot's weight.

## Non-negotiable safety rules (repeat them to yourself every session)

* The pack and the service disconnect are **out** before you touch any connector, shell or harness.
* No powered motion of a limb or the robot without the **e-stop in hand** and a second person present for G3 onward.
* No walking tests without the **gantry harness** attached until gate G6 says otherwise.
* Charge batteries only when supervised, on a non-flammable surface, in the battery area.
* Spring-loaded or magnetised parts (rotors, magnets) are handled with jigs, never fingers.
* High-torque joints are pinch hazards. Keep hands out of joint envelopes whenever drives are enabled, even in "zero torque".
