WOOTEN OIL ADMIN USERS, PERMISSIONS, AND AUDIT HISTORY

Owner access:
  Username: Admin
  Password: the existing Cloudflare ADMIN_IMPORT_KEY
  The owner login always has full access and can create staff users.

Individual admin users:
  Customer Administration > Admin Users

Available permissions:
  - Database & Imports
  - Notifications
  - Statements & Invoices
  - Communication History
  - Communications Settings
  - Account Applications
  - Account Activation
  - Manage Admin Users

Security:
  - Passwords are never stored as plain text.
  - Passwords use PBKDF2-SHA-256 with a unique random salt.
  - Staff sessions expire after 12 hours.
  - Disabled users are signed out and cannot log in.
  - API endpoints enforce permissions even if a hidden tab URL is called.

Attribution and auditing:
  - Account application reviews show the reviewer and review time.
  - Customer imports show the last importer.
  - Payment imports show the last importer.
  - Recent Admin Activity displays the latest 100 recorded events.

Database tables are created automatically:
  admin_users
  admin_sessions
  admin_audit_log

Existing tables are upgraded automatically with:
  account_applications.reviewed_by
  account_applications.reviewed_at
  admin_import_metadata.last_import_by
