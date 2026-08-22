WOOTEN OIL — LIVE DATABASE LAYOUT V2

Replace:
- admin-customers.html
- worker.js
- index.html

Database tab improvements:
- Main table is cleaner and narrower.
- Main columns: Customer #, Customer/Company, Email, Phone, Current Balance, Status, Online Account.
- Each row has a View button.
- View opens a customer detail window with:
  city, state, ZIP, updated date, account status, online-account status,
  Current Balance, Aging 1, Aging 2, Aging 3, Aging 4.
- Search, filters, sorting, pagination, and read-only protection remain unchanged.
- No Cloudflare, D1, or wrangler.jsonc changes are needed.
