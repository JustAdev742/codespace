"""KESTREL S1 bill of materials, priced in AUD.

    python simple/calc/s1_bom.py         # writes simple/generated/bom.md and simple/data/bom.csv

What it does
  * actuators: quantities are counted from the S1 joint table (calc/kestrel/variant_s1.py via params.joint_table())
    for each class in simple/data/actuator_family.json, then priced from data/cots_actuators.json:
    price_aud (Australian reseller, inc GST) when present, else price_usd x 1.52 x 1.10 (rate + shipping/GST)
  * structure: extrusion and tube lengths from params.DIM, plate area from an explicit plate list x an A$/m2
    assumption (Cut Fold Direct quotes instantly but publishes no A$/m2, so the rate is stated and marked)
  * electrical, safety, compute/sensing, grippers: one line per part with its source URL
  * tools and consumables: optional, listed but not in the total
Every line is marked "verified" (price read at the URL on the access date) or "estimate" (method in the
notes). Where docs/research/R8 or R9 list a cheaper part, it goes in the "cheaper option" column.
Access date for every URL: 2026-11-09. Do not edit bom.md or bom.csv by hand.
"""
from __future__ import annotations

import csv
import json
import os
import sys
from collections import Counter, OrderedDict
from pathlib import Path

os.environ["KESTREL_VARIANT"] = "s1"
HERE = Path(__file__).resolve().parent
SIMPLE = HERE.parent
PROJ = SIMPLE.parent
sys.path.insert(0, str(PROJ / "calc"))

from kestrel import params as P  # noqa: E402

ACCESS = "2026-11-09"
FAMILY = SIMPLE / "data" / "actuator_family.json"
CATALOGUE = PROJ / "data" / "cots_actuators.json"
OUT_MD = SIMPLE / "generated" / "bom.md"
OUT_CSV = SIMPLE / "data" / "bom.csv"

# ---------------------------------------------------------------------------- currency rules
USD_AUD = 1.52          # project rule (also used by simple/calc/s1_select.py)
LANDED = 1.10           # +10 % for shipping/GST on anything bought overseas
GST = 1.10              # Australian GST, for prices quoted ex GST
EUR_AUD = 1.61          # moneyexchangerate.org EUR/AUD, 2026-11-04 (10-day range 1.59-1.61)
EUR_AUD_URL = "https://moneyexchangerate.org/currencyexchange/eur/aud/6000"
CNY_USD = 6.7           # docs/research/R8 assumption (2026-09-09 mid-market 6.708)
DE_VAT = 1.19           # German VAT, stripped from EUR prices quoted inc VAT


def to_aud(price: float, cur: str) -> float:
    """Landed AUD including GST."""
    if cur == "AUD":            # Australian retail, inc GST
        return price
    if cur == "AUD_EX":         # Australian trade price, ex GST
        return price * GST
    if cur == "USD":
        return price * USD_AUD * LANDED
    if cur == "EUR_INC_DE":     # German shop, inc 19 % VAT
        return price / DE_VAT * EUR_AUD * LANDED
    if cur == "CNY":
        return price / CNY_USD * USD_AUD * LANDED
    raise ValueError(cur)


BASIS = {"AUD": "A$ inc GST", "AUD_EX": "A$ ex GST x 1.10", "USD": "US$ x 1.52 x 1.10",
         "EUR_INC_DE": "EUR / 1.19 x 1.61 x 1.10", "CNY": "CNY / 6.7 x 1.52 x 1.10"}

ROWS: list[dict] = []


def add(sub, item, spec, qty, price, cur, status, supplier, url, cheaper="", note="", optional=False, unit="ea"):
    each = to_aud(price, cur)
    ROWS.append(OrderedDict(
        subsystem=sub, item=item, spec=spec, qty=qty, unit=unit, unit_aud=round(each, 2), line_aud=round(each * qty, 2),
        status=status, price_basis=f"{price:,.2f} {BASIS[cur]}", supplier=supplier, source_url=url,
        cheaper_option=cheaper, notes=note, optional="yes" if optional else "no"))


# ---------------------------------------------------------------------------- actuators
PAKRONICS = "https://www.pakronics.com.au/search?q=robstride"
ROBOTICSCENTER_MYA = "https://www.roboticscenter.ai/store/brand/myactuator/"
RS_README = "https://github.com/RobStride/Product_Information"
CHEAPER_ACT = {
    "MyActuator RMD-X12-P20-320-E": "DAMIAO DM-J10010-2EC US$540 (150 N·m: fails the S1 knee/hip-pitch check, R9 2nd choice); "
                                    "RS04 + 1.6-2:1 belt (R9 budget route, needs re-selection)",
    "RobStride RS04": f"RobStride list ¥1,199 ≈ A${to_aud(1199, 'CNY'):,.0f} China-direct before freight/import (R8 [V 52]); "
                      f"roboticscenter.ai US$295 ≈ A${to_aud(295, 'USD'):,.0f}",
    "RobStride RS03": f"RobStride list ¥999 ≈ A${to_aud(999, 'CNY'):,.0f} China-direct (R8); DAMIAO DM-J4340-2EC US$215 (R9 arm alternative)",
    "RobStride RS02": f"RobStride list ¥699 ≈ A${to_aud(699, 'CNY'):,.0f} China-direct (R8); DAMIAO DM-J4310-2EC US$180 (R9)",
    "RobStride RS00": f"RobStride list ¥598 ≈ A${to_aud(598, 'CNY'):,.0f} China-direct ({RS_README}); DAMIAO DM-J4310-2EC US$180 (R9)",
}


def actuator_rows():
    fam = json.loads(FAMILY.read_text())
    cat = {a["name"]: a for a in json.loads(CATALOGUE.read_text())}
    per_class = Counter(j["act"] for j in P.joint_table().values())     # actuators per class on the robot
    models = OrderedDict()
    for cls, f in fam.items():
        m = models.setdefault(f["actuator"], dict(qty=0, classes=[], joints=[]))
        m["qty"] += per_class[cls]
        m["classes"].append(f"{cls} x{per_class[cls]}")
        m["joints"] += list(f["reductions"].keys())
    for name, m in models.items():
        a = cat[name]
        spec = (f"{a['peak_Nm']}/{a['rated_Nm']} N·m peak/rated, {a['mass_kg']} kg, {a.get('voltage_V')} V; "
                f"{', '.join(m['classes'])} ({', '.join(m['joints'])})")
        if a.get("price_aud"):
            add("Actuators", name, spec, m["qty"], a["price_aud"], "AUD", "verified", "Pakronics (AU reseller)",
                PAKRONICS, CHEAPER_ACT.get(name, ""), "AU stock price inc GST, data/cots_actuators.json")
        else:
            add("Actuators", name, spec, m["qty"], a["price_usd"], "USD", "verified", "roboticscenter.ai (US reseller)",
                ROBOTICSCENTER_MYA, CHEAPER_ACT.get(name, ""),
                "no AU reseller found; USD 'from' price, made to order (data/cots_actuators.json)")
    return models


# ---------------------------------------------------------------------------- structure
GAP_2040 = "https://www.gapengineering.com.au/product/profile-20x40-t-slot/"
GAP_4040 = "https://www.gapengineering.com.au/?p=1678"
CUTFOLD = "https://www.cutfolddirect.com.au/"
PLATE_RATE = 700.0      # A$/m2 inc GST, 6 mm aluminium laser cut incl. 20 mm hole grid: ASSUMPTION, replace with a quote
NEST = 1.5              # sheet utilisation / kerf / scrap factor: ASSUMPTION


def plate_list():
    """(name, qty, w_m, h_m) for every cut plate, from the S1 component list (variant_s1.py) and DIM."""
    d = P.DIM
    od = {"MyActuator RMD-X12-P20-320-E": 0.124, "RobStride RS04": 0.120, "RobStride RS03": 0.098,
          "RobStride RS02": 0.0785, "RobStride RS00": 0.057}
    plates = [
        ("pelvis hip plates", 2, 0.30, 0.12),
        ("waist turntable plate", 1, 0.16, 0.16),
        ("torso side plates (shoulder-pitch mounts)", 2, 0.30, d["shoulder_z"] + 0.065),
        ("torso back plate (battery cradle, DIN rail, electronics)", 1, 0.30, 0.40),
        ("shoulder L-brackets (2 faces)", 4, 0.08, 0.08),
        ("shoulder-roll output brackets", 2, 0.07, 0.10),
        ("elbow output brackets", 2, 0.06, 0.08),
        ("wrist output plate + ISO 9409-1-50 flange", 2, 0.08, 0.08),
        ("neck brackets", 2, 0.08, 0.08),
        ("head plate frame", 4, 0.12, 0.12),
        ("hip yaw-roll brackets (2 per side)", 4, 0.12, 0.14),
        ("hip roll-pitch brackets (2 per side)", 4, 0.15, 0.15),
        ("thigh side plates (belt drive + knee yoke)", 4, 0.10, d["thigh"]),
        ("shank plates (ankle actuators + yoke)", 4, 0.08, d["shank"] * 0.75),
        ("foot plates (8 mm)", 2, d["foot_len"], d["foot_w"]),
    ]
    # two adapter flanges per actuator (housing side + output side, R8 §5.3), square blank = OD + 20 mm
    for name, n in (("MyActuator RMD-X12-P20-320-E", 4), ("RobStride RS04", 13), ("RobStride RS03", 4),
                    ("RobStride RS02", 4), ("RobStride RS00", 4)):
        s = od[name] + 0.02
        plates.append((f"adapter flanges, {name}", 2 * n, s, s))
    return plates


def structure_rows():
    d = P.DIM
    # 2040: torso box 4 uprights x 0.40 m + top/bottom frames 2 x (2 x 0.30 + 2 x 0.18); pelvis box 2 x 0.30 + 2 x 0.20
    l2040 = 4 * 0.40 + 2 * (2 * 0.30 + 2 * 0.18) + (2 * 0.30 + 2 * 0.20)
    l4040 = 2 * d["hip_half_width"] + 0.10
    tube40 = 2 * d["thigh"] + 2 * d["shank"] + 2 * d["upper_arm"]
    tube30 = 2 * d["forearm"]

    def order(m, waste=1.10, step=0.5):
        x = m * waste
        return round(-(-x // step) * step, 2)
    add("Structure", "T-slot 20x40, 6 mm slot, clear anodised", f"torso + pelvis boxes: {l2040:.2f} m net (DIM) +10 % cut waste",
        order(l2040), 20.40, "AUD_EX", "verified", "GAP Engineering", GAP_2040,
        "V-slot 20-series from Maker Store A$10.11-62.66 per 1.5 m (R9)", "cut-to-length service available", unit="m")
    add("Structure", "T-slot 40x40, 8 mm slot (hip cross-member)", f"{l4040:.2f} m net (2 x hip_half_width + 0.10 m)",
        order(l4040), 33.00, "AUD_EX", "verified", "GAP Engineering", GAP_4040, "", "5.8 m bar A$191.40 ex GST", unit="m")
    add("Structure", "Round tube Ø40 x 3, 6061-T6", f"thighs, shanks, upper arms: {tube40:.2f} m net (DIM)", order(tube40, 1.15),
        30.0, "AUD", "estimate", "local aluminium stockist", "",
        "", "ASSUMPTION A$30/m: no AU price sourced this session; get a stockist quote", unit="m")
    add("Structure", "Round tube Ø30 x 2, 6061-T6", f"forearms: {tube30:.2f} m net", order(tube30, 1.15), 20.0, "AUD", "estimate",
        "local aluminium stockist", "", "", "ASSUMPTION A$20/m", unit="m")
    plates = plate_list()
    area = sum(q * w * h for _, q, w, h in plates)
    add("Structure", "Laser-cut aluminium plates, 6 mm (feet 8 mm), 20 mm M5 hole grid",
        f"{len(plates)} part types, {sum(q for _, q, _, _ in plates)} parts, net {area:.2f} m² x {NEST} nesting = {area * NEST:.2f} m²",
        round(area * NEST, 2), PLATE_RATE, "AUD", "estimate", "Cut Fold Direct (Heidelberg West VIC)", CUTFOLD, "",
        "ASSUMPTION A$700/m² cut incl. holes; Cut Fold Direct quotes 5005-H34 Al 1-12 mm instantly (min order "
        "A$300 ex GST, R9). 5005-H34 is weaker than the 6061-T6 in variant_s1.py: re-check plates or buy 6061 from a waterjet shop",
        unit="m²")
    add("Structure", "Split clamp blocks for Ø40/Ø30 tube, 6061, cross-dowelled", "2 per limb segment x 8 segments", 16, 30.0,
        "AUD", "estimate", "CNC service (JLCCNC / PCBWay, R6)", "", "", "ASSUMPTION A$30 each machined")
    add("Structure", "Knee belt drive: Gates Poly Chain Carbon Volt 8MGTV-800-36 belt + 8MGT 36T / 54T aluminium pulleys "
        "(lightened 6061, cut list sec. 6) + 6908 / 6905 bearings + tension block", "one set per knee", 2, 650.0,
        "AUD", "estimate", "Gates distributor (belt, RS 2118333 class) + 8MGT pulley maker (B&B Manufacturing / Misumi class)",
        "https://sg.rs-online.com/web/p/timing-belts/2118333",
        "fallback #50 roller chain 18T / 27T + sprockets, about A$120 per knee, needs grease and a guard",
        "ASSUMPTION belt ~A$250, two custom 8MGT pulleys ~A$180 each, bearings + block ~A$40")
    add("Structure", "Outboard bearing FAG 61812-2RSR-Y, 60x78x10 thin section", "hip yaw, hip roll, hip pitch, knee yokes (4 per leg)",
        8, 145.59, "AUD_EX", "verified", "RS Components AU (1908409)", "https://au.rs-online.com/web/p/ball-bearings/1908409",
        "Dunlop 61812-2RS £9.72 ex VAT, Bearing Boys UK (R9); SKF 61812-2RS1 A$173.69 ex GST (R9)", "")
    add("Structure", "Small deep-groove bearings, 6001-2RS class", "ankle crosses (2 pairs per ankle), idlers", 16, 6.0, "AUD",
        "estimate", "bearing supplier", "", "", "ASSUMPTION A$6 each")
    add("Structure", "Rod ends M8 (female, with studs)", "ankle push-rods 2 x 2 ends per ankle + hip-roll 2:1 crank rods",
        12, 15.0, "AUD", "estimate", "bearing supplier", "", "", "ASSUMPTION A$15 each; R8: size at >= 3x link force")
    add("Structure", "Push-rod stock Ø10 6061 rod", "ankle + hip-roll rods", 1, 15.0, "AUD", "estimate", "local stockist", "", "",
        "ASSUMPTION", unit="m")
    add("Structure", "Hip-pitch cooling fan 40x40x10 mm 12 V (e.g. Noctua NF-A4x10 FLX) + 20 mm-grid bracket",
        "one per hip-pitch X12: its continuous rating assumes forced air (simple/generated/actuator_selection.md)", 2, 30.0,
        "AUD", "estimate", "AU PC retailers (Noctua NF-A4x10)", "", "", note="required, not optional")
    add("Structure", "Fastener kit: M5 SHCS/BHCS, 6 mm-slot M5 T-nuts, M4/M3, nylocs, dowels, threadlocker",
        "whole robot", 1, 300.0, "AUD", "estimate", "fastener supplier", "", "", "ASSUMPTION A$300")
    add("Structure", "Extrusion corner brackets / cubes", "torso + pelvis boxes", 24, 4.0, "AUD", "estimate", "GAP Engineering",
        "https://www.gapengineering.com.au/", "", "ASSUMPTION A$4 each")
    add("Structure", "Battery cradle rails + strap, rubber soles, TPU bumpers (printed)", "", 1, 80.0, "AUD", "estimate", "", "", "",
        "ASSUMPTION")
    return area


# ---------------------------------------------------------------------------- electrical
def electrical_rows():
    E = "Electrical"
    add(E, "Battery: Polly 48 V 20 Ah e-bike pack, Samsung 50G 21700 cells, BMS 50 A continuous",
        "13S class, 4.95 kg, 367x95x125 mm, Micro XT90 discharge, 3 A charger included", 1, 895.95, "AUD", "verified",
        "Melbourne Powered (Ascot Vale VIC)", "https://melbournepowered.com.au/products/48v-20ah-e-bike-battery-with-samsung-cells",
        "TDR 48 V 20 Ah triangle pack A$609, but 40 A max continuous < S1's ~51 A peak (R9): not recommended",
        "pre-order item; series/parallel count and full-charge voltage not stated on the page: confirm 13S before buying")
    add(E, "Charger, 13S Li-ion CC/CV with adjustable voltage, set to 53.3 V (4.10 V/cell), 3-5 A", "keeps the bus < 55 V "
        "(MyActuator X12 limit) with room for the regen clamp", 1, 250.0, "AUD", "estimate", "", "", "",
        "ASSUMPTION A$250; the pack's own charger (13S, assumed 54.6 V) is not used, see S1-electrical.md §3")
    add(E, "Main fuse 80 A, DC-rated >= 60 V, breaking >= 2 kA, with holder", "between pack + and everything", 1, 90.0, "AUD",
        "estimate", "", "", "", "ASSUMPTION; 32 V automotive ANL/MIDI fuses are NOT acceptable at 54.6 V")
    add(E, "Branch fuses, Littelfuse MINI 58 V series (2-30 A, 1000 A interrupting @ 58 VDC)",
        "30 A x4 (X12 feeds), 20 A x2 (leg RS04 chains), 15 A x2 (arms), 10 A x2 (torso, 48V-SW spare), spares",
        14, 2.5, "AUD", "estimate", "Littelfuse (rating)",
        "https://static6.arrow.com/aropdfconversion/38d9c00342541b7623723d1b6666abc8ea98f97c/littelfusedatasheet997mini58vr40.pdf",
        "", "rating from the Littelfuse MINI 58V datasheet; price ASSUMPTION A$2.50")
    add(E, "Fuse holders rated >= 58 V for MINI blades", "one per branch", 12, 6.0, "AUD", "estimate", "", "", "", "ASSUMPTION")
    add(E, "Main contactor TE Kilovac EV200AAANA, 500 A, 9-36 VDC coil", "cuts 48V-SW (actuator bus) on e-stop", 1, 327.50,
        "AUD_EX", "verified", "RS Components AU (690-0814)", "https://au.rs-online.com/web/p/contactors/6900814", "",
        "element14 AU A$344.54 ex GST (R9)")
    add(E, "Precharge: 22 Ω 50 W aluminium-housed resistor, 12 V relay (contacts >= 5 A @ 60 VDC), 3 s delay-on timer",
        "bus capacitance up to ~20 mF (assumed)", 1, 60.0, "AUD", "estimate", "", "", "", "ASSUMPTION")
    add(E, "Arm/reset latch relay K1, RESET push-button, watchdog relay K3 + 74HC123 retriggerable monostable", "e-stop logic",
        1, 45.0, "AUD", "estimate", "", "", "", "ASSUMPTION")
    add(E, "Regen clamp (S1 design): LM393 + TL431 comparator, 100 V MOSFET, bus-powered gate supply, heatsink",
        "ON 54.3 V / OFF 53.9 V", 1, 45.0, "AUD", "estimate", "", "",
        f"ODrive Regen Clamp US$89 ≈ A${to_aud(89, 'USD'):,.0f} (https://shop.odriverobotics.com/products/odrive-regeneration-clamp): "
        "threshold and voltage rating not checked against the 55 V limit", "ASSUMPTION parts cost")
    add(E, "Brake resistors 4.7 Ω 200 W aluminium-housed, 2 in parallel (2.35 Ω)", "on the torso frame as heatsink", 2, 35.0,
        "AUD", "estimate", "", "", "", "ASSUMPTION; check the pulse-energy rating in the chosen part's datasheet")
    add(E, "Bus capacitors 1000 µF 100 V low-ESR (x2) + TVS SMDJ58A", "48V-SW after the contactor", 1, 25.0, "AUD", "estimate",
        "", "", "", "1000 µF/100 V is MyActuator's recommendation for switched supplies (X-series manual §5.1); price ASSUMPTION")
    add(E, "DC-DC Mean Well DDR-120C-12: 33.6-67.2 V in, 12 V 10 A, 4 kV isolation, DIN rail", "compute + 12 V rail, "
        "fed upstream of the contactor", 1, 67.30, "USD", "verified", "Master Electronics",
        "https://www.masterelectronics.com/en/mean-well/ddr120c12-50178740.html", "", "")
    add(E, "DC-DC Mean Well DDR-120C-24: 33.6-67.2 V in, 24 V 5 A, DIN rail", "24 V accessory rail", 1, 67.30, "USD",
        "verified", "Master Electronics", "https://www.masterelectronics.com/en/mean-well/ddr120c24-50178741.html", "", "")
    add(E, "Buck converter 12 V -> 5 V 5 A", "5 V accessory rail, USB power ports", 1, 25.0, "AUD", "estimate", "", "", "",
        "ASSUMPTION")
    add(E, "Bus monitor: INA228-class 85 V power-monitor board + 100 A / 75 mV shunt", "battery V/I/energy to the Jetson (I²C)",
        1, 45.0, "AUD", "estimate", "", "", "", "ASSUMPTION")
    add(E, "DIN rail, terminal blocks, 5x20 mm logic fuses, labels", "torso electrical plate", 1, 60.0, "AUD", "estimate", "",
        "", "", "ASSUMPTION")
    add(E, "Wire: silicone 10/12/14/16/18 AWG red+black, 22 AWG twisted pair for CAN", "see S1-electrical.md §6", 1, 150.0, "AUD",
        "estimate", "", "", "", "ASSUMPTION; ~4 m 10 AWG, 10 m 12 AWG, 14 m 14 AWG, 6 m 16 AWG, 10 m 18 AWG, 20 m CAN pair")
    add(E, "Connectors: XT90-S, XT60 x12 pr, XT30 x20 pr, XT30(2+2) x8, GH1.25 2/4-pin housings + crimps, DC barrel",
        "", 1, 130.0, "AUD", "estimate", "", "", "", "ASSUMPTION")
    add(E, "Power + CAN distribution board XT30U-F to XT30PW, 1-to-4 (pack of 4)", "limb harness splits", 2, 38.0, "USD",
        "verified", "rcdrone.top",
        "https://rcdrone.top/products/planetary-robot-joint-power-can-bus-distribution-adapter-board-xt30u-f-to-xt30pw",
        "", "pin assignment to be confirmed on arrival (seller note)")
    add(E, "USB-CAN-FD interface mjbots mjcanfd-usb-1x (gs_usb/SocketCAN, ±58 V common mode, JST PH3)", "5 buses + 1 spare",
        6, 39.0, "USD", "verified", "mjbots", "https://mjbots.com/products/mjcanfd-usb-1x",
        "CANable 2.0 US$35 (FD needs slcan firmware); ODrive USB-CAN US$37 (CAN 2.0 only); RobStride USB-CAN A$33.95 (R9)",
        "USB ground not isolated: see grounding rules")
    add(E, "RobStride USB-to-CAN adapter (Type-C)", "vendor GUI: IDs, zero, firmware, parameters", 1, 33.95, "AUD", "verified",
        "Pakronics", PAKRONICS, "", "")
    add(E, "CAN terminators 120 Ω on JST-GH plugs", "far end of each bus + spare", 6, 2.0, "AUD", "estimate", "", "", "",
        "ASSUMPTION; X12s ship with one 120 Ω terminator each (reseller listing)")
    add(E, "Powered USB 3 hub, >= 7 ports, 12 V input", "CAN sticks + cameras", 1, 60.0, "AUD", "estimate", "", "", "",
        "ASSUMPTION")
    add(E, "Gigabit Ethernet switch, 5 port, 5/12 V input", "spare Ethernet ports for add-ons", 1, 35.0, "AUD", "estimate", "",
        "", "", "ASSUMPTION")


# ---------------------------------------------------------------------------- safety
def safety_rows():
    S = "Safety"
    eao = "https://www.buerklin.com/en/p/eao/emergency-stop/84-5220-0020/12G0489"
    add(S, "E-stop push-button EAO 84-series, twist release, 22.3 mm, IP65-67 (84-5220-0020)", "on the robot's back", 1, 31.15,
        "EUR_INC_DE", "verified", "Bürklin (DE)", eao,
        "Eaton M22-PVT twist-release operator US$12.15, operator only (https://www.zoro.com/eaton-pushbuttons-twist-to-"
        "release-emergency-stop-operator-black-non-illuminated-m22s-pvt/i/G714798177/)", "AU RS listing has no price (R9)")
    add(S, "E-stop push-button EAO 84-series (pendant)", "tethered pendant", 1, 31.15, "EUR_INC_DE", "verified", "Bürklin (DE)",
        eao, "", "")
    add(S, "Pendant parts: handheld enclosure, 5 m 4-core cable, 4-pin locking connector, labelled bypass plug", "", 1, 45.0,
        "AUD", "estimate", "", "", "", "ASSUMPTION")
    add(S, "Wireless e-stop FORT Robotics Foundation (AU/NZ handset WES-001-903, 915-928 MHz) + Vehicle Safety Controller receiver",
        "heartbeat; stop on link loss; designed to SIL 2 / Cat 3 PLd (reseller page)", 1, 4495.95, "EUR_INC_DE", "estimate",
        "FORT via New Eagle / Clearpath (quote)", "https://store.neweagle.net/?p=22917",
        "Telecrane F21-E1B crane radio with stop button, ~CA$109-114 (https://www.fruugo.ca/f21-e1b-industrial-wireless-crane-"
        "radio-remote-control-hoist-controller/p-373903579): NOT safety-rated, link-loss behaviour undocumented; usable only "
        "if it passes the S1 link-loss test",
        "FORT publishes no price (quote only). Estimate = the only published FORT-based kit price: Clearpath Husky A300 "
        "Wireless E-Stop €4,495.95 inc VAT, https://www.mybotshop.de/Clearpath-Robotics-Husky-A300-Wireless-E-Stop_3")
    add(S, "Test gantry: 40x40 frame ~2.4 m, rope/chain hoist, full-body harness", "mandatory until walking is validated (R8 §5.6)",
        1, 600.0, "AUD", "estimate", "", "", "", "ASSUMPTION")
    add(S, "Lithium storage/charging bag + ABE extinguisher", "charging area", 1, 80.0, "AUD", "estimate", "", "", "", "ASSUMPTION")


# ---------------------------------------------------------------------------- compute and sensing
def compute_rows():
    C = "Compute + sensing"
    add(C, "NVIDIA Jetson Orin Nano Super Developer Kit 8 GB", "carrier accepts Orin NX modules; DC jack 9-20 V", 1, 848.10, "AUD",
        "verified", "Core Electronics (AU)", "https://core-electronics.com.au/catalog/product/view/sku/DFR0629",
        "Raspberry Pi 5 8 GB A$216.71 (R9): no CUDA, blind walking only",
        "price from a search snippet (R9). Upgrade: Orin NX 16 GB module A$1,890 ex GST (IoT Store AU) in the same carrier")
    add(C, "NVMe SSD 256 GB M.2 2280", "OS + logs", 1, 60.0, "AUD", "estimate", "", "", "", "ASSUMPTION")
    add(C, "IMU HiPNUC HI13 (industrial-class 6/9-axis AHRS)", "pelvis, at the MJCF 'imu' site", 1, 350.0, "CNY", "estimate",
        "HiPNUC (via Taobao, Roboto Origin BOM)", "https://github.com/Roboparty/roboto_origin/blob/main/assets/BOM_EN.md",
        "Adafruit BNO085 A$48.68 (Little Bird AU, R9): cellphone-grade per BHL",
        "price from the Roboto Origin BOM (R8 [V 46]); no AU listing; upgrade Xsens MTi-3 DK A$912.79 (RS AU, R9)")
    add(C, "Intel RealSense D435i depth camera", "chest, terrain height map for the policy", 1, 399.0, "USD", "verified",
        "RealSense store", "https://store.realsenseai.com/", "Luxonis OAK-D Lite US$269 (R9)", "")
    add(C, "Luxonis OAK-D Lite", "head stereo + RGB", 1, 269.0, "USD", "verified", "Luxonis",
        "https://shop.luxonis.com/collections/oak-cameras-1", "", "")
    add(C, "TE FX29 compression load cell 100 lbf (445 N), analog", "4 per sole", 8, 23.15, "USD", "verified", "DigiKey",
        "https://www.digikey.it/en/product-highlight/t/te-connectivity-measurement-specialties/fx29-force-sensors",
        "Interlink FSR 402 A$13.90 (Little Bird AU, R9): contact only, drifts", "")
    add(C, "Foot board: CAN-FD MCU board (e.g. ATSAME51 Feather class) + divider + JST-GH CAN drop", "one per foot, on the leg bus",
        2, 45.0, "AUD", "estimate", "", "", "", "ASSUMPTION")
    add(C, "Wireless gamepad", "velocity commands, software DAMP button (not a safety device)", 1, 60.0, "AUD", "estimate", "", "",
        "", "ASSUMPTION")


# ---------------------------------------------------------------------------- grippers
def gripper_rows():
    G = "Grippers"
    add(G, "RobStride RS00 (gripper drive)", "14/5 N·m, 0.31 kg, one per gripper", 2, 282.85, "AUD", "verified", "Pakronics",
        PAKRONICS, CHEAPER_ACT["RobStride RS00"], "not in actuator_family.json (grippers are outside the joint table)")
    add(G, "Parallel-jaw mechanics: MGN9 rail + carriages, rack/leadscrew, printed PA-CF jaws, ISO 9409-1-50 plate", "per gripper",
        2, 90.0, "AUD", "estimate", "", "", "Pollen Amazing Hand < €200 parts / LEAP Hand v2 ~US$200 as later upgrades (R9)",
        "ASSUMPTION")


# ---------------------------------------------------------------------------- tools (optional)
def tool_rows():
    T = "Tools + consumables (optional)"
    for item, price, note in (
            ("Current-limited bench supply 0-60 V >= 5 A", 250.0, "first power-up of every actuator and of the bus"),
            ("Crimp tool for JST GH/PH (Engineer PA-09 class)", 70.0, ""),
            ("Soldering iron (Pinecil class) + solder, for XT connectors", 90.0, ""),
            ("Multimeter CAT III + DC clamp meter", 150.0, ""),
            ("Hex/Torx keys + torque screwdriver M3-M5", 120.0, ""),
            ("Heat gun, heat-shrink, cable ties, braided sleeve, Loctite 243", 80.0, "")):
        add(T, item, note, 1, price, "AUD", "estimate", "", "", "", "ASSUMPTION", optional=True)


# ---------------------------------------------------------------------------- output
ORDER = ["Actuators", "Structure", "Electrical", "Safety", "Compute + sensing", "Grippers", "Tools + consumables (optional)"]


def money(x):
    return f"{x:,.0f}"


def write(models, plate_area):
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(ROWS[0].keys()))
        w.writeheader()
        for r in ROWS:
            w.writerow(r)
    subs = OrderedDict((s, [r for r in ROWS if r["subsystem"] == s]) for s in ORDER)
    tot = {s: sum(r["line_aud"] for r in rs) for s, rs in subs.items()}
    ver = {s: sum(r["line_aud"] for r in rs if r["status"] == "verified") for s, rs in subs.items()}
    core = [s for s in ORDER if not s.startswith("Tools")]
    total = sum(tot[s] for s in core)
    total_v = sum(ver[s] for s in core)
    fort = next(r["line_aud"] for r in ROWS if r["item"].startswith("Wireless e-stop FORT"))
    n_act = sum(m["qty"] for m in models.values())
    rs_list_cny = {"RobStride RS04": 1199, "RobStride RS03": 999, "RobStride RS02": 699, "RobStride RS00": 598}
    rs_rows = [r for r in subs["Actuators"] if r["item"] in rs_list_cny]
    rs_n = sum(r["qty"] for r in rs_rows)
    rs_au = sum(r["line_aud"] for r in rs_rows)
    rs_cn = sum(r["qty"] * to_aud(rs_list_cny[r["item"]], "CNY") for r in rs_rows)
    L = ["# KESTREL S1 bill of materials (generated)", "",
         f"Generated by `simple/calc/s1_bom.py`. Do not edit by hand. Prices in **AUD including GST**, landed; every URL accessed "
         f"{ACCESS}. Design: `calc/kestrel/variant_s1.py`; actuators: `simple/data/actuator_family.json` "
         f"({n_act} joint actuators counted from the S1 joint table) priced from `data/cots_actuators.json`; electrical and "
         "software design: `simple/docs/S1-electrical.md`, `simple/docs/S1-software.md`.", "",
         "**Status.** *verified*: the price was read at the source URL (directly or as recorded in docs/research/R8, R9 or "
         "the actuator catalogue). *estimate*: no sourced price; the method or assumption is in the notes. Replace estimates "
         "with quotes before ordering.", "",
         "**Conversions.** AUD retail inc GST as listed; AUD ex GST x 1.10; USD x 1.52 x 1.10 (project rate + 10 % "
         f"shipping/GST); EUR / 1.19 (German VAT) x {EUR_AUD} x 1.10 ([EUR/AUD 2026-11-04]({EUR_AUD_URL})); CNY / 6.7 x 1.52 x "
         "1.10 (R8 rate). The USD rate is the project's fixed planning rate, not today's spot rate.", "",
         "## Summary", "", "| Subsystem | Lines | Subtotal (A$) | of which verified (A$) |", "|---|---|---|---|"]
    for s in ORDER:
        L.append(f"| {s} | {len(subs[s])} | {money(tot[s])} | {money(ver[s])} |")
    L += [f"| **Total (excluding optional tools)** | {sum(len(subs[s]) for s in core)} | **{money(total)}** | "
          f"{money(total_v)} ({100 * total_v / total:.0f} %) |", "",
          f"- Without the FORT wireless e-stop estimate (A${money(fort)}), the total is **A${money(total - fort)}**. "
          "The FORT price is quote-only; see the Safety table for the budget alternative and its caveat.",
          f"- Actuators are {100 * tot['Actuators'] / total:.0f} % of the total. Buying the {rs_n} RobStride joint actuators "
          f"China-direct at list price (R8; before freight and import charges) instead of from Pakronics would save about "
          f"A${money(rs_au - rs_cn)} ({100 * (rs_au - rs_cn) / tot['Actuators']:.0f} % of that subsystem), at the cost of AU "
          "stock, local support and import paperwork.",
          f"- Plate area: {plate_area:.2f} m² net, {plate_area * NEST:.2f} m² with nesting, at an assumed A${PLATE_RATE:.0f}/m².", ""]
    for s in ORDER:
        rs = subs[s]
        L += [f"## {s}" + (" (not in the total)" if s.startswith("Tools") else ""), "",
              "| Item | Spec / use | Qty | Unit price (A$) | Line (A$) | Status | Price basis | Supplier / source | Cheaper option | Notes |",
              "|---|---|---|---|---|---|---|---|---|---|"]
        for r in rs:
            src = f"[{r['supplier'] or 'link'}]({r['source_url']})" if r["source_url"] else (r["supplier"] or "no source")
            L.append(f"| {r['item']} | {r['spec']} | {r['qty']:g} {r['unit']} | {r['unit_aud']:,.2f} | {r['line_aud']:,.2f} | {r['status']} | "
                     f"{r['price_basis']} | {src} | {r['cheaper_option']} | {r['notes']} |")
        L += ["", f"**Subtotal {s}: A${money(tot[s])}**", ""]
    L += ["## Plate list used for the plate estimate", "", "| Part | Qty | Blank (mm) |", "|---|---|---|"]
    for name, q, w_, h_ in plate_list():
        L.append(f"| {name} | {q} | {w_ * 1000:.0f} x {h_ * 1000:.0f} |")
    L.append("")
    OUT_MD.write_text("\n".join(L) + "\n")
    return total, tot


def main():
    models = actuator_rows()
    area = structure_rows()
    electrical_rows()
    safety_rows()
    compute_rows()
    gripper_rows()
    tool_rows()
    total, tot = write(models, area)
    print(f"wrote {OUT_MD.relative_to(PROJ)} and {OUT_CSV.relative_to(PROJ)}: {len(ROWS)} lines")
    for s in ORDER:
        print(f"  {s:32s} A${tot[s]:>10,.0f}")
    print(f"  {'TOTAL (excl. optional tools)':32s} A${total:>10,.0f}")
    return total


if __name__ == "__main__":
    main()
