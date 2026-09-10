WOOTEN OIL — EXTERNAL HOSTED PAYMENT UPDATE
Prepared September 10, 2026

What is included
The portal update contains only these changed project files:
  worker.js
  index.html
  assets/js/script-06.js
  assets/js/script-07.js
  assets/css/wooten-customer-payments.css
and this setup guide. Keep their existing folder structure.

What changes
Continue to Secure Payment creates a fixed-amount, SINGLE-use Global Payments
hosted payment link on the Worker and redirects the customer in the same tab.
The external page handles the card details. The old embedded charge route
returns 410 and cannot submit another charge.

Each attempt is stored with the customer ID, account number, amount, currency,
unique reference, environment, and Global Payments link ID before redirect.
This is the existing full/partial account-balance payment flow. It does not add
invoice selection or automatically allocate payments to individual invoices.

Background reconciliation uses GET /ucp/links/{id}; browser returns and optional
notifications only trigger that lookup. Their body is never trusted as proof
of payment. CAPTURED or FUNDED must match the saved link, amount, currency and
reference. Repeated notifications update one payment record. Browser closure
does not cancel a payment. Uncertain results block a new payment. An active link
with no pending transaction can be resumed, including after a declined attempt.
Only a processor-confirmed inactive/expired unpaid link is released, after
repeated checks and a ten-minute finality grace period. Unresolved transactions
remain reserved for verification/manual review. Recently closed records are
rechecked for three days to catch delayed results.

Payment history shows the result. HPP sandbox records are labeled as tests.
The MAS 90 imported ledger still determines account balances and lifetime totals;
this update does not change balances or credit a payment twice on import.

REQUIRED DEPLOYMENT STEPS
1. Back up the current five project files. Apply these replacements together
   through the existing Cloudflare deployment process. No live site was changed
   while preparing this package. No bindings or credentials are included.

2. Preserve the existing GP_APP_ID and GP_APP_KEY secrets and DB binding.
   GP_ENVIRONMENT remains sandbox. GP_PRODUCTION_ENABLED has NOT been enabled.
   The existing wrangler.jsonc is intentionally not replaced, so its bindings,
   secrets, and any schedules managed outside that file are preserved.

3. Add a Cloudflare Cron Trigger with this exact expression to the wooten-oil
   Worker, without deleting its existing triggers:

       */2 * * * *

   This is the dedicated payment check every two minutes. The Worker preserves
   the existing behavior for other cron expressions. If you already have this
   exact expression running other scheduled work, keep that work on a different
   trigger expression before using this package. Do not blindly replace the
   entire trigger list. If schedules are managed in wrangler.jsonc, merge this
   expression into its existing triggers.crons array through your normal deploy.

   Let the trigger execute. The Worker automatically creates the new D1 tables
   hosted_payment_links and hosted_payment_health. Creating/resuming a payment
   requires a successful schedule heartbeat within the last five minutes.
   It intentionally stays unavailable until background confirmation is running.
   Each run processes up to five due links; a queue can delay confirmation beyond
   two minutes. Outstanding links continue to be checked after the browser closes.

4. Have Global Payments confirm that this exact app/account supports both:
       POST /ucp/links with type HOSTED_PAYMENT_PAGE
       GET /ucp/links/{id}, including transaction outcomes
   Their published API says live availability depends on merchant configuration.
   The first link is independently retrieved before it is offered to a customer;
   if retrieval is unavailable, the portal will not send the customer to it.

   The default account name is transaction_processing, as used in their HPP guide.
   If Global Payments identifies a different authorized HPP account, set either
   GP_HPP_ACCOUNT_ID or GP_HPP_ACCOUNT_NAME to that exact value. An ID takes
   precedence. This setting is separate from the old GP_TRANSACTION_ACCOUNT_ID.
   Do not choose an account based only on its name containing hpp.
   Access tokens stay on the Worker. They use the app's granted scope because
   this package does not invent undocumented link permission names.

5. Give Global Payments the SEPARATE Wooten-Oil-HPP-Theme.zip package. Ask them
   to test and activate the sandbox desktop/mobile templates on this HPP account.
   These templates are not deployed by uploading them to your Wooten Oil site.
   Their customization guide requires sending modified templates to your account
   manager for testing. Until activated, their default hosted-page design may show.

6. Perform a documented sandbox-card test. Close the portal before completing
   payment on the hosted page. Sign in again after a background check and confirm
   the result, account mapping and Payment History. Also test a decline, an
   abandoned page, and a duplicate return. Use test cards only while sandbox is on.

7. Before any real payment, separately provision production HPP/link-retrieval
   access, verify the background schedule with production credentials, activate
   the production theme and repeat the provider's required readiness checks.
   Review unresolved sandbox/legacy attempts before changing environments. The
   code will not silently dismiss old pending payments or switch their credentials.

Troubleshooting
- Background confirmation not running: check the dedicated cron, Worker logs,
  DB binding, GP credentials and hosted_payment_health heartbeat.
- Hosted link retrieval/configuration error: Global Payments must enable the
  correct app/account capabilities. A new hosted page does not fix provisioning.
- Earlier payment awaiting confirmation: inspect the processor's actual result
  before resolving that specific attempt. Do not delete all pending rows or
  mark a payment declined merely to bypass the duplicate-payment guard.
- Processor outage: the record stays pending, the error is logged without card
  details, and checks continue. Staff review is needed for persistent mismatches.
- Return URLs contain a random verification key; treat full URLs/logs as private.
  Payment status endpoints also require the correct signed-in customer account.

Validation performed
35 server and client regression checks passed. JavaScript syntax checks passed.
Local tests use a real in-memory SQLite ledger and mocked processor HTTP responses.
They cover background-only capture, atomic duplicate prevention, account isolation,
forged callbacks, matching amount/reference/currency, active declines, timeout,
expiry, delayed capture, production lock and refusal of unknown payment URLs.
No real or sandbox processor requests using your credentials were made, no card
was charged, and no deployment was performed. The browser service blocked the
local preview; the included preview HTML has not been visually checked there.

Official references
https://developer.globalpayments.com/docs/payments/online/hosted-payment-page-guide
https://developer.globalpayments.com/docs/payments/online/hosted-payment-page-customization
https://developer.globalpayments.com/api/links
