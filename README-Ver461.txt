Apply over Ver460. Deploy frontend AND Worker with the updated fleet/intevacon.mjs module. worker.js itself is unchanged. No database migration is required for these payload fields.

Install the accompanying Intevacon-Checked-Columns-v2.2.zip on the existing PC before syncing. It requires the previous working v2.1 pull-period installation.

All 18 checked columns from the supplied screenshots are collected and validated on every transaction page:
Received On; Tran #; Local Date/Time; Entry Method; Decline Reason; Merchant; Auth Ref; Card Number; Total Sale; Billable Amount; Cardholder; Driver#; Driver Name; Vehicle#; Vehicle Desc; Raw VehicleID; Odometer; Processed On.

Entry method, authorization reference, driver number/name, vehicle number/description/raw ID are preserved separately and shown in the portal transaction table. Fleet PDF export includes them and continues long cell contents onto further pages without truncation. Card numbers remain bold. Billable Amount remains admin-only. Customer account isolation is unchanged.

Unchecked columns remain optional: Status, Merchant City, Invoice # and other previously supported extras may be blank when unchecked. The agent reads the source column selection; it does not change the Intevacon column picker. Keep the 18 required boxes checked as shown. If a required header is absent on any page, the pull stops with a message naming the missing columns, preserving the last successful data. Empty values in a present column remain valid. No individual transaction detail pages are opened.

Checks passed: 18 backend tests including field preservation and customer isolation; all-18-column extraction and missing-header rejection; existing pull-period tests; fleet PDF generation with long details and bold card numbers. Live Intevacon/browser and Windows execution were not available. Verify the first Sync now after installing both updates.
