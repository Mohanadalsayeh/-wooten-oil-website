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
- The Load Customers Database button is wider for the longer label.
- Live customer and payment pages show temporary loading bars.
- Each returned page is rendered in 10-row browser batches before the bar hides.

Other admin loading bars
------------------------
- Load Communication Log renders customer summaries in 5-row batches.
- Load Inbox is renamed Load Outbox and renders messages in 20-row batches.
- Send Account Statements loads customers in 200-row batches.
- Generate & Send Statements keeps its confirmation prompt, sends 10 customers per
  batch, and shows a progress bar until all selected customers are processed.
- After the sending progress bar closes, a persistent status report shows selected,
  processed, successful, failed, Portal, Email, SMS, batch, and statement-date totals.
