WOOTEN OIL — SMS DELIVERY TRACKING

Included
1. Every new SMS supplies Twilio with this delivery callback:
   https://wootenoil.com/api/twilio/message-status
2. Communication History displays SMS Pending, Delivered, Failed, or Opted Out.
3. Failed deliveries display Twilio's error code and a readable explanation.
4. Failed SMS records have an admin-only Resend SMS button.
5. Resends create a separate history entry and are tracked independently.
6. Twilio webhook signatures are validated using TWILIO_AUTH_TOKEN.

Required after deploying worker.js
In Twilio Console, open Messaging > Services > Wooten Oil Customer Notifications.
Under Integration / Incoming Messages, set the incoming-message webhook to:
   https://wootenoil.com/api/twilio/incoming-message
Method: HTTP POST

This incoming webhook records STOP/START choices. Delivery callbacks do not need
manual Twilio setup because the Worker supplies the callback URL when each SMS is sent.

Important
- The first Communication History load after deployment automatically adds the new
  database columns and opt-out preference table.
- Older SMS history cannot be resent because its original SMS body was not stored.
  New messages sent after this update contain everything required for one-click resend.
- Resend is intentionally available only for Failed messages. Delivered, Pending, and
  Opted Out messages cannot be resent from the button.
