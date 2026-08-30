WOOTEN OIL PORTAL — VER105
Selected-customer statement delivery

Statement Scheduling manual actions now use explicit customer selection.

Cycle A / Cycle B:
- Open Preview A Customers or Preview B Customers.
- Select one or more customers with the checkboxes.
- Test A, Test B, Run A Now, and Run B Now process ONLY those selected customers.
- The Test/Run buttons remain disabled until at least one eligible customer is selected.
- Select All Matching can be used before Test/Run when a filtered group is desired.

Test A / Test B:
- Test is now a real test SEND to the selected customers only.
- It uses the saved Portal, Email, and SMS delivery settings plus each customer's delivery preferences.
- PDFs are stored in the selected customer accounts and Communication History is updated.
- Reports are labeled TEST SEND.

Server protection:
- Manual /api/admin/statement-scheduling/run requests require account_numbers.
- Selected account numbers are normalized and intersected with the current eligible Cycle A/B customer list.
- Manual Test/Run cannot fall back to all customers when no selection is provided.
- Automatic scheduled Cycle A/B runs are unchanged and continue to process the eligible cycle automatically when due.

Files changed:
- admin-customers.html
- worker.js
