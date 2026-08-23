WOOTEN OIL — DOCUMENT OPEN + CUSTOMER NOTIFICATION LINK

ADMIN
- Customer Documents list now has an Open PDF button.
- Admin document opening is protected by the Admin Import Key.
- PDF opens securely from the private R2 bucket.

CUSTOMER
- Uploading a Statement or Invoice automatically creates a portal notification:
  • New Statement Available
  • New Invoice Available
- The notification is linked to that document.
- When the customer clicks the notification, the normal notification popup is skipped.
- The portal opens Statements & Invoices automatically.
- The matching document is highlighted briefly in the list.
- Customer can then click Open PDF.

DATABASE
- portal_notifications automatically gains:
  action_type
  action_id
  if those columns do not already exist.
- No manual D1 command is required.

IMPORTANT
This applies to newly uploaded Statements/Invoices. Existing document uploads from before
this update will not automatically have linked notifications unless uploaded again or
a future migration is added.

Upload:
- index.html
- request-fuel.html
- admin-customers.html
- worker.js
