# P00 — Workshop, safety and documentation setup

## A. Visual reference
* Safety architecture: [`diagrams/safety_chain.svg`](../../diagrams/safety_chain.svg)
* Test progression: [`diagrams/test_gates.svg`](../../diagrams/test_gates.svg)

Suggested floor plan (minimum ≈ 6 × 5 m):

```
+-----------------------------------------------------------+
|  BATTERY AREA (concrete floor, metal cabinet,  |  BENCH 1: electronics / soldering   |
|  sand bin, extinguisher, smoke detector)       |  (ESD mat, fume extraction)         |
|------------------------------------------------+-------------------------------------|
|  BENCH 2: mechanical assembly, surface plate   |  DYNO (bolted to bench, guard box)  |
|------------------------------------------------+-------------------------------------|
|  TEST CAGE 4 × 3 m under the 2 t gantry (mesh panels 1.2 m, foam floor tiles)        |
|  operator position outside the cage, e-stop on a lanyard                              |
+-----------------------------------------------------------+
```

## B. Parts list

| BOM | Item | Qty |
|---|---|---|
| — | Metal flammables cabinet for cells/packs, smoke detector, Class D or large AVD/water-mist extinguisher, fire blanket, sand bin | 1 set |
| — | ESD mat + wrist straps, fume extractor | 1 set |
| — | Labels, label printer, parts bins | — |
| B083 | Gantry + harness (built in P01) | 1 |

## C. Tools & equipment
See docs/12 §4 (instruments, hand tools, metrology).

## D. Manufacturing
None.

## E. Setup steps
1. Set up the **battery area** at least 2 m from exits and from flammables. Put a smoke detector over it and an extinguisher by the door.
2. Fit **ESD protection** at the electronics bench: drives, encoders and the Thor carrier are ESD-sensitive.
3. Start a **build log**: a git repository with `logs/YYYY-MM-DD.md`, every measurement, photos, part
   serial numbers, torque values and test results. Calibrations are versioned here (docs/07 §5).
4. Print the **gate checklist** (docs/11 §1) and sign each gate.
5. Agree the **two-person rule** with a helper for every powered test from G3 onward.

## F. Electrical safety rules
* The robot bus is 48–67.2 V DC: extra-low voltage, but above the 60 V touch-safe level and able to
  deliver kiloamps into a short. Treat every bus conductor as live until measured below 5 V.
* Before working on the robot: open the manual service disconnect, remove the pack, then wait 1 minute
  (bus capacitors discharge through the bleed resistors on the PDU). Verify < 5 V with a meter.
* Use insulated tools for all battery work. Remove rings and watches.
* Never short-circuit a cell or pack "to test it".

## G. Check
Walk through a dry run of a battery fire response and an e-stop response with your helper. Log it.
