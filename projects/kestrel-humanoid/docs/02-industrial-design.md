# 02 — Professional industrial design

The exterior is designed around the internal engineering, not wrapped over it. Every
shell panel encloses a real component envelope from the CAD (`cad/build_robot.py`), every
joint cover is the actual actuator housing location, and every panel split is a service
access line. The interactive model is `viewer/index.html`. It shows full / ghost / skeleton
modes, an exploded-view slider and preset views.

## 1. Design language

**"Instrument, not armour."** The look is calm and premium: warm-white satin shells over a dark,
precise mechanism, with restrained light signatures. It borrows the discipline of aerospace
fairings (smooth, lofted, continuous curvature) and of high-end tools (graphite anodised
joints, honest fasteners where they serve maintenance).

| Element | Treatment | Engineering reason |
|---|---|---|
| Shells | lofted superellipse sections (n = 2.2–3.4), continuous curvature, 1.0 mm panel gaps | stiff, light thin-wall MJF parts; gaps allow thermal expansion and tolerance stack-up |
| Joints | graphite hard-anodised housings, exposed as round "joint discs" (hips, glutes, elbows) with white caps + 1 mm amber ring | heat leaves the actuator housings directly; discs read clearly as joints, which tells people where pinch points are |
| Waist / ankles | graphite segmented TPU bellows (gaiters) | flex with the joint, keep dust/fingers out of linkages |
| Head | helmet form with a recessed smoked visor; wide-angle side windows; LiDAR flush in the crown | cameras behind optical-grade windows; the face does not fake human features |
| Light | amber (≈ 590 nm) slivers: visor sides, chest, hips, elbows, forearms, feet | state signalling (ready / moving / fault) visible from every side |
| Proportion | 1.75 m, shoulders 0.50 m, hips 0.42 m, slim knees (no actuator at the knee) | human-compatible spaces; slim knees and ankles because the actuators sit high |

## 2. Colour, material, finish (CMF)

| Part | Material | Process | Finish |
|---|---|---|---|
| Body shells (≈ 42 panels) | PA12 (HP MJF), 2.0–2.4 mm wall | MJF, bead blast | 2K primer + satin warm-white (RAL 9010-adjacent, 25–30 GU), soft clearcoat |
| Joint covers, neck, bellows | 7075 / 6061 housings; TPU 95A bellows | CNC; cast/printed TPU | hard anodise black (Type III), bead-blast matte; TPU matte graphite |
| Visor, camera windows | PC (polycarbonate), smoked 15 % T, AR + hard coat on camera apertures | machined/thermoformed | gloss |
| Light guides | clear PC + diffuser film, amber LEDs | machined | frosted |
| Soles | NBR / PU tread, replaceable | moulded/cast | matte |
| Fingertips, palm pads | Dragon Skin 20 (Shore 20A) silicone caps | cast in printed moulds | matte |
| Fasteners (visible) | Ti Gr5 button heads on joint caps only | — | bead blast |

## 3. Panelisation and service access

* Front/back splits on every limb (x = 0 plane) with **captive quarter-turn studs + N52 disc magnets**: no tools for shells, and every shell comes off in under 1 minute.
* Torso: chest plate, abdomen plate, and a full-height back door. The back door gives access to the battery,
  the service disconnect and the drives' EtherCAT junction. The battery slides out rearwards on rails.
* Shell-to-structure: 3 mm silicone isolators on M3 bosses, so the shells take no structural load and
  survive a fall by deflecting (PA12 elongation 20 %).
* Every panel is a separate STEP file in `cad/out/step/` (printed directly).

## 4. Views

All renders are generated from the CAD by `viewer/render.mjs` (three.js, physically based
materials). Regenerate with `node viewer/render.mjs <three_dir> renders 2`.

| | |
|---|---|
| ![front](../renders/01_front.png) Front | ![rear](../renders/02_rear.png) Rear |
| ![left](../renders/03_left.png) Left side | ![right](../renders/04_right.png) Right side |
| ![3/4 front](../renders/05_threequarter_front.png) Three-quarter front | ![3/4 rear](../renders/06_threequarter_rear.png) Three-quarter rear |
| ![head](../renders/07_head_detail.png) Head detail | ![hand](../renders/08_hand_detail.png) Hand detail |
| ![hip knee](../renders/09_hip_knee_joints_ghost.png) Hip + knee joint assemblies (ghost shells) | ![shoulder](../renders/15_shoulder_ghost.png) Shoulder assembly (ghost) |
| ![foot](../renders/16_foot_ankle_ghost.png) Ankle + foot (ghost) | ![torso](../renders/17_torso_ghost.png) Torso internals (ghost) |
| ![skeleton](../renders/10_skeleton_front.png) Internal skeleton, front | ![skeleton rear](../renders/11_skeleton_rear.png) Internal skeleton, rear |
| ![exploded](../renders/12_exploded.png) Exploded assembly | ![exploded skeleton](../renders/13_exploded_skeleton.png) Exploded skeleton |
| ![ghost](../renders/14_ghost_threequarter.png) Fully assembled, ghost shells | ![KA-130K](../renders/18_KA130K_cutaway.png) KA-130K knee actuator cutaway |
| ![KA-130K exploded](../renders/19_KA130K_exploded.png) KA-130K exploded | ![KH-25](../renders/20_KH25_cutaway.png) KH-25 shoulder actuator cutaway |

## 5. Head and face

* **ZED X Mini** stereo (50 mm baseline, 0.1–8 m) behind the visor centre, angled 10° down.
* **Two ZED X One GS** wide cameras at the temples, yawed ±55°, for visual-inertial odometry and peripheral vision through side windows.
* **Livox Mid-360** in the crown, flush with the shell. Its −7°…+52° field of view clears the shoulders.
* Mic array behind a perforated band at the lower rear. A small speaker grille sits at the chin.
* No artificial face. Expressions are conveyed by the light slivers (colour, pulse rate) and by head pose.
  This avoids the uncanny valley and keeps the visor optically clean.

## 6. Hands

Human-proportioned (palm 88 × 34 mm, fingers 37–48 mm proximal phalanx, hand length
≈ 0.20 m). White phalanx shells over graphite knuckles, with replaceable silicone tip pads.
The palm pad is a magnetic tactile skin. Ten actuators live in the palm (docs/03 §8).

## 7. Human factors and safety in the form

* Rounded every external edge (R ≥ 3 mm); no exposed linkage within 25 mm of the skin envelope
  except inside gaiters.
* Joint discs and amber rings visibly mark rotation axes (pinch zones).
* Light protocol: steady amber = powered/idle; slow pulse = moving; fast red pulse (LED
  colour shift) = fault / e-stop; off = de-energised.
* Mass placement keeps the CoM at 0.99 m (57 % of height) with the 8.9 kg battery low in the
  torso. That helps balance and lowers fall energy.
