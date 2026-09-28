-- 010_partner_cycle2.sql — Partner Cycle-2 (2026-09-28)
-- SOS alerts from partners + partner referral tracking.

CREATE TABLE IF NOT EXISTS sos_alerts (
    id SERIAL PRIMARY KEY,
    partner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delivery_request_id INT NULL REFERENCES delivery_requests(id) ON DELETE SET NULL,
    lat DOUBLE PRECISION NULL,
    lng DOUBLE PRECISION NULL,
    note TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'acknowledged', 'resolved')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sos_alerts_partner_id ON sos_alerts(partner_id);
CREATE INDEX IF NOT EXISTS idx_sos_alerts_status ON sos_alerts(status);

CREATE TABLE IF NOT EXISTS partner_referrals (
    id SERIAL PRIMARY KEY,
    referrer_partner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_partner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bonus_amount NUMERIC(10,2) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'qualified', 'paid')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (referred_partner_id),
    CHECK (referrer_partner_id <> referred_partner_id)
);
CREATE INDEX IF NOT EXISTS idx_partner_referrals_referrer ON partner_referrals(referrer_partner_id);
