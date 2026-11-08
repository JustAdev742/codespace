# P02 — Electronics bring-up: RT computer, EtherCAT, drive carrier, safety MCU

## A. Visual reference
* Comms: [`diagrams/comms_topology.svg`](../../diagrams/comms_topology.svg)
* Power: [`diagrams/power_architecture.svg`](../../diagrams/power_architecture.svg)
* Software layers: [`diagrams/software_stack.svg`](../../diagrams/software_stack.svg)

## B. Parts list

| BOM | Item | Qty (now) |
|---|---|---|
| B041 | UP Squared Pro 7000 (i3-N305, 2× i226-IT) | 1 |
| B026 | Novanta Everest S NET drive | 1 (first article) |
| B025 | Elmo Platinum Twitter R70/100 class drive | 1 |
| B027 | Drive carrier PCB | 3 (spin 1) |
| B042 | Safety MCU board (start on the TI LAUNCHXL2-570LC43) | 1 |
| B004 | CubeMars RI85-PH frameless motor (test motor in a printed fixture) | 1 |
| B017 | AksIM-2 encoder + ring | 1 |
| B078/B079 | EtherCAT cable, J-LINK connectors, XT60, JST GH | — |

## C. Tools
Oscilloscope (4-ch), bench supply ≥ 70 V current-limited, DC load, ESD bench, hot-air station, microscope, Ethernet tap or spare NIC for Wireshark (EtherCAT dissector).

## D. Manufacturing: drive carrier PCB (custom)
Specification (docs/05 §6):
- 4-layer, 2 oz copper on power layers, ENIG finish;
- the drive module footprint per the Novanta/Elmo integration manual;
- 2 × 100 µF 100 V polymer + 1 µF X7R at the bus input; SMCJ75A TVS;
- EtherCAT magnetics (integrated per the drive's reference design) to two J-LINK connectors;
- 2 × RS-422 receivers (e.g. THVD1450-class) converting BiSS-C MA/SLO to the 3.3 V single-ended inputs on Everest [R2];
- 5 V / 300 mA LDO for the encoder;
- NTC dividers; STO input conditioning; an ADS1262 footprint (populated for KH-25/20 only).

Order 3 boards first, assembled by JLCPCB/PCBWay (BOM + centroid from your PCB tool).

## E. Assembly / setup steps
1. **RT computer OS:** Ubuntu 24.04 LTS, install a PREEMPT_RT kernel (6.8+ RT). Boot parameters:
   `isolcpus=2,3 nohz_full=2,3 rcu_nocbs=2,3 irqaffinity=0,1`. Disable C-states deeper than C1 in the BIOS.
2. Build **IgH EtherLab 1.6** with the native `igc` driver for the i226 (`--enable-igc`). Bind
   port 1 (EtherCAT) to the igc driver; leave port 2 on the normal stack for now (later it closes the ring).
3. Run `cyclictest -m -p95 -t2 -a2,3 -i1000 -D 1h`. **Target: max latency < 50 µs.**
4. Drive configuration: connect via the vendor tool (Novanta MotionLab / Elmo EASII).
   - Set the motor parameters from the datasheet (RI85-PH: 14 pole pairs, Kt 0.13 N·m/A, R_LL 0.1385 Ω [ds R1]).
   - Set the encoder to BiSS-C, 19 bit; current limit 5 A to start; I²t on; STO enabled.
5. Commutation: run auto-phasing with the rotor free. Check the electrical angle offset against a manual alignment.
6. Tune the current loop (vendor autotune), then verify with a step response.
7. **Safety MCU:** flash the monitor firmware (heartbeat watchdog on CAN from the RT computer, e-stop input reading, two relay-driver outputs, IMU tilt). Unit-test each trip path.

## F. Electrical
* Bench bus 48 V from the supply (current limit 3 A) → disconnect (enable = safety relay) → carrier XT60.
* STO pair from the safety relay → J-LINK pins 5/6/7 (signal level per the drive datasheet, **verify**).
* Encoder: JST GH 6-pin (5 V, GND, MA+, MA−, SLO+, SLO−), shielded, shield to the carrier chassis pin.
* First power-up procedure:
  1. Inspect the board under a microscope.
  2. Check the bus for shorts (> 10 kΩ).
  3. Power at 12 V with a 0.2 A limit and check rails.
  4. Raise to 48 V with a 0.5 A limit.
  5. Only then raise the limit to 3 A.

## G. Testing (gate G0)
| Test | Pass |
|---|---|
| EtherCAT: master sees the drive, OP state, 1 kHz with distributed clocks for 1 h | 0 lost frames; DC sync error < 1 µs |
| Cyclic synchronous torque mode: ±0.5 N·m square wave on the free motor | current tracks with < 1 ms rise; no faults |
| STO from each e-stop device while the motor runs | phase current → 0 in < 10 ms |
| Heartbeat loss (kill the RT process) | safety MCU opens the relay within 5 ms of the 2 ms timeout |
| Over-voltage: raise the supply to 72 V with the clamp disconnected (dummy load) | drive faults safely; clamp test: with the clamp connected the bus stays ≤ 72 V during a regen burst |
| Thermal: NTC reading matches a thermocouple | ±2 °C |
