# Payment received notifications

Install the files in this ZIP over the latest MAS 90 Posting Update, preserving their paths. Deploy the Worker together with the frontend files. This package does not enable production payments or change gateway credentials.

## Behavior

A newly verified, captured live USD payment creates one saved notification event. The confirmation includes its amount and original portal confirmation number:

> Wooten Oil: Your payment of $106.76 has been received. Confirmation: WOH-example. It will be posted to your account within 24 business hours.

- Admin bell: Payment Received, customer, amount, reference and Central date/time. Staff with Payment Transactions access can open the transaction from this alert. Opening successfully acknowledges the alert for all staff. The bell refreshes every 60 seconds or when opened/refreshed.
- Customer email: subject “Payment received — [confirmation]”, with the message above.
- Customer SMS: same acknowledgment, followed by “Reply STOP to opt out.” Existing SMS opt-outs are respected.
- Transaction form: saved email and SMS delivery states, message IDs, notes and attempt times. These fields also appear in its PDF/print export.
- The existing customer payment notice and receipt explain the 24-business-hour posting delay. Account balances still come from MAS 90; sending a message never changes a balance or marks a payment posted.

Sandbox, unknown-environment, pending, declined, canceled, unverified and unresolved-review payments do not send received/posting confirmations. Previously captured payments are not backfilled or emailed on deployment. The existing Heartland implementation remains sandbox-only pending a separate production integration update.

## Configuration

Uses existing Worker settings:

- RESEND_API_KEY, FUEL_FROM_EMAIL (default support@wootenoil.com). The sender must be authorized by the email provider.
- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER.
- PUBLIC_SITE_URL for signed SMS delivery callbacks (default https://wootenoil.com). Use the actual public Worker/portal origin so callbacks arrive without redirects.
- Keep the existing */2 * * * * scheduled trigger for delayed verification and queued notification processing. Existing scheduled work is preserved.

No credentials are included in this package. New database schema is created automatically by the payment schema initializer; no manual SQL migration is needed. It adds payment_notification_events and a capture-transition trigger. Do not clear this event table: it provides duplicate protection and delivery history.

## Delivery handling

Each channel is claimed atomically before contacting its provider. Status polling, simultaneous jobs and repeated capture updates cannot send it twice.

Missing service configuration remains queued and is retried when configuration is available. Missing contact details are marked Not sent. Rejected messages show Failed. Network timeouts, missing provider IDs or interrupted sends show Needs delivery review and are not automatically resent; staff should check the provider using the saved record before contacting the customer again. This avoids duplicate messages after an uncertain provider response.

Email Accepted by provider is not proof of inbox delivery. SMS Accepted by provider is not proof of handset delivery; signed Twilio callbacks update delivery/failure status. The payment remains successful even if messaging fails. Message results live in the payment transaction form; this update does not add them to the separate Communication History table.

## Validation

Validated locally using an in-memory SQLite/D1 adapter, simulated payment records, intercepted Resend/Twilio requests and Chromium. Checks cover capture-only event creation, no historical backfill, concurrent dispatch, live-only eligibility, unresolved review, amount/reference/message contents, both messaging channels, missing configuration recovery, missing contacts, opt-out/rejection handling, uncertain results, signed-callback handler wiring and callback ordering, admin permissions and cross-origin acknowledgment rejection. Browser checks verify the bell opens the transaction, acknowledges it and displays delivery states on desktop and phone. Worker bundle and JavaScript syntax checks passed.

No real customer messages, live transactions or deployment were performed.
