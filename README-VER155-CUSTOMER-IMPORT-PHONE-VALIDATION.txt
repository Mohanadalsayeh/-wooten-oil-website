Wooten Oil Portal Ver155

Customer.mdb phone update protection:
- During customer import, only new or changed phone numbers are sent to Twilio Lookup.
- 7-digit numbers use the saved default U.S. area code from Twilio Phone Tools.
- Existing phone numbers are replaced only when Twilio confirms the imported number is valid and U.S.-based.
- Invalid numbers, blank numbers, non-U.S. numbers, and Lookup errors preserve the existing customer phone.
- Validated results are saved in the Twilio phone lookup cache, including line type/carrier when available.
- Import progress/final status shows updated, rejected, unchanged, and lookup-error counts.
- Customer import batches are smaller to safely handle external Twilio validation requests.
