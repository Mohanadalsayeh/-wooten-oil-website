Ver132

Added a warning marker in the Statement Run Report for live Run A / Run B rows where both Email and SMS were not delivered.

Behavior:
- Shows a small yellow warning chip under the customer name.
- Includes a short reason summary, such as:
  - No email on file + No phone on file
  - SMS opted out + Email service not configured
  - Statement generation failed
- Dry tests (Test A / Test B / Test All Cycles) do not show this warning because no delivery is attempted.

Files changed:
- admin-customers.html
