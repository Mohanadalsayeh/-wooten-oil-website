Wooten Oil Portal Ver111
Linked-account statement/document link improvement

Change:
- Direct statement/document links now use the same linked-account authorization rule as the customer account switcher.
- If a customer is signed in to Account A and opens a statement link belonging to Account B, and both active accounts share the same email address, the existing session is securely switched to Account B and the document opens.
- If the customer is signed out, the existing document_token flow sends them to Customer Login. After successful login, the preserved link is reopened and the Worker performs the same secure linked-account switch automatically.
- If the document belongs to an account that is not linked by the same email, access remains blocked with HTTP 403.
- A document-link account switch is recorded in customer login activity as document_link_switch.

No database migration or new Cloudflare binding is required.
