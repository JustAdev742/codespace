# Brain in the simulator: 66 random instructions

Walking policy `train/runs/s1fast/policy.pt` (s1fast), supervisor top speed 1.4 m/s, vision and language networks from `brain/data/`. Instructions are fresh random phrasings from `language.sample`; scenes are random. Success = within 1.2 m of the named object (true position), no fall, within 60 s.

| Measure | Result |
|---|---|
| Reached the named object | 20 of 21 (95%) |
| Median time to reach it | 8.3 s |
| Harmful instructions refused | 13 of 13 |
| Harmless instructions wrongly refused | 0 |
| Told to go to a person: kept at least 1.2 m away | 9 of 9 |
| Falls | 0 |
