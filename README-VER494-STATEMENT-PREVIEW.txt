Wooten Oil Portal - Ver494

Adds Preview Statements immediately above Generate & Send Statements.

1. Load customers and select the accounts to preview.
2. Choose the statement date and how many recent payments to include.
3. Click Preview Statements. One PDF opens for the complete selection.
   If the browser blocks the new tab, click Open Preview PDF below the buttons.
   Download Preview PDF saves the same combined file.
4. Each customer starts on a new page. Customer name, account number, address,
   and statement date appear on every statement page. Page X of Y resets for
   each customer. Recent payments are included when selected and available.
5. Previewing does not send email, SMS, or portal notifications, and does not
   publish documents to customer accounts. Generate & Send Statements remains
   the separate delivery action and uses the same PDF generator.

INSTALLATION
Copy the included changed files into the existing project, preserving paths.
Deploy both the website and Worker. Include assets/js/wooten-statement-pdf.mjs
with the Worker because worker.js imports it. No new environment variables,
credentials, or manual database migrations are required.

FILES
admin-customers.html
worker.js
assets/css/wooten-statement-preview.css
assets/js/wooten-statement-preview.mjs
assets/js/wooten-statement-pdf.mjs

VERIFIED LOCALLY
Authorization and input validation; missing-customer failure; exact PDF content
parity with the individual statement generator; no delivery/storage operations;
21-customer preview batching into one file; popup-blocked fallback; no partial
PDF after a failed batch; per-customer page counts; rendered layout with 20
payments; syntax checks for the Worker, modules, and admin page scripts.
Not deployed or tested against live customer data in this workspace.
