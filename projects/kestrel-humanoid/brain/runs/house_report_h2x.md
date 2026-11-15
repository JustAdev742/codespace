# Unitree H2-X in the house: test report

14 trials, 19 simulated minutes, 1 minutes on 4 CPU cores. `python house_test.py` reproduces it.

| Suite | Passed | Falls | Bumps (control steps touching a wall, furniture, person or vacuum) |
|---|---|---|---|
| fetch | 2 of 14 | 2 | 1667 |

## Every trial

Re-run one: `python -c "import house_test as T; print(T.trial(('fetch', 3, 1480)))"` with its suite, number and seed.

| Suite | # | Seed | Result | Details | Simulated s | Bumps | Closest person (m) |
|---|---|---|---|---|---|---|---|
| fetch | 0 | 1522 | pass | bag -> you | 135.3 | 598 | 0.92 |
| fetch | 1 | 1619 | FAIL | basket -> dining table | 121.6 | 0 | 1.27 |
| fetch | 2 | 1716 | FAIL | bucket -> dining table | 91.1 | 62 | 0.99 |
| fetch | 3 | 1813 | FAIL | can -> study desk | 70.8 | 0 | 1.3 |
| fetch | 4 | 1910 | FAIL | kettle -> dining table | 57.8 | 32 | 1.0 |
| fetch | 5 | 2007 | FAIL | lunchbox -> hall table | 59.4 | 23 | 1.0 |
| fetch | 6 | 2104 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
| fetch | 7 | 2201 | FAIL | bag -> kitchen island | 142.6 | 894 | 1.03 |
| fetch | 8 | 2298 | FAIL | basket -> coffee table | 191.8 | 3 | 0.94 |
| fetch | 9 | 2395 | pass | bucket -> you | 73.8 | 0 | 1.25 |
| fetch | 10 | 2492 | FAIL | can -> study desk | 70.8 | 0 | 1.3 |
| fetch | 11 | 2589 | FAIL | kettle -> dining table | 57.8 | 32 | 1.0 |
| fetch | 12 | 2686 | FAIL | lunchbox -> hall table | 59.4 | 23 | 1.0 |
| fetch | 13 | 2783 | FAIL (fell) |  (interrupted: fell) | 0.0 |  |  |
