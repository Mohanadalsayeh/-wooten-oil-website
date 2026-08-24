WOOTEN OIL — CUSTOMER PAYMENTS IMPORT

Added under Admin > Database > MAS 90 Database:

Customer Payments Import
- Excel / CSV file selection
- Preview before import
- Auto-detects common MAS 90 payment column names
- Matches records by customer/account number
- Required fields: Account Number, Payment Date, Amount
- Optional: Reference/Check #, Payment Type/Method, Description/Memo
- Duplicate payment rows are skipped automatically
- Imports in chunks for larger files

D1:
- customer_payments table is created automatically on first import
- No manual D1 SQL command is required

New API:
POST /api/admin/customer-payments-import
- Protected by X-Admin-Key

Files changed:
- admin-customers.html
- worker.js

This lays the database foundation for the future customer Payment History page.
