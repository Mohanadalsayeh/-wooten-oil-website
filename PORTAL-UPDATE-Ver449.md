# Wooten Oil portal Ver449 — Fleet cards and transactions

Apply these changed/new files over the existing portal project, preserving paths. This update is based on the current Ver448 workspace. Keep the rest of your project and existing Cloudflare bindings/settings.

| File | Change |
| --- | --- |
| `worker.js` | Fleet routes, customer session integration and dedicated admin permission |
| `fleet/intevacon.mjs` | Fleet schema, scoped device credentials, validated staged imports and account-scoped reads |
| `index.html` | Customer dashboard Fleet Cards & Transactions action |
| `admin-customers.html` | Fleet admin page, navigation and permission checkbox |
| `assets/js/wooten-admin-access.js` | Shared fleet permission catalog |
| `assets/js/wooten-fleet.js` | Fleet tables, product details, numbered pagination, admin setup and sync status |
| `assets/css/wooten-fleet.css` | Responsive fleet views and fixed modal header/footer |

Deploy the complete project through the same Cloudflare Worker deployment process you already use. The new `fleet/` module must be included with `worker.js`; uploading only the HTML files will not install the backend. No new environment secrets, R2 buckets, bindings or Worker cron entries are required. New `fleet_*` tables/indexes are created in the existing D1 database on first use. Existing database sync configuration is not reused by the new agent.

After deployment, sign in as the main administrator and open **Fleet Cards & Transactions → Intevacon synchronization** to create the separate Windows collector credential. Assign the **Fleet Cards & Transactions** permission explicitly to any staff who need the new admin view. Existing non-owner administrators are not automatically granted that permission. Only the main administrator can issue or revoke device credentials.

Install the companion `Wooten-Oil-Intevacon-Sync-v1.zip` on the separate Windows PC and follow `START-HERE.md` there. Customers use their existing Wooten Oil login. Switching linked accounts closes and clears the fleet window before data is loaded for another account; the backend enforces the active account from the signed-in session.

## Import rules

- Full current card list; previous rolling 30 days of transactions based on Received On.
- Portal number = `000` + Intevacon Customer ID, preserving any additional leading zeros.
- No merchant export: transaction merchant/city fields provide the location.
- No monetary fields are stored by this fleet importer or returned to customers.
- Unmatched accounts/holders are visible only in admin review. An established transaction ownership change is held for investigation rather than automatically reassigned.
- Each run stages chunks and verifies totals before transactional publication. Failed collection/upload does not replace the last successful data. Transaction numbers are unique and repeated imports update existing records.
- Previously imported transaction history remains stored; the displayed window is the last successful run's 30 days.

## Validation and deployment status

Checked locally with the supplied Cards Excel export, simulated Intevacon grids and detail windows, a SQLite-backed D1 test adapter, and the actual portal pages with mocked fleet responses at 390px and 1440px widths. Automated checks cover customer isolation, forged account parameters, credential controls, financial-field exclusion, incomplete publication, duplicate imports, changed ownership, rollback, page traversal and mobile pagination.

The authenticated Intevacon site and Windows-specific installation, session encryption and scheduled tasks require the first on-PC validation. This package has not been deployed to the live portal. The collector deliberately stops if the live site's controls, paging or detail layout differ from the tested adapters. A successful local fixture test is not a claim of a completed live synchronization.

