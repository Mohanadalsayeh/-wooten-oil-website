WOOTEN OIL — MY ACCOUNT FIRST-CLICK FIX

Problem:
When a customer was on request-fuel.html and selected My Account, the browser
returned to index.html#customer-login. The portal overlay opened because of the
URL hash, but the customer account data was not automatically loaded on that
cross-page navigation. The customer had to select My Account a second time.

Fix:
- When index.html loads with #customer-login, it now immediately checks the
  existing customer session.
- If the customer is signed in, the Customer Dashboard appears on the FIRST visit.
- Fuel Request History is available immediately.
- If the session is not valid, the normal login form appears.
- The same check also runs on hash changes and browser pageshow/back-forward events.
- request-fuel.html My Account links continue to return to index.html#customer-login.

Upload:
- index.html
- request-fuel.html
- admin-customers.html
- worker.js

No Cloudflare, D1, R2, or wrangler configuration changes are required.
