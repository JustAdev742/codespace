# KESTREL in the house: test report

152 trials, 369 simulated minutes, 32 minutes on 3 CPU cores. `python house_test.py` reproduces it.

| Suite | Passed | Falls | Bumps (control steps touching a wall, furniture, person or vacuum) |
|---|---|---|---|
| language | 1 of 1 | 0 | 0 |
| nav | 10 of 12 | 1 | 75 |
| steps | 6 of 6 | 0 | 527 |
| fetch | 9 of 14 | 1 | 1501 |
| sit | 9 of 10 | 1 | 246 |
| people | 6 of 6 | 0 | 15 |
| alarm | 6 of 6 | 0 | 8 |
| stairs | 12 of 12 | 0 | 129 |
| steep | 1 of 6 | 1 | 41 |
| tea | 0 of 4 | 0 | 32 |
| pasta | 0 of 4 | 4 | 0 |
| table | 4 of 4 | 0 | 12 |
| washup | 4 of 4 | 0 | 144 |
| tidy | 0 of 4 | 4 | 0 |
| laundry | 3 of 3 | 0 | 36 |
| trash | 4 of 4 | 0 | 1408 |
| plants | 0 of 3 | 0 | 15 |
| vacuum | 6 of 10 | 2 | 1088 |
| visitor | 4 of 4 | 0 | 448 |
| uno | 1 of 4 | 2 | 7788 |
| dog | 6 of 6 | 0 | 656 |
| spill | 3 of 4 | 0 | 19 |
| push | 6 of 8 | 0 | 184 |
| dark | 1 of 6 | 2 | 369 |
| clutter | 5 of 5 | 0 | 0 |
| saturday | 0 of 2 | 0 | 640 |

## Every trial

Re-run one: `python -c "import house_test as T; print(T.trial(('fetch', 3, 1480)))"` with its suite, number and seed.

| Suite | # | Seed | Result | Details | Simulated s | Bumps | Closest person (m) |
|---|---|---|---|---|---|---|---|
| language | 0 | 2836 | pass | refused 20/20 harmful; misread 0/27 harmless  | 0.0 |  |  |
| nav | 0 | 2325 | pass | (9.7,0.9) -> kids room | 50.9 | 1 | 1.6 |
| nav | 1 | 2422 | pass | (5.5,1.8) -> kids room | 39.7 | 11 | 2.45 |
| nav | 2 | 2519 | pass | (5.8,1.6) -> landing | 28.0 | 7 | 2.49 |
| nav | 3 | 2616 | pass | (6.6,7.6) -> kids room | 49.4 | 40 | 1.28 |
| nav | 4 | 2713 | pass | (6.7,8.5) -> hall | 10.2 | 0 | 1.29 |
| nav | 5 | 2810 | pass | (7.9,5.2) -> hall | 3.7 | 0 | 2.53 |
| nav | 6 | 2907 | pass | (13.2,3.4) -> landing | 56.8 | 0 | 1.61 |
| nav | 7 | 3004 | FAIL | (0.8,8.8) -> kids room | 24.9 | 6 | 2.07 |
| nav | 8 | 3101 | pass | (4.2,5.9) -> laundry | 34.3 | 10 | 0.95 |
| nav | 9 | 3198 | pass | (8.4,0.9) -> hall | 19.9 | 0 | 1.28 |
| nav | 10 | 3295 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| nav | 11 | 3392 | pass | (12.5,0.8) -> dining room | 24.7 | 0 | 1.38 |
| steps | 0 | 2559 | pass | (10.0,4.9) -> living room | 71.5 | 112 | 1.49 |
| steps | 1 | 2656 | pass | (11.4,2.3) -> hall | 34.1 | 284 | 1.67 |
| steps | 2 | 2753 | pass | (12.0,5.9) -> porch | 9.9 | 69 | 3.06 |
| steps | 3 | 2850 | pass | (14.7,5.9) -> hall | 13.9 | 62 | 3.09 |
| steps | 4 | 2947 | pass | (11.0,0.6) -> patio | 3.6 | 0 | 3.01 |
| steps | 5 | 3044 | pass | (11.2,-0.9) -> living room | 17.3 | 0 | 2.7 |
| fetch | 0 | 2522 | pass | bag -> study desk | 60.4 | 96 | 0.47 |
| fetch | 1 | 2619 | FAIL | ball -> coffee table | 573.8 | 170 | 0.51 |
| fetch | 2 | 2716 | pass | basket -> dining table | 119.0 | 12 | 0.97 |
| fetch | 3 | 2813 | pass | blocks -> coffee table | 588.1 | 142 | 0.57 |
| fetch | 4 | 2910 | pass | bucket -> dining table | 73.6 | 2 | 1.43 |
| fetch | 5 | 3007 | pass | can -> you | 65.6 | 1 | 1.67 |
| fetch | 6 | 3104 | FAIL | hoover -> dining table | 577.3 | 159 | 0.57 |
| fetch | 7 | 3201 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| fetch | 8 | 3298 | pass | kettle -> study desk | 93.2 | 84 | 1.11 |
| fetch | 9 | 3395 | pass | lunchbox -> hall table | 72.8 | 28 | 0.99 |
| fetch | 10 | 3492 | pass | mug_blue -> kitchen island | 54.5 | 25 | 1.64 |
| fetch | 11 | 3589 | FAIL | mug_green -> hall table | 94.4 | 147 | 0.83 |
| fetch | 12 | 3686 | pass | mug_red -> study desk | 84.2 | 51 | 1.29 |
| fetch | 13 | 3783 | FAIL | mug_yellow -> coffee table | 80.2 | 584 | 1.58 |
| sit | 0 | 2336 | pass | desk chair: stood | 42.2 | 29 | 1.57 |
| sit | 1 | 2433 | pass | dining chair 1: stood | 47.0 | 23 | 2.63 |
| sit | 2 | 2530 | pass | dining chair 2: stood | 40.3 | 46 | 2.18 |
| sit | 3 | 2627 | pass | dining chair 3: stood | 31.0 | 16 | 2.5 |
| sit | 4 | 2724 | pass | dining chair 4: stood | 27.1 | 31 | 1.53 |
| sit | 5 | 2821 | pass | desk chair: stood | 44.7 | 35 | 1.6 |
| sit | 6 | 2918 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| sit | 7 | 3015 | pass | dining chair 2: stood | 35.8 | 16 | 2.18 |
| sit | 8 | 3112 | pass | dining chair 3: stood | 36.6 | 20 | 1.52 |
| sit | 9 | 3209 | pass | dining chair 4: stood | 34.3 | 30 | 1.79 |
| people | 0 | 2645 | pass | to you: stopped 1.57 m away | 10.0 | 0 | 1.55 |
| people | 1 | 2742 | pass | to alex: stopped 1.66 m away | 25.6 | 0 | 1.21 |
| people | 2 | 2839 | pass | crossed the hall past Jordan; closest 1.41 m | 22.6 | 0 | 1.41 |
| people | 3 | 2936 | pass | to you: stopped 1.68 m away | 7.5 | 0 | 1.67 |
| people | 4 | 3033 | pass | to alex: stopped 1.63 m away | 33.9 | 15 | 1.28 |
| people | 5 | 3130 | pass | crossed the hall past Jordan; closest 1.41 m | 22.6 | 0 | 1.41 |
| alarm | 0 | 2525 | pass | alarm at 21.3 s during the lunchbox errand: handled after 0.00 s, speed 0.04 m/s after, nearest person 2.7 m, alert raised True | 24.6 | 2 | 1.64 |
| alarm | 1 | 2622 | pass | alarm at 11.8 s during the kettle errand: handled after 0.00 s, speed 0.03 m/s after, nearest person 9.9 m, alert raised True | 15.1 | 2 | 1.64 |
| alarm | 2 | 2719 | pass | alarm at 15.5 s during the trash errand: handled after 0.00 s, speed 0.03 m/s after, nearest person 1.2 m, alert raised True | 20.8 | 0 | 1.14 |
| alarm | 3 | 2816 | pass | alarm at 8.5 s during the pasta errand: handled after 0.00 s, speed 0.04 m/s after, nearest person 3.4 m, alert raised True | 11.8 | 2 | 1.64 |
| alarm | 4 | 2913 | pass | alarm at 6.0 s during the lunchbox errand: handled after 0.00 s, speed 0.05 m/s after, nearest person 2.8 m, alert raised True | 9.3 | 2 | 1.55 |
| alarm | 5 | 3010 | pass | alarm at 24.8 s during the trash errand: handled after 0.00 s, speed 0.08 m/s after, nearest person 2.3 m, alert raised True | 28.1 | 0 | 1.16 |
| stairs | 0 | 2662 | pass | hall -> kids room (10 cm stairs) | 50.1 | 15 | 1.29 |
| stairs | 1 | 2759 | pass | kids room -> kitchen (10 cm stairs) | 38.1 | 0 | 2.35 |
| stairs | 2 | 2856 | pass | laundry -> living room (10 cm stairs) | 58.0 | 0 | 1.54 |
| stairs | 3 | 2953 | pass | bedroom -> laundry carrying the basket (10 cm stairs) | 93.2 | 18 | 1.41 |
| stairs | 4 | 3050 | pass | landing -> hall (10 cm stairs) | 38.3 | 0 | 1.28 |
| stairs | 5 | 3147 | pass | kitchen -> laundry (10 cm stairs) | 41.9 | 2 | 1.41 |
| stairs | 6 | 3244 | pass | hall -> kids room (10 cm stairs) | 52.8 | 20 | 1.29 |
| stairs | 7 | 3341 | pass | kids room -> kitchen (10 cm stairs) | 39.9 | 0 | 3.24 |
| stairs | 8 | 3438 | pass | laundry -> living room (10 cm stairs) | 60.3 | 0 | 1.52 |
| stairs | 9 | 3535 | pass | bedroom -> laundry carrying the basket (10 cm stairs) | 99.5 | 74 | 1.0 |
| stairs | 10 | 3632 | pass | landing -> hall (10 cm stairs) | 40.1 | 0 | 1.19 |
| stairs | 11 | 3729 | pass | kitchen -> laundry (10 cm stairs) | 37.2 | 0 | 1.41 |
| steep | 0 | 2545 | FAIL | hall -> kids room (12 cm stairs) | 38.7 | 17 | 1.75 |
| steep | 1 | 2642 | FAIL | kids room -> kitchen (12 cm stairs) | 46.1 | 0 | 6.08 |
| steep | 2 | 2739 | FAIL | laundry -> living room (12 cm stairs) | 48.8 | 0 | 6.11 |
| steep | 3 | 2836 | pass | bedroom -> laundry carrying the basket (12 cm stairs) | 94.6 | 24 | 1.89 |
| steep | 4 | 2933 | FAIL | landing -> hall (12 cm stairs) | 37.7 | 0 | 6.11 |
| steep | 5 | 3030 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| tea | 0 | 2314 | FAIL | water 0.30 l, kettle 20 C, tea in the mug False, mug 8.5 m from you | 195.1 | 8 | 1.33 |
| tea | 1 | 2411 | FAIL | water 0.30 l, kettle 20 C, tea in the mug False, mug 8.5 m from you | 195.1 | 8 | 1.33 |
| tea | 2 | 2508 | FAIL | water 0.30 l, kettle 20 C, tea in the mug False, mug 8.5 m from you | 195.1 | 8 | 1.33 |
| tea | 3 | 2605 | FAIL | water 0.30 l, kettle 20 C, tea in the mug False, mug 8.5 m from you | 195.1 | 8 | 1.33 |
| pasta | 0 | 2537 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| pasta | 1 | 2634 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| pasta | 2 | 2731 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| pasta | 3 | 2828 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| table | 0 | 2520 | pass | 4 of 4 mugs on the table, closest pair 0.25 m apart | 197.6 | 3 | 1.33 |
| table | 1 | 2617 | pass | 4 of 4 mugs on the table, closest pair 0.25 m apart | 197.6 | 3 | 1.33 |
| table | 2 | 2714 | pass | 4 of 4 mugs on the table, closest pair 0.25 m apart | 197.6 | 3 | 1.33 |
| table | 3 | 2811 | pass | 4 of 4 mugs on the table, closest pair 0.25 m apart | 197.6 | 3 | 1.33 |
| washup | 0 | 2664 | pass | 4 of 4 mugs in the sink | 893.0 | 36 | 0.99 |
| washup | 1 | 2761 | pass | 4 of 4 mugs in the sink | 893.0 | 36 | 0.99 |
| washup | 2 | 2858 | pass | 4 of 4 mugs in the sink | 893.0 | 36 | 0.99 |
| washup | 3 | 2955 | pass | 4 of 4 mugs in the sink | 893.0 | 36 | 0.99 |
| tidy | 0 | 2442 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| tidy | 1 | 2539 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| tidy | 2 | 2636 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| tidy | 3 | 2733 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| laundry | 0 | 2767 | pass | basket in the laundry, washed True | 147.9 | 12 | 1.84 |
| laundry | 1 | 2864 | pass | basket in the laundry, washed True | 147.9 | 12 | 1.84 |
| laundry | 2 | 2961 | pass | basket in the laundry, washed True | 147.9 | 12 | 1.84 |
| trash | 0 | 2546 | pass | bag in the garden bin True | 169.8 | 352 | 1.67 |
| trash | 1 | 2643 | pass | bag in the garden bin True | 169.8 | 352 | 1.67 |
| trash | 2 | 2740 | pass | bag in the garden bin True | 169.8 | 352 | 1.67 |
| trash | 3 | 2837 | pass | bag in the garden bin True | 169.8 | 352 | 1.67 |
| plants | 0 | 2658 | FAIL | watered 0 of 4 plants | 618.3 | 5 | 1.59 |
| plants | 1 | 2755 | FAIL | watered 0 of 4 plants | 618.3 | 5 | 1.59 |
| plants | 2 | 2852 | FAIL | watered 0 of 4 plants | 618.3 | 5 | 1.59 |
| vacuum | 0 | 2657 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| vacuum | 1 | 2754 | FAIL | picked up 10 of 40 specks of dust (25%); vacuum put back True | 149.3 | 3 | 1.03 |
| vacuum | 2 | 2851 | pass | picked up 26 of 40 specks of dust (65%); vacuum put back True | 351.9 | 6 | 0.67 |
| vacuum | 3 | 2948 | pass | picked up 30 of 40 specks of dust (75%); vacuum put back True | 302.6 | 2 | 1.15 |
| vacuum | 4 | 3045 | pass | picked up 29 of 40 specks of dust (72%); vacuum put back True | 405.3 | 533 | 0.53 |
| vacuum | 5 | 3142 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| vacuum | 6 | 3239 | FAIL | picked up 14 of 40 specks of dust (35%); vacuum put back True | 149.3 | 3 | 1.03 |
| vacuum | 7 | 3336 | pass | picked up 29 of 40 specks of dust (72%); vacuum put back True | 351.9 | 6 | 0.67 |
| vacuum | 8 | 3433 | pass | picked up 36 of 40 specks of dust (90%); vacuum put back True | 302.6 | 2 | 1.15 |
| vacuum | 9 | 3530 | pass | picked up 26 of 40 specks of dust (65%); vacuum put back True | 405.3 | 533 | 0.53 |
| visitor | 0 | 2784 | pass | Sam in the living room, closest 1.42 m | 78.5 | 112 | 0.43 |
| visitor | 1 | 2881 | pass | Sam in the living room, closest 1.42 m | 78.5 | 112 | 0.43 |
| visitor | 2 | 2978 | pass | Sam in the living room, closest 1.42 m | 78.5 | 112 | 0.43 |
| visitor | 3 | 3075 | pass | Sam in the living room, closest 1.42 m | 78.5 | 112 | 0.43 |
| uno | 0 | 2338 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| uno | 1 | 2435 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| uno | 2 | 2532 | FAIL | 1 game(s), robot won 0; 89 turns, reaches 35/42 on target, Uno called 1x, missed Unos caught 0, illegal plays 0; stood up after True | 228.2 | 7669 | 1.55 |
| uno | 3 | 2629 | pass | 1 game(s), robot won 0; 19 turns, reaches 10/10 on target, Uno called 0x, missed Unos caught 0, illegal plays 0; stood up after True | 71.2 | 119 | 1.93 |
| dog | 0 | 2314 | pass | errands with the dog about: bedroom -> living room -> hall | 112.1 | 37 | 1.17 |
| dog | 1 | 2411 | pass | errands with the dog about: living room -> study -> hall | 128.5 | 110 | 0.9 |
| dog | 2 | 2508 | pass | errands with the dog about: dining room -> living room -> hall | 75.0 | 354 | 1.21 |
| dog | 3 | 2605 | pass | errands with the dog about: bedroom -> living room -> dining room | 89.2 | 1 | 1.08 |
| dog | 4 | 2702 | pass | errands with the dog about: living room -> bedroom -> kitchen | 103.2 | 85 | 1.0 |
| dog | 5 | 2799 | pass | errands with the dog about: study -> hall -> living room | 76.5 | 69 | 1.23 |
| spill | 0 | 2548 | FAIL | fetched the kettle past a spill; closest 2.66 m from its middle | 10.0 | 0 | 1.5 |
| spill | 1 | 2645 | pass | fetched the pot past a spill; closest 1.02 m from its middle | 105.2 | 9 | 0.97 |
| spill | 2 | 2742 | pass | fetched the mug_blue past a spill; closest 1.23 m from its middle | 102.4 | 5 | 1.0 |
| spill | 3 | 2839 | pass | fetched the pasta past a spill; closest 2.57 m from its middle | 92.3 | 5 | 0.99 |
| push | 0 | 2448 | pass | carried the kettle to the study desk through 17 shoves | 81.5 | 19 | 1.37 |
| push | 1 | 2545 | pass | carried the toolbox to the dining table through 17 shoves | 81.5 | 19 | 1.04 |
| push | 2 | 2642 | pass | carried the bag to the kitchen island through 14 shoves | 69.3 | 20 | 1.33 |
| push | 3 | 2739 | pass | carried the lunchbox to the hall table through 15 shoves | 73.6 | 5 | 1.27 |
| push | 4 | 2836 | FAIL | carried the kettle to the study desk through 9 shoves | 39.0 | 27 | 1.41 |
| push | 5 | 2933 | pass | carried the toolbox to the dining table through 16 shoves | 77.3 | 14 | 1.31 |
| push | 6 | 3030 | pass | carried the bag to the kitchen island through 15 shoves | 65.8 | 61 | 1.19 |
| push | 7 | 3127 | FAIL | carried the lunchbox to the hall table through 19 shoves | 81.1 | 19 | 1.27 |
| dark | 0 | 2418 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| dark | 1 | 2515 | FAIL | lights off: find the pot, take it to the hall table | 737.8 | 241 | 1.08 |
| dark | 2 | 2612 | pass | lights off: find the bag, take it to the hall table | 527.3 | 18 | 1.08 |
| dark | 3 | 2709 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| dark | 4 | 2806 | FAIL | lights off: find the pot, take it to the hall table | 509.1 | 110 | 0.99 |
| dark | 5 | 2903 | FAIL | lights off: find the toolbox, take it to the hall table | 78.6 | 0 | 1.2 |
| clutter | 0 | 2771 | pass | the teddy left on stair 3: cleared, then up | 38.1 | 0 | 1.73 |
| clutter | 1 | 2868 | pass | the truck left on stair 4: cleared, then up | 38.1 | 0 | 1.73 |
| clutter | 2 | 2965 | pass | the blocks left on stair 5: cleared, then up | 38.1 | 0 | 1.73 |
| clutter | 3 | 3062 | pass | the ball left on stair 6: cleared, then up | 38.1 | 0 | 1.73 |
| clutter | 4 | 3159 | pass | the teddy left on stair 7: cleared, then up | 38.1 | 0 | 1.73 |
| saturday | 0 | 2877 | FAIL | 1 of 10 chores done: tidy the kids' room FAIL; laundry ok; vacuum the living room FAIL; cook pasta FAIL; set the table FAIL; wash up FAIL; take out the trash FAIL; water the plants FAIL; tea FAIL; Uno FAIL | 1477.5 | 320 | 0.57 |
| saturday | 1 | 2974 | FAIL | 1 of 10 chores done: tidy the kids' room FAIL; laundry ok; vacuum the living room FAIL; cook pasta FAIL; set the table FAIL; wash up FAIL; take out the trash FAIL; water the plants FAIL; tea FAIL; Uno FAIL | 1477.5 | 320 | 0.57 |
