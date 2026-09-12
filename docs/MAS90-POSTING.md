# Online payment posting references

## Staff workflow
1. In Payment Transactions, filter MAS 90 posting to Ready for entry.
2. Print report or export PDF for all matching records (not just the current page).
3. Record the already collected payment in MAS 90 using the company’s accounting procedure. Do not charge the card a second time.
4. Open the online transaction reference in the portal. Save the MAS 90 Deposit No. and Check No. exactly, including leading zeros.
5. Import completed MAS 90 payment history, then refresh the transaction/history view. The portal verifies the link on read against current imported records.

Posting states are separate from processor outcomes: Ready for entry, Entered — awaiting verification, Posting needs review, Posted in MAS 90. Printing and saving references do not themselves confirm posting. A record already present in a completed import may verify immediately after saving.

Only captured, positive USD payments with a known production environment and no unresolved processor review are eligible. Sandbox, pending, declined, canceled, failed and unknown-environment transactions cannot be linked. The Heartland integration remains sandbox-only; this update does not enable live processing.

## Verification and customer display
A receipt is identified by customer account, Deposit No., and Check No. Exact strings are used; the imported Check No. arrives in the existing reference field. One such receipt can link to only one online payment. Its positive imported amounts must sum exactly to the online amount in cents, with consistent payment/deposit/posting dates and a posting date present. Repeated invoice identifiers or reused reference groups require review. No matching by amount alone is performed.

Split invoices appear as allocations of one online payment. Verified imported rows are grouped with the original online receipt in customer history and Customer Activity. Original confirmation and processor IDs remain intact. Imported ledger rows are never deleted. Financial totals and balances remain based on MAS 90; the portal does not subtract the payment a second time. Customer balance updates still require the customer database import, independently of payment history import.

Matching is computed when records are viewed/refreshed. Incomplete or failed imports cannot newly confirm a posting. Missing references remain awaiting verification; mismatched totals or ambiguous rows require review. Corrections require a reason and the latest record revision; stale edits and reference reuse are rejected. Each edit is retained in the transaction’s posting reference history with employee and time. Employees need Payment Transactions permission.

## Deployment
Replace the eight changed application files supplied in this update, preserving directory paths, and deploy both the website and Worker through your usual process. The new payments/mas90-posting.mjs module is a Worker dependency. New D1 link/audit tables, triggers, and an index are created automatically. No MAS 90 schema or export changes are required. This ZIP does not contain unchanged portal files.

## Reserved alternative — not implemented
A future option is to carry a short unique online reference in MAS 90 Check No. (or another confirmed exported field), mapped to the full confirmation in the portal. Before considering this, verify field length and the company’s accounting conventions in MAS 90 4.30. This release makes no changes for that alternative.

## Validation
Local SQLite/Worker tests cover permissions, cross-origin saves, production-only eligibility, revision conflicts, reference uniqueness, split invoices, wrong customer/amount, incomplete imports, ambiguous groups, leading zeros, customer isolation, unchanged balances and the actual payment import route. Browser tests cover save/refresh, 201-record print report, receipt printing and layouts at 1440, 390 and 320 pixels. No live customer payment or production deployment was performed.
