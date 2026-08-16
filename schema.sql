CREATE TABLE IF NOT EXISTS fuel_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  delivery_address TEXT NOT NULL,
  fuel_type TEXT NOT NULL,
  gallons TEXT NOT NULL,
  delivery_date TEXT,
  notes TEXT,
  submitted_from TEXT,
  received_at TEXT NOT NULL,
  email_status TEXT NOT NULL DEFAULT 'pending',
  resend_email_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_fuel_requests_received_at
ON fuel_requests(received_at DESC);
