-- 017_partner_cycle3.sql — Partner Cycle-3 (2026-09-29)
--
-- 1. Cancelled-trip visibility: delivery_requests.status gains 'cancelled',
--    plus cancelled_by ('partner' = partner gave up an accepted trip,
--    'order' = the order itself was cancelled by customer/shop).
-- 2. delivery_events: append-only log of backend-verified trip events.
--    Powers the reliability score — computed from these rows only, never
--    from client claims.
-- 3. delivery_disputes: "I already travelled" disputes on cancelled trips.
--    Admin approves/rejects; an optional goodwill_amount is set by the admin
--    on approval only — never invented by the client.
-- 4. trip_status_updates: quick-tap trip chips
--    (arrived_at_shop / waiting_for_packing / contacted_customer).

-- 1. Widen delivery_requests status
-- NOTE: pg-mem (test double) cannot parse IN-lists inside ALTER TABLE ...
-- ADD CONSTRAINT, so the widened check uses OR comparisons (same semantics).
-- The original inline check is auto-named `delivery_requests_status_check` by
-- real PostgreSQL but `delivery_requests_constraint_1` by pg-mem; both drops
-- are IF EXISTS no-ops in the other environment.
ALTER TABLE delivery_requests DROP CONSTRAINT IF EXISTS delivery_requests_status_check;
ALTER TABLE delivery_requests DROP CONSTRAINT IF EXISTS delivery_requests_constraint_1;
ALTER TABLE delivery_requests ADD CONSTRAINT delivery_requests_status_check
  CHECK (status = 'requested' OR status = 'accepted' OR status = 'picked'
         OR status = 'delivered' OR status = 'cancelled');

-- NOTE: pg-mem throws "Corrupted alias" when ADD COLUMN carries an inline
-- CHECK after prior ALTERs on the same table, so the column and its check
-- are added as two separate statements.
ALTER TABLE delivery_requests
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT NULL;

ALTER TABLE delivery_requests DROP CONSTRAINT IF EXISTS delivery_requests_cancelled_by_check;
ALTER TABLE delivery_requests ADD CONSTRAINT delivery_requests_cancelled_by_check
  CHECK (cancelled_by IS NULL OR cancelled_by = 'partner' OR cancelled_by = 'order');

-- 2. Append-only trip event log
CREATE TABLE IF NOT EXISTS delivery_events (
  id SERIAL PRIMARY KEY,
  delivery_request_id INT NOT NULL REFERENCES delivery_requests(id) ON DELETE CASCADE,
  partner_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
  event TEXT NOT NULL CHECK (event IN (
    'accepted', 'picked', 'delivered', 'otp_failed',
    'cancelled', 'trip_note', 'dispute_opened', 'dispute_resolved'
  )),
  meta JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_delivery_events_request ON delivery_events(delivery_request_id);
CREATE INDEX IF NOT EXISTS idx_delivery_events_partner ON delivery_events(partner_id);
CREATE INDEX IF NOT EXISTS idx_delivery_events_created ON delivery_events(created_at DESC);

-- 3. Travel disputes (one per delivery request)
CREATE TABLE IF NOT EXISTS delivery_disputes (
  id SERIAL PRIMARY KEY,
  delivery_request_id INT NOT NULL UNIQUE REFERENCES delivery_requests(id) ON DELETE CASCADE,
  partner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'travelled_before_cancel'
    CHECK (kind IN ('travelled_before_cancel')),
  note TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'approved', 'rejected')),
  goodwill_amount NUMERIC(10, 2) NULL,
  resolved_by INT NULL REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_delivery_disputes_status ON delivery_disputes(status);
CREATE INDEX IF NOT EXISTS idx_delivery_disputes_partner ON delivery_disputes(partner_id);

-- 4. Quick-tap trip status chips
CREATE TABLE IF NOT EXISTS trip_status_updates (
  id SERIAL PRIMARY KEY,
  delivery_request_id INT NOT NULL REFERENCES delivery_requests(id) ON DELETE CASCADE,
  partner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chip TEXT NOT NULL CHECK (chip IN (
    'arrived_at_shop', 'waiting_for_packing', 'contacted_customer'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trip_status_updates_request ON trip_status_updates(delivery_request_id);
