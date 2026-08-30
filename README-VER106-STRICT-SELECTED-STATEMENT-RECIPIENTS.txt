Wooten Oil Portal Ver106 — Strict Selected-Only Statement Test/Run

Fixes the remaining issue where a manual Test/Run could resume an older running job for the same cycle and therefore continue processing the entire Cycle A or Cycle B list.

Ver106 safety rules:
1. Test A, Test B, Run A, and Run B require explicit selected account numbers.
2. Manual Test/Run requests use selected_only=true and are rejected without it.
3. Every manual Test/Run creates a NEW run for the exact selection; it cannot resume an older whole-cycle run.
4. Older unfinished manual/test runs of the same type are marked superseded before the new selected run starts.
5. The server stores only the selected accounts in target_json and returns that target list to the browser.
6. Before the first statement is sent, the browser verifies the deployed server supports selected-recipient enforcement and confirms the returned targets exactly match the selected accounts.
7. If counts or account numbers differ, the browser stops before calling the batch continuation endpoint.
8. The server re-validates target_json before every manual/test batch.
9. Scheduled background processing will continue automatic scheduled runs only; it will NOT resume abandoned manual Test/Run jobs.
10. Automatic scheduled Cycle A/B runs remain cycle-based and are unchanged.

IMPORTANT: Because this fix includes server-side enforcement, deploy the updated worker.js together with the updated admin page. If the old server is still deployed, the Admin page will show a SAFETY STOP and will not start a Test/Run.
