WOOTEN OIL NOTIFICATION CONTENT + ATTACHMENT FIX

Replace:
- index.html
- admin-customers.html
- worker.js

What changed:
- Clicking a notification now uses the real notification object returned by /api/customer/notifications.
- The popup no longer depends on message/attachment data stored only in HTML attributes.
- If needed, the page refreshes notifications from the server before opening the popup.
- The full message body is rendered directly from the API response.
- Attachment metadata is rendered directly from the API response.
- Existing secure R2 attachment opening is preserved.
- Existing R2 wrangler.jsonc binding stays unchanged.

No Cloudflare settings need to be changed.
