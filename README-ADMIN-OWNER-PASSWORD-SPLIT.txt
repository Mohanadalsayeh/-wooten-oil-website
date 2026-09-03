WOOTEN OIL — OWNER PASSWORD / MAS 90 IMPORT KEY SPLIT

Purpose
-------
ADMIN_OWNER_PASSWORD separates the Main Admin browser login from the credential
installed in the MAS 90 uploader. A stolen import credential must not grant
customer-data browsing, admin-user management, database deletion, document
access, communications access, or statement controls.

Configuration and compatibility
-------------------------------
1. Add a strong, unique ADMIN_OWNER_PASSWORD secret to the deployed Worker.
2. Keep ADMIN_IMPORT_KEY configured for the MAS 90 uploader.
3. Sign in to the admin portal with username "Admin" and
   ADMIN_OWNER_PASSWORD. Successful login returns the existing opaque, hashed,
   eight-hour owner session token; the owner password is not used as an API
   bearer token.
4. Named administrator usernames/passwords and normal permission checks are
   unchanged. Clearing either server database is now explicitly owner-only.

If ADMIN_OWNER_PASSWORD is missing or empty, owner login falls back to
ADMIN_IMPORT_KEY and legacy raw-key owner authorization remains enabled. This
keeps current deployments working while the new secret is rolled out. The
restricted split policy becomes active as soon as ADMIN_OWNER_PASSWORD is set.

Exact raw ADMIN_IMPORT_KEY public-ingress allowlist in split mode
----------------------------------------------------------------
- POST /api/admin/customers-import
- POST /api/admin/customer-payments-import

The method and pathname must both match. Every other /api/admin/* route rejects
a direct raw ADMIN_IMPORT_KEY, including:
- GET /api/admin/auth/me
- GET /api/admin/import-status
- POST /api/admin/import-control/cancel
- POST /api/admin/statements/generate
- every /api/admin/statement-scheduling* route
- POST /api/admin/clear-database
- /api/admin/users and all customer/document/communication/application routes

Why no scheduled route is allowlisted
-------------------------------------
Cloudflare scheduled Gmail and statement jobs call Worker functions in-process;
they do not make a public HTTP request with ADMIN_IMPORT_KEY. Statement batch
continuation creates a synthetic POST request for /api/admin/statements/generate
and calls the handler directly, without passing through public router
authorization. Therefore no scheduled public endpoint needs the raw import key.

Session behavior
----------------
- Opaque owner sessions retain full Main Admin access.
- Named-admin sessions retain their existing permission-scoped access.
- Database clearing requires an authenticated owner session plus typing CLEAR
  in the confirmation dialog; the MAS 90 import key is never requested there.
- With ADMIN_OWNER_PASSWORD configured, /api/admin/auth/me rejects the raw
  import key. The admin browser must hold the opaque token returned by login.
- Without ADMIN_OWNER_PASSWORD, /api/admin/auth/me continues to recognize the
  raw import key for backward compatibility.

Focused regression test
-----------------------
Run from this folder:

  node --test tests/admin-owner-password-policy.test.mjs

The test covers owner-password preference and fallback, the exact method/path
allowlist, split-mode denial, legacy behavior, auth/me, owner login exchange,
opaque owner sessions, and named-admin permissions.
