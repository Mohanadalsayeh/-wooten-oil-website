Wooten Oil Portal Ver1067 - Remote Collector Management (Windows 7 candidate)

Update the three existing portal files to their same paths. Includes D1 remote command queue and Web UI.
This ZIP contains changed files only, like earlier Ver1066 updates, not the full site.
Deploy Cloudflare Worker code BEFORE installing the remote helper.
Master Admin authorization is required for all remote actions.
Only four allowed commands are supported, with 2-minute expiry and one-time claiming.
No direct incoming network ports or arbitrary remote shell commands.
Use the separate Win7 v1.7 candidate ZIP at Midway #1. Midway #2 collector remains unchanged.

Safety: This update is a test candidate: static code tests only. Staged deploy and read-only test required before remote reboot.
