CREATE TABLE normalized_behavior_events (
    id UUID PRIMARY KEY,
    behavior_log_id UUID NOT NULL REFERENCES behavior_logs(id) ON DELETE CASCADE,
    normalizer_version VARCHAR(50) NOT NULL,
    normalization_status VARCHAR(20) NOT NULL,
    domain VARCHAR(30),
    action_type VARCHAR(30),
    outcome VARCHAR(20),
    error_type VARCHAR(30),
    independence_level VARCHAR(30),
    evidence_use VARCHAR(30) NOT NULL,
    validity_status VARCHAR(40) NOT NULL,
    safety_status VARCHAR(20),
    source_event_code VARCHAR(100) NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    normalized_at TIMESTAMP WITH TIME ZONE NOT NULL,
    flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    CONSTRAINT uq_normalized_event_log_version UNIQUE (behavior_log_id, normalizer_version)
);

CREATE INDEX idx_normalized_events_domain_action
    ON normalized_behavior_events(domain, action_type);
CREATE INDEX idx_normalized_events_status_time
    ON normalized_behavior_events(normalization_status, occurred_at);

CREATE TABLE normalized_behavior_evidence (
    id UUID PRIMARY KEY,
    normalized_event_id UUID NOT NULL REFERENCES normalized_behavior_events(id) ON DELETE CASCADE,
    skill_code VARCHAR(100) NOT NULL,
    evidence_direction VARCHAR(20) NOT NULL,
    evidence_role VARCHAR(20) NOT NULL,
    CONSTRAINT uq_normalized_evidence UNIQUE (normalized_event_id, skill_code, evidence_role)
);

CREATE INDEX idx_normalized_evidence_event
    ON normalized_behavior_evidence(normalized_event_id);
CREATE INDEX idx_normalized_evidence_skill
    ON normalized_behavior_evidence(skill_code, evidence_direction);

CREATE TABLE normalized_behavior_measurements (
    id UUID PRIMARY KEY,
    normalized_event_id UUID NOT NULL REFERENCES normalized_behavior_events(id) ON DELETE CASCADE,
    metric_code VARCHAR(100) NOT NULL,
    numeric_value NUMERIC(20, 6),
    code_value VARCHAR(100),
    target_numeric_value NUMERIC(20, 6),
    unit VARCHAR(30) NOT NULL,
    value_semantics VARCHAR(20) NOT NULL,
    CONSTRAINT ck_normalized_measurement_value CHECK (
        (numeric_value IS NOT NULL AND code_value IS NULL)
        OR (numeric_value IS NULL AND code_value IS NOT NULL)
    )
);

CREATE INDEX idx_normalized_measurements_event
    ON normalized_behavior_measurements(normalized_event_id);
CREATE INDEX idx_normalized_measurements_metric
    ON normalized_behavior_measurements(metric_code);
