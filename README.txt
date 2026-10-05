Wooten Oil Portal - Ver809

Replace these files in the GitHub repository, preserving their paths:
  worker.js
  assets/js/wooten-statement-mailing.mjs
  portal-version.json

Approved statement mailing template:
- Original 42-point left/right margins.
- Plain customer address without the background panel.
- BILL TO and the address align with Account Summary.
- Customer address and statement metadata raised 1/8 inch.
- Company name fits the approved narrower width beside the WO logo.
- Thin gray folding indicators; upper pair moved to the approved position.
- No blue demonstration box or red demonstration mark.

Applies to all newly created account statements: previews, generation,
cycle/list runs, tests, and copies delivered through portal/email/SMS.
The company header appears on the first Account Summary page, first
Payments page, and first Fleet Cards & Transactions page.
Existing stored PDFs keep their previous layout until regenerated.

Verified statement pagination, multi-customer combined PDFs, balances,
payments, quantities, fuel summary, transaction sale totals, and the
existing notification attachment-history fix.

Upload the files and let the existing GitHub/Cloudflare deployment finish.
No office computer script or database update is required.
