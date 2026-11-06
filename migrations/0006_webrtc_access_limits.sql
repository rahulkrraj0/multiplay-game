CREATE TABLE IF NOT EXISTS api_rate_limits (
  scope TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count > 0),
  PRIMARY KEY (scope, ip_hash, window_start)
);

CREATE INDEX IF NOT EXISTS api_rate_limits_expiry
  ON api_rate_limits (window_start);
