Wooten Oil Portal — Ver1098 | Intevacon API All-Field Transaction Exports
=====================================================================

CHANGES
- Adds "Export Filtered PDF" and "Export Full Database — Excel" to the
  Intevacon API Transactions result table in Fleet Cards & Transactions.
- PDF exports ALL matching records (not just the visible page), using the
  current loaded API-result search OR the applied saved-history date/card/
  search filters. The readable PDF lists EVERY AVAILABLE API field in
  transaction/field/value form, including product detail rows and tax fields.
- Excel exports ALL records currently saved in the Intevacon transaction
  archive (no date or search restriction), page by page. 3 worksheets:
  Transactions — all scalar Intevacon API fields stored for each transaction,
  Products — all available Details fields with parent TransactionID,
  Taxes — all available product Taxes fields with TransactionID/DetailIndex.
- Missing fields remain blank. Long IDs and card numbers remain text.
- Intevacon source date/time values remain exactly as supplied by the API;
  this update performs no unverified timezone conversions.
- Includes an admin-permission-checked, read-only endpoint:
  GET /api/admin/fleet/export?scope=full&page=1
  GET /api/admin/fleet/export?scope=filtered&from=YYYY-MM-DDTHH:MM&to=...&search=...&card=...&page=1
  It reads the existing saved JSON records in read-only 200-row pages.

IMPORTANT
- "Full Database" refers to all Intevacon transactions previously SAVED in
  the portal's transaction archive; it does NOT query Intevacon for missing
  historical transactions. Run the existing history sync if coverage is missing.
- Exports all fields the API integration currently captures and stores.
  Future fields that the existing API parser does not capture cannot be exported.
- No edits to MAS 90 import, Intevacon API retrieval, synchronization schedule,
  fleet/customer transaction storage, customer statements, or statement time
  logic. No live deployment has been performed.
- For a large PDF, narrow the current date/search filters to reduce size.

INSTALL
Full: deploy all contents of the Ver1098 FULL ZIP as the previous portal.
Changed-files-only: copy/replace the included paths into your existing Ver1097
source and redeploy BOTH Cloudflare Pages and the main Cloudflare Worker. Any
cached browser page should be refreshed after deployment.

TESTS
node --test tests/intevacon-export-ver1098.test.mjs tests/statement-period-ver1097.test.mjs
Syntax: node --check worker.js && node --check assets/js/wooten-intevacon-api-export.js
