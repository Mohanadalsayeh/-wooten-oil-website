WOOTEN OIL — PAYMENT HISTORY MOBILE TOP SPACE FIX

Fixed the large blank area at the top of the customer Payment History screen.

Root cause:
An earlier compact-spacing rule targeted #paymentHistoryPanel, but the real panel
ID is #customerPaymentHistory. The global website section padding therefore still
affected Payment History, especially on iPhone.

Fix:
- Removed inherited top/bottom section padding from #customerPaymentHistory.
- Reduced customer portal card top padding while Payment History is open.
- Reduced space below "WOOTEN OIL CUSTOMER PORTAL".
- Kept the Dashboard toolbar and Payment History heading compact.
- Preserved Payment History fields and Twilio Phase 1 changes.

File changed:
- assets/css/wooten-customer-payments.css
