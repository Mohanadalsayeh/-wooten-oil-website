Wooten Oil Portal — Ver1099 CHANGED FILES ONLY

Apply over the existing deployed Ver1098 portal, keeping the relative paths intact.
Deploy updated Cloudflare Pages assets and Worker modules together.
Do not replace your D1 database or modify the office MAS 90 collector.

Changes:
- Customer Fleet Cards & Transactions history retains and displays declined,
  canceled and in-process transactions returned by Intevacon. A decline reason
  appears alongside Declined status when the API supplies one. API-provided
  customer fields remain scoped to the logged-in account; customer monetary
  information remains hidden.
- Customer fuel totals count completed transactions only. Declined attempts are
  not represented as completed fuel purchases.
- Statements and statement PDFs contain ONLY Processed/Invoiced/Complete
  transactions. No declined, canceled or in-process rows are printed.
- Completed transactions are selected and displayed by their Intevacon
  LocalDateTime purchase timestamp rather than ReceivedDateTime. This includes
  delayed invoices that have already been saved in the portal database.
- Missing local purchase times for completed records received in the period
  block statement creation rather than being silently assigned another date.
- MAS 90 importing, MAS 90 payment selection and Intevacon synchronization
  schedule/API request parameters remain unchanged.

Important limitations:
- In the supplied export, no declined transactions were stored. This change
  will show and retain declined transactions IF the Intevacon API returns them;
  it cannot recover records that Intevacon does not provide to the API.
- LocalDateTime is assumed to be the merchant's local time for the relevant
  West Tennessee merchant. Intevacon's official timezone definition is not
  yet confirmed. No blind fixed UTC/Eastern offset is applied.
- Actual completeness of saved transaction history must be validated on live
  data, especially for delayed invoices and batches.

Automated local checks:
node --test tests/intevacon-statement-ver1099.test.mjs \
  tests/statement-period-ver1097.test.mjs \
  tests/intevacon-export-ver1098.test.mjs

Deployment not performed by this ZIP creation.
