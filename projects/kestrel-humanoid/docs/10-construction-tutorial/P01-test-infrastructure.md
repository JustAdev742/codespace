# P01 — Test infrastructure: gantry, dynamometer, e-stop chain, bench power

## A. Visual reference
* Safety chain: [`diagrams/safety_chain.svg`](../../diagrams/safety_chain.svg)

Dynamometer layout (top view):

```
 [absorber motor + drive]──[jaw coupling]──[FUTEK TRS605 torque transducer]──[jaw coupling]──[ACTUATOR UNDER TEST]
        bolted to 25 mm Al tooling plate, both shafts aligned to 0.05 mm, polycarbonate guard box over the whole line
        reaction: actuator housing bolted to an angle plate through its base flange pattern (docs/09 §4)
```

## B. Parts list

| BOM | Item | Qty | Spec |
|---|---|---|---|
| B083 | Overhead gantry 2 t + trolley | 1 | ≥ 2.4 m clear under the beam, beam ≥ 4 m |
| B083 | Fall-arrest harness for the robot: chest + pelvis straps tied to lifting points on the torso frame and pelvis bowl, 6 mm Dyneema, shock-absorbing lanyard, chain hoist for height | 1 | rated ≥ 10× robot mass |
| B084 | FUTEK TRS605 inline torque transducer (1–1000 N·m class, encoder) | 1 | via Metromatics (AU) |
| B084 | Absorber: a spare KA-130-class motor + drive, or a hysteresis brake ≥ 450 N·m peak via a 1:1 coupling | 1 | regenerates into the bench supply / brake resistor |
| B084 | Jaw couplings, 25 mm tooling plate, angle plate, guard box | 1 set | |
| B043 | FORT Wireless E-Stop Pro | 1 | |
| B044 | Safety relay + wired pendant | 1 | |
| — | Bench supply ≥ 70 V / ≥ 10 A programmable + DC load + 8 Ω 100 W brake resistor on a clamp board | 1 each | |
| B085 | Single-leg stand: vertical linear rail (HGR20 class) carrying a hip mount, base with 4 load cells | 1 | |

## C. Tools
Drill press, tap set, hoist, laser level, dial indicators (shaft alignment), torque wrench.

## D. Manufacturing
* **Dyno plate:** 25 mm 6061 tooling plate with an M8 grid at 50 mm pitch. Mount the angle plate with the KA-130 (PCD 125), KA-110/90 and KH base-flange patterns.
* **Robot lifting points:** two M10 lifting eyes, one on the pelvis bowl and one on the spine plate top rib. Both are designed in the CAD; check thread engagement ≥ 1.5 d in 7075.
* **Leg stand:** carriage plate with the hip-yaw base pattern. The rail lets the hip move vertically only, and a pneumatic counterweight (or bungee) offsets 70 % of the body weight.

## E. Assembly
1. Install the gantry per its manual. Load-test it at 1.25× the robot design mass (115 kg) with sand bags for 10 minutes.
2. Assemble the dyno line. Align the shafts to ≤ 0.05 mm TIR and ≤ 0.1° angular, using dial indicators on the coupling hubs.
3. Wire the **e-stop chain** on a test board: FORT receiver + pendant + panel button in series → safety relay (dual channel) → two outputs: (a) STO pair to the drive under test, (b) enable input of the bench disconnect.
4. Add a **brake resistor clamp** (comparator at 70 V on / 68 V off driving a 100 V MOSFET) across the bench bus. It absorbs regeneration when the supply can't sink current.

## F. Electrical
* Dyno bus: bench supply → 30 A fuse → bench contactor/disconnect (enable = safety relay) → bus with clamp → drive under test + absorber drive.
* Torque transducer → its amplifier → USB/analog → a logging PC (≥ 1 kHz). Log actuator current, speed, temperature and torque together.

## G. Testing
| Test | Pass |
|---|---|
| E-stop: press each device while a test motor spins at 50 % speed | torque removed < 10 ms (scope the STO line and the phase current); latched until a deliberate reset |
| Wireless e-stop out of range / battery removed | stop within the configured heartbeat timeout; measure and log it (not published, R2) |
| Dyno torque calibration: 1 m lever arm + calibrated weights at 10, 50, 100 N·m | transducer within ±0.5 % FS |
| Gantry harness drop test with a 93 kg sand dummy from 0.3 m slack | arrest without the dummy touching the floor; lanyard deploys as rated |
