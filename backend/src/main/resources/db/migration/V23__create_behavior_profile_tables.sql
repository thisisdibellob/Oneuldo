CREATE TABLE behavior_profile_snapshots (
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    profile_version VARCHAR(50) NOT NULL,
    profile_policy_version VARCHAR(50) NOT NULL,
    normalizer_version VARCHAR(50) NOT NULL,
    registry_version VARCHAR(50) NOT NULL,
    measurement_rule_version VARCHAR(50) NOT NULL,
    evidence_from TIMESTAMP WITH TIME ZONE NOT NULL,
    evidence_to TIMESTAMP WITH TIME ZONE NOT NULL,
    input_event_count INTEGER NOT NULL,
    profile_data JSONB NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_behavior_profile_input_count CHECK (input_event_count >= 0),
    CONSTRAINT ck_behavior_profile_evidence_period CHECK (evidence_from <= evidence_to)
);

CREATE INDEX idx_behavior_profile_member_generated
    ON behavior_profile_snapshots(member_id, generated_at DESC);

CREATE TABLE behavior_profile_evidence_links (
    id UUID PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES behavior_profile_snapshots(id) ON DELETE CASCADE,
    normalized_event_id UUID NOT NULL REFERENCES normalized_behavior_events(id) ON DELETE CASCADE,
    skill_code VARCHAR(100),
    included BOOLEAN NOT NULL,
    exclusion_reason VARCHAR(100),
    CONSTRAINT ck_behavior_profile_evidence_inclusion CHECK (
        (included = TRUE AND exclusion_reason IS NULL)
        OR (included = FALSE AND exclusion_reason IS NOT NULL)
    )
);

CREATE INDEX idx_behavior_profile_evidence_profile
    ON behavior_profile_evidence_links(profile_id);

CREATE INDEX idx_behavior_profile_evidence_event
    ON behavior_profile_evidence_links(normalized_event_id);
