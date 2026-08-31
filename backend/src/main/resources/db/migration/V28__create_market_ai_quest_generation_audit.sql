CREATE TABLE market_ai_quest_generations (
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    profile_snapshot_id UUID REFERENCES behavior_profile_snapshots(id) ON DELETE SET NULL,
    source VARCHAR(20) NOT NULL,
    model VARCHAR(100),
    latency_ms BIGINT NOT NULL,
    personalization_mode VARCHAR(30) NOT NULL,
    prompt_version VARCHAR(50) NOT NULL,
    attempts JSONB NOT NULL,
    validated_quest JSONB NOT NULL,
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_market_ai_generation_source
        CHECK (source IN ('AI', 'RULE_FALLBACK')),
    CONSTRAINT ck_market_ai_generation_latency
        CHECK (latency_ms >= 0)
);

CREATE INDEX idx_market_ai_generation_member_created
    ON market_ai_quest_generations(member_id, created_at DESC);

CREATE INDEX idx_market_ai_generation_profile
    ON market_ai_quest_generations(profile_snapshot_id);
