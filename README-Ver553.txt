Ver553 — Manual Cycle Statements

Apply over Ver552: replace admin-customers.html and worker.js. Deploy the updated Worker to stop automatic statement sending, then publish the HTML and refresh the admin page. Keep existing supporting assets.

Statement Scheduling is now Cycle Statements. Day/time/frequency controls are replaced by a shared Statement Date for Cycle A, Cycle B, and Test All Cycles. This date is printed on the statements; balances and recent payments still use the latest imported data. It is not a historical cutoff or historical balance calculation.

Select the statement date, choose the email/balance/delivery settings, then Preview A/B and select customers. Test validates PDFs without sending; Run sends using selected delivery options; Generate creates printable PDFs only. Test All uses the same date for both selected cycles. Save Settings stores the chosen date and options.

Automatic statement starts and continuations are disabled in the Worker. An already executing request may finish; this update cannot recall messages already sent. MAS 90, fleet synchronization, payment reconciliation, Gmail synchronization, and backup jobs are unchanged.

Includes previous email filter disabling, temporary control locks, and rotating Updating indicator. Existing statement PDFs are preserved.

Verified: shared date UI and save, printed-date propagation, Test All date propagation, invalid-date rejection, disabled automatic paths, selected-account generation, email filters, and no-delivery PDF generation.
