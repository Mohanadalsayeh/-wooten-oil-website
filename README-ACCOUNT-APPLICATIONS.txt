WOOTEN OIL ACCOUNT APPLICATIONS

Public page:
  /open-account.html

Business applications require:
  - Business and authorized-contact information
  - Last four digits of the Federal Tax ID
  - Tax ID document (PDF, JPG, or PNG; maximum 10 MB)
  - Driver's license or state ID (PDF, JPG, or PNG; maximum 10 MB)

Personal applications require:
  - Personal contact and address information
  - Driver's license or state ID (PDF, JPG, or PNG; maximum 10 MB)

Administration:
  Customer Administration > Account Applications
  - Search and filter applications
  - 20 applications per page
  - Expand an application to review its information
  - Open protected Tax ID and identity documents
  - Save New, Under Review, Approved, or Declined status
  - Save private administrator notes

Storage:
  - Application records are stored in the D1 account_applications table.
  - Files use the existing private NOTIFICATION_ATTACHMENTS R2 binding.
  - Documents require the administrator key and are never public.
  - File type signatures and 10 MB limits are checked before storage.

The database table is created automatically the first time the form is
submitted or the Account Applications admin tab is loaded.
