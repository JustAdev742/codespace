# P02 — Electronics bring-up: RT computer, EtherCAT, drive carrier, 150 A GaN drive, safety MCU

## A. Visual reference
* Comms: [`diagrams/comms_topology.svg`](../../diagrams/comms_topology.svg)
* Power: [`diagrams/power_architecture.svg`](../../diagrams/power_architecture.svg)
* Software layers: [`diagrams/software_stack.svg`](../../diagrams/software_stack.svg)

The two diagrams still show the K1 power path. Mk II (docs/05): two packs through the KES-PPM power path (P06.1), a
logic bus and an actuator bus, and **28 EtherCAT slaves** (22 Everest + 4 HC2 + 2 hand controllers; each hand
controller drives its wrist's KES-WRIST board, so the KW-L2 adds no slave).

## B. Parts list

| BOM | Item | Qty (now) |
|---|---|---|
| B041 | UP Squared Pro 7000 (i3-N305, 2× i226-IT) | 1 |
| B026 | Novanta Everest S NET drive (8–80 V, 45 A cont / 60 A 1 s) | 1 (first article) |
| B109 | EPC9186HC2 GaN motor-drive evaluation board (HC2 bring-up) | 1 |
| B025 | HC2: 150 A pk / 75 A cont, 100 V-class GaN EtherCAT drive (custom: F28P65x with on-chip EtherCAT, 2 × BiSS-C, 2-channel hardware STO, 12 V aux input) | 1 (first article) |
| B027 | Drive carrier PCB (Everest) | 3 (spin 1) |
| B042 | Safety MCU board (start on the TI LAUNCHXL2-570LC43) | 1 |
| B004 | CubeMars RI85-PH frameless motor (test motor in a printed fixture) | 1 |
| B017 | AksIM-2 encoder + ring | 1 |
| B078/B079 | EtherCAT cable (igus chainflex CF Robot), Harwin Gecko-MT 10-pin (J-LINK), XT30/XT60, JST GH | — |

## C. Tools
Oscilloscope (4-ch, with a 100 V differential probe and a current probe ≥ 150 A), bench supply ≥ 70 V
current-limited, DC load, ESD bench, hot-air station, microscope, Ethernet tap or spare NIC for Wireshark (EtherCAT
dissector), IR camera.

## D. Manufacturing: drive carrier PCB (custom)
Specification (docs/05 §6):
- 4-layer, 2 oz copper on power layers, ENIG finish;
- the drive module footprint per the Novanta integration manual;
- 2 × 100 µF 100 V polymer + 1 µF X7R at the bus input; SMCJ75A TVS;
- EtherCAT magnetics (per the drive's reference design) to two J-LINK connectors;
- 2 × RS-422 receivers (THVD1450 class) converting BiSS-C MA/SLO to the 3.3 V single-ended inputs on Everest [R2];
- 5 V / 300 mA LDO for the encoder;
- NTC dividers; STO input conditioning; an ADS1262 footprint (populated on KH-C25 and KH-C20 for the torque flexure).

**HC2 drive (150 A, B025).** No purchasable 100 V, 150 A pk EtherCAT drive of this size is identified (docs/09 §11 H8),
so the HC2 is custom (docs/05 §6.1, docs/13 §7): F28P65x with on-chip EtherCAT, three 100 V GaN half-bridges on an
EPC9186HC-class layout at 40 kHz, 2 × BiSS-C, 2-channel hardware STO (channel A cuts the high-side gate supply,
channel B disables the PWM buffers, both read back), 12 V aux input, ≥ 16 × 4.7 µF + 4 × 100 µF 100 V DC-link at the
bridge. Start on the EPC9186HC2 evaluation board (B109). Its stage is rated ≤ 76 V input: set the over-voltage trip at
74 V and keep the brake chopper at 70 V on / 68 V off. Firmware is the long pole; plan two board spins (B110).

Order 3 Everest carriers first, assembled by JLCPCB/PCBWay (BOM + centroid from your PCB tool).

## E. Assembly / setup steps
1. **RT computer OS:** Ubuntu 24.04 LTS with a PREEMPT_RT kernel (6.8+ RT). Boot parameters:
   `isolcpus=2,3 nohz_full=2,3 rcu_nocbs=2,3 irqaffinity=0,1`. Disable C-states deeper than C1 in the BIOS.
2. Build **IgH EtherLab 1.6** with the native `igc` driver for the i226 (`--enable-igc`). Bind port 1 (EtherCAT) to
   the igc driver; port 2 later closes the ring.
3. Run `cyclictest -m -p95 -t2 -a2,3 -i1000 -D 1h`. **Target: max latency < 50 µs.**
4. Drive configuration via the vendor tool (Novanta MotionLab for Everest; the HC2 drive's own tool or your firmware's
   CiA-402 object dictionary):
   - Set the motor parameters from the datasheet (RI85-PH: 14 pole pairs, Kt 0.13 N·m/A, R_LL 0.1385 Ω [ds R1]).
   - Encoder BiSS-C, 19 bit; current limit 5 A to start; I²t on; STO enabled.
   - **Store current limits in the drive's non-volatile parameters.** Mk II relies on drive-level limits on the
     cycloid and strain-wave joints (docs/09 §5.3), independent of the RT software.
5. Commutation: run auto-phasing with the rotor free. Check the electrical angle offset against a manual alignment.
6. Tune the current loop (vendor autotune), then verify with a step response.
7. **HC2 first light** on the RI85-PH test motor at 48 V and ≤ 10 A: EtherCAT OP, commutation, current loop, STO.
   The 150 A tests come later on the dyno with a KM-130 motor (P05 §G).
8. **Safety MCU:** flash the monitor firmware (heartbeat watchdog on CAN from the RT computer, e-stop input, two
   relay-driver outputs, IMU tilt; Mk II adds the HC2 leak inputs and the coolant > 75 °C trip, docs/05 §8). Unit-test
   each trip path.

## F. Electrical
* Bench bus 48 V from the supply (current limit 3 A) → disconnect (enable = safety relay) → Everest carrier XT30
  (16 AWG) or HC2 XT60H (12 AWG). HC2 12 V aux from a separate bench supply (Gecko-MT 2-pin, 20 AWG).
* **HC2 stop function is uncertified** (custom drive). From the first HC2 power-up until its STO is validated (docs/11
  §5) and through commissioning, the safety function for every HC2 is the external chain: safety relay → a DC contactor
  (Gigavac GX11 class, ≥ 100 A, ≥ 80 V DC break rating) in the HC2's DC feed, opened by the relay's instantaneous
  contacts, plus the HC2 STO inputs. On the bench the contactor sits in the bench-bus feed; on the robot, one per leg
  zone until gate G6.
* STO pair from the safety relay → J-LINK pins 5/6 (STO_A/STO_B), 7 (STO_COM). The signal level at the drive is
  **to be confirmed from the Everest S and HC2 datasheets** (docs/05 §9).
* Encoder: JST GH 6-pin (5 V, GND, MA+, MA−, SLO+, SLO−), shielded, shield to the carrier chassis pin.
* First power-up procedure for every new board:
  1. Inspect the board under a microscope.
  2. Check the bus for shorts (> 10 kΩ).
  3. Power at 12 V with a 0.2 A limit and check rails.
  4. Raise to 48 V with a 0.5 A limit.
  5. Only then raise the limit to 3 A.

## G. Testing (gate G0)
| Test | Pass |
|---|---|
| EtherCAT: master sees the drives, OP state, 1 kHz with distributed clocks for 1 h | 0 lost frames; DC sync error < 1 µs |
| Cyclic synchronous torque mode: ±0.5 N·m square wave on the free motor (Everest and HC2) | current tracks with < 1 ms rise; no faults |
| STO from each e-stop device while the motor runs | phase current → 0 in < 10 ms |
| HC2: e-stop with the external contactor in circuit | contactor opens and the HC2 DC bus collapses within the relay's time; HC2 STO read-back consistent; the motor coasts or brakes, never drives |
| Drive-level current limit: command 2 × the stored limit over EtherCAT | the drive clamps at the stored limit ±5 % (proves the limit does not depend on the RT software) |
| Heartbeat loss (kill the RT process) | safety MCU opens the relay within 5 ms of the 2 ms timeout |
| Over-voltage, one drive at a time: clamp disconnected, dummy load, raise the supply in 1 V steps to 1 V above the drive's configured trip (HC2 74 V, Everest 78 V) | each drive trips at its threshold ±1 V without damage; with the clamp connected the bus stays ≤ 72 V during a regen burst |
| Thermal: NTC reading matches a thermocouple | ±2 °C |
