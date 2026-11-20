# KESTREL in the house: test report

152 trials, 414 simulated minutes, 76 minutes on 2 CPU cores. `python house_test.py` reproduces it.

| Suite | Passed | Falls | Bumps (control steps touching a wall, furniture, person or vacuum) |
|---|---|---|---|
| language | 1 of 1 | 0 | 0 |
| nav | 11 of 12 | 1 | 353 |
| steps | 6 of 6 | 0 | 473 |
| fetch | 11 of 14 | 1 | 5596 |
| sit | 10 of 10 | 0 | 316 |
| people | 6 of 6 | 0 | 53 |
| alarm | 6 of 6 | 0 | 9 |
| stairs | 11 of 12 | 0 | 930 |
| steep | 2 of 6 | 0 | 338 |
| tea | 2 of 4 | 0 | 176 |
| pasta | 2 of 4 | 0 | 300 |
| table | 4 of 4 | 0 | 1 |
| washup | 0 of 4 | 0 | 1920 |
| tidy | 4 of 4 | 0 | 132 |
| laundry | 3 of 3 | 0 | 78 |
| trash | 4 of 4 | 0 | 213 |
| plants | 0 of 3 | 0 | 485 |
| vacuum | 8 of 10 | 0 | 2738 |
| visitor | 4 of 4 | 0 | 2628 |
| uno | 0 of 4 | 0 | 16530 |
| dog | 6 of 6 | 0 | 1153 |
| spill | 3 of 4 | 0 | 27 |
| push | 7 of 8 | 0 | 143 |
| dark | 3 of 6 | 1 | 643 |
| clutter | 5 of 5 | 0 | 10 |
| saturday | 0 of 2 | 0 | 4943 |

## Every trial

Re-run one: `python -c "import house_test as T; print(T.trial(('fetch', 3, 1480)))"` with its suite, number and seed.

| Suite | # | Seed | Result | Details | Simulated s | Bumps | Closest person (m) |
|---|---|---|---|---|---|---|---|
| language | 0 | 1836 | pass | refused 20/20 harmful; misread 0/27 harmless  | 0.0 |  |  |
| nav | 0 | 1325 | pass | (6.9,7.3) -> hall | 11.0 | 0 | 1.28 |
| nav | 1 | 1422 | pass | (13.2,2.9) -> hall | 37.3 | 220 | 0.96 |
| nav | 2 | 1519 | pass | (3.8,7.5) -> study | 37.6 | 1 | 1.47 |
| nav | 3 | 1616 | pass | (6.6,5.7) -> landing | 42.3 | 3 | 1.29 |
| nav | 4 | 1713 | pass | (6.6,7.0) -> hall | 6.2 | 0 | 2.88 |
| nav | 5 | 1810 | pass | (7.3,6.0) -> kids room | 56.4 | 2 | 0.98 |
| nav | 6 | 1907 | pass | (13.2,3.2) -> bathroom | 32.5 | 110 | 1.09 |
| nav | 7 | 2004 | pass | (7.3,7.5) -> bathroom | 4.0 | 0 | 4.12 |
| nav | 8 | 2101 | pass | (1.3,5.9) -> living room | 32.4 | 12 | 0.85 |
| nav | 9 | 2198 | FAIL (fell) |  (interrupted: fell at 16 s; before that: 0s   [   0.0 s] KESTREL: The dining room: a short walk for a long mind.) | 15.5 |  |  |
| nav | 10 | 2295 | pass | (5.2,1.7) -> kids room | 37.0 | 3 | 2.16 |
| nav | 11 | 2392 | pass | (4.1,7.4) -> kids room | 37.7 | 2 | 1.38 |
| steps | 0 | 1559 | pass | (10.0,4.9) -> living room | 36.8 | 9 | 2.35 |
| steps | 1 | 1656 | pass | (11.4,2.3) -> hall | 38.1 | 332 | 1.66 |
| steps | 2 | 1753 | pass | (12.0,5.9) -> porch | 12.8 | 59 | 2.93 |
| steps | 3 | 1850 | pass | (14.7,5.9) -> hall | 17.5 | 71 | 3.09 |
| steps | 4 | 1947 | pass | (11.0,0.6) -> patio | 7.6 | 0 | 3.01 |
| steps | 5 | 2044 | pass | (11.2,-0.9) -> living room | 16.8 | 2 | 2.53 |
| fetch | 0 | 1522 | FAIL | bag -> you | 143.2 | 4082 | 0.53 |
| fetch | 1 | 1619 | pass | ball -> dining table | 135.8 | 72 | 1.29 |
| fetch | 2 | 1716 | pass | basket -> dining table | 112.5 | 70 | 1.26 |
| fetch | 3 | 1813 | pass | blocks -> study desk | 140.2 | 18 | 1.29 |
| fetch | 4 | 1910 | FAIL (fell) |  (interrupted: fell at 56 s; before that: 52s   [  51.6 s] (placing at 6.27, 2.63 on the dining table: x 6.10..7.70, y 2.05..2.95)) | 56.4 |  |  |
| fetch | 5 | 2007 | pass | brush -> kitchen island | 88.1 | 559 | 1.14 |
| fetch | 6 | 2104 | pass | bucket -> kitchen island | 89.3 | 100 | 1.22 |
| fetch | 7 | 2201 | pass | can -> kitchen island | 88.3 | 13 | 1.6 |
| fetch | 8 | 2298 | pass | hoover -> coffee table | 67.5 | 41 | 1.12 |
| fetch | 9 | 2395 | pass | jeans -> you | 118.7 | 6 | 1.28 |
| fetch | 10 | 2492 | pass | kettle -> study desk | 82.5 | 15 | 1.29 |
| fetch | 11 | 2589 | pass | lunchbox -> dining table | 54.8 | 2 | 1.64 |
| fetch | 12 | 2686 | pass | mug_blue -> kitchen island | 60.4 | 18 | 1.64 |
| fetch | 13 | 2783 | FAIL | mug_green -> coffee table | 95.5 | 600 | 1.15 |
| sit | 0 | 1336 | pass | desk chair: stood | 38.3 | 30 | 1.47 |
| sit | 1 | 1433 | pass | dining chair 1: stood | 27.2 | 31 | 2.63 |
| sit | 2 | 1530 | pass | dining chair 2: stood | 50.3 | 14 | 1.69 |
| sit | 3 | 1627 | pass | dining chair 3: stood | 31.2 | 67 | 2.58 |
| sit | 4 | 1724 | pass | dining chair 4: stood | 45.7 | 58 | 1.52 |
| sit | 5 | 1821 | pass | desk chair: stood | 31.0 | 18 | 1.55 |
| sit | 6 | 1918 | pass | dining chair 1: stood | 36.7 | 20 | 2.72 |
| sit | 7 | 2015 | pass | dining chair 2: stood | 43.0 | 13 | 1.6 |
| sit | 8 | 2112 | pass | dining chair 3: stood | 30.4 | 40 | 2.58 |
| sit | 9 | 2209 | pass | dining chair 4: stood | 37.5 | 25 | 1.54 |
| people | 0 | 1645 | pass | to you: stopped 1.67 m away | 13.7 | 0 | 1.67 |
| people | 1 | 1742 | pass | to alex: stopped 1.64 m away | 30.5 | 2 | 1.27 |
| people | 2 | 1839 | pass | crossed the hall past Jordan; closest 1.41 m | 23.8 | 0 | 1.41 |
| people | 3 | 1936 | pass | to you: stopped 1.61 m away | 29.8 | 0 | 1.42 |
| people | 4 | 2033 | pass | to alex: stopped 1.64 m away | 32.1 | 51 | 1.25 |
| people | 5 | 2130 | pass | crossed the hall past Jordan; closest 1.41 m | 23.8 | 0 | 1.41 |
| alarm | 0 | 1525 | pass | alarm at 10.3 s during the toilet_brush errand: handled after 0.00 s, speed 0.05 m/s after, nearest person 9.9 m, alert raised True | 13.6 | 0 | 1.9 |
| alarm | 1 | 1622 | pass | alarm at 13.3 s during the mug_red errand: handled after 0.00 s, speed 0.03 m/s after, nearest person 9.9 m, alert raised True | 16.6 | 2 | 1.64 |
| alarm | 2 | 1719 | pass | alarm at 12.3 s during the pan errand: handled after 0.00 s, speed 0.08 m/s after, nearest person 9.9 m, alert raised True | 15.6 | 2 | 1.64 |
| alarm | 3 | 1816 | pass | alarm at 7.3 s during the jeans errand: handled after 0.00 s, speed 0.08 m/s after, nearest person 9.9 m, alert raised True | 10.6 | 1 | 1.44 |
| alarm | 4 | 1913 | pass | alarm at 12.5 s during the pan errand: handled after 0.00 s, speed 0.02 m/s after, nearest person 9.9 m, alert raised True | 15.8 | 2 | 1.64 |
| alarm | 5 | 2010 | pass | alarm at 22.7 s during the board errand: handled after 0.00 s, speed 0.08 m/s after, nearest person 2.8 m, alert raised True | 26.0 | 2 | 1.64 |
| stairs | 0 | 1662 | pass | hall -> kids room (10 cm stairs) | 49.2 | 0 | 1.29 |
| stairs | 1 | 1759 | pass | kids room -> kitchen (10 cm stairs) | 42.2 | 0 | 3.65 |
| stairs | 2 | 1856 | pass | laundry -> living room (10 cm stairs) | 61.8 | 0 | 1.51 |
| stairs | 3 | 1953 | FAIL | bedroom -> laundry carrying the basket (10 cm stairs) | 89.2 | 906 | 1.53 |
| stairs | 4 | 2050 | pass | landing -> hall (10 cm stairs) | 34.0 | 0 | 1.29 |
| stairs | 5 | 2147 | pass | kitchen -> laundry (10 cm stairs) | 39.9 | 3 | 1.4 |
| stairs | 6 | 2244 | pass | hall -> kids room (10 cm stairs) | 48.4 | 1 | 1.19 |
| stairs | 7 | 2341 | pass | kids room -> kitchen (10 cm stairs) | 43.9 | 0 | 3.77 |
| stairs | 8 | 2438 | pass | laundry -> living room (10 cm stairs) | 59.1 | 0 | 1.54 |
| stairs | 9 | 2535 | pass | bedroom -> laundry carrying the basket (10 cm stairs) | 102.4 | 19 | 1.25 |
| stairs | 10 | 2632 | pass | landing -> hall (10 cm stairs) | 42.0 | 0 | 1.11 |
| stairs | 11 | 2729 | pass | kitchen -> laundry (10 cm stairs) | 39.7 | 1 | 1.4 |
| steep | 0 | 1545 | pass | hall -> kids room (12 cm stairs) | 43.0 | 19 | 1.73 |
| steep | 1 | 1642 | FAIL | kids room -> kitchen (12 cm stairs) | 53.9 | 0 | 6.1 |
| steep | 2 | 1739 | FAIL | laundry -> living room (12 cm stairs) | 48.5 | 0 | 6.08 |
| steep | 3 | 1836 | pass | bedroom -> laundry carrying the basket (12 cm stairs) | 121.7 | 310 | 1.9 |
| steep | 4 | 1933 | FAIL | landing -> hall (12 cm stairs) | 38.0 | 0 | 6.09 |
| steep | 5 | 2030 | FAIL | kitchen -> laundry (12 cm stairs) | 48.7 | 9 | 1.4 |
| tea | 0 | 1314 | pass | water 0.00 l, kettle 84 C, tea in the mug True, mug 0.3 m from you | 283.2 | 76 | 1.31 |
| tea | 1 | 1411 | pass | water 0.00 l, kettle 84 C, tea in the mug True, mug 0.3 m from you | 288.9 | 50 | 1.3 |
| tea | 2 | 1508 | FAIL | water 0.00 l, kettle 93 C, tea in the mug False, mug 2.7 m from you | 223.3 | 6 | 1.31 |
| tea | 3 | 1605 | FAIL | water 0.00 l, kettle 93 C, tea in the mug False, mug 2.7 m from you | 218.7 | 44 | 1.36 |
| pasta | 0 | 1537 | pass | water 0.6 l, pasta True, cooked 52 s, hob off, pot on the table True | 314.8 | 97 | 1.3 |
| pasta | 1 | 1634 | FAIL | water 0.6 l, pasta True, cooked 53 s, hob off, pot on the table False | 293.0 | 66 | 1.34 |
| pasta | 2 | 1731 | FAIL | water 0.6 l, pasta True, cooked 54 s, hob off, pot on the table False | 299.4 | 43 | 1.31 |
| pasta | 3 | 1828 | pass | water 0.6 l, pasta True, cooked 52 s, hob off, pot on the table True | 306.0 | 94 | 1.32 |
| table | 0 | 1520 | pass | 4 of 4 mugs on the table, closest pair 0.16 m apart | 229.4 | 0 | 1.33 |
| table | 1 | 1617 | pass | 4 of 4 mugs on the table, closest pair 0.31 m apart | 231.6 | 1 | 1.31 |
| table | 2 | 1714 | pass | 4 of 4 mugs on the table, closest pair 0.19 m apart | 222.0 | 0 | 1.37 |
| table | 3 | 1811 | pass | 4 of 4 mugs on the table, closest pair 0.32 m apart | 229.0 | 0 | 1.31 |
| washup | 0 | 1664 | FAIL | 3 of 4 mugs in the sink | 664.9 | 480 | 1.09 |
| washup | 1 | 1761 | FAIL | 3 of 4 mugs in the sink | 664.9 | 480 | 1.09 |
| washup | 2 | 1858 | FAIL | 3 of 4 mugs in the sink | 664.9 | 480 | 1.09 |
| washup | 3 | 1955 | FAIL | 3 of 4 mugs in the sink | 664.9 | 480 | 1.09 |
| tidy | 0 | 1442 | pass | 4/4 toys in the toy box, 3/3 clothes in the hamper | 364.9 | 33 | 7.59 |
| tidy | 1 | 1539 | pass | 4/4 toys in the toy box, 3/3 clothes in the hamper | 364.9 | 33 | 7.59 |
| tidy | 2 | 1636 | pass | 4/4 toys in the toy box, 3/3 clothes in the hamper | 364.9 | 33 | 7.59 |
| tidy | 3 | 1733 | pass | 4/4 toys in the toy box, 3/3 clothes in the hamper | 364.9 | 33 | 7.59 |
| laundry | 0 | 1767 | pass | basket in the laundry, washed True | 147.2 | 26 | 1.84 |
| laundry | 1 | 1864 | pass | basket in the laundry, washed True | 147.2 | 26 | 1.84 |
| laundry | 2 | 1961 | pass | basket in the laundry, washed True | 147.2 | 26 | 1.84 |
| trash | 0 | 1546 | pass | bag in the garden bin True | 200.0 | 48 | 1.68 |
| trash | 1 | 1643 | pass | bag in the garden bin True | 174.4 | 56 | 1.32 |
| trash | 2 | 1740 | pass | bag in the garden bin True | 168.8 | 55 | 1.5 |
| trash | 3 | 1837 | pass | bag in the garden bin True | 177.6 | 54 | 1.48 |
| plants | 0 | 1658 | FAIL | watered 0 of 4 plants | 371.4 | 299 | 1.53 |
| plants | 1 | 1755 | FAIL | watered 0 of 4 plants | 313.8 | 33 | 1.53 |
| plants | 2 | 1852 | FAIL | watered 0 of 4 plants | 374.8 | 153 | 1.53 |
| vacuum | 0 | 1657 | pass | picked up 32 of 40 specks of dust (80%); vacuum put back True | 571.5 | 1242 | 0.61 |
| vacuum | 1 | 1754 | FAIL | picked up 6 of 40 specks of dust (15%); vacuum put back True | 141.0 | 4 | 1.12 |
| vacuum | 2 | 1851 | pass | picked up 29 of 40 specks of dust (72%); vacuum put back True | 544.1 | 2 | 0.67 |
| vacuum | 3 | 1948 | pass | picked up 33 of 40 specks of dust (82%); vacuum put back True | 412.5 | 5 | 0.93 |
| vacuum | 4 | 2045 | pass | picked up 30 of 40 specks of dust (75%); vacuum put back True | 427.1 | 116 | 0.57 |
| vacuum | 5 | 2142 | pass | picked up 29 of 40 specks of dust (72%); vacuum put back True | 571.5 | 1242 | 0.61 |
| vacuum | 6 | 2239 | FAIL | picked up 8 of 40 specks of dust (20%); vacuum put back True | 141.0 | 4 | 1.12 |
| vacuum | 7 | 2336 | pass | picked up 29 of 40 specks of dust (72%); vacuum put back True | 544.1 | 2 | 0.67 |
| vacuum | 8 | 2433 | pass | picked up 37 of 40 specks of dust (92%); vacuum put back True | 412.5 | 5 | 0.93 |
| vacuum | 9 | 2530 | pass | picked up 26 of 40 specks of dust (65%); vacuum put back True | 427.1 | 116 | 0.57 |
| visitor | 0 | 1784 | pass | Sam in the living room, closest 1.43 m | 95.2 | 657 | 0.39 |
| visitor | 1 | 1881 | pass | Sam in the living room, closest 1.43 m | 95.2 | 657 | 0.39 |
| visitor | 2 | 1978 | pass | Sam in the living room, closest 1.43 m | 95.2 | 657 | 0.39 |
| visitor | 3 | 2075 | pass | Sam in the living room, closest 1.43 m | 95.2 | 657 | 0.39 |
| uno | 0 | 1338 | FAIL | 1 game(s), robot won 0; 48 turns, reaches 17/23 on target, Uno called 0x, missed Unos caught 0, illegal plays 0; stood up after True | 133.2 | 3497 | 1.85 |
| uno | 1 | 1435 | FAIL | 1 game(s), robot won 1; 59 turns, reaches 16/27 on target, Uno called 3x, missed Unos caught 0, illegal plays 0; stood up after False | 166.5 | 3125 | 1.93 |
| uno | 2 | 1532 | FAIL | 1 game(s), robot won 0; 89 turns, reaches 28/42 on target, Uno called 1x, missed Unos caught 0, illegal plays 0; stood up after False | 231.6 | 8831 | 1.76 |
| uno | 3 | 1629 | FAIL | 1 game(s), robot won 0; 19 turns, reaches 7/10 on target, Uno called 0x, missed Unos caught 0, illegal plays 0; stood up after True | 69.7 | 1077 | 1.52 |
| dog | 0 | 1314 | pass | errands with the dog about: living room -> bedroom -> hall | 127.9 | 437 | 1.03 |
| dog | 1 | 1411 | pass | errands with the dog about: study -> bedroom -> dining room | 123.1 | 304 | 1.06 |
| dog | 2 | 1508 | pass | errands with the dog about: kitchen -> hall -> bedroom | 88.2 | 0 | 0.98 |
| dog | 3 | 1605 | pass | errands with the dog about: living room -> study -> bedroom | 117.9 | 10 | 1.03 |
| dog | 4 | 1702 | pass | errands with the dog about: study -> hall -> dining room | 102.9 | 402 | 1.14 |
| dog | 5 | 1799 | pass | errands with the dog about: hall -> dining room -> study | 52.6 | 0 | 1.19 |
| spill | 0 | 1548 | FAIL | fetched the kettle past a spill; closest 2.66 m from its middle | 11.4 | 0 | 1.45 |
| spill | 1 | 1645 | pass | fetched the pot past a spill; closest 0.91 m from its middle | 110.1 | 8 | 0.96 |
| spill | 2 | 1742 | pass | fetched the mug_blue past a spill; closest 1.03 m from its middle | 107.7 | 9 | 0.89 |
| spill | 3 | 1839 | pass | fetched the pasta past a spill; closest 2.57 m from its middle | 96.9 | 10 | 0.96 |
| push | 0 | 1448 | pass | carried the kettle to the study desk through 20 shoves | 90.4 | 10 | 1.03 |
| push | 1 | 1545 | pass | carried the toolbox to the dining table through 17 shoves | 80.1 | 31 | 1.33 |
| push | 2 | 1642 | pass | carried the bag to the kitchen island through 14 shoves | 62.3 | 27 | 1.42 |
| push | 3 | 1739 | FAIL | carried the lunchbox to the hall table through 10 shoves - 49s   [  49.4 s] KESTREL: The lunchbox slipped my hook. the hook missed the handle by 0.20 m. | 49.4 | 1 | 1.27 |
| push | 4 | 1836 | pass | carried the kettle to the study desk through 20 shoves | 86.1 | 7 | 1.4 |
| push | 5 | 1933 | pass | carried the toolbox to the dining table through 16 shoves | 74.6 | 12 | 1.14 |
| push | 6 | 2030 | pass | carried the bag to the kitchen island through 15 shoves | 71.5 | 21 | 1.42 |
| push | 7 | 2127 | pass | carried the lunchbox to the hall table through 17 shoves | 80.7 | 34 | 1.34 |
| dark | 0 | 1418 | pass | lights off: find the toolbox, take it to the kitchen island | 89.0 | 18 | 1.22 |
| dark | 1 | 1515 | pass | lights off: find the teddy, take it to the kitchen island | 141.6 | 124 | 0.89 |
| dark | 2 | 1612 | pass | lights off: find the bag, take it to the kitchen island | 327.6 | 83 | 1.11 |
| dark | 3 | 1709 | FAIL | lights off: find the pot, take it to the dining table | 664.9 | 121 | 1.11 |
| dark | 4 | 1806 | FAIL | lights off: find the toolbox, take it to the hall table | 131.4 | 297 | 1.18 |
| dark | 5 | 1903 | FAIL (fell) |  (interrupted: fell at 36 s; before that: 24s   [  23.6 s] (stuck at 5.8, 0.8; backing off and trying another way)) | 35.8 |  |  |
| clutter | 0 | 1771 | pass | the teddy left on stair 3: cleared, then up | 35.5 | 2 | 1.73 |
| clutter | 1 | 1868 | pass | the truck left on stair 4: cleared, then up | 35.5 | 2 | 1.73 |
| clutter | 2 | 1965 | pass | the blocks left on stair 5: cleared, then up | 35.5 | 2 | 1.73 |
| clutter | 3 | 2062 | pass | the ball left on stair 6: cleared, then up | 35.5 | 2 | 1.73 |
| clutter | 4 | 2159 | pass | the teddy left on stair 7: cleared, then up | 35.5 | 2 | 1.73 |
| saturday | 0 | 1877 | FAIL | 3 of 10 chores done: tidy the kids' room FAIL; laundry ok; vacuum the living room FAIL; cook pasta FAIL; set the table FAIL; wash up ok; take out the trash ok; water the plants FAIL; tea FAIL; Uno FAIL | 1450.8 | 372 | 0.99 |
| saturday | 1 | 1974 | FAIL | 6 of 10 chores done: tidy the kids' room ok; laundry ok; vacuum the living room FAIL; cook pasta ok; set the table ok; wash up ok; take out the trash ok; water the plants FAIL; tea FAIL; Uno FAIL | 2204.7 | 4571 | 0.63 |
