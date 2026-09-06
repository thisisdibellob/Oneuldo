CREATE TABLE ai_user_profiles (
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    profile_version BIGINT NOT NULL CHECK (profile_version > 0),
    previous_profile_id UUID REFERENCES ai_user_profiles(id) ON DELETE SET NULL,
    source_analysis_id UUID NOT NULL REFERENCES ai_behavior_analyses(id),
    source_dataset_id UUID NOT NULL REFERENCES behavior_analysis_input_snapshots(id),
    source_session_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('READY', 'FAILED')),
    prompt_version VARCHAR(50) NOT NULL,
    model VARCHAR(100),
    system_prompt TEXT NOT NULL,
    input_prompt TEXT NOT NULL,
    attempts JSONB NOT NULL,
    profile JSONB,
    error_code VARCHAR(80),
    latency_ms BIGINT NOT NULL CHECK (latency_ms >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_ai_user_profile_member_ready
    ON ai_user_profiles(member_id, status, created_at DESC);

CREATE INDEX idx_ai_user_profile_source_analysis
    ON ai_user_profiles(member_id, source_analysis_id, status, created_at DESC);

ALTER TABLE market_difficulty_recommendations
    ADD COLUMN profile_id UUID REFERENCES ai_user_profiles(id);

ALTER TABLE market_difficulty_recommendations
    ADD COLUMN profile_version BIGINT NOT NULL DEFAULT 0;

ALTER TABLE market_difficulty_recommendations
    ALTER COLUMN profile_version DROP DEFAULT;

ALTER TABLE market_ai_quest_generations
    ADD COLUMN profile_id UUID REFERENCES ai_user_profiles(id);
