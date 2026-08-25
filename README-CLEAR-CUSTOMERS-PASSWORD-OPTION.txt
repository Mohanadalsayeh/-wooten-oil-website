WOOTEN OIL — CLEAR CUSTOMER DATABASE PASSWORD OPTION

When the admin clicks Clear Customer Database, the confirmation popup now offers:

1. Keep login passwords
   - Selected by default.
   - Clears imported MAS 90 customer data.
   - Preserves customer account number and online login/password/reset/activation fields where present.
   - Existing customer login credentials can survive a customer-data refresh.

2. Clear login passwords too
   - Deletes all rows from the customers table, as before.

Security flow remains:
- Admin Import Key required in popup.
- Final OK / Cancel confirmation.
- Server validates ADMIN_IMPORT_KEY again before changing D1.

The Payment Database clear behavior is unchanged.

Files changed:
- admin-customers.html
- worker.js
