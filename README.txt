WOOTEN OIL ATTACHMENT OPEN FIX

Replace index.html, admin-customers.html, and worker.js with these files.

What changed:
- Clicking a customer notification attachment now uses an authenticated fetch.
- The browser opens a blank preview tab immediately, then loads the attachment into it.
- This avoids popup blocking and cookie/session issues with direct attachment links.
- PNG/JPG/PDF files should open in the browser.
- Word/Excel and other supported files may open/download according to the customer's browser/device.

The existing R2 binding remains:
NOTIFICATION_ATTACHMENTS -> wooten-notification-attachments

No new Cloudflare binding or D1 setup is required.
