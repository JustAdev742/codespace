Flat ground, 8 robots per speed (heading spread +-0.3 rad), no noise or randomisation. Achieved = distance along the heading from 4 s to 10 s / time, mean over the robots that did not fall. Joint speed: the fastest leg joint, as a fraction of its motor's no-load speed (over 100 %: driven faster than the motor's back-EMF matches the bus, so the drive loses torque control). RMS torque: the highest leg joint, as a fraction of its motor's continuous rating. **Within limits** needs both under 100 %.

| Commanded (m/s) | Achieved (m/s) | Slowest robot (m/s) | Falls | Peak joint speed | RMS torque | Within limits |
|---|---|---|---|---|---|---|
| 1.40 | 1.30 | 1.29 | 0% | 58% | 81% | yes |
| 2.20 | 2.08 | 1.93 | 0% | 55% | 86% | yes |
| 2.60 | 2.43 | 2.29 | 0% | 56% | 94% | yes |
| 3.00 | 2.65 | 2.03 | 0% | 59% | 104% | **no** |
| 3.40 | 2.64 | 1.96 | 0% | 72% | 114% | **no** |
| 3.80 | 2.24 | 1.80 | 0% | 93% | 120% | **no** |
| 4.20 | 2.61 | 2.03 | 0% | 103% | 118% | **no** |
