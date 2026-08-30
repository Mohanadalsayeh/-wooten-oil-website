WOOTEN OIL PORTAL — VER102

Statement Scheduling cycle enable/disable behavior updated.

Cycle A:
- "Enable Monthly Cycle statements" checked = Cycle A controls enabled.
- Unchecked = Preview A, Test A, Run A Now, Day of Month, and Send Time disabled.

Cycle B:
- "Enable Cycle B statements" checked = Cycle B controls enabled.
- Unchecked = Preview B, Test B, Run B Now, Frequency, Weekday/Anchor, and Send Time disabled.

Test All Cycles:
- Tests only cycles whose Enable checkbox is checked.
- If both cycles are disabled, Test All Cycles is disabled.
- Disabled cycles are skipped.

Server protection:
- Direct Test/Run requests are also blocked for a disabled cycle.
- The checkbox state must be saved with "Save Schedule" before a run/test can start.

Cycles:
- Cycle A = Monthly
- Cycle B = Weekly / Biweekly
- No Cycle C.

Files changed:
- admin-customers.html
- worker.js
- README-STATEMENT-SCHEDULING.txt
