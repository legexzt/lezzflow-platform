-- Migration: 005_indexes_idempotency.sql
-- Performance indexes and idempotency_keys table

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON orders(shop_id, status);
-- NOTE: pg-mem does not support partial indexes (WHERE clause), so the plain composite index is used instead.
CREATE INDEX IF NOT EXISTS idx_users_role_online ON users(role, is_online);
CREATE INDEX IF NOT EXISTS idx_delivery_requests_status ON delivery_requests(status);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  response JSONB NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 200,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
