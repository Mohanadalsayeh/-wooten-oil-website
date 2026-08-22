WOOTEN OIL — LIVE CUSTOMER DATABASE ADMIN VIEW

Replace:
- admin-customers.html
- worker.js
- index.html  (included unchanged from the current master so the ZIP remains a complete matching set)

New Admin tab:
DATABASE

How to use:
1. Enter the Admin Import Key at the top.
2. Open Database.
3. Click Load Database.
4. Search/filter/sort the live Cloudflare D1 customer records.

Available filters:
- Search: customer #, name, email, phone, city, state, ZIP
- Email: all / with email / without email
- Online account: all / activated / not activated
- Account status: all / active / inactive-other
- Sort: customer #, name, balance, updated date

The table is READ ONLY.
It does not modify customer records.
It loads 50 records per page and uses server-side search/filter/sort/pagination.

Protected endpoint:
GET /api/admin/customers-database
Requires the existing X-Admin-Key / ADMIN_IMPORT_KEY.

No Cloudflare binding, D1 migration, or wrangler.jsonc changes are required.
