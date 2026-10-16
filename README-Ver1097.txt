Wooten Oil Portal — Ver1097 | Statement Period Data Audit
============================================================
Source: Ver1096. Includes all prior Ver1096 activation and password updates.

FIXES
1. Preview Statements and Generate & Send now select MAS 90 imported payments by the
   SAME customer Cycle A/B/C/E From–To period already used for Intevacon activity.
2. MAS 90 uses Posting Date (if available), then Payment Date. The To date is inclusive.
   Payment imports have date-only granularity; custom time-of-day boundaries are
   applied to Intevacon, not to MAS 90 payment dates.
3. The existing Last Payments to Show count (0–20) remains an upper limit.
4. Intevacon continues to use its stored ReceivedDateTime with per-customer
   CustomerID account mapping and coverage validation; its From/To times and
   end-of-day inclusivity are unchanged.
5. Both paths now resolve any default cycle periods relative to the SELECTED
   statement date, rather than the server's current date.
6. MAS 90 payment page label now identifies period-filtered payments.

BOUNDARIES AND SOURCE AVAILABILITY
- MAS 90 customer balances/aging are still latest-import snapshots, not guaranteed
  balances as of the historical To date. Do not advertise them as historical.
- MAS 90 payment sync often imports recent records only (e.g. last 30 days).
  A correct WHERE clause cannot supply payments that never reached the portal.
- Intevacon statement coverage is checked against SAVED API history. For today's
  incomplete day, report freshness depends on the latest successful sync.
- Statement PDF does not reconstruct all historical invoice/charge ledger rows.
- This is a local source-code audit/test, NOT a check against live MAS90/
  Intevacon records; reconcile sample customer statements with both systems.

INSTALLATION
Replace files preserving their relative paths. Deploy the Worker, website, and
imported assets/js/wooten-statement-period-payments.mjs. No schema migration.
TESTS: run `node --test tests/statement-period-ver1097.test.mjs`.
