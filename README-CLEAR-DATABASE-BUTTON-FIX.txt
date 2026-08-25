WOOTEN OIL — CLEAR DATABASE BUTTON FIX

Problem found:
The Clear Customer Database / Clear Payment Database JavaScript was running
before the confirmation modal at the bottom of admin-customers.html existed.
Because the modal element was null, the script returned immediately and never
attached click handlers to the two buttons.

Fix:
- Clear-database controls now initialize only after the DOM is ready.
- Existing confirmation modal, Admin Import Key verification, OK/Cancel prompt,
  and server-side API verification are preserved.
- No Worker change is required.

File changed:
- admin-customers.html
