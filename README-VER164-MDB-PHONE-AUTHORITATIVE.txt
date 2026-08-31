Wooten Oil Portal Ver164

Customer.mdb phone import rule:
- The imported MDB phone value always replaces the server phone value.
- Fix Area Code Automatically ON: exactly 7-digit imported values receive the saved default U.S. area code before storage.
- Fix Area Code Automatically OFF: imported phone values are stored as imported, including 7-digit values.
- Blank MDB phone values clear the existing server phone.
- Twilio Lookup no longer blocks any phone update; it only determines SMS validation/status.
- Existing VoIP SMS verification is cleared when a customer phone changes.
