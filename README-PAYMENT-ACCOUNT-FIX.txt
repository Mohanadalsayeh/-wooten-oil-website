WOOTEN OIL — PAYMENT ACCOUNT SELECTION FIX
Integration version: account-selection-2

UPLOAD
1. Unzip this update on your computer.
2. Replace only worker.js in the same location in your GitHub repository.
   Do not upload the ZIP itself, delete the repository, or replace other files.
3. Commit the change and wait for the normal Cloudflare deployment to finish.
4. Confirm the newly deployed version serves 100% of traffic.
5. Keep GP_ENVIRONMENT=sandbox and your existing sandbox app credentials.
   Do not enable GP_PRODUCTION_ENABLED or switch to production to test this fix.

This update is based on the portal files retained from this conversation.
If worker.js has since received unrelated updates, do not overwrite those newer
changes. Supply the current worker.js so this bounded fix can be merged instead.
No database deletion or new binding is needed. Never put app keys in GitHub.

WHAT CHANGED
- Selects the standard transaction_processing account by name rather than the
  first TRA account returned by Global Payments. Your app has both standard and
  HPP processing accounts, so their order must not decide routing.
- Sends the selected account ID without a redundant account name.
- Supports optional GP_TRANSACTION_ACCOUNT_ID. If supplied, the ID must match an
  authorized TRA account from this app; a bad value never silently falls back.
  Leave it unset for your existing transaction_processing account.
- Separates request/configuration errors from actual card declines. In sandbox,
  returns the selected account, provider HTTP status, error code and sanitized
  provider description. It does not log app keys, access tokens or full PANs.
- Requires confirmed CAPTURED status and a transaction ID for a success receipt.
  An API action marked SUCCESS or a PREAUTHORIZED payment alone is not captured.
- Fixes the concurrent-submit lock; preserves uncertain payment outcomes instead
  of automatically reopening them for another charge. New sessions are blocked
  while an existing payment for that account is processing or unresolved.
- Keeps failed/pending attempts visible in customer and admin payment history.
- Rejects an API URL override that points to a different payment environment.
- Preserves the previous short-nonce correction and production safety lock.

ONE CONTROLLED SANDBOX TEST
1. Sign in to the portal and choose a partial payment of $10.04, provided the
   account balance is at least that amount. This matches the provider's test
   scenario for a transaction using a payment token (1004 cents).
2. Select Continue to Secure Payment. Confirm the sandbox/test warning is shown.
3. Use ONLY this published Global Payments test card:

   Card type:       Visa
   Card number:     4263970000005262
   Expiration:      05/2039
   CVV:             599
   Cardholder name: Test Customer

4. Submit once. A successful sandbox result is not a real customer payment.
   Do not post it to MAS 90 as received money.
5. If unsuccessful, send only the visible error message or the charge Response
   diagnostic. Never send Payload/Request data, cookies, tokens, actual card
   information, or your App Key.
6. If a result is pending or uncertain, do not keep submitting. Its actual result
   must be checked before clearing or restarting it; this update never clears
   unresolved attempts automatically.

Sources checked:
https://developer.globalpayments.com/docs/getting-started/testing
https://developer.globalpayments.com/ecommerce/resources/test-card-numbers
https://github.com/globalpayments/php-sdk/blob/master/test/Integration/Gateways/GpApiConnector/CreditCardNotPresentTest.php

VERIFICATION AND LIMITATIONS
JavaScript syntax checked. Fifteen local regression checks passed using an
in-memory SQLite database and mocked provider responses; no card was submitted
and no real Global Payments request was made by those tests. Checks include
scope order, invalid overrides, correct amount, declines, configuration errors,
concurrent submissions, captured replay, uncertain outcomes, environment safety,
and expired sign-in.

This corrects confirmed code defects; it does not prove that the original
CONFIGURATION_DOES_NOT_EXIST response was caused by account selection. If a test
with the correct account and documented card still fails, the improved diagnostic
is needed to identify any remaining merchant/region/currency configuration issue.

Live merchant provisioning and a successful end-to-end sandbox transaction have
not been verified. This ZIP does not activate real-money customer payments.
