-- Migration: 018_seed_support.sql
-- Support for clearly-marked TEST seed data (load/realism test, Oct 2026).
-- Adds shop photo + is_seed flags so all test rows can be removed later with one query.

ALTER TABLE shops ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_shops_is_seed ON shops(is_seed);
CREATE INDEX IF NOT EXISTS idx_products_is_seed ON products(is_seed);
