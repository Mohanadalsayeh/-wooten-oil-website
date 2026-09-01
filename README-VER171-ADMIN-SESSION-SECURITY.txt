Version 171 - Admin session security

- Admin login has no Remember/Save Password option.
- Admin credentials are kept only in sessionStorage, not persistent localStorage.
- Closing the browser/tab ends the browser-side admin session.
- Admin sessions automatically expire at the end of the current Central Time day.
- Admin-user server sessions now also expire at the next America/Chicago midnight instead of a fixed 12-hour duration.
- Admin login form/fields disable autocomplete/password saving as a browser best-effort; browsers/password managers may still control their own save prompts.
