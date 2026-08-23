WOOTEN OIL — NOTIFICATION ATTACHMENT DISPLAY FIX

Problem found:
The notification API/list was already returning attachment metadata and storing it
on each notification button in data-notification-attachments.

However, when the customer clicked a notification, the popup fallback code
discarded that attachment data by setting attachments: [].

That meant attachments could disappear whenever the separate notification-detail
request was delayed, failed, or returned an empty attachment array.

Fix:
- Read attachments directly from data-notification-attachments when the notification opens.
- Show those attachments immediately.
- Do not hide attachments while the detail request loads.
- If the detail request returns no attachments but the notification list already
  had attachments, keep and display the existing attachment data.
- Secure attachment opening and authenticated R2 endpoint are unchanged.

Upload:
- index.html
- request-fuel.html
- admin-customers.html
- worker.js

Also verify Cloudflare still has the R2 binding:
NOTIFICATION_ATTACHMENTS -> wooten-notification-attachments

No D1 schema change is required.
