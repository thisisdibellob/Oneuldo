CREATE TABLE market_difficulty_recommendations (
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    profile_snapshot_id UUID REFERENCES behavior_profile_snapshots(id) ON DELETE SET NULL,
    policy_version VARCHAR(50) NOT NULL,
    recommended_difficulty INTEGER NOT NULL,
    personalization_mode VARCHAR(30) NOT NULL,
    item_count INTEGER NOT NULL,
    quantity_complexity VARCHAR(20) NOT NULL,
    budget_pressure VARCHAR(20) NOT NULL,
    text_support VARCHAR(20) NOT NULL,
    reason_codes JSONB NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_market_recommendation_difficulty
        CHECK (recommended_difficulty BETWEEN 1 AND 3),
    CONSTRAINT ck_market_recommendation_item_count
        CHECK (item_count BETWEEN 2 AND 4)
);

CREATE INDEX idx_market_recommendation_member_generated
    ON market_difficulty_recommendations(member_id, generated_at DESC);

CREATE UNIQUE INDEX uq_market_recommendation_member_profile
    ON market_difficulty_recommendations(member_id, profile_snapshot_id);
