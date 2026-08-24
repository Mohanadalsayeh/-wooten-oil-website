WOOTEN OIL — STATEMENT / INVOICE NOTIFICATION FILENAME LINK

Requested behavior:
- Normal notifications remain normal notifications.
- The notification popup no longer shows an "Open Statement" or "Open Invoice" button.
- For statement/invoice notifications only, the related document name appears in the popup footer.
- The document name is clickable.
- Hover/focus adds an underline.
- Clicking the document name opens Statements & Invoices and highlights the matching document.
- Existing attachment buttons still work normally.
- The X close button still only closes the popup.

The Worker now also returns document_title/document_filename for linked notifications
so the popup can show the actual statement/invoice name.

Upload:
- index.html
- request-fuel.html
- admin-customers.html
- worker.js

No manual D1 or R2 changes are required.
