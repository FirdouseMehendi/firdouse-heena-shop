-- Approximate visitor location (country / state / city) from Cloudflare's edge, no IP stored.
ALTER TABLE site_visits ADD COLUMN country TEXT;
ALTER TABLE site_visits ADD COLUMN region TEXT;
ALTER TABLE site_visits ADD COLUMN city TEXT;
