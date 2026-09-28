-- Migration: 011_offer_on_orders.sql
-- Records the Dukaan Offer applied to an order and the discount granted.
-- discount is always computed server-side from the shop_offers row;
-- the client may suggest an offer_id but never the discount amount.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS offer_id INT REFERENCES shop_offers(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10, 2) NOT NULL DEFAULT 0;
