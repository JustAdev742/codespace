# 02 — Industrial design (Mk II)

The exterior is designed around the Mk II engineering, not wrapped over it. Every shell encloses a real
component envelope from the CAD (`cad/build_robot.py` + `cad/exterior.py`, constants in `cad/layout.py`),
every joint cap sits on the actual actuator, every panel split is a service line, and every shell has been
checked against the parts it encloses and against the neighbouring links over the joint ranges
(`cad/check_clearance.py`, §8). The interactive model is `viewer/index.html` (full / ghost / skeleton modes,
exploded-view slider, preset views).

![KESTREL K1 Mk II, three-quarter front](../renders/05_threequarter_front.png)

## 1. Design language: "instrument, not armour", Mk II

The K1 concept stays: a calm, precise machine with a light signature instead of a face. Mk II gives it the
form vocabulary of a production humanoid (Figure, Apollo, Optimus, H1/H2 class) and lets the Mk II
mechanism show where it is the best-looking thing on the robot.

| Principle | What it means on the robot |
|---|---|
| Volume where the mechanism is | Lofts with per-side semi-axes and **per-quadrant exponents** (`geom.asym_pts`): the thigh carries its volume forward over the knee-crank sweep (a quad-like front), the calf bulges rearward round the two ankle actuators and push-rods, the forearm tapers 90 → 60 mm from the KH-14 to the wrist. A corner is squared off only where a linkage sweeps (thigh front-lateral, calf rear corners). |
| Two tones, one accent | Satin warm-white PA12 "armour" on the outward and forward faces, graphite PA12 on the flanks, the inside of the limbs and the back pack, black-anodised actuator housings with machined bezels, and **one** accent: amber (≈ 590 nm) light guides. |
| Joints read as precision actuators | Every exposed actuator end carries a cap: machined aluminium bezel, graphite cap with a centre boss, a screw circle, and on the main load joints (hips, shoulders, lateral knees, head) a thin amber ring. Cycloid joints show their pin-ring screw circle. |
| Honest service lines | Panel gaps of 1.0 mm are the actual splits; button-head Ti screws only where a panel is screwed (hatches, drive covers, chest plate, back pack). The rear service door has one gasketed hatch per battery pack. |
| Calm silhouette | V-taper from the 535 mm deltoid line to a 252 mm waist; graphite torso flanks recede so the white chest shield reads narrower; the head is a confident helmet with a full-width visor and a LiDAR crown. |

## 2. Before / after

K1 renders are in git history (`renders/` before this revision); the owner's critique was "looks bad".

| K1 problem | Mk II answer |
|---|---|
| Tube-like limbs with no shaping | Asymmetric lofts (§1). Thigh 187 × 147 mm at the knee-actuator level tapering to 118 mm deep at the knee; calf 134 mm deep at the ankle actuators; forearm taper; deltoid pods. |
| Boxy torso | Chest shield with a sternum light bar and a horizontal service line, graphite flanks, a sculpted shoulder yoke and a separate graphite radiator pack. Torso 256 × 262 mm (+37 mm radiator pack). |
| Thin pole neck, detached shoulder spheres | Neck module: a Ø104 graphite sleeve (turns with neck yaw) rising from an aluminium collar in a higher shoulder yoke; ≈ 50 mm of visible neck instead of 80. Shoulders: the deltoid pod is concentric with the KH-25 roll axis and sits 4.5 mm off the torso side wall, the shoulder-roll output is a front cap with the upper arm hanging from it, so the arm reads as attached. |
| Slab feet | Lofted foot with a graphite toe cap behind a toe-break line (flex groove through the sole), graphite heel counter, NBR/PU tread (14 mm pitch), TPU ankle bellows instead of stacked rings. |
| Ribbed waist reading as stacked rings | The waist is now the KA-110P waist-pitch housing itself, smooth, with two machined caps, between a white abdomen and a white pelvis band. Jacketed leg actuators are smooth sleeves with one land. |
| Generic grey on white, no hierarchy | Two-tone CMF + one accent (§4); studio renders with an HDR-like room environment, soft key shadow, contact shadow and neutral tone mapping (§9). |

## 3. Proportion and key dimensions

| | Mk II | Notes |
|---|---|---|
| Height | 1,806 mm (top of the LiDAR cap) | head top = params `HEIGHT`; +56 mm in the clearance pass: params `DIM["waist_pitch_above"]` 0.070 → 0.126 m raises the KA-110P waist-pitch axis (and everything above it) so the waist link clears the hip-yaw housings over the whole waist-yaw range (§8). The torso is packed to 3 mm, so the raise goes into height, not into the torso. S1 keeps 0.070 (`variant_s1.apply`). |
| Shoulder width (deltoids) | 535 mm | set by the KH-25 Mk II roll actuator, OD 127 |
| Torso W × D | 256 × 262 mm; 299 mm incl. radiator pack | depth set by the 175 mm packs + Thor stack |
| Pelvis band width | 301 mm (sides open over the hip-yaw drums) | forearms hang ≥ 4 mm outside it |
| Thigh (upper) W × D | 147 × 187 mm | knee crank sweep r 70 + rod-end eye; flat medial face, lateral face 3 mm round the push-rod sweep |
| Knee width | 152 mm over the caps | twin plates outside the 103 mm KA-130K; low medial cap |
| Calf D | 134 mm | KA-90P pair + Ø10 push-rods |
| Foot L × W | 284 × 120 mm (sole) | params foot 260 × 110 + bumper |

## 4. Colour, material, finish (CMF)

| Part | Material | Process | Finish |
|---|---|---|---|
| White panels: helmet, chest, abdomen, service door + hatches, back yoke, pelvis band, deltoids, glute pods, upper-arm / forearm outer, thigh front + rear, shin, foot upper, patella | PA12 (HP MJF), 2.0–2.4 mm, arms 1.8 mm | MJF, bead blast | 2K primer + satin warm white (RAL 9010-adjacent, 25–30 GU), soft clearcoat |
| Graphite panels: jaw module, torso flanks, radiator pack, neck sleeve, thigh drive covers, calves, upper-arm / forearm inner, toe caps, heel counters, palm | PA12 (HP MJF) | MJF, bead blast | satin graphite (≈ RAL 7021, 20 GU) |
| Actuator housings, caps | 7075 / 6061 | CNC | hard anodise black (Type III), bead-blast matte |
| Cap bezels, collar rings, yaw ring | 6061 | CNC | diamond-turned face, clear anodise |
| Visor, LiDAR window, sensor windows, palm-camera window | PC, smoked 15 % T, AR + hard coat on camera apertures | machined / thermoformed | gloss |
| Light guides (temples, ears, chest bar, belt, cap rings, thigh, forearm, foot, pack, hatch LEDs) | clear PC + diffuser, amber LEDs | machined | frosted |
| Ankle bellows | TPU 95A, graphite | printed / cast | matte |
| Soles | NBR / PU tread, replaceable | moulded / cast | matte |
| Fasteners (visible) | Ti Gr5 button heads | — | bead blast |

The light protocol is unchanged (§10).

## 5. Panelisation and service access

| Segment | Panels | Service |
|---|---|---|
| Head | helmet (white), jaw module with mic/speaker slots (graphite), visor, ear caps, LiDAR collar / window / cap | jaw drops off on 2 screws for the cameras |
| Torso | chest plate, abdomen plate (sensor window), flanks L/R, back yoke, rear service door with **hatch A / hatch B** (one per pack, docs/03 §10.1), radiator pack | packs slide out rearwards through their own hatch; pack removable on 4 screws for the fans |
| Pelvis | front and rear band, graphite keel | — |
| Thigh | front (white), rear (white), lateral **drive cover** (graphite, 4 screws) over the knee crank and push-rod | drive cover off gives the knee linkage |
| Shank | shin (white, 2 screws), calf (graphite, 2 screws), patella | calf off gives both ankle actuators |
| Arms | deltoid pod front (white) + rear (graphite), upper-arm / forearm outer (white) + inner (graphite) | |
| Foot | upper (white), toe cap, heel counter (graphite), sole | sole replaceable |

Shell-to-structure as K1: 3 mm silicone isolators on M3 bosses; shells carry no load and deflect in a fall. Every
panel is a STEP/STL file in `cad/out/step/` and `cad/out/stl/`.

## 6. Mk II engineering shown in the form

| Mk II change | Where it shows |
|---|---|
| KA-130H / KA-130K: KM-130x50-LC, 50 mm stack in a liquid jacket | housings 142 × 96 / 142 × 103 (K1 88 / 95); smooth jacket sleeve with two radial ports; hip-pitch → knee jackets in series; **dry-break quick-disconnect pair per leg on the pelvis** (`l_hip__alu_coolant_qd_*`), service loops across the hip |
| Radiator + 2 fans in the upper back | 174 × 96 mm core, 2 × 92 mm fans, pumps, trunk lines to the pelvis manifold and a cold-plate loop to the Thor; graphite pack with an 8-slot exhaust grille and an amber status line |
| Two hot-swap packs | 2 × (175 × 98 × 185 mm) side by side behind the spine bulkhead, blind-mate connectors on the bulkhead, cam lever on each end cap; rear service door with two hatches, latch and status LED each |
| KA-110P hip roll, output 12× M5 on PCD 100 | KA-110P at its real OD 127 in the gluteal pod; output flange (`detail__hip_roll_flange`) with 12 counterbored 12.9 SHCS in the roll-pitch bracket |
| Shoulders KM-115x32 + C25 cycloid; shoulder yaw / elbows KM-85x26 + C20 | cycloid housings: motor can + pin-ring section with its screw circle; KH-25 OD 127 sets the deltoid pod (r 67.5); KH-20 OD 97 |
| 13-DOA hands with palm cameras | 13 palm actuators (thumb 4, index 3, others 2); palm camera behind a window in the palm pad; white dorsal shell, graphite palm |
| Hip and waist stack re-packed (clearance pass, §8) | KA-90P hip yaw raised 18 mm (z 1018–1088) on a deck at z 1088–1100: the yaw-roll yoke's upper plate (z 1004–1018) now clears the KA-130H and the roll-pitch bracket swept about the roll axis (corner radius 84.6 mm → z 999.6 at +33°) and steps down behind the bracket over the KA-110P; waist-pitch axis +56 mm (z 1141) so every waist-link part more than 56.5 mm from the waist-yaw axis stays above the hip-yaw housings (round yoke disc, 48 mm web, Ø100 caps); waist yaw at z 1001–1071; pelvis band z 1022–1112. The waist reads taller: the smooth KA-110P drum and its caps between abdomen and pelvis band |

## 7. Engineering rules for the shells

* **Material and walls:** HP MJF PA12, 2.0–2.4 mm walls (arms 1.8 mm, TPU bellows 1.6 mm), internal radii ≥ 3 mm,
  no wall below 1.6 mm. MJF needs no draft; panels that may later be injection-moulded have no undercuts across
  their split plane.
* **Clearance:** ≥ 2 mm static, ≥ 3 mm to moving parts; joint-crossing edges are concentric with the joint axis
  (thigh top r 88/98 round the hip-pitch axis, thigh bottom r 58 and shank top r 57 round the knee, deltoid
  ≤ 71.5 mm from the roll axis while the KH-20 collar stays outside 76 mm, pelvis arches r 100 over the hips,
  torso relief r 72 over the waist drum), or set by the swept envelope of the neighbouring link:
  * **popliteal window** (knee 0–130°): behind x = −8 the thigh ends on the line z = 617 − 0.85 x (624 → 689 mm at
    the rear face) and behind x = −20 the calf ends on z = 476 + 0.84 x (459 → 402 mm), a V-shaped window behind the
    knee like the human popliteal fossa. A recessed graphite **popliteal web** (x −8…−6) closes the thigh between
    the plates, under the KA-130K and behind the knee drum, so the window shows a dark pocket, not the mechanism.
    At 130° the calf folds into it with ≥ 4 mm to every thigh part;
  * **thigh rear-top** z < 828 + 0.577 x and a 61° **chamfer on the gluteal pod** front-bottom (plane through the
    hip-pitch axis) for +30° hip extension; the KA-130K coolant ports turned to 105° (up, tips x −21.7, z 836) so
    they pass under the roll-pitch bracket;
  * **flat medial thigh** (medial semi-axis 74–76 mm, inner face ≥ 2 mm off the medial plate at y 30) and a low
    medial knee cap (5.1 mm proud, was 7.6) for hip adduction; **lateral thigh** 73–74.5 mm (3 mm round the push-rod
    sweep) so the hanging hand's thumb keeps ≥ 3.4 mm to the thigh over hip pitch −50…+18°;
  * **collar chamfer** on the chest top (z < 1505 − 1.39 (x − 52), design frame) and a **chin relief** on the front
    of the neck-sleeve rim (0.829 x + 0.559 (z − z_np) < 34.5 mm) for +52° neck pitch.
* **Push-rod:** the knee four-bar (data/knee_fourbar.json) is solved over 0–130° and every rod and rod-end
  position, inflated by 4 mm, is cut from the thigh and shank shells; the shank crank (integral with the hub) has
  its own recess.
* **Mass:** CAD shells are weighed in `build_robot.py` (PA12 1.01 g/cm³, PC 1.20, TPU 1.20, +8 % for bosses,
  inserts and paint) → `cad/out/shell_mass.json`.

| params.py shell line | Budget | Mk II CAD |
|---|---|---|
| pelvis shells | 0.55 kg | 0.18 kg |
| torso shells (chest, back door, abdomen) | 1.60 kg | 0.74 kg |
| head shell + visor | 0.45 kg | 0.24 kg |
| upper-arm shells × 2 | 0.44 kg | 0.15 kg |
| forearm shells × 2 | 0.36 kg | 0.18 kg |
| thigh shells × 2 | 0.70 kg | 0.54 kg (incl. popliteal webs) |
| shank shells × 2 | 0.67 kg (params set to the CAD value, 0.335 per leg) | 0.67 kg (calf houses both ankle actuators) |
| **sum of budgeted lines** | **4.77 kg** | **2.70 kg** |
| shells with no params line: gluteal pods, deltoid pods, neck sleeve | — | 0.36 kg |
| **all body shells** | 4.77 kg | **3.06 kg (−36 %)** |

Hand shells (0.31 kg for two) sit inside the 1.15 kg hand line; foot shells and boots (0.33 kg for two) inside
the foot-plate line. The K1 CAD exterior weighed ≈ 8.7 kg as modelled because its feet, deltoid caps, palms and
visor were solid.

## 8. Clearance check

`python cad/check_clearance.py` (trimesh + python-fcl) loads the GLB and `cad/out/parts.json` (kinematic body
of each part), checks every exterior part at the zero pose, then rotates each link through its range about the
as-built joint axes (`layout.WORLD`: waist pitch z 1,141, shoulders 1,476, neck pitch 1,611). Pairs already touching
at the start pose (bearing in its boss, flange on its face) are listed separately, not as sweep hits; posed sweeps put
the other links in a scenario pose first. `--only=knee,neck` runs a subset. Results: `cad/out/clearance.json`.

**Static (zero pose):** no shell interferes with a part it encloses or with a neighbouring link; the largest residual
is 0.9 mm (gluteal-pod rim on the KA-110P, tessellation level). Intra-hand contacts and seated screw heads are excluded.

| Joint | params.py range | CAD free range (shells + interior) | Sim requirement (scenario) | First contact beyond the free range |
|---|---|---|---|---|
| Knee | 0…130° | **0…130°** | 125.4° (DS), 117.0° (ST) | none: the calf folds into the popliteal window |
| Hip pitch | −125…+30° | **−100…+30°** | −71.3° (LM) … +18.2° (W2) | thigh front on the pelvis front at −105° |
| Hip roll, other leg straight | −25…+45° | **−5…+45°** | — | the feet meet at −6°, the medial knee caps at −7° (210 mm hip spacing; not a shell limit) |
| Hip roll, SU pose (L hip −55° / knee 109° / ankle −45°, +13°; R hip −29° / knee 57°) | −25…+45° | **−11…+45°** | −13.1° (SU), +9.3° (ST) | the step-up foot reaches the stance shin at −12° (**blocked**, see below) |
| Hip yaw | −30…+45° | **−30…+25°** (interior to +35°) | −1.6…+1.5° (ST) | the gluteal pods meet at +30°; KA-110P on the other hip's flange at +40° |
| Ankle pitch | −45…+45° | **full** | −45° (W2) … +9.1° | — (TPU bellows deform) |
| Elbow | −145…0° | **−115…0°** | −91.7° (AF) | forearm on the upper arm at −120° |
| Shoulder pitch | −180…+60° | **full** | −114.6° (AF) … +17.2° | — |
| Shoulder roll | −15…+160° | **−5…+160°** | 0…90° (AS) | upper arm on the torso flank at −10° |
| Waist pitch (arms held clear) | −15…+75° | **−15…+70°** | 0…60° (TB) | abdomen / flank on the pelvis front at +75° |
| Waist yaw (arms held clear) | −70…+70° | **full** (interior too) | 0° (no scenario uses it) | — (arms hanging: forearms reach the gluteal pods at ±20°) |
| Neck pitch | −35…+50° (swept to +55°) | **−20…+55°** | 0…45.8° (NK) | head frame on the neck sleeve at −25° |
| Neck yaw | −80…+80° | **full** | 0…68.8° (NK) | — |

What this pass changed to get there (rules in §7): the popliteal window and web (knee), the thigh rear-top line, the
gluteal-pod chamfer and the KA-130K port angle (hip extension), the flat medial thigh and low medial knee cap (hip
roll), the collar chamfer and the neck-sleeve chin relief (neck), and two interior re-packs found by the sweeps:

* **Hip roll was blocked at 0° by the hip-yaw stack** (a K1 legacy, hidden until now): the yaw-roll yoke sat at
  z 985–999 under the KA-90P hip-yaw output, 1 mm into the KA-130H (top z 986) at the zero pose, and the KA-130H
  and roll-pitch bracket corners rise to z 999.6 when the hip rolls. The hip-yaw actuators moved up 18 mm
  (z 1018–1088), the yoke's upper plate to z 1004–1018 (≥ 3.4 mm over the full −25…+45° roll range).
* **Waist yaw** then needs every waist-link point more than 56.5 mm from the waist-yaw axis above z 1091: waist-pitch
  axis at z 1,141 (params `waist_pitch_above` 0.126; the approved ≈ 35 mm raise would have left waist yaw at
  ≤ ±30° with the raised hip-yaw stack), round yoke disc, 48 mm web, Ø100 caps; waist-yaw actuator at z 1001–1071.
  The robot is 56 mm taller (1,806 mm).

**Blocked:** the SU step-up places the platform foot about 10 mm inside the stance calf at −13.1° hip roll: the
CAD reaches −11° in that pose (feet, not shells: without the foot the shin meets the stance knee cap at −13°).
Either widen the SU foot placement by ≥ 25 mm or accept −11°. With both legs straight, adduction beyond −5° is
limited by the feet (they are 90 mm apart).

## 9. Views

All renders come from the CAD through `viewer/render.mjs`: three.js physically based materials, a studio
room environment (PMREM, no network assets), a soft PCF key shadow, a blurred contact shadow, a faint bloom on
the light guides and neutral tone mapping (GTAO ambient occlusion is available in the viewer with `?ao=1`). Regenerate with
`node viewer/render.mjs <three_dir> renders 2` (one browser page per model, ≈ 1 min per view in SwiftShader).

| | |
|---|---|
| ![front](../renders/01_front.png) Front | ![rear](../renders/02_rear.png) Rear |
| ![left](../renders/03_left.png) Left side | ![right](../renders/04_right.png) Right side |
| ![3/4 front](../renders/05_threequarter_front.png) Three-quarter front | ![3/4 rear](../renders/06_threequarter_rear.png) Three-quarter rear |
| ![head](../renders/07_head_detail.png) Head detail | ![hand](../renders/08_hand_detail.png) Hand detail (13 DOA, palm camera) |
| ![hip knee](../renders/09_hip_knee_joints_ghost.png) Hip + knee: jacketed KA-130s, coolant loop, knee four-bar (ghost) | ![shoulder](../renders/15_shoulder_ghost.png) Shoulder: KH-25 cycloids (ghost) |
| ![foot](../renders/16_foot_ankle_ghost.png) Ankle + foot (ghost) | ![torso](../renders/17_torso_ghost.png) Torso: two packs, radiator, Thor (ghost) |
| ![skeleton](../renders/10_skeleton_front.png) Internal skeleton, front | ![skeleton rear](../renders/11_skeleton_rear.png) Internal skeleton, rear |
| ![exploded](../renders/12_exploded.png) Exploded assembly | ![exploded skeleton](../renders/13_exploded_skeleton.png) Exploded skeleton |
| ![ghost](../renders/14_ghost_threequarter.png) Fully assembled, ghost shells | ![KA-130K](../renders/18_KA130K_cutaway.png) KA-130K Mk II cutaway (jacket, RB9016) |
| ![KA-130K exploded](../renders/19_KA130K_exploded.png) KA-130K Mk II exploded | ![KH-25](../renders/20_KH25_cutaway.png) KH-25 Mk II cutaway (C25 cycloid) |

## 10. Head, hands, human factors

* **Head:** helmet 208 × 192 mm with a 260 mm wrap-around smoked visor; ZED X Mini stereo behind the visor centre
  (10° down), the two ZED X One GS wide cameras at ±55° behind the visor wrap, Livox Mid-360 in a crown collar with
  its optical head clear of the shell (−7…+52°), graphite jaw module with mic / speaker slots, ear caps with amber
  status rings. No artificial face; expression is light colour, pulse and head pose.
* **Hands:** 13 DOA, all actuators in the palm, linkage fingers with silicone tip pads, palm camera for
  pre-grasp servoing. The thumb lies closer to the palm plane than on K1 so the hanging hand clears the thigh.
* **Safety in the form:** external edges R ≥ 3 mm; no exposed linkage within 25 mm of the skin envelope except
  the knee push-rod under its drive cover and the ankle linkage inside the bellows; caps and rings mark rotation
  axes (pinch zones). Light protocol: steady amber = powered / idle; slow pulse = moving; fast red pulse (LED
  colour shift) = fault / e-stop; off = de-energised. Hatch LEDs: pack state per bay.

## 11. Construction-audit holds closed in the CAD (docs/09 §11)

| Hold | CAD change (files) | New dimensions |
|---|---|---|
| H1 | KA-130 output bearing = **THK RB9016** (`build_details.py`, `ka130k__front_housing`, `ka130k__s2_carrier_output`) | outer seat Ø130 H7 × 16 with clamp lip, inner seat Ø90 h5; actuator stack 134 mm (K1 124) |
| H2 / sun bores | KA-130K: no through-bore through the Plan A suns (stage 1 z16 m0.8, root Ø10.8; stage 2 z18 m1.25, root Ø19.4); power and EtherCAT in external service loops | sun gears modelled at tip Ø14.4 / Ø25, solid |
| H3 | KA-130K parts are Mk II: jacket core (legacy stem `motor_housing_finned`), jacket sleeve + 2 ports, 50 mm stack, stage 1 z16 / 4 × z18 / z52 (equal spacing (16 + 52)/4 = 17), 17:1 | `ka130k__coolant_jacket_sleeve.step` new |
| H4 | jogged medial thigh plate with a **full-circle hip boss** (`detail__thigh_plate`, `l_thigh__thigh_plate_medial`) | Ø128 × 10 boss, 12 × Ø5.5 cbore Ø9.5 × 5 on PCD 105, 2 × Ø6 H7 dowels, Ø90 H7 × 3 spigot recess → 935 N·m slip (SF 2.3 on 406 N·m peak) |
| H5 | knee hub **one piece with the crank**; flange joint to the shank fitting; larger bearings (`detail__knee_hub`, `l_shank__knee_hub`, thigh-plate bosses) | 12 × M6 12.9 on PCD 90 + 2 × Ø6 H7 → ≈ 1,130 N·m slip vs 535 N·m (SF 2.1); 7207 BE pair 35 × 72 × 17 (C0 20.8 kN each) in Ø72 H6 bosses, s0 ≈ 1.75 at the X-case 11.9 kN |
| H6 | cycloid disc bores (`cycloid_profile.py`) and the KH-C25 housing per docs/10 P04 (`build_details.py`) | C25 bore Ø26 G6 (Fw20/Ew26 cage on a Ø20 h5 sleeve), C20 Ø22 G6 (Fw16/Ew22 on Ø16 h5), C20 discs 6 mm; pin ring Ø84 in a Ø104 ring spigoted into the front housing, solid Ø8 output pins on PCD 52 supported both ends, RB5013 seat Ø80 H7, 61808 + 61803, Ø12 hollow input shaft |
| H9 | twin thigh plates now outside the 103 mm KA-130K (y 30–37 / 140–146, 1 mm running gap to the hub's crank); hip connection on the medial plate (the KA-130H output is medial) | lateral support bearing on the KA-130H rear cap still to detail |
| H12 | packs resized and the torso re-packed (`layout.py`, `build_robot.py`, `exterior.py`) | **175 × 98 × 185 mm per pack**: 2 × 4 × 8 P50B (axes fore-aft) in holders 146 × 92 × 182 + 25 mm rear end cap (BMS, FET switch, 100 A fuse, cam lever) + connector face; CAD centroid x −37.5, y ±53, z +167.5 mm above the waist-pitch axis (params.py now −40 / ±52 / +167.5); torso back at x −134 |

Components the CAD places away from their params.py mass-budget centroid are listed in `cad/layout.py` (`MOVED`)
and in `cad/out/shell_mass.json`.
