export const SCHEMA_MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
`

export const SCHEMA_V1_DDL = `
CREATE TABLE cameras (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  epr TEXT,
  status TEXT NOT NULL DEFAULT 'disabled',
  recording_status TEXT NOT NULL DEFAULT 'idle',
  supports_ptz INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_cameras_active ON cameras (active);

CREATE TABLE camera_endpoints (
  camera_id TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  url TEXT NOT NULL,
  PRIMARY KEY (camera_id, service)
);

CREATE TABLE camera_profiles (
  id TEXT PRIMARY KEY,
  camera_id TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  name TEXT,
  stream_type TEXT NOT NULL,
  codec TEXT,
  width INTEGER,
  height INTEGER,
  fps REAL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_camera_profiles_camera ON camera_profiles (camera_id);

CREATE TABLE camera_capabilities (
  camera_id TEXT PRIMARY KEY REFERENCES cameras(id) ON DELETE CASCADE,
  onvif INTEGER NOT NULL DEFAULT 0,
  rtsp INTEGER NOT NULL DEFAULT 0,
  snapshot INTEGER NOT NULL DEFAULT 0,
  ptz INTEGER NOT NULL DEFAULT 0,
  h264 INTEGER NOT NULL DEFAULT 0,
  h265 INTEGER NOT NULL DEFAULT 0,
  mjpeg INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE camera_credentials (
  camera_id TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  tag TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (camera_id, service)
);

CREATE TABLE recordings (
  id TEXT PRIMARY KEY,
  camera_id TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'starting',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_recordings_camera ON recordings (camera_id);

CREATE TABLE recording_segments (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'starting'
);

CREATE INDEX idx_recording_segments_recording ON recording_segments (recording_id);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  camera_id TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE INDEX idx_snapshots_camera ON snapshots (camera_id, captured_at);

CREATE TABLE preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE diagnostics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id TEXT REFERENCES cameras(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  fingerprint TEXT NOT NULL
);

CREATE INDEX idx_diagnostics_fingerprint ON diagnostics (fingerprint);
`
