DROP TABLE IF EXISTS behavior_profile_evidence_links;
DROP TABLE IF EXISTS behavior_profile_snapshots;

CREATE TABLE behavior_analysis_input_snapshots (
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    schema_version VARCHAR(50) NOT NULL,
    analysis_from TIMESTAMP WITH TIME ZONE NOT NULL,
    analysis_to TIMESTAMP WITH TIME ZONE NOT NULL,
    session_count INTEGER NOT NULL,
    event_count INTEGER NOT NULL,
    input_data JSONB NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_behavior_analysis_input_period CHECK (analysis_from <= analysis_to),
    CONSTRAINT ck_behavior_analysis_input_counts CHECK (
        session_count >= 0 AND event_count >= 0
    )
);

CREATE INDEX idx_behavior_analysis_input_member_generated
    ON behavior_analysis_input_snapshots(member_id, generated_at DESC);

CREATE TABLE behavior_analysis_input_event_links (
    id UUID PRIMARY KEY,
    snapshot_id UUID NOT NULL
        REFERENCES behavior_analysis_input_snapshots(id) ON DELETE CASCADE,
    behavior_log_id UUID NOT NULL REFERENCES behavior_logs(id) ON DELETE CASCADE,
    normalized_event_id UUID REFERENCES normalized_behavior_events(id) ON DELETE SET NULL,
    session_id UUID NOT NULL,
    event_sequence BIGINT NOT NULL,
    CONSTRAINT uq_behavior_analysis_input_event UNIQUE (snapshot_id, behavior_log_id)
);

CREATE INDEX idx_behavior_analysis_input_event_snapshot
    ON behavior_analysis_input_event_links(snapshot_id, session_id, event_sequence);

CREATE INDEX idx_behavior_analysis_input_event_log
    ON behavior_analysis_input_event_links(behavior_log_id);
