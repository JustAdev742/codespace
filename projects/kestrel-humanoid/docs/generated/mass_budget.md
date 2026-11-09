# Mass budget (generated)

Estimated mass **103.1 kg**; design mass for requirements **113.4 kg** (x1.1 growth contingency).

## By category

| Category | kg | % |
|---|---|---|
| actuator | 59.23 | 57.5 |
| structure | 14.93 | 14.5 |
| battery | 12.40 | 12.0 |
| electronics | 5.26 | 5.1 |
| shell | 4.66 | 4.5 |
| harness | 2.97 | 2.9 |
| hand | 2.30 | 2.2 |
| sensor | 1.31 | 1.3 |

## By body

| Body | kg | Main components |
|---|---|---|
| pelvis | 7.00 | pelvis frame (7075-T6 machined bowl + CF closeout) 1.50; hip-yaw actuator L 1.42; hip-yaw actuator R 1.42; waist-yaw actuator 1.42; pelvis IMU + EtherCAT junction + pelvis I/O board 0.35; pelvis shells (PA12-MJF, painted) 0.55; pelvis harness 0.35 |
| waist_link | 3.41 | waist-pitch actuator 2.96; waist yoke (7075-T6) 0.45 |
| torso | 27.80 | spine + ribcage frame (7075-T6 + CF panels) 2.40; battery pack A, hot-swap 16S4P (64 Molicel P50B, 1.15 kWh) incl. BMS, fuse, end cap + handle 6.20; battery pack B, hot-swap 16S4P (64 Molicel P50B, 1.15 kWh) incl. BMS, fuse, end cap + handle 6.20; AI computer (Jetson AGX Thor module + carrier + cold plate) 1.45; real-time control computer + safety MCU board 0.45; power distribution unit (contactor, fuses, DC-DC) 1.20; cooling: liquid loop (2 pumps, radiator + 2 fans, reservoir, coolant, compute cold plate) + electronics blower 1.25; shoulder-pitch actuator L 2.60; shoulder-pitch actuator R 2.60; neck-yaw actuator 0.68; chest depth camera (terrain) 0.15; speaker + amplifier 0.12; torso shells (chest, back door, abdomen) 1.60; torso harness + connectors 0.90 |
| neck_link | 0.86 | neck-pitch actuator 0.68; neck yoke (7075-T6) 0.18 |
| head | 1.85 | stereo camera + 2 wide SLAM cameras 0.45; 3D LiDAR (Livox Mid-360 class) 0.27; head frame (6061-T6 + PA12-CF) 0.40; head shell + visor (PA12 + PC visor) 0.45; head electronics: GMSL serialisers, mic array, face LEDs 0.28 |
| l_shoulder (x2) | 2.85 | shoulder-roll actuator 2.60; shoulder bracket (7075-T6) 0.25 |
| l_upper_arm_a (x2) | 1.81 | shoulder-yaw actuator 1.63; roll output bracket (7075-T6) 0.18 |
| l_upper_arm (x2) | 2.38 | elbow actuator 1.63; upper-arm tube + end fittings (7075/CF) 0.38; upper-arm shells 0.22; upper-arm harness 0.15 |
| l_forearm_a (x2) | 0.82 | wrist-yaw actuator 0.68; elbow output bracket 0.14 |
| l_forearm (x2) | 1.27 | wrist linear actuator A 0.34; wrist linear actuator B 0.34; hand controller board 0.08; forearm frame (7075-T6) 0.25; forearm shells 0.18; forearm harness 0.08 |
| l_wrist (x2) | 0.06 | wrist cross (Ti-6Al-4V) 0.06 |
| l_hand (x2) | 1.25 | wrist 6-axis F/T sensor 0.10; hand Mk II (13 DOA, linkage + tendon, palm camera, >=200 N grasp) 1.15 |
| l_hip_yaw_link (x2) | 3.44 | hip-roll actuator (gluteal volume) 2.96; hip yaw-roll yoke (7075-T6) 0.48 |
| l_hip_roll_link (x2) | 5.11 | hip-pitch actuator (coaxial with hip centre) 4.76; hip roll-pitch bracket (7075-T6) 0.35 |
| l_thigh (x2) | 6.87 | knee actuator (in upper thigh) 4.96; thigh frame (7075-T6 twin-plate + CF tube) 0.95; knee push-rod (Ti tube, 2 rod ends) 0.16; thigh shells 0.35; thigh harness + coolant lines (dry-break quick-disconnects) 0.45 |
| l_shank (x2) | 4.22 | ankle actuator A (calf, upper) 1.42; ankle actuator B (calf, lower) 1.42; shank frame (7075-T6 + CF tube) 0.75; ankle push-rods x2 (Ti tube, rod ends) 0.18; shank shells 0.28; shank harness 0.18 |
| l_ankle_link (x2) | 0.22 | ankle cross (Ti-6Al-4V, 2x needle-roller pairs) 0.22 |
| l_foot (x2) | 0.77 | foot plate (7075-T6) + heel/toe shells 0.45; sole (NBR/PU tread, replaceable) 0.20; 4x sole load cells + foot board 0.12 |
