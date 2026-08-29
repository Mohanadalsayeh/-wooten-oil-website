WOOTEN OIL PORTAL — VERSION 69

Recent Admin Activity has been expanded across the complete admin portal.

Recorded activity now includes:
- Owner and individual administrator logins
- Admin-user list access, creation, and edits
- Customer and payment imports
- Live customer and payment database access
- Database clearing and import-status access
- Customer Activity searches and customer-record views
- Customer contact preference and online-access changes
- Notifications and communication resend actions
- Communication history and customer-message access
- Gmail synchronization and connection/status access
- Statement generation, schedules, previews, runs, cycles, and customer lists
- Customer document lists, uploads, changes, and file access
- Account application lists, reviews, and document access
- Activation and password-reset code creation
- Twilio/SMS settings access
- Any future authorized /api/admin endpoint through a generic audit fallback

Existing detailed audit entries are preserved without creating duplicates for imports,
admin-user changes, account-application reviews, and direct Customer Activity views.

Note: Activity from before this version cannot be reconstructed. New activity begins
recording after version 69 is deployed.
