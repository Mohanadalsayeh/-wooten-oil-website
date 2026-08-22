WOOTEN OIL NOTIFICATION CLICK FIX

Replace:
- index.html
- admin-customers.html
- worker.js

Actual root cause fixed:
The notification popup code called formatDate(), but formatDate() was declared in a
different <script> block. JavaScript variables/functions declared inside that other
IIFE are not visible to the Customer Portal script. Clicking a notification therefore
threw "ReferenceError: formatDate is not defined" before the popup could open.

This version adds a date formatter inside the Customer Portal script itself and uses
that local function.

No Cloudflare configuration changes are required.
Keep the existing NOTIFICATION_ATTACHMENTS R2 binding in wrangler.jsonc.
