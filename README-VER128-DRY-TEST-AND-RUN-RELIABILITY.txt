Wooten Oil Portal — Ver128
Dry Test + Statement Run Reliability

Changes:
- Test A, Test B, and Test All Cycles are true dry tests.
- Dry tests use only explicitly selected customers.
- Dry tests generate/validate statement PDFs and balances only.
- Dry tests do NOT send SMS or email.
- Dry tests do NOT create portal deliveries, saved statement documents, or Communication History entries.
- Run A and Run B remain real delivery actions.
- Live statement runs now process smaller server batches to reduce request timeout risk.
- Temporary continuation/network errors now trigger a run-status recheck before showing a failure.
- Added server capability marker for no-delivery Test All mode.

Based on Ver127.
