CREATE TABLE member_quest_profiles
(
    member_id UUID PRIMARY KEY,
    preferred_difficulty VARCHAR(20) NOT NULL,
    support_level VARCHAR(20) NOT NULL,
    preferred_session_minutes INTEGER NOT NULL,
    daily_quest_limit INTEGER NOT NULL,
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    CONSTRAINT fk_member_quest_profile_member
        FOREIGN KEY (member_id) REFERENCES member (id) ON DELETE CASCADE,
    CONSTRAINT chk_member_quest_profile_difficulty
        CHECK (preferred_difficulty IN ('VERY_EASY', 'EASY', 'NORMAL', 'HARD', 'VERY_HARD')),
    CONSTRAINT chk_member_quest_profile_support_level
        CHECK (support_level IN ('INDEPENDENT', 'GUIDED', 'STEP_BY_STEP')),
    CONSTRAINT chk_member_quest_profile_session_minutes
        CHECK (preferred_session_minutes > 0),
    CONSTRAINT chk_member_quest_profile_daily_limit
        CHECK (daily_quest_limit > 0)
);

CREATE TABLE member_preferred_quest_subcategories
(
    member_id UUID NOT NULL,
    subcategory_code VARCHAR(50) NOT NULL,

    PRIMARY KEY (member_id, subcategory_code),
    CONSTRAINT fk_member_preferred_subcategory_profile
        FOREIGN KEY (member_id) REFERENCES member_quest_profiles (member_id) ON DELETE CASCADE
);

CREATE TABLE places
(
    id UUID PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    active BOOLEAN NOT NULL,
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL
);

CREATE TABLE simulations
(
    id UUID PRIMARY KEY,
    quest_id UUID NOT NULL,
    place_id UUID NOT NULL,
    title VARCHAR(100) NOT NULL,
    description VARCHAR(1000) NOT NULL,
    active BOOLEAN NOT NULL,
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    CONSTRAINT fk_simulation_quest
        FOREIGN KEY (quest_id) REFERENCES quests (id) ON DELETE RESTRICT,
    CONSTRAINT fk_simulation_place
        FOREIGN KEY (place_id) REFERENCES places (id) ON DELETE RESTRICT
);

CREATE INDEX idx_simulations_quest_active ON simulations (quest_id, active);

INSERT INTO member_quest_profiles (
    member_id,
    preferred_difficulty,
    support_level,
    preferred_session_minutes,
    daily_quest_limit,
    created_at,
    updated_at
)
SELECT
    id,
    'EASY',
    'GUIDED',
    15,
    3,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM member;

INSERT INTO places (id, code, name, active, created_at, updated_at) VALUES
('40000000-0000-0000-0000-000000000001', 'BUS_STOP', '버스 정류장', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('40000000-0000-0000-0000-000000000002', 'CAFE', '카페', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('40000000-0000-0000-0000-000000000003', 'MARKET', '마트', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('40000000-0000-0000-0000-000000000004', 'PUBLIC_SPACE', '공공장소', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO simulations (
    id, quest_id, place_id, title, description, active, created_at, updated_at
) VALUES
(
    '50000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '목적지 버스 찾기',
    '정류장에서 목적지로 가는 버스를 확인하고 탑승한다.',
    TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
    '50000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000002',
    '카페에서 주문하기',
    '메뉴를 선택하고 직원에게 원하는 음료를 주문한다.',
    TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
    '50000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000003',
    '40000000-0000-0000-0000-000000000003',
    '예산에 맞춰 장보기',
    '필요한 물건을 고르고 예산을 확인한 뒤 계산한다.',
    TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
    '50000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000004',
    '40000000-0000-0000-0000-000000000004',
    '안전하게 도움 요청하기',
    '곤란한 상황에서 믿을 수 있는 사람을 찾아 도움을 요청한다.',
    TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
