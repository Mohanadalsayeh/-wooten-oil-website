WOOTEN OIL STATEMENT SCHEDULING

What is included
----------------
- W statement cycle for weekly statements.
- Monthly statement-cycle selection.
- Positive-balance-only option.
- Recent-payment count selection.
- Portal, Email PDF, and SMS secure-link delivery choices.
- Customer preview for weekly and monthly schedules.
- Confirmed Run Now controls.
- Latest 20 run reports with customer-level delivery results.
- Duplicate protection for automatic weekly and monthly runs.
- Central Time scheduling.

MAS 90 customer import
----------------------
The customer importer now recognizes these statement-cycle column names:

StatementCycle
Statement_Cycle
StmtCycle
StatementCode
Cycle

Use W for customers who should receive weekly statements.

Required Cloudflare setting
---------------------------
After deploying the complete website and Worker:

1. Open the Wooten Oil Worker in Cloudflare.
2. Open Settings, then Triggers or Cron Triggers.
3. Add this Cron expression:

   0 * * * *

4. Save the trigger.

This invokes the Worker once per hour. The Worker converts the current time to
America/Chicago, checks the saved schedule, and runs only when due. The database
prevents the same weekly or monthly automatic run from being processed twice.

Recommended first setup
-----------------------
1. Deploy this package.
2. Import the latest MAS 90 customer file containing StatementCycle.
3. Open Customer Administration > Statements & Invoices > Statement Scheduling.
4. Preview W customers and monthly customers.
5. Run one small manual test if appropriate.
6. Save and enable the schedules.
7. Add the hourly Cloudflare Cron Trigger.
