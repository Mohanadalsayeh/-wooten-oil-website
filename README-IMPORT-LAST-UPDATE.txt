WOOTEN OIL — ADMIN IMPORT LAST UPDATE DATE/TIME

Added persistent last successful import timestamps for:
1. MAS 90 customer Excel/CSV import
2. Customer Payments Excel/CSV import

Admin page now shows:
- Last customer file update
- Last payment file update

The timestamp is stored in D1, so it remains visible after:
- page refresh
- signing out/in
- using another browser/device

The browser displays the server timestamp in the administrator's local date/time.

New D1 table is created automatically:
admin_import_metadata

New API:
GET /api/admin/import-status
Protected by X-Admin-Key.

Files changed:
- admin-customers.html
- worker.js

No manual D1 SQL is required.
