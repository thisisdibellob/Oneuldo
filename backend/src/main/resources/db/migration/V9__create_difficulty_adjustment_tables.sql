-- 사용자마다 세부 분야의 현재 권장 난이도를 한 행으로 저장한다.
CREATE TABLE user_subcategory_difficulties
(
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL,
    subcategory_id UUID NOT NULL,
    current_difficulty VARCHAR(20) NOT NULL,
    sessions_since_evaluation INTEGER NOT NULL DEFAULT 0,
    last_evaluated_at TIMESTAMP(6) WITH TIME ZONE,
    last_changed_at TIMESTAMP(6) WITH TIME ZONE,
    rule_version VARCHAR(50) NOT NULL,

    CONSTRAINT fk_user_difficulty_member
        FOREIGN KEY (member_id) REFERENCES member (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_difficulty_subcategory
        FOREIGN KEY (subcategory_id) REFERENCES quest_subcategories (id) ON DELETE CASCADE,
    CONSTRAINT uq_user_difficulty_member_subcategory
        UNIQUE (member_id, subcategory_id),
    CONSTRAINT chk_user_difficulty_level
        CHECK (current_difficulty IN ('EASY', 'NORMAL')),
    CONSTRAINT chk_user_difficulty_session_count
        CHECK (sessions_since_evaluation >= 0)
);

-- 어떤 지표와 규칙으로 난이도를 판단했는지 재현할 수 있도록 이력을 남긴다.
CREATE TABLE difficulty_adjustment_history
(
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL,
    subcategory_id UUID NOT NULL,
    previous_difficulty VARCHAR(20) NOT NULL,
    new_difficulty VARCHAR(20) NOT NULL,
    decision VARCHAR(30) NOT NULL,
    reason_codes VARCHAR(500) NOT NULL,
    evaluated_session_count INTEGER NOT NULL,
    evaluated_step_count INTEGER NOT NULL,
    completion_rate DOUBLE PRECISION NOT NULL,
    first_attempt_accuracy DOUBLE PRECISION NOT NULL,
    hint_use_rate DOUBLE PRECISION NOT NULL,
    retry_rate DOUBLE PRECISION NOT NULL,
    distinct_quest_count INTEGER NOT NULL,
    rule_version VARCHAR(50) NOT NULL,
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    CONSTRAINT fk_difficulty_history_member
        FOREIGN KEY (member_id) REFERENCES member (id) ON DELETE CASCADE,
    CONSTRAINT fk_difficulty_history_subcategory
        FOREIGN KEY (subcategory_id) REFERENCES quest_subcategories (id) ON DELETE CASCADE,
    CONSTRAINT chk_difficulty_history_decision
        CHECK (decision IN ('PROMOTE', 'MAINTAIN', 'LOWER', 'DATA_INSUFFICIENT', 'NO_CONTENT')),
    CONSTRAINT chk_difficulty_history_previous
        CHECK (previous_difficulty IN ('EASY', 'NORMAL')),
    CONSTRAINT chk_difficulty_history_new
        CHECK (new_difficulty IN ('EASY', 'NORMAL'))
);

CREATE INDEX idx_user_difficulty_member
    ON user_subcategory_difficulties (member_id);

CREATE INDEX idx_difficulty_history_member_subcategory_created
    ON difficulty_adjustment_history (member_id, subcategory_id, created_at DESC);
