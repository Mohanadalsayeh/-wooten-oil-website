WOOTEN OIL — TWILIO SMS PHASE 1

Admin > Notifications now supports one-customer SMS through Twilio.

Cloudflare Worker variables/secrets required:
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
and ONE of:
TWILIO_PHONE_NUMBER
TWILIO_MESSAGING_SERVICE_SID

Do not put the Auth Token in GitHub or HTML.

Cloudflare setup:
Workers & Pages > wooten-oil > Settings > Variables and Secrets

Recommended:
TWILIO_ACCOUNT_SID      Secret
TWILIO_AUTH_TOKEN       Secret
TWILIO_PHONE_NUMBER     Variable or Secret

Then:
1. Deploy admin-customers.html and worker.js.
2. Add the Twilio secrets in Cloudflare.
3. Open Admin > Notifications.
4. Click Check Twilio.
5. Select one customer and check "Send the same message by SMS (Twilio)".
6. Send the notification.

Bulk SMS is intentionally disabled in Phase 1. For U.S. 10DLC application SMS,
complete Twilio A2P 10DLC Brand/Campaign registration and customer opt-in handling
before bulk texting.

Files changed:
admin-customers.html
worker.js
