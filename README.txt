WOOTEN OIL NOTIFICATION POPUP FIX

Replace:
- index.html
- admin-customers.html
- worker.js

Cause fixed:
The full notification popup HTML was located after the Customer Portal JavaScript.
When the JavaScript loaded, document.getElementById(...) returned null for the popup,
so clicking a notification could not open anything.

Fix:
- The notification popup HTML now loads before the Customer Portal script.
- The popup code also re-queries the DOM defensively before opening.
- Attachment click handling is bound defensively.
- Existing notification bell, R2 attachment storage, admin notification sending,
  password reset, and other current features are preserved.

No Cloudflare setting changes are required.
Keep the permanent wrangler.jsonc R2 binding.
