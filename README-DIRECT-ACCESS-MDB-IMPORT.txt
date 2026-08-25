WOOTEN OIL — DIRECT ACCESS MDB/ACCDB IMPORT

Admin import now accepts Microsoft Access files directly.

Supported:
- .mdb
- .accdb
- .xlsx
- .xls
- .csv

Payment workflow:
1. Select the original Customer Payments.mdb.
2. Click Preview Payments.
3. The browser locates the MAS 90 payment table automatically.
4. Access dates are read directly, avoiding Excel date-conversion problems.
5. Existing payment search/filter/sort remains available.
6. Click Import Payments to save the rows to D1.

Customer import:
The MAS 90 customer import can also accept an MDB/ACCDB file and automatically selects
the table with CustomerNo / CustomerName-style fields.

Implementation:
- mdb-reader 3.2.0
- buffer 6.0.3
- loaded through jsDelivr, consistent with the existing SheetJS dependency.

File changed:
- admin-customers.html

No Worker or D1 changes are required.
