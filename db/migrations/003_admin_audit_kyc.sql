CREATE TABLE IF NOT EXISTS admin_audit_log (
  id SERIAL PRIMARY KEY,
  actor_firebase_uid TEXT NOT NULL,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON admin_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at DESC);
ALTER TABLE partner_kyc ADD COLUMN IF NOT EXISTS reject_reason_code VARCHAR(50);
ALTER TABLE partner_kyc ADD COLUMN IF NOT EXISTS reject_note TEXT;
ALTER TABLE partner_kyc ADD COLUMN IF NOT EXISTS reupload_requested BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE partner_kyc ADD COLUMN IF NOT EXISTS reupload_requested_at TIMESTAMPTZ;
