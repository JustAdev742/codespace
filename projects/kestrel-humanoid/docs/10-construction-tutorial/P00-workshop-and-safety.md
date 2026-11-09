# P00 — Workshop, safety and documentation setup

## A. Visual reference
* Safety architecture: [`diagrams/safety_chain.svg`](../../diagrams/safety_chain.svg)
* Test progression: [`diagrams/test_gates.svg`](../../diagrams/test_gates.svg)

Suggested floor plan (minimum ≈ 6 × 5 m):

```
+-----------------------------------------------------------+
|  BATTERY AREA (concrete floor, metal cabinet,  |  BENCH 1: electronics / soldering   |
|  sand bin, extinguisher, smoke detector,       |  (ESD mat, fume extraction)         |
|  2-bay charging shelf, pack trolley)           |                                     |
|------------------------------------------------+-------------------------------------|
|  BENCH 2: mechanical assembly, surface plate   |  DYNO (bolted to bench, guard box)  |
|  COOLANT STATION (drip tray, spill kit, fill   |  + coolant test cart beside it      |
|  pump, labelled coolant containers)            |                                     |
|------------------------------------------------+-------------------------------------|
|  TEST CAGE 4 × 3 m under the 2 t gantry (mesh panels 1.2 m, foam floor tiles)        |
|  operator position outside the cage, e-stop on a lanyard                              |
+-----------------------------------------------------------+
```

## B. Parts list

| BOM | Item | Qty |
|---|---|---|
| — | Metal flammables cabinet for cells/packs, smoke detector, Class D or large AVD/water-mist extinguisher, fire blanket, sand bin, steel pack-quarantine box with a lid | 1 set |
| — | Insulated hand tools rated 1000 V (IEC 60900): screwdrivers, hex keys, spanners, side cutters; insulating mat; Class 0 insulating gloves for pack work | 1 set |
| — | CAT III 1000 V multimeter, clamp meter (DC), non-contact thermometer | 1 each |
| — | ESD mat + wrist straps, fume extractor | 1 set |
| — | Coolant station: drip tray, absorbent pads and spill kit, nitrile gloves, eye protection, labelled HDPE containers for coolant (propylene glycol mix) and waste | 1 set |
| — | Labels, label printer, parts bins | — |
| B083 | Gantry + harness (built in P01) | 1 |

## C. Tools & equipment
See docs/12 §4 (instruments, hand tools, metrology). Mk II adds the insulated tool set, the coolant station and a
pack trolley (two packs at 5.9 kg each are carried by their handles, never by the connector).

## D. Manufacturing
None.

## E. Setup steps
1. Set up the **battery area** at least 2 m from exits and from flammables. Put a smoke detector over it and an
   extinguisher by the door. Give each pack its own shelf position with a label: serial, state of charge, last check.
2. Fit **ESD protection** at the electronics bench: drives, encoders and the Thor carrier are ESD-sensitive.
3. Set up the **coolant station** on the mechanical bench, below and away from the electronics bench. Coolant never
   goes on the electronics bench.
4. Start a **build log**: a git repository with `logs/YYYY-MM-DD.md`, every measurement, photos, part serial numbers,
   torque values and test results. Calibrations are versioned here (docs/07 §5).
5. Print the **gate checklist** (docs/11 §1) and the **design-hold list** (docs/09 §11). Sign each gate and each hold
   as it is cleared.
6. Agree the **two-person rule** with a helper for every powered test from G3 onward and for every pack swap.

## F. Electrical safety rules
* **The 16S bus is 48–67.2 V DC.** It is extra-low voltage under AS/NZS 3000 (≤ 120 V ripple-free DC) but above the
  60 V touch-safe limit, and each pack can deliver ≈ 1.2 kA into a short (67 V over ≈ 56 mΩ). Treat every bus
  conductor as live until measured below 5 V.
* **Two packs means two sources, and the e-stop is not an isolation.** The e-stop removes torque (STO) and, after
  0.5–1.5 s, opens the actuator-zone eFuses, but the logic bus (computers, pumps) stays live by design (docs/05 §8).
  Before working on the robot:
  1. turn the **keyed main switch** off (the power-path board sheds every path);
  2. pull **both** packs from the bay;
  3. wait 1 minute (bus capacitors discharge through the PDU bleed resistors);
  4. verify < 5 V between BUS+ and BUS− and between BUS+ and chassis.
  There is no mechanical service disconnect in Mk II: pulling both packs is the isolation.
* **A removed pack has dead terminals by design** (its in-pack FET switch opens when the pilot loop breaks).
  Verify it every time with a meter before you rely on it. A pack that shows voltage at its terminals off-robot is
  faulty: quarantine it.
* **DC arcs do not self-extinguish.** Never unplug a power connector under load. The pack connectors have sequenced
  pilot contacts so the pack switches off before the power pins separate; do not defeat them.
* Use insulated tools for all battery work. Remove rings and watches.
* Never short-circuit a cell or pack "to test it".

### Coolant safety rules
* The coolant is 30–40 % propylene glycol in deionised water with inhibitor: low toxicity, but **electrically
  conductive**. A leak onto a powered board can short 67 V. Fill, drain and open the loop only with both packs out.
* Keep the loop's fittings below and away from electronics; never let a hose run above a PCB.
* Wipe spills at once, then rinse the area with deionised water and dry it. If coolant reaches a board, it comes out
  for cleaning (IPA, ultrasonic if needed) and inspection before power is reapplied.
* Glycol is slippery on the cage floor: clean the floor before any standing or walking test.

### Machine-shop hazards new in Mk II
* **N50UH rotors** are stronger than K1's magnets: rotor-to-stator pull is several hundred newtons. Jigs only.
* **Titanium chips** can ignite: flood coolant, no dry grinding, clean the machine afterwards.
* **Hardened 100Cr6 parts and EDM work** are outsourced; when lapping cycloid discs, wear eye protection and use a
  dust extractor.

## G. Check
Walk through a dry run with your helper of: (a) a battery fire response, (b) an e-stop response, (c) a coolant spill on
the electronics bench, (d) removing both packs and proving the bus dead. Log it.
