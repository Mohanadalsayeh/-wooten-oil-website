WOOTEN OIL — INDIVIDUAL CUSTOMER PAYMENTS + PORTAL HISTORY

Changes:
- DepositType, ARDivisionNo, TransactionType, and InvoiceType are ignored.
- MAS 90 payment rows are NOT combined.
- Each valid payment/application row is stored separately.
- InvoiceNo is used internally only to prevent duplicate re-imports; it is not shown to customers.
- Added customer Payment History dashboard card.
- Added search and sort options.
- Added Total Paid at the bottom for the logged-in customer.
- Customer only sees rows tied to their authenticated account number.

Files changed:
- admin-customers.html
- index.html
- assets/js/script-07.js
- assets/css/wooten-customer-payments.css
- worker.js

No manual D1 SQL required; schema updates happen automatically.
