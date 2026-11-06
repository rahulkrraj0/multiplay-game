CREATE INDEX IF NOT EXISTS webrtc_signals_room_rate
  ON webrtc_signals (room, created_at);

CREATE INDEX IF NOT EXISTS webrtc_signals_peer_rate
  ON webrtc_signals (room, from_peer, created_at);
