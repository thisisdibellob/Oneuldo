-- Preserve historical results. New choice observations carry no server correctness label.
ALTER TABLE quest_events ALTER COLUMN correct DROP NOT NULL;
ALTER TABLE quest_sessions DROP CONSTRAINT chk_quest_session_status;
ALTER TABLE quest_sessions ADD CONSTRAINT chk_quest_session_status
  CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'SUBMITTED'));
ALTER TABLE behavior_logs DROP CONSTRAINT chk_behavior_log_payload_type;
ALTER TABLE behavior_logs ADD CONSTRAINT chk_behavior_log_payload_type CHECK
(payload_type IS NULL OR payload_type IN ('PASSIVE_PLAY','SHOPPING','COOKING','HYGIENE_CLOTHING','HOUSEHOLD','KIOSK_ATM','SAFETY','WORK','TRANSPORT'));

