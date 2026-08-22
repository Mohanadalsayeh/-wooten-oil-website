WOOTEN OIL NOTIFICATION MENU CLICK FIX

Replace:
- index.html
- admin-customers.html
- worker.js

What this fixes:
1. Customer notification bell/menu has a defensive fallback so it opens even if an earlier page handler fails.
2. Notifications inside the customer dashboard are now clickable.
3. Clicking a notification opens the full email-style notification popup.
4. The popup includes attachments, and the Open button uses the secure authenticated attachment fetch.
5. Existing R2 attachment storage is unchanged.

Your permanent wrangler.jsonc binding must remain:
"r2_buckets": [
  {
    "binding": "NOTIFICATION_ATTACHMENTS",
    "bucket_name": "wooten-notification-attachments"
  }
]
