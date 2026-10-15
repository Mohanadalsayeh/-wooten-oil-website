Wooten Oil Portal — Ver1095
Immediate Admin Activation + Mandatory Temporary Password Change

INSTALLATION
1) Upload the changed-files package contents to the corresponding repository root paths.
   The package is cumulative relative to Ver1094, and includes files that must be deployed together:
      admin-customers.html
      index.html
      assets/js/script-07.js
      worker.js
      portal-version.json
2) Redeploy the Pages/Worker project through your normal deployment process.
3) Clear old cached pages or hard refresh the admin and customer login pages.
4) Test a NON-PRODUCTION customer account before using the feature with real customers.

ADMIN PORTAL
Open Account Activation -> Activate Customer Account. Enter the Customer Number,
confirm activation, and copy the generated 18-character temporary password.
The password is displayed only in this response and is stored only as a salted
PBKDF2 password hash. Verify the customer and share the password privately.

FIRST LOGIN
A login with the temporary password creates a restricted session. Other
customer data APIs are unavailable until the customer changes the password.
The password change immediately revokes all customer-number sessions and the
customer must sign in again with the new password.

SAFEGUARDS
* Already-activated accounts cannot be overwritten via Activate Account.
* Inactive customer records cannot be activated.
* Existing manual 6-digit activation code and password-reset features remain.
* Existing shared-email credential and account-linking behavior is preserved.
* Successful admin activations are recorded in the admin audit log; no password.
* No customer balance, invoice, payment, or business data is changed.

Note: This feature uses the portal's existing customers.must_change_password
field; it does not require an additional database migration on installations
that already support Ver1094 authentication. No live deployment/test was made.
