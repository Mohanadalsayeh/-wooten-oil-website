Wooten Oil Portal Ver166

Twilio Check improvements:
- Existing Check Twilio button now makes real authenticated Twilio API requests.
- Tests Account authentication against the Twilio Accounts API.
- Tests the configured Messaging Service when one is present.
- Tests Basic Twilio Lookup using one valid-format phone number.
- Tests Line Type Intelligence separately and reports its exact Twilio error/code.
- Shows pass/fail/skipped status for each test directly in Communication Settings.
- Prevents a false "Connected" status when secrets merely exist but Twilio rejects them.
- The Line Type Intelligence connection test may perform one paid Lookup request.
