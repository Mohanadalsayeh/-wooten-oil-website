# Sandbox payment notifications

Apply this changed-files ZIP after Wooten-Payment-Status-Emails-Update.zip, preserving folder paths. Deploy the Worker and frontend together. Production payments remain disabled in the existing Heartland integration.

For each new sandbox Approved, Pending, Canceled or Declined status:

- Customer portal: a notification appears for the payment's account, with the test status, amount, reference and Central timestamp.
- Admin portal: a Sandbox Payment alert appears in the bell for staff with Payment Transactions permission. Clicking opens the transaction and acknowledges that specific alert.
- Customer email and SMS: explicitly marked SANDBOX TEST, with the status, amount, reference and timestamp. They state no live funds were collected, the test will not post to the account, and the balance will not change.
- Office email: the existing office status workflow sends to payments@wootenoil.com.
- Office SMS: sends to the designated PAYMENT_ADMIN_SMS_TO phone number. The message also identifies the customer.

No sandbox message promises posting within 24 business hours. The live approved-payment customer notification workflow is preserved. Sandbox tests remain ineligible for MAS 90 posting.

## Office text setup

In Cloudflare, open the Worker's Settings → Variables and Secrets and add PAYMENT_ADMIN_SMS_TO with the intended office/admin SMS number in international format, such as +1 followed by the ten-digit US number. Use your actual number; no admin number is supplied in this ZIP. Deploy the configuration change. Office texts wait for this setting without blocking portal alerts or customer messages. When configured, queued office texts from this update can be sent.

The existing Resend and Twilio credentials/sender configuration remain required. SMS opt-outs continue to be respected for both customer and office numbers. PUBLIC_SITE_URL controls the signed delivery callback origin. Keep the two-minute payment cron trigger for delayed status updates and queued delivery processing.

## Delivery records and duplicate prevention

The transaction form shows each sandbox status event and the customer email, customer text and office text states, notes and message IDs. Office email results remain in Office email history. These fields are included in print/PDF output.

One event per transaction/status prevents repeated polling from resending messages. Pending followed by Approved intentionally creates two distinct status notifications. There is no bulk notification backfill for statuses recorded before this update's trigger was installed. The transient internal processing state is not a separate Pending alert.

Missing contact information is Not sent. Missing configuration waits. Provider acceptance is not proof of delivery; signed Twilio callbacks update SMS delivery/failure results. Failed or uncertain sends are recorded and not automatically resent. Check provider records before manually resending an uncertain message.

The new sandbox_payment_notifications table and triggers are created automatically. Customer portal notification creation is atomic with event activation. Do not clear the event table; it supplies duplicate protection. Customer portal messages use the existing notification popup and account access controls.

## Verification

Validated using SQLite/D1 fixtures, intercepted email/SMS calls and Chromium: all four statuses; sandbox-only selection; customer account assignment; customer portal insertion; admin permission filtering and individual acknowledgment; corrected office email recipient; customer and office SMS destinations; missing office number; concurrency and repeated polling; status transitions; callback ordering; fresh-schema initialization; desktop/mobile alert opening and delivery fields; JavaScript syntax and Worker bundle checks.

No real email/SMS was sent, no card was charged, and no deployment was performed during this work.
