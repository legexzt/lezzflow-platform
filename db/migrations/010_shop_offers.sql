-- Migration: 010_shop_offers.sql
-- Dukaan Offers — seller-funded promotional offers shown in the Mart app.
-- Offers are created by the shop's seller (admin can also manage); customers
-- only ever see active offers whose validity window includes now. There is no
-- platform points currency — discounts come only from rows in this table.

CREATE TABLE IF NOT EXISTS shop_offers (
  id            SERIAL PRIMARY KEY,
  shop_id       INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('flat', 'percent')),
  discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value >= 0),
  min_order     NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (min_order >= 0),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from    TIMESTAMPTZ,
  valid_to      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shop_offers_shop_id ON shop_offers(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_offers_active_window
  ON shop_offers(shop_id, active, valid_from, valid_to);
