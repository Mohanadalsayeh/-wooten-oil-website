Wooten Oil Portal Ver162

VoIP SMS verification:
- Twilio results now show an SMS Capability column and action column.
- Valid Fixed VoIP and Non-Fixed VoIP numbers can be tested with a one-time Verify SMS action.
- Verification sends: "Wooten Oil SMS verification test. No action is required."
- A VoIP number becomes SMS verified only after Twilio's delivery callback reports delivered.
- Pending, failed, opted-out, changed, and unverified VoIP numbers remain gray in Live Customer Data.
- Successfully delivered VoIP verification makes the SMS icon blue, just like a valid mobile number.
- Verification status is stored against the account and exact phone number; changing the customer's phone invalidates the previous verification match.
- Standard Twilio messaging charges may apply to verification texts.
