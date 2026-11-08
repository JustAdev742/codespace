# P09 — Arms: shoulders, upper arms, elbows, forearms, wrists

## A. Visual reference
* Shoulder (ghost): [`renders/15_shoulder_ghost.png`](../../renders/15_shoulder_ghost.png)
* Skeleton: [`renders/10_skeleton_front.png`](../../renders/10_skeleton_front.png)
* KH-25 cutaway: [`renders/20_KH25_cutaway.png`](../../renders/20_KH25_cutaway.png)

Arm chain (left), zero pose (arm hanging, palm facing the thigh):

| Joint | Actuator | Location |
|---|---|---|
| shoulder pitch | KH-25 | in the chest, axis y at (0, 135, 1420) |
| shoulder roll | KH-25 | axis x, body behind the shoulder centre at x = −45 |
| shoulder yaw | KH-20 | axis along the arm at z = 1340 |
| elbow | KH-20 | axis y at z = 1120 |
| wrist yaw | KH-14 | axis along the forearm at z = 1072 |
| wrist pitch/roll | 2 linear actuators | z = 985; wrist cross at z = 860 |

## B. Parts list (one arm)

| BOM | Item | Qty |
|---|---|---|
| (P04) | KH-25 (roll), KH-20 ×2 (yaw, elbow), KH-14 (wrist yaw), tested | 4 |
| B071 | Shoulder bracket, roll-output bracket, upper-arm CF tube Ø50 × 2 + fittings, elbow-output bracket, forearm frame, Ti wrist cross + needle rollers | 1 set |
| B024 | Wrist linear actuators (DCX 16 L + GPX 16 3.9:1 + KSS Ø6 × 2 ball screw + miniature guide), with M4 rod ends | 2 |
| B054 | VL53L5CX ToF module (forearm) | 1 |
| — | Clock-spring cable cassettes for shoulder pitch (240° range) and roll | 2 |

## C. Tools
As P07.

## D. Manufacturing
* Upper-arm CF tube bonding as in P07 §D.
* Wrist cross (Ti-6Al-4V): two perpendicular Ø6 H7 pin bores intersecting within 0.01 mm.
  Lever arms 22 mm (pitch) and 16 mm (roll) to the linear actuator rod ends.

## E. Assembly
1. **Shoulder bracket** onto the KH-25 shoulder-pitch output (8 × M4 at 4.5 N·m, dowels). Mount the KH-25 roll actuator on the bracket, axis x through the shoulder centre (check with a test bar as in P07 step 4).
2. Fit the **clock-spring cassette** at the pitch joint. Wind it to the middle of its travel at the zero pose.
3. **Roll-output bracket** → KH-20 shoulder-yaw actuator (axis along the arm) → upper-arm tube assembly → KH-20 elbow actuator at 300 mm (shoulder-to-elbow centre distance ±0.2 mm).
4. **Forearm:** elbow-output bracket → KH-14 wrist-yaw actuator → forearm frame carrying the two linear actuators and the hand controller (P10).
5. **Wrist:** wrist cross on its pins; linear actuator rod ends to the cross levers (A at +x/+y, B at −x/−y). Zero: wrist straight, both screws at mid-stroke, rods adjusted until the hand axis is coaxial with the forearm within 0.3°.
6. Bumpers at the elbow (0° and −145°) and the wrist limits.

## F. Electrical
Arm zone 14 AWG from the PDU (eFuse 20 A) through the shoulder-pitch bore. EtherCAT daisy chain: shoulder pitch → roll → yaw → elbow → wrist yaw → hand controller. Torque-flexure bridges are wired on each KH-25/KH-20 carrier.

## G. Testing (gate G2: arm on the bench, shoulder clamped)
| Test | Pass |
|---|---|
| Range of motion (slow), all 7 joints | full range, no cable snag (watch the clock-springs) |
| FK accuracy at the hand flange, 20 poses | ≤ 2 mm |
| Payload: 5 kg at full forward reach for 60 s | shoulder winding rise within the model; no gear-limit warnings (shoulder ≤ 127 N·m) |
| Fast reach (AF scenario replay) | tracking error < 3°, speeds reach 6 rad/s shoulder / 7 rad/s elbow |
| Collision detection: padded impact on the forearm at 0.5 m/s | stops within 50 ms; impact force logged |
| Wrist torque: 13 N·m pitch / 10 N·m roll against a fixture | holds; screws not back-driven |
