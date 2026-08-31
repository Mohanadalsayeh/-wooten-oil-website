Wooten Oil Portal Ver163

Customer.mdb phone import rule update:
- When Fix Area Code Automatically is enabled, a syntactically valid imported U.S. phone is stored as the authoritative customer phone.
- A 7-digit imported phone receives the saved default area code before storage.
- Twilio Lookup no longer blocks or rolls back that corrected phone when Lookup says invalid/non-US or a Lookup request fails.
- Twilio Lookup results still control SMS eligibility / the blue-vs-gray SMS icon.
- Imported values that cannot be normalized to a 10-digit U.S. phone remain rejected, preserving the existing server phone.
- Import reporting distinguishes stored updates, unusable formats, Twilio invalid/non-US results, and Lookup errors.
