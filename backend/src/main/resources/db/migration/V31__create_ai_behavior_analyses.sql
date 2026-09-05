-- 원본 로그/기존 감사 데이터는 보존한다. 새 분석은 AI 출력만 저장한다.
CREATE TABLE ai_behavior_analyses (
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    dataset_id UUID NOT NULL REFERENCES behavior_analysis_input_snapshots(id),
    status VARCHAR(30) NOT NULL CHECK (status IN ('READY', 'NO_HISTORY', 'FAILED', 'INPUT_TOO_LARGE')),
    prompt_version VARCHAR(50) NOT NULL,
    evidence_version VARCHAR(50) NOT NULL,
    model VARCHAR(100),
    system_prompt TEXT NOT NULL,
    input_prompt TEXT NOT NULL,
    attempts JSONB NOT NULL,
    result JSONB,
    error_code VARCHAR(80),
    latency_ms BIGINT NOT NULL,
    event_count INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_ai_behavior_analysis_member_created ON ai_behavior_analyses(member_id, created_at DESC);
ALTER TABLE market_difficulty_recommendations ADD COLUMN analysis_id UUID REFERENCES ai_behavior_analyses(id);
ALTER TABLE market_ai_quest_generations ADD COLUMN analysis_id UUID REFERENCES ai_behavior_analyses(id);
ALTER TABLE market_ai_quest_generations ALTER COLUMN validated_quest DROP NOT NULL;
ALTER TABLE market_ai_quest_generations DROP CONSTRAINT ck_market_ai_generation_source;
ALTER TABLE market_ai_quest_generations ADD CONSTRAINT ck_market_ai_generation_source
    CHECK (source IN ('AI', 'RULE_FALLBACK', 'FAILED'));
-- RULE_FALLBACK은 과거 감사 이력 읽기 호환용이며 신규 생성 경로에서는 사용하지 않는다.
