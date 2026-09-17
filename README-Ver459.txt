WOOTEN OIL PORTAL Ver459 - Transaction pull period

Apply over Ver458, preserving folder paths. Deploy the frontend AND the Worker with the updated fleet/intevacon.mjs dependency. worker.js itself is unchanged and is not included. The new setting table is created automatically; existing credentials, schedule and requests are preserved. The initial period remains 30 days.

Install the accompanying Intevacon-Pull-Period-v2.1.zip on the sync PC before choosing a shorter period.

In admin Fleet Cards & Transactions:
1. Select Transaction history: Last 30 days, Last 3 weeks (21 days), Last 2 weeks (14 days), or Last 1 week (7 days).
2. Click Save settings. The selected 2-24 hour schedule is saved alongside the history period.
3. Click Sync now for an immediate request, or wait for the next scheduled pull.

The selection controls actual transaction collection by Received On time. Cards always use the complete current card export (or the source's active-only export when applicable). Admin and customer transaction tables use the last successfully published collection window. Choosing a shorter period does not delete older stored transactions. A later successful 30-day pull restores the longer visible range. A pull already in progress finishes using the period it claimed; the new selection applies to subsequent pulls.

Before both updates are installed, leave the period at 30 days. An older scheduled agent is prevented from claiming shorter-period work and the status panel explains that the PC update is needed.

Validation: 17 backend tests passed, covering migration, choices, authorization, atomic setting saves, queue compatibility, collection boundaries and in-flight changes; four Python test groups passed, covering exact UTC/DST intervals, invalid values, claimed period delivery, manual collection wiring and minute-boundary filtering. Existing automatic refresh checks passed. Browser/site access and Windows execution were not available; verify one selected-period Sync now on the PC after installation.
