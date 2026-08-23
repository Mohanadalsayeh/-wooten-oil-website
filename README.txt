WOOTEN OIL — MY ACCOUNT FIRST-CLICK REAL FIX

ROOT CAUSE FOUND:
request-fuel.html still contained an older embedded copy of the Customer Portal.
That older portal did not contain the new Fuel Request History feature.

On some account/My Account clicks (especially the mobile customer-name button),
request-fuel.html opened its own local portal first. That is why Fuel Request
History was missing on the first click. A later click reached index.html, where
the newer portal contained Fuel Request History.

FIX:
- request-fuel.html no longer opens its own stale customer portal.
- All Customer Login / My Account actions on request-fuel.html go directly to:
  index.html#customer-login
- Added a defensive redirect for any old/cached #customer-login action.
- The local request-page portal is prevented from displaying.
- index.html always resets to the current Customer Dashboard after loading the
  signed-in customer session.
- Browser back/forward cache can no longer leave the account in an old inner view.

EXPECTED RESULT:
Request Fuel -> My Account -> Customer Dashboard appears correctly on the FIRST click,
with Fuel Request History visible immediately.

Upload:
- index.html
- request-fuel.html
- admin-customers.html
- worker.js

No Cloudflare, D1, R2, or wrangler changes are required.
