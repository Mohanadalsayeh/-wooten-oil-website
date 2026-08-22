WOOTEN OIL NOTIFICATION OPEN REGRESSION FIX

Replace:
- index.html
- admin-customers.html
- worker.js

Root cause fixed:
The last update tried to read `cachedItems` from the Customer Portal script, but
`cachedItems` is declared inside a different notification-center <script> block.
That caused a JavaScript ReferenceError when a customer clicked a notification,
so the popup stopped opening.

Fix:
- Notification cache is now shared safely through `window.wootenNotificationCache`.
- The popup opens immediately from the clicked list item.
- The page then refreshes the full notification object from the server when needed.
- Full message body and R2 attachments are still loaded from the real API data.
- Existing admin, password reset, notification sending, and attachment storage are preserved.

No Cloudflare setting changes are required.
Keep the permanent NOTIFICATION_ATTACHMENTS R2 binding in wrangler.jsonc.
