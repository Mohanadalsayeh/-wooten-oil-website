WOOTEN OIL — STATEMENTS & INVOICES DOWNLOAD

Built from: Stage 1 Done

CUSTOMER PORTAL
- New dashboard button: Statements & Invoices
- Secure list of customer PDF documents
- Search documents
- Filter: All / Statements / Invoices
- Open PDF in a new tab
- Customer session is required
- A customer can only access documents assigned to their own account

ADMIN PAGE
- New tab: Statements & Invoices
- Enter Customer Number
- Choose Statement or Invoice
- Enter document date
- Optional title / invoice number
- Upload PDF
- View documents already uploaded for that customer
- PDF limit: 10 MB

STORAGE / SECURITY
- Uses the existing private R2 binding:
  NOTIFICATION_ATTACHMENTS
- Uses a new D1 table created automatically:
  portal_customer_documents
- No public R2 URLs are created
- Download endpoint validates the signed-in customer's account number before returning the PDF

IMPORTANT
This feature gives you a secure way to manually upload statements/invoices now.
It does not automatically pull invoice PDFs from MAS 90/Sage yet. Automatic accounting-system
sync can be added later without changing the customer-facing Documents area.

Upload:
- index.html
- request-fuel.html
- admin-customers.html
- worker.js

No manual D1 command is required. The Worker creates the document table automatically.
No new R2 bucket is required; it uses the existing secure attachment bucket.
