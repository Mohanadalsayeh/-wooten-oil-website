# Wooten Oil — Integrated Heartland sandbox checkout

This update adds card fields inside the customer portal. Heartland hosts the sensitive fields in secure iframes; the Worker receives a token, never card numbers or security codes. This package accepts sandbox keys only and cannot charge live cards.

## Deploy the changed files

Upload these files to the same locations in your GitHub project, preserving the folders:

- `worker.js`
- `index.html`
- `assets/js/script-06.js`
- `assets/css/wooten-customer-payments.css`
- `payments/heartland.mjs`
- `payments/vendor/xml-parser.mjs`
- `payments/vendor/xml-parser.LICENSE`

The `payments` folder is new. It must be included with `worker.js`; the Worker imports it. The ZIP contains changed/new files only. This guide is for setup and need not be uploaded to your website.

## Cloudflare settings

In the existing Worker's **Settings → Variables and Secrets**, add:

| Name | Type | Value |
| --- | --- | --- |
| `PAYMENT_PROVIDER` | Text | `heartland` |
| `HEARTLAND_ENVIRONMENT` | Text | `sandbox` |
| `HEARTLAND_PUBLIC_API_KEY` | Text | Your Heartland sandbox public key beginning `pkapi_cert_` |
| `HEARTLAND_SECRET_API_KEY` | Secret | The matching Heartland sandbox secret key beginning `skapi_cert_` |

Use both keys from the same Heartland registration. The MID is not used by this implementation. Keep the secret in Cloudflare; do not put it in HTML, JavaScript, GitHub, or this guide. Existing GP variables can remain.

Under **Settings → Trigger Events**, keep existing triggers and ensure the following Cron Trigger is present:

```
*/2 * * * *
```

Deploy/promote the version containing both the new files and these settings. Confirm it is the active version, then wait about two minutes for the first scheduled check. Refresh the portal. The button should now read **Continue to Card Payment**. If it still says **Continue to Secure Payment**, the Heartland configuration/version is not active, or the browser is using an older script.

No manual database migration is needed. The Worker creates its two Heartland tracking tables in the existing D1 database. It does not rewrite the MAS90 customer or balance tables.

## Run one sandbox test

1. Sign in and open Make a Payment. Opening the form reads saved status; it does not submit a charge.
2. Choose a $1.00 partial payment, then click **Continue to Card Payment**.
3. The secure card fields appear inside the portal. Enter a test card supplied for your Heartland sandbox registration.
4. Click **Pay $1.00 — Sandbox** once. The portal saves the attempt before contacting Heartland.
5. Expect a green sandbox approval with a confirmation reference, or an explicit decline. A pending result remains saved and is checked in the background without resubmitting the sale.
6. Reopen the portal to confirm the result is still present. MAS90 balances remain unchanged by sandbox tests.

An unsubmitted checkout can be canceled using **Cancel unsubmitted checkout**. This button does not void or refund submitted transactions. After submission, the portal confirms the original attempt instead of allowing another charge while its result is uncertain.

## Existing Global Payments tests

The earlier GP sandbox links, transaction records, and review evidence remain saved. Heartland sandbox checkout uses separate tracking and does not display those old GP reviews as the current Heartland payment. This does not resolve or approve those GP records. Unknown or production payments awaiting confirmation still block another checkout.

## If a check cannot finish

- A missing/stale Cron Trigger keeps new payments disabled until background checks are running.
- Missing or mismatched sandbox keys prevent setup or payment confirmation. Both keys must belong to the same registration and a USD sandbox account.
- A lost charge response is resolved using Heartland's `FindTransactions` and `ReportTxnDetail` operations, matching the saved credential identity, reference, amount, and transaction type, plus site/device identifiers when provided by the setup response.
- Unmatched, partial, voided, or multiple successful results remain reserved for review. An empty report alone never proves that an attempted payment was not processed. Do not erase pending records to allow a retry.
- Restoring the exact keys used for an outstanding checkout is required for its reconciliation.

## Verification and limits

The package was checked with automated server and browser-logic tests for duplicate submissions, interrupted responses, report matching, declines, cancellation, account changes, and secret/card-data boundaries. Generated SOAP requests were validated against the public Portico XML schema. Existing GP payment regression tests also pass. Hosted-field event handling was tested with a mocked SDK; a full browser rendering check could not be completed in this environment.

An end-to-end transaction with your Heartland account has not been run: your usable secret key is not available in this workspace. The first account test above is still required. This is a sandbox integration, not a production/certified payment launch.

References: [Global Payments hosted fields](https://github.com/globalpayments/globalpayments-js/tree/master/packages/globalpayments-js), [official Portico connector](https://github.com/globalpayments/php-sdk/blob/master/src/Gateways/PorticoConnector.php), [Portico sandbox WSDL](https://cert.api2.heartlandportico.com/Hps.Exchange.PosGateway/PosGatewayService.asmx?WSDL).

Vendor: `payments/vendor/xml-parser.mjs` bundles `@xmldom/xmldom` 0.9.12 using esbuild 0.25.12; its license is included.
