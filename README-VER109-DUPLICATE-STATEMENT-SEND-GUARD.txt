Wooten Oil Portal Ver109

Fix: Prevent duplicate statement deliveries during Test/Run.

- The server atomically claims each statement batch before generating/sending it.
- If a duplicate/overlapping continue request arrives, it does not resend the same batch.
- Test A, Test B, Run A, Run B, and Test All Cycles require the Ver109 worker capability before starting.
- Selected-customer safeguards from Ver106/Ver107 remain active.
