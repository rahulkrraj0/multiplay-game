CREATE INDEX IF NOT EXISTS webrtc_signals_expiry
  ON webrtc_signals (created_at);

CREATE INDEX IF NOT EXISTS webrtc_peers_expiry
  ON webrtc_peers (last_seen);
