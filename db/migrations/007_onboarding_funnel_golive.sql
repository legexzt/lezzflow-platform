-- Migration: 007_onboarding_funnel_golive.sql
CREATE TABLE IF NOT EXISTS onboarding_funnel_events (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    step TEXT NOT NULL CHECK (step IN ('profile','products','test_order','go_live')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_funnel_user_step ON onboarding_funnel_events (user_id, step);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT false;

-- Seller wizard profile fields: saveShopProfile sends open_time / close_time / category.
-- Persist them instead of silently dropping.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS open_time TIME;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS close_time TIME;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS category VARCHAR(100);
-- Backfill: existing shops that already have products must stay visible in mart after the go-live gate lands
UPDATE shops SET is_live = true WHERE id IN (SELECT DISTINCT shop_id FROM products);
