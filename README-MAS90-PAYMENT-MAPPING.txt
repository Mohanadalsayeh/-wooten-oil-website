WOOTEN OIL — MAS 90 CUSTOMER PAYMENTS MAPPING FIX

The uploaded Customer Payments.xlsx was inspected.

Actual columns include:
BankCode
DepositDate
DepositNo
DepositType
ARDivisionNo
CustomerNo
CheckNo
PostingDate
CustomerName
TransactionType
InvoiceNo
InvoiceType
CashAmountApplied
DiscountAmountApplied
InvoiceBalance
DepositDesc
Comment

Importer mapping:
- Customer account: CustomerNo
- Payment date: PostingDate, fallback DepositDate
- Payment amount: CashAmountApplied
- Reference/check #: CheckNo, fallback DepositNo
- Description: DepositDesc / Comment

Important MAS 90 behavior:
The export contains one row per invoice application, not one row per customer
payment. The browser now combines rows with the same CustomerNo + PostingDate +
CheckNo into ONE payment and sums CashAmountApplied.

Excel serial dates such as 42737 are now converted correctly (2017-01-02).

Changed file:
- admin-customers.html

worker.js does not need to change for this mapping fix.
