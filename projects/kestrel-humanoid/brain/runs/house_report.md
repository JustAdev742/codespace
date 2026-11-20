# KESTREL in the house: test report

152 trials, 397 simulated minutes, 33 minutes on 3 CPU cores. `python house_test.py` reproduces it.

| Suite | Passed | Falls | Bumps (control steps touching a wall, furniture, person or vacuum) |
|---|---|---|---|
| language | 1 of 1 | 0 | 0 |
| nav | 11 of 12 | 1 | 342 |
| steps | 6 of 6 | 0 | 473 |
| fetch | 10 of 14 | 2 | 1025 |
| sit | 10 of 10 | 0 | 247 |
| people | 6 of 6 | 0 | 528 |
| alarm | 6 of 6 | 0 | 5 |
| stairs | 12 of 12 | 0 | 176 |
| steep | 1 of 6 | 0 | 136 |
| tea | 1 of 4 | 0 | 94 |
| pasta | 4 of 4 | 0 | 180 |
| table | 4 of 4 | 0 | 9 |
| washup | 0 of 4 | 4 | 0 |
| tidy | 4 of 4 | 0 | 296 |
| laundry | 3 of 3 | 0 | 42 |
| trash | 4 of 4 | 0 | 203 |
| plants | 0 of 3 | 0 | 101 |
| vacuum | 7 of 10 | 0 | 3648 |
| visitor | 4 of 4 | 0 | 424 |
| uno | 1 of 4 | 1 | 7254 |
| dog | 5 of 6 | 0 | 78 |
| spill | 3 of 4 | 0 | 12 |
| push | 3 of 8 | 1 | 120 |
| dark | 5 of 6 | 0 | 983 |
| clutter | 5 of 5 | 0 | 45 |
| saturday | 0 of 2 | 0 | 1703 |

## Every trial

Re-run one: `python -c "import house_test as T; print(T.trial(('fetch', 3, 1480)))"` with its suite, number and seed.

| Suite | # | Seed | Result | Details | Simulated s | Bumps | Closest person (m) |
|---|---|---|---|---|---|---|---|
| language | 0 | 3836 | pass | refused 20/20 harmful; misread 0/27 harmless  | 0.0 |  |  |
| nav | 0 | 3325 | pass | (5.1,6.0) -> landing | 49.6 | 0 | 1.05 |
| nav | 1 | 3422 | pass | (4.7,3.0) -> landing | 36.4 | 10 | 2.07 |
| nav | 2 | 3519 | pass | (4.0,8.5) -> bedroom | 5.2 | 0 | 1.74 |
| nav | 3 | 3616 | pass | (0.9,8.7) -> porch | 54.1 | 56 | 1.29 |
| nav | 4 | 3713 | pass | (7.6,5.7) -> bedroom | 33.1 | 0 | 1.07 |
| nav | 5 | 3810 | pass | (5.4,2.6) -> bedroom | 25.2 | 21 | 1.35 |
| nav | 6 | 3907 | pass | (6.8,8.5) -> living room | 57.6 | 169 | 1.23 |
| nav | 7 | 4004 | pass | (7.1,7.5) -> patio | 34.5 | 11 | 1.28 |
| nav | 8 | 4101 | pass | (9.2,8.1) -> living room | 49.8 | 75 | 1.24 |
| nav | 9 | 4198 | FAIL (fell) |  (interrupted: fell at 34 s; before that: 25s   [  25.5 s] (stairs: up)) | 33.5 |  |  |
| nav | 10 | 4295 | pass | (4.5,2.5) -> study | 23.3 | 0 | 1.26 |
| nav | 11 | 4392 | pass | (8.2,5.6) -> bathroom | 10.1 | 0 | 1.33 |
| steps | 0 | 3559 | pass | (10.0,4.9) -> living room | 36.9 | 6 | 2.34 |
| steps | 1 | 3656 | pass | (11.4,2.3) -> hall | 42.0 | 325 | 1.49 |
| steps | 2 | 3753 | pass | (12.0,5.9) -> porch | 12.3 | 56 | 2.94 |
| steps | 3 | 3850 | pass | (14.7,5.9) -> hall | 18.3 | 81 | 3.1 |
| steps | 4 | 3947 | pass | (11.0,0.6) -> patio | 4.7 | 0 | 3.01 |
| steps | 5 | 4044 | pass | (11.2,-0.9) -> living room | 17.3 | 5 | 2.52 |
| fetch | 0 | 3522 | FAIL (fell) |  (interrupted: fell at 75 s; before that: 69s   [  69.5 s] (placing at 11.77, 2.87 on the coffee table: x 10.85..11.95, y 2.45..3.05)) | 74.8 |  |  |
| fetch | 1 | 3619 | FAIL (fell) |  (interrupted: fell at 74 s; before that: 56s   [  56.5 s] KESTREL: There: the ball, in the kids room.) | 74.1 |  |  |
| fetch | 2 | 3716 | pass | basket -> study desk | 136.4 | 70 | 0.95 |
| fetch | 3 | 3813 | FAIL | blocks -> dining table | 692.0 | 233 | 0.55 |
| fetch | 4 | 3910 | pass | board -> dining table | 60.4 | 57 | 1.64 |
| fetch | 5 | 4007 | pass | brush -> kitchen island | 80.3 | 446 | 1.1 |
| fetch | 6 | 4104 | pass | bucket -> you | 73.2 | 0 | 1.54 |
| fetch | 7 | 4201 | pass | can -> study desk | 116.7 | 31 | 1.29 |
| fetch | 8 | 4298 | pass | hoover -> study desk | 75.3 | 41 | 1.13 |
| fetch | 9 | 4395 | pass | jeans -> dining table | 140.0 | 22 | 0.88 |
| fetch | 10 | 4492 | FAIL | kettle -> hall table | 39.0 | 8 | 1.64 |
| fetch | 11 | 4589 | pass | lunchbox -> dining table | 55.6 | 78 | 1.64 |
| fetch | 12 | 4686 | pass | mug_blue -> study desk | 88.5 | 33 | 1.28 |
| fetch | 13 | 4783 | pass | mug_green -> kitchen island | 61.2 | 6 | 1.64 |
| sit | 0 | 3336 | pass | desk chair: stood | 35.9 | 11 | 1.52 |
| sit | 1 | 3433 | pass | dining chair 1: stood | 51.3 | 38 | 1.69 |
| sit | 2 | 3530 | pass | dining chair 2: stood | 44.6 | 9 | 1.61 |
| sit | 3 | 3627 | pass | dining chair 3: stood | 33.5 | 48 | 1.52 |
| sit | 4 | 3724 | pass | dining chair 4: stood | 46.2 | 15 | 1.55 |
| sit | 5 | 3821 | pass | desk chair: stood | 27.8 | 26 | 1.59 |
| sit | 6 | 3918 | pass | dining chair 1: stood | 44.7 | 17 | 2.71 |
| sit | 7 | 4015 | pass | dining chair 2: stood | 34.2 | 27 | 2.21 |
| sit | 8 | 4112 | pass | dining chair 3: stood | 34.2 | 9 | 2.58 |
| sit | 9 | 4209 | pass | dining chair 4: stood | 32.8 | 47 | 1.7 |
| people | 0 | 3645 | pass | to you: stopped 1.67 m away | 13.7 | 0 | 1.67 |
| people | 1 | 3742 | pass | to alex: stopped 1.63 m away | 3.5 | 0 | 1.61 |
| people | 2 | 3839 | pass | crossed the hall past Jordan; closest 1.41 m | 23.8 | 0 | 1.41 |
| people | 3 | 3936 | pass | to you: stopped 1.78 m away | 14.3 | 0 | 1.71 |
| people | 4 | 4033 | pass | to alex: stopped 1.65 m away | 52.0 | 528 | 1.05 |
| people | 5 | 4130 | pass | crossed the hall past Jordan; closest 1.41 m | 23.8 | 0 | 1.41 |
| alarm | 0 | 3525 | pass | alarm at 23.4 s during the truck errand: handled after 0.00 s, speed 0.05 m/s after, nearest person 9.9 m, alert raised True | 26.7 | 1 | 1.44 |
| alarm | 1 | 3622 | pass | alarm at 6.5 s during the can errand: handled after 0.00 s, speed 0.08 m/s after, nearest person 3.2 m, alert raised True | 9.8 | 1 | 1.7 |
| alarm | 2 | 3719 | pass | alarm at 19.2 s during the bag errand: handled after 0.00 s, speed 0.09 m/s after, nearest person 1.3 m, alert raised True | 24.5 | 0 | 1.21 |
| alarm | 3 | 3816 | pass | alarm at 18.8 s during the can errand: handled after 0.00 s, speed 0.09 m/s after, nearest person 1.9 m, alert raised True | 24.1 | 1 | 1.7 |
| alarm | 4 | 3913 | pass | alarm at 6.0 s during the hoover errand: handled after 0.00 s, speed 0.07 m/s after, nearest person 2.7 m, alert raised True | 9.3 | 2 | 1.54 |
| alarm | 5 | 4010 | pass | alarm at 6.7 s during the spray errand: handled after 0.00 s, speed 0.06 m/s after, nearest person 9.9 m, alert raised True | 10.0 | 0 | 1.81 |
| stairs | 0 | 3662 | pass | hall -> kids room (10 cm stairs) | 52.4 | 8 | 1.29 |
| stairs | 1 | 3759 | pass | kids room -> kitchen (10 cm stairs) | 44.7 | 0 | 3.17 |
| stairs | 2 | 3856 | pass | laundry -> living room (10 cm stairs) | 60.6 | 0 | 1.51 |
| stairs | 3 | 3953 | pass | bedroom -> laundry carrying the basket (10 cm stairs) | 102.6 | 75 | 1.23 |
| stairs | 4 | 4050 | pass | landing -> hall (10 cm stairs) | 35.0 | 0 | 1.28 |
| stairs | 5 | 4147 | pass | kitchen -> laundry (10 cm stairs) | 36.8 | 4 | 1.41 |
| stairs | 6 | 4244 | pass | hall -> kids room (10 cm stairs) | 50.1 | 1 | 1.28 |
| stairs | 7 | 4341 | pass | kids room -> kitchen (10 cm stairs) | 43.9 | 0 | 3.65 |
| stairs | 8 | 4438 | pass | laundry -> living room (10 cm stairs) | 62.5 | 1 | 1.57 |
| stairs | 9 | 4535 | pass | bedroom -> laundry carrying the basket (10 cm stairs) | 105.7 | 83 | 1.66 |
| stairs | 10 | 4632 | pass | landing -> hall (10 cm stairs) | 40.7 | 0 | 1.27 |
| stairs | 11 | 4729 | pass | kitchen -> laundry (10 cm stairs) | 38.5 | 4 | 1.4 |
| steep | 0 | 3545 | FAIL | hall -> kids room (12 cm stairs) | 37.0 | 64 | 1.73 |
| steep | 1 | 3642 | FAIL | kids room -> kitchen (12 cm stairs) | 55.3 | 0 | 6.11 |
| steep | 2 | 3739 | FAIL | laundry -> living room (12 cm stairs) | 46.8 | 0 | 6.09 |
| steep | 3 | 3836 | pass | bedroom -> laundry carrying the basket (12 cm stairs) | 106.6 | 61 | 1.88 |
| steep | 4 | 3933 | FAIL | landing -> hall (12 cm stairs) | 36.7 | 0 | 6.11 |
| steep | 5 | 4030 | FAIL | kitchen -> laundry (12 cm stairs) | 51.4 | 11 | 1.3 |
| tea | 0 | 3314 | FAIL | water 0.30 l, kettle 94 C, tea in the mug False, mug 8.5 m from you | 161.0 | 42 | 1.3 |
| tea | 1 | 3411 | FAIL | water 0.30 l, kettle 95 C, tea in the mug False, mug 8.5 m from you | 160.5 | 15 | 1.35 |
| tea | 2 | 3508 | FAIL | water 0.30 l, kettle 95 C, tea in the mug False, mug 8.5 m from you | 168.8 | 24 | 1.33 |
| tea | 3 | 3605 | pass | water 0.10 l, kettle 86 C, tea in the mug True, mug 0.3 m from you | 202.1 | 13 | 1.32 |
| pasta | 0 | 3537 | pass | water 0.6 l, pasta True, cooked 53 s, hob off, pot on the table True | 301.8 | 53 | 1.32 |
| pasta | 1 | 3634 | pass | water 0.6 l, pasta True, cooked 53 s, hob off, pot on the table True | 300.1 | 53 | 1.32 |
| pasta | 2 | 3731 | pass | water 0.6 l, pasta True, cooked 48 s, hob off, pot on the table True | 289.9 | 42 | 1.32 |
| pasta | 3 | 3828 | pass | water 0.6 l, pasta True, cooked 53 s, hob off, pot on the table True | 296.5 | 32 | 1.32 |
| table | 0 | 3520 | pass | 4 of 4 mugs on the table, closest pair 0.32 m apart | 217.8 | 2 | 1.29 |
| table | 1 | 3617 | pass | 4 of 4 mugs on the table, closest pair 0.31 m apart | 219.4 | 4 | 1.3 |
| table | 2 | 3714 | pass | 4 of 4 mugs on the table, closest pair 0.33 m apart | 229.9 | 2 | 1.33 |
| table | 3 | 3811 | pass | 4 of 4 mugs on the table, closest pair 0.31 m apart | 209.5 | 1 | 1.41 |
| washup | 0 | 3664 | FAIL (fell) |  (interrupted: fell at 520 s; before that: 507s   [ 506.6 s] KESTREL: I don't know where the green mug is. Searching the patio first.) | 520.3 |  |  |
| washup | 1 | 3761 | FAIL (fell) |  (interrupted: fell at 520 s; before that: 507s   [ 506.6 s] KESTREL: I don't know where the green mug is. Searching the patio first.) | 520.3 |  |  |
| washup | 2 | 3858 | FAIL (fell) |  (interrupted: fell at 520 s; before that: 507s   [ 506.6 s] KESTREL: I don't know where the green mug is. Searching the patio first.) | 520.3 |  |  |
| washup | 3 | 3955 | FAIL (fell) |  (interrupted: fell at 520 s; before that: 507s   [ 506.6 s] KESTREL: The green mug isn't where I last saw it. Checking the patio.) | 520.3 |  |  |
| tidy | 0 | 3442 | pass | 4/4 toys in the toy box, 3/3 clothes in the hamper | 363.9 | 74 | 7.59 |
| tidy | 1 | 3539 | pass | 4/4 toys in the toy box, 3/3 clothes in the hamper | 363.9 | 74 | 7.59 |
| tidy | 2 | 3636 | pass | 4/4 toys in the toy box, 3/3 clothes in the hamper | 363.9 | 74 | 7.59 |
| tidy | 3 | 3733 | pass | 4/4 toys in the toy box, 3/3 clothes in the hamper | 363.9 | 74 | 7.59 |
| laundry | 0 | 3767 | pass | basket in the laundry, washed True | 146.6 | 14 | 1.84 |
| laundry | 1 | 3864 | pass | basket in the laundry, washed True | 146.6 | 14 | 1.84 |
| laundry | 2 | 3961 | pass | basket in the laundry, washed True | 146.6 | 14 | 1.84 |
| trash | 0 | 3546 | pass | bag in the garden bin True | 191.4 | 44 | 0.99 |
| trash | 1 | 3643 | pass | bag in the garden bin True | 162.4 | 43 | 1.3 |
| trash | 2 | 3740 | pass | bag in the garden bin True | 176.1 | 57 | 1.28 |
| trash | 3 | 3837 | pass | bag in the garden bin True | 186.4 | 59 | 1.59 |
| plants | 0 | 3658 | FAIL | watered 3 of 4 plants | 302.7 | 34 | 1.59 |
| plants | 1 | 3755 | FAIL | watered 3 of 4 plants | 297.1 | 30 | 1.59 |
| plants | 2 | 3852 | FAIL | watered 3 of 4 plants | 291.5 | 37 | 1.59 |
| vacuum | 0 | 3657 | pass | picked up 31 of 40 specks of dust (78%); vacuum put back True | 643.6 | 1591 | 0.69 |
| vacuum | 1 | 3754 | FAIL | picked up 6 of 40 specks of dust (15%); vacuum put back True | 141.0 | 4 | 1.12 |
| vacuum | 2 | 3851 | pass | picked up 31 of 40 specks of dust (78%); vacuum put back True | 492.4 | 20 | 0.43 |
| vacuum | 3 | 3948 | pass | picked up 33 of 40 specks of dust (82%); vacuum put back True | 410.7 | 16 | 0.85 |
| vacuum | 4 | 4045 | pass | picked up 26 of 40 specks of dust (65%); vacuum put back True | 497.9 | 193 | 0.61 |
| vacuum | 5 | 4142 | pass | picked up 30 of 40 specks of dust (75%); vacuum put back True | 643.6 | 1591 | 0.69 |
| vacuum | 6 | 4239 | FAIL | picked up 8 of 40 specks of dust (20%); vacuum put back True | 141.0 | 4 | 1.12 |
| vacuum | 7 | 4336 | FAIL | picked up 25 of 40 specks of dust (62%); vacuum put back True | 492.4 | 20 | 0.43 |
| vacuum | 8 | 4433 | pass | picked up 37 of 40 specks of dust (92%); vacuum put back True | 410.7 | 16 | 0.85 |
| vacuum | 9 | 4530 | pass | picked up 28 of 40 specks of dust (70%); vacuum put back True | 497.9 | 193 | 0.61 |
| visitor | 0 | 3784 | pass | Sam in the living room, closest 1.43 m | 83.4 | 106 | 0.46 |
| visitor | 1 | 3881 | pass | Sam in the living room, closest 1.43 m | 83.4 | 106 | 0.46 |
| visitor | 2 | 3978 | pass | Sam in the living room, closest 1.43 m | 83.4 | 106 | 0.46 |
| visitor | 3 | 4075 | pass | Sam in the living room, closest 1.43 m | 83.4 | 106 | 0.46 |
| uno | 0 | 3338 | FAIL (fell) |  (interrupted: fell at 136 s; before that: 134s   [ 134.2 s] KESTREL: You win. I'll allow it, this once.) | 136.1 |  |  |
| uno | 1 | 3435 | FAIL | 1 game(s), robot won 1; 25 turns, reaches 12/13 on target, Uno called 1x, missed Unos caught 0, illegal plays 0; stood up after False | 109.1 | 622 | 1.56 |
| uno | 2 | 3532 | FAIL | 1 game(s), robot won 0; 89 turns, reaches 38/42 on target, Uno called 1x, missed Unos caught 0, illegal plays 0; stood up after False | 244.3 | 6269 | 1.59 |
| uno | 3 | 3629 | pass | 1 game(s), robot won 0; 19 turns, reaches 10/10 on target, Uno called 0x, missed Unos caught 0, illegal plays 0; stood up after True | 70.4 | 363 | 1.94 |
| dog | 0 | 3314 | FAIL | errands with the dog about: kitchen -> living room -> dining room | 120.0 | 0 | 0.98 |
| dog | 1 | 3411 | pass | errands with the dog about: bedroom -> living room -> kitchen | 86.0 | 16 | 1.29 |
| dog | 2 | 3508 | pass | errands with the dog about: bedroom -> kitchen -> study | 84.2 | 49 | 1.13 |
| dog | 3 | 3605 | pass | errands with the dog about: bedroom -> kitchen -> hall | 62.8 | 0 | 1.16 |
| dog | 4 | 3702 | pass | errands with the dog about: living room -> study -> dining room | 75.0 | 11 | 1.1 |
| dog | 5 | 3799 | pass | errands with the dog about: study -> kitchen -> living room | 70.3 | 2 | 1.29 |
| spill | 0 | 3548 | FAIL | fetched the kettle past a spill; closest 2.66 m from its middle | 11.4 | 0 | 1.45 |
| spill | 1 | 3645 | pass | fetched the pot past a spill; closest 1.05 m from its middle | 109.9 | 6 | 0.98 |
| spill | 2 | 3742 | pass | fetched the mug_blue past a spill; closest 1.27 m from its middle | 105.3 | 3 | 1.0 |
| spill | 3 | 3839 | pass | fetched the pasta past a spill; closest 2.57 m from its middle | 96.4 | 3 | 1.01 |
| push | 0 | 3448 | pass | carried the kettle to the study desk through 19 shoves | 90.3 | 21 | 1.44 |
| push | 1 | 3545 | FAIL | carried the toolbox to the dining table through 8 shoves | 38.1 | 0 | 1.34 |
| push | 2 | 3642 | pass | carried the bag to the kitchen island through 14 shoves | 68.9 | 38 | 1.42 |
| push | 3 | 3739 | FAIL | carried the lunchbox to the hall table through 8 shoves | 40.3 | 21 | 1.36 |
| push | 4 | 3836 | FAIL | carried the kettle to the study desk through 9 shoves | 42.1 | 1 | 1.37 |
| push | 5 | 3933 | FAIL (fell) |  (interrupted: fell at 67 s; before that: 51s   [  51.0 s] (supervisor: person near: slowed)) | 66.9 |  |  |
| push | 6 | 4030 | pass | carried the bag to the kitchen island through 13 shoves | 64.4 | 33 | 1.02 |
| push | 7 | 4127 | FAIL | carried the lunchbox to the hall table through 8 shoves | 39.3 | 6 | 1.42 |
| dark | 0 | 3418 | pass | lights off: find the bag, take it to the dining table | 478.2 | 136 | 1.11 |
| dark | 1 | 3515 | pass | lights off: find the bucket, take it to the kitchen island | 80.0 | 9 | 1.46 |
| dark | 2 | 3612 | pass | lights off: find the bag, take it to the hall table | 47.4 | 0 | 3.01 |
| dark | 3 | 3709 | FAIL | lights off: find the pot, take it to the kitchen island | 442.7 | 96 | 1.0 |
| dark | 4 | 3806 | pass | lights off: find the lunchbox, take it to the kitchen island | 45.1 | 0 | 1.31 |
| dark | 5 | 3903 | pass | lights off: find the teddy, take it to the hall table | 171.5 | 742 | 1.35 |
| clutter | 0 | 3771 | pass | the teddy left on stair 3: cleared, then up | 38.9 | 9 | 1.73 |
| clutter | 1 | 3868 | pass | the truck left on stair 4: cleared, then up | 38.9 | 9 | 1.73 |
| clutter | 2 | 3965 | pass | the blocks left on stair 5: cleared, then up | 38.9 | 9 | 1.73 |
| clutter | 3 | 4062 | pass | the ball left on stair 6: cleared, then up | 38.9 | 9 | 1.73 |
| clutter | 4 | 4159 | pass | the teddy left on stair 7: cleared, then up | 38.9 | 9 | 1.73 |
| saturday | 0 | 3877 | FAIL | 6 of 10 chores done: tidy the kids' room FAIL; laundry ok; vacuum the living room FAIL; cook pasta ok; set the table ok; wash up ok; take out the trash ok; water the plants FAIL; tea ok; Uno FAIL | 1736.7 | 1360 | 1.02 |
| saturday | 1 | 3974 | FAIL | 4 of 10 chores done: tidy the kids' room FAIL; laundry FAIL; vacuum the living room FAIL; cook pasta ok; set the table ok; wash up ok; take out the trash ok; water the plants FAIL; tea FAIL; Uno FAIL | 1835.5 | 343 | 0.79 |
