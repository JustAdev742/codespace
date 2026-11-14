Flat ground, 8 robots per speed (heading spread +-0.3 rad), no noise or randomisation. Achieved = distance along the heading from 4 s to 10 s / time, mean over the robots that did not fall. Joint speed: the fastest leg joint, as a fraction of its motor's no-load speed (over 100 %: driven faster than the motor's back-EMF matches the bus, so the drive loses torque control). RMS torque: the highest leg joint, as a fraction of its motor's continuous rating. **Within limits** needs both under 100 %.

| Commanded (m/s) | Achieved (m/s) | Slowest robot (m/s) | Falls | Peak joint speed | RMS torque | Within limits |
|---|---|---|---|---|---|---|
| 1.40 | 1.17 | 1.14 | 0% | 61% | 82% | yes |
| 2.20 | 1.49 | 1.44 | 25% | 136% | 95% | **no** |
| 2.60 | 1.46 | 1.40 | 50% | 111% | 103% | **no** |
| 3.00 | 1.26 | 1.26 | 88% | 114% | 111% | **no** |
| 3.40 | nan | nan | 100% | 120% | 117% | **no** |
| 3.80 | nan | nan | 100% | 117% | 122% | **no** |
| 4.20 | nan | nan | 100% | 132% | 129% | **no** |
