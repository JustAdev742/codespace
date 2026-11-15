# KESTREL in the house: test report

24 trials, 24 simulated minutes, 1 minutes on 4 CPU cores. `python house_test.py` reproduces it.

| Suite | Passed | Falls | Bumps (control steps touching a wall, furniture, person or vacuum) |
|---|---|---|---|
| fetch | 12 of 14 | 1 | 762 |
| sit | 10 of 10 | 0 | 191 |

## Every trial

Re-run one: `python -c "import house_test as T; print(T.trial(('fetch', 3, 1480)))"` with its suite, number and seed.

| Suite | # | Seed | Result | Details | Simulated s | Bumps | Closest person (m) |
|---|---|---|---|---|---|---|---|
| fetch | 0 | 1522 | pass | bag -> you | 60.1 | 138 | 0.86 |
| fetch | 1 | 1619 | pass | basket -> dining table | 124.2 | 46 | 0.75 |
| fetch | 2 | 1716 | pass | bucket -> dining table | 71.8 | 20 | 1.4 |
| fetch | 3 | 1813 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| fetch | 4 | 1910 | pass | kettle -> dining table | 58.3 | 107 | 1.51 |
| fetch | 5 | 2007 | pass | lunchbox -> hall table | 100.8 | 13 | 1.16 |
| fetch | 6 | 2104 | pass | toolbox -> kitchen island | 79.2 | 41 | 1.22 |
| fetch | 7 | 2201 | pass | bag -> kitchen island | 75.1 | 187 | 1.16 |
| fetch | 8 | 2298 | pass | basket -> coffee table | 130.4 | 44 | 1.05 |
| fetch | 9 | 2395 | pass | bucket -> you | 60.9 | 0 | 1.54 |
| fetch | 10 | 2492 | FAIL | can -> study desk | 111.5 | 133 | 1.28 |
| fetch | 11 | 2589 | pass | kettle -> dining table | 58.4 | 0 | 1.51 |
| fetch | 12 | 2686 | pass | lunchbox -> hall table | 83.9 | 33 | 1.27 |
| fetch | 13 | 2783 | pass | toolbox -> you | 59.2 | 0 | 1.22 |
| sit | 0 | 1336 | pass | desk chair: stood | 39.1 | 25 | 1.56 |
| sit | 1 | 1433 | pass | dining chair 1: stood | 26.2 | 16 | 2.63 |
| sit | 2 | 1530 | pass | dining chair 2: stood | 54.4 | 34 | 1.51 |
| sit | 3 | 1627 | pass | dining chair 3: stood | 32.7 | 18 | 1.52 |
| sit | 4 | 1724 | pass | dining chair 4: stood | 45.4 | 3 | 1.55 |
| sit | 5 | 1821 | pass | desk chair: stood | 31.9 | 9 | 1.52 |
| sit | 6 | 1918 | pass | dining chair 1: stood | 40.0 | 12 | 1.52 |
| sit | 7 | 2015 | pass | dining chair 2: stood | 42.4 | 21 | 1.61 |
| sit | 8 | 2112 | pass | dining chair 3: stood | 29.6 | 28 | 2.52 |
| sit | 9 | 2209 | pass | dining chair 4: stood | 37.4 | 25 | 1.55 |
