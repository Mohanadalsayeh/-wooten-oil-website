WOOTEN OIL — MOBILE PREFERRED DELIVERY DATE WIDTH FIX

Fixed the Preferred Delivery Date field on phones.

Problem:
Mobile Safari/iPhone can render HTML date inputs wider than their parent grid,
making the date field stick outside the Fuel Request form.

Fix:
- Forces the date input to 100% of the available width.
- Removes browser minimum-width overflow.
- Keeps the field inside the form on iPhone/mobile.
- Preserves the existing desktop layout.

Upload:
- index.html
- request-fuel.html
- admin-customers.html
- worker.js

No Cloudflare, D1, R2, or wrangler changes are required.
