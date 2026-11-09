"""Bill of materials for the scrap builds, priced two ways.

    cd projects/kestrel-humanoid
    python scrap/calc/scrap_bom.py            # both variants -> scrap/<s1|k1>/generated/bom.md and data/bom.csv

Quantities follow the selected actuators (scrap/<sub>/data/actuator_family.json from scrap_select.py). Each line has
two unit prices (AUD, inc GST):
  buy      - the cheapest way to get it with money: AliExpress (AU delivery), Bunnings / Kmart, or second-hand
  scrounge - what it costs if you salvage it: kerbside collection, tip shops, e-waste days, friends' dead drills,
             old laptops, metal recyclers. Electronics you must buy new are the same in both columns.
Prices and confidence come from docs/research/R11-scrap-build-parts.md: V = seen on the page, Vs = seen in a
search summary, E = estimate (say why in the note). Tools are not included (you own them, scrap guide step 0).
"""
from __future__ import annotations

import csv
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJ = HERE.parents[1]
R11 = "docs/research/R11-scrap-build-parts.md"
VARIANT = {"s1": "s1scrap", "k1": "k1scrap", "s1fast": "s1fast", "k1fast": "k1fast"}


def counts(sub):
    fam = json.loads((PROJ / "scrap" / sub / "data" / "actuator_family.json").read_text())
    import importlib
    import sys
    sys.path.insert(0, str(PROJ / "calc"))
    mod = importlib.import_module(f"kestrel.variant_{VARIANT[sub]}")
    qty = {}
    for j, (c, _, _) in list(mod.JOINTS_LEFT.items()) + list(getattr(mod, "JOINTS_CENTRE", {}).items()):
        if j == "ankle_roll":
            continue
        mult = 2 if j in mod.JOINTS_LEFT else 1
        qty[c] = qty.get(c, 0) + (2 * mult if j == "ankle_pitch" else mult)
    drills = sum(qty[c] * f["n_motors"] for c, f in fam.items() if f["type"] == "drill18")
    servos = sum(qty[c] * f["n_motors"] for c, f in fam.items() if f["type"] == "servo20")
    hubs = sum(qty[c] * f["n_motors"] for c, f in fam.items() if f["type"] in ("hub36", "hubfoc"))
    odesc = sum(qty[c] * f["n_motors"] for c, f in fam.items() if f["type"] == "hubfoc")
    chain_stages = sum(qty[c] * f["chain_stages"] for c, f in fam.items() if f.get("reduction") == "chain")
    chain_par = sum(qty[c] for c, f in fam.items() if f.get("reduction") == "chain" and "2 chains" in f["sprockets"])
    capstans = sum(qty[c] for c, f in fam.items() if f.get("reduction") == "capstan" and f["chain_stages"])
    cords = sum(qty[c] * (2 if "2 cords" in f["sprockets"] else 1) for c, f in fam.items()
                if f.get("reduction") == "capstan" and f["chain_stages"])
    joints = sum(qty.values())
    return dict(drills=drills, servos=servos, hubs=hubs, odesc=odesc, chain_stages=chain_stages, chain_par=chain_par,
                capstans=capstans, cords=cords, joints=joints, fam=fam, qty=qty)


def lines(sub, c):
    k1 = sub.startswith("k1")
    sensors = c["drills"] + c["hubs"]
    L = []

    def add(group, item, qty, buy, scrounge, conf, note):
        L.append(dict(group=group, item=item, qty=qty, buy=buy, scrounge=scrounge, conf=conf, note=note))

    add("Actuators", "Used 18 V cordless drill with a dead or missing battery (motor + 2-speed planetary + clutch)", c["drills"], 10.0, 3.0, "E",
        "R11 §2.1: used A$5-25 (Marketplace / tip shop); new Ozito PXDDS-180 skin A$49.98 (Vs). Scrounge: kerbside, tip shops, friends; the battery is not needed")
    add("Actuators", "BTS7960 43 A H-bridge module (one per drill)", c["drills"], 7.9, 7.9, "V", "R11 §3: AliExpress A$7.6-8.1")
    add("Actuators", "MT6701 14-bit magnetic angle sensor board + diametric magnet (one per actuator output)", sensors, 2.5, 2.5, "V", "R11 §3: A$2.2-3.8")
    add("Actuators", "TCA9548A I2C multiplexer (MT6701 has one fixed I2C address)", math.ceil(sensors / 8), 2.5, 2.5, "E", "AliExpress, not in R11")
    add("Actuators", "UHMWPE (Dyneema) 3 mm 12-strand cord, 50 m (capstans)", 2 if k1 else 1, 25.0, 25.0, "E",
        f"not in R11; {c['cords']} cord loops of about 1.5 m. Check the rated break is >= 800 kg")
    add("Actuators", "10 mm bright steel rod, 1 m (capstan input drums, held in the drill chucks)", 2 if k1 else 1, 12.0, 5.0, "E", "hardware store; scrounge: old printer/shelving rod")
    add("Actuators", "608 bearings, 100-pack (every pivot, capstan sectors, idlers)", 1, 35.0, 35.0, "V", "R11 §4.2: US$24 per 100")
    if c["servos"]:
        add("Actuators", "20 kg·cm metal-gear hobby servo (DS3218 class): neck x2, grippers x2", c["servos"] + 2, 12.0, 12.0, "E", "AliExpress, not in R11")
        add("Actuators", "PCA9685 16-channel PWM board + 6 V 5 A buck for the servos", 1, 9.0, 9.0, "E", "AliExpress, not in R11")
    if c["hubs"]:
        add("Actuators", "Used hoverboard for its 2 hub motors (the pack and charger are spares)", math.ceil(c["hubs"] / 2), 60.0, 35.0, "Vs", "R11 §1.3: A$50-75 working; broken A$20-50 (E); only the motors are needed")
    if c["odesc"]:
        add("Actuators", "ODESC V4.2 FOC drive (8-56 V, 70 A cont. claimed, ODrive firmware), one per hub motor", c["odesc"], 60.0, 60.0, "Vs",
            "US$27-39 (reach.dog, sequremall) to US$74 (Fruugo); budget A$60 with shipping")
        add("Actuators", "Brake resistor 2 ohm 50 W per pair of drives (regeneration)", math.ceil(c["odesc"] / 2), 4.0, 4.0, "E", "")
    if c["chain_stages"]:
        add("Actuators", "Bike chain and sprockets per stage (11-16T and 26-42T, chain, jackshaft, 2 x 608), plus hub sprocket adapter",
            c["chain_stages"] + c["chain_par"], 12.0, 4.0, "E", "R11 §4.1: donor bikes A$0-40 (E); new single-speed sprockets A$8-15 (E)")

    add("Structure", "Aluminium equal angle 25 x 25 x 3 mm, 1 m", 10 if k1 else 8, 13.96, 2.0, "Vs",
        "R11 §4.3 Bunnings A$13.96/m; scrounge: metal recycler by weight (about 0.4 kg/m, E A$4-6/kg)")
    add("Structure", "Aluminium square tube 40 x 40 x 1.9 mm, 1 m (thighs, shanks)", 2, 30.0, 4.0, "E",
        "R11 §4.3: Bunnings stocks it, price not seen; scrounge: recycler offcuts")
    add("Structure", "12 mm plywood sheet (capstan sectors, plates, feet, gripper fingers)", 1, 45.5, 5.0, "Vs", "R11 §4.3 Ecoply A$45.50; scrounge: offcuts")
    add("Structure", "Fasteners: M3 / M5 / M6 / M8 bolts, nyloc nuts, washers, 1 m M8 threaded rod", 1, 55.0 if k1 else 45.0, 35.0 if k1 else 30.0, "E", "hardware store assortment")
    add("Structure", "M8 rod ends (ankle push-rods)", 4, 4.0, 4.0, "E", "AliExpress")
    add("Structure", "Rubber soles (old tyre tube / door mat)", 2, 2.0, 0.0, "E", "")
    if k1:
        add("Structure", "Lazy-Susan turntable bearing 150 mm (waist)", 1, 8.0, 8.0, "E", "hardware store")
        add("Structure", "Gripper parts: fishing-line tendons, springs, rubber finger pads", 2, 3.0, 2.0, "E", "")

    add("Electronics", "ESP32-S3 DevKitC N16R8 (leg, arm and body controllers)", 3 if k1 else 2, 9.9, 9.9, "V", "R11 §3: A$8.7-11")
    add("Electronics", "BNO085 IMU (pelvis)", 1, 9.4, 9.4, "V", "R11 §3: A$9.4-35; MPU6050 E A$2-4 works too")
    if c["odesc"]:
        add("Electronics", "SN65HVD230 CAN transceiver (ESP32 to the ODESC drives on CAN)", 3, 2.0, 2.0, "E", "AliExpress")
    add("Electronics", "Foot contact microswitches", 8, 0.4, 0.4, "E", "")
    add("Electronics", "5 V 3 A buck module (controllers, sensors)", 1, 3.0, 3.0, "E", "")
    add("Electronics", "Wiring: silicone 12 AWG red/black, 20 AWG multi-colour, XT60 pairs, Dupont, heat-shrink", 1,
        45.0 if k1 else 35.0, 25.0 if k1 else 20.0, "E", "scrounge: cables from old PSUs and appliances")

    if c["odesc"]:
        add("Power", "18650 cells for a 13S4P pack (48 V, ~10 Ah): the hoverboards' own packs supply most of them", 52, 2.0, 0.0, "E",
            "R11 §5: each hoverboard pack is 10S2P (20 cells); test every cell")
        add("Power", "13S 30 A BMS + holders / nickel strip", 1, 18.0, 18.0, "E", "R11 §5: 10S BMS A$9-13 (V); 13S 30 A estimated")
        add("Power", "48 -> 18 V 20 A buck converter (drill-driven joints)", 1, 22.0, 22.0, "E", "")
        add("Power", "Charger: 54.6 V 2 A Li-ion charger (or a CC/CV boost module from a laptop supply)", 1, 25.0, 15.0, "E", "supervised charging only")
    else:
        cells = 30 if k1 else 25
        add("Power", f"18650 cells for a 5S{cells // 5}P pack (18 V, like the drills' own packs)", cells, 2.0, 0.0, "E",
            "R11 §5: salvage from laptop / power-tool / hoverboard packs, 30-50 % usable after testing; buy used A$1.5-3 (E)")
        add("Power", "5S 20 A BMS + 18650 holders", 1, 9.0, 9.0, "E", "R11 §5: basic 5S/6S BMS A$3-8 (E)")
        add("Power", "Charger: CC/CV buck module set to 21.0 V / 2 A, fed from an old 24 V laptop or printer supply", 1, 8.0, 8.0, "E", "supervised charging only, on a non-flammable surface")
    add("Safety", "Latching e-stop mushroom button", 1, 5.0, 5.0, "E", "")
    add("Safety", "40 A automotive relay (contactor) + 12 V coil buck + flyback diode", 1, 8.0, 8.0, "E", "")
    add("Safety", "Blade fuse holders + fuses (40 A main, 15 A per limb)", 1, 8.0, 8.0, "E", "")
    add("Safety", "Gantry: 10 m rope, 2 carabiners, chest and pelvis straps (garage beam or A-frame)", 1, 20.0, 10.0, "E", "")
    if k1:
        add("Head and shell", "Old smartphone (camera, IMU, screen face, Wi-Fi)", 1, 40.0, 0.0, "E", "your old phone; used A$30-60")
        add("Head and shell", "EVA foam floor tiles, Kmart 12-pack", 2, 10.0, 10.0, "Vs", "R11 §4.4")
        add("Head and shell", "Contact cement, primer (Plasti Dip / PVA), paint: white, graphite, amber", 1, 35.0, 25.0, "E", "")
    else:
        add("Head", "USB webcam on a plywood head (or an old phone)", 1, 10.0, 0.0, "E", "")
    return L


def write(sub, name, target):
    c = counts(sub)
    L = lines(sub, c)
    tb = sum(x["qty"] * x["buy"] for x in L)
    ts = sum(x["qty"] * x["scrounge"] for x in L)
    gen = PROJ / "scrap" / sub / "generated"
    data = PROJ / "scrap" / sub / "data"
    gen.mkdir(parents=True, exist_ok=True)
    with open(data / "bom.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["group", "item", "qty", "buy", "scrounge", "conf", "note"])
        w.writeheader()
        w.writerows(L)
    groups = {}
    for x in L:
        g = groups.setdefault(x["group"], [0.0, 0.0])
        g[0] += x["qty"] * x["buy"]
        g[1] += x["qty"] * x["scrounge"]
    M = [f"# {name} parts list (generated)", "",
         f"Generated by `scrap/calc/scrap_bom.py` from the selected actuators (`scrap/{sub}/generated/actuator_selection.md`): "
         f"{c['drills']} drill gearmotors, {c['capstans']} capstans ({c['cords']} cord loops)"
         + (f", {c['servos'] + 2} hobby servos" if c["servos"] else "") + f", {c['joints']} actuated joints. Prices in AUD inc GST "
         f"from [{R11}](../../../{R11}); V = seen on the page, Vs = seen in a search summary, E = estimate. Tools not included.", "",
         f"| | Buy the cheapest | Scrounge what you can |", "|---|---|---|"]
    for g, (b, s) in groups.items():
        M.append(f"| {g} | A${b:,.0f} | A${s:,.0f} |")
    M.append(f"| **Total** | **A${tb:,.0f}** | **A${ts:,.0f}** |")
    M += ["", f"Target: **A${target:,}**. " + ("Met by scrounging." if ts <= target else "Not met even scrounging.")
          + (" Met buying everything too." if tb <= target else ""), "",
          "| Group | Item | Qty | Buy A$ each | Scrounge A$ each | Conf. | Note |", "|---|---|---|---|---|---|---|"]
    for x in L:
        M.append(f"| {x['group']} | {x['item']} | {x['qty']} | {x['buy']:.2f} | {x['scrounge']:.2f} | {x['conf']} | {x['note']} |")
    (gen / "bom.md").write_text("\n".join(M) + "\n")
    print(f"{name}: buy A${tb:,.0f}, scrounge A${ts:,.0f} (target A${target:,})")
    return tb, ts


if __name__ == "__main__":
    write("s1", "KESTREL S1-Scrap", 1000)
    write("k1", "KESTREL K1-Scrap", 1000)
    for sub, name, target in (("s1fast", "KESTREL S1-Fast", 1500), ("k1fast", "KESTREL K1-Fast", 2000)):
        if (PROJ / "scrap" / sub / "data" / "actuator_family.json").exists():
            write(sub, name, target)
