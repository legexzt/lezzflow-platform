-- 016_ai_call_logs.sql — AI/scan call log for the admin AI-ops panel
--
-- Every Bedrock AI scan and barcode lookup writes one row (fire-and-forget;
-- logging failures must never break a scan). Powers the admin AI cost/ops
-- panel with REAL call counts, timeout rates and latency — no estimates.

CREATE TABLE IF NOT EXISTS ai_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('ai_scan', 'barcode')),
  status TEXT NOT NULL CHECK (status IN ('ok', 'timeout', 'error')),
  latency_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_call_logs_created
  ON ai_call_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_call_logs_kind_status
  ON ai_call_logs (kind, status);
