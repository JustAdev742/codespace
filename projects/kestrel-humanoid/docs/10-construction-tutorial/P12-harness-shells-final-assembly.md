# P12 — Harness, cooling, shells and final assembly

## A. Visual reference
* Fully assembled: [`renders/05_threequarter_front.png`](../../renders/05_threequarter_front.png), [`renders/06_threequarter_rear.png`](../../renders/06_threequarter_rear.png)
* Exploded (shell panel splits): [`renders/12_exploded.png`](../../renders/12_exploded.png)
* Ghost (shells over the structure): [`renders/14_ghost_threequarter.png`](../../renders/14_ghost_threequarter.png)
* Shell STEP files: `cad/out/step/*front*.step`, `*rear*.step`, `torso__chest_plate.step`, `torso__abdomen_plate.step`, `torso__back_door.step`, `pelvis__pelvis_*.step`, `l_shoulder__deltoid_cap.step`, `head__head_shell.step`, `l_foot__foot_shell.step`

## B. Parts list

| BOM | Item | Qty |
|---|---|---|
| B073 | MJF PA12 shells (≈ 42 panels) | 1 set |
| B074 | Primer + 2K satin warm-white + matte graphite + clearcoat (shop) | 1 |
| B076 | N52 disc magnets Ø10 × 3 + steel pads, captive M3 quarter-turn studs, M3 heat-set inserts, 3 mm silicone isolators | 1 set |
| B077 | Waist bellows, ankle gaiters | 3 |
| B078/B079 | Harness wire, connectors, sleeving, heat-shrink, P-clips, labels | 1 set |
| B080 | Duct filters | 6 |

## C. Tools
Heat-set insert iron, harness nail-board (printed 1:1 from the CAD routing), crimp tools, insulation tester, label printer, paint shop (outsourced) or a spray booth.

## D. Manufacturing
* **Shells:** order the STEP files from an MJF bureau (KAD3D / Formero AU [R6]).
  1. **Before printing, add bosses:** Ø6 × 6 mm with a Ø4.2 hole for M3 heat-set inserts, every 100–150 mm along the edges, matching the frame standoffs.
  2. Bead blast, or vapour smooth for a premium finish.
  3. Fit-check every panel on the robot **before** painting.
  4. Paint: adhesion promoter → 2K primer → satin warm white (25–30 GU) on the shells, matte graphite on the joint caps, soft clearcoat.
  5. Mask the magnet and insert locations.
* **Light guides:** machined clear PC with diffuser film; amber LED strips (2.2 mm) behind.

## E. Assembly
1. **Harness:**
   - Build each zone harness on the nail-board.
   - Label both ends (zone-joint-function).
   - Test continuity 100 % and insulation at 500 V (> 100 MΩ).
   - Install through the hollow bores; P-clip every 80 mm.
   - Leave service loops at every joint (a 30 mm loop each side of each actuator).
2. **Cooling:** fit the torso and thigh ducts and filters. Run the blowers and check the airflow direction with a smoke pen.
3. **Bellows and gaiters:** waist bellows clamped to the pelvis and torso rims; ankle gaiters over the push-rods.
4. **Shells:**
   - Press heat-set inserts into the bosses.
   - Fit silicone isolators on the frame standoffs.
   - Mount the inner panels with screws, the service panels with quarter-turn studs + magnets.
   - Check the 1.0 ± 0.3 mm panel gaps with feeler gauges, and that no shell touches a moving part through the full range of motion (run the range slowly with the shells on).
5. **Final torque audit:** re-torque every actuator flange (KA-130 M5 8.5 N·m, KA-110/90/KH-25 M4 4.5 N·m) and apply paint-pen witness marks.
6. **Weigh:** full robot and each module. **If mass > 92.6 kg (the design mass), update `params.py` and re-run `calc/run_all.py` before commissioning.**

## F. Electrical
* Final insulation test: bus → chassis with the star bond lifted (> 10 MΩ at 500 V), then refit the bond.
* Light LEDs on the 12 V rail through the safety MCU (status protocol: docs/02 §7).
* Verify that every connector is IP2X (finger test) and latched.

## G. Inspection before commissioning
| Check | Pass |
|---|---|
| Range of motion with shells on, all joints | no contact, gaps maintained |
| Mass and CoM (two-scale method in the zero pose) | mass ≤ 92.6 kg; CoM height 0.95–1.03 m |
| Thermal soak: stand idle 30 min hanging in the gantry, all systems on | all temperatures within limits |
| Water/dust: light spray on shells (IPX4-style hand spray, 5 min) with power **off** | no water inside the torso/actuators after opening |
| Documentation: build log complete, serials recorded, calibration files committed | — |
