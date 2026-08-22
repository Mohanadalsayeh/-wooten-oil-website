WOOTEN OIL NOTIFICATION EXACT-DETAIL FIX

Replace:
- index.html
- admin-customers.html
- worker.js

This version simplifies the customer notification flow:

1. Customer clicks a notification.
2. The popup opens immediately using the exact subject/body already visible in the dropdown.
3. The page calls a dedicated secure endpoint for that one notification:
   /api/customer/notifications/detail/{notification_id}
4. The Worker verifies the signed-in customer owns that notification.
5. The response contains the complete message body and that notification's attachments.
6. The popup refreshes with the exact server data.
7. Attachment Open continues to use the secure R2 endpoint.

This removes dependency on cross-script caches and fragile HTML data attributes for full notification content.

No Cloudflare setting changes are needed.
Keep the permanent NOTIFICATION_ATTACHMENTS R2 binding in wrangler.jsonc.
