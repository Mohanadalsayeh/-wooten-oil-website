# Heartland certification update — Ver478

This is a sandbox-only update for the existing Wooten Oil portal. It does not enable production payments or establish Heartland certification approval.

## Install

1. Replace the included files in the existing GitHub project. Keep their folder paths.
2. Deploy both Cloudflare Pages and the Worker. The Worker and payment modules changed.
3. In the Worker's variables/secrets, use the matching credentials from Edgar's certification email:
   - PAYMENT_PROVIDER = heartland
   - HEARTLAND_ENVIRONMENT = sandbox
   - HEARTLAND_PUBLIC_API_KEY = the email's pkapi_cert_ public key
   - HEARTLAND_SECRET_API_KEY = the email's skapi_cert_ secret key, stored as a Secret
4. Keep the existing D1 binding, ADMIN_IMPORT_KEY, and payment background cron configured.
5. Refresh the customer page after deployment. Allow the next cron check to establish payment readiness.

Do not put the secret key in GitHub or browser code. Credentials are not included in this ZIP. Resolve any older pending test payment using its original keys before changing keys; the portal deliberately binds reconciliation to the keys used for that payment.

Developer ID 002914 and VersionNbr 6408 are included in the SOAP header for every Heartland request. Version 6408 is Heartland's assigned identifier, separate from the portal ZIP version.

## Card certification

The existing hosted card fields remain in use. The Worker receives a token, not card numbers or CVV. The checkout now collects billing street address and ZIP and sends them for AVS. AVS/CVV response codes appear in the admin transaction details and exports. Additional definitive decline codes are handled without leaving them pending; ambiguous/network responses still require reconciliation.

An optional shipment date sends DirectMktData. Leave it blank for an account payment without a shipment. Ask Heartland how they want the script's shipment-date requirement handled for balance payments. The invoice/reference sent is the portal payment reference, not an invented MAS 90 invoice.

Use the supplied Secure Submit spreadsheet's applicable SALE tests in order, with the listed amounts, AVS addresses, and security codes. The spreadsheet says only transaction types the integration supports must be processed. Confirm supported brands, including JCB, with Heartland. Multi-use stored cards, delayed capture, card refunds/reversals, surcharges, Apple Pay, and Google Pay are not implemented by this update. The supplied reversal and capture cross-references contain inconsistencies; obtain clarification before treating those cases as applicable.

Do not use real card details during certification. Get current certification card numbers from Heartland's test-card resource referenced by the spreadsheet.

## ACH certification

On the customer account payment panel, select Bank account (ACH), choose the payment amount, and continue. Existing Main Admin sandbox approval is still required.

The bank form includes account holder name, ownership, checking/savings, routing number, account number confirmation, and an unchecked authorization checkbox. For this certification build, the server only accepts Heartland's supplied test routing number 122000030 and account number 1357902468. It rejects other bank numbers. Use your first and last names as directed by the script.

Run the four visible tests in ACH Test Script.xlsx, in order:

| Test | Ownership | Account | Amount | Operation |
| --- | --- | --- | --- | --- |
| 1 | Personal | Checking | $1.23 | ACH sale, WEB |
| 2 | Personal | Savings | $12.34 | ACH sale, WEB |
| 3 | Business | Checking | $123.45 | ACH sale, WEB as supplied in this script |
| 4 | Original test 1 | Original account | Void $1.23 | CheckVoid referencing test 1's gateway ID |

The WEB/business combination follows the supplied certification script. Confirm the production business-payment setup with Heartland before a live release.

To run test 4, sign in as Main Admin, open Payment Transactions, open the original $1.23 ACH record, and choose Void sandbox ACH test. Confirm the displayed amount. The original and void transaction IDs are recorded separately. This control cannot void live payments and is unavailable to delegated admin users. An uncertain void is checked, never automatically resubmitted.

Fill each GatewayTxnID result into the supplied test spreadsheet. For a void with an interrupted response whose status is later confirmed by query, obtain its separate void ID from the certification gateway if the portal did not receive it.

The checkout displays versioned authorization wording with the exact amount. It stores the accepted wording, timestamp, holder, account type, and masked bank identifiers. Full routing/account values are sent to Heartland over HTTPS but not saved in the portal database. The immediate Print payment status record action, customer payment-history receipt, and admin detail print/PDF include the authorization information. This update does not promise or add an emailed ACH receipt.

The prepared language is adapted from Heartland's supplied sample for a one-time payment and includes Wooten Oil's contact information. Submit the checkout screenshot and authorization text to Heartland for their review. It is not a claim of legal or processor approval.

## Status and duplicate protection

- Card and ACH use the existing customer/account scope, checkout lock, sandbox approval, and request-origin checks.
- ACH acceptance displays Pending with the bank's reported state; it is not represented as settled funds or posted to MAS 90.
- The sandbox tests never reduce the MAS 90 balance or become eligible for live payment posting.
- A lost sale response blocks another checkout on that account until the original result can be verified. Refreshing does not resubmit it.
- A verified accepted ACH request releases the checkout lock so the next prescribed test can be started; its bank status continues to be checked.
- Existing limits remain: six checkouts per account in ten minutes, and five Main Admin approval attempts per customer in fifteen minutes. Allow those windows to clear between QA and the final run. Do not disable protection to rush the script.

## Security acknowledgement and submission

Complete Heartland's acknowledgement with only deployed, verified controls. The portal implements payment attempt limiting and duplicate protection. CAPTCHA, IP/WAF rules, and third-party fraud tools were not configured or verified in the live Cloudflare account during this update. Do not mark them Yes solely because the site uses Cloudflare.

Finish QA before the final certification run. Run applicable final cases consecutively in the required order using the assigned credentials, record gateway IDs, capture the ACH checkout/authorization evidence, and submit Heartland's review form. No tests were submitted to Heartland and no forms were signed or emailed while preparing this ZIP.

## Validation performed

- 15 backend tests passed using an in-memory database and mocked Heartland responses: certification headers, production lock, card AVS, decline handling, ACH cases/consent, customer isolation, expiry, duplicate clicks, lost-response recovery, bank-return state, and once-only admin voids.
- Actual checkout-script logic tested with a mocked DOM/network for ACH selection, consent submission, bank-form clearing, receipt visibility, and account reset.
- CreditSale, CheckSale, CheckVoid, and CheckQuery request XML validated against Heartland's published certification schema.
- JavaScript syntax and new HTML IDs checked.
- No live gateway transactions performed. Full browser rendering remains unverified because the browser download was unavailable.

Technical references used for request formatting:
- https://cert.api2.heartlandportico.com/Hps.Exchange.PosGateway/PosGatewayService.asmx?schema=schema1
- https://github.com/globalpayments/php-sdk/blob/master/src/Gateways/PorticoConnector.php
- The eight Heartland attachments supplied in archive.zip.
