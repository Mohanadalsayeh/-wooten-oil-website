WOOTEN OIL PORTAL — EMAIL CHANGE REACTIVATION SECURITY (V64)

Customer import security rule
- A nonblank imported email replaces the saved email as before.
- If that email differs from the saved email (ignoring capitalization), the account's portal password is cleared.
- Every active portal session for that customer account is revoked in the same database batch.
- Unused password-reset and activation codes for that account are invalidated.
- The account is immediately removed from its former shared-email account group.
- Login by either the new email or the customer number requires activation first.
- Activation sends the verification code to the newly imported email and lets the customer create a new password.

Unchanged behavior
- An unchanged email does not affect the password or session.
- A blank imported email does not erase the existing saved email and does not trigger reactivation.
- Other accounts remaining on the previous shared email keep their login and account switcher.

Admin reporting
- Customer import progress and completion messages report how many email changes require reactivation.

This package includes the V63 shared-email account switcher and all prior updates.
