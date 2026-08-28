-- 프론트에서 수집한 사용자별 원본 행동 이벤트를 수정 없이 저장한다.
CREATE TABLE behavior_logs
(
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL,
    client_event_id UUID NOT NULL,
    session_id UUID NOT NULL,
    event_sequence BIGINT NOT NULL,
    event_schema_version VARCHAR(50) NOT NULL,
    app_version VARCHAR(50) NOT NULL,
    content_version VARCHAR(50) NOT NULL,
    batch_id UUID,
    offline_queued BOOLEAN,
    device_performance_class VARCHAR(20),
    occurred_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    received_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    game_id VARCHAR(100) NOT NULL,
    task_id UUID NOT NULL,
    task_version VARCHAR(50) NOT NULL,
    difficulty INTEGER,
    scenario_variant VARCHAR(100),
    evidence_context VARCHAR(30) NOT NULL,

    event_code VARCHAR(100) NOT NULL,
    micro_action_id VARCHAR(100) NOT NULL,
    step_id UUID,
    step_outcome VARCHAR(20),
    step_order INTEGER,
    start_latency_ms BIGINT,
    first_action VARCHAR(100),

    quest_instance_id UUID,
    content_source VARCHAR(30),
    simulation_started BOOLEAN,
    payload_type VARCHAR(30),

    accessibility_context JSONB NOT NULL,
    presentation_context JSONB,
    task_result_context JSONB,
    error_context JSONB,
    support_context JSONB,
    safety_context JSONB,
    validity_context JSONB,
    session_end_context JSONB,
    user_experience_context JSONB,
    payload JSONB,

    CONSTRAINT fk_behavior_log_member
        FOREIGN KEY (member_id) REFERENCES member (id) ON DELETE CASCADE,
    CONSTRAINT uq_behavior_log_member_client_event
        UNIQUE (member_id, client_event_id),
    CONSTRAINT uq_behavior_log_member_session_sequence
        UNIQUE (member_id, session_id, event_sequence),
    CONSTRAINT chk_behavior_log_event_sequence
        CHECK (event_sequence >= 1),
    CONSTRAINT chk_behavior_log_difficulty
        CHECK (difficulty IS NULL OR difficulty >= 0),
    CONSTRAINT chk_behavior_log_step_order
        CHECK (step_order IS NULL OR step_order >= 0),
    CONSTRAINT chk_behavior_log_start_latency
        CHECK (start_latency_ms IS NULL OR start_latency_ms >= 0),
    CONSTRAINT chk_behavior_log_evidence_context
        CHECK (evidence_context IN ('ASSESSMENT_TASK', 'TRAINING_TASK', 'PASSIVE_PLAY', 'ACCESSIBILITY')),
    CONSTRAINT chk_behavior_log_step_outcome
        CHECK (step_outcome IS NULL OR step_outcome IN ('SUCCESS', 'FAILURE', 'INCOMPLETE', 'INVALID')),
    CONSTRAINT chk_behavior_log_content_source
        CHECK (content_source IS NULL OR content_source IN ('STATIC', 'GENERATED', 'REVIEWED_VARIANT', 'FALLBACK')),
    CONSTRAINT chk_behavior_log_device_performance
        CHECK (device_performance_class IS NULL OR device_performance_class IN ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN')),
    CONSTRAINT chk_behavior_log_payload_type
        CHECK (payload_type IS NULL OR payload_type IN (
            'PASSIVE_PLAY', 'SHOPPING', 'COOKING', 'HYGIENE_CLOTHING',
            'HOUSEHOLD', 'KIOSK_ATM', 'SAFETY', 'WORK'
        ))
);

CREATE INDEX idx_behavior_logs_member_occurred
    ON behavior_logs (member_id, occurred_at);

CREATE INDEX idx_behavior_logs_session_sequence
    ON behavior_logs (session_id, event_sequence);

CREATE INDEX idx_behavior_logs_event_occurred
    ON behavior_logs (event_code, occurred_at);

CREATE INDEX idx_behavior_logs_member_task_occurred
    ON behavior_logs (member_id, task_id, occurred_at);
