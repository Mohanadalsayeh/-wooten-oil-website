WOOTEN OIL — LIVE CUSTOMER PAYMENTS DATABASE

Payment date display:
- Changed to MM-DD-YYYY in the payment-file preview.
- Changed to MM-DD-YYYY in the Live Customer Payments Database.
- Changed to MM-DD-YYYY in the customer Payment History.
- D1 keeps ISO YYYY-MM-DD internally for correct sorting/filtering.

Admin > Live Customer Data:
Added "Live Customer Payments Database" below the existing Live Customer Database.

Features:
- Search by Customer #, Customer Name, Check #, Invoice #, Deposit #, Deposit Type
- Deposit Type filter
- From Date / To Date filters
- Cash Amount filter
- Sort by posting date, customer #, amount, or check #
- 50 rows per page
- Previous / Next pagination
- Refresh
- Clear Filters

Displayed columns:
DepositDate
DepositNo
DepositType
CustomerNo
CheckNo
PostingDate
CustomerName
InvoiceNo
CashAmountApplied
DiscountAmountApplied

New protected API:
GET /api/admin/customer-payments-database

Files changed:
- admin-customers.html
- worker.js
- assets/js/script-07.js

No manual D1 SQL required.
