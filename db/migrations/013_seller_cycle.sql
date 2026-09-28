-- 013_seller_cycle.sql — Seller Cycle: cost price on products + per-day shop timings.
-- Idempotent: safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- Optional cost price per product (seller-entered). Margin is computed, never stored.
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10, 2);

-- Per-day opening hours for a shop. day_of_week: 0=Sunday .. 6=Saturday.
CREATE TABLE IF NOT EXISTS shop_timings (
    id SERIAL PRIMARY KEY,
    shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    open_time TIME,
    close_time TIME,
    is_closed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (shop_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_shop_timings_shop ON shop_timings(shop_id);
