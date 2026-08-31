Wooten Oil Portal Ver165

Twilio phone validation summary fixes:
- Added clickable Lookup Error and Not Checked counters.
- Current customer phone must match the cached lookup phone before a result is counted.
- Old/stale lookup results no longer make the summary misleading.
- Check Customer Phone Numbers starts a fresh classification scan from the current customer database.
- The visible status counters now reconcile to the total number of customers with phone numbers: Valid + Invalid + Lookup Error + Not Checked = Phones.
- Mobile, Landline, and VoIP/Other count only successfully validated numbers.
- Result lists remain searchable and display 50 records per page.
