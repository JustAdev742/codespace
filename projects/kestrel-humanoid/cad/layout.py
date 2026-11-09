"""KESTREL K1 Mk II packaging constants (world frame, zero pose, millimetres).

x forward, y left, z up; origin on the ground between the feet. Joint positions follow
calc/kestrel/params.py (DIM + standing_heights); actuator envelopes follow
data/actuator_family.json (OD = motor OD + 12 mm housing) and the Mk II packaging notes:

  KA-130H hip pitch   KM-130x50-LC, 50 mm stack + liquid jacket   OD 142 x 96   (K1: 142 x 88)
  KA-130K knee        KM-130x50-LC, 50 mm stack + liquid jacket   OD 142 x 103  (K1: 142 x 95)
  KA-110P hip roll / waist pitch  RI115-PH + planetary             OD 127 x 80   (output 12x M5 on PCD 100)
  KA-90P  hip yaw / waist yaw / ankle  RI85-PH + planetary         OD 97 x 70
  KH-25   shoulder pitch / roll   KM-115x32 + C25 two-disc cycloid OD 127 x 82   (K1 strain-wave: 97 x 75)
  KH-20   shoulder yaw / elbow    KM-85x26 + C20 cycloid           OD 97 x 76
  KH-14   wrist yaw / neck        KM-50x20 + CSG-14 strain-wave    OD 62 x 60

Where the CAD has to move a component away from its params.py mass-budget centroid to clear a
Mk II envelope, the shift is listed in MOVED (used by docs/02 and the mass report).
"""

# ------------------------------------------------------------------ joint centres
HY, HZ, KZ, AZ = 105.0, 915.0, 495.0, 75.0      # hip half-width, hip, knee, ankle heights
HIP_YAW_Z = 990.0
WY, WP = 1015.0, 1085.0                          # waist yaw joint, waist pitch axis
SY, SZ, EZ, WRZ = 200.0, 1420.0, 1120.0, 860.0   # shoulder half-width / height, elbow, wrist
NY, NP = 1485.0, 1555.0                          # neck yaw joint, neck pitch axis
HEAD_TOP = 1750.0

# ------------------------------------------------------------------ actuator envelopes (OD, length)
ACT = {
    "KA-130H": (142.0, 96.0),
    "KA-130K": (142.0, 103.0),
    "KA-110P": (127.0, 80.0),
    "KA-90P": (97.0, 70.0),
    "KH-25": (127.0, 82.0),
    "KH-20": (97.0, 76.0),
    "KH-14": (62.0, 60.0),
}

# ------------------------------------------------------------------ Mk II placement
HIP_PITCH_Y = 109.0        # KA-130H centre (y 61..157): output face y 61 leaves 2.5 mm between the 10 mm thigh hip boss
                           # (12x M5 on PCD 105) and the KA-90P waist-yaw housing (r 48.5); lateral cap clears the forearm
KNEE_ACT_Z = HZ - 160.0    # 755: knee actuator axis (four-bar pivot A)
KNEE_ACT_Y = 88.5          # KA-130K centre: y 37..140, twin thigh plates outside its faces
ROD_Y = 159.0              # knee push-rod plane (crank outside the lateral thigh plate)
CRANK_Y = 149.5            # crank plates (actuator crank and shank crank)
HIP_ROLL_X = -132.0        # KA-110P centre (x -172..-92): output flange + bracket clear the KA-130H
SH_PITCH_Y = 91.0          # KH-25 shoulder pitch centre: y 50..132, so the KH-25 roll actuator (r 63.5) clears it
SH_ROLL_X = -45.0          # KH-25 shoulder roll centre (x -86..-4), output forward
SH_YAW_Z = 1306.0          # KH-20 shoulder yaw (z 1268..1344): 76 mm from the roll axis, clears the deltoid
WRIST_YAW_Z = 1032.0       # KH-14 wrist yaw (z 1002..1062): clears the elbow actuator (bottom z 1071.5)
WRIST_LIN_Z = 950.0        # KW-L2 pair (z 900..1000)
WAIST_YAW_Z = 980.0        # KA-90P waist yaw (z 945..1015): output face at the waist-yaw joint
ANKLE_A_Z, ANKLE_B_Z = 390.0, 290.0
BATT_X = (-125.0, 50.0)    # two hot-swap 16S4P packs side by side (2 x 4 x 8 P50B, axes fore-aft, 146 mm of cells in
                           # holders + 25 mm rear end cap: BMS, FET switch, 100 A fuse, cam lever + 4 mm connector face)
BATT_Z = (1160.0, 1345.0)
BATT_Y = (4.0, 102.0)

PACK_ENVELOPE = (175.0, 98.0, 185.0)   # x, y, z mm per pack (params.py still has 150 x 98 x 185, hold H12)
SPINE_X = 54.0             # front bulkhead (battery connector plate) centre, 6 mm
KNEE_BRG = (35.0, 72.0, 17.0)   # 7207 BE angular-contact pair (O arrangement) in the thigh-plate bosses, C0 20.8 kN each

# params.py centroid -> CAD position differences (mm), for the record
MOVED = {
    "shoulder-pitch actuator L/R": "y 135 -> 91 (KH-25 Mk II OD 127 roll actuator would intersect it)",
    "battery packs A/B": "x -30 -> -37.5, z 1215 -> 1252 (175 mm real pack length; bottoms clear the KA-110P waist-pitch housing)",
    "hip-pitch actuator": "y 105 -> 109 (Mk II +8 mm grows laterally; output face y 61 clears the waist-yaw housing)",
    "hip-roll actuator": "x -118 -> -132 (room for the PCD 100 output flange and the roll-pitch bracket)",
    "knee actuator": "y 105 -> 88.5 (crank + push-rod plane outside the lateral thigh plate)",
    "shoulder-yaw actuator": "z 1345 -> 1306 (clears the shoulder-roll housing and the deltoid shell)",
    "wrist-yaw actuator": "z 1085 -> 1032 (clears the elbow housing)",
    "ankle actuator A/B": "z 400/300 -> 390/290 (clear the shank upper fitting)",
}

# ------------------------------------------------------------------ materials and shell walls
PA12_DENSITY = 1.01e-3       # g/mm3, HP MJF PA12 (bulk part density)
PC_DENSITY = 1.20e-3         # polycarbonate visor / windows
TPU_DENSITY = 1.20e-3        # ankle boots
SHELL_EXTRA = 0.08           # bosses, inserts, isolators, primer + paint (fraction of net shell mass)
WALL = {"torso": 2.2, "head": 2.2, "pelvis": 2.2, "thigh": 2.0, "shank": 2.0, "arm": 1.8,
        "deltoid": 2.0, "glute": 2.0, "pack": 2.2, "foot": 2.4, "neck": 2.0, "boot": 1.6}
GAP = 1.0                    # panel gap

# params.py shell lines (kg) the CAD shells are checked against
SHELL_BUDGET = {
    "pelvis shells": 0.55, "torso shells (chest, back door, abdomen)": 1.60, "head shell + visor": 0.45,
    "upper-arm shells x2": 0.44, "forearm shells x2": 0.36, "thigh shells x2": 0.70, "shank shells x2": 0.56,
}
