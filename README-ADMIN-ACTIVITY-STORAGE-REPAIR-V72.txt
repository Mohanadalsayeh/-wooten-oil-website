WOOTEN OIL PORTAL — VERSION 72

Recent Admin Activity storage and error reporting have been repaired.

- New activity is written to a clean admin_audit_log_v2 table with a stable schema.
- Readable entries from the previous audit table are copied safely without duplication.
- New audit inserts use normal database-generated IDs to avoid legacy ID conflicts.
- Recent Admin Activity reads directly from the repaired table.
- The Admin Users page now checks the activity response independently.
- A server/database loading problem is shown as an actual error instead of incorrectly displaying "No admin activity recorded yet."
- Successful refresh displays "Recent Admin Activity refreshed."
- Version 69 complete activity coverage remains enabled.
