WOOTEN OIL — CUSTOMER FUEL REQUEST HISTORY

New customer portal feature:
- Adds "Fuel Request History" to the logged-in customer dashboard.
- Customers can view up to their 50 most recent fuel requests.
- Each history card shows:
  • Request number
  • Submitted date/time
  • Fuel type
  • Estimated gallons
  • Preferred delivery date
  • Delivery address
  • Notes, when present
  • Submitted badge
- Includes Refresh and Dashboard back buttons.
- Mobile responsive.

Security/privacy:
- History requires a valid logged-in customer session.
- The Worker records the customer account number from the authenticated session,
  not from a customer-editable form value.
- A customer can only retrieve requests tied to their own account number.

Database:
- The Worker automatically adds customer_account_number to fuel_requests if needed.
- No manual D1 command is required.
- Existing older requests created before this feature will not automatically appear,
  because they were not previously linked to a customer account.
- New requests submitted while the customer is signed in will appear in history.

Also fixed:
- Customer dashboard "Request Fuel" now correctly opens request-fuel.html.
- request-fuel.html explicitly sends same-origin credentials so the Worker can
  securely identify the logged-in customer.

Upload:
- index.html
- request-fuel.html
- admin-customers.html
- worker.js

No wrangler, R2, or manual D1 configuration change is required.
