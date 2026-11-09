# P01 — Test infrastructure: gantry, dynamometer, coolant cart, e-stop chain, bench power

## A. Visual reference
* Safety chain: [`diagrams/safety_chain.svg`](../../diagrams/safety_chain.svg)

Dynamometer layout (top view):

```
 [absorber ≥ 600 N·m]──[jaw coupling]──[FUTEK TRS605 1,000 N·m]──[jaw coupling]──[ACTUATOR UNDER TEST]
        bolted to 25 mm Al tooling plate, shafts aligned to 0.05 mm TIR, polycarbonate guard box over the whole line
        reaction: actuator housing bolted to an angle plate through its base-flange pattern (docs/09 §4)
        locked-output fixture: a steel reaction arm replaces the absorber for peak, locked-rotor and overload tests
```

Coolant test cart (stands in for the robot loop during P05 and P07 tests):

```
 reservoir ─► pump ─► flow sensor ─► T_in ─► P gauge ─► [QD] ─► JACKET(S) UNDER TEST ─► [QD] ─► T_out ─► radiator + fan ─► reservoir
                                     (thermocouples in tees, 0–4 bar gauge, bypass valve, drain valve, drip tray under everything)
```

## B. Parts list

| BOM | Item | Qty | Spec |
|---|---|---|---|
| B083 | Overhead gantry 2 t + trolley | 1 | ≥ 2.4 m clear under the beam, beam ≥ 4 m |
| B083 | Fall-arrest harness for the robot: chest + pelvis straps to the two lifting points, 6 mm Dyneema, shock-absorbing lanyard, chain hoist for height | 1 | every element rated ≥ 10 × the 112.7 kg design mass (≥ 1.13 t) |
| — | Lifting eyes DIN 580 **M12** (WLL 340 kg each) + key-locked steel thread inserts for 7075 | 2 + spare | replaces K1's M10 (WLL 230 kg); fall-arrest peaks reach ≈ 3 g |
| B084 | FUTEK TRS605 inline torque transducer with encoder, **1,000 N·m capacity version** | 1 | via Metromatics (AU); covers the KA-130K 493 N·m peak with margin (the BOM line says 500 N·m: too little) |
| B084 | Absorber for torque–speed maps: industrial servo + gearhead or a second KA-130K through a 2:1 reduction, **≥ 600 N·m** at the dyno shaft; hysteresis brake alternative ≥ 600 N·m | 1 | K1's ≥ 450 N·m is below the Mk II knee peak |
| B084 | Locked-output reaction arm (steel, 1 m) + calibrated weights for the lever check | 1 set | |
| B084 | Jaw couplings rated ≥ 1,000 N·m peak, 25 mm tooling plate, angle plate, guard box | 1 set | |
| B131 | Coolant cart (loop bench): 12 V pump (same class as the robot's), reservoir, 240 mm aluminium radiator + fan, turbine flow sensor 0.1–2 L/min, 2 × K-type thermocouples in tees, 0–4 bar gauge, bypass and drain valves, 2 dry-break QD pairs (same type as the robot), EPDM hose, drip tray | 1 | aluminium wetted parts only |
| — | Hand pump with 0–6 bar gauge and shut-off for pressure tests; soap solution; bucket for submersion tests | 1 | |
| B043 | FORT Wireless E-Stop Pro | 1 | |
| B044 | Safety relay + wired pendant | 1 | |
| — | Bench supply ≥ 70 V / ≥ 10 A programmable, **current-limited**, + DC electronic load + 8 Ω 100 W brake resistor on a clamp board; for the 150 A tests a second supply path: one built 16S4P pack through its own fuse and disconnect (P06) | 1 each | a bench supply cannot deliver the 150 A drive tests |
| B085 | Single-leg stand: vertical linear rail (HGR20 class) carrying a hip mount, base with 4 load cells, counterweight | 1 | sized for half of 112.7 kg plus 50 kg payload cases |

## C. Tools
Drill press, tap set, hoist, laser level, dial indicators (shaft alignment), torque wrench, crimp tools for 8 AWG.

## D. Manufacturing
* **Dyno plate:** 25 mm 6061 tooling plate with an M8 grid at 50 mm pitch. Mount the angle plate with the KA-130
  (PCD 125, 12× M5), **KA-110P (PCD 115, 12× M5)**, KA-90P (PCD 75, 8× M4) and KH base-flange patterns.
* **Robot lifting points:** two M12 lifting eyes, one on the pelvis bowl and one on the spine plate top rib, in
  key-locked steel inserts (thread engagement ≥ 1.5 d = 18 mm). Do not use wire thread inserts for lifting.
* **Leg stand:** carriage plate with the hip-yaw base pattern. The rail lets the hip move vertically only; a pneumatic
  counterweight (or bungee) offsets 70 % of the body weight.
* **Coolant cart:** mount everything on a steel tray with a 20 mm lip so a burst hose stays in the tray.

## E. Assembly
1. Install the gantry per its manual. **Load-test it at 1.25 × the 112.7 kg design mass (141 kg)** with sand bags for
   10 minutes.
2. Assemble the dyno line. Align the shafts to ≤ 0.05 mm TIR and ≤ 0.1° angular with dial indicators on the coupling
   hubs.
3. Wire the **e-stop chain** on a test board: FORT receiver + pendant + panel button in series → safety relay (dual
   channel) → two outputs: (a) STO pair to the drive under test, (b) enable input of the bench disconnect.
4. Add a **brake-resistor clamp** (comparator at 70 V on / 68 V off driving a 100 V MOSFET) across the bench bus. It
   absorbs regeneration when the supply cannot sink current.
5. Build and **pressure-test the coolant cart** on its own (2 bar, 15 min, no leak) before connecting any actuator.

## F. Electrical
* Dyno bus: bench supply (or test pack) → 30 A fuse (bench supply) / 125 A pack fuse (pack) → disconnect (enable =
  safety relay) → bus with clamp → drive under test + absorber drive. 8 AWG for the pack path.
* Torque transducer → its amplifier → USB/analog → a logging PC (≥ 1 kHz). Log actuator current, speed, winding and
  coolant temperatures, flow and torque together.
* Coolant-cart pump and fan on a separate 12 V supply, so the coolant keeps flowing when the actuator is e-stopped.

## G. Testing
| Test | Pass |
|---|---|
| E-stop: press each device while a test motor spins at 50 % speed | torque removed < 10 ms (scope the STO line and the phase current); latched until a deliberate reset |
| Wireless e-stop out of range / battery removed | stop within the configured heartbeat timeout; measure and log it (not published, R2) |
| Dyno torque calibration: 1 m lever arm + calibrated weights at 10, 100, 300 N·m | transducer within ±0.5 % FS |
| Locked-output arm: 500 N·m static on the arm | no visible deflection of the angle plate (< 0.1 mm at the arm root) |
| Gantry harness drop test with a **113 kg** sand dummy from 0.3 m slack | arrest without the dummy touching the floor; lanyard deploys as rated |
| Coolant cart: flow vs bypass setting; thermocouples in a common bath | 0.2–1.0 L/min adjustable; thermocouples agree within 0.3 °C |
