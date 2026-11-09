# KESTREL S1: compute and software

How S1's computer, operating system, ROS 2 graph, actuator drivers, safety layer, calibration, IMU and RL
walking stack fit together, and how to bring the robot up the first time. The power, e-stop and CAN wiring
this relies on are in [S1-electrical.md](S1-electrical.md). Prices are in
[../generated/bom.md](../generated/bom.md).

**Rule zero (from K1, docs/07):** motion stays deterministic and safe without the high-level software. The
learned policy chooses targets; it never sets timing, limits or safety behaviour. The hardware e-stop works
with every computer switched off.

Tags as in the electrical document: **[M]** manufacturer document, **[S]** supplier page, **[R8]/[R9]**
research notes in this repo, **[E]** estimate or assumption, **UNVERIFIED** not confirmed from a primary
source. All sources accessed 2026-11-09 (list in §11).

---

## 1. Summary

| Item | Choice |
|---|---|
| Computer | NVIDIA **Jetson Orin Nano Super Developer Kit** (8 GB, 7-25 W), upgradeable in place to an Orin NX 16 GB module |
| OS | JetPack 6.x (Ubuntu 22.04), Jetson Linux real-time kernel, 2 isolated cores for control |
| Middleware | ROS 2 Humble; ros2_control for the 250 Hz joint loop (no DDS in that loop) |
| Joint bus | 5 × classic CAN 1 Mbps through mjbots mjcanfd-usb-1x (gs_usb SocketCAN), **250 Hz** command/reply per joint |
| Actuator modes | RobStride "operation control" (MIT-style p/v/Kp/Kd/τff, 29-bit private protocol); MyActuator "motion mode" (0x400 + ID) |
| Policy | the repo's PPO policy (`train/`), MLP at 50 Hz on the CPU, retargeted to S1 with `--variant s1` |
| Safety | joint, velocity and torque limits in the hardware interface; three-level watchdog (policy, actuator CAN timeouts, hardware K3 relay); software DAMP stop plus the hard-wired e-stop |

---

## 2. Compute choice

| Option | For | Against |
|---|---|---|
| **Jetson Orin Nano Super Dev Kit, A$848.10** [S: Core Electronics, R9] | CUDA for the depth/elevation pipeline the policy needs (11 × 7 height scan); 7-25 W; 9-20 V input works straight off the 12 V rail; the carrier also takes Orin NX modules [M: NVIDIA forum quoting the carrier spec]; ToddlerBot and K-Bot use Jetsons (R8) | 8 GB RAM; JetPack kernel lags mainline (gs_usb CAN-FD support, RT patches): **UNVERIFIED** for your JetPack release, check `modprobe gs_usb` |
| Jetson Orin NX 16 GB module, A$1,890 ex GST [S: IoT Store AU, R9] | 2× the AI throughput, 16 GB for VLA-class models later | 2.2× the price; prices rose 33-101 % in July 2026 (R9) |
| Jetson AGX Orin | far more GPU | heavier, 15-60 W, several times the cost; nothing S1 needs to walk |
| x86 mini PC (N100/N150 class, the BHL choice; or a Ryzen box) | mainline Linux with PREEMPT_RT merged since 6.12; plentiful USB; cheap (BHL's N95: US$129, R8) | no CUDA: the camera height map must run on the CPU, or the policy must be blind; adds a second box if vision is wanted later |

**Decision: the Orin Nano Super Dev Kit.** The locomotion policy is a 256-128-128 MLP that needs well under
1 ms on any of these CPUs, so the choice is about everything else. One computer can run the policy, the
5 CAN buses, the depth camera and the elevation map that feeds the policy's height scan, within the 25 W
envelope that the 12 V rail and 2.2 kW peak budget allow. Upgrade path: swap in an Orin NX 16 GB module on
the same carrier. Fallback for a blind-walking-only build: an x86 mini PC running the same ROS 2 packages.

---

## 3. Operating system and real-time setup

1. **JetPack 6.x** (Ubuntu 22.04, ROS 2 Humble, the Roboto Origin deployment stack, R8). Move to ROS 2 Jazzy
   only when a JetPack 7 release supports Orin.
2. **Real-time kernel.** Install the Jetson Linux real-time (PREEMPT_RT) kernel option from NVIDIA's Jetson
   Linux Developer Guide (Kernel → Real-Time Kernel). Package names and support vary by release:
   **UNVERIFIED**, check for your JetPack version.
3. **Power and clocks.** `sudo nvpmodel -m <MAXN SUPER mode>` then `sudo jetson_clocks`, so DVFS does not
   add latency.
4. **Core isolation.** On the 6-core Orin Nano, add to the kernel command line:
   `isolcpus=4,5 nohz_full=4,5 rcu_nocbs=4,5 irqaffinity=0-3`, and disable deep idle states on CPUs 4-5.
5. **Threads.**
   - the 250 Hz control loop (controller_manager): `SCHED_FIFO` 80, pinned to CPU 5, `mlockall`;
   - CAN receive threads (one per bus): `SCHED_FIFO` 70, pinned to CPU 4;
   - everything else (cameras, ROS executors, logging): CPUs 0-3, normal priority.
6. **Measure before trusting.** Run `cyclictest -m -Sp90 -i250 -h400 -D10m` with the cameras streaming.
   Target maximum latency < 200 µs [E: S1 target, chosen to stay well below the 4 ms cycle].
7. **CAN interfaces.** Pin names to USB serial numbers (USB enumeration order is not stable):

   ```
   # /etc/udev/rules.d/80-s1-can.rules  (serials from: udevadm info -a /sys/class/net/can0)
   SUBSYSTEM=="net", ACTION=="add", ATTRS{serial}=="<serial-1>", NAME="can_lleg"
   SUBSYSTEM=="net", ACTION=="add", ATTRS{serial}=="<serial-2>", NAME="can_rleg"
   SUBSYSTEM=="net", ACTION=="add", ATTRS{serial}=="<serial-3>", NAME="can_larm"
   SUBSYSTEM=="net", ACTION=="add", ATTRS{serial}=="<serial-4>", NAME="can_rarm"
   SUBSYSTEM=="net", ACTION=="add", ATTRS{serial}=="<serial-5>", NAME="can_torso"
   ```

   Bring each up with `ip link set can_lleg type can bitrate 1000000 restart-ms 100`, then
   `ip link set can_lleg txqueuelen 1000 up`. Make it persistent with systemd-networkd. Enable the
   interface's own 120 Ω termination (mjbots documentation). Watch error counters with
   `ip -details -statistics link show can_lleg`.
8. **USB latency.** A full-speed USB adapter adds about 1 ms per transfer [E]. At 250 Hz (4 ms period) the
   loop sends all commands at the start of the cycle, collects replies for up to 2.5 ms, then computes. The
   policy is trained with action latency (`--delay`), and the measured round trip is logged at bring-up.

---

## 4. ROS 2 node graph

```
                   ┌──────────────── Jetson Orin Nano Super · Ubuntu 22.04 + RT kernel · ROS 2 Humble ─────────────────┐
 gamepad ─► joy ─► s1_teleop ── /cmd_vel ───────────────────────────────┐                                              │
                        └── /s1/estop (service, software DAMP) ──┐      │                                              │
                                                                 ▼      ▼                                              │
 realsense2_camera (chest) ─ /chest/depth ─► elevation_mapping ─ /height_scan (11×7) ─► ┐                              │
 hipnuc_imu (pelvis) ─ /imu/data ───────────────────────────────────────────────────────┤                              │
                                                                                        ▼                              │
 ┌─ controller_manager (ros2_control) · 250 Hz · SCHED_FIFO 80 · CPU 5 ─────────────────────────────────────────────┐  │
 │  s1_policy_controller   50 Hz: build the 124-value observation, run policy.pt, targets = default + 0.25·clip(a,±8) │  │
 │  arm/neck/gripper JointTrajectoryControllers (hold pose, scripted motions)                                     │  │
 │  joint_state_broadcaster ─► /joint_states ─► robot_state_publisher ─► /tf                                     │  │
 │  imu_sensor_broadcaster                                                                                        │  │
 │  ── command interfaces (q*, q̇*, kp, kd, τff per joint) ──────────────────────────────────────────────────────  │  │
 │  s1_hardware (SystemInterface plugin)                                                                          │  │
 │    1. joint → actuator maps: ankle parallel linkage IK + Jacobian, knee belt 1.5:1, hip-roll crank 2:1, signs   │  │
 │    2. SAFETY LAYER (§6): limits, torque/velocity clamps, staleness checks, DAMP/OFF states                     │  │
 │    3. codecs: RobStride private protocol (types 1, 2, 3, 4, 6, 17, 18, 21), MyActuator motion mode 0x400+ID     │  │
 │    4. 5 SocketCAN sockets (can_lleg … can_torso), RX threads on CPU 4; foot boards on the leg buses (100 Hz)   │  │
 │    5. GPIO: kicks the K3 watchdog every cycle; reads ARMED · I²C: INA228 bus monitor                            │  │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
 s1_supervisor: state machine OFF → ARMED → DAMP → STAND → WALK; checks battery, temperatures, faults, tilt ◄──► s1_hw  │
 depthai_ros (head OAK-D Lite) · foxglove_bridge · rosbag2 (MCAP) · diagnostic_aggregator                             │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Design rules:

- **No DDS in the 250 Hz path.** The policy runs as a controller inside the controller_manager process.
  Only slow inputs (velocity command, height scan, supervisor state) arrive over topics, through real-time
  buffers.
- **The safety layer sits in the hardware interface,** after every controller, so no controller (or a bug in
  one) can bypass it.
- **The observation must match `train/env.py` exactly:**
  - base angular velocity and projected gravity from the IMU;
  - velocity command;
  - gait clock (sin, cos; 0.8 s period);
  - 12 leg joint positions and velocities;
  - last action;
  - 11 × 7 height scan from −0.4 to +0.8 m ahead.

  The output is 12 actions: clip to ±8, multiply by 0.25 rad, add the default pose (train/README). Write an
  observation unit test that compares the robot-side vector against `env.py` for a logged state.

---

## 5. Actuator drivers

### 5.1 RobStride (RS04, RS03, RS02, RS00): private protocol, operation-control (MIT-style) mode

The CAN frame is a 29-bit extended ID: bits 28-24 = communication type, bits 23-8 = data area 2, bits 7-0 =
target ID; 8 data bytes [M: RS04 manual §4.1].

| Type | Use in S1 |
|---|---|
| 0 | get device ID (bench) |
| **1** | operation control: ID data area = τff (16 bit); bytes 0-1 angle, 2-3 velocity, 4-5 Kp, 6-7 Kd (big-endian); reply = type 2 |
| **2** | feedback: angle, velocity, torque (16 bit each), temperature × 10; fault bits and mode (reset / calibration / run) in the ID |
| 3 / 4 | enable / stop (type 4 with byte 0 = 1 also clears faults) |
| 6 | set mechanical zero |
| 17 / 18 / 22 | read parameter / write parameter (lost at power-off) / save |
| 21 | fault frame (over-temperature 145 °C, over-voltage 60 V, under-voltage 12 V, over-current, encoder not calibrated) |

Per-model scaling of the 16-bit fields (the `#define`s in each manual's sample code):

| Model | Position (rad) | Velocity (rad/s) | Torque (N·m) | Kp | Kd |
|---|---|---|---|---|---|
| RS04 [M: RS04 manual] | ±12.57 | **±15** | ±120 | 0-5000 | 0-100 |
| RS03 [M: RS03 manual] | ±12.57 | ±20 | ±60 | 0-5000 | 0-100 |
| RS02 [M: RS02 manual] | ±12.57 | ±44 | ±17 | 0-500 | 0-5 |
| RS00 [M: RS00 manual] | ±12.57 | ±33 | ±14 | 0-500 | 0-5 |

**Watch the RS04 velocity field.** It saturates at ±15 rad/s although the no-load speed is 20.9 rad/s
(200 rpm, RS04 manual §1.3). The S1 joint limits used for training (`train/model.py: joint_limits_s1`) use
20.9 rad/s for hip yaw and 16.1/23.3 rad/s for ankle pitch/roll. Feedback above 15 rad/s at an RS04 is clipped,
so treat 15 rad/s at the actuator as a hard velocity limit in the safety layer.

Parameters set at commissioning (type 18, then type 22 to save) [M: RS04 manual parameter tables]:

| Index | Name | S1 value |
|---|---|---|
| 0x7005 | run_mode | operation-control mode (check the value table in the manual) |
| 0x700B | limit_torque | the bring-up stage limit (§6.2) |
| 0x7017 / 0x7018 | limit_spd / limit_cur | per joint, conservative at bring-up |
| 0x7028 | canTimeout (20000 = 1 s) | **1000 = 50 ms** |
| 0x7029 | zero_sta (0: 0-2π, 1: −π-π) | 1 |
| 0x702B | add_offset | so the joint range never crosses the ±π wrap (§7) |
| 0x702A | damper | leave enabled (post-power-off anti-backdrive damping, manual §4.2.5) |

Open-source drivers to start from (check each against the manual before use):

- RobStride's own protocol description and C sample code: the user manuals in
  <https://github.com/RobStride/Product_Information>;
- Seeed `RobStride_Control`: Python, C++, Rust and Arduino; MIT, position and speed modes; SocketCAN at 1 Mbps
  (<https://github.com/Seeed-Projects/RobStride_Control>, wiki <https://wiki.seeedstudio.com/robstride_control/>);
- `robstride_ros2`: ROS 2, RS00-RS06 and EL05, MIT-licensed driver package using the 29-bit private protocol
  over ros2_socketcan (<https://index.ros.org/r/robstride_ros2/>); also `robstride_ros2_control`
  (<https://index.ros.org/p/robstride_ros2_control/>);
- K-Scale's K-Bot stack, which drove RS00-RS04 on a 1.4 m humanoid: <https://github.com/kscalelabs/kos-kbot> (R8).

### 5.2 MyActuator RMD-X12-P20-320 (hip pitch, knee): CAN protocol V4.4

From the CAN BUS Motor Motion Protocol V4.4 [M]:

- standard 11-bit frames, 8 bytes, 1 Mbps;
- commands 0x140 + ID, replies 0x240 + ID, **IDs 1-32**;
- **motion mode 0x400 + ID**, reply **0x500 + ID**, with fields:
  - p_des 16 bit, ±12.566 rad;
  - v_des 12 bit, ±45 rad/s;
  - kp 12 bit, 0-1000;
  - kd 12 bit, 0-5;
  - τff 12 bit, ± the module's max torque.

  The torque law is `IqRef = [kp·(p_des − p) + kd·(v_des − v) + t_ff] / KT`.
- **Conflict:** the worked example in the same protocol scales kp over 0-500 and kd over 0-50. Measure the
  real scaling on the bench (step response with a known kp) before using either. **UNVERIFIED.**
- If the text range (kd ≤ 5) is right, the hip-pitch joint damping of 8 N·m·s/rad used in training cannot be
  sent. Use kd = 5 and retrain, or confirm the 0-50 range.
- Communication-loss protection: command 0xB3, time in ms; output cut when exceeded. Set **50 ms**.
- Zero: 0x64 writes the current multi-turn position to ROM as zero (protocol §2.10).

Open-source drivers:

- `myactuator_rmd`: C++ SocketCAN driver with Python bindings and a ROS 2 integration
  (<https://docs.ros.org/en/humble/p/myactuator_rmd/>). It targets the 0x140-series commands; motion mode
  0x400 support is **UNVERIFIED**, so add it from the protocol if missing.
- Seeed's getting-started guide: <https://wiki.seeedstudio.com/myactuator_series/>.

### 5.3 The S1 hardware interface (`s1_hardware`)

One ros2_control `SystemInterface` plugin, written in C++ on the drivers above. Per cycle (4 ms):

1. **read():** drain all five sockets.
   - Decode type-2 and 0x500 + ID replies into actuator position, velocity, torque and temperature, and foot
     load-cell frames.
   - Map actuator → joint: ankle by the linkage forward kinematics, knee ÷ 1.5, hip roll ÷ 2, signs and
     offsets from the calibration file.
   - Mark any joint whose reply is older than 3 cycles as stale.
2. Controllers update.
3. **write():**
   - The safety layer (§6) clamps the targets.
   - Map joint → actuator, gains included: an actuator behind a reduction r gets kp/r² and kd/r²; the ankle
     uses the linkage Jacobian (§9.3).
   - Encode and send one command per actuator.
   - Kick the K3 watchdog.

Power-on order: assign nothing automatically. The ID → joint map is a checked-in YAML that must match the
IDs read back with type 0 at start-up, or the robot refuses to arm.

---

## 6. Safety layer

### 6.1 Layers, from fastest to most final

| # | Layer | Trigger | Action |
|---|---|---|---|
| 1 | Target clamps (every cycle) | target outside the soft limit, or torque/velocity above the stage limit | clamp silently, count in diagnostics |
| 2 | Software DAMP | any of: tilt > 45°, joint beyond soft limit + 2°, stale joint > 3 cycles, policy output stale > 60 ms (3 policy periods), actuator fault frame, winding > 120 °C, bus < 43 V, operator `/s1/estop` or gamepad button | all joints: kp = 0, kd = damping (≈ 2-5 N·m·s/rad joint side), τff = 0; after 2 s → OFF (type 4 stop frames) and K3 released |
| 3 | Actuator CAN timeouts | no command for 50 ms (RobStride canTimeout = 1000; MyActuator 0xB3 = 50) | each actuator turns its own output off (software dead or USB unplugged) |
| 4 | Hardware watchdog K3 | the RT loop stops kicking the 74HC123 for 200 ms | contactor opens (S1-electrical §6.2) |
| 5 | Hard-wired e-stop | any mushroom or the wireless e-stop | contactor opens; bus clamped by the regen clamp |

DAMP lets the robot sag slowly into the gantry instead of dropping. The RobStride manual notes that damping
mode generates power, so the battery must be connected (it is, unless layer 4 or 5 has fired) and the regen
clamp covers the rest.

### 6.2 Limits

- **Joint position:** soft limits sit 3° inside the mechanical ranges in `calc/kestrel/variant_s1.py`
  (`JOINTS_LEFT_S1`, `JOINTS_CENTRE_S1`), as params.py specifies. Targets are clamped there, and the host also
  limits kp·|q* − q| so a far target cannot produce a torque spike.
- **Torque:** clamp τff and the PD term on the host, and also set each actuator's internal limit (RobStride
  limit_torque 0x700B; MyActuator max torque current in its host tool) to the same stage value.

  | Bring-up stage | Torque limit (fraction of joint peak) | Speed limit |
  |---|---|---|
  | Bench, single joint | 20 % | 2 rad/s |
  | Hanging in the gantry | 30 % | 50 % of no-load |
  | Standing / supported stepping | 50 % | 50 % |
  | Validated walking | 90 % (the 10 % control headroom of `s1_select.py`) | 90 % of no-load, RS04 ≤ 15 rad/s at the actuator |

  Joint peaks: hip yaw 120, hip roll 228, hip pitch 320, knee 456, ankle pitch 234 / roll 75.6 (independent
  conservative limits, as in training), shoulder pitch/roll 120, shoulder yaw/elbow 60, wrist 17, neck 14 N·m.
- **Continuous torque:** a per-joint I²t estimate against 0.8 × rated torque (the selection's derate) warns at
  100 % and forces DAMP at 130 % for > 10 s [E]. RobStride also protects itself (overload table, 145 °C).
- **Power cap:** the supervisor limits the sum of commanded |τ·ω| + copper loss to 2.0 kW until the BMS
  overcurrent test (S1-electrical §13) is passed.
- **Battery:** warn at 44 V, controlled sit at 43 V, OFF at 42 V (S1-electrical §4.2).

### 6.3 Software e-stop vs hardware e-stop

| | Software stop (`/s1/estop`, gamepad) | Hardware e-stop |
|---|---|---|
| Path | ROS service → supervisor → hardware interface DAMP → OFF → K3 opens | mushroom contacts / wireless relay in the coil loop |
| Depends on | Jetson, ROS, CAN all working | nothing but wires and the contactor |
| Robot behaviour | sags under damping, then power off | immediate power off, falls into the harness |
| Use | routine stops, anything unexpected but not dangerous | danger to people or property, loss of control, any doubt |

The gamepad stop is **not** a safety device. It exists so that routine stops do not drop the robot.

---

## 7. Joint calibration and zeroing

Each actuator has an absolute output encoder:

- RobStride: 14-bit single-turn absolute (manual §2.1);
- X12: 17-bit absolute input and output encoders (X-V4 manual).

So zeroing is done **once** at assembly, then checked at every boot.

1. **Bench, before assembly** (R8 lesson from Asimov):
   - set the CAN ID;
   - set canTimeout / 0xB3;
   - set zero_sta = 1 (RobStride);
   - write the ID on the housing.
2. **Jigs.** Laser-cut (or 3D-printed) zero jigs hold each joint at its reference pose (legs straight, ankle
   flat, arms down), ToddlerBot style (R8). Plates on the 20 mm grid make jigs easy to locate.
3. **Set zero in the jig:**
   - RobStride: type 6 (set mechanical zero), then type 22 to save;
   - MyActuator: 0x64 (current position to ROM as zero).
4. **Keep every joint range inside one encoder turn and away from the wrap point.**
   - With zero_sta = 1 a RobStride reports −π…π. A joint whose range crosses ±π (shoulder pitch: −180° to
     +60° in variant_s1.py) must be shifted with add_offset (0x702B) so its whole range sits inside (−π, π).
     For shoulder pitch, an offset of +60° maps it to −120°…+120°.
   - Joints behind a reduction multiply the range: hip roll (2:1) 140° → 280° at the actuator; knee (1.5:1)
     130° → 195°. Both fit inside one turn.
5. **Calibration file.** Store per joint: ID, sign, offset, reduction, soft limits, serial number. Keep it in
   git (docs/07 rule).
6. **Boot check.** All joints must read inside their mechanical range, and the ankle must close its linkage
   consistently (both actuators agree on pitch/roll). Otherwise refuse to arm.
7. **Ankle.** Zero both ankle actuators with the foot flat in the jig. The linkage IK in
   `calc/kestrel/linkages.py` (ANKLE: crank 40 mm, foot lever 52 mm, half spacing 36 mm) then maps
   (pitch, roll) ↔ (A, B). Verify by measuring foot angles at ±20° with an inclinometer.

---

## 8. IMU

- **Part:** HiPNUC HI13 industrial-class AHRS, ¥350 in the Roboto Origin BOM (R8 [V 46]). Its interface variant
  (USB/serial/CAN) is **UNVERIFIED**. Cheaper: Adafruit BNO085 (A$48.68 [R9]), which BHL calls
  "cellphone-grade" and later replaced (R8). Upgrade: Xsens MTi-3 DK (A$912.79 [R9]).
- **Mounting:**
  - on the pelvis at the MJCF `imu` site (−0.06, 0, 0.05 m in the pelvis frame), so the robot's angular
    velocity and gravity vector are in the same frame as in training;
  - axes aligned with the pelvis frame;
  - a rigid aluminium bracket, with a thin damping pad only if vibration testing shows a resonance;
  - ≥ 100 mm from the contactor and brake resistors.
- **Rate:** ≥ 200 Hz into the 250 Hz loop (read the latest sample each cycle).
- **Policy inputs:** base angular velocity (gyro, bias-corrected at standstill) and projected gravity
  (from the AHRS orientation). The policy does not use the magnetometer; disable it in the AHRS fusion,
  because the robot's own currents distort it.
- **Calibration:**
  - gyro bias at every boot (2 s still, robot hanging);
  - mounting misalignment once: robot standing level in the jig, store a rotation;
  - check projected gravity reads (0, 0, −1) ± 0.02 when level.

---

## 9. Retargeting the RL training package (`train/`) to S1

`train/` (README) trains the K1 legs with PPO in MuJoCo on a CPU. It already takes `--variant s1`:
`train.py` sets `KESTREL_VARIANT` before the workers fork, `model.py` builds the S1 MJCF through `calc` and
reads the S1 joint limits from `simple/data/actuator_family.json` (`joint_limits_s1`). The steps below are
what to check and change for sim-to-real.

### 9.1 Generate the S1 MJCF from calc

The design model comes from the same parameters as the hardware (`calc/kestrel/variant_s1.py` via
`params.py`), so geometry, masses and armature stay in one place. To write a standalone S1 model with the
selected actuators' joint-side torque limits:

```bash
cd projects/kestrel-humanoid
KESTREL_VARIANT=s1 python - <<'EOF'
import json, sys
sys.path.insert(0, "calc")
from kestrel import params as P, model as Mo, linkages as LK
fam = json.load(open("simple/data/actuator_family.json"))
eff = {}
for jn, j in P.joint_table().items():
    base = jn[2:] if jn[:2] in ("l_", "r_") else jn
    f = fam[j["act"]]
    if base == "ankle_pitch":   eff[jn] = 2 * f["peak_Nm"] * LK.ANKLE["r_p"] / LK.ANKLE["r_c"]
    elif base == "ankle_roll":  eff[jn] = 2 * f["peak_Nm"] * LK.ANKLE["d"] / LK.ANKLE["r_c"]
    else:
        r = f["reductions"][base]
        eff[jn] = f["peak_Nm"] * r * (0.95 if r > 1 else 1.0)       # belt / crank efficiency 0.95
open("sim/kestrel_s1.xml", "w").write(Mo.build_mjcf(mass_scale=1.0, effort=eff, damping=0.5, timestep=0.002))
EOF
```

Checked in this session: 27 actuators, 65.5 kg total. Joint limits: hip pitch 320 N·m, knee 456, hip roll 228,
ankle pitch 312 / roll 216 (both actuators combined), hip yaw 120 N·m.

### 9.2 PD gains and torque limits from the selected actuators

| Joint | Actuator, reduction | Joint peak (N·m) | Training limit (N·m) | Continuous, 0.8 × rated (N·m) | No-load speed at the joint (rad/s) | Kp / Kd (joint) | Kp / Kd sent to the actuator |
|---|---|---|---|---|---|---|---|
| hip yaw | RS04, 1:1 | 120 | 120 | 32 | 20.9 → **15** (frame limit) | 150 / 5 | 150 / 5 |
| hip roll | RS04, 2:1 crank, η 0.95 | 228 | 228 | 61 | 10.5 → **7.5** | 250 / 7 | 62.5 / 1.75 |
| hip pitch | X12, 1:1 | 320 | 320 | 68 | 13.1 | 300 / 8 | 300 / 8 (kd > 5: see §5.2) |
| knee | X12, 1.5:1 belt, η 0.95 | 456 | 456 | 97 | 8.7 | 300 / 8 | 133 / 3.6 |
| ankle pitch | 2 × RS04, linkage | 312 combined | 234 (× 0.75) | 83 combined | 16.1 → **11.5** | 80 / 2.5 | ≈ 24 / 0.75 per actuator |
| ankle roll | same | 216 combined | 75.6 (× 0.35) | | 23.3 → **16.7** | 50 / 2 → ≈ 38 / 1.2 (see below) | (same actuators) |

- Kp/Kd are the values in `train/model.py` (inherited from K1) and are a start, not identified values. An
  actuator behind a reduction r gets kp/r² and kd/r²: hip roll 250/4 = 62.5; knee 300/2.25 = 133.
- **Ankle gains.** For two equal actuators of stiffness k_a through the linkage,
  K_pitch = 2·k_a·(r_p/r_c)² = 3.38·k_a and K_roll = 2·k_a·(d/r_c)² = 1.62·k_a. Pitch and roll stiffness
  cannot be set independently with actuator-level PD. k_a = 24 gives pitch 80 and roll 38.
  **Retrain with roll Kp = 38 / Kd = 1.2** so that sim matches what the hardware can do, or close the loop in
  joint space on the host.
- "→" values are the RS04 ±15 rad/s frame limit seen from the joint (15/r for the crank, through the linkage
  for the ankle). Use them for the policy's speed penalty (90 % of no-load) and for the safety clamp.
- Training force limits use the joint peaks. Hardware runs the stage limits of §6.2 and only reaches 90 % of
  peak after validation.

### 9.3 Model gaps to close before trusting sim

| Gap | Effect | Fix |
|---|---|---|
| The MJCF gives hip pitch the knee's armature: S-LX class ratio 30 = 20 × 1.5 → 3.64e-4 × 30² = 0.328 kg·m²; direct hip pitch should be 3.64e-4 × 20² = 0.146 | hip pitch 2.25× too sluggish in sim | per-joint armature override, or split the class |
| Rotor inertia is an estimate in `s1_select.py` (rotor ≈ 25 % of mass); MyActuator lists "moment of inertia 12.9 kg·cm²" for the X12 without saying which side [M: X-V4 manual] | armature uncertain by up to ~3× | identify on the bench (chirp), §9.5 |
| The ankle is two independent joints in training, with conservative limits; the armature of each is one actuator's direct value | roll/pitch coupling and reflected inertia (≈ 2 × 0.0176 × 1.69 = 0.060 kg·m² pitch) missing | model the closed linkage in MuJoCo (equality constraints) for sim-to-sim |
| Knee belt modelled as rigid | belt stretch adds compliance | measure joint stiffness with the belt tensioned; add a spring-damper if it is below ~3,000 N·m/rad [E] |
| Arms, waist and neck rigid in training | arm swing absent | fine for first walking; arms held by position control |
| Height scan assumes a perfect terrain map | real elevation map is noisy and delayed | train with scan noise and dropout, or train a first **blind** policy (height scan replaced by a flat-ground constant) for hardware bring-up |

### 9.4 Training

```bash
cd projects/kestrel-humanoid/train
python train.py --variant s1 --name s1_flat --terrain flat --hours 2 --delay 0.5   # first: flat ground
python train.py --variant s1 --name s1_flat --resume --terrain rough --hours 4     # then the curriculum
python play.py  --variant s1 --run s1_flat --table runs/s1_flat/eval.md
```

`--delay 0.5` adds 20 ms of action latency to half the episodes (train/README). Keep it on for anything
going to hardware: the S1 CAN round trip plus the 50 Hz policy step is of that order.

### 9.5 Sim-to-real steps

1. **Actuator system ID** on the bench, per model (one RS04, one X12, one RS03, ...). Use chirp and step
   tests in MIT mode, logging command vs feedback at 250 Hz. Fit:
   - torque constant and saturation;
   - friction (Coulomb + viscous) and armature;
   - latency.

   ToddlerBot's 9-parameter fit reached 1.3° tracking error (R8). Feed the results into the MJCF (armature,
   damping, frictionloss) and into the randomisation ranges.
2. **Sim-to-sim:** run the trained policy in plain MuJoCo on the full S1 MJCF (§9.1) with the closed ankle
   linkage, at 250 Hz control and the measured latency. It must walk before hardware.
3. **Randomise what you measured:**
   - motor strength ±15 %, Kp/Kd ±20 %;
   - latency 5-25 ms;
   - payload −3…+6 kg;
   - friction 0.4-1.25;
   - pushes, as `env.py` already does.
4. **Measured masses:** weigh each assembled module. If anything deviates > 5 % from `variant_s1.py`
   (docs/11 rule), update the file, re-run `s1_select.py` (the X12 margin is 1.01) and retrain.
5. **Hardware ladder** (§10, stages 6-9): hanging joint tracking → standing in the gantry → stepping in place
   at 50 % torque → walking at 0.3 m/s with the harness slack. Compare measured joint torques with the
   inverse-dynamics model for the same motion: ±15 % is the docs/11 expectation.

---

## 10. First bring-up checklist

Do not skip stages. Two people from stage 6 on. One holds the wireless e-stop and nobody is within reach of
the robot while drives are enabled (docs/11).

| # | Stage | Done when |
|---|---|---|
| 0 | Electrical bench tests 1-8 in S1-electrical §13 passed (pack, BMS, e-stop loop, precharge, regen clamp, link loss) | signed |
| 1 | Jetson: JetPack flashed, RT kernel, `cyclictest` < 200 µs with cameras streaming; 5 CAN interfaces named by udev and up at 1 Mbps | logged |
| 2 | **Each actuator alone** on a current-limited bench supply (48 V, ≤ 2 A), clamped to the bench:<br>- read ID (type 0 / 0x140 series), set its S1 ID, write it on the housing;<br>- set canTimeout 50 ms / 0xB3 50 ms and verify the motor drops out when the host stops sending;<br>- set zero_sta, limit_torque = 20 %;<br>- MIT-mode test: small position step, damping-only mode, velocity feedback sign;<br>- measure the X12 motion-mode kp/kd scaling (§5.2) | every unit |
| 3 | Actuator system ID (chirp/step) for one unit of each model | parameters in the calc model |
| 4 | Each limb assembled on its stand, on its bus:<br>- CAN_H-CAN_L ≈ 60 Ω, no error frames over 10 min at 250 Hz;<br>- bus load measured (`canbusload`) ≤ 50 %;<br>- joint directions and limits checked by hand-guided motion in damping mode | per limb |
| 5 | Calibration in the jigs: zero, offsets for wrap-crossing joints, ankle linkage check with an inclinometer; calibration file committed | file in git |
| 6 | Whole robot **hanging** in the gantry, feet clear:<br>- e-stops tested (every device: bus drops, RESET needed);<br>- DAMP tested from the gamepad and by killing the policy process (layer 2), unplugging a USB-CAN (layer 3) and killing controller_manager (layer 4);<br>- joint tracking of slow sinusoids at 30 % torque;<br>- IMU check (gravity vector, gyro sign);<br>- thermal soak 20 min | all pass |
| 7 | **Standing**, harness slack-taut, policy with zero velocity command at 50 % torque: 10 min; sit/stand by lowering the hoist; push tests by hand | stable |
| 8 | **Stepping in place**, then 0.3 m/s forward, harness carrying ~10 % body weight; log joint torques vs the model | 100 steps without the harness catching |
| 9 | Free walking in a cage (harness slack), 0.3 → 0.8 m/s; only now raise torque limits towards 90 %; first stairs only after the docs/11 G6 criteria | per docs/11 gates |

Abort any stage on an unexpected noise or smell, a temperature warning, a CAN error rate above zero per minute,
or a bus voltage excursion above 54.5 V. Investigate before continuing.

---

## 11. Sources (accessed 2026-11-09)

Manufacturer documents [M]:

1. RobStride user manuals RS04 (260713), RS03 (261013), RS02 (260713), RS00 (260713): protocol §4, MIT
   protocol §6, parameter tables, CAN timeout §3.3.6, zero rules §4.2.6-4.2.7, anti-backdrive §4.2.5, sample
   code scaling: <https://github.com/RobStride/Product_Information> (`Product Literature/CAN2.0/`).
2. MyActuator CAN BUS Motor Motion Protocol V4.4 (260425); X Series-V4 product manual (261029); User Manual for
   X Series Products V1.1: <https://www.myactuator.com/_files/archives/cab28a_712afb681f434c1394145c69aae60b8e.zip>
3. NVIDIA Jetson Orin Nano Super: <https://developer.nvidia.com/blog/nvidia-jetson-orin-nano-developer-kit-gets-a-super-boost/>;
   carrier input range and module compatibility (NVIDIA forum, quoting the carrier specification):
   <https://forums.developer.nvidia.com/t/jetson-orin-nano-input-voltage/298625>,
   <https://forums.developer.nvidia.com/t/can-the-nano-super-developer-kit-be-used-to-upgrade-the-orin-nx/319628>

Software:

4. Seeed RobStride_Control: <https://github.com/Seeed-Projects/RobStride_Control>, <https://wiki.seeedstudio.com/robstride_control/>
5. robstride_ros2 / robstride_ros2_control: <https://index.ros.org/r/robstride_ros2/>, <https://index.ros.org/p/robstride_ros2_control/>
6. myactuator_rmd: <https://docs.ros.org/en/humble/p/myactuator_rmd/>; Seeed MyActuator guide: <https://wiki.seeedstudio.com/myactuator_series/>
7. K-Scale kos-kbot (RobStride humanoid stack): <https://github.com/kscalelabs/kos-kbot>
8. mjbots mjcanfd-usb-1x (gs_usb, termination): <https://mjbots.com/products/mjcanfd-usb-1x>
9. ros2_control: <https://control.ros.org/>

Repo: `train/README.md`, `train/env.py`, `train/model.py`, `calc/kestrel/variant_s1.py`, `calc/kestrel/linkages.py`,
`simple/calc/s1_select.py`, `docs/07-software-architecture.md`, `docs/11-testing-commissioning.md`,
`docs/research/R8`, `R9`.
