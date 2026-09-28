-- Migration: 008_locality_analytics.sql
-- Add locality column to shops, backfill from address, and index it.
-- Plain SQL only (pg-mem compatible: no PostGIS, no PL/pgSQL).

ALTER TABLE shops ADD COLUMN IF NOT EXISTS locality TEXT;

-- Backfill: deterministic SQL-only heuristic.
-- Rule: substring before the first comma, trimmed, lowercased
-- (e.g. '100 Main St, Hyderabad' -> '100 main st').
-- No comma: whole trimmed+lowercased address.
-- NULL / empty / whitespace-only address -> 'unknown'.
-- Uses TRIM/STRPOS/SUBSTRING only (native in Postgres; registered in the
-- pg-mem test pool in db/index.js).
UPDATE shops
SET locality = CASE
  WHEN address IS NULL OR TRIM(address) = ''
    THEN 'unknown'
  WHEN STRPOS(address, ',') > 0
    THEN LOWER(TRIM(SUBSTRING(address FROM 1 FOR STRPOS(address, ',') - 1)))
  ELSE
    LOWER(TRIM(address))
END
WHERE locality IS NULL;

CREATE INDEX IF NOT EXISTS idx_shops_locality ON shops(locality);
