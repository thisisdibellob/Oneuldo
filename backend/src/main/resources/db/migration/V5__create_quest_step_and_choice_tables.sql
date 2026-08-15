-- 퀘스트를 구성하는 순차적인 단계를 저장한다.
CREATE TABLE quest_steps
(
    id UUID PRIMARY KEY,

    -- 이 단계가 속한 퀘스트
    quest_id UUID NOT NULL,

    -- 퀘스트 내부 진행 순서. 1부터 시작한다.
    step_order INTEGER NOT NULL,

    -- 사용자에게 보여줄 행동 안내
    instruction VARCHAR(300) NOT NULL,

    -- 현재 장면이나 상황에 대한 설명
    situation VARCHAR(1000) NOT NULL,

    -- 사용자가 막혔을 때 보여줄 승인된 기본 힌트
    hint VARCHAR(500),

    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    CONSTRAINT fk_quest_step_quest
        FOREIGN KEY (quest_id)
        REFERENCES quests (id)
        ON DELETE RESTRICT,

    -- 하나의 퀘스트에서 같은 단계 순서를 중복할 수 없다.
    CONSTRAINT uq_quest_step_quest_order
        UNIQUE (quest_id, step_order),

    CONSTRAINT chk_quest_step_order
        CHECK (step_order >= 1)
);

-- 각 단계에서 사용자가 고를 수 있는 선택지를 저장한다.
CREATE TABLE quest_choices
(
    id UUID PRIMARY KEY,

    -- 이 선택지가 속한 단계
    step_id UUID NOT NULL,

    -- 단계 안에서 선택지가 표시되는 순서
    choice_order INTEGER NOT NULL,

    -- 사용자 화면에 표시할 문장
    label VARCHAR(500) NOT NULL,

    -- 서버에서 정답을 판정할 때만 사용한다.
    correct BOOLEAN NOT NULL,

    -- 사용자가 선택한 후 보여줄 설명
    feedback VARCHAR(500) NOT NULL,

    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    CONSTRAINT fk_quest_choice_step
        FOREIGN KEY (step_id)
        REFERENCES quest_steps (id)
        ON DELETE RESTRICT,

    -- 한 단계에서 같은 선택지 순서를 중복할 수 없다.
    CONSTRAINT uq_quest_choice_step_order
        UNIQUE (step_id, choice_order),

    CONSTRAINT chk_quest_choice_order
        CHECK (choice_order >= 1)
);

-- 퀘스트 상세 조회 시 단계 순서대로 빠르게 조회한다.
CREATE INDEX idx_quest_steps_quest_order
    ON quest_steps (quest_id, step_order);

-- 단계별 선택지를 순서대로 빠르게 조회한다.
CREATE INDEX idx_quest_choices_step_order
    ON quest_choices (step_id, choice_order);