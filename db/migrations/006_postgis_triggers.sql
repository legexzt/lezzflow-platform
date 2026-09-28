-- SKIP-PGMEM
-- Migration: 006_postgis_triggers.sql
-- PostGIS geography column + triggers (skipped by pg-mem test runner)

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE shops ADD COLUMN IF NOT EXISTS geog geography(Point, 4326);

-- Backfill existing rows
UPDATE shops
  SET geog = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  WHERE geog IS NULL AND lat IS NOT NULL AND lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shops_geog ON shops USING GIST (geog);

-- -------------------------------------------------------
-- Trigger: sync_shop_geog — keeps geog in sync with lat/lng
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_shop_geog()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geog := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  ELSE
    NEW.geog := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_shop_geog ON shops;
CREATE TRIGGER trg_sync_shop_geog
  BEFORE INSERT OR UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION sync_shop_geog();

-- -------------------------------------------------------
-- Trigger: set_updated_at — auto-stamp updated_at on writes
-- Tables with updated_at: users, shops, products, orders,
--   delivery_requests, partner_kyc
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_updated_at_users ON users;
CREATE TRIGGER trg_updated_at_users
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_shops ON shops;
CREATE TRIGGER trg_updated_at_shops
  BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_products ON products;
CREATE TRIGGER trg_updated_at_products
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_orders ON orders;
CREATE TRIGGER trg_updated_at_orders
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_delivery_requests ON delivery_requests;
CREATE TRIGGER trg_updated_at_delivery_requests
  BEFORE UPDATE ON delivery_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_partner_kyc ON partner_kyc;
CREATE TRIGGER trg_updated_at_partner_kyc
  BEFORE UPDATE ON partner_kyc
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
