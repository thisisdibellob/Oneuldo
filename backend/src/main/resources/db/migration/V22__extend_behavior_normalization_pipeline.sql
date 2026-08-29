CREATE TABLE behavior_session_integrity (
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    highest_event_sequence BIGINT NOT NULL,
    received_event_count BIGINT NOT NULL,
    missing_event_count BIGINT NOT NULL,
    missing_event_sequences JSONB NOT NULL DEFAULT '[]'::jsonb,
    finalized BOOLEAN NOT NULL,
    status VARCHAR(30) NOT NULL,
    evaluated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_session_integrity_member_session UNIQUE (member_id, session_id),
    CONSTRAINT ck_session_integrity_counts CHECK (
        highest_event_sequence >= 0 AND received_event_count >= 0 AND missing_event_count >= 0
    ),
    CONSTRAINT ck_session_integrity_status CHECK (
        status IN ('OPEN', 'OPEN_WITH_GAPS', 'COMPLETE', 'GAPPED')
    )
);

CREATE INDEX idx_session_integrity_status
    ON behavior_session_integrity(status, evaluated_at);

ALTER TABLE normalized_behavior_events
    ADD COLUMN registry_version VARCHAR(50) NOT NULL DEFAULT 'behavior-event-registry-v1';

ALTER TABLE normalized_behavior_events
    ADD COLUMN measurement_rule_version VARCHAR(50) NOT NULL DEFAULT 'behavior-measurement-rules-v1';

ALTER TABLE normalized_behavior_events
    ADD COLUMN session_integrity_id UUID REFERENCES behavior_session_integrity(id) ON DELETE SET NULL;

ALTER TABLE normalized_behavior_events
    ADD COLUMN normalization_issues JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE normalized_behavior_events
    ADD CONSTRAINT ck_normalized_event_status CHECK (
        normalization_status IN ('NORMALIZED', 'QUARANTINED', 'FAILED')
    );

ALTER TABLE normalized_behavior_events
    ADD CONSTRAINT ck_normalized_event_safety CHECK (
        safety_status IS NULL OR safety_status IN ('GREEN', 'YELLOW', 'RED')
    );

ALTER TABLE normalized_behavior_evidence
    ADD CONSTRAINT ck_normalized_evidence_direction CHECK (
        evidence_direction IN ('POSITIVE', 'NEGATIVE', 'NEUTRAL')
    );

ALTER TABLE normalized_behavior_evidence
    ADD CONSTRAINT ck_normalized_evidence_role CHECK (
        evidence_role IN ('PRIMARY', 'SECONDARY', 'CONTEXT')
    );

ALTER TABLE normalized_behavior_measurements
    ADD CONSTRAINT ck_normalized_measurement_semantics CHECK (
        value_semantics IN ('DELTA', 'SNAPSHOT', 'DURATION', 'TARGET', 'OBSERVATION')
    );

CREATE TABLE behavior_normalization_attempts (
    id UUID PRIMARY KEY,
    behavior_log_id UUID NOT NULL REFERENCES behavior_logs(id) ON DELETE CASCADE,
    normalizer_version VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    attempt_count INTEGER NOT NULL,
    manual_retry_count INTEGER NOT NULL DEFAULT 0,
    last_attempted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    last_error_code VARCHAR(100),
    last_error_message VARCHAR(1000),
    completed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_normalization_attempt_log_version UNIQUE (behavior_log_id, normalizer_version),
    CONSTRAINT ck_normalization_attempt_counts CHECK (attempt_count >= 0 AND manual_retry_count >= 0),
    CONSTRAINT ck_normalization_attempt_status CHECK (
        status IN ('PROCESSING', 'COMPLETED', 'RETRY', 'DEAD_LETTER')
    )
);

CREATE INDEX idx_normalization_attempt_retry
    ON behavior_normalization_attempts(status, next_retry_at);
