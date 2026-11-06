ALTER TABLE webrtc_peers
  ADD COLUMN IF NOT EXISTS auth_token_hash TEXT;
