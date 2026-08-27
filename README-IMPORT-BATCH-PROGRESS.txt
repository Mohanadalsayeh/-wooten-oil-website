WOOTEN OIL CUSTOMER AND PAYMENT IMPORT PROGRESS

Both MAS 90 import sections now upload records in batches and display live progress.

Customer import
---------------
- 500 customer records per request.
- Progress bar shows percentage, imported count, processed count, and batch number.
- The imported metric updates after every completed batch.

Customer payment import
-----------------------
- 1,000 payment records per request.
- Progress bar shows percentage, newly imported payments, processed rows, and batch number.
- Duplicate and invalid payment totals remain included in the final result.

If a batch fails, completed batches remain imported and the progress panel shows how
many records finished before the error.
