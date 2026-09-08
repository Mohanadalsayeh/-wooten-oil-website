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


-- =========================================================
-- WOOTEN OIL CUSTOMER DATABASE
-- =========================================================

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  ar_division_no TEXT,

  account_number TEXT NOT NULL UNIQUE,
  account_name TEXT NOT NULL,

  credit_hold TEXT,

  current_balance REAL NOT NULL DEFAULT 0,

  aging_category_1 REAL NOT NULL DEFAULT 0,
  aging_category_2 REAL NOT NULL DEFAULT 0,
  aging_category_3 REAL NOT NULL DEFAULT 0,
  aging_category_4 REAL NOT NULL DEFAULT 0,

  salesperson_name TEXT,

  credit_limit REAL NOT NULL DEFAULT 0,

  terms_description TEXT,

  email TEXT,

  phone TEXT,
  phone_ext TEXT,
  fax TEXT,

  address1 TEXT,
  address2 TEXT,
  address3 TEXT,

  city TEXT,
  state TEXT,
  zip_code TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX IF NOT EXISTS idx_customers_account_number
ON customers(account_number);


CREATE INDEX IF NOT EXISTS idx_customers_account_name
ON customers(account_name);


CREATE INDEX IF NOT EXISTS idx_customers_phone
ON customers(phone);


CREATE INDEX IF NOT EXISTS idx_customers_email
ON customers(email);


-- =========================================================
-- EMBEDDED GLOBAL PAYMENTS TRANSACTIONS
-- Card numbers and payment tokens are never stored here.
-- =========================================================

CREATE TABLE IF NOT EXISTS online_payment_transactions (
  id TEXT PRIMARY KEY,
  customer_id INTEGER,
  account_number TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_type TEXT NOT NULL DEFAULT 'partial',
  status TEXT NOT NULL DEFAULT 'initiated',
  provider_transaction_id TEXT NOT NULL DEFAULT '',
  provider_reference TEXT NOT NULL DEFAULT '',
  provider_status TEXT NOT NULL DEFAULT '',
  card_brand TEXT NOT NULL DEFAULT '',
  card_last4 TEXT NOT NULL DEFAULT '',
  result_code TEXT NOT NULL DEFAULT '',
  result_message TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_online_payments_account_created
ON online_payment_transactions(account_number, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_online_payments_status_created
ON online_payment_transactions(status, created_at DESC);
