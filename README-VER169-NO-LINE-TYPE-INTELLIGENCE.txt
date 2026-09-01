Wooten Oil Portal Ver169

Twilio Lookup cost safeguard:
- Active worker.js uses only Twilio Lookup v2 PhoneNumbers/{number} with NO Fields=line_type_intelligence parameter.
- Paid Line Type Intelligence requests are not made anywhere in the live portal code.
- Check Twilio performs only account/sender authentication and basic Lookup.
- Customer phone scans and MDB import validation use basic Lookup only.
- Removed legacy backup files that still contained the retired paid Line Type Intelligence implementation, preventing accidental future reuse/deployment.
