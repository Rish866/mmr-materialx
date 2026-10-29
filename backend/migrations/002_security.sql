-- ============================================================
-- MMR MaterialX — Phase 3 security hardening
-- Rate limiting + OTP brute-force protection, backed by Postgres so limits
-- are shared across multiple backend replicas (no in-memory state).
-- Idempotent: safe to run more than once.
-- ============================================================

-- ---------- RATE EVENTS ----------
-- Append-only log of rate-limited actions. We count rows per (bucket, key)
-- inside a sliding time window to enforce limits. `bucket` namespaces the
-- limit (e.g. 'otp_send_ip', 'otp_send_phone', 'otp_verify_phone').
CREATE TABLE IF NOT EXISTS rate_events (
    id          BIGSERIAL PRIMARY KEY,
    bucket      TEXT NOT NULL,
    key         TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_events_lookup
    ON rate_events (bucket, key, created_at);

-- ---------- OTP brute-force hardening ----------
-- Count verify attempts against a specific OTP so a single code can't be
-- brute-forced. Once attempts exceed the cap the row is treated as consumed.
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
