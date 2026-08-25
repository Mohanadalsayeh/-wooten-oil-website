WOOTEN OIL — CLEAR SERVER DATABASE OPTIONS

Added under Admin > Live Customer Data:

- Clear Customer Database
- Clear Payment Database

Security / confirmation:
1. Admin clicks the red Clear button.
2. Warning popup opens.
3. Admin must enter the Admin Import Key.
4. Admin clicks OK — Clear Database.
5. A second confirmation appears with OK / Cancel.
6. The server validates ADMIN_IMPORT_KEY again before deleting anything.

Clear Customer Database:
- Deletes all rows from the D1 customers table.
- Clears the customer import last-update timestamp.
- IMPORTANT: the customers table also stores customer online-login/password information.
  Clearing this table removes that information too.

Clear Payment Database:
- Deletes every row from customer_payments.
- Clears the payment import last-update timestamp.

New API:
POST /api/admin/clear-database

Files changed:
- admin-customers.html
- worker.js
