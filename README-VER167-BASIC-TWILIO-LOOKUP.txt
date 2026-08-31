Wooten Oil Portal Ver167

Twilio lookup cost change:
- Removed all paid Line Type Intelligence requests from live worker.js.
- Check Twilio now tests account authentication, sender/Messaging Service, and basic Twilio Lookup only.
- Customer phone scans and Customer.mdb import validation now use basic Lookup only.
- Mobile/Landline/VoIP counters and line-type/carrier columns were removed from the current validation UI.
- Existing previously saved mobile classifications are preserved for unchanged phone numbers, but no new line-type classifications are purchased.
- Any Twilio-valid number can be manually Verify SMS tested. A delivered verification can mark the SMS icon blue.
- New/changed valid numbers without a saved mobile classification remain gray until SMS delivery is verified.
