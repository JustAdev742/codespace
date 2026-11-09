# P12 — Harness, shells, final leak check and final assembly

## A. Visual reference
* Fully assembled: [`renders/05_threequarter_front.png`](../../renders/05_threequarter_front.png), [`renders/06_threequarter_rear.png`](../../renders/06_threequarter_rear.png)
* Exploded (shell panel splits): [`renders/12_exploded.png`](../../renders/12_exploded.png)
* Ghost (shells over the structure): [`renders/14_ghost_threequarter.png`](../../renders/14_ghost_threequarter.png)
* Shell STEP files: `cad/out/step/*front*.step`, `*rear*.step`, `torso__chest_plate.step`, `torso__abdomen_plate.step`, `torso__back_door.step`, `pelvis__pelvis_*.step`, `l_shoulder__deltoid_cap.step`, `head__head_shell.step`, `l_foot__foot_shell.step`
* Sealing zones (IP65 body, IP67 legs and hands): docs/03 §12; routing through joints: docs/03 §11

## B. Parts list

| BOM | Item | Qty |
|---|---|---|
| B073 | MJF PA12 shells (≈ 42 panels), including the two gasketed battery hatches in the back door and the radiator grille | 1 set |
| B074 | Primer + 2K satin warm-white + matte graphite + clearcoat (shop) | 1 |
| B076 | N52 disc magnets Ø10 × 3 + steel pads, captive M3 quarter-turn studs, M3 heat-set inserts, 3 mm silicone isolators | 1 set |
| B077 | Waist bellows, ankle gaiters | 3 |
| B078/B079 | Harness wire (8/10/12/14/16 AWG silicone), igus chainflex CF Robot, connectors (SurLok Plus, XT60H, XT30, Gecko-MT, JST GH, IP67 sensor connectors), sleeving, heat-shrink, P-clips, labels | 1 set |
| B080 | Electronics-blower filters | 2 |
| — | EPDM D-profile hatch gaskets, PTFE drain plugs for the limbs | 1 set |

## C. Tools
Heat-set insert iron, harness nail-board (printed 1:1 from the CAD routing), crimp tools, insulation tester, label
printer, paint shop (outsourced) or a spray booth, pressure-test kit and refractometer (P08.1).

## D. Manufacturing
* **Shells:** order the STEP files from an MJF bureau (KAD3D / Formero AU [R6]).
  1. **Before printing, add bosses:** Ø6 × 6 mm with a Ø4.2 hole for M3 heat-set inserts, every 100–150 mm along the
     edges, matching the frame standoffs; add the battery hatches (2 quarter-turn fasteners each, EPDM gasket) and the
     radiator inlet/outlet grilles of the wet duct.
  2. Bead blast, or vapour smooth for a premium finish.
  3. Fit-check every panel on the robot **before** painting, with the hoses and service loops in place.
  4. Paint: adhesion promoter → 2K primer → satin warm white (25–30 GU) on the shells, matte graphite on the joint caps,
     soft clearcoat.
  5. Mask the magnet and insert locations.
* **Light guides:** machined clear PC with diffuser film; amber LED strips (2.2 mm) behind.

## E. Assembly
1. **Harness:**
   - build each zone harness on the nail-board; label both ends (zone-joint-function);
   - test continuity 100 % and insulation at 500 V (> 100 MΩ);
   - install in the service loops (P07 §F, P09 §F); P-clip every 80 mm; 30 mm slack each side of every joint;
   - sensor and leak wiring above the coolant lines, never below; nothing electrical under a coolant fitting.
2. **Cooling recheck:** with both packs out, inspect every hose loop for rub marks after the G2/G3 runs; check the loop
   pressure (0.3 bar cold), glycol concentration and that the compensator is mid-stroke. Run the electronics blowers
   and the radiator fans and check the airflow direction with a smoke pen.
3. **Bellows and gaiters:** waist bellows clamped to the pelvis and torso rims over the hose clock-spring; ankle gaiters
   over the push-rods.
4. **Shells:**
   - press heat-set inserts into the bosses;
   - fit silicone isolators on the frame standoffs;
   - mount the inner panels with screws, the service panels with quarter-turn studs + magnets;
   - check the 1.0 ± 0.3 mm panel gaps with feeler gauges, and that no shell touches a moving part or a hose through
     the full range of motion (run the range slowly with the shells on).
5. **Final torque audit:** re-torque every actuator flange and apply paint-pen witness marks: KA-130 12 × M5 8.5 N·m;
   **KA-110P 12 × M5 8.5 N·m**; KA-90P, KH-25, **KH-20** 8 × M4 4.5 N·m; KH-14 6 × M3 1.7 N·m; V-band T-bolts 10 N·m
   (legs) with the safety catches closed.
6. **Weigh:** full robot and each module. **If the mass exceeds 113.7 kg (the design mass; the estimate is 103.3 kg),
   update `params.py` and re-run `calc/run_all.py` before commissioning.** Expect the loop (+0.3 kg) and the pack
   enclosures (docs/09 H12) to push it up.

## F. Electrical
* Final insulation test: bus → chassis with the star bond lifted (> 10 MΩ at 500 V), then refit the bond. Both packs
  out, keyed main switch off.
* LEDs on the 12 V logic bus through the safety MCU (status protocol: docs/02 §7); pack-bay LEDs from the PPM.
* Verify that every connector is IP2X (finger test) and latched, and every unmated connector capped.

## G. Inspection before commissioning
| Check | Pass |
|---|---|
| Range of motion with shells on, all joints | no contact, gaps maintained, no hose or coax strain |
| Mass and CoM (two-scale method in the zero pose) | mass ≤ 113.7 kg; CoM within ±20 mm of the `calc` model (re-run with the measured mass) |
| Thermal soak: 30 min hanging in the gantry, all systems on, pumps running | all temperatures within limits; coolant supply ≤ 40 °C at 25 °C ambient |
| Coolant: pressure after the soak and a full range-of-motion run | 0.3 ± 0.05 bar cold; no damp on any leak pad |
| Pack swap with the shells on (robot in the gantry, drives in STO) | ≤ 3 min; hatches seal |
| Water: light spray on the shells (IPX4-style hand spray, 5 min) with power **off** and both packs out | no water inside the torso core, the actuators or the pack bays after opening (the IP65/IP67 tests of docs/03 §12 come later) |
| Documentation: build log complete, serials recorded, calibration files committed, design holds signed off | — |
