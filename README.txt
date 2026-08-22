WOOTEN OIL NOTIFICATION POPUP COMPLETE DOM FIX

Replace:
- index.html
- admin-customers.html
- worker.js

ACTUAL PROBLEM FOUND:
The notification popup HTML had accidentally been split into two pieces.

The first half (title, date, From, To) loaded BEFORE the Customer Portal JavaScript.
The second half (Message body and Attachments) was located hundreds of lines later,
AFTER the JavaScript.

That exactly explains the behavior:
- Subject displayed
- Date displayed
- From / To displayed
- Message body missing
- Attachment section missing

This version reconstructs the popup as ONE complete HTML block:
Title -> Date -> From/To -> Message -> Attachments

The entire popup now exists in the DOM BEFORE the Customer Portal JavaScript initializes.

No D1 migration or Cloudflare setting change is needed.
Keep the NOTIFICATION_ATTACHMENTS R2 binding in wrangler.jsonc.

You can test the SAME existing notification again after deployment.
You do not need to send a new notification just to test this fix.
