WOOTEN OIL — ADMIN LOGIN CUSTOMER PORTAL STYLE

Changed the Admin Import Key login popup to visually match the Customer Login form:
- Same clean white card look.
- Same rounded 22px popup.
- Same dark translucent/blurred page overlay.
- Same title/description hierarchy.
- Same 50px input fields and 11px radius.
- Same dark navy Sign In button.
- Same light gray security/help panel.
- Mobile styling matches the customer login layout.

Security behavior preserved:
- Username remains fixed as Admin and read-only.
- Admin Import Key must be validated by the server before access is granted.
- No show/hide-key control.

Main file changed:
- admin-customers.html

No Worker/database changes required.
