-- 생활, 직업과 같은 상위 퀘스트 카테고리를 저장
CREATE TABLE quest_categories
(
    -- 상위 카테고리의 고유 식별자
    id UUID PRIMARY KEY,

    -- 코드에서 사용하는 카테고리 이름
    -- 예: LIFE, JOB
    code VARCHAR(50) NOT NULL UNIQUE,

    -- 앱 화면에 표시할 카테고리 이름
    name VARCHAR(50) NOT NULL,

    -- 앱 화면에 표시할 순서
    sort_order INTEGER NOT NULL,

    -- 현재 사용자에게 보여줄 카테고리인지 나타냄
    active BOOLEAN NOT NULL,

    -- 데이터가 처음 생성된 시각
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    -- 데이터가 마지막으로 수정된 시각
    updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    -- 표시 순서는 음수가 될 수 없음
    CONSTRAINT chk_quest_category_sort_order
        CHECK (sort_order >= 0)
);

-- 대중교통, 생활 훈련, 경제생활, 안전과 같은
-- 세부 카테고리를 저장
CREATE TABLE quest_subcategories
(
    -- 세부 카테고리의 고유 식별자
    id UUID PRIMARY KEY,

    -- 어떤 상위 카테고리에 속하는지 나타냄
    category_id UUID NOT NULL,

    -- 프론트와 백엔드에서 공통으로 사용할 코드
    -- 예: PUBLIC_TRANSPORT, DAILY_LIFE
    code VARCHAR(50) NOT NULL,

    -- 앱 화면에 표시할 이름
    name VARCHAR(50) NOT NULL,

    -- 해당 카테고리에서 제공할 최소 난이도
    min_difficulty VARCHAR(20) NOT NULL,

    -- 해당 카테고리에서 제공할 최대 난이도
    max_difficulty VARCHAR(20) NOT NULL,

    -- 상위 카테고리 내부에서 표시할 순서
    sort_order INTEGER NOT NULL,

    -- 현재 사용자에게 보여줄 카테고리인지 나타냄
    active BOOLEAN NOT NULL,

    -- 데이터가 처음 생성된 시각
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    -- 데이터가 마지막으로 수정된 시각
    updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    -- 상위 카테고리와 연결
    CONSTRAINT fk_quest_subcategory_category
        FOREIGN KEY (category_id)
        REFERENCES quest_categories (id)
        ON DELETE RESTRICT,

    -- 같은 상위 카테고리 안에서 코드가 중복되는 것을 막음
    CONSTRAINT uq_quest_subcategory_category_code
        UNIQUE (category_id, code),

    -- 표시 순서는 음수가 될 수 없음
    CONSTRAINT chk_quest_subcategory_sort_order
        CHECK (sort_order >= 0),

    -- 정의된 난이도만 저장할 수 있음
    CONSTRAINT chk_quest_subcategory_min_difficulty
        CHECK (
            min_difficulty IN (
                'VERY_EASY',
                'EASY',
                'NORMAL',
                'HARD',
                'VERY_HARD'
            )
        ),

    CONSTRAINT chk_quest_subcategory_max_difficulty
        CHECK (
            max_difficulty IN (
                'VERY_EASY',
                'EASY',
                'NORMAL',
                'HARD',
                'VERY_HARD'
            )
        )
);

-- 앱에서 사용자가 수행할 퀘스트 정보를 저장
CREATE TABLE quests
(
    -- 퀘스트의 고유 식별자
    id UUID PRIMARY KEY,

    -- 퀘스트가 속한 세부 카테고리
    subcategory_id UUID NOT NULL,

    -- 코드에서 사용하는 퀘스트 식별용 이름
    -- 예: TAKE_BUS_ALONE
    code VARCHAR(100) NOT NULL UNIQUE,

    -- 앱 퀘스트 카드에 표시할 제목
    title VARCHAR(100) NOT NULL,

    -- 앱 퀘스트 카드에 표시할 짧은 설명
    summary VARCHAR(500) NOT NULL,

    -- 사용자가 이 퀘스트를 통해 학습할 목표
    goal VARCHAR(500) NOT NULL,

    -- 퀘스트 난이도
    difficulty VARCHAR(20) NOT NULL,

    -- 퀘스트 완료 시 지급할 경험치
    reward_points INTEGER NOT NULL,

    -- 현재 사용자에게 보여줄 퀘스트인지 나타냄
    active BOOLEAN NOT NULL,

    -- 데이터가 처음 생성된 시각
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    -- 데이터가 마지막으로 수정된 시각
    updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    -- 세부 카테고리와 퀘스트를 연결
    CONSTRAINT fk_quest_subcategory
        FOREIGN KEY (subcategory_id)
        REFERENCES quest_subcategories (id)
        ON DELETE RESTRICT,

    -- 경험치는 음수가 될 수 없음
    CONSTRAINT chk_quest_reward_points
        CHECK (reward_points >= 0),

    -- 정의된 난이도만 저장할 수 있음
    CONSTRAINT chk_quest_difficulty
        CHECK (
            difficulty IN (
                'VERY_EASY',
                'EASY',
                'NORMAL',
                'HARD',
                'VERY_HARD'
            )
        )
);

-- 세부 카테고리와 난이도로 활성 퀘스트를 조회할 때 사용함.
CREATE INDEX idx_quests_subcategory_difficulty_active
    ON quests (subcategory_id, difficulty, active);