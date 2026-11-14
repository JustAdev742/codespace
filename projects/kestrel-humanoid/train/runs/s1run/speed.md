Flat ground, 8 robots per speed (heading spread +-0.3 rad), no noise or randomisation. Achieved = distance along the heading from 4 s to 10 s / time, mean over the robots that did not fall. Joint speed: the fastest leg joint, as a fraction of its motor's no-load speed (over 100 %: driven faster than the motor's back-EMF matches the bus, so the drive loses torque control). RMS torque: the highest leg joint, as a fraction of its motor's continuous rating. **Within limits** needs both under 100 %.

| Commanded (m/s) | Achieved (m/s) | Slowest robot (m/s) | Falls | Peak joint speed | RMS torque | Within limits |
|---|---|---|---|---|---|---|
| 1.00 | 1.08 | 1.07 | 0% | 56% | 90% | yes |
| 1.40 | 1.48 | 1.44 | 0% | 55% | 93% | yes |
| 1.80 | 1.84 | 1.80 | 0% | 66% | 100% | yes |
| 2.20 | 2.21 | 2.00 | 0% | 91% | 109% | **no** |
| 2.60 | 2.63 | 2.51 | 0% | 81% | 120% | **no** |
| 3.00 | 2.89 | 2.57 | 0% | 95% | 126% | **no** |
