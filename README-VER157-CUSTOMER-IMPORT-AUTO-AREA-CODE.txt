Wooten Oil Portal Ver157

Customer.mdb phone import improvements:
- Added a checked-by-default “Fix Area Code Automatically” checkbox beside the customer import controls.
- When enabled, imported 7-digit phone numbers use the Default U.S. Area Code saved in Twilio settings before comparison/validation.
- A valid saved area code is required before importing any 7-digit phone numbers with this option enabled.
- Existing full phone numbers that already match the normalized imported number are not sent to Twilio again.
- Existing 7-digit server values are treated as needing repair when the imported 7-digit number normalizes to that same local number.
- The import shows Phone Numbers in Import, 7-Digit Numbers, Area Codes Fixed, Different vs Server, and Already Match Server.
- Twilio validation behavior from Ver155 remains in place for changed/new phone numbers.
