Ver137

Critical fix for duplicate statement deliveries:
- Removed an accidental duplicate copy of the Statement Scheduling JavaScript.
- The duplicate script caused one click on Test/Run buttons to attach two handlers and start two separate statement runs.
- Added a one-time initialization guard so the scheduler cannot attach duplicate handlers even if its script is accidentally included twice in a future build.
- Existing server-side per-run delivery guards remain in place.

Effect:
- One click on Run A / Run B / Test A / Test B / Test All starts only one job.
- A selected customer should receive at most one SMS and one email from a single live run.
