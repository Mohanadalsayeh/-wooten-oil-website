WOOTEN OIL CUSTOMER AND PAYMENT IMPORT PROGRESS

Both MAS 90 import sections now upload records in batches and display live progress.

Preview loading
---------------
- Preview File is renamed Preview Customers.
- Customer and payment previews show a temporary loading bar while the file is read.
- Preview rows are prepared in 500-row browser batches with a live count and percentage.
- The preview loading bar hides automatically when processing finishes or fails.

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

Live databases
--------------
- Load Database is renamed Load Customers Database.
- Live customer and payment pages show temporary loading bars.
- Each returned page is rendered in 10-row browser batches before the bar hides.
