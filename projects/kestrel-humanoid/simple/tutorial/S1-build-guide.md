# KESTREL S1 build guide

This is the simple guide to building KESTREL S1, from a parts list to a robot taking its first steps in a gantry.
S1 is built from parts you can order: off-the-shelf actuator modules, aluminium tube and extrusion, laser-cut
plates, a 48 V e-bike-class battery and a small computer. No shells, no custom motors, no machined housings.

Work through the steps in order. Every step ends with a **check**. Do not start the next step until the check
passes.

| | |
|---|---|
| What you get | A 1.75 m humanoid with 27 actuated joints and two grippers. It is sized in simulation to walk at 0.8–1.0 m/s, climb 18 cm stairs and squat with a 20 kg box. |
| Parts cost | about A$38,000, or about A$31,300 with a budget wireless e-stop ([../generated/bom.md](../generated/bom.md)) |
| Build time | about 150–250 hours for one person, spread over 2–3 months including lead times |
| Skills | careful mechanical assembly, basic electronics (crimping, soldering, a multimeter), Linux command line |
| Tools | metric hex keys and a torque driver (1–10 N·m), tap set M3–M6, drill press, hacksaw or drop saw with an aluminium blade, deburring tool, crimpers (JST-GH, Amass XT, ferrules), soldering iron, multimeter, bench power supply with current limit (60 V / 5 A), a USB-CAN adapter |

The detail behind each step:

| Topic | Document |
|---|---|
| Parts and prices | [../generated/bom.md](../generated/bom.md) |
| Plate, tube and fastener list | [../cad/out/cut_list.md](../cad/out/cut_list.md) |
| Laser-cut files | `../cad/out/dxf/` |
| 3D models | `../cad/out/step/` |
| Wiring, e-stop, CAN | [../docs/S1-electrical.md](../docs/S1-electrical.md) |
| Software | [../docs/S1-software.md](../docs/S1-software.md) |
| Why each actuator was chosen | [../generated/actuator_selection.md](../generated/actuator_selection.md) |

---

## Step 0: Safety rules (read them every session)

1. **48 V is low voltage but not harmless.** A 13S pack can deliver hundreds of amps into a short, and that
   welds tools and starts fires. Remove the battery before touching any wiring. Charge only on a non-flammable
   surface, supervised.
2. **Joint actuators are powerful.** The knee produces over 400 N·m. Keep hands out of any joint whenever the
   actuator bus is live, even when the software says "zero torque".
3. **E-stop first.** The hardware e-stop loop (Step 8) is wired and tested before any actuator moves on the
   robot.
4. **Gantry for every walking test.** Hang the robot from an overhead gantry or engine-crane harness with the
   rope just slack, until it has proven itself many times.
5. **Two people from the first powered motion.** One holds the e-stop and does nothing else.

---

## Step 1: Order the parts

1. Order from the BOM in this order, longest lead time first:
   1. **Actuators:** 4 × MyActuator RMD-X12-P20-320, 13 × RobStride RS04, 4 × RS03, 4 × RS02, 4 × RS00. That is
      two RS00 for the neck and two for the grippers.
   2. **Battery and power parts:** pack, contactor, fuses, precharge resistor, DC-DCs, e-stop devices.
   3. **Laser-cut plates:** send the whole `../cad/out/dxf/` folder. Each filename carries the quantity.
   4. **Tube, extrusion, bearings, rod ends, belts and pulleys:** from the cut list.
   5. **Compute, CAN interfaces, IMU, cameras.**
   6. **Fasteners:** the cut list gives the counts by size. Buy 20 % extra.
2. RobStride modules are stocked in Australia (Pakronics); the MyActuator X12s ship from China. Allow 2–4 weeks.
3. While parts arrive, set up the computer and the software (Step 9.1). That can be done without the robot.

**Check:** every BOM line is ticked off and every actuator powers up on the bench (Step 3).

---

## Step 2: Make the parts

1. **Plates.** Order 6061-T6 laser- or waterjet-cut plates from the DXF files (Cut Fold Direct, Victoria, quotes
   instantly). Ask for the holes to be cut, not marked.
   * Deburr every edge and hole.
   * Tap the holes the cut list marks as threaded.
   * Drill dowel holes from the actuator itself where the cut list says "drill from the part".
2. **Tubes and extrusions.**
   * Cut the Ø40 × 3 and Ø30 × 2 tubes, and the 2040/4040 extrusions, to the lengths in the cut list, square
     to ±0.2 mm.
   * Face the ends and deburr them.
   * Tap the extrusion end holes M5.
3. **Clamp blocks.** Machine them in 6061, or print them in PA12-CF/PETG-CF (cut list §3). Printed blocks are
   fine on the arms. On the legs use machined blocks, or printed ones at 100 % infill with steel inserts.
4. **Machined parts.** The cut list §4 lists the few lathe/mill parts: knee shaft, pulley bosses and actuator
   hubs. Any local machine shop can make them from the STEP files.
5. **Printed parts** (cut list §5).

**Check:** lay every part out on a table against the cut list. Check each bearing seat with the bearing itself,
which must be a light press or push fit as specified.

---

## Step 3: Bench-test and set up every actuator *before* assembly

Doing this on the bench saves days later. Never assemble an actuator you have not tested.

1. Wire one actuator to the bench supply, set to 48 V with a 3 A current limit, and to the USB-CAN adapter at
   1 Mbit/s. Pinouts and connector types are in [S1-electrical §11](../docs/S1-electrical.md).
2. **Update firmware** with the maker's tool. Use the same version on every unit of a type.
3. **Assign its CAN ID** from the table below, then label the actuator with that ID straight away.

   | Bus | IDs |
   |---|---|
   | Left leg | hip yaw 11, hip roll 12, hip pitch (X12) 13, knee (X12) 14, ankle A 15, ankle B 16 |
   | Right leg | 21–26, same order |
   | Left arm | shoulder pitch 31, shoulder roll 32, shoulder yaw 33, elbow 34, wrist yaw 35, wrist pitch 36 |
   | Right arm | 41–46, same order |
   | Torso | waist yaw 51, neck yaw 52, neck pitch 53, left gripper 54, right gripper 55 |

4. **Set the CAN timeout** (watchdog) on every unit, so it stops when commands stop: S1-electrical §11.4.
5. **Spin test.** In position mode with low gains, move ±90° and back. Listen for grinding, and check the
   encoder reading follows.
6. **Torque test.** Bolt a 0.5 m lever to the output and press on a bathroom or luggage scale, in torque mode at
   a low command (e.g. 20 N·m for an RS04). The reading must match within about 10 %. This is the only check
   that the catalogue numbers apply to your units.
7. Record the results in a log: ID, serial number, firmware version, torque reading.

**Check:** all 29 actuators pass, are labelled, and are logged. Any unit that fails goes back now.

---

## Step 4: Build the pelvis and torso

1. Assemble the **pelvis**: the 2040 box, the 4040 hip cross-member and the pelvis plate (`pelvis_plate`). Use
   T-nuts and M5 socket-head screws at 6 N·m with medium threadlocker (Loctite 243).
2. Fit the **waist-yaw RS04** (ID 51) through its adapter plate, with the thin-section support bearing
   (61812-2RS) as drawn. Then fit the waist mount plate.
3. Build the **torso box**: 4 × 2040 uprights, the base, shoulder and top plates. Square it diagonally before
   the final tightening; the two diagonals must agree within 1 mm.
4. Fit the **battery tray** and its retaining strap, and the **electronics plate**. Do not fit the battery yet.
5. Bolt the torso to the waist mount.

**Check:** the waist turns smoothly by hand over ±70° with no rub, and the torso is square.

---

## Step 5: Build one leg, test it, then build the other

Build the **left leg completely** and test it clamped to the bench before starting the right one.

1. **Hip yaw.** Bolt the hip-yaw RS04 (ID 11) to the pelvis through its adapter plate. Fit the yaw top plate and
   the front and rear arms, and the support bearing.
2. **Hip roll.**
   * Mount the hip-roll RS04 (ID 12) on its actuator plate.
   * Fit the 35 mm crank on its output and the 70 mm lever on the roll trunnion, joined by a push-rod with M8
     rod ends. Use one left-hand and one right-hand thread so the length adjusts by turning the rod.
   * Set the length so the leg hangs straight when the actuator reads zero.
3. **Hip pitch.** Mount the hip-pitch X12 (ID 13) in the hip cradle, coaxial with the hip centre, with the
   outboard 6808 bearing in the inner cheek. Its output drives the thigh directly.
   * **Fit the 40 mm fan** (12 V) on its bracket so it blows across the X12 housing.
   * Its continuous rating depends on that fan. Without it the hip overheats on long walks.
4. **Thigh and knee belt.**
   1. Mount the knee X12 (ID 14) in the upper thigh, on the knee-actuator bulkhead, with its 32-tooth HTD-8M
      pulley and the outboard 6808 bearing.
   2. Fit the knee shaft with its two 6005-2RS bearings and the 48-tooth knee pulley on the shank side.
   3. Fit the HTD 752-8M-30 belt.
   4. **Tension it:** slide the bulkhead along its slotted holes until the belt deflects about 5 mm under a firm
      thumb press at mid-span (about 40 N), then tighten.
   5. Re-check after the first hour of running.
5. **Shank and ankle.**
   1. Mount the two ankle RS04s (IDs 15 and 16) on the calf plates with their 40 mm cranks.
   2. Fit the ankle cross on its 6003 bearings and igus bushings.
   3. Connect the two push-rods (M8 rod ends) from the 40 mm cranks to the **65 mm** foot levers. The 1.25:1 lever
      ratio is what gives the ankle enough torque.
   4. Adjust both rods so the foot sits flat and level when both ankle actuators read zero.
6. **Foot.** Assemble the sole plate, side rails and roll clevises. Contact-cement the rubber sole. Fit the four
   foot contact sensors.
7. **Bench test the leg.**
   * Clamp the hip to the bench and connect only this leg's CAN bus and power.
   * Run each joint slowly through its full range in position mode. Watch for cable snags and plate rub.
   * Then hold the foot and command small torques. The hip roll, knee and ankle must feel smooth and free of
     play.

**Check:** full range on all six joints with no rub; the belt runs centred on its pulleys; no play you can feel
at the foot. Now build the right leg the same way, as a mirror image.

---

## Step 6: Build the arms and grippers

1. **Shoulder.** Shoulder pitch RS04 (ID 31) on the torso shoulder plate; shoulder roll RS04 (ID 32) on the
   shoulder pitch plate; shoulder yaw RS03 (ID 33) below it.
2. **Upper arm and elbow.** The Ø40 tube goes in its clamp blocks, then the elbow RS03 (ID 34) and the elbow
   plates.
3. **Forearm and wrist.** The Ø30 tube, then wrist yaw RS02 (ID 35) and wrist pitch RS02 (ID 36). Fit the
   ISO 9409-1-50 tool flange plate.
4. **Gripper.** On the gripper base plate:
   * the RS00 (IDs 54/55) drives a module-1 20-tooth pinion between two racks on 8 mm guide rods with LM8UU
     bushings;
   * the jaws open and close symmetrically.

   Bolt the gripper to the tool flange: 4 × M6.
5. Repeat for the right arm (IDs 41–46).

**Check:** each arm moves through its range without hitting the torso; the gripper opens and closes fully and
grips a 1 kg bottle firmly at a low torque setting.

---

## Step 7: Neck and head

1. Neck yaw RS00 (ID 52) on the torso top plate; neck pitch RS00 (ID 53) on the neck plates.
2. Assemble the head plates and fit the depth camera, the wide camera, the microphone and the status LEDs.
3. Route the camera USB/GMSL cable through the neck with a service loop.

**Check:** the head turns ±80° and nods without pulling its cable.

---

## Step 8: Wire it

Follow [S1-electrical](../docs/S1-electrical.md) exactly; this is the summary. **The battery stays out until the
last check.**

1. **Power path** (S1-electrical §4): battery → main fuse → precharge resistor and contactor (TE EV200 class) →
   48 V bus bars → a fused branch to each limb.
2. **Charge limit:** the X12 is rated to 55 V and a full 13S pack is 54.6 V. **Set the charger to stop at
   53.3 V** until MyActuator confirms a higher limit.
3. **Regen clamp** (§5): fit the braking/TVS clamp that holds the bus below 54.3 V when the legs brake.
4. **Compute supply** (§4): a separate DC-DC straight from the battery side of the contactor. Then an e-stop
   cuts the actuators but does not reboot the computer.
5. **E-stop loop** (§6): a hard-wired 12 V series loop through the contactor coil, containing:
   * the robot's mushroom button;
   * the 5 m tethered pendant;
   * the wireless e-stop receiver relay;
   * the watchdog relay, which software can open but never close.

   Reset is a manual button.
6. **CAN buses** (§7): five buses (left leg, right leg, left arm, right arm, torso), daisy-chained along each
   limb with 120 Ω termination at both ends. Twisted pair, JST-GH connectors, and a spare drop on every bus.
7. **Wire gauges and fuses:** use the values in §8. Label both ends of every cable: bus, ID, function.
8. **First power-up, without actuators connected:**
   * Use the bench supply at 48 V with a 2 A limit instead of the battery.
   * Check that the e-stop opens the contactor from every device in the loop.
   * Check that the computer stays on when it does.
   * Check the precharge works: the bus voltage rises over about 1 s before the contactor closes.

**Check:** every e-stop device opens the contactor; insulation from the bus to the frame is more than 1 MΩ; every
CAN bus shows the expected nodes with `candump` when you connect the actuators one bus at a time.

---

## Step 9: Software bring-up

1. **Computer setup** (S1-software §2–3): install the OS and the real-time kernel settings, the CAN interfaces
   (one `can_*` interface per bus) and ROS 2.
2. **Drivers** (§5): the RobStride private-protocol driver and the MyActuator V4.4 driver, wrapped in the
   `s1_hardware` interface.
3. **Safety layer** (§6): joint position limits 3° inside the hard stops, torque limits starting at **30 %** of
   the actuator peak, the watchdog that drops the e-stop relay, and the software e-stop.
4. **Calibration and zeroing** (§7):
   * hang the robot in the zero pose with jigs: legs straight, feet flat, arms down;
   * record each joint's zero offset;
   * check every joint's direction against the convention in §7.
5. **IMU** (§8): mount it on the pelvis, calibrate it, and check that roll and pitch read zero when the pelvis is
   level.

**Check:**
- every joint reads its true angle within 1°;
- every joint moves in the right direction for a positive command;
- the e-stop stops all motion and the watchdog trips when the control program is killed.

---

## Step 10: First steps

Use the reinforcement-learning package in `train/`. It already models S1:

```bash
cd projects/kestrel-humanoid/train
python train.py --variant s1 --name s1 --hours 2          # or use the trained run in train/runs/s1/
python play.py --variant s1 --run s1 --gif s1_demo.gif     # watch it walk and climb stairs in simulation
```

Then go from simulation to the real robot one stage at a time. Do not skip stages.

| Stage | Setup | What to do | Pass |
|---|---|---|---|
| 1 | Hanging in the gantry, feet off the ground, torque limits 30 % | Command the default standing pose slowly | Holds the pose, no oscillation |
| 2 | Feet touching the ground, the gantry carrying most of the weight | Stand with the PD pose; push the pelvis gently | Stays balanced in the harness |
| 3 | Gantry rope slack, torque limits 50 % | Run the trained policy with a zero velocity command (standing) | Stands for 2 minutes |
| 4 | Same | Small forward commands (0.2 m/s) | Steps without the rope taking load |
| 5 | Torque limits raised step by step to 100 % | Walk at 0.5 → 0.8 m/s, turn, step onto a 5 cm board | Repeatable, no falls into the rope |
| 6 | Rope still on | Stairs from 5 cm upwards | Only after stage 5 is routine |

Keep a log of every session, and stop at the first surprise. A policy that works in simulation needs its actuator
model checked on the real robot first: S1-software §9.3–9.5 covers the gaps and the sim-to-real steps.

---

## Step 11: Modify it

S1 is meant to be changed. Each kind of change has a set way to do it:

| You want to | Do this |
|---|---|
| **Add a sensor, light, tool or computer** | Bolt a bracket to the 20 mm hole grid or into an extrusion T-slot. Power it from a spare fused output: 48 V, 24 V, 12 V or 5 V (S1-electrical §12.1). Connect it to the spare CAN drop on the nearest bus, or by USB/Ethernet to the computer. Weigh it with its bracket and add one line to `simple/data/add_ons.json` (body, mass, position), then re-run the selection. |
| **Change a limb length** | Cut a new tube. Change the length in `calc/kestrel/params.py` (S1 uses the same segment lengths as K1), then re-run `python simple/calc/s1_select.py`. It tells you whether the actuators still fit. |
| **Swap an actuator for a different module** | Add it to `data/cots_actuators.json` with its datasheet values and source, and re-run the selection. Make an adapter plate with its bolt circle, and update its CAN driver. |
| **Change the end effector** | Anything with an ISO 9409-1-50 flange bolts on: a different gripper, a tool, a camera. |
| **Make it stronger** | Look at the "strongest feasible" option per joint in `../generated/actuator_selection.md`. Every heavier part means re-running the selection, because mass flows down to the knees. |

**The one rule:** after every change that adds mass, re-run `python simple/calc/s1_select.py`. The knee and hip
X12s have the least margin.

**Spare mass budget** (tested by re-running the sizing with added mass):

| Where | Budget before an actuator runs out of margin | What runs out |
|---|---|---|
| Torso or head | **about 4 kg** in total (3 kg leaves the knee/hip X12 at 1.02) | knee and hip pitch X12. Beyond it no catalogue module passes: the knee belt ratio has to go up |
| Each hand, on top of the 5 kg payload | **about 0.3 kg** (a heavier gripper or tool) | elbow RS03 (1.03 → 1.00) |
| Upper or lower leg | as little as possible: leg mass costs the most torque | hip pitch and knee |

**Worked example: add a lidar to the head.**

1. Bolt a Livox Mid-360 to a 3 mm plate bracket on the head plate's 20 mm grid (4 × M5).
2. Power it from the spare fused 12 V output (2 A fuse) and run its Ethernet cable to the computer through the neck
   service loop.
3. Weigh the lidar with its bracket and cable: say 0.32 kg. Add it to `simple/data/add_ons.json`:

   ```json
   "add_ons": [
     {"body": "head", "name": "Livox Mid-360 lidar + bracket", "kg": 0.32, "xyz": [0.02, 0, 0.16], "cat": "sensor"}
   ]
   ```

   `xyz` is in metres from the joint at the top of that body (x forward, z up). For something on both arms or both
   legs, add `"side": "both"`.
4. Re-run `python simple/calc/s1_select.py` from `projects/kestrel-humanoid`. The new mass goes into the simulation,
   the requirements and the actuator check. Compare `generated/actuator_selection.md` with the previous run: if a
   joint's actuator no longer passes, the selection moves that joint to the next module that does (that is what to
   buy), and if no catalogue module passes, the report says so at the top.
