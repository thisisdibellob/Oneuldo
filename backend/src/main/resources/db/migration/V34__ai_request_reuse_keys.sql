ALTER TABLE ai_behavior_analyses ADD COLUMN request_key VARCHAR(64);
CREATE INDEX idx_ai_analysis_reuse ON ai_behavior_analyses(member_id,dataset_id,request_key,status,created_at);
ALTER TABLE market_ai_quest_generations ADD COLUMN request_key VARCHAR(64);
CREATE INDEX idx_ai_quest_reuse ON market_ai_quest_generations(member_id,request_key,source,created_at);
