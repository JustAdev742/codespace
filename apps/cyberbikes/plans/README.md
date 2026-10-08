# Motion plans

From an `improve-animations` audit of `src/` at 53d5353. The motion is already crisp and gated:
transform, opacity and clip-path only, transitions for anything interactive, reduced motion
handled through tokens, hover gated to fine pointers. These are the remaining findings.

| # | Plan | Severity | Status |
|---|---|---|---|
| 001 | Move the compare tray with transform, not `bottom` | MEDIUM | DONE |
| 002 | Drop the press scale under reduced motion | MEDIUM | DONE |
| 003 | Let the compare tray leave the way it came | LOW | DONE |
| 004 | Colour changes on `ease`; one hover scale | LOW | DONE |
| 005 | Pulse the loading cards with opacity | LOW | DONE |

Order: 001 then 003 (both edit the tray rule), then 002, 004, 005 in any order.

Missed opportunities, not planned: the compare button's plus-to-check swap could scale its icon in
from 0.9 over 150 ms to mark the state change; "What affects range?" could open with
`::details-content` and `interpolate-size: allow-keywords` where supported. Finder results are
deliberately not animated: answers change often, and the frequency rule says no motion there.
