Ver811 — Statement customer list icons

Upload only these updated files to GitHub, preserving the assets/css and assets/js folder paths. Apply after Ver810.

Create List and Rename List now offer 16 matching outline icons. The selected icon is saved with the list and shown beside its tab name. All customers always keeps the customers icon and is not editable. Existing lists use the Folder icon until changed.

The server module creates its icon metadata table automatically on the first list request. No manual SQL, office-PC script change, or changes to customer list membership are needed. The existing Worker imports this module; ensure your normal Cloudflare Worker build includes the updated server module. worker.js itself has not changed and is not included.

Verified: create, rename, reload, existing lists, unauthorized requests, invalid icons, moving customers and deleting lists; desktop, tablet and phone layouts. Nothing has been deployed.
