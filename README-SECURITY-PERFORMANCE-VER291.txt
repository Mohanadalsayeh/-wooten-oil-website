WOOTEN OIL CUSTOMER PORTAL — SECURITY & PERFORMANCE UPDATE VER291

Required deployment step
------------------------
Add a new strong, unique Cloudflare Worker secret named:

  ADMIN_OWNER_PASSWORD

Use username Admin and this new password for the main admin login. Keep
ADMIN_IMPORT_KEY only in the MAS 90 upload automation. Until
ADMIN_OWNER_PASSWORD is configured, the Worker intentionally keeps the old
ADMIN_IMPORT_KEY login behavior for deployment compatibility.

Upload
------
Upload every file and folder included in the Ver291 ZIP, preserving the assets
folder structure. Deploy worker.js as the Cloudflare Worker source.

Important behavior after deployment
-----------------------------------
- Existing browser admin sessions may need to sign in again.
- The owner login receives an opaque eight-hour session token.
- The MAS 90 import key can call only the two POST import endpoints after the
  new owner password is configured.
- Clearing customer or payment data requires the owner session and typing
  CLEAR in the confirmation dialog.
- Named administrators retain permission-scoped access but cannot clear either
  server database.

Recommended smoke test
----------------------
1. Sign in as Admin with ADMIN_OWNER_PASSWORD.
2. Load the customer database and Customer Activity dashboard.
3. Sign in to a shared-email customer account and switch between accounts.
4. Open Fuel Request History, Payment History, and Statements & Invoices.
5. Submit one test fuel request and confirm that it appears only once.
6. Run one small MAS 90 customer import and one small payment import.

Reliability safeguards in this version
--------------------------------------
- Bounded customer/admin/provider requests with readable timeout recovery.
- Cancellation and stale-response protection during account switches,
  searches, history refreshes, and Customer Activity navigation.
- Server-side customer payment pagination, search, and sorting.
- Coalesced notification loading with hidden/offline backoff.
- Cached schema setup with cold-start migration-race recovery, plus throttled
  session last-seen writes.
- Durable one-time communication/audit migrations instead of repeated
  full-history scans on normal admin requests.
- A 2,000-recipient broadcast safety cap, provider-failure stop protection,
  and bounded-concurrency Gmail/Twilio maintenance work.
- Size limits on JSON (including MAS 90 batches), multipart, PDF, webhook, and
  browser MDB inputs.
- Lazy MDB libraries, a 50 MB MDB browser limit, and debounced previews.
- Idempotent fuel-request retries and recoverable notification failures.

Known limitation
----------------
Accepted MDB files are still parsed in the browser's main thread. The new size
limit prevents extreme files, but a future Web Worker parser would provide the
best experience for very large Access databases. The lazy MDB parser also uses
version-pinned jsDelivr modules, so the admin import preview requires that CDN
to be reachable; bundling those dependencies locally is a future hardening
option. Account-recovery responses intentionally show masked delivery choices
and distinguish unavailable accounts, with rate limits reducing automated
probing risk. No application can guarantee that a device, network, provider,
or Cloudflare service will never pause; this version makes normal failures
bounded and recoverable instead of waiting indefinitely.
