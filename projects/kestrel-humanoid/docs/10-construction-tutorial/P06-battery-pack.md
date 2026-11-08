# P06 — Battery pack 16S6P with BMS and solid-state disconnect

**Hazard: a 1.68 kWh lithium-ion pack can deliver ~2 kA into a short and can burn violently.** Build
it in the battery area (P00), with insulated tools, never alone, and never leave charging unattended.

## A. Visual reference
* Layout and series path: [`diagrams/battery_pack.svg`](../../diagrams/battery_pack.svg)
* Power architecture: [`diagrams/power_architecture.svg`](../../diagrams/power_architecture.svg)
* Torso placement: [`renders/17_torso_ghost.png`](../../renders/17_torso_ghost.png)

## B. Parts list

| BOM | Item | Qty | Spec |
|---|---|---|---|
| B028 | Molicel INR-21700-P50B | 96 + 10 spare | 5.0 Ah, 60 A, ≤ 71 g [ds R3]; buy from an authorised distributor with lot-numbered invoices |
| B029 | Orion BMS 2 (24-cell) + 500 A Hall sensor + cell-tap harness | 1 | 16 taps + 8 thermistor inputs used |
| — | TI BQ77216 secondary over-voltage protector board | 1 | on separate taps |
| B030 | Solid-state disconnect + precharge board (TPS48111, 2 × 8 × 100 V MOSFET, 20 Ω/10 W precharge) | 1 | 150 A continuous |
| B031 | Pack fuse 125 A, ≥ 80 V DC, ≥ 3 kA breaking | 1 (+1 spare) | verify the DC rating on the datasheet before purchase |
| B032 | Enclosure (6061, machined), mica sheets 1 mm, PC/ABS cell holders (21.3 mm, 2-piece, 6 × 8), nickel-plated copper strip 0.15 × 8 mm + pure nickel 0.15 mm, 0.3 mm Al bond wire, 10 kΩ NTC ×10, 8 AWG silicone, SurLok Plus 5.7 mm pair, M5 busbar studs, Kapton tape, fish paper, foam-free compression pads | 1 set | |
| — | Manual service disconnect (keyed plug, pilot contact) | 1 | |

## C. Tools
Battery spot welder (kWeld kit with a ≥ 1500 A source, or a laser-weld service), insulated hand tools, 4-wire IR meter (1 kHz) or a battery tester, precision scale (0.01 g), DC load + programmable charger (or the robot charger), thermal camera, hi-pot / insulation tester, fire-safe workspace.

## D. Manufacturing
* **Enclosure:** 6061-T6 CNC, 2.5 mm walls, rear rails, vent path to the rear grille. M5 internal standoffs. Clear anodise. Line every inner face with 1 mm mica.
* **Cell holders:** two-layer 6 × 8 printed or moulded PC/ABS (do not use PLA, it softens at 55 °C).
* **Busbars:** cut nickel-plated copper strips into series links, pre-bend into a U across each series junction.

## E. Assembly
1. **Incoming inspection, 100 % of cells:** mass (reject > 71.0 g or < 68.5 g), OCV (all within ±20 mV), 1 kHz IR (reject outliers > 10 % above the median). Log by serial. Reject any wrap damage.
2. **Matching:** sort the 96 cells into 16 groups of 6 with equal summed capacity. Use IR and OCV as proxies, or a capacity test at 1C on a sample.
3. **Layer 1 (S1–S8):** insert cells into the holder, polarity alternating per series group per the diagram. Check polarity twice with a meter before any welding.
4. **Weld:**
   - Parallel collectors first (pure nickel on the cell, copper strip over it), then series links.
   - 3–4 welds per cell contact. Test-weld on a sacrificial cell and peel-test it (the weld nugget should tear the nickel).
   - Fit the **per-cell fuse link** (Al bond wire or a 22 AWG fuse link) between each cell and the collector.
5. **Layer 2 (S9–S16):** same. Fit the mica sheet between layers. Join layer 1 to layer 2 at S8→S9 with a doubled copper link.
6. **Cell taps:** solder each group's tap wire (22 AWG silicone, fused 1 A at the BMS end) to the group collector, in order B0…B16. **Verify the tap voltages ascend in 3.6 V steps before plugging into the BMS.**
7. **Thermistors:** 8 on cells (centre, corners, near the busbars) + 2 on the main busbars, held with Kapton and thermal paste.
8. **Main path:** B16+ → fuse → disconnect board → SurLok (+); B0− → Hall sensor → service disconnect → SurLok (−).
9. Fit the BMS and the disconnect board on the enclosure lid (the MOSFET array bolted to the aluminium for heat sinking). Close with foam-free compression pads holding the stack.

## F. Electrical
* BMS settings (Orion utility):
  - cell OV 4.20 V, UV 3.00 V, balance from 4.05 V at 10 mV delta;
  - charge 0–45 °C, discharge −10–60 °C;
  - DCL 150 A (derate below 3.3 V/cell and above 50 °C); CCL 30 A (ramps to 0 at 4.15 V);
  - CAN 500 kbit/s to the RT computer.
* Disconnect enable = AND(safety relay channel, BMS discharge-enable, BQ77216 OK, service-disconnect pilot).
* Precharge: the TPS48111 precharge path must complete (bus within 95 % of pack) before the main FETs close. Timeout 1 s → fault.

## G. Testing (pack gate)
| Test | Pass |
|---|---|
| Insulation, pack terminals → enclosure, 500 V DC | > 100 MΩ |
| Tap voltages / BMS readings | all 16 cells within 10 mV of a reference meter |
| Precharge into a 5 mF dummy bus | completes < 0.5 s, resistor < 60 °C |
| Disconnect short-circuit test into a 10 mΩ shunt (at reduced voltage first: 12 V supply, then pack) | trips < 5 µs (TPS48111 1.2 µs class); FETs undamaged |
| Discharge 1C (30 A) to 3.2 V/cell into the DC load | thermal camera max cell < 45 °C; group voltages within 30 mV |
| Charge CC/CV 10 A to 4.20 V/cell with BMS supervision | balancing works; no cell > 4.21 V |
| Capacity | ≥ 1.60 kWh to 3.0 V/cell |
| BMS trips (simulate OV/UV/OT by tap override, a thermistor in hot water) | the disconnect opens, CAN reports the fault |
