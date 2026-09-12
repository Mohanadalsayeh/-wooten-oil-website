# Office payment status emails

Apply these changed files after Wooten-Payment-Notifications-Update.zip, preserving paths. Deploy the updated Worker with its payment modules and frontend files. This update adds office status emails to the existing customer confirmation workflow.

## Recipient and content

Office payment-status emails go to payments@wootenoil.com. The mailbox or forwarding alias must already exist with your email provider; deploying portal code does not create it. Customer confirmations still go to the customer's email/phone. The sender uses the existing FUEL_FROM_EMAIL setting, with support@wootenoil.com as its fallback.

Emails cover:
- Approved (captured)
- Canceled
- Pending (saved as awaiting confirmation)
- Declined (Denied)

Each includes customer name/number, amount/currency, portal reference, processor transaction ID when available, status timestamp in Central Time, and environment. Sandbox emails explicitly state that no live funds were collected and the test must not be posted to MAS 90. Unknown-environment and review records carry verification warnings. An earlier queued status is identified as historical when the saved status has since changed.

A payment can produce a Pending email and later an Approved or Declined email. Repeated polling or revisiting an already reported status does not produce duplicates. The brief internal processing state does not generate a separate Pending email. Declined and canceled messages do not say funds were received. The customer receipt/posting notice remains restricted to verified successful live payments.

## Operation

- Uses the existing RESEND_API_KEY and authorized sender settings.
- Payment status, charge and cancellation handlers schedule dispatch; the existing payment reconciliation cron also drains the queue. Keep the */2 * * * * payment trigger.
- Schema initialization adds payment_status_emails and its transition trigger automatically. No historical transaction emails are backfilled on deployment.
- One saved event per payment/status provides duplicate protection. Do not clear this table.
- Missing email configuration waits for configuration. Provider rejection is recorded as Failed; ambiguous failures or interrupted sends require delivery review before resending. Accepted means accepted by the provider, not confirmed inbox delivery.
- Open the transaction form to see Office email status history, recipient, timestamps and message IDs. These details are included in transaction print/PDF output.

## Verification

Local SQLite/D1 tests covered all four statuses, payments@wootenoil.com recipient, sandbox wording, concurrency, repeated polling, status changes, historical-event wording, no backfill, configuration recovery, uncertain send handling, detail history, and actual Worker dispatch with mocked Resend/Twilio. Customer email and SMS behavior remains intact. JavaScript syntax and Worker bundle checks passed. No real email/SMS, live payment or deployment was performed.
