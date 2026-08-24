WOOTEN OIL — BULK PROFESSIONAL PDF STATEMENTS

Built on the current website project.

ADMIN > STATEMENTS & INVOICES
New "Send Account Statements" area:
- Load customer list
- Search customer #, name, or email
- Select individual customers
- Select all shown
- Select all customers
- Clear selection
- Selected customer count
- Choose statement date
- Option to email PDF when customer has an email address
- Generate & Send Statements button
- Progress/results for every customer

FOR EACH SELECTED CUSTOMER
The Worker creates an individual professional PDF statement containing:
- Customer name and customer number
- Statement date
- Current Balance
- Previous Balance = Aging 1 + Aging 2 + Aging 3 + Aging 4
- Total Balance = Current Balance + Previous Balance
- Aging breakdown:
  Current / 0-30
  31-60
  61-90
  91-120
  120+
- Wooten Oil company information
- Payment notice
- Professional one-page statement design

DELIVERY
Each generated PDF:
- Is saved privately in the customer's Statements & Invoices
- Creates "New Statement Available" notification
- Uses the actual PDF filename in the notification
- Can be opened securely from the customer portal
- Is emailed as a PDF attachment when an email exists and Resend is configured

BATCHING
The admin page automatically sends customers in groups of 10 so Select All can
handle large customer lists without one oversized Worker request.

No manual D1 command is required.
No new R2 bucket is required.
The existing NOTIFICATION_ATTACHMENTS private R2 storage is reused.

Upload:
- index.html
- request-fuel.html
- admin-customers.html
- worker.js
