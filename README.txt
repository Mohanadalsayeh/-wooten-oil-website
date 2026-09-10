WOOTEN OIL — GLOBAL PAYMENTS HOSTED PAYMENT THEME

For the Global Payments account manager / HPP configuration team
Please test and activate these custom HPP templates on the Wooten Oil merchant's
correct hosted-payment account. Do not create or change merchant credentials.

sandbox/ contains desktop.html, mobile.html and matching local resource folders.
Use that set for the current sandbox account. It includes a yellow test-mode
notice that tells customers not to enter real card details.

production/ contains the same design without the sandbox notice. Activate that
set only on the separately provisioned production HPP account.

Install the contents of the chosen environment folder as a unit. The required
<hpp:body /> tag remains in each template. Stylesheets and PNG logos are local
relative resources. No JavaScript, remote asset dependencies or card form
implementation is included. Individual files are below the documented 262 KB
limit. Processor fields, validations, 3DS content and trust marks must remain
functional/visible. Test CSS against the actual markup for this account.

Design values
Font stack: Inter, Segoe UI, Arial, sans-serif
No custom font file is bundled because the published HPP template file list
does not include font files. The installed system fallback will be used when
Inter is unavailable. Please confirm whether a matching font can be approved.
Heading: 26 px / weight 800 / navy #0f2742
Body: 16 px / weight 400 / dark text #182331
Labels: 15 px / weight 700 / #4e5c6d
Fields: minimum 52 px / 16 px text / weight 500 / 11 px corners
Field border: #d6dde5; focus #294866 with a subtle navy ring
Primary button: #bd1e2d / white 16 px text / weight 600 / 11 px corners
Notices: #fff8e7 background / #ecd99d border / #6b5318 text / 12 px corners
Background: deep navy; centered white card with mobile layout rules

The separate preview HTML uses representative, nonfunctional fields. It is a
design reference, not the provider's rendered HPP or proof of template activation.
Final field labels/layout/trust marks depend on the provider's HPP version.

Reference
https://developer.globalpayments.com/docs/payments/online/hosted-payment-page-customization
