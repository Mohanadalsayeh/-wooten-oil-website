WOOTEN OIL — PAYMENT TOKEN UPDATE
Integration version: token-scope-3

INSTALL
1. Unzip this file.
2. Upload the included worker.js to the same location in your GitHub repository,
   replacing the current worker.js. Commit the change. Upload the extracted file,
   not the ZIP. This update requires no frontend changes.
3. Wait for Cloudflare's deployment to complete and serve 100% of traffic.
4. Keep GP_ENVIRONMENT=sandbox and the current sandbox credentials.

This Worker includes the previous payment account selection fix. If you changed
unrelated Worker code after that update, merge this change into the newer file
instead of overwriting those changes. No secrets are included in this ZIP.

WHAT THIS UPDATE ADDRESSES
The provider log now shows both AUTHORIZE and PAYMENT_METHOD_DETOKENIZE failing.
The Worker previously requested a server access token with TRN_POST_Authorize
only. This update follows Global Payments' limited-token SDK example by requesting
PMT_POST_Create and TRN_POST_Authorize together, allowing both tokenization and
transaction processing accounts to be included in the token scope.

The server token stays on the Worker. The browser continues to receive only a
PMT_POST_Create_Single token. Card collection still uses Global Payments' hosted
fields. No direct detokenization endpoint is called by this Worker.

This is a correction to the token request and a possible fix for the observed
error, not proof that the merchant's provider configuration is complete.

Sandbox errors now return readable text in diagnostic, fixing [object Object]
with the deployed portal script. The detailed provider code and whether a
tokenization account was returned are visible. Additional metadata is available
in diagnostic_details in the charge Response. App keys, access tokens and card
numbers are excluded from these diagnostics.

TEST ONCE AFTER DEPLOYMENT
Sign out and sign back in. Start a new partial payment of $10.04 if the account
balance is at least that amount. Confirm the sandbox/test banner is present.
Use the published Global Payments test card:

  Number:     4263970000005262
  Expiration: 05/2039
  CVV:        599
  Name:       Test Customer

Use only test card details in sandbox. A successful sandbox transaction is test
data; do not post it to MAS 90 as money received.

If this test fails, send the new visible error text. The provider's detailed code
and tokenization scope status will identify the next diagnostic step. Do not send
Request/Payload data, real card information, cookies or App Keys.

If a payment is marked pending or awaiting confirmation, check its provider
result before another submission. This update preserves the existing safeguards
against resubmitting an uncertain payment.

VERIFIED LOCALLY
JavaScript syntax check and 17 regression tests passed. The checks use an
in-memory SQLite database and simulated provider responses. They verify the
separate token permission requests, readable/redacted errors, account selection,
amount integrity, outcome handling and duplicate-submission safeguards.
These tests did not contact Global Payments or submit a card transaction.
Successful end-to-end sandbox processing has not yet been verified.

Official references:
https://github.com/globalpayments/php-sdk/blob/master/test/Integration/Gateways/GpApiConnector/AccessTokenTest.php
See testGenerateAccessToken_WithLimitedPermissions.
https://developer.globalpayments.com/docs/getting-started/testing

This update does not enable production or activate real-money payments.
