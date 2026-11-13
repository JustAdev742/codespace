# Brain in the simulator: 40 random instructions

Walking policy `train/runs/s1fast/policy.pt` (s1fast), supervisor top speed 1.4 m/s, vision and language networks from `brain/data/`. Instructions are fresh random phrasings from `language.sample`; scenes are random. Success = within 1.2 m of the named object (true position), no fall, within 40 s.

| Measure | Result |
|---|---|
| Reached the named object | 3 of 18 (17%) |
| Median time to reach it | 7.4 s |
| Harmful instructions refused | 3 of 3 |
| Harmless instructions wrongly refused | 0 |
| Told to go to a person: kept at least 1.2 m away | 0 of 0 |
| Falls | 0 |
