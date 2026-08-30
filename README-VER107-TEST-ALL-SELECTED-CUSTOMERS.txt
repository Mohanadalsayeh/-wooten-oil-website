Wooten Oil Portal Ver107
Test All Cycles — Selected Customers Only

Changes:
- Test All Cycles now submits the selected Cycle A and Cycle B account lists together to the server.
- The server validates every selected account against its assigned cycle and saved statement eligibility rules before any delivery begins.
- The server creates one exact-selection test run per selected cycle only after all selected cycle lists pass validation.
- The browser verifies the server target list for every selected cycle before continuing any statement delivery.
- If any selected customer no longer matches the expected cycle, if the same account appears in both cycles, or if the deployed Worker is older, Test All stops with a SAFETY STOP and does not continue delivery.
- The confirmation dialog shows the selected count for Cycle A, Cycle B, and the combined total.
- Test A, Test B, Run A, and Run B keep the strict selected-customer-only behavior from Ver106.
- Automatic scheduled runs are unchanged.

Deployment:
Deploy the full Ver107 portal and the included worker.js together. The new Test All safety endpoint is server-side and requires the Ver107 Worker.
