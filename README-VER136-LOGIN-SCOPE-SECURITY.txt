Wooten Oil Portal — Ver136
Login Scope Security

Behavior:
- Email login creates a LINKED account session.
  - Active customer accounts sharing the verified email may be viewed/switched without logging out.
  - Secure statement/document links may automatically switch to another active account sharing that verified email.
- Customer/account-number login creates a SINGLE account session.
  - The session is restricted to the exact account number used to sign in.
  - Other accounts sharing the same email are not returned by the linked-account API.
  - Account switching is blocked.
  - Secure statement/document links for another account remain blocked with HTTP 403.
- Account-number login now verifies only that exact account's password. It no longer accepts a password from a different account merely because the email is shared.

Session security:
- customer_sessions gains login_method, session_scope, and verified_email columns automatically when needed.
- Existing sessions default to account/single scope for safety; signing in again by email creates linked scope.
- The same scope is returned by the customer login, session/me, and accounts APIs.

No customer balances, statements, notification delivery behavior, or admin permissions were intentionally changed.
