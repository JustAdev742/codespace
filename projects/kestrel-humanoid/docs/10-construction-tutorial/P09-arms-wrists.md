# P09 — Arms: shoulders, upper arms, elbows, forearms, wrists

The wrist pitch/roll actuators are built in **P09.1 KW-L2** (below) before step 4.

## A. Visual reference
* Shoulder (ghost): [`renders/15_shoulder_ghost.png`](../../renders/15_shoulder_ghost.png)
* Skeleton: [`renders/10_skeleton_front.png`](../../renders/10_skeleton_front.png)
* KH-25 cutaway (K1 strain-wave version): [`renders/20_KH25_cutaway.png`](../../renders/20_KH25_cutaway.png)
* Arm limb interface: docs/03 §13.2

Arm chain (left), zero pose (arm hanging, palm facing the thigh):

| Joint | Actuator | Location |
|---|---|---|
| shoulder pitch | KH-25 (KH-C25 cycloid, limit 160 N·m) | in the chest, axis y at (0, 135, 1420) |
| shoulder roll | KH-25 | axis x, body behind the shoulder centre at x = −45 |
| shoulder yaw | KH-20 (KH-C20 cycloid, limit 105 N·m) | axis along the arm at z = 1340 |
| elbow | KH-20 | axis y at z = 1120 |
| wrist yaw | KH-14 (limit 23 N·m) | axis along the forearm at z = 1072 |
| wrist pitch/roll | 2 × KW-L2 linear actuators | z = 985; wrist cross at z = 860 |

## B. Parts list (one arm)

| BOM | Item | Qty |
|---|---|---|
| (P04) | KH-25 (roll), KH-20 ×2 (yaw, elbow), KH-14 (wrist yaw), tested with their drive limits stored | 4 |
| — (docs/03 §13.2) | Arm limb interface at the shoulder-pitch output: Ø80 V-band with M6 T-bolt and safety catch, spigot + 2 dowels, service plate (power, EtherCAT, STO, arm ID; palm-camera coax) | 1 set |
| B071 | Shoulder bracket, roll-output bracket, upper-arm CF tube Ø50 × 2 + fittings, elbow-output bracket, forearm frame, Ti-6Al-4V wrist cross with 4 × INA HK0609 drawn cups on 100Cr6 Ø6 h6 pins | 1 set |
| (P09.1) | KW-L2 wrist actuators with M5 rod ends | 2 |
| B107, B114 | KES-WRIST driver board and the forearm 24 V buck (LM5146-Q1) | 1 + 1 |
| B108 | Wrist-cross absolute angle sensors (MT6835 + diametric magnet), pitch and roll | 2 |
| B054 | VL53L5CX ToF module (forearm) | 1 |
| B117 | Palm-camera link: torsion-rated 50 Ω micro-coax through elbow, wrist yaw and wrist cross, FAKRA-Z break at the forearm | 1 |
| — | Clock-spring cable cassettes for shoulder pitch (240° range) and shoulder roll (175°) | 2 |

## C. Tools
As P07, plus a 0–50 kg spring balance or load cell, a 10 kg and a 15 kg test mass with a handle, a padded pendulum.

## D. Manufacturing
* Upper-arm CF tube bonding as in P07 §D.
* Wrist cross (Ti-6Al-4V): two perpendicular Ø10 N6 bores for the HK0609 drawn cups, axes intersecting within
  0.01 mm. Lever arms 22 mm (pitch) and 16 mm (roll) to the KW-L2 rod ends. Pins 100Cr6 60–64 HRC, ground Ø6 h6
  (needle raceways; never Ti).

## E. Assembly
1. **Arm-side V-flange and shoulder bracket** onto the KH-25 shoulder-pitch output (8 × M4 12.9 at 4.5 N·m, dowels);
   mount the KH-25 roll actuator on the bracket, axis x through the shoulder centre (test bar as in P07 step 4).
2. Fit the **clock-spring cassettes** at shoulder pitch and roll. Wind each to the middle of its travel at the zero pose.
3. **Roll-output bracket** → KH-20 shoulder-yaw actuator (axis along the arm) → upper-arm tube assembly → KH-20 elbow
   actuator at 300 mm (shoulder-to-elbow centre distance ±0.2 mm). KH-20 output flanges **8 × M4 12.9 at 4.5 N·m**
   (Mk II; K1's 8 × M3 slipped below the elbow momentary torque).
4. **Forearm:** elbow-output bracket → KH-14 wrist-yaw actuator (6 × M3 12.9 at 1.7 N·m) → forearm frame carrying the
   two KW-L2 actuators, the KES-WRIST board and the 24 V buck. The hand controller sits in the palm (P10).
5. **Wrist:** wrist cross on its pins (Loctite 243 on the retaining screws); KW-L2 rod ends to the cross levers (A at
   +x/+y, B at −x/−y). Zero: wrist straight, both screws at mid-stroke, rods adjusted until the hand axis is coaxial
   with the forearm within 0.3°. Fit the two wrist-cross angle sensors.
6. Bumpers at the elbow (0° and −145°) and the wrist limits (pitch ±70°, roll ±35°).
7. Route the palm-camera micro-coax with the arm harness: service loops at elbow, wrist yaw and wrist cross; FAKRA-Z
   break at the forearm.

## F. Electrical (docs/05 §5, §6.4, §9)
* Arm zone 14 AWG from the PDU (eFuse 20 A) through the shoulder service plate and the clock-springs; 52 V runs to the
  forearm.
* Forearm 24 V buck (LM5146-Q1, 24 V 10 A, hiccup limit 12 A) → KES-WRIST (KW-L2) and the hand's local 12 V buck,
  16 AWG, XT30, ≤ 0.2 m. In STO the buck enable and its output load switch both open (2-channel), so the KW-L2s and the
  hand stop (Cat 0); the back-drivable screws let a held object slip, which is accepted.
* EtherCAT daisy chain: shoulder pitch → roll → yaw → elbow → wrist yaw → hand controller (which drives the KES-WRIST,
  docs/05 §7). Torque-flexure bridges on the KH-25 and KH-20 carriers.

## G. Testing (gate G2: arm on the bench, shoulder clamped)
| Test | Pass |
|---|---|
| Range of motion (slow), all 7 joints | full range, no cable or coax snag (watch the clock-springs) |
| FK accuracy at the hand flange, 20 poses | ≤ 2 mm |
| Drive limits in place: command 2 × over EtherCAT at shoulder, elbow, wrist yaw | output torque clamps at 160 / 105 / 23 N·m ± 5 % |
| **Payload AH: 10 kg at full forward reach for 60 s** | shoulder ≤ 160 N·m (requirement 90 N·m hold); winding rise within the dyno model; no gear-limit warnings |
| **One-hand AO: 15 kg in the hand, elbow at 90°, for 60 s** | elbow holds (≈ 59 N·m) without exceeding its thermal model; wrist pitch holds 14 N·m |
| Fast reach (AF scenario replay) | tracking error < 3°; speeds reach 6.2 rad/s shoulder / 7 rad/s elbow |
| Collision detection: padded impact on the forearm at 0.5 m/s | stops within 50 ms; impact force logged |
| Wrist torque against a fixture: 19 N·m pitch (2 s), 29 N·m pitch (0.2 s), 10 N·m roll | holds; screws not back-driven; KW-L2 currents within P09.1 limits |
| Wrist speed: pitch 6 rad/s at no load | reached |
| Palm-camera link: 10³ full-range elbow and wrist cycles while streaming | no link errors (docs/05 §9 torsion/flex test) |

---

# P09.1 — KW-L2 wrist linear actuators (4 units)

Build per [docs/13 §4.4](../13-scratch-build-motors-actuators.md) with one Mk II change: **1 mm screw lead** (docs/09
§11 H10). Requirement per actuator (docs/04 §9): **754 N** at the repeated combined corner (19 N·m pitch + 10 N·m roll
over the 22 / 16 mm levers), **972 N** momentary, **318 N** held for the 15 kg one-hand case, **132 mm/s** at 216 N,
stroke ±30 mm. With the ECX FLAT 32 L (98.5 mN·m continuous, 540 mN·m stall, 10,600 rpm no-load at 24 V) and a 1 mm
lead (2π × 0.88 / 0.001 = 5.53 N per mN·m): 545 N continuous, 754 N at 136 mN·m, 972 N at 176 mN·m, ≈ 164 mm/s at
216 N. With the 2 mm lead of R10 and docs/13 the continuous force is only 272 N, below the 318 N hold.

## A. Visual reference
* Section:

```
 ECX FLAT 32 L ─ rigid clamp hub ─ screw journal in a preloaded angular-contact pair (bearing block)
 ─ ball screw Ø8 × 1 ─ flange nut in a push tube with an anti-rotation flat (POM-lined slot) ─ PTFE wiper
 ─ Ti push tube ─ M5 rod end ─ wrist lever (22 mm pitch / 16 mm roll)          stroke ±30 mm + 5 mm to each stop
```

## B. Parts list (per actuator)

| BOM | Item | Qty |
|---|---|---|
| B024 | maxon ECX FLAT 32 L high torque, 24 V, Hall sensors (ECXA32LZF50E6ILACO1Y330A) | 1 (+ 1 spare per robot) |
| B106 | Ground ball screw **KSS Ø8 × 1** with flange nut (Ø6 × 1 only if its Ca ≥ 1.5 kN and C0a ≥ 3 kN; confirm in the KSS catalogue) | 1 |
| B106 | Back-to-back pair of miniature angular-contact bearings for the screw journal, preloaded (e.g. SKF 706 CD/P4A class, 6 × 17 × 6; verify the axial rating ≥ 1 kN static) | 1 pair |
| B106 | 7075 housing and bearing block, rigid clamp hub, Ti push tube, POM anti-rotation insert, PTFE rod wiper, ePTFE vent, O-rings | 1 set |
| B106 | M5 PTFE-lined rod end, female (SKF SIKAC 5 M class; verify C0 ≥ 3 kN) + jam nut | 1 |
| — | Elastomer end stops | 2 |

## C. Tools & equipment
Torque screwdrivers 0.2–3 N·m, dial indicator (screw run-out), force gauge or load cell ≥ 1.5 kN in a test frame with a
linear encoder, 24 V bench supply ≥ 10 A, the KES-WRIST board, a thermocouple on the motor housing.

## D. Manufacturing
* Housing and bearing block: 7075-T6, hard anodise; bearing seats per the bearing maker (housing H5/J5, journal h5 for
  a preloaded pair); motor-flange-to-screw axis coaxial ≤ 0.02 mm.
* Push tube: Ti-6Al-4V with the anti-rotation flat; rod-end thread M5 at the end.
* Screw journal: turned by the screw maker to your drawing (journal for the bearing pair and the clamp hub).

## E. Assembly
1. Press and preload the angular-contact pair on the screw journal (locknut to the bearing maker's preload torque).
2. Fit the bearing block to the motor flange; fit the rigid clamp hub to the motor shaft and the screw journal.
3. Check screw run-out at the nut position: ≤ 0.02 mm.
4. Fit the nut into the push tube; set the anti-rotation flat in its POM-lined slot; fit the wiper and the housing
   O-rings.
5. Fit the rod end at mid-stroke; lock the jam nut (Loctite 243).
6. Wire to the KES-WRIST board (3 phases, Halls); home against the soft stops, never the hard stops.

## F. Electrical
* KES-WRIST (2 × DRV8353, 100 V FETs sized ≥ 15 A), 24 V from the forearm buck.
* Current limits from the force targets (k_t ≈ 21.6 mN·m/A derived in docs/05 §6.4; use the datasheet value):
  continuous ≈ 4.2 A (nominal), 2 s ≈ 6.3 A (754 N), 0.2 s ≈ 8.1 A (972 N), with an I²t model from maxon's winding time
  constant.
* Position from the Halls and the wrist-cross absolute sensors (B108); force estimated from current.

## G. Testing (per actuator; R10 §7 item 7, docs/13 §4.4 tests at the 1 mm lead)
| Test | Pass |
|---|---|
| Confirm the maxon datasheet values (nominal and stall torque, k_t, mass) before the test | recorded; if stall < 300 mN·m, stop and revisit the design |
| Force–speed curve at 24 V on the test frame | ≥ 754 N for 2 s; ≥ 972 N for 0.2 s; ≥ 132 mm/s at 216 N |
| Continuous: 318 N for 60 min (AO hold) | motor housing ≤ 80 °C, winding (by resistance) ≤ 100 °C |
| Continuous: 545 N for 10 min | winding within the maxon limit |
| Backlash | < 0.02 mm |
| Endurance: 10⁵ cycles at ±25 mm and 300 N | no backlash growth > 0.01 mm; wiper and screw clean |
| Back-drive with the motor unpowered (STO) | back-drives smoothly (expected; a held object can slip) |
