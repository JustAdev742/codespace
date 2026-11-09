# P06 — Two hot-swap 16S4P battery packs with in-pack BMS and FET switch

**Hazard: each 1.15 kWh pack can deliver ≈ 1.2 kA into a short and can burn violently.** Build packs in the battery
area (P00), with insulated tools, never alone, and never leave charging unattended. Build **pack A completely and
pass its gate before you weld a single cell of pack B.**

Mk II values (`docs/generated/mass_budget.md`, `power_budget.md`; architecture in docs/05 §3–§4, bay in docs/03 §10):

| Item | Per pack | Robot (A + B) |
|---|---|---|
| Configuration | 16S4P, 64 × Molicel INR-21700-P50B | 2 packs; robot-side OR-ing and tie switch (KES-PPM, P06.1) |
| Voltage | 59.2 V nominal, 67.2 V full, 48 V cut-off (3.0 V/cell); minimum loaded bus 52 V | same |
| Capacity / energy | 19.4–20 Ah, **1.15 kWh** (≥ 1.12 kWh with minimum-capacity cells) | 2.24–2.30 kWh, 1,951 Wh usable |
| Mass / envelope | 5.9 kg budget; ≈ 150 × 98 × 185 mm in `params.py` (see §D note) | 11.8 kg |
| Runtime | — | **4.9 h normal mixed, 4.3 h continuous walking** (16S8P row of the power budget) |
| Current | 100 A Class T fuse inside; robot simultaneous peak 3.08 kW ≈ 59 A = **14.8 A/cell when one pack carries it** (P50B 60 A continuous) | 7.4 A/cell with both |
| Internal resistance | ≈ 51 mΩ (16 × 12.8 mΩ / 4); one-pack sag at 59 A ≈ 3 V | |

## A. Visual reference
* Layout and series path (K1 single-pack drawing; the Mk II arrangement is in §D): [`diagrams/battery_pack.svg`](../../diagrams/battery_pack.svg)
* Power architecture (K1 drawing; Mk II single-line diagram in docs/05 §4.1): [`diagrams/power_architecture.svg`](../../diagrams/power_architecture.svg)
* Torso placement (two packs side by side at y = ±52 mm, low in the torso): [`renders/17_torso_ghost.png`](../../renders/17_torso_ghost.png)

Pack block diagram (identical in A and B):

```
 cells 16S4P ─ B+ ─ 100 A Class T fuse ─ back-to-back 100 V FETs (driven by the BQ76952) ─ connector P+
            └ B− ─ 0.5 mΩ shunt ──────────────────────────────────────────────────────── connector P−
 KES-BMS16: BQ76952 (16S AFE) + BQ77216 (secondary OV, separate taps) + CAN-FD MCU ── connector CAN-FD + wake
 pilot loop through the connector (pilot pin ≥ 2 mm shorter) → FETs stay off unless seated AND the robot or charger
 has completed the CAN handshake  ⇒  a removed pack has dead terminals
```

## B. Parts list (per pack)

| BOM | Item | Qty | Spec |
|---|---|---|---|
| B028 | Molicel INR-21700-P50B | 64 (+ matching spares from the 200-cell buy) | 5.0 Ah (4.85 min), 60 A, ≤ 71 g [ds R3]; authorised distributor, lot-numbered invoices; one lot per pack |
| B029 | **KES-BMS16** per-pack BMS: TI **BQ76952** 16S AFE, TI **BQ77216** secondary OV on separate taps, CAN-FD MCU, in-pack back-to-back 100 V N-FET switch, 0.5 mΩ shunt, 8 cell NTC + 1 FET NTC, pilot/wake | 1 | custom, TI TIDA-010208 pattern (docs/05 §3.2) |
| B031 | Pack fuse **100 A UL Class T** + holder (Littelfuse JLLN-100 / Eaton Bussmann JJN-100 class) | 1 + 1 spare | **verify ≥ 125 V DC rating and ≥ 20 kA DC interrupting on the datasheet**; prospective fault ≈ 1.2 kA |
| B032 | Enclosure: 6061 machined shell (≤ 1.3 kg), 1 mm mica liners, two-piece PC or PC/ABS cell holders (never PLA), Ni-plated Cu busbars, carry handle, IP54/IP67 face gasket, vent path | 1 | clear anodise |
| B032 | Parallel collectors 0.15 mm Ni-plated Cu + 0.15 mm pure Ni sandwich; series links ≥ 4 mm² Ni-plated Cu (e.g. 0.3 × 15 mm); per-cell fuse link (0.3 mm Al bond wire or 22 AWG fuse link) | 1 set | |
| B113 | In-pack thermal-event sensor (vent gas / pressure rise) | 1 | docs/06 §1 |
| B111 | Pack half of the hot-swap connector: blind-mate, keyed, ≥ 80 A per power contact, ≥ 100 V DC, power make-first / break-last, pilot make-last / break-first (≥ 2 mm stagger), CAN-FD + wake, IP2X unmated | 1 | part not yet chosen (Anderson SBS with auxiliary contacts or Stäubli CombiTac class): confirm stagger and ratings on its drawing |
| — | 10 kΩ NTCs, 22 AWG silicone tap wires (fused 1 A at the BMS), 8 AWG silicone main leads, Kapton tape, fish paper, foam-free compression pads, 15 W silicone heater film (docs/03 §10.2) | 1 set | |
| — | Insulating cover for the pack connector, fitted whenever the pack is out of the robot | 1 | |

## C. Tools
Battery spot welder (kWeld kit with a ≥ 1500 A source, or a laser-weld service), insulated hand tools (P00), 4-wire
IR meter (1 kHz) or battery tester, precision scale (0.01 g), DC electronic load ≥ 100 A, the dock charger (B037) or a
programmable 16S charger, thermal camera, insulation tester (500 V), oscilloscope with a current probe, a pack test
harness that closes the pilot loop and talks CAN to the BMS.

## D. Manufacturing
* **Cell arrangement (docs/03 §10.1):** cells lie fore-aft, in two layers of 4 × 8. Each 4-cell column is one parallel
  group: 8 groups per layer, 16 in series. Series path: S1 at the front layer top, down the front layer to S8, doubled
  link to the rear layer, up to S16. Cell polarity alternates group by group; series links alternate between the outer
  face and the mid-plane. BMS, fuse and handle in the rear end cap.
* **Envelope note:** 2 × 4 × 8 cells fill the 150 × 98 × 185 mm box of `params.py` with ≈ 2 mm to spare; the end cap
  needs ≈ 25 mm more length. Confirm the pack CAD with the CAD owner before machining (docs/09 §11 H12).
* **Enclosure:** 6061 CNC, ≤ 1.3 kg including the end cap; keyed T-rail shoe on the floor, PTFE/POM wear strips on the
  sides, over-centre cam-lever boss on the end cap (P06.1), vent path to the rear grille. Mica on every inner face.
* **Cell holders:** two-piece 4 × 8, bore = measured cell OD + 0.2 mm.
* **Busbars:** cut collectors and series links; pre-bend series links into a U across each junction.

## E. Assembly (per pack)
1. **Incoming inspection, 100 % of cells:** mass (reject > 71.0 g or < 68.5 g), OCV (all within ±20 mV), 1 kHz IR
   (reject > 10 % above the median), wrap and top insulator undamaged. Log by serial.
2. **Matching:** sort 64 cells into 16 groups of 4 with equal summed capacity (IR and OCV as proxies, or a 1C capacity
   test on a sample).
3. **Front layer (S1–S8):** cells into the holder with alternating group polarity per §D. Check polarity twice with a
   meter before any welding.
4. **Weld:**
   - parallel collectors first (pure nickel on the cell, copper over it), then series links;
   - 3–4 welds per cell contact; test-weld a sacrificial cell and peel-test it (the nugget should tear the nickel);
   - per-cell fuse link between each cell and its collector.
5. **Rear layer (S9–S16):** same. 1 mm mica sheet between the layers. Join S8 → S9 with a doubled series link.
6. **Cell taps:** solder each group's 22 AWG tap (fused 1 A at the BMS end) to its collector, in order B0…B16.
   **Verify the tap voltages ascend in ≈ 3.6 V steps before plugging into the BMS.** Separate taps for the BQ77216.
7. **Thermistors:** 8 on cells (centre, corners, near the series links) and the FET NTC, Kapton and thermal paste;
   heater film on the outer face of the cell block; thermal-event sensor in the end cap.
8. **Main path:** B+ → fuse → in-pack FETs → connector P+; B− → shunt → connector P−. 8 AWG, ≤ 150 mm, twisted.
9. **End cap:** BMS board, FET bank bolted to the aluminium (thermal pad), connector half with its gasket, pilot and
   CAN-FD to the connector signal pins. Close with foam-free compression pads holding the cell stack.
10. Fit the insulating connector cover. Label: pack serial, cell lot, build date, capacity (after §G).

## F. Electrical
* **BMS settings (per pack):**
  - cell OV 4.20 V, UV 3.00 V, balance from 4.05 V at 10 mV delta;
  - charge 0–45 °C, discharge −10–60 °C; below 0 °C no discharge above C/5 until the heater has warmed the pack;
  - DCL 80 A continuous (the robot-side LM5069 limit, docs/05 §4.6), derated below 3.3 V/cell and above 50 °C; CCL
    20 A (5 A/cell standard charge), ramping to 0 at 4.15 V; short-circuit detection set above the robot-side limits
    so the robot side clears first;
  - CAN-FD to the KES-PPM and the safety MCU bus; reports V, I, T, SoC, SoH, CCL/DCL, fault flags; keeps its own serial
    and cycle log.
* **Pack switch enable = AND** (pilot loop closed, CAN handshake with the robot or charger complete, BQ76952
  protections OK, BQ77216 OK). Pulling the pack breaks the pilot first, so a removed pack always has dead terminals.
* OR-ing, hand-off, tie and inrush control are on the robot side (KES-PPM, P06.1, docs/05 §4.2–§4.4). The pack does not
  need its own precharge.

## G. Testing (pack gate, every pack)
| Test | Pass |
|---|---|
| Insulation, pack terminals → enclosure, 500 V DC (pack switch closed on the test harness) | > 100 MΩ |
| **Dead terminals:** pack unseated (no pilot, no CAN), 10 kΩ load across P+/P− | < 1 V |
| Pilot without handshake: pilot closed, CAN silent | switch stays open |
| Tap voltages / BMS readings | all 16 groups within 10 mV of a reference meter |
| Short-circuit on the pack switch into a 10 mΩ shunt (12 V supply first, then the pack) | BQ76952 SCD opens the FETs; FETs undamaged; fuse intact |
| Discharge 1C (20 A) to 3.2 V/cell | max cell < 45 °C on the thermal camera; groups within 30 mV |
| Peak discharge 80 A for 10 s, then 59 A for 2 min | FET temperature rise < 40 K; fuse and connector < 70 °C |
| Charge CC/CV to 4.20 V/cell under BMS control (dock charger at 10 A per pack, then the 20 A CCL) | balancing works; no cell > 4.21 V |
| Capacity to 3.0 V/cell | ≥ 1.10 kWh |
| BMS trips (OV/UV by tap override, OT with a thermistor in hot water, OC on the load) | FETs open; CAN reports the fault |
| Handle pull test, 4 × pack weight (24 kg) for 1 min | no deformation |

---

# P06.1 — Hot-swap battery bay and pack power path

The bay holds packs A and B side by side in the lower torso (pack centres x = −30, y = ±52, z = +130 mm). Packs slide in
fore-aft from the back through gasketed hatches, on a keyed T-rail, and dock on a floating connector at the front
bulkhead (docs/03 §10). The robot-side power path (KES-PPM, B030) is built and bench-tested here with a DC load and
installed in the torso in P08.

**Programme rule:** until gate G6, a hot swap is done **only with the robot supported in the gantry harness (or on the
leg stand) and every drive in STO**; logic bus, computers and coolant pumps stay powered. The standing swap of docs/03
§10.3 / docs/05 §4.5 is a G7-onward capability. Two people for every swap.

## A. Visual reference
* Torso placement: [`renders/17_torso_ghost.png`](../../renders/17_torso_ghost.png)
* Bay and power path (top view):

```
   rear (hatch)                                                         front bulkhead
   ┌──────── pack A ────────┐ cam lever + secondary catch    floating connector A ─ 8 AWG ─► KES-PPM channel A ─┐
   ├── keyed T-rail, 2 mm Al + mica fire wall between bays ──┤                                                   ├─► main bus
   └──────── pack B ────────┘ cam lever + secondary catch    floating connector B ─ 8 AWG ─► KES-PPM channel B ─┘
   each bay: fail-locked solenoid pin on the lever · lever micro-switch (opens in the first 10° of travel)
             lock-position switch · release button · 3-colour LED      KES-PPM per channel: LM5069 + LM5050-1 (OR path),
                                                                       TPS48111-Q1 back-to-back (tie path), INA228
```

## B. Parts list

| BOM | Item | Qty |
|---|---|---|
| B112 | Bay mechanics per bay: 7075 channel pair tied into the spine and lower rib (B064), PTFE/POM guide strips, keyed T-rail; over-centre cam lever with hardened keeper pin (Southco draw-latch class) and a separate secondary catch; fail-locked solenoid lock pin; lever micro-switch (Omron D2SW sealed class) and lock-position switch; release button and 3-colour LED; keyed manual override behind the back cover | 2 |
| B111 | Robot half of the hot-swap connector on a ± 1 mm / ± 1° floating mount with 2 guide pins that engage before the contacts | 2 |
| B030 | **KES-PPM** pack power-path board: per channel TI **LM5069** hot-swap controller + TI **LM5050-1** ideal-diode controller (OR path), TI **TPS48111-Q1** back-to-back tie switch, TI **INA228** monitor, 100 V ≈ 2 mΩ FET banks (Nexperia PSMN2R0-100SSF class), local CAN-FD MCU, solenoid drivers, hardware unlock AND; plus the dock charge-inlet channel | 1 |
| B079 | Amphenol SurLok Plus 5.7 mm pair per channel (PPM side), 8 AWG tinned silicone ≤ 0.4 m per pack, twisted | 2 sets |
| — | Back-cover switch (NC) wired into the e-stop chain (docs/05 §8) | 1 |

## C. Tools
As P06, plus a DC electronic load ≥ 60 A, an oscilloscope with two current probes, a regenerative DC source or a second
supply with a series diode for the back-feed test, a stopwatch.

## D. Manufacturing
* Bay channels: pack-to-guide clearance 0.3–0.5 mm, 3 mm lead-in chamfers, the T-rail keyed so a pack enters one way
  only; either pack fits either bay. 2 mm aluminium + mica fire wall between the bays.
* Connector carrier: ± 1 mm radial / ± 1° float on rubber-bushed shoulder screws; guide pins longer than any contact.
* Cam-lever keeper positioned so the last 8 mm of lever travel draws the pack home onto the connector with ≈ 300 N
  preload; the lever micro-switch opens in the first 10° of opening travel.

## E. Assembly
1. Mount guides, T-rails, levers, keepers, solenoid locks and switches on the bay frame (in the torso during P08; on a
   bench frame for this test).
2. Mount the floating connector carriers; set the float with feeler gauges.
3. Wire each pilot loop: lever micro-switch (closed only when the lever is home) in series with the connector pilot
   pins.
4. 8 AWG pairs from each connector to its KES-PPM channel (SurLok Plus 5.7 mm), P-clipped every 80 mm.
5. CAN-FD from both connectors to the PPM MCU and the robot CAN-FD bus; 120 Ω terminations only at the bus ends.

## F. Electrical (docs/05 §4)
* **Modes:** *Diode* (default): both OR paths on, tie paths open; the higher pack carries the load; no regeneration into
  the packs (the chopper takes it). *Tied*: both tie switches closed only when both packs are healthy, |V_A − V_B| < 0.5 V
  at rest and SoC < 98 %; equalisation current ≤ 4.4 A. *Single pack*: the RT controller caps actuator power at
  1.8 kW. *Swap*: actuator power capped at 1.5 kW (in this programme: drives in STO).
* **Insertion:** power pins mate (pack switch still open) → pilot closes, BMS wakes, CAN handshake → BMS closes its
  switch → PPM enables the LM5069 with its power limit; a higher pack takes over gradually, a lower pack waits
  reverse-biased → tie only later, if the tie conditions hold.
* **Removal interlock (hardware AND; firmware cannot override):** the solenoid of pack X retracts only if pack Y is
  present, V_Y ≥ 54 V, Y's LM5069 PGOOD is high, X's path current < 1 A with its tie open, and firmware says "swap
  permitted". If the lever is forced, the pilot breaks ≥ 2 mm (≥ 6 ms at 0.3 m/s) before the power pins, against
  < 0.1 ms to shed the channel: the power contacts always break at zero current.
* **Fusing coordination:** TPS48111 tie short-circuit 150 A (1.2 µs) / overcurrent 80 A 10 ms; LM5069 breaker
  ≈ 120 A, current limit 80 A with a fault timer for 2 s peaks; in-pack 100 A Class T fuse as backup.
* **Regeneration:** into tied packs (limited by the BMS CCL over CAN); otherwise the brake chopper (2 × 5 Ω 100 W in
  parallel, B036) clamps at 70 V on / 68 V off.
* **Power-off for service:** keyed main switch (PPM sheds every path) **and** pull both packs. There is no mechanical
  service disconnect in Mk II.

## G. Testing (bay gate, part of G0)
| Test | Pass |
|---|---|
| Interlock refuses: request a release of A with B absent, B below 54 V, or A carrying > 1 A | solenoid stays locked in every case |
| Forced lever: open A's lever with the solenoid overridden while A carries 20 A (bench load) | A's path current < 1 A before the connector moves; no arc marks on the contacts |
| Pilot stagger: slow withdrawal, continuity tester on pilot and power pins | pilot breaks ≥ 2 mm before the power pins |
| Hot swap on a 15 A load (idle power), both packs tied: release A, pull, insert a fresh A 5 V above B | load uninterrupted; bus dip < 2 V; logic bus (24 V / 12 V) does not reset; A takes over through the LM5069 ramp; tie closes only after convergence |
| Insert a pack 5 V **below** the bus | its OR path stays reverse-biased; < 0.5 A until the bus falls to it |
| Equalisation: tie at 0.5 V and 1.0 V difference | ≈ 4.4 A and ≈ 8.9 A (docs/05 §4.3 table) within ±20 % |
| One pack alone at 59 A for 2 s (at 20 % SoC) | sag ≈ 3 V; bus stays ≥ 52 V; no trip |
| Back-feed 10 A with both packs in diode mode | no current into the packs; chopper clamps the bus ≤ 72 V |
| Swap time, robot in the gantry with drives in STO, two people | ≤ 3 min from request to both packs online |
| Repeat the hot swap 50 × (docs/05 §14) | no arc marks, no under-voltage events, connector resistance change < 10 % |
