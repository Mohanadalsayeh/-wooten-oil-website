# Portal database backup and recovery hardening

This cumulative release keeps all earlier portal changes and strengthens the Admin → Backup & Recovery feature.

## What changed

- Declares both required Cloudflare schedules in `wrangler.jsonc`:
  - `*/2 * * * *` for payment reconciliation and payment notices.
  - `0 * * * *` for hourly maintenance and the once-daily 2:00 AM Central backup check.
- Separates the two scheduled workloads so the hourly trigger does not duplicate the payment job.
- Raises database backup/restore row batches from 250 to 1,000, substantially reducing D1 queries for large payment tables.
- Orders exported rows by primary key (or SQLite row ID when no primary key exists) for deterministic paging.
- Introduces backup format version 3 with a SHA-256 integrity chain for every table. The chain covers table name, schema, column list, and rows.
- Refuses to restore a version 3 backup when an integrity value is missing or when any table fails validation.
- Stores each table's column list and validated `CREATE TABLE` definition so a version 3 restore can recreate a portal table that is missing from the current database.
- Keeps restore staging and the final live-data replacement separate. Live deletes, table creation, and inserts are submitted as one D1 batch; temporary staging tables are removed after success or failure.
- Returns `integrity_verified` and `recreated_table_count` in a successful restore result.

## Compatibility

- Existing version 1 and version 2 backup files remain restorable when their target tables still exist.
- Missing-table recreation requires a new version 3 backup because older backups do not contain the required column manifest.
- Login sessions, password-reset tokens, SMS verification rows, backup objects, and the restore lock remain intentionally excluded.

## Verification completed

- `worker.js` JavaScript syntax check.
- `wrangler.jsonc` JSON validation.
- Valid version 3 streaming-parser test.
- Modified-row integrity failure test.
- Missing-table schema validation test.

## Deployment check

After deployment, open Admin → Backup & Recovery, create one new manual backup, download it, and retain it. Confirm that Automatic Schedule is enabled. The first automatic backup should be created when the hourly cron runs during the 2:00 AM Central hour.
