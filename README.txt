WOOTEN OIL — REQUEST FUEL LOGIN-STYLE POPUP

Upload:
- index.html
- request-fuel.html
- admin-customers.html
- worker.js

New behavior:
- Request Fuel NO LONGER opens a browser tab/window.
- Clicking any Request Fuel button opens a centered popup/modal on top of the main page,
  similar to the Customer Login popup.
- The main page remains visible behind the darkened background.
- X button, clicking the dark background, or Escape closes the Request Fuel popup.
- The Request Fuel form itself remains in request-fuel.html and is loaded inside the popup.
- request-fuel.html automatically switches into "popup mode" so the iframe shows only the form,
  without the website header/footer.
- Fuel-type cards still preselect the selected fuel.
- Opening Request Fuel closes the main menu/notification dropdown so they do not overlap it.

No Cloudflare, D1, R2, or wrangler.jsonc changes are required.
