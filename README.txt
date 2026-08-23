WOOTEN OIL — STATEMENT/INVOICE NOTIFICATION CLICK REAL FIX

Root cause:
The notification list API had the document link, but the HTML notification
buttons did not carry action_type/action_id. The notification detail endpoint
also dropped those fields. That is why the popup displayed correctly but clicking
it did nothing.

Fixed:
- Dashboard notification items now include document action metadata.
- Header/mobile notification items now include document action metadata.
- Notification detail API now returns action_type/action_id.
- Popup preserves the metadata when full detail loads.
- Entire statement/invoice popup opens Statements & Invoices.
- Existing older statement/invoice notifications are also supported: the Worker
  securely locates the matching customer document and repairs the link.

Upload all:
- index.html
- request-fuel.html
- admin-customers.html
- worker.js

No manual D1 command is required.
