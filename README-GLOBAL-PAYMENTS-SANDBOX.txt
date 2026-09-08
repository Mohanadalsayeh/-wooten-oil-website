WOOTEN OIL CUSTOMER PORTAL — EMBEDDED GLOBAL PAYMENTS

STATUS
The portal is configured for Global Payments sandbox testing. Customers stay in
the Wooten Oil portal while Global Payments Hosted Fields securely collects and
tokenizes card details. Card numbers and payment tokens are not stored by the
portal.

WHAT WAS ADDED
- Full-balance and partial-payment checkout in the customer portal.
- Server-generated short-lived Global Payments client tokens.
- Server-side SALE transactions with automatic capture and idempotency keys.
- A 15-minute payment intent, amount validation, session validation, same-origin
  validation, and payment-attempt rate limiting.
- Immediate portal payment status in customer Payment History and Admin Customer
  Activity. The MAS 90 import remains the accounting source of truth.
- A production safety lock. Live charges cannot run until explicitly enabled.

ONE-TIME SANDBOX SETUP
From the project directory, add the two values from the Global Payments developer
portal as encrypted Cloudflare Worker secrets:

  npx wrangler secret put GP_APP_ID
  npx wrangler secret put GP_APP_KEY

Do not paste either value into worker.js, wrangler.jsonc, GitHub, email, or chat.
Then deploy the Worker using the project's normal Cloudflare deployment process.

SANDBOX TEST
1. Sign in to a customer account that has a positive balance.
2. Open Account Details and choose full balance or a partial amount of at least $1.
3. Select Continue to Secure Payment.
4. Use a Global Payments sandbox test card from the developer documentation.
5. Confirm the result appears in customer Payment History and Admin Customer
   Activity as a Customer Portal transaction.

PRODUCTION ACTIVATION
Sandbox keys do not process real money. Before enabling live payments, Global
Payments/Heartland must confirm that the Wooten Oil production merchant account is
approved and connected to this Unified Payments application. After that approval:

1. Replace GP_APP_ID and GP_APP_KEY with the production app credentials using
   encrypted Worker secrets.
2. Change GP_ENVIRONMENT in wrangler.jsonc from sandbox to production.
3. Add GP_PRODUCTION_ENABLED=true as a Worker environment variable.
4. Deploy and complete a controlled live transaction with Global Payments support.

IMPORTANT ACCOUNTING NOTE
An approved portal payment is shown immediately as submitted, but the displayed
customer balance continues to come from MAS 90. It will update after the payment is
posted and the next customer/account import is completed. Portal transactions are
not added to the lifetime payment total separately, which prevents double counting
after MAS 90 imports the same payment.
