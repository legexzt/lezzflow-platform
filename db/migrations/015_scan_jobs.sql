-- 015_scan_jobs.sql — async AI/barcode scan job queue (scaling cycle-3)
--
-- Scan work (Bedrock image analysis, barcode lookups) moves off the request
-- path into a PostgreSQL-backed queue so API workers never block on slow
-- model calls. Workers claim jobs with SELECT ... FOR UPDATE SKIP LOCKED.
-- AI image scans store an S3 object reference in payload — never image bytes.

CREATE TABLE IF NOT EXISTS scan_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ai', 'barcode')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'done', 'failed', 'parked')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scan_jobs_status_created
  ON scan_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS idx_scan_jobs_user
  ON scan_jobs (user_id);
