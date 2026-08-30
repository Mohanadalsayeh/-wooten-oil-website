Wooten Oil Portal Ver110

Statement delivery duplicate protection strengthened for:
- Test A
- Test B
- Run A
- Run B
- Test All Cycles

The Worker now keeps a unique per-run/per-customer/per-channel delivery guard for Portal, Email, and SMS.
The statement email also uses a stable Resend Idempotency-Key for the same run/customer.
The Admin page refuses to start a manual Test/Run unless the deployed Worker reports statement_channel_dedupe_v1 capability.
