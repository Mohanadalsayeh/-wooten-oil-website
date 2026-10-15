Wooten Oil Portal — Ver1096
10-character temporary password for immediate customer account activation

CHANGES FROM Ver1095
* Admin -> Account Activation -> Activate Customer Account now generates exactly
  10 random characters for each temporary password (previously 18).
* Secure cryptographic random generation and one-time display are preserved.
* The customer must still change the temporary password at first login.
* No other customer account, payment, invoice, or login functionality changed.

INSTALLATION
Apply the changed-files package on top of Ver1095 by updating these two
files at their matching repository paths:
  worker.js
  portal-version.json
Then redeploy your normal Cloudflare Pages/Worker deployment.

If you require a complete snapshot rather than a small update, use the full
portal package instead; it includes the cumulative Ver1095 implementation.

TESTING
Test activation using a non-production, not-yet-activated customer account.
Confirm the temporary password is exactly 10 characters, the first login
requires choosing a NEW password of at least 10 characters and one letter,
account data cannot be viewed until the password change is completed, and
subsequent logins use the customer's new password.

Temporary passwords must be shared only with the verified customer through a
private channel; do not include them in logs. Existing accounts should use
Password Reset Assistance, not account activation.

Status: built and syntax-tested locally. Not deployed or live-tested.
