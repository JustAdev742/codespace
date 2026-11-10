Flat ground, 8 robots per speed (heading spread +-0.3 rad), no noise or randomisation. Achieved = distance along the heading from 4 s to 10 s / time, mean over the robots that did not fall. Joint speed: the fastest leg joint, as a fraction of its motor's no-load speed (over 100 %: driven faster than the motor's back-EMF matches the bus, so the drive loses torque control). RMS torque: the highest leg joint, as a fraction of its motor's continuous rating. **Within limits** needs both under 100 %.

| Commanded (m/s) | Achieved (m/s) | Slowest robot (m/s) | Falls | Peak joint speed | RMS torque | Within limits |
|---|---|---|---|---|---|---|
| 0.60 | 0.68 | 0.68 | 0% | 45% | 43% | yes |
| 0.80 | 0.90 | 0.89 | 0% | 58% | 51% | yes |
| 1.00 | 1.10 | 1.07 | 0% | 69% | 58% | yes |
| 1.20 | 1.31 | 1.29 | 0% | 75% | 65% | yes |
| 1.40 | 1.59 | 1.57 | 0% | 105% | 80% | **no** |
