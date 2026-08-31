Wooten Oil Portal — Ver131
Statement Run Report Improvements

Changes:
- Moved Refresh Report from the top Statement & Delivery Settings action row to the Statement Run Report heading.
- Live Run customer details now show a reason when Portal, Email, or SMS was not delivered.
- Reasons include missing email/phone, customer channel disabled, schedule channel disabled, SMS opt-out/Twilio errors, email service errors, duplicate-delivery protection, and portal notification creation failures.
- Statement generation failures are shown as the reason delivery was not attempted.
- Dry Tests remain no-delivery tests and are not treated as delivery failures.
- Older historical runs that do not contain a saved reason are labeled as having no saved reason rather than inventing one.
