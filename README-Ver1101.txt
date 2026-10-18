Wooten Oil Portal Ver1101 — CHANGED FILES ONLY
================================================
BASE VERSION: Ver1100

CONTENTS
- admin-customers.html
- assets/js/wooten-fuel-monitor.js

CHANGES
- Verifone Connection dialog footer on iPhones/phones: buttons stack full width,
  remain neatly spaced, and no longer clip or wrap awkwardly.
- On desktop/tablet, Close and Save Connection remain side-by-side with even sizing.
- Save Connection button label shortened; the secure-backend requirement is shown
  separately, and saving remains disabled/unimplemented as before.
- iOS safe-area padding and modal scroll area retained.
- New fuel-monitor script query version v=1101 to prevent stale browser caching.
- No changes to TLS-350 readings, collector pairing, remote commands, MAS 90,
  invoices, Intevacon, payments, user accounts, APIs, or database schema.

DEPLOYMENT
Apply both files to the Cloudflare Pages site, preserving the relative paths.
Replace admin-customers.html in the site root and assets/js/wooten-fuel-monitor.js
in the assets/js folder. Do not upload the README to the site.
No Worker, Cloudflare D1 migration, collector PC, or GitHub deployment performed.

VALIDATION
Review Verifone Connection on a phone-width viewport and on Windows.
The preview Save Connection remains intentionally disabled; do not enter credentials.
