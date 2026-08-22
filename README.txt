WOOTEN OIL — ADMIN ONLINE ACCOUNT DEACTIVATION

Replace:
- admin-customers.html
- worker.js
- index.html

New behavior:
- Database > View customer
- If the customer's online account is Activated, Admin sees:
  Deactivate Online Account
- Requires the existing Admin Import Key.
- Shows a confirmation before changing anything.

What deactivation DOES:
- Removes the customer's website password.
- Signs out all current website sessions.
- Invalidates unused password-reset tokens.
- Invalidates unused activation codes.
- Database view changes Online Account to Not activated.

What deactivation DOES NOT do:
- Does not deactivate the customer's accounting/billing account.
- Does not change account_status.
- Does not change balances, aging, customer number, name, email, or other account data.

To restore online access later:
Use the existing Account Activation tool to generate a new activation code and let the customer create a new password.

No Cloudflare, D1, R2, or wrangler.jsonc changes are required.
