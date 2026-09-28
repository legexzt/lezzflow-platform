-- Migration: 009_commission_config.sql
-- Commission config table — canonical key-value store for app configuration.
-- commission_bps: commission stored in basis points (0 = 0%, 100 = 1%, 10000 = 100%); beta seeds 0.

CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed default commission at 0 bps (0%) for beta launch
INSERT INTO app_config (key, value)
  VALUES ('commission_bps', '0')
  ON CONFLICT (key) DO NOTHING;
