# 07 — Software and control architecture

![Software stack](../diagrams/software_stack.svg)

**Rule zero:** physical motion is deterministic and safe without the AI computer. Large models
(LLM/VLA) choose *what* to do. They never set motor timing, torques or safety behaviour. The
deterministic boundary sits between layer 6 and layer 5: everything at or below layer 5 runs on the
PREEMPT_RT computer or inside the drives.

## 1. Hardware split

| Computer | Runs | OS / middleware |
|---|---|---|
| Joint drives (26) | layer 1 | drive firmware (CiA-402 over EtherCAT); custom firmware only on the custom drive option |
| Hand controllers (2) | finger current/position loops, tactile reflexes | bare-metal on F28P65x |
| **RT computer** (UP Squared Pro 7000) | layers 2–5, locomotion policy inference (CPU, ONNX Runtime) | Ubuntu 24.04 + PREEMPT_RT, CPU isolation (`isolcpus`, IRQ affinity), IgH EtherCAT 1.6, ros2_control (Jazzy), Pinocchio |
| **AI computer** (Jetson T5000) | layers 6–10 | JetPack 7, ROS 2 Jazzy, Isaac ROS, TensorRT |
| Safety MCU | independent monitor | bare-metal, SafeTI libraries, MISRA-C |

## 2. Layers

### 1. Low-level motor control (drives)
* FOC current loop 20–50 kHz (Everest S: 50 kHz current loop, 25 kHz servo loop [R2]); velocity and
  position loops inside the drive for safe fallback; field weakening enabled with a limited Id.
* The RT computer runs **cyclic synchronous torque (CST)** mode at 1 kHz for the legs, plus impedance terms computed on the RT side.
  The arms use CST with the torque-flexure feedback.
* In-drive protection: I²t, winding-temperature model + NTC, over-voltage, encoder plausibility, STO.

### 2. Joint coordination (RT, 1 kHz)
* Maps between joint space and actuator space for the **knee four-bar** (G(θ) from
  `data/knee_fourbar.json`), the **ankle** and **wrist** parallel linkages (exact inverse kinematics,
  not the small-angle form), and gear-error tables from the dual encoders.
* Joint limits (soft limits 3° inside the hard stops), velocity/torque limits from the actuator envelopes,
  and friction + cogging compensation (identified on the dyno).

### 3. Balance and state estimation (RT, 1 kHz)
* **Contact-aided invariant EKF** (base pose, velocity, IMU biases) fusing the pelvis IMU, leg
  kinematics with foot contact probabilities (load cells + joint torque + impact IMU), and low-rate VIO /
  LiDAR odometry corrections from the AI computer.
* Outputs: base state, CoM, centroidal momentum, contact states.
* Requirements: < 0.5 ms compute; drift < 1 % of distance walked without vision.

### 4. Walking and locomotion (RT, 50 Hz policy / 500 Hz–1 kHz tracking)
* **Primary: learned locomotion policy** (PPO). Trained in simulation on the generated KESTREL model
  (`sim/kestrel_k1.xml`, with actuator torque-speed limits, reflected inertia and linkage maps) and
  domain-randomised over mass, friction, motor constants, latency and terrain (flat, slopes, stairs up/down,
  rough). Observations: base angular velocity, gravity vector, joint positions/velocities, previous
  action, commanded velocity, local height map from the Gemini 335Lg elevation map. Output: joint position
  targets with gains, or torques through the WBC.
* **Fallback / bring-up: ZMP preview-control walker.** This is the gait generator already implemented in
  `calc/kestrel/gait.py` (LIPM preview + multibody dynamics filter), used for the first supported steps
  before any learned policy is trusted.
* Footstep planner for stairs using the elevation map; step height up to 0.18 m.

### 5. Whole-body control (RT, 500 Hz–1 kHz)
* QP-based inverse dynamics (TSID/Pinocchio formulation):
  - tasks: CoM / centroidal momentum, foot and hand poses, posture, torso orientation;
  - constraints: friction cones, CoP inside the sole, joint torque and velocity limits taken from the actuator envelopes.
* Solver: OSQP / ProxQP warm-started, < 0.6 ms on 2 isolated cores. If the QP fails the controller
  holds the last feasible command and requests a Cat 2 stop.

### 6. Manipulation and grasping (Thor + RT, 50–200 Hz)
* Motion planning: NVIDIA cuRobo (GPU) or MoveIt 2, collision models generated from the CAD.
* Grasp synthesis from the ZED X Mini point cloud; hand synergies (power, pinch, lateral, tripod); tactile
  slip reflex at 200 Hz in the hand controller (increase grip when shear/normal rises).
* Arm impedance control with torque-flexure feedback; contact-force limits (ISO/TS 15066 transient
  contact values used as design targets for future collaborative use).

### 7. Computer vision and perception (Thor, 15–60 Hz)
* Isaac ROS: stereo disparity, **cuVSLAM** (visual-inertial odometry), **nvblox** (3D reconstruction / ESDF).
* LiDAR-inertial odometry (FAST-LIO2) as an independent second estimate.
* Detection, segmentation and tracking (people, objects) with TensorRT models; elevation mapping for the feet.

### 8. Navigation (Thor, 5–20 Hz)
Nav2 with a footstep-aware local planner, behaviour trees, and keep-out zones around detected people.
Speed is scaled by distance to the nearest person (ToF + LiDAR + vision).

### 9. High-level AI integration (Thor, 0.5–10 Hz, asynchronous)
* **LLM task planner** turns natural-language goals into a sequence of **skills** (walk_to, look_at,
  pick, place, open, hand_over).
* **VLA policies** (GR00T-class or π0-class open models, fine-tuned on teleoperated demonstrations)
  for dexterous skills. They output *end-effector / hand targets*, never joint torques.
* **Skill API with a safety envelope.** Every skill call is checked against workspace bounds, speed and
  force limits, people-proximity rules and battery/thermal state before the RT controller accepts it.
  Rejections are reported back to the planner.
* The RT controller treats AI requests as advisory. If messages stop it decelerates to a stand.

### 10. Diagnostics and system monitoring (all computers, 1–10 Hz)
Health manager covering temperatures, I²t, battery, EtherCAT error counters, QP status, estimator
covariance and sensor staleness. Foxglove for live views, rosbag2/MCAP logging, Prometheus/Grafana for
long-term trends, and a flight-recorder ring buffer (last 30 s at 1 kHz) dumped on any stop.

## 3. Independent safety monitoring and emergency stop

See [05-electrical-architecture.md §8](05-electrical-architecture.md) and `diagrams/safety_chain.svg`.

| Stop | Trigger | Action |
|---|---|---|
| Cat 0 | wireless or wired e-stop, safety MCU hard fault, BMS fault | STO all drives immediately; disconnect opens; robot falls into the **gantry harness** (testing) or onto its knees/hands in later phases |
| Cat 1 | safety MCU limit (tilt, temperature, heartbeat), software fault | controlled crouch ≤ 1.5 s, then STO |
| Cat 2 | operator stop, AI request, QP infeasible | controlled stop to a stable stand/kneel, power kept |

## 4. Software stack summary

| Function | Component | Licence |
|---|---|---|
| RT OS | Ubuntu 24.04 + PREEMPT_RT | GPL |
| EtherCAT master | IgH EtherLab 1.6 (DC support, igc driver) | GPLv2 |
| Control framework | ros2_control + custom RT loop (no DDS in the 1 kHz path) | Apache-2.0 |
| Dynamics | Pinocchio, TSID / ProxQP | BSD |
| Training | MuJoCo (+ MJX) light trainer; Isaac Lab task for RTX machines | Apache-2.0 / BSD |
| Perception | Isaac ROS (cuVSLAM, nvblox), ZED SDK, Livox SDK2, FAST-LIO2 | NVIDIA / vendor / GPL |
| Planning | Nav2, cuRobo / MoveIt 2, BehaviorTree.CPP | Apache / NVIDIA / BSD |
| AI | TensorRT, open VLA models, local LLM | various |
| Monitoring | Foxglove, MCAP, Prometheus/Grafana | MIT / Apache |

## 5. Development workflow

1. Simulation first: `sim/kestrel_k1.xml` is generated from the same parameters as the hardware design.
2. Software-in-the-loop: the RT stack runs against MuJoCo through the same ros2_control interface.
3. Hardware-in-the-loop per actuator on the dyno (gate G1), then per limb (G2).
4. Every controller change passes a scripted simulation regression (stand, walk, stairs, push) before it
   touches hardware.
5. Version every calibration (encoder offsets, flexure gains, camera extrinsics) in git with the hardware serial numbers.
