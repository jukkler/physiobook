CREATE INDEX IF NOT EXISTS idx_email_outbox_status_created ON email_outbox (status, created_at);
