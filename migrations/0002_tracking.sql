-- Site visits (who visited, which page, where from)
CREATE TABLE site_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  referrer TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_site_visits_created_at ON site_visits (created_at);

-- Cart activity (who added what to their cart)
CREATE TABLE cart_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  product_title TEXT NOT NULL,
  size INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_cart_events_created_at ON cart_events (created_at);

-- Completed orders (who paid, for what, how much)
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  razorpay_order_id TEXT NOT NULL,
  razorpay_payment_id TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  items_json TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_orders_created_at ON orders (created_at);
