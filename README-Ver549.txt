Wooten Oil Portal — Ver549

Apply these changed files over your current portal files:
  admin-customers.html
  worker.js
  assets/js/wooten-statement-progress.js
  assets/js/wooten-statement-history-server.mjs

Deploy worker.js with the included server module, then publish the HTML and browser script. Refresh the admin page afterward. Existing assets and Worker bindings are still required; this is an update package, not a complete standalone site.

Remove the two obsolete Ver548 files if installed:
  assets/js/wooten-no-email-customers.mjs
  assets/js/wooten-no-email-imports.mjs
The new HTML and Worker no longer load either file. No customer records are deleted by this update.

Changes:
- Removes the Customers Without Email tab, automatic membership tracking, import notices, and Ver548 blank-email replacement behavior.
- Adds Customer Email under Statement & Delivery Settings: All customers, With email, Without email. Applies to both Cycle A and Cycle B previews and scheduled runs. Initial choice is All customers.
- Keeps the existing cycle assignment, active-account and positive-balance rules. Exceptional customers remain outside both cycles.
- Adds Generate Statements to each cycle. Open Preview A/B, check the desired customers, then Generate Statements to create printable PDFs without email, SMS, or portal delivery. Open a customer PDF or use Save PDF in the progress window.
- On phones, Preview and Generate each fill a row; Test and Run share a row equally.

Verification:
- SQL checks cover both cycles, all email filters, balances, inactive accounts, and exceptional customers.
- Generation checks cover exact selected accounts, private customer and combined PDFs, both cycles, authorization, and no delivery.
- Phone layout checked at 320, 390, 430, and 700 pixels.
