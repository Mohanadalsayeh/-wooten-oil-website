Wooten Oil Portal - Version 785
Communication History attachments

Replace these two existing GitHub files:
- admin-customers.html
- worker.js

Keep your existing Cloudflare bindings and secrets. No database migration or office-PC script change is needed.
This package has not been deployed.

Changes:
- Communication History displays saved portal-notification attachment names and Open buttons.
- Attachment requests require admin authentication and match the selected customer account.
- PDFs/images open in a new tab; other file types download.
- Existing saved attachments appear without resending notifications.
- Missing or unsaved files cannot be recovered by this update.

Validation:
- Worker syntax check passed.
- 39 classic inline scripts parsed.
- Mocked checks passed for attachment mapping, authentication, account matching, private responses, escaping, and empty attachment lists.
- Live Cloudflare delivery was not tested.

After updating both files, reload the admin portal, open Communication History, expand the customer, and open the attachment.
