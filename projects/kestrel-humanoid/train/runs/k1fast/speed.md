Flat ground, 8 robots per speed (heading spread +-0.3 rad), no noise or randomisation. Achieved = distance along the heading from 4 s to 10 s / time, mean over the robots that did not fall. Joint speed: the fastest leg joint, as a fraction of its motor's no-load speed (over 100 %: driven faster than the motor's back-EMF matches the bus, so the drive loses torque control). RMS torque: the highest leg joint, as a fraction of its motor's continuous rating. **Within limits** needs both under 100 %.

| Commanded (m/s) | Achieved (m/s) | Slowest robot (m/s) | Falls | Peak joint speed | RMS torque | Within limits |
|---|---|---|---|---|---|---|
| 0.60 | 0.65 | 0.65 | 0% | 46% | 49% | yes |
| 0.80 | 0.91 | 0.91 | 0% | 51% | 57% | yes |
| 1.00 | 1.12 | 1.11 | 0% | 57% | 67% | yes |
| 1.20 | 0.71 | 0.66 | 0% | 76% | 84% | yes |
| 1.40 | 0.57 | 0.28 | 12% | 117% | 84% | **no** |
