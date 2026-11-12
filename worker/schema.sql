-- 每个 sessionId（每台设备）每关只记一次。
CREATE TABLE IF NOT EXISTS clears (
  session_id TEXT NOT NULL,
  stage INTEGER NOT NULL,
  province TEXT NOT NULL,
  ms INTEGER NOT NULL,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, stage)
);
CREATE INDEX IF NOT EXISTS clears_stage_province ON clears (stage, province);
CREATE INDEX IF NOT EXISTS clears_stage_day ON clears (stage, day);
-- 按 IP 哈希的每分钟计数，只保留最近几分钟。
CREATE TABLE IF NOT EXISTS rate (
  k TEXT NOT NULL,
  minute INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (k, minute)
);
