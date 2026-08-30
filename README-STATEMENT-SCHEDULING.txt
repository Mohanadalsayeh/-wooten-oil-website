WOOTEN OIL STATEMENT SCHEDULING

What is included
----------------
- A statement cycle for monthly statements.
- B statement cycle for weekly or biweekly statements.
- Cycle C is no longer used.
- Positive-balance-only option.
- Recent-payment count selection.
- Portal, Email PDF, and SMS secure-link delivery choices.
- Customer preview for monthly, mid-month, and weekly schedules.
- Each preview opens directly beneath its matching A, B, or C schedule card.
- Every previewed customer has an individual A/B/C selector and Save Cycle button.
- Confirmed Run Now controls.
- Latest 20 run reports with customer-level delivery results.
- Duplicate protection for automatic monthly, mid-month, and weekly runs.
- Central Time scheduling.

MAS 90 customer import
----------------------
The customer importer now recognizes these statement-cycle column names:

StatementCycle
Statement_Cycle
StmtCycle
StatementCode
Cycle

Statement cycle mapping:

A = Monthly Cycle
B = Mid-Month Statements (default)
C = Weekly Cycle

Blank, unknown, or legacy values default to B. Legacy W values migrate to C.

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
prevents the same monthly, mid-month, or weekly automatic run from being processed twice.

Recommended first setup
-----------------------
1. Deploy this package.
2. Import the latest MAS 90 customer file containing StatementCycle.
3. Open Customer Administration > Statements & Invoices > Statement Scheduling.
4. Preview A, B, and C customers.
5. Run one small manual test if appropriate.
6. Save and enable the schedules.
7. Add the hourly Cloudflare Cron Trigger.

Manual Test / Run customer selection
------------------------------------
For Preview A and Preview B, select the customers that should be processed.
Test A, Test B, Run A Now, and Run B Now process only those selected customers.
Manual runs never fall back to every customer in the cycle when nothing is selected.

Test A / Test B are real test sends to the selected customers using the saved
Portal, Email, and SMS options and each customer's delivery preferences. Test
sends create customer documents and Communication History entries and are
reported as TEST SEND.

Automatic scheduled runs are unchanged: when Cycle A or B becomes due, the
Worker processes the eligible customers assigned to that cycle.
