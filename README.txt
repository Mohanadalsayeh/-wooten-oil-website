WOOTEN OIL — GMAIL NOTIFICATION ATTACHMENT SYNC FIX

ROOT CAUSE FOUND:
Admin-page notifications already stored attachments in R2 and created rows in:
  portal_notification_attachments

But Gmail Sent -> Portal Sync only copied:
- Subject
- Email body
- Recipient

It did NOT:
- read Gmail MIME attachment parts
- call the Gmail attachment download endpoint
- store those files in R2
- create portal_notification_attachments rows

Therefore the notification appeared, but it had no portal attachment to display.

FIX:
- Detect attachment parts in Gmail Sent messages.
- Download Gmail attachments through the Gmail API.
- Supports the same safe file types as admin notifications.
- Maximum 3 attachments.
- Maximum 5 MB each.
- Maximum 10 MB total.
- Store each attachment privately in the existing NOTIFICATION_ATTACHMENTS R2 bucket.
- Create the matching D1 portal_notification_attachments records.
- Existing authenticated customer attachment-opening endpoint is reused.
- Manual Gmail Sync response now reports attachments_found for easier testing.

IMPORTANT TEST:
This fix applies to NEW Gmail-synced notifications.
An old notification already synced before this fix is a duplicate and will not automatically
gain its attachment. Send a NEW test email with a NEW subject/message after deploying.

Cloudflare must have:
NOTIFICATION_ATTACHMENTS -> wooten-notification-attachments

Upload:
- index.html
- request-fuel.html
- admin-customers.html
- worker.js

No D1 schema change is required.
